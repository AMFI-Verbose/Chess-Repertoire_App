"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import Link from "next/link";

import {
  getPracticePuzzle,
  submitPuzzleAttempt,
  type PuzzleDTO,
  type PuzzleStats,
} from "@/app/actions";
import { DARK_SQUARE, LIGHT_SQUARE } from "@/lib/boardTheme";
import { hintStyles } from "@/lib/boardHints";
import { expectedScore } from "@/lib/elo";
import { play } from "@/lib/sound";

type Status = "solving" | "solved" | "failed" | "revealed";

function promotionOf(uci: string) {
  return uci.length > 4 ? uci[4] : "q";
}

const THEMES: { id: string; label: string }[] = [
  { id: "", label: "All" },
  { id: "mateIn1", label: "Mate in 1" },
  { id: "mateIn2", label: "Mate in 2" },
  { id: "fork", label: "Fork" },
  { id: "pin", label: "Pin" },
  { id: "sacrifice", label: "Sacrifice" },
  { id: "skewer", label: "Skewer" },
  { id: "discoveredAttack", label: "Discovered" },
  { id: "endgame", label: "Endgame" },
  { id: "hangingPiece", label: "Hanging piece" },
];

export default function PuzzleTrainer({
  initial,
  initialStats,
  isDaily,
}: {
  initial: PuzzleDTO;
  initialStats: PuzzleStats;
  isDaily: boolean;
}) {
  const [puzzle, setPuzzle] = useState(initial);
  const [stats, setStats] = useState(initialStats);
  const [daily, setDaily] = useState(isDaily);
  const [theme, setTheme] = useState<string>("");
  const [status, setStatus] = useState<Status>("solving");
  const [position, setPosition] = useState(initial.fen);
  const [step, setStep] = useState(0);
  const [shaking, setShaking] = useState(false);
  const [lastMove, setLastMove] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [delta, setDelta] = useState<number | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  // A mutable board that mirrors whatever is on screen.
  const board = useRef(new Chess(initial.fen));
  const reported = useRef(false);

  const solution = useMemo(() => puzzle.solution.split(" "), [puzzle.solution]);
  const solverPlays = puzzle.fen.split(" ")[1] === "w" ? "white" : "black";
  const orientation = solverPlays === "white" ? "white" : "black";

  const record = useCallback(
    async (solved: boolean) => {
      if (reported.current) return;
      reported.current = true;
      // A failed write should never take the page down mid-drag.
      try {
        const next = await submitPuzzleAttempt({ puzzleId: puzzle.id, solved });
        setStats(next);
        setDelta(next.lastDelta);
        window.setTimeout(() => setDelta(null), 5000);
      } catch {
        reported.current = false;
      }
    },
    [puzzle.id],
  );

  /** Play one UCI move on the ref board and mirror it into state. */
  const apply = useCallback((uci: string) => {
    const move = board.current.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: promotionOf(uci),
    });
    if (!move) return false;
    setPosition(board.current.fen());
    setLastMove(uci);
    play(move.captured ? "capture" : move.san.includes("+") ? "check" : "move");
    return true;
  }, []);

  // Any timer that advances the line must be cancellable: switching puzzles
  // mid-reply used to leave a stray callback moving the *new* board.
  const timers = useRef<number[]>([]);

  const later = useCallback((fn: () => void, delay: number) => {
    const id = window.setTimeout(() => {
      timers.current = timers.current.filter((pending) => pending !== id);
      fn();
    }, delay);
    timers.current.push(id);
  }, []);

  const cancelTimers = useCallback(() => {
    for (const id of timers.current) window.clearTimeout(id);
    timers.current = [];
  }, []);

  // Leaving the page mid-reply should not leave a timer running.
  useEffect(() => () => cancelTimers(), [cancelTimers]);

  /** Validate and commit one attempt. Returns false for anything illegal. */
  function tryMove(sourceSquare: string, targetSquare: string): boolean {
    if (status !== "solving" || loading) return false;
    if (board.current.turn() !== (solverPlays === "white" ? "w" : "b")) return false;

    const uci = `${sourceSquare}${targetSquare}`;
    let legal: string | null = null;
    try {
      const probe = new Chess(board.current.fen());
      const move = probe.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: "q",
      });
      if (move) legal = `${move.from}${move.to}`;
    } catch {
      legal = null;
    }
    if (!legal) return false;

    // Never index past the end of the line: a drop can land during the
    // opponent's reply window, after the solution is already exhausted.
    const expectedMove = solution[step];
    if (!expectedMove) return false;

    const expected = expectedMove.slice(0, 4);

    if (legal !== expected) {
      // First wrong move ends the attempt, exactly like Lichess.
      setShaking(true);
      window.setTimeout(() => setShaking(false), 420);
      play("error");
      setStatus("failed");
      void record(false);
      return false;
    }

    apply(uci);
    const nextStep = step + 1;
    setStep(nextStep);

    if (nextStep >= solution.length) {
      setStatus("solved");
      play("brilliant");
      void record(true);
      return true;
    }

    play("success");

    // The stored line alternates sides, so the next entry is the opponent's
    // reply. Advance the index *only* if that move actually lands — a failed
    // apply means the board and the line disagree, and jumping ahead would
    // desync every later guess.
    const opponentMove = solution[nextStep];
    const isLastPly = nextStep + 1 >= solution.length;

    later(() => {
      if (!apply(opponentMove)) return;
      setStep(nextStep + 1);
      if (isLastPly) {
        setStatus("solved");
        play("brilliant");
        void record(true);
      }
    }, 380);

    return true;
  }

  function onDrop({
    sourceSquare,
    targetSquare,
  }: {
    piece: { pieceType: string };
    sourceSquare: string;
    targetSquare: string | null;
  }) {
    setSelected(null);
    if (!targetSquare) return false;
    return tryMove(sourceSquare, targetSquare);
  }

  /** Click-to-move: pick a piece, then click its destination. */
  function onSquareClick({ square }: { square: string }) {
    if (status !== "solving") return;

    if (selected === square) {
      setSelected(null);
      return;
    }

    if (selected) {
      const moved = tryMove(selected, square);
      setSelected(null);
      if (moved) return;
    }

    // Selecting only your own pieces avoids dots on the opponent's side.
    const ownTurn = board.current.turn() === (solverPlays === "white" ? "w" : "b");
    if (!ownTurn) return;
    const piece = board.current.get(square as never);
    if (piece && piece.color === board.current.turn()) {
      setSelected(square);
      play("navigate");
    } else {
      setSelected(null);
    }
  }

  function reveal() {
    if (status === "solved" || status === "revealed") return;
    cancelTimers();
    setStatus("revealed");
    let index = step;
    const timer = window.setInterval(() => {
      if (index >= solution.length) {
        window.clearInterval(timer);
        return;
      }
      if (!apply(solution[index])) {
        window.clearInterval(timer);
        return;
      }
      index += 1;
      setStep(index);
    }, 420);
    timers.current.push(timer);
    if (status === "solving") void record(false);
  }

  /** Switching theme fetches a puzzle from it straight away. */
  async function changeTheme(next: string) {
    cancelTimers();
    setTheme(next);
    setLoading(true);
    try {
      const fresh = await getPracticePuzzle(puzzle.id, next || undefined);
      setPuzzle(fresh.puzzle);
      setStats(fresh.stats);
      setDaily(false);
      setDelta(null);
      setStatus("solving");
      setStep(0);
      setLastMove(null);
      board.current = new Chess(fresh.puzzle.fen);
      setPosition(fresh.puzzle.fen);
      reported.current = false;
    } catch {
      // Keep the current puzzle on screen.
    } finally {
      setLoading(false);
    }
  }

  async function nextPuzzle() {
    cancelTimers();
    setLoading(true);
    try {
      const fresh = await getPracticePuzzle(puzzle.id, theme || undefined);
      setPuzzle(fresh.puzzle);
      setStats(fresh.stats);
      setDaily(false);
      setDelta(null);
      setStatus("solving");
      setStep(0);
      setLastMove(null);
      board.current = new Chess(fresh.puzzle.fen);
      setPosition(fresh.puzzle.fen);
      reported.current = false;
    } catch {
      // Keep the current puzzle on screen instead of surfacing an error.
    } finally {
      setLoading(false);
    }
  }

  const squareStyles = useMemo(
    () =>
      hintStyles(position, {
        selected,
        lastMove,
        legalMovesFor: selected,
      }),
    [position, selected, lastMove],
  );

  const turn = board.current.turn();
  const themes = puzzle.themes.split(" ").filter(Boolean).slice(0, 4);

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="flex flex-col items-center gap-3">
        <div
          className={`relative w-full max-w-[600px] ${shaking ? "animate-shake" : ""}`}
        >
          <div
            className={`overflow-hidden rounded-xl border shadow-[0_10px_40px_-20px_rgba(0,0,0,0.9)] transition-colors ${
              status === "solved"
                ? "border-[var(--accent)]"
                : "border-[var(--line)]"
            }`}
          >
            <Chessboard
              options={{
                id: "puzzle-board",
                position,
                boardOrientation: orientation,
                onPieceDrop: onDrop,
                onSquareClick: onSquareClick,
                onPieceDrag: ({ square }) => {
                  if (!square) return;
                  const piece = board.current.get(square as never);
                  const ownTurn =
                    board.current.turn() === (solverPlays === "white" ? "w" : "b");
                  if (piece && ownTurn && piece.color === board.current.turn()) {
                    setSelected(square);
                  }
                },
                onPieceDragCancel: () => setSelected(null),
                squareStyles,
                animationDurationInMs: 280,
                lightSquareStyle: LIGHT_SQUARE,
                darkSquareStyle: DARK_SQUARE,
              }}
            />
          </div>

          {status === "solved" && (
            <div className="animate-pop pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-lg bg-[#26c2a3] px-4 py-2 text-sm font-semibold text-[#04231d] shadow-lg">
              Solved · {puzzle.rating} rating
            </div>
          )}
          {status === "failed" && (
            <div className="animate-pop pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-lg bg-[#ca3431] px-4 py-2 text-sm font-semibold text-white shadow-lg">
              Not the move — try again or reveal
            </div>
          )}
        </div>

        <p className="h-5 text-xs text-[var(--muted)]">
          {status === "solved"
            ? "Clean finish. Next one?"
            : status === "revealed"
              ? "Solution shown — this attempt counts as unsolved."
              : status === "failed"
                ? "You can reset and retry, or reveal the line."
                : turn === (solverPlays === "white" ? "w" : "b")
                  ? "Your move — find the best continuation"
                  : "…"}
        </p>

        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            onClick={nextPuzzle}
            disabled={loading}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[#04231d] transition hover:brightness-110 disabled:opacity-60"
          >
            {loading ? "Loading…" : "Next puzzle"}
          </button>
          <button
            onClick={reveal}
            className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm text-[var(--muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)]"
          >
            Show solution
          </button>
          {status !== "solving" && (
            <button
              onClick={() => {
                cancelTimers();
                setSelected(null);
                setStatus("solving");
                setStep(0);
                setLastMove(null);
                board.current = new Chess(puzzle.fen);
                setPosition(puzzle.fen);
                // Deliberately NOT re-opening the attempt: retrying the
                // position is practice, but one puzzle may only move your
                // rating once. A new puzzle resets this flag.
              }}
              className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm text-[var(--muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)]"
            >
              Reset position
            </button>
          )}
        </div>
      </section>

      <aside className="flex flex-col gap-4">
        <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5">
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">
              Your puzzle rating
            </span>
            {delta !== null && delta !== 0 && (
              <span
                className={`animate-pop rounded px-1.5 py-0.5 text-xs font-semibold ${
                  delta > 0
                    ? "bg-[#26c2a3]/15 text-[#26c2a3]"
                    : "bg-[#ca3431]/15 text-[#ca3431]"
                }`}
              >
                {delta > 0 ? `+${delta}` : delta}
              </span>
            )}
          </div>

          <div className="mt-1 flex items-end gap-2">
            <span className="text-3xl font-semibold tabular-nums">
              {stats.rating}
            </span>
            <span className="pb-1 text-[11px] text-[var(--muted)]">
              peak {stats.peak}
            </span>
          </div>

          <div className="mt-3">
            <div className="mb-1 flex justify-between text-[11px] text-[var(--muted)]">
              <span>vs {puzzle.rating}</span>
              <span>
                {Math.round(expectedScore(stats.rating, puzzle.rating) * 100)}%
                expected
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--line)]">
              <div
                className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-500"
                style={{
                  width: `${Math.round(
                    expectedScore(stats.rating, puzzle.rating) * 100,
                  )}%`,
                }}
              />
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-[var(--muted)]">
              Elo updates after every attempt: beating a puzzle rated above you
              pays more than beating an easy one.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-[0.16em] text-[var(--accent)]">
              {daily ? "Daily puzzle" : "Practice"}
            </span>
            <span className="rounded-md border border-[var(--line)] px-2 py-0.5 text-xs text-[var(--muted)]">
              {puzzle.rating}
            </span>
          </div>
          <p className="text-sm font-medium">{puzzle.title}</p>
          {themes.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {themes.map((theme) => (
                <span
                  key={theme}
                  className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[11px] text-[var(--muted)]"
                >
                  {theme}
                </span>
              ))}
            </div>
          )}
          <p className="mt-4 text-xs leading-relaxed text-[var(--muted)]">
            {solverPlays === "white" ? "White" : "Black"} to move. Drag the piece
            that starts the tactic — the first wrong move ends the attempt.
          </p>
        </div>

        <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-3">
          <p className="mb-2 text-[11px] uppercase tracking-wider text-[var(--muted)]">
            Practice theme
          </p>
          <div className="flex flex-wrap gap-1.5">
            {THEMES.map((entry) => {
              const active = theme === entry.id;
              return (
                <button
                  key={entry.id}
                  onClick={() => changeTheme(entry.id)}
                  className="rounded-md border px-2 py-1 text-[11px] transition"
                  style={{
                    borderColor: active ? "var(--accent)" : "var(--line)",
                    background: active ? "var(--panel-2)" : "transparent",
                    color: active ? "var(--text)" : "var(--muted)",
                  }}
                >
                  {entry.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Solved", value: stats.solved },
            { label: "Streak", value: stats.streak },
            { label: "Attempted", value: stats.attempted },
            { label: "Accuracy", value: `${stats.accuracy}%` },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3"
            >
              <p className="text-lg font-semibold tabular-nums">{item.value}</p>
              <p className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
                {item.label}
              </p>
            </div>
          ))}
        </div>

        <Link
          href="/community"
          className="group flex items-center justify-between rounded-xl border border-[var(--line)] bg-[var(--panel)] px-5 py-4 transition hover:border-[var(--accent)]"
        >
          <span>
            <span className="block text-sm font-medium">Study annotated games</span>
            <span className="mt-0.5 block text-xs text-[var(--muted)]">
              Morphy, Anderssen, and a comment thread
            </span>
          </span>
          <span className="text-xs text-[var(--muted)] transition group-hover:text-[var(--accent)]">
            →
          </span>
        </Link>
      </aside>
    </div>
  );
}
