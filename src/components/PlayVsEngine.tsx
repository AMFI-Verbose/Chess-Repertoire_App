"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";

import ModeTabs from "@/components/ModeTabs";
import { Engine } from "@/lib/engine";
import { START_FEN, tryMove, turnOf } from "@/lib/chess";
import {
  DARK_SQUARE,
  LIGHT_SQUARE,
  LAST_MOVE,
  squareTint,
  squaresOf,
} from "@/lib/boardTheme";
import { play } from "@/lib/sound";

type Status = "playing" | "ended";

/** Engine strength: Skill Level 0–20 maps to "thinks for longer" and "tries harder". */
function skillSettings(skill: number) {
  const movetime = 120 + skill * 45; // 120ms at the bottom, ~1s at full strength
  return { skill, movetime };
}

export default function PlayVsEngine({
  repertoireId,
  name,
  side,
}: {
  repertoireId: string;
  name: string;
  side: "white" | "black";
}) {
  const [fen, setFen] = useState(START_FEN);
  const [moves, setMoves] = useState<{ san: string; uci: string }[]>([]);
  const [youPlay, setYouPlay] = useState<"w" | "b">(side === "black" ? "b" : "w");
  const [skill, setSkill] = useState(12);
  const [thinking, setThinking] = useState(false);
  const [status, setStatus] = useState<Status>("playing");
  const [result, setResult] = useState<string | null>(null);
  const [showEval, setShowEval] = useState(true);
  const [evalCp, setEvalCp] = useState<number | null>(null);

  const engineRef = useRef<Engine | null>(null);
  const searchingFor = useRef<string | null>(null);
  const evalToken = useRef(0);
  const statusRef = useRef<Status>("playing");

  statusRef.current = status;

  const getEngine = useCallback(() => {
    if (!engineRef.current) engineRef.current = new Engine();
    return engineRef.current;
  }, []);

  // The worker is a real resource; drop it when you leave the page.
  useEffect(() => {
    return () => {
      engineRef.current?.terminate();
      engineRef.current = null;
    };
  }, []);

  /** Shared bookkeeping for both human and engine moves. */
  const commitMove = useCallback(
    (from: string, to: string, promotion?: string) => {
      const current = fen;
      const result = tryMove(current, from, to, promotion ?? "q");
      if (!result) return false;

      const next = new Chess(result.fen);
      setFen(result.fen);
      setMoves((previous) => [...previous, { san: result.san, uci: result.uci }]);
      play(result.captured ? "capture" : result.check ? "check" : "move");

      if (next.isGameOver()) {
        setStatus("ended");
        if (next.isCheckmate()) {
          setResult(`${turnOf(current) === "w" ? "Black" : "White"} wins by checkmate`);
        } else if (next.isStalemate()) {
          setResult("Draw by stalemate");
        } else if (next.isInsufficientMaterial()) {
          setResult("Draw — insufficient material");
        } else {
          setResult("Draw");
        }
      }
      return true;
    },
    [fen],
  );

  // ---- the engine's turn -------------------------------------------------
  useEffect(() => {
    if (status !== "playing") return;
    if (turnOf(fen) === youPlay) return;
    if (searchingFor.current === fen) return;

    searchingFor.current = fen;
    setThinking(true);

    let cancelled = false;
    const settings = skillSettings(skill);

    getEngine()
      .search(fen, { movetime: settings.movetime, skill: settings.skill })
      .then((response) => {
        if (cancelled || statusRef.current !== "playing") return;
        const uci = response.bestmove;
        if (!uci || uci.startsWith("(")) {
          setStatus("ended");
          setResult("Engine resigned");
          return;
        }
        commitMove(uci.slice(0, 2), uci.slice(2, 4), uci.length > 4 ? uci[4] : "q");
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setThinking(false);
      });

    return () => {
      cancelled = true;
    };
  }, [fen, youPlay, status, skill, commitMove, getEngine]);

  // ---- evaluation bar ----------------------------------------------------
  useEffect(() => {
    if (!showEval) return;
    const token = evalToken.current + 1;
    evalToken.current = token;

    getEngine()
      .search(fen, { movetime: 260, multiPv: 1, skill: 20 })
      .then((response) => {
        if (evalToken.current !== token) return;
        const line = response.lines[0];
        if (!line) return;
        if (line.mateIn !== null) {
          setEvalCp(line.mateIn > 0 ? 9000 : -9000);
        } else if (line.scoreCp !== null) {
          // Normalise to White's point of view for the bar.
          setEvalCp(turnOf(fen) === "w" ? line.scoreCp : -line.scoreCp);
        }
      })
      .catch(() => undefined);
  }, [fen, showEval, getEngine]);

  function onDrop({
    sourceSquare,
    targetSquare,
  }: {
    piece: { pieceType: string };
    sourceSquare: string;
    targetSquare: string | null;
  }) {
    if (!targetSquare) return false;
    if (status !== "playing") return false;
    if (thinking) return false;
    if (turnOf(fen) !== youPlay) return false;
    return commitMove(sourceSquare, targetSquare);
  }

  function undo() {
    if (moves.length === 0) return;
    // Take back your move *and* the engine's reply when there is one.
    const strip = turnOf(fen) === youPlay ? 2 : 1;
    const kept = moves.slice(0, Math.max(0, moves.length - strip));
    const replay = new Chess();
    for (const move of kept) {
      replay.move({
        from: move.uci.slice(0, 2),
        to: move.uci.slice(2, 4),
        promotion: move.uci.length > 4 ? move.uci[4] : "q",
      });
    }
    searchingFor.current = null;
    setFen(replay.fen());
    setMoves(kept);
    setStatus("playing");
    setResult(null);
  }

  function newGame(nextSide: "w" | "b") {
    searchingFor.current = null;
    setFen(START_FEN);
    setMoves([]);
    setYouPlay(nextSide);
    setStatus("playing");
    setResult(null);
    setEvalCp(null);
  }

  const lastMove = moves.length > 0 ? moves[moves.length - 1].uci : null;
  const highlighted = lastMove ? squaresOf(lastMove) : [];

  const squareStyles: Record<string, Record<string, string>> = {};
  for (const square of highlighted) {
    squareStyles[square] = { backgroundImage: squareTint(LAST_MOVE, 0.41) };
  }

  // Eval bar: 0 cp = half, ±1000 cp saturates.
  const whiteShare =
    evalCp === null ? 0.5 : 0.5 + Math.max(-1, Math.min(1, evalCp / 1000)) / 2;

  const rows = groupMoves(moves);

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link
            href="/"
            className="text-xs text-[var(--muted)] transition-colors hover:text-[var(--text)]"
          >
            ← All repertoires
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{name}</h1>
          <p className="text-sm text-[var(--muted)]">Play against Stockfish 19</p>
        </div>
        <ModeTabs repertoireId={repertoireId} active="play" />
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="flex flex-col items-center gap-3">
          <div className="w-full max-w-[600px] overflow-hidden rounded-xl border border-[var(--line)] shadow-[0_10px_40px_-20px_rgba(0,0,0,0.9)]">
            <Chessboard
              options={{
                id: "play-board",
                position: fen,
                boardOrientation: youPlay === "w" ? "white" : "black",
                onPieceDrop: onDrop,
                squareStyles,
                animationDurationInMs: 180,
                lightSquareStyle: LIGHT_SQUARE,
                darkSquareStyle: DARK_SQUARE,
              }}
            />
          </div>
          <p className="text-xs text-[var(--muted)]">
            {result
              ? result
              : thinking
                ? "Stockfish is thinking…"
                : turnOf(fen) === youPlay
                  ? "Your move"
                  : "…"}
          </p>
        </section>

        <aside className="flex flex-col gap-4">
          <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
            <div className="flex items-center justify-between text-xs text-[var(--muted)]">
              <span>Evaluation</span>
              <span className="font-mono text-[var(--text)]">
                {evalCp === null ? "—" : formatEval(evalCp)}
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#3a3733]">
              <div
                className="h-full bg-[#f0d9b5] transition-all duration-300"
                style={{ width: `${whiteShare * 100}%` }}
              />
            </div>
            <label className="mt-3 flex items-center gap-2 text-xs text-[var(--muted)]">
              <input
                type="checkbox"
                checked={showEval}
                onChange={(event) => setShowEval(event.target.checked)}
                className="accent-[var(--accent)]"
              />
              Show evaluation
            </label>
          </div>

          <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
            <div className="flex items-center justify-between text-xs text-[var(--muted)]">
              <span>Engine strength</span>
              <span className="font-mono text-[var(--text)]">
                {skill <= 3 ? "Beginner" : skill <= 8 ? "Club" : skill <= 14 ? "Strong" : "Full"} · {skill}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={20}
              value={skill}
              onChange={(event) => setSkill(Number(event.target.value))}
              className="mt-2 w-full accent-[var(--accent)]"
            />
            <p className="mt-1 text-[11px] leading-relaxed text-[var(--muted)]">
              Skill Level makes Stockfish pick weaker moves on purpose — it is not
              just a shorter search.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => newGame(youPlay)}
              className="rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-medium text-[#0b1602]"
            >
              New game
            </button>
            <button
              onClick={undo}
              disabled={moves.length === 0}
              className="rounded-lg border border-[var(--line)] px-3 py-2 text-xs text-[var(--text)] disabled:opacity-40"
            >
              Take back
            </button>
            <button
              onClick={() => {
                setStatus("ended");
                setResult("You resigned");
              }}
              className="rounded-lg border border-[var(--line)] px-3 py-2 text-xs text-[var(--text)]"
            >
              Resign
            </button>
            <button
              onClick={() => newGame(youPlay === "w" ? "b" : "w")}
              className="rounded-lg border border-[var(--line)] px-3 py-2 text-xs text-[var(--text)]"
            >
              Play as {youPlay === "w" ? "black" : "white"}
            </button>
          </div>

          <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3">
            <p className="mb-2 text-[11px] uppercase tracking-wider text-[var(--muted)]">
              Moves
            </p>
            {rows.length === 0 ? (
              <p className="text-xs text-[var(--muted)]">No moves yet.</p>
            ) : (
              <div className="max-h-64 overflow-y-auto font-mono text-xs">
                {rows.map((row) => (
                  <div key={row.number} className="flex gap-3 py-0.5">
                    <span className="w-8 shrink-0 text-[var(--muted)]">
                      {row.number}.
                    </span>
                    <span className="w-16">{row.white}</span>
                    <span className="w-16">{row.black ?? ""}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}

function formatEval(cp: number): string {
  if (Math.abs(cp) >= 9000) return cp > 0 ? "#" : "-#";
  const pawns = cp / 100;
  return `${pawns > 0 ? "+" : ""}${pawns.toFixed(2)}`;
}

function groupMoves(moves: { san: string; uci: string }[]) {
  const rows: { number: number; white: string; black?: string }[] = [];
  moves.forEach((move, index) => {
    const number = Math.floor(index / 2) + 1;
    if (index % 2 === 0) {
      rows.push({ number, white: move.san });
    } else {
      rows[rows.length - 1].black = move.san;
    }
  });
  return rows;
}
