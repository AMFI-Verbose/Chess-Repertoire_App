"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Chessboard } from "react-chessboard";

import ModeTabs from "@/components/ModeTabs";
import { Engine, scoreToCp, type EngineResult } from "@/lib/engine";
import { LABEL_STYLES, classifyMove, materialFor, type MoveLabel } from "@/lib/classify";
import {
  DARK_SQUARE,
  LIGHT_SQUARE,
  squareTint,
  squaresOf,
} from "@/lib/boardTheme";
import { play, type SoundName } from "@/lib/sound";

export type ReviewMove = { san: string; uci: string; fen: string; ply: number };

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

export default function ReviewSequence({
  repertoireId,
  name,
  side,
  moves,
  bookPlies,
}: {
  repertoireId: string;
  name: string;
  side: "white" | "black";
  moves: ReviewMove[];
  bookPlies: number[];
}) {
  const [grades, setGrades] = useState<(MoveLabel | null)[]>([]);
  const [progress, setProgress] = useState(0);
  const [analysing, setAnalysing] = useState(true);
  const [at, setAt] = useState(0); // how many plies are on the board
  const [autoPlay, setAutoPlay] = useState(false);
  const [flash, setFlash] = useState<{ label: MoveLabel; id: number } | null>(null);

  const engineRef = useRef<Engine | null>(null);

  // Position 0 is the start; position i+1 is after move i.
  const positions = useMemo(
    () => [startFenOf(), ...moves.map((m) => m.fen)],
    [moves],
  );

  // ---- analysis ----------------------------------------------------------
  useEffect(() => {
    if (moves.length === 0) {
      setAnalysing(false);
      return;
    }

    const engine = new Engine();
    engineRef.current = engine;
    let cancelled = false;

    (async () => {
      const results: EngineResult[] = [];

      // One MultiPV=2 search per position, not per move: the score *after* a
      // move is the score *before* the next one, so N moves cost N searches.
      for (let index = 0; index < positions.length; index += 1) {
        if (cancelled) return;
        const result = await engine.search(positions[index], {
          movetime: 300,
          multiPv: 2,
          skill: 20,
        });
        results.push(result);
        setProgress(index + 1);
      }

      if (cancelled) return;

      const graded: MoveLabel[] = moves.map((move, index) => {
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

        const mover = index % 2 === 0 ? "w" : "b";
        const beforeFen = positions[index];
        const shedMaterial =
          materialFor(move.fen, mover) <= materialFor(beforeFen, mover) - 2;

        return classifyMove({
          best,
          second,
          played,
          isBestMove,
          isBook,
          isSacrifice: shedMaterial,
        });
      });

      if (cancelled) return;
      setGrades(graded);
      setAnalysing(false);
    })();

    return () => {
      cancelled = true;
      engine.terminate();
      engineRef.current = null;
    };
  }, [moves, positions, bookPlies]);

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

  const squareStyles: Record<string, Record<string, string>> = {};
  if (at > 0 && style) {
    for (const square of squaresOf(moves[at - 1].uci)) {
      squareStyles[square] = {
        backgroundImage: squareTint(style.color, 0.5),
        boxShadow: `inset 0 0 0 3px ${style.color}`,
      };
    }
  }

  const rows = groupMoves(moves);
  const counts = tally(grades);

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
          <p className="text-sm text-[var(--muted)]">
            Review · every move graded by Stockfish
          </p>
        </div>
        <ModeTabs repertoireId={repertoireId} active="review" />
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="flex flex-col items-center gap-3">
          <div className="relative w-full max-w-[600px]">
            <div className="overflow-hidden rounded-xl border border-[var(--line)] shadow-[0_10px_40px_-20px_rgba(0,0,0,0.9)]">
              <Chessboard
                options={{
                  id: "review-board",
                  position: positions[at] || positions[0] || "",
                  boardOrientation: side,
                  squareStyles,
                  animationDurationInMs: 200,
                  lightSquareStyle: LIGHT_SQUARE,
                  darkSquareStyle: DARK_SQUARE,
                }}
              />
            </div>

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
          </div>

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
                        active={at === row.white.ply}
                        onClick={() => goTo(row.white.ply)}
                      />
                      {black ? (
                        <MoveChip
                          san={black.san}
                          label={grades[black.index]}
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

          <p className="px-1 text-[11px] leading-relaxed text-[var(--muted)]">
            Grading compares the move played against the engine&apos;s first choice.
            &quot;Brilliant&quot; needs the best move <em>and</em> a sacrifice;
            &quot;Great&quot; needs the best move to be clearly ahead of the second
            choice. Use ← / → to walk the line.
          </p>
        </aside>
      </div>
    </main>
  );
}

function MoveChip({
  san,
  label,
  active,
  onClick,
}: {
  san: string;
  label: MoveLabel | null | undefined;
  active: boolean;
  onClick: () => void;
}) {
  const style = label ? LABEL_STYLES[label] : null;

  return (
    <button
      onClick={onClick}
      className={[
        "flex w-16 items-center justify-between rounded px-1.5 py-0.5 text-left transition-colors",
        active ? "bg-[var(--line)]" : "hover:bg-[var(--panel-2)]",
      ].join(" ")}
    >
      <span>{san}</span>
      {style ? (
        <span
          className="ml-1 rounded px-1 text-[10px] leading-4"
          style={{ background: style.color, color: style.text }}
        >
          {style.glyph || "·"}
        </span>
      ) : null}
    </button>
  );
}

function startFenOf(): string {
  // The position before the first move: replay backwards is impossible, but the
  // starting position is the only case this component ever reviews from.
  return "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
}

function groupMoves(moves: ReviewMove[]) {
  const rows: {
    number: number;
    white: { san: string; ply: number; index: number };
    black?: { san: string; ply: number; index: number };
  }[] = [];

  moves.forEach((move, index) => {
    const number = Math.floor(index / 2) + 1;
    if (index % 2 === 0) {
      rows.push({
        number,
        white: { san: move.san, ply: move.ply, index },
      });
    } else {
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
