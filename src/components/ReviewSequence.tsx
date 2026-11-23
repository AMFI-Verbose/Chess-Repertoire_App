"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";

import { Engine, scoreToCp, type EngineResult } from "@/lib/engine";
import {
  LABEL_STYLES,
  classifyMove,
  clampEval,
  materialFor,
  moveAccuracy,
  winPercent,
  type MoveLabel,
} from "@/lib/classify";
import { saveGameAnalysis } from "@/app/actions";
import { START_FEN, turnOf, turnAtPly } from "@/lib/chess";
import { hintStyles } from "@/lib/boardHints";
import {
  DARK_SQUARE,
  LIGHT_SQUARE,
  squareTint,
  squaresOf,
} from "@/lib/boardTheme";
import { play, type SoundName } from "@/lib/sound";
import PromotionPicker, { type PromotionPiece } from "@/components/PromotionPicker";

export type ReviewMove = { san: string; uci: string; fen: string; ply: number };

/** A node in a local analysis tree. The original game is never overwritten. */
type AnalysisNode = {
  id: string;
  parentId: string;
  san: string;
  uci: string;
  fen: string;
  /** Absolute ply in the original game, used for move numbers. */
  ply: number;
};

type MistakeMoment = {
  index: number;
  move: ReviewMove;
  label: MoveLabel;
  mover: "w" | "b";
  before: number | null;
  after: number | null;
  loss: number;
};

/** Bump when grading rules change: old stored reviews then re-run. */
const ANALYSIS_VERSION = 4;

/** Sum of knights, bishops, rooks and queens still on the board. */
function nonPawnMaterial(fen: string): number {
  try {
    const pieces = new Chess(fen).board();
    const values: Record<string, number> = { n: 3, b: 3, r: 5, q: 9, k: 0, p: 0 };
    return pieces.reduce(
      (total, row) =>
        total +
        row.reduce(
          (sum, piece) => sum + (piece ? values[piece.type] ?? 0 : 0),
          0,
        ),
      0,
    );
  } catch {
    return 99;
  }
}

const SOUND_FOR_LABEL: Record<MoveLabel, SoundName | null> = {
  brilliant: "brilliant",
  great: "great",
  best: "best",
  excellent: "best",
  good: null,
  book: null,
  inaccuracy: "inaccuracy",
  mistake: "mistake",
  blunder: "blunder",
};

/** Only the loud verdicts get a floating banner. */
const FLASHES: MoveLabel[] = ["brilliant", "great", "inaccuracy", "mistake", "blunder"];

export type PhaseScore = { accuracy: number; moves: number };

export type ReviewSummary = {
  accuracyWhite: number;
  accuracyBlack: number;
  /** Accuracy split into the three stages every review site reports. */
  phases: {
    opening: PhaseScore;
    middlegame: PhaseScore;
    endgame: PhaseScore;
  };
  acplWhite: number;
  acplBlack: number;
  /** How many moves per colour actually had an eval (book moves do not). */
  ratedWhite: number;
  ratedBlack: number;
  labels: Record<string, number>;
};

