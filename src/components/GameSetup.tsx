"use client";

import { useState } from "react";
import { Chess } from "chess.js";

import {
  ENGINE_LEVELS,
  TIME_CONTROLS,
  type GameMode,
  type TimeControl,
} from "@/lib/gameOptions";

export type StartConfig = {
  level: number;
  tcId: string;
  colour: "white" | "black" | "random";
  mode: GameMode;
  fen: string | null;
};

const CATEGORIES = ["Bullet", "Blitz", "Rapid", "Classical", "Untimed"] as const;

export default function GameSetup({
  onStart,
  defaultLevel = 4,
  busy = false,
}: {
  onStart: (config: StartConfig) => void;
  defaultLevel?: number;
  busy?: boolean;
}) {
  const [level, setLevel] = useState(defaultLevel);
  const [tcId, setTcId] = useState("5+3");
  const [colour, setColour] = useState<StartConfig["colour"]>("white");
  const [mode, setMode] = useState<GameMode>("standard");
  const [fenInput, setFenInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  function start() {
    let fen: string | null = null;

    if (mode === "custom") {
      const trimmed = fenInput.trim();
      if (!trimmed) {
        setError("Paste a FEN to start from a position.");
        return;
      }
      try {
        // chess.js rejects anything it cannot play, including two kings in the
        // wrong place — the board must not start from an illegal position.
        fen = new Chess(trimmed).fen();
      } catch {
        setError("That FEN is not a legal position chess.js can play.");
        return;
      }
    }

    setError(null);
    onStart({ level, tcId, colour, mode, fen });
  }

  const grouped = CATEGORIES.map((category) => ({
    category,
    controls: TIME_CONTROLS.filter((entry) => entry.category === category),
  }));

  return (
    <div className="flex w-full max-w-3xl flex-col gap-5">
      <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-[11px] font-medium uppercase tracking-wider text-[var(--muted)]">
            Opponent
          </h2>
          <span className="text-[11px] text-[var(--muted)]">
            Stockfish 19 · 8 levels
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {ENGINE_LEVELS.map((entry) => {
            const active = entry.level === level;
            return (
              <button
                key={entry.level}
                onClick={() => setLevel(entry.level)}
                className={[
                  "rounded-lg border p-2.5 text-left transition",
                  active
                    ? "border-[var(--accent)] bg-[var(--accent)]/10"
                    : "border-[var(--line)] hover:border-[var(--muted)]",
                ].join(" ")}
              >
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-medium">{entry.name}</span>
                  <span className="font-mono text-[10px] text-[var(--muted)]">
                    L{entry.level}
                  </span>
                </div>
                <div className="mt-0.5 font-mono text-[10px] text-[var(--muted)]">
                  ≈{entry.rating} Elo
                </div>
                <div className="mt-1 text-[10px] leading-snug text-[var(--muted)]">
                  {entry.blurb}
                </div>
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-[var(--muted)]">
          Level sets Stockfish&apos;s skill and its thinking time together — the
          way Lichess&apos;s levels do. Ratings are rough, not measurements.
        </p>
      </section>

      <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5">
        <h2 className="mb-3 text-[11px] font-medium uppercase tracking-wider text-[var(--muted)]">
          Time control
        </h2>
        <div className="flex flex-col gap-3">
          {grouped.map((group) => (
            <div key={group.category} className="flex flex-wrap items-center gap-2">
              <span className="w-20 shrink-0 text-[11px] text-[var(--muted)]">
                {group.category}
              </span>
              {group.controls.map((control: TimeControl) => {
                const active = control.id === tcId;
                return (
                  <button
                    key={control.id}
                    onClick={() => setTcId(control.id)}
                    className={[
                      "rounded-lg border px-3 py-1.5 font-mono text-xs transition",
                      active
                        ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--text)]"
                        : "border-[var(--line)] text-[var(--muted)] hover:text-[var(--text)]",
                    ].join(" ")}
                  >
                    {control.label}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-[var(--muted)]">
          Increment is added after each of your moves. Running out of time loses
          the game — the clock runs while Stockfish thinks, too.
        </p>
      </section>

      <div className="grid gap-5 sm:grid-cols-2">
        <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5">
          <h2 className="mb-3 text-[11px] font-medium uppercase tracking-wider text-[var(--muted)]">
            You play
          </h2>
          <div className="grid grid-cols-3 gap-2">
            {(["white", "random", "black"] as const).map((option) => {
              const active = colour === option;
              return (
                <button
                  key={option}
                  onClick={() => setColour(option)}
                  className={[
                    "rounded-lg border px-2 py-2 text-xs capitalize transition",
                    active
                      ? "border-[var(--accent)] bg-[var(--accent)]/10"
                      : "border-[var(--line)] text-[var(--muted)] hover:text-[var(--text)]",
                  ].join(" ")}
                >
                  {option === "random" ? "random" : option}
                </button>
              );
            })}
          </div>
        </section>

        <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5">
          <h2 className="mb-3 text-[11px] font-medium uppercase tracking-wider text-[var(--muted)]">
            Game type
          </h2>
          <div className="grid grid-cols-2 gap-2">
            {(["standard", "custom"] as const).map((option) => {
              const active = mode === option;
              return (
                <button
                  key={option}
                  onClick={() => {
                    setMode(option);
                    setError(null);
                  }}
                  className={[
                    "rounded-lg border px-2 py-2 text-xs transition",
                    active
                      ? "border-[var(--accent)] bg-[var(--accent)]/10"
                      : "border-[var(--line)] text-[var(--muted)] hover:text-[var(--text)]",
                  ].join(" ")}
                >
                  {option === "standard" ? "Standard" : "From a position"}
                </button>
              );
            })}
          </div>

          {mode === "custom" && (
            <textarea
              value={fenInput}
              onChange={(event) => setFenInput(event.target.value)}
              rows={3}
              spellCheck={false}
              placeholder="r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3"
              className="mt-2 w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5 font-mono text-[11px] outline-none focus:border-[var(--accent)]"
            />
          )}
        </section>
      </div>

      {error && <p className="text-xs text-[#e0564b]">{error}</p>}

      <button
        onClick={start}
        disabled={busy}
        className="rounded-lg bg-[var(--accent)] px-4 py-3 text-sm font-medium text-[#0b1602] transition hover:brightness-110 disabled:opacity-50"
      >
        Start game
      </button>
    </div>
  );
}
