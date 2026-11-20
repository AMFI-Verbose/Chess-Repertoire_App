"use client";

import { useState } from "react";
import { Chess } from "chess.js";

import {
  ENGINE_LEVELS,
  TIME_CONTROLS,
  levelByNumber,
  timeControlById,
  type GameMode,
} from "@/lib/gameOptions";

export type StartConfig = {
  level: number;
  tcId: string;
  colour: "white" | "black" | "random";
  mode: GameMode;
  fen: string | null;
};

const QUICK = ["1+0", "3+0", "3+2", "5+3", "10+0", "unlimited"] as const;
const GROUPS = ["Bullet", "Blitz", "Rapid", "Classical"] as const;

export default function GameSetup({
  onStart,
  defaultLevel = 4,
}: {
  onStart: (config: StartConfig) => void;
  defaultLevel?: number;
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
        // chess.js rejects anything it cannot play — including a position with
        // no king — so the board can never open from an illegal position.
        config.fen = new Chess(trimmed).fen();
      } catch {
        setError("That FEN is not a legal position chess.js can play.");
        return;
      }
    }

    setError(null);
    onStart(config);
  }

  return (
    <div className="flex w-full flex-col gap-4">
      {/* One-click pairings: the Lichess shortcut, kept visually separate so
          nobody has to scroll through options to get a game going. */}
      <section>
        <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-[var(--muted)]">
          Quick pairing · one click starts
        </h2>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {QUICK.map((id) => {
            const tc = timeControlById(id);
            return (
              <button
                key={id}
                onClick={() =>
                  start({ tcId: id, colour: "random", mode: "standard", fen: null })
                }
                className="flex flex-col items-center gap-0.5 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-2 py-3 transition hover:border-[var(--accent)] hover:bg-[var(--panel-2)]"
              >
                <span className="font-mono text-base">
                  {tc.initial === null ? "∞" : tc.label.replace(/ /g, "")}
                </span>
                <span className="text-[10px] uppercase tracking-wide text-[var(--muted)]">
                  {tc.category}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-[var(--muted)]">
          Starts instantly as Club (L4, ≈1600) with a random colour. Want a
          different opponent or clock? Use the form below.
        </p>
      </section>

      {/* The custom game form: every option on one screen, one primary button. */}
      <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <div className="border-b border-[var(--line)] px-5 py-3">
          <h2 className="text-sm font-medium">New game</h2>
          <p className="mt-0.5 text-[11px] text-[var(--muted)]">
            {levelInfo.name} · {levelInfo.rating} Elo ·{" "}
            {control.initial === null ? "no clock" : `${control.label} ${control.category}`} ·{" "}
            {colour === "random" ? "random colour" : colour}
            {mode === "custom" ? " · from a position" : ""}
          </p>
        </div>

        <div className="flex flex-col gap-5 px-5 py-4">
          <Row label="Opponent">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {ENGINE_LEVELS.map((entry) => {
                const active = entry.level === level;
                return (
                  <button
                    key={entry.level}
                    onClick={() => setLevel(entry.level)}
                    className="rounded-lg border px-2.5 py-2 text-left transition"
                    style={{
                      borderColor: active ? "var(--accent)" : "var(--line)",
                      background: active ? "var(--panel-2)" : "transparent",
                    }}
                  >
                    <span className="block text-xs font-medium">
                      {entry.name}
                    </span>
                    <span className="mt-0.5 block font-mono text-[10px] text-[var(--muted)]">
                      L{entry.level} · {entry.rating}
                    </span>
                  </button>
                );
              })}
            </div>
          </Row>

          <Row label="Time">
            <div className="flex flex-col gap-2">
              {GROUPS.map((group) => (
                <div key={group} className="flex flex-wrap items-center gap-1.5">
                  <span className="w-16 shrink-0 text-[10px] uppercase tracking-wide text-[var(--muted)]">
                    {group}
                  </span>
                  {TIME_CONTROLS.filter((entry) => entry.category === group).map(
                    (entry) => {
                      const active = entry.id === tcId;
                      return (
                        <button
                          key={entry.id}
                          onClick={() => setTcId(entry.id)}
                          className="rounded-md border px-2.5 py-1 font-mono text-xs transition"
                          style={{
                            borderColor: active ? "var(--accent)" : "var(--line)",
                            background: active ? "var(--panel-2)" : "transparent",
                            color: active ? "var(--text)" : "var(--muted)",
                          }}
                        >
                          {entry.label}
                        </button>
                      );
                    },
                  )}
                </div>
              ))}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="w-16 shrink-0 text-[10px] uppercase tracking-wide text-[var(--muted)]">
                  Untimed
                </span>
                <button
                  onClick={() => setTcId("unlimited")}
                  className="rounded-md border px-2.5 py-1 font-mono text-xs transition"
                  style={{
                    borderColor:
                      tcId === "unlimited" ? "var(--accent)" : "var(--line)",
                    background: tcId === "unlimited" ? "var(--panel-2)" : "transparent",
                    color: tcId === "unlimited" ? "var(--text)" : "var(--muted)",
                  }}
                >
                  no clock
                </button>
              </div>
            </div>
          </Row>

          <Row label="Colour">
            <div className="grid max-w-sm grid-cols-3 gap-2">
              {(["white", "random", "black"] as const).map((option) => {
                const active = colour === option;
                return (
                  <button
                    key={option}
                    onClick={() => setColour(option)}
                    className="rounded-lg border px-2 py-2 text-xs capitalize transition"
                    style={{
                      borderColor: active ? "var(--accent)" : "var(--line)",
                      background: active ? "var(--panel-2)" : "transparent",
                    }}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
          </Row>

          <Row label="Start">
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                {(["standard", "custom"] as const).map((option) => {
                  const active = mode === option;
                  return (
                    <button
                      key={option}
                      onClick={() => {
                        setMode(option);
                        setError(null);
                      }}
                      className="rounded-lg border px-3 py-1.5 text-xs transition"
                      style={{
                        borderColor: active ? "var(--accent)" : "var(--line)",
                        background: active ? "var(--panel-2)" : "transparent",
                        color: active ? "var(--text)" : "var(--muted)",
                      }}
                    >
                      {option === "standard" ? "Standard position" : "From a FEN"}
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
                  className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5 font-mono text-[11px] outline-none focus:border-[var(--accent)]"
                />
              )}
            </div>
          </Row>

          {error && <p className="text-xs text-[#e0564b]">{error}</p>}

          <button
            onClick={() => start()}
            className="w-full rounded-lg bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-[#0b1602] transition hover:brightness-110"
          >
            Start game
          </button>
        </div>
      </section>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2 sm:grid-cols-[64px_minmax(0,1fr)] sm:items-start">
      <span className="pt-1.5 text-[11px] font-medium uppercase tracking-wider text-[var(--muted)]">
        {label}
      </span>
      {children}
    </div>
  );
}