export default function ReviewSequence({
  moves,
  orientation,
  title,
  subtitle,
  backHref = "/",
  backLabel = "All repertoires",
  tabs = null,
  bookPlies = [],
  gameId,
  extra = null,
  startFen = START_FEN,
  initialPly = 0,
  storedAnalysis = null,
}: {
  moves: ReviewMove[];
  orientation: "white" | "black";
  title: string;
  subtitle?: string;
  backHref?: string;
  backLabel?: string;
  tabs?: ReactNode;
  bookPlies?: number[];
  /** When reviewing a saved game, the verdict is written back to it. */
  gameId?: string;
  /** Extra cards for the sidebar (PGN export, result badge, …). */
  extra?: ReactNode;
  /** Position the game began in — a game can start from a custom FEN. */
  startFen?: string;
  /** Deep link: ?ply=6 opens the review already on the sixth move. */
  initialPly?: number;
  /** The JSON written back after a previous pass — reloads instantly. */
  storedAnalysis?: string | null;
}) {
  const [grades, setGrades] = useState<(MoveLabel | null)[]>([]);
  const [summary, setSummary] = useState<ReviewSummary | null>(null);
  const [progress, setProgress] = useState(0);
  const [analysing, setAnalysing] = useState(true);
  const [at, setAt] = useState(Math.max(0, Math.min(initialPly, moves.length))); // plies shown
  const [autoPlay, setAutoPlay] = useState(false);
  const [flash, setFlash] = useState<{ label: MoveLabel; id: number } | null>(null);
  /** Eval after every position, white's point of view (mates are ±9990). */
  const [evals, setEvals] = useState<number[]>([]);
  /** The engine's own choice for each move — what "better" should have been. */
  const [bestUci, setBestUci] = useState<(string | null)[]>([]);

  // ---- free analysis ------------------------------------------------------
  // Analysis is deliberately client-side and local: exploring a finished game
  // must never rewrite the PGN, and a reload should still show the real game.
  const [mode, setMode] = useState<"review" | "analyse">("review");
  const [analysisRootPly, setAnalysisRootPly] = useState(0);
  const [analysisNodes, setAnalysisNodes] = useState<Record<string, AnalysisNode>>({});
  const [currentNodeId, setCurrentNodeId] = useState("root");
  const [analysisSelected, setAnalysisSelected] = useState<string | null>(null);
  const [promotion, setPromotion] = useState<{ from: string; to: string } | null>(null);
  const [engineEnabled, setEngineEnabled] = useState(true);
  const [engineResult, setEngineResult] = useState<EngineResult | null>(null);
  const [engineThinking, setEngineThinking] = useState(false);
  const [mistakeSide, setMistakeSide] = useState<"both" | "w" | "b">("both");
  const analysisSequence = useRef(0);
  const analysisEngineRef = useRef<Engine | null>(null);
  const analysisSearchId = useRef(0);

  const engineRef = useRef<Engine | null>(null);

  // Position 0 is the start; position i+1 is after move i.
  const positions = useMemo(
    () => [startFen, ...moves.map((m) => m.fen)],
    [moves, startFen],
  );

  const currentNode =
    currentNodeId === "root" ? null : (analysisNodes[currentNodeId] ?? null);
  const analysisFen =
    mode === "analyse"
      ? currentNode?.fen ?? positions[analysisRootPly] ?? startFen
      : positions[at] || positions[0] || startFen;

  /** Root → current node. This is the line the analysis board is showing. */
  const analysisLine = useMemo(() => {
    const line: AnalysisNode[] = [];
    let id = currentNodeId;
    const seen = new Set<string>();
    while (id !== "root" && !seen.has(id)) {
      seen.add(id);
      const node = analysisNodes[id];
      if (!node) break;
      line.unshift(node);
      id = node.parentId;
    }
    return line;
  }, [analysisNodes, currentNodeId]);

  const analysisChildren = useMemo(
    () =>
      Object.values(analysisNodes).filter((node) => node.parentId === currentNodeId),
    [analysisNodes, currentNodeId],
  );

  /** Every stored move that is not already on the current line. */
  const analysisBranches = useMemo(() => {
    const onPath = new Set(analysisLine.map((node) => node.id));
    return Object.values(analysisNodes).filter((node) => !onPath.has(node.id));
  }, [analysisNodes, analysisLine]);

  // ---- analysis ----------------------------------------------------------
  // A review that was already computed is restored verbatim: same grades,
  // same graph, no engine warm-up. Chess.com does the same thing server-side;
  // here the JSON lives in the game row.
  const hydrated = useRef(false);
  useEffect(() => {
    if (!storedAnalysis) return;
    try {
      const parsed = JSON.parse(storedAnalysis) as {
        version?: number;
        plies?: number;
        grades?: (MoveLabel | null)[];
        bestUci?: (string | null)[];
        evals?: number[];
        summary?: ReviewSummary;
      };
      if (parsed.version !== ANALYSIS_VERSION) return;
      if ((parsed.plies ?? -1) !== moves.length) return;
      if (!parsed.grades || !parsed.evals || !parsed.summary) return;
      hydrated.current = true;
      setGrades(parsed.grades);
      setBestUci(parsed.bestUci ?? []);
      setEvals(parsed.evals);
      setSummary(parsed.summary);
      setProgress(positions.length);
      setAnalysing(false);
    } catch {
      // A corrupt blob simply means we analyse the game again.
    }
  }, [storedAnalysis, moves.length, positions.length]);

  useEffect(() => {
    if (hydrated.current) return;
    if (moves.length === 0) {
      setAnalysing(false);
      return;
    }

    // Two workers split the positions between them: the same 600 ms search,
    // half the wall-clock time. This is the depth the review grades from.
    const engines = [new Engine(), new Engine()];
    engineRef.current = engines[0];
    let cancelled = false;

    (async () => {
      const results: EngineResult[] = new Array(positions.length);
      let done = 0;

      const work = async (which: 0 | 1) => {
        for (let index = which; index < positions.length; index += 2) {
          if (cancelled) return;
          results[index] = await engines[which].search(positions[index], {
            movetime: 600,
            multiPv: 2,
            skill: 20,
          });
          done += 1;
          if (!cancelled) setProgress(done);
        }
      };

      await Promise.all([work(0), work(1)]);
      if (cancelled) return;

      // White's point of view after every position, powering the eval graph.
      const startTurn = turnOf(startFen);
      const evalsWhite: number[] = [];
      for (let index = 0; index < positions.length; index += 1) {
        const cp = scoreToCp(results[index]?.lines[0], true);
        const stm =
          index % 2 === 0 ? startTurn : startTurn === "w" ? "b" : "w";
        const white = cp === null ? null : stm === "w" ? cp : -cp;
        evalsWhite.push(white ?? evalsWhite[index - 1] ?? 0);
      }

      const graded: MoveLabel[] = [];
      const bestUcis: (string | null)[] = [];
      const counts: Record<string, number> = {};
      const losses: { w: number[]; b: number[] } = { w: [], b: [] };
      const accuracies: { w: number[]; b: number[] } = { w: [], b: [] };
      const phaseScores: Record<"opening" | "middlegame" | "endgame", number[]> = {
        opening: [],
        middlegame: [],
        endgame: [],
      };

      // "Opening" lasts as long as the game followed the ECO table, never less
      // than four full moves; "endgame" starts when the heavy pieces are gone.
      const lastBook = bookPlies.length ? Math.max(...bookPlies) : 0;
      const openingEnd = Math.max(8, lastBook);

      for (let index = 0; index < moves.length; index += 1) {
        const move = moves[index];
        const before = results[index];
        const after = results[index + 1];

        const best = scoreToCp(before?.lines[0], true);
        const second = scoreToCp(before?.lines[1], true);
        // After the move it is the opponent's turn, so flip the sign.
        const afterCp = scoreToCp(after?.lines[0], true);
        const played = afterCp === null ? null : -afterCp;

        const bestUci = before?.lines[0]?.pv[0] ?? null;
        const isBestMove = bestUci === move.uci;
        const isBook = bookPlies.includes(move.ply);

        const mover = turnAtPly(startFen, index);
        const beforeFen = positions[index];
        const shedMaterial =
          materialFor(move.fen, mover) <= materialFor(beforeFen, mover) - 2;

        // A move that ends the game in mate has no position after it to
        // evaluate, so the engine scores come back empty and naive grading
        // would call a mating move merely "Good". Mate is the best move.
        let isMate = false;
        try {
          isMate = new Chess(move.fen).isCheckmate();
        } catch {
          isMate = false;
        }

        if (isMate) {
          // Mate has no "position after" to evaluate: record it as a win.
          evalsWhite[index + 1] = mover === "w" ? 9990 : -9990;
        }

        const label = isMate
          ? shedMaterial
            ? "brilliant"
            : "best"
          : classifyMove({
              best,
              second,
              played,
              isBestMove,
              isBook,
              isSacrifice: shedMaterial,
            });

        graded.push(label);
        bestUcis.push(bestUci);
        counts[label] = (counts[label] ?? 0) + 1;

        const phase: "opening" | "middlegame" | "endgame" =
          move.ply <= openingEnd
            ? "opening"
            : nonPawnMaterial(move.fen) <= 14
              ? "endgame"
              : "middlegame";

        // Accuracy needs both ends of the move; book moves have no evaluative
        // score, so they are excluded rather than counted as perfect.
        if (label !== "book" && best !== null && played !== null) {
          // ACPL: centipawns given up, with mate scores clamped and a single
          // move capped at five pawns so one tactic cannot swamp the average.
          const capped = Math.min(
            500,
            Math.max(0, clampEval(best) - clampEval(played)),
          );
          losses[mover].push(capped);
          const moveScore = moveAccuracy(winPercent(best), winPercent(played));
          accuracies[mover].push(moveScore);
          phaseScores[phase].push(moveScore);
        }
      }

      const phaseOf = (values: number[]) => ({
        accuracy: mean(values),
        moves: values.length,
      });

      const verdict: ReviewSummary = {
        accuracyWhite: mean(accuracies.w),
        accuracyBlack: mean(accuracies.b),
        acplWhite: Math.round(mean(losses.w)),
        acplBlack: Math.round(mean(losses.b)),
        ratedWhite: losses.w.length,
        ratedBlack: losses.b.length,
        labels: counts,
        phases: {
          opening: phaseOf(phaseScores.opening),
          middlegame: phaseOf(phaseScores.middlegame),
          endgame: phaseOf(phaseScores.endgame),
        },
      };

      if (cancelled) return;
      setGrades(graded);
      setBestUci(bestUcis);
      setEvals(evalsWhite);
      setSummary(verdict);
      setAnalysing(false);

      if (gameId) {
        // Fire-and-forget: the board is already usable, and a failed write must
        // not interrupt studying the game.
        saveGameAnalysis({
          gameId,
          analysis: JSON.stringify({
            version: ANALYSIS_VERSION,
            plies: moves.length,
            grades: graded,
            bestUci: bestUcis,
            evals: evalsWhite,
            summary: verdict,
          }),
        }).catch(() => undefined);
      }
    })();

    return () => {
      cancelled = true;
      engines.forEach((engine) => engine.terminate());
      engineRef.current = null;
    };
  }, [moves, positions, startFen, bookPlies, gameId, storedAnalysis]);

  // ---- live engine for free analysis -------------------------------------
  // Debounced: moving through a variation quickly should not queue ten 500 ms
  // searches. A stale answer is discarded by the request id.
  useEffect(() => {
    if (mode !== "analyse" || !engineEnabled) {
      analysisSearchId.current += 1;
      analysisEngineRef.current?.terminate();
      analysisEngineRef.current = null;
      setEngineResult(null);
      setEngineThinking(false);
      return;
    }

    const engine = analysisEngineRef.current ?? new Engine();
    analysisEngineRef.current = engine;
    const requestId = ++analysisSearchId.current;
    let disposed = false;

    const timer = setTimeout(() => {
      setEngineThinking(true);
      setEngineResult(null);
      engine
        .search(analysisFen, { movetime: 500, multiPv: 3, skill: 20 })
        .then((result) => {
          if (disposed || requestId !== analysisSearchId.current) return;
          setEngineResult(result);
          setEngineThinking(false);
        })
        .catch(() => {
          if (disposed || requestId !== analysisSearchId.current) return;
          setEngineThinking(false);
        });
    }, 220);

    return () => {
      disposed = true;
      clearTimeout(timer);
      analysisSearchId.current += 1;
    };
  }, [analysisFen, engineEnabled, mode]);

  useEffect(
    () => () => {
      analysisSearchId.current += 1;
      analysisEngineRef.current?.terminate();
      analysisEngineRef.current = null;
    },
    [],
  );

  // ---- analysis tree controls --------------------------------------------
  const leaveAnalysis = useCallback(() => {
    setMode("review");
    setAnalysisSelected(null);
    setPromotion(null);
  }, []);

  const openAnalysis = useCallback(() => {
    if (analysisRootPly !== at) {
      setAnalysisRootPly(at);
      setAnalysisNodes({});
      setCurrentNodeId("root");
    }
    setAutoPlay(false);
    setAnalysisSelected(null);
    setPromotion(null);
    setMode("analyse");
  }, [analysisRootPly, at]);

  const analysisUndo = useCallback(() => {
    if (currentNodeId === "root") return;
    setCurrentNodeId(analysisNodes[currentNodeId]?.parentId ?? "root");
    setAnalysisSelected(null);
    setPromotion(null);
  }, [analysisNodes, currentNodeId]);

  const analysisRedo = useCallback(() => {
    const next = analysisChildren[0];
    if (!next) return;
    setCurrentNodeId(next.id);
    setAnalysisSelected(null);
    setPromotion(null);
  }, [analysisChildren]);

  function needsAnalysisPromotion(from: string, to: string): boolean {
    const board = new Chess(analysisFen);
    const piece = board.get(from as never);
    if (!piece || piece.type !== "p") return false;
    return to[1] === "8" || to[1] === "1";
  }

  function commitAnalysisMove(
    from: string,
    to: string,
    promote?: PromotionPiece,
  ): boolean {
    const board = new Chess(analysisFen);
    let move;
    try {
      move = board.move({
        from,
        to,
        promotion: promote ?? undefined,
      });
    } catch {
      play("error");
      return false;
    }

    const uci = `${move.from}${move.to}${move.promotion ?? ""}`;
    const existing = analysisChildren.find((node) => node.uci === uci);
    if (existing) {
      setCurrentNodeId(existing.id);
      setAnalysisSelected(null);
      return true;
    }

    const id = `a${++analysisSequence.current}`;
    const node: AnalysisNode = {
      id,
      parentId: currentNodeId,
      san: move.san,
      uci,
      fen: board.fen(),
      ply: (currentNode?.ply ?? analysisRootPly) + 1,
    };
    setAnalysisNodes((prev) => ({ ...prev, [id]: node }));
    setCurrentNodeId(id);
    setAnalysisSelected(null);
    play(move.captured ? "capture" : "move");
    return true;
  }

  function attemptAnalysisMove(from: string, to: string): boolean {
    if (needsAnalysisPromotion(from, to)) {
      setPromotion({ from, to });
      return true;
    }
    return commitAnalysisMove(from, to);
  }

  function onAnalysisDrop({
    sourceSquare,
    targetSquare,
  }: {
    sourceSquare: string;
    targetSquare: string | null;
  }) {
    setAnalysisSelected(null);
    if (!targetSquare) return false;
    return attemptAnalysisMove(sourceSquare, targetSquare);
  }

  function onAnalysisSquareClick({ square }: { square: string }) {
    if (mode !== "analyse") return;

    if (analysisSelected === square) {
      setAnalysisSelected(null);
      return;
    }

    if (analysisSelected) {
      const moved = attemptAnalysisMove(analysisSelected, square);
      setAnalysisSelected(null);
      if (moved) return;
    }

    const board = new Chess(analysisFen);
    const piece = board.get(square as never);
    if (piece && piece.color === board.turn()) {
      setAnalysisSelected(square);
      play("navigate");
    } else {
      setAnalysisSelected(null);
    }
  }

  // ---- effects when you land on a move ------------------------------------
  const goTo = useCallback(
    (next: number) => {
      setMode("review");
      const clamped = Math.max(0, Math.min(moves.length, next));
      setAt(clamped);
      if (clamped === 0) return;

      const label = grades[clamped - 1];
      if (!label) return;

      const sound = SOUND_FOR_LABEL[label];
      if (sound) play(sound);
      if (FLASHES.includes(label)) {
        setFlash({ label, id: Date.now() });
      }
    },
    [grades, moves.length],
  );

  // Auto-clear the banner so it doesn't stack up.
  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(null), 1500);
    return () => clearTimeout(timer);
  }, [flash]);

  // ---- transport ---------------------------------------------------------
  useEffect(() => {
    if (!autoPlay) return;
    if (at >= moves.length) {
      setAutoPlay(false);
      return;
    }
    const timer = setTimeout(() => goTo(at + 1), 1100);
    return () => clearTimeout(timer);
  }, [autoPlay, at, moves.length, goTo]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        if (mode === "analyse") analysisUndo();
        else goTo(at - 1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        if (mode === "analyse") analysisRedo();
        else goTo(at + 1);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [at, goTo, mode, analysisUndo, analysisRedo]);

  // ---- board decoration ---------------------------------------------------
  const currentLabel = at > 0 ? grades[at - 1] : null;
  const style = currentLabel ? LABEL_STYLES[currentLabel] : null;

  const lastMove = at > 0 ? moves[at - 1] : null;
  const badgeSquare = lastMove ? lastMove.uci.slice(2, 4) : null;
  const bestForMove = at > 0 ? bestUci[at - 1] : null;
  const showBest =
    Boolean(lastMove && bestForMove && bestForMove !== lastMove.uci) &&
    ["inaccuracy", "mistake", "blunder"].includes(currentLabel ?? "");

  const squareStyles: Record<string, Record<string, string>> = {};
  if (at > 0 && style) {
    for (const square of squaresOf(moves[at - 1].uci)) {
      squareStyles[square] = {
        backgroundImage: squareTint(style.color, 0.5),
        boxShadow: `inset 0 0 0 3px ${style.color}`,
      };
    }
  }

  const analysisSquareStyles = hintStyles(analysisFen, {
    selected: analysisSelected,
    lastMove: currentNode?.uci ?? null,
  });
  const boardSquareStyles =
    mode === "analyse" ? analysisSquareStyles : squareStyles;

  const analysisTurn = turnOf(analysisFen);
  const topEngineCp = scoreToCp(engineResult?.lines[0], true);
  const engineWhiteCp =
    topEngineCp === null ? null : analysisTurn === "w" ? topEngineCp : -topEngineCp;
  const engineBest = engineEnabled ? engineResult?.bestmove ?? null : null;

  const mistakeMoments = useMemo<MistakeMoment[]>(() => {
    if (analysing || evals.length === 0) return [];
    const found: MistakeMoment[] = [];
    for (let index = 0; index < moves.length; index += 1) {
      const label = grades[index];
      if (
        !label ||
        !["inaccuracy", "mistake", "blunder"].includes(label)
      ) {
        continue;
      }
      const mover = turnAtPly(startFen, index);
      const before = evals[index] ?? null;
      const after = evals[index + 1] ?? null;
      const loss =
        before === null || after === null
          ? 0
          : Math.max(0, mover === "w" ? before - after : after - before);
      found.push({
        index,
        move: moves[index],
        label,
        mover,
        before,
        after,
        loss,
      });
    }
    return found;
  }, [analysing, evals, grades, moves, startFen]);

  const visibleMistakes =
    mistakeSide === "both"
      ? mistakeMoments
      : mistakeMoments.filter((mom) => mom.mover === mistakeSide);
  const whiteMistakes = mistakeMoments.filter((mom) => mom.mover === "w").length;
  const blackMistakes = mistakeMoments.filter((mom) => mom.mover === "b").length;

  const rows = groupMoves(moves, startFen);
  const counts = tally(grades);

  const analysisLastSan = currentNode?.san ?? null;

  return (
    <main className="mx-auto w-full max-w-6xl 2xl:max-w-[1440px] px-6 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link
            href={backHref}
            className="text-xs text-[var(--muted)] transition-colors hover:text-[var(--text)]"
          >
            ← {backLabel}
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-[var(--muted)]">
            {subtitle ?? "Review · every move graded by Stockfish"}
          </p>
        </div>
        {tabs}
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="flex flex-col items-center gap-3">
          <div className="flex w-full max-w-[600px] flex-wrap items-center justify-between gap-2">
            <div className="inline-flex overflow-hidden rounded-lg border border-[var(--line)]">
              <button
                aria-pressed={mode === "review"}
                onClick={leaveAnalysis}
                className={`px-3 py-1.5 text-xs font-medium ${
                  mode === "review"
                    ? "bg-[var(--accent)] text-white"
                    : "text-[var(--muted)] hover:bg-[var(--panel-2)] hover:text-[var(--text)]"
                }`}
              >
                Review
              </button>
              <button
                aria-pressed={mode === "analyse"}
                onClick={openAnalysis}
                className={`px-3 py-1.5 text-xs font-medium ${
                  mode === "analyse"
                    ? "bg-[var(--accent)] text-white"
                    : "text-[var(--muted)] hover:bg-[var(--panel-2)] hover:text-[var(--text)]"
                }`}
              >
                Analyse
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--muted)]">
              {mode === "analyse" && (
                <span className="rounded-full border border-[var(--line)] px-2 py-1">
                  from move {analysisRootPly}
                </span>
              )}
              <button
                aria-pressed={engineEnabled}
                onClick={() => setEngineEnabled((on) => !on)}
                className={`rounded-full border px-2.5 py-1 transition ${
                  engineEnabled
                    ? "border-[var(--accent)]/40 bg-[var(--accent)]/10 text-[var(--accent)]"
                    : "border-[var(--line)] text-[var(--muted)] hover:text-[var(--text)]"
                }`}
              >
                Engine {engineEnabled ? "on" : "off"}
              </button>
            </div>
          </div>

          <div className="relative w-full max-w-[600px]">
            <div className="overflow-hidden rounded-xl border border-[var(--line)] shadow-[0_10px_40px_-20px_rgba(0,0,0,0.9)]">
              <Chessboard
                options={{
                  id: "review-board",
                  position: analysisFen,
                  boardOrientation: orientation,
                  squareStyles: boardSquareStyles,
                  animationDurationInMs: 200,
                  lightSquareStyle: LIGHT_SQUARE,
                  darkSquareStyle: DARK_SQUARE,
                  onPieceDrop: mode === "analyse" ? onAnalysisDrop : undefined,
                  onSquareClick: mode === "analyse" ? onAnalysisSquareClick : undefined,
                }}
              />
            </div>

            {mode === "analyse" && promotion && (
              <PromotionPicker
                side={analysisTurn === "w" ? "white" : "black"}
                compact
                onPick={(piece) => {
                  const target = promotion;
                  setPromotion(null);
                  if (target) commitAnalysisMove(target.from, target.to, piece);
                }}
                onCancel={() => setPromotion(null)}
              />
            )}

            {mode === "review" && at > 0 && style && style.glyph && badgeSquare && (
              <div
                className="pointer-events-none absolute z-10"
                style={{
                  left: `${squareXY(badgeSquare, orientation).x + 12.5}%`,
                  top: `${squareXY(badgeSquare, orientation).y}%`,
                  transform: "translate(-100%, 0)",
                  paddingTop: 2,
                  paddingRight: 2,
                }}
              >
                <span
                  className="rounded-[4px] px-1 text-[11px] font-bold leading-[15px] shadow"
                  style={{ background: style.color, color: style.text }}
                >
                  {style.glyph}
                </span>
              </div>
            )}

            {mode === "review" && showBest && bestForMove && (
              <BestArrow
                from={bestForMove.slice(0, 2)}
                to={bestForMove.slice(2, 4)}
                orientation={orientation}
              />
            )}

            {mode === "analyse" && engineBest && engineBest.length >= 4 && (
              <BestArrow
                from={engineBest.slice(0, 2)}
                to={engineBest.slice(2, 4)}
                orientation={orientation}
              />
            )}

            {flash && mode === "review" && (
              <div
                key={flash.id}
                className="animate-pop pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-lg px-4 py-2 text-sm font-semibold shadow-lg"
                style={{
                  background: LABEL_STYLES[flash.label].color,
                  color: LABEL_STYLES[flash.label].text,
                }}
              >
                {LABEL_STYLES[flash.label].label} {LABEL_STYLES[flash.label].glyph}
              </div>
            )}
          </div>

          {mode === "analyse" ? (
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                onClick={analysisUndo}
                disabled={currentNodeId === "root"}
                className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs disabled:opacity-40"
              >
                ← Undo
              </button>
              <button
                onClick={analysisRedo}
                disabled={analysisChildren.length === 0}
                className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs disabled:opacity-40"
              >
                Redo →
              </button>
              <button
                onClick={() => {
                  setCurrentNodeId("root");
                  setAnalysisSelected(null);
                  setPromotion(null);
                }}
                disabled={currentNodeId === "root"}
                className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs disabled:opacity-40"
              >
                Start
              </button>
              <span className="ml-1 font-mono text-xs text-[var(--muted)]">
                {analysisLine.length} / {Object.keys(analysisNodes).length}
              </span>
              <span className="ml-1 rounded border border-[var(--line)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--text)]">
                {engineThinking ? "searching…" : formatEval(engineWhiteCp)}
              </span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                onClick={() => goTo(at - 1)}
                disabled={at === 0}
                className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs disabled:opacity-40"
              >
                ← Prev
              </button>
              <button
                onClick={() => {
                  setAutoPlay(!autoPlay);
                  if (at >= moves.length) goTo(0);
                }}
                disabled={analysing || moves.length === 0}
                className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-[#0b1602] disabled:opacity-40"
              >
                {autoPlay ? "Pause" : "Replay"}
              </button>
              <button
                onClick={() => goTo(at + 1)}
                disabled={at >= moves.length}
                className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs disabled:opacity-40"
              >
                Next →
              </button>
              <span className="ml-2 font-mono text-xs text-[var(--muted)]">
                {at} / {moves.length}
              </span>
              {evals.length > 0 && (
                <span className="ml-1 rounded border border-[var(--line)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--text)]">
                  {formatEval(evals[at] ?? null)}
                </span>
              )}
            </div>
          )}

          {mode === "analyse" && (
            <p className="max-w-[600px] text-center text-[11px] text-[var(--muted)]">
              {analysisLastSan
                ? `Line: ${analysisLine
                    .map((node) => node.san)
                    .join(" ")}`
                : "Starting position for analysis — drag a piece or click two squares to create a branch."}
            </p>
          )}

          {mode === "review" && !analysing && moves.length > 1 && evals.length > 1 && (
            <EvalGraph
              evals={evals}
              grades={grades}
              moves={moves}
              at={at}
              onJump={goTo}
            />
          )}

          {mode === "review" && !analysing && showBest && bestForMove && (
            <p className="text-[11px] text-[var(--muted)]">
              Better was{" "}
              <strong className="text-[var(--text)]">
                {sanOf(positions[at - 1], bestForMove)}
              </strong>{" "}
              — the green arrow shows it.
            </p>
          )}

          {analysing ? (
            <div className="w-full max-w-[600px]">
              <div className="h-1 overflow-hidden rounded-full bg-[var(--line)]">
                <div
                  className="h-full bg-[var(--accent)] transition-all"
                  style={{
                    width: `${positions.length ? (progress / positions.length) * 100 : 0}%`,
                  }}
                />
              </div>
              <p className="mt-1 text-center text-[11px] text-[var(--muted)]">
                Analysing {Math.min(progress, positions.length)} / {positions.length} positions…
              </p>
            </div>
          ) : (
            <div className="flex flex-wrap justify-center gap-1.5">
              {(Object.keys(LABEL_STYLES) as MoveLabel[])
                .filter((label) => counts[label])
                .map((label) => (
                  <span
                    key={label}
                    className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                    style={{
                      background: LABEL_STYLES[label].color,
                      color: LABEL_STYLES[label].text,
                    }}
                  >
                    {counts[label]} {LABEL_STYLES[label].label}
                  </span>
                ))}
            </div>
          )}

          {!analysing && summary && (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-[var(--muted)]">
              {summary.ratedWhite === 0 && summary.ratedBlack === 0 ? (
                <span>
                  {(counts.book ?? 0) === moves.length
                    ? `All ${moves.length} moves were still opening book — no accuracy to compute.`
                    : "This game was too short to score accuracy — the move labels above still stand."}
                </span>
              ) : (
                <>
                  <span>
                    White{" "}
                    <strong className="text-[var(--text)]">
                      {summary.ratedWhite > 0
                        ? `${summary.accuracyWhite.toFixed(1)}%`
                        : "—"}
                    </strong>{" "}
                    · ACPL {summary.ratedWhite > 0 ? summary.acplWhite : "—"}
                  </span>
                  <span>
                    Black{" "}
                    <strong className="text-[var(--text)]">
                      {summary.ratedBlack > 0
                        ? `${summary.accuracyBlack.toFixed(1)}%`
                        : "—"}
                    </strong>{" "}
                    · ACPL {summary.ratedBlack > 0 ? summary.acplBlack : "—"}
                  </span>
                </>
              )}
              {(["opening", "middlegame", "endgame"] as const).map((phase) => {
                const score = summary.phases?.[phase];
                if (!score || score.moves === 0) return null;
                return (
                  <span key={phase} className="capitalize">
                    {phase}{" "}
                    <strong className="text-[var(--text)]">
                      {score.accuracy.toFixed(1)}%
                    </strong>{" "}
                    <span className="text-[10px]">({score.moves})</span>
                  </span>
                );
              })}
            </div>
          )}
        </section>

        <aside className="flex flex-col gap-3">
          <div className="order-3 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3">
            <p className="mb-2 text-[11px] uppercase tracking-wider text-[var(--muted)]">
              {mode === "analyse" ? "Original game" : "Moves"}
            </p>
            {moves.length === 0 ? (
              <p className="text-xs text-[var(--muted)]">
                This repertoire has no main line yet — add moves in Build first.
              </p>
            ) : (
              <div className="max-h-[26rem] overflow-y-auto font-mono text-xs">
                {rows.map((row) => {
                  const black = row.black;
                  return (
                    <div key={row.number} className="flex items-center gap-1 py-0.5">
                      <span className="w-7 shrink-0 text-[var(--muted)]">
                        {row.number}.
                      </span>
                      <MoveChip
                        san={row.white.san}
                        label={grades[row.white.index]}
                        evalCp={evals[row.white.index + 1] ?? null}
                        active={mode === "review" && at === row.white.ply}
                        onClick={() => goTo(row.white.ply)}
                      />
                      {black ? (
                        <MoveChip
                          san={black.san}
                          label={grades[black.index]}
                          evalCp={evals[black.index + 1] ?? null}
                          active={mode === "review" && at === black.ply}
                          onClick={() => goTo(black.ply)}
                        />
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {mode === "analyse" && (
            <div className="order-2 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
                  Analysis line
                </p>
                <span className="text-[10px] text-[var(--muted)]">
                  {analysisLine.length} move{analysisLine.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="flex flex-wrap gap-1 font-mono text-[11px]">
                <button
                  onClick={() => {
                    setCurrentNodeId("root");
                    setAnalysisSelected(null);
                  }}
                  className={`rounded px-1.5 py-0.5 transition ${
                    currentNodeId === "root"
                      ? "bg-[var(--accent)]/15 text-[var(--accent)]"
                      : "text-[var(--muted)] hover:bg-[var(--panel-2)] hover:text-[var(--text)]"
                  }`}
                >
                  start
                </button>
                {analysisLine.map((node) => (
                  <button
                    key={node.id}
                    onClick={() => {
                      setCurrentNodeId(node.id);
                      setAnalysisSelected(null);
                    }}
                    className={`rounded px-1.5 py-0.5 transition ${
                      currentNodeId === node.id
                        ? "bg-[var(--accent)]/15 text-[var(--accent)]"
                        : "text-[var(--text)] hover:bg-[var(--panel-2)]"
                    }`}
                  >
                    {Math.ceil(node.ply / 2)}
                    {node.ply % 2 === 1 ? "." : "…"} {node.san}
                  </button>
                ))}
              </div>

              {analysisBranches.length > 0 && (
                <div className="mt-3 border-t border-[var(--line)] pt-2">
                  <p className="mb-1.5 text-[10px] uppercase tracking-wider text-[var(--muted)]">
                    Saved branches
                  </p>
                  <div className="flex max-h-28 flex-wrap gap-1 overflow-y-auto">
                    {analysisBranches.map((node) => {
                      const parent =
                        node.parentId === "root"
                          ? null
                          : analysisNodes[node.parentId] ?? null;
                      return (
                        <button
                          key={node.id}
                          onClick={() => {
                            setCurrentNodeId(node.id);
                            setAnalysisSelected(null);
                          }}
                          title={`Branch from ${parent ? parent.san : `move ${analysisRootPly}`}`}
                          className="rounded border border-[var(--line)] px-2 py-1 text-[10px] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
                        >
                          {parent ? `${parent.san} → ` : ""}
                          {node.san}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <p className="mt-2 text-[10px] leading-relaxed text-[var(--muted)]">
                Moves you try here are branches. The original game is never changed.
              </p>
            </div>
          )}

          {mode === "analyse" && (
            <div className="order-1 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
                  Engine
                </p>
                <span className="text-[10px] text-[var(--muted)]">
                  {engineEnabled
                    ? engineThinking
                      ? "searching…"
                      : engineResult
                        ? `depth ${engineResult.depth}`
                        : "ready"
                    : "off"}
                </span>
              </div>

              {!engineEnabled ? (
                <p className="text-xs leading-relaxed text-[var(--muted)]">
                  Engine is off. Turn it on above the board to see the best move
                  and the top three lines.
                </p>
              ) : engineThinking ? (
                <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--accent)]" />
                  Stockfish is searching this position…
                </div>
              ) : engineResult && engineResult.lines.length > 0 ? (
                <>
                  <div className="mb-2 flex items-center justify-between rounded-lg bg-[var(--panel-2)] px-2.5 py-1.5">
                    <span className="text-[10px] uppercase tracking-wide text-[var(--muted)]">
                      White eval
                    </span>
                    <span className="font-mono text-xs font-medium">
                      {formatEval(engineWhiteCp)}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    {engineResult.lines.map((line) => {
                      const cp = scoreToCp(line, true);
                      const whiteCp =
                        cp === null ? null : analysisTurn === "w" ? cp : -cp;
                      const candidate = line.pv[0] ?? null;
                      const pv = pvToSan(analysisFen, line.pv);
                      return (
                        <button
                          key={line.multipv}
                          onClick={() => {
                            if (!candidate || candidate.length < 4) return;
                            const piece =
                              candidate.length > 4
                                ? (candidate[4] as PromotionPiece)
                                : undefined;
                            commitAnalysisMove(
                              candidate.slice(0, 2),
                              candidate.slice(2, 4),
                              piece,
                            );
                          }}
                          disabled={!candidate}
                          className="group flex items-start gap-2 rounded-lg border border-transparent px-2 py-1.5 text-left transition hover:border-[var(--line)] hover:bg-[var(--panel-2)] disabled:opacity-50"
                        >
                          <span className="mt-px font-mono text-[10px] text-[var(--muted)]">
                            {line.multipv}
                          </span>
                          <span className="w-10 shrink-0 font-mono text-[11px] font-medium">
                            {formatEval(whiteCp)}
                          </span>
                          <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-[var(--muted)] group-hover:text-[var(--text)]">
                            {pv || "—"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-1.5 text-[10px] text-[var(--muted)]">
                    Click a line to play it. Green arrow = engine&apos;s first choice.
                  </p>
                </>
              ) : (
                <p className="text-xs text-[var(--muted)]">No engine result yet.</p>
              )}
            </div>
          )}

          {!analysing && summary && mistakeMoments.length > 0 && (
            <div className="order-4 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
                  Mistakes
                </p>
                <div className="inline-flex overflow-hidden rounded-md border border-[var(--line)] text-[10px]">
                  {(
                    [
                      ["both", `All ${mistakeMoments.length}`],
                      ["w", `White ${whiteMistakes}`],
                      ["b", `Black ${blackMistakes}`],
                    ] as const
                  ).map(([side, label]) => (
                    <button
                      key={side}
                      aria-pressed={mistakeSide === side}
                      onClick={() => setMistakeSide(side)}
                      className={`px-1.5 py-0.5 ${
                        mistakeSide === side
                          ? "bg-[var(--accent)] text-white"
                          : "text-[var(--muted)] hover:bg-[var(--panel-2)] hover:text-[var(--text)]"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {visibleMistakes.length === 0 ? (
                <p className="py-2 text-xs text-[var(--muted)]">
                  No {mistakeSide === "w" ? "White" : "Black"} mistakes in this game.
                </p>
              ) : (
                <div className="max-h-44 overflow-y-auto">
                  <ul className="divide-y divide-[var(--line)]">
                    {visibleMistakes.map((moment) => {
                      const label = LABEL_STYLES[moment.label];
                      const best = bestUci[moment.index];
                      const better =
                        best && best !== moment.move.uci
                          ? sanOf(positions[moment.index], best)
                          : null;
                      return (
                        <li key={moment.index}>
                          <button
                            onClick={() => goTo(moment.move.ply)}
                            className="flex w-full items-start gap-2 px-1 py-1.5 text-left transition hover:bg-[var(--panel-2)]"
                          >
                            <span
                              className="mt-px rounded px-1 text-[10px] font-medium leading-4"
                              style={{ background: label.color, color: label.text }}
                            >
                              {label.glyph}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-baseline justify-between gap-2">
                                <span className="font-mono text-[11px] text-[var(--text)]">
                                  {Math.ceil(moment.move.ply / 2)}
                                  {moment.move.ply % 2 === 1 ? "." : "…"} {moment.move.san}
                                </span>
                                <span className="font-mono text-[10px] text-[var(--muted)]">
                                  {formatEval(moment.before)} → {formatEval(moment.after)}
                                </span>
                              </span>
                              {better && (
                                <span className="mt-0.5 block text-[10px] text-[var(--muted)]">
                                  Better:{" "}
                                  <strong className="font-medium text-[var(--text)]">
                                    {better}
                                  </strong>
                                </span>
                              )}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          )}

          {extra && <div className="order-5 flex flex-col gap-3">{extra}</div>}

          <p className="order-6 px-1 text-[10px] uppercase tracking-wider text-[var(--muted)]">
            Stockfish 19 · 600 ms per position · 2 workers · MultiPV 2
          </p>

          <p className="order-6 px-1 text-[11px] leading-relaxed text-[var(--muted)]">
            Each move is graded against the engine&apos;s first choice; the badge
            sits on the square the piece landed on, and the arrow points at the
            move that should have been played. &quot;Brilliant&quot; needs the best
            move <em>and</em> a sacrifice; &quot;Great&quot; needs the best move to
            be clearly ahead of the second choice. Use ← / → to walk the line and
            click a dot on the graph to jump to that move. Switch to Analyse to try
            new moves as local branches — the original PGN is never changed.
          </p>
        </aside>
      </div>
    </main>
  );
}

/** Top-left corner of a square as a 0-100 percentage of the board. */
function squareXY(square: string, orientation: "white" | "black") {
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]) - 1;
  const col = orientation === "white" ? file : 7 - file;
  const row = orientation === "white" ? 7 - rank : rank;
  return { x: col * 12.5, y: row * 12.5 };
}

/** Centre of a square, in the same 0-100 space. */
function centreXY(square: string, orientation: "white" | "black") {
  const corner = squareXY(square, orientation);
  return { x: corner.x + 6.25, y: corner.y + 6.25 };
}

/** "+0.3", "−1.2", or "+M2" for a forced mate. */
function formatEval(cp: number | null): string {
  if (cp === null) return "—";
  if (Math.abs(cp) >= 9000) {
    const mateIn = (10000 - Math.abs(cp)) / 10;
    const sign = cp > 0 ? "+" : "−";
    return `${sign}M${Math.max(1, Math.round(mateIn))}`;
  }
  const pawns = cp / 100;
  if (Math.abs(pawns) < 0.05) return "0.0";
  return `${pawns > 0 ? "+" : "−"}${Math.abs(pawns).toFixed(1)}`;
}

/** UCI → SAN in a given position, for "better was …". */
function sanOf(fen: string, uci: string): string {
  try {
    const board = new Chess(fen);
    const move = board.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci.slice(4) || undefined,
    });
    return move?.san ?? uci;
  } catch {
    return uci;
  }
}

/** The first few moves of a principal variation, in readable SAN. */
function pvToSan(fen: string, pv: string[]): string {
  const board = new Chess(fen);
  const parts: string[] = [];
  for (const uci of pv.slice(0, 10)) {
    try {
      const move = board.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci.slice(4) || undefined,
      });
      parts.push(move.san);
    } catch {
      break;
    }
  }
  return parts.join(" ");
}

/** The engine's suggestion, drawn as a green arrow across the board. */
function BestArrow({
  from,
  to,
  orientation,
}: {
  from: string;
  to: string;
  orientation: "white" | "black";
}) {
  const a = centreXY(from, orientation);
  const b = centreXY(to, orientation);
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  const head = 3.4;
  const p1 = {
    x: b.x - head * Math.cos(angle - 0.55),
    y: b.y - head * Math.sin(angle - 0.55),
  };
  const p2 = {
    x: b.x - head * Math.cos(angle + 0.55),
    y: b.y - head * Math.sin(angle + 0.55),
  };

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 z-10"
    >
      <line
        x1={a.x}
        y1={a.y}
        x2={b.x}
        y2={b.y}
        stroke="#81b64c"
        strokeWidth={2.2}
        opacity={0.9}
      />
      <polygon
        points={`${b.x},${b.y} ${p1.x},${p1.y} ${p2.x},${p2.y}`}
        fill="#81b64c"
        opacity={0.9}
      />
    </svg>
  );
}

const GRAPH_DOTS: MoveLabel[] = [
  "brilliant",
  "great",
  "inaccuracy",
  "mistake",
  "blunder",
];

/** White's advantage over the whole game; hover to inspect, click to jump. */
function EvalGraph({
  evals,
  grades,
  moves,
  at,
  onJump,
}: {
  evals: number[];
  grades: (MoveLabel | null)[];
  moves: ReviewMove[];
  at: number;
  onJump: (ply: number) => void;
}) {
  const total = evals.length - 1; // plies represented by the graph
  const [hover, setHover] = useState<number | null>(null);
  if (total < 1) return null;

  const x = (index: number) => (index / total) * 100;
  const y = (cp: number) => 50 - ((winPercent(cp) - 50) / 50) * 44;
  const line = evals.map((cp, index) => `${x(index)},${y(cp)}`).join(" ");
  const activeIndex = Math.max(0, Math.min(total, hover ?? at));
  const activeMove = activeIndex > 0 ? moves[activeIndex - 1] : null;
  const activeGrade = activeIndex > 0 ? grades[activeIndex - 1] : null;
  const activeCp = evals[activeIndex] ?? null;

  const indexAt = (clientX: number, element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return Math.round(ratio * total);
  };

  return (
    <div className="w-full max-w-[600px]">
      <div className="mb-1 flex items-center justify-between gap-3 px-1 text-[10px] text-[var(--muted)]">
        <span>Evaluation</span>
        <span className="flex items-center gap-1.5 tabular-nums">
          {activeMove ? (
            <>
              <span className="font-mono">
                {Math.ceil(activeMove.ply / 2)}
                {activeMove.ply % 2 === 1 ? "." : "…"} {activeMove.san}
              </span>
              {activeGrade && (
                <span
                  className="rounded px-1 font-medium leading-4"
                  style={{
                    background: LABEL_STYLES[activeGrade].color,
                    color: LABEL_STYLES[activeGrade].text,
                  }}
                >
                  {LABEL_STYLES[activeGrade].glyph}
                </span>
              )}
            </>
          ) : (
            <span className="font-mono">start</span>
          )}
          <span className="font-mono text-[var(--text)]">
            {formatEval(activeCp)}
          </span>
        </span>
      </div>
      <div
        className="relative h-[76px] w-full cursor-crosshair touch-none overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]"
        onPointerMove={(event) =>
          setHover(indexAt(event.clientX, event.currentTarget))
        }
        onPointerLeave={() => setHover(null)}
        onClick={(event) => onJump(indexAt(event.clientX, event.currentTarget))}
        title="Hover to inspect a move · click to jump there"
        role="img"
        aria-label="Evaluation graph. Hover to inspect, click to jump."
      >
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
        >
          <line
            x1="0"
            y1="50"
            x2="100"
            y2="50"
            stroke="rgba(255,255,255,0.16)"
            strokeWidth="0.7"
          />
          <polyline
            points={line}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="1.4"
            vectorEffect="non-scaling-stroke"
            strokeLinecap="round"
          />
          <polygon
            points={`0,50 ${line} 100,50`}
            fill="rgba(129,182,76,0.10)"
          />
        </svg>

        {hover !== null && (
          <div
            className="pointer-events-none absolute inset-y-0 w-px bg-[var(--muted)]/50"
            style={{ left: `${x(hover)}%` }}
          />
        )}

        <div
          className="pointer-events-none absolute inset-y-0 w-px bg-[var(--accent)]"
          style={{ left: `${x(at)}%` }}
        />

        {hover !== null && (
          <div
            className="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[var(--panel)]"
            style={{
              left: `${x(hover)}%`,
              top: `${y(evals[hover] ?? 0)}%`,
              background:
                (hover > 0 && grades[hover - 1]
                  ? LABEL_STYLES[grades[hover - 1] as MoveLabel].color
                  : "var(--accent)"),
            }}
          />
        )}

        {grades.map((grade, index) =>
          grade && GRAPH_DOTS.includes(grade) ? (
            <button
              key={index}
              onClick={(event) => {
                event.stopPropagation();
                onJump(index + 1);
              }}
              aria-label={LABEL_STYLES[grade].label}
              className="absolute h-[7px] w-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full ring-1 ring-black/40"
              style={{
                left: `${x(index + 1)}%`,
                top: `${y(evals[index + 1] ?? 0)}%`,
                background: LABEL_STYLES[grade].color,
              }}
            />
          ) : null,
        )}
      </div>
    </div>
  );
}

function MoveChip({
  san,
  label,
  evalCp,
  active,
  onClick,
}: {
  san: string;
  label: MoveLabel | null | undefined;
  evalCp: number | null;
  active: boolean;
  onClick: () => void;
}) {
  const style = label ? LABEL_STYLES[label] : null;

  return (
    <button
      onClick={onClick}
      className={[
        "flex min-w-[5.6rem] flex-1 items-center justify-between gap-2 rounded px-1.5 py-0.5 text-left transition-colors",
        active ? "bg-[var(--line)]" : "hover:bg-[var(--panel-2)]",
      ].join(" ")}
    >
      <span>{san}</span>
      <span className="flex items-center gap-1">
        {evalCp !== null && (
          <span className="text-[10px] text-[var(--muted)]">
            {formatEval(evalCp)}
          </span>
        )}
        {style ? (
          <span
            className="rounded px-1 text-[10px] leading-4"
            style={{ background: style.color, color: style.text }}
          >
            {style.glyph || "·"}
          </span>
        ) : null}
      </span>
    </button>
  );
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function groupMoves(moves: ReviewMove[], startFen: string) {
  const rows: {
    number: number;
    white: { san: string; ply: number; index: number };
    black?: { san: string; ply: number; index: number };
  }[] = [];

  moves.forEach((move, index) => {
    // A position that starts with black to move puts a black move first.
    const blackFirst = turnOf(startFen) === "b";
    const adjusted = blackFirst ? index + 1 : index;
    const number = Math.floor(adjusted / 2) + 1;
    if (adjusted % 2 === 0) {
      rows.push({
        number,
        white: { san: move.san, ply: move.ply, index },
      });
    } else {
      if (!rows[rows.length - 1]) {
        rows.push({ number, white: { san: "", ply: -1, index: -1 } });
      }
      rows[rows.length - 1].black = { san: move.san, ply: move.ply, index };
    }
  });

  return rows;
}

function tally(grades: (MoveLabel | null)[]) {
  const counts: Partial<Record<MoveLabel, number>> = {};
  for (const grade of grades) {
    if (!grade) continue;
    counts[grade] = (counts[grade] ?? 0) + 1;
  }
  return counts;
}
