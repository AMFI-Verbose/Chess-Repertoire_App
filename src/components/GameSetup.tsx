"use client";

import { useState } from "react";
import { Chess } from "chess.js";

import {
  ENGINE_LEVELS,
  TIME_CONTROLS,
  levelByNumber,
  timeControlById,
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

/** One-click pairings — the Lichess "quick pairing" grid. */
const QUICK = ["1+0", "3+0", "3+2", "5+3", "10+0", "unlimited"] as const;

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

  const levelInfo = levelByNumber(level);
  const control = timeControlById(tcId);

  function start(overrides?: Partial<StartConfig>) {
    const config: StartConfig = {
      level,
      tcId,
      colour,
      mode,
      fen: null,
      ...overrides,
    };

    if (config.mode === "custom") {
      const trimmed = fenInput.trim();
      if (!trimmed) {
        setError("Paste a FEN to start from a position.");
        return;
      }
      try {
        // chess.js rejects anything it cannot play, including wrong kings, so
        // the board can never open in an illegal position.
        config.fen = new Chess(trimmed).fen();
      } catch {
        setError("That FEN is not a legal position chess.js can play.");
        return;
      }
    }

    setError(null);
    onStart(config);
  }

  const summary = [
    `Level ${levelInfo.level} · ${levelInfo.name}`,
    control.initial === null ? "no clock" : `${control.label} ${control.category}`,
    colour === "random" ? "random colour" : colour,
  ].join(" · ");

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      {/* --- quick pairing: one click, straight into a game --------------- */}
      <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[11px] font-medium uppercase tracking-wider text-[var(--muted)]">
            Quick pairing
          </h2>
          <span className="text-[11px] text-[var(--muted)]">
            Level {levelInfo.level} · {levelInfo.name} · random colour
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {QUICK.map((id) => {
            const entry = timeControlById(id);
            return (
              <button
                key={id}
                onClick={() =>
                  start({ level, tcId: id, colour: "random", mode: "standard" })
                }
                disabled={busy}
                className="flex flex-col items-center rounded-lg border border-[var(--line)] px-2 py-2.5 transition hover:border-[var(--accent)] hover:bg-[var(--panel-2)] disabled:opacity-40"
              >
                <span className="font-mono text-sm">
                  {entry.initial === null ? "∞" : entry.label}
                </span>
                <span className="mt-0.5 text-[10px] uppercase tracking-wide text-[var(--muted)]">
                  {entry.category}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* --- custom game: every option, start button in the header -------- */}
      <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-[11px] font-medium uppercase tracking-wider text-[var(--muted)]">
              Custom game
            </h2>
            <p className="mt-0.5 truncate text-sm">{summary}</p>
          </div>
          <button
            onClick={() => start()}
            disabled={busy}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[#0b1602] transition hover:brightness-110 disabled:opacity-50"
          >
            Start game →
          </button>
        </header>

        <div className="grid gap-5 p-4 sm:grid-cols-2">
          {/* opponent */}
          <div>
            <h3 className="mb-2 text-[11px] uppercase tracking-wider text-[var(--muted)]">
              Opponent
            </h3>
            <div className="grid grid-cols-2 gap-1.5">
              {ENGINE_LEVELS.map((entry) => {
                const active = entry.level === level;
                return (
                  <button
                    key={entry.level}
                    onClick={() => setLevel(entry.level)}
                    className="flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-left transition"
                    style={{
                      borderColor: active ? "var(--accent)" : "var(--line)",
                      background: active ? "var(--panel-2)" : "transparent",
                    }}
                  >
                    <span className="text-xs font-medium">{entry.name}</span>
                    <span className="font-mono text-[10px] text-[var(--muted)]">
                      L{entry.level} · {entry.rating}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-[var(--muted)]">
              {levelInfo.blurb} Ratings are rough, not measurements.
            </p>
          </div>

          <div className="flex flex-col gap-4">
            {/* clock */}
            <div>
              <h3 className="mb-2 text-[11px] uppercase tracking-wider text-[var(--muted)]">
                Time control
              </h3>
              <div className="flex flex-col gap-1.5">
                {CATEGORIES.map((category) => {
                  const entries = TIME_CONTROLS.filter(
                    (entry: TimeControl) => entry.category === category,
                  );
                  if (entries.length === 0) return null;
                  return (
                    <div key={category} className="flex items-center gap-2">
                      <span className="w-16 shrink-0 text-[10px] text-[var(--muted)]">
                        {category}
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {entries.map((entry) => {
                          const active = entry.id === tcId;
                          return (
                            <button
                              key={entry.id}
                              onClick={() => setTcId(entry.id)}
                              className="rounded-md border px-2 py-1 font-mono text-[11px] transition"
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
                  );
                })}
              </div>
            </div>

            {/* colour */}
            <div>
              <h3 className="mb-2 text-[11px] uppercase tracking-wider text-[var(--muted)]">
                You play
              </h3>
              <div className="grid grid-cols-3 gap-1.5">
                {(["white", "random", "black"] as const).map((option) => {
                  const active = colour === option;
                  return (
                    <button
                      key={option}
                      onClick={() => setColour(option)}
                      className="rounded-lg border px-2 py-1.5 text-xs capitalize transition"
                      style={{
                        borderColor: active ? "var(--accent)" : "var(--line)",
                        background: active ? "var(--panel-2)" : "transparent",
                        color: active ? "var(--text)" : "var(--muted)",
                      }}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* start position */}
            <div>
              <h3 className="mb-2 text-[11px] uppercase tracking-wider text-[var(--muted)]">
                Start position
              </h3>
              <div className="grid grid-cols-2 gap-1.5">
                {(["standard", "custom"] as const).map((option) => {
                  const active = mode === option;
                  return (
                    <button
                      key={option}
                      onClick={() => {
                        setMode(option);
                        setError(null);
                      }}
                      className="rounded-lg border px-2 py-1.5 text-xs transition"
                      style={{
                        borderColor: active ? "var(--accent)" : "var(--line)",
                        background: active ? "var(--panel-2)" : "transparent",
                        color: active ? "var(--text)" : "var(--muted)",
                      }}
                    >
                      {option === "standard" ? "Standard" : "From a FEN"}
                    </button>
                  );
                })}
              </div>
              {mode === "custom" && (
                <textarea
                  value={fenInput}
                  onChange={(event) => setFenInput(event.target.value)}
                  rows={2}
                  spellCheck={false}
                  placeholder="8/8/8/4k3/8/8/4P3/4K3 w - - 0 1"
                  className="mt-1.5 w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5 font-mono text-[11px] outline-none focus:border-[var(--accent)]"
                />
              )}
            </div>
          </div>
        </div>

        {error && <p className="px-4 pb-3 text-xs text-[#e0564b]">{error}</p>}
      </section>
    </div>
  );
}
