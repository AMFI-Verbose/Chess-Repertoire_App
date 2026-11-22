"use client";

import { useEffect, useState } from "react";
import { Chess } from "chess.js";

import {
  ENGINE_LEVELS,
  TIME_CONTROLS,
  levelByNumber,
  timeControlById,
  type GameMode,
} from "@/lib/gameOptions";
import { BOTS, DEFAULT_BOT, botById } from "@/lib/bots";

/** Two kinds of opponent, chosen in two separate panels. */
export type OpponentKind = "stockfish" | "character";

export type StartConfig = {
  opponent: OpponentKind;
  /** Engine ladder level — used when opponent is "stockfish". */
  level: number;
  /** Character id — used when opponent is "character". */
  botId: string;
  tcId: string;
  colour: "white" | "black" | "random";
  mode: GameMode;
  fen: string | null;
};

const QUICK = ["1+0", "2+1", "3+0", "3+2", "5+0", "5+3", "10+0", "10+5", "15+10", "30+0", "30+20"] as const;
const GROUPS = ["Bullet", "Blitz", "Rapid", "Classical"] as const;

export default function GameSetup({
  onStart,
  defaultLevel = 4,
  initial,
}: {
  onStart: (config: StartConfig) => void;
  defaultLevel?: number;
  /** What you played last — "New game" reopens with the same opponent and clock. */
  initial?: {
    opponent: OpponentKind;
    level: number;
    botId: string;
    tcId: string;
    colour: StartConfig["colour"];
  } | null;
}) {
  const [opponent, setOpponent] = useState<OpponentKind>(
    initial?.opponent ?? "stockfish",
  );
  const [level, setLevel] = useState(initial?.level ?? defaultLevel);
  const [botId, setBotId] = useState(initial?.botId || DEFAULT_BOT.id);
  const [tcId, setTcId] = useState(initial?.tcId ?? "5+3");
  const [colour, setColour] = useState<StartConfig["colour"]>(
    initial?.colour ?? "white",
  );
  const [mode, setMode] = useState<GameMode>("standard");
  const [fenInput, setFenInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  // The last choice survives a reload: you come back to the opponent you were
  // playing, not to whatever the file happened to default to. A rematch passes
  // `initial` explicitly and wins over anything stored.
  useEffect(() => {
    if (initial) return;
    try {
      const raw = window.localStorage.getItem("play-settings");
      if (!raw) return;
      const saved = JSON.parse(raw) as Record<string, unknown>;
      if (saved.opponent === "stockfish" || saved.opponent === "character") {
        setOpponent(saved.opponent);
      }
      if (
        typeof saved.level === "number" &&
        ENGINE_LEVELS.some((entry) => entry.level === saved.level)
      ) {
        setLevel(saved.level as number);
      }
      if (typeof saved.botId === "string" && BOTS.some((b) => b.id === saved.botId)) {
        setBotId(saved.botId as string);
      }
      if (
        typeof saved.tcId === "string" &&
        TIME_CONTROLS.some((t) => t.id === saved.tcId)
      ) {
        setTcId(saved.tcId as string);
      }
      if (
        saved.colour === "white" ||
        saved.colour === "black" ||
        saved.colour === "random"
      ) {
        setColour(saved.colour);
      }
    } catch {
      // Storage can be off or full; defaults are fine.
    }
  }, [initial]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        "play-settings",
        JSON.stringify({ opponent, level, botId, tcId, colour }),
      );
    } catch {
      // Ignore — this is a convenience, not state we rely on.
    }
  }, [opponent, level, botId, tcId, colour]);

  const bot = botById(botId);
  const engine = levelByNumber(level);
  const control = timeControlById(tcId);

  const who =
    opponent === "stockfish"
      ? `Stockfish · ${engine.name} (level ${engine.level}) · ≈${engine.rating}`
      : `${bot.name} · ≈${bot.rating} · ${bot.style}`;

  function start(overrides?: Partial<StartConfig>) {
    const config: StartConfig = {
      opponent,
      level: opponent === "stockfish" ? level : bot.level,
      botId: opponent === "character" ? bot.id : "",
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
        <div className="grid grid-cols-3 gap-2">
          {QUICK.map((id) => {
            const tc = timeControlById(id);
            return (
              <button
                key={id}
                onClick={() =>
                  start({ tcId: id, colour: "random", mode: "standard", fen: null })
                }
                className="flex flex-col items-center gap-0.5 rounded-sm border border-[var(--line)] bg-[var(--panel)] px-2 py-3 transition hover:border-[var(--accent)] hover:bg-[var(--panel-2)]"
              >
                <span className="font-mono text-[17px] leading-tight">
                  {tc.label.replace(/ /g, "")}
                </span>
                <span className="text-[10px] uppercase tracking-wide text-[var(--muted)]">
                  {tc.category}
                </span>
              </button>
            );
          })}
          <button
            onClick={() =>
              document.getElementById("time-controls")?.scrollIntoView({ block: "center" })
            }
            className="flex flex-col items-center gap-0.5 rounded-sm border border-[var(--line)] bg-[var(--panel)] px-2 py-3 transition hover:border-[var(--accent)] hover:bg-[var(--panel-2)]"
          >
            <span className="font-mono text-[17px] leading-tight">—</span>
            <span className="text-[10px] uppercase tracking-wide text-[var(--muted)]">Custom</span>
          </button>
        </div>
        <p className="mt-2 text-[11px] text-[var(--muted)]">
          Starts instantly against {who} with a random colour. Pick another
          opponent below whenever you want.
        </p>
      </section>

      {/* Opponent, part one: the plain engine ladder. */}
      <section
        className="rounded-xl border bg-[var(--panel)] transition"
        style={{ borderColor: opponent === "stockfish" ? "var(--accent)" : "var(--line)" }}
      >
        <div className="flex items-baseline justify-between gap-3 border-b border-[var(--line)] px-5 py-3">
          <div>
            <h2 className="text-sm font-medium">Play Stockfish</h2>
            <p className="mt-0.5 text-[11px] text-[var(--muted)]">
              The bare engine — no personality, no chat. Pick how hard it plays.
            </p>
          </div>
          <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-[var(--muted)]">
            Engine
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 px-5 py-4 sm:grid-cols-4">
          {ENGINE_LEVELS.map((entry) => {
            const active = opponent === "stockfish" && entry.level === level;
            return (
              <button
                key={entry.level}
                onClick={() => {
                  setOpponent("stockfish");
                  setLevel(entry.level);
                }}
                title={`${entry.blurb} — Skill Level ${entry.skill}, thinks ${entry.movetime} ms`}
                className="flex flex-col items-center gap-1 rounded-lg border px-2 py-2.5 transition"
                style={{
                  borderColor: active ? "var(--accent)" : "var(--line)",
                  background: active ? "var(--panel-2)" : "transparent",
                }}
              >
                <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--muted)]">
                  Lv {entry.level}
                </span>
                <span className="w-full truncate text-center text-[12px] font-medium">
                  {entry.name}
                </span>
                <span className="w-full truncate text-center font-mono text-[10px] text-[var(--muted)]">
                  ≈{entry.rating}
                </span>
              </button>
            );
          })}
        </div>
        <p className="px-5 pb-3 text-[11px] leading-relaxed text-[var(--muted)]">
          {engine.blurb}
        </p>
      </section>

      {/* Opponent, part two: the characters, with faces and opinions. */}
      <section
        id="characters"
        className="scroll-mt-20 rounded-xl border bg-[var(--panel)] transition"
        style={{ borderColor: opponent === "character" ? "var(--accent)" : "var(--line)" }}
      >
        <div className="flex items-baseline justify-between gap-3 border-b border-[var(--line)] px-5 py-3">
          <div>
            <h2 className="text-sm font-medium">Play a character</h2>
            <p className="mt-0.5 text-[11px] text-[var(--muted)]">
              Eight opponents with faces, moods and a chat box. Same engine
              underneath, handicapped down to their rating.
            </p>
          </div>
          <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-[var(--muted)]">
            Characters
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 px-5 py-4 sm:grid-cols-4">
          {BOTS.map((entry) => {
            const active = opponent === "character" && entry.id === botId;
            return (
              <button
                key={entry.id}
                onClick={() => {
                  setOpponent("character");
                  setBotId(entry.id);
                }}
                className="flex flex-col items-center gap-1 rounded-lg border px-1.5 py-2 transition"
                style={{
                  borderColor: active ? "var(--accent)" : "var(--line)",
                  background: active ? "var(--panel-2)" : "transparent",
                }}
                title={`${entry.title} — ${entry.blurb}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={entry.avatar}
                  alt={entry.name}
                  className="h-11 w-11 rounded-full object-cover"
                  style={{
                    boxShadow: active
                      ? `0 0 0 2px ${entry.accent}`
                      : "0 0 0 1px var(--line)",
                  }}
                />
                <span className="w-full truncate text-center text-[11px] font-medium">
                  {entry.name}
                </span>
                <span className="w-full truncate text-center font-mono text-[10px] text-[var(--muted)]">
                  ≈{entry.rating}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* The custom game form: every option on one screen, one primary button. */}
      <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <div className="border-b border-[var(--line)] px-5 py-3">
          <h2 className="text-sm font-medium">New game</h2>
          <p className="mt-0.5 text-[11px] text-[var(--muted)]">
            {who} · {control.initial === null ? "no clock" : `${control.label} ${control.category}`} ·{" "}
            {colour === "random" ? "random colour" : colour}
            {mode === "custom" ? " · from a position" : ""}
          </p>
        </div>

        <div className="flex flex-col gap-5 px-5 py-4">
          <Row label="Time" id="time-controls">
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

function Row({
  label,
  id,
  children,
}: {
  label: string;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <div id={id} className="grid gap-2 sm:grid-cols-[64px_minmax(0,1fr)] sm:items-start">
      <span className="pt-1.5 text-[11px] font-medium uppercase tracking-wider text-[var(--muted)]">
        {label}
      </span>
      {children}
    </div>
  );
}
