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
import {
  DARK_SQUARE,
  LIGHT_SQUARE,
  squareTint,
  squaresOf,
} from "@/lib/boardTheme";
import { play, type SoundName } from "@/lib/sound";

export type ReviewMove = { san: string; uci: string; fen: string; ply: number };

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

  const engineRef = useRef<Engine | null>(null);

  // Position 0 is the start; position i+1 is after move i.
  const positions = useMemo(
    () => [startFen, ...moves.map((m) => m.fen)],
    [moves, startFen],
  );

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

  // ---- effects when you land on a move ------------------------------------
  const goTo = useCallback(
    (next: number) => {
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
        goTo(at - 1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        goTo(at + 1);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [at, goTo]);

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

  const rows = groupMoves(moves, startFen);
  const counts = tally(grades);

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-8">
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
          <div className="relative w-full max-w-[600px]">
            <div className="overflow-hidden rounded-xl border border-[var(--line)] shadow-[0_10px_40px_-20px_rgba(0,0,0,0.9)]">
              <Chessboard
                options={{
                  id: "review-board",
                  position: positions[at] || positions[0] || "",
                  boardOrientation: orientation,
                  squareStyles,
                  animationDurationInMs: 200,
                  lightSquareStyle: LIGHT_SQUARE,
                  darkSquareStyle: DARK_SQUARE,
                }}
              />
            </div>

            {at > 0 && style && style.glyph && badgeSquare && (
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

            {showBest && bestForMove && (
              <BestArrow
                from={bestForMove.slice(0, 2)}
                to={bestForMove.slice(2, 4)}
                orientation={orientation}
              />
            )}

            {flash && (
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

          <div className="flex items-center gap-2">
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
              <span className="ml-3 rounded border border-[var(--line)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--text)]">
                {formatEval(evals[at] ?? null)}
              </span>
            )}
          </div>

          {!analysing && moves.length > 1 && evals.length > 1 && (
            <EvalGraph
              evals={evals}
              grades={grades}
              at={at}
              onJump={goTo}
            />
          )}

          {!analysing && showBest && bestForMove && (
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
          <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3">
            <p className="mb-2 text-[11px] uppercase tracking-wider text-[var(--muted)]">
              Moves
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
                        active={at === row.white.ply}
                        onClick={() => goTo(row.white.ply)}
                      />
                      {black ? (
                        <MoveChip
                          san={black.san}
                          label={grades[black.index]}
                          evalCp={evals[black.index + 1] ?? null}
                          active={at === black.ply}
                          onClick={() => goTo(black.ply)}
                        />
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {extra}

          <p className="px-1 text-[10px] uppercase tracking-wider text-[var(--muted)]">
            Stockfish 19 · 600 ms per position · 2 workers · MultiPV 2
          </p>

          <p className="px-1 text-[11px] leading-relaxed text-[var(--muted)]">
            Each move is graded against the engine&apos;s first choice; the badge
            sits on the square the piece landed on, and the arrow points at the
            move that should have been played. &quot;Brilliant&quot; needs the best
            move <em>and</em> a sacrifice; &quot;Great&quot; needs the best move to
            be clearly ahead of the second choice. Use ← / → to walk the line and
            click a dot on the graph to jump to that move.
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

/** White's advantage over the whole game; click anywhere to jump there. */
function EvalGraph({
  evals,
  grades,
  at,
  onJump,
}: {
  evals: number[];
  grades: (MoveLabel | null)[];
  at: number;
  onJump: (ply: number) => void;
}) {
  const total = evals.length - 1; // plies represented by the graph
  if (total < 1) return null;

  const x = (index: number) => (index / total) * 100;
  const y = (cp: number) => 50 - ((winPercent(cp) - 50) / 50) * 44;
  const line = evals.map((cp, index) => `${x(index)},${y(cp)}`).join(" ");

  return (
    <div className="w-full max-w-[600px]">
      <div
        className="relative h-[76px] w-full cursor-pointer overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]"
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const ratio = (event.clientX - rect.left) / rect.width;
          onJump(Math.round(ratio * total));
        }}
        title="Click to jump to a move"
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

        <div
          className="pointer-events-none absolute inset-y-0 w-px bg-[var(--accent)]"
          style={{ left: `${x(at)}%` }}
        />
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
