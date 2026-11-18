"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";

import { searchOpenings, type OpeningSummary } from "@/app/actions";
import { DARK_SQUARE, LIGHT_SQUARE } from "@/lib/boardTheme";

const VOLUMES = ["A", "B", "C", "D", "E"] as const;

/**
 * Turn free text into a UCI move prefix, but only when it looks like a line.
 *
 *   "1.e4 c5"      → "e2e4 c7c5"
 *   "1. e4 e5 2. Nf" → "e2e4 e7e5 g1f3"   (stops at the first unparsable token)
 *   "Najdorf"      → null                 (not a move sequence)
 *
 * Stopping gracefully is the point: the user is mid-typing, so a half-formed
 * last token must narrow the results, not empty them.
 */
function parseMovePrefix(text: string): string | null {
  if (!/^\d/.test(text.trim())) return null;

  const cleaned = text
    .replace(/\d+\s*(\.\.\.|\.)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;

  const game = new Chess();
  const uci: string[] = [];

  for (const token of cleaned.split(" ")) {
    if (!token) continue;
    try {
      const move = game.move(token);
      uci.push(`${move.from}${move.to}${move.promotion ?? ""}`);
    } catch {
      break;
    }
  }

  return uci.length > 0 ? uci.join(" ") : null;
}

/** Replay a UCI line into a renderable position plus readable SAN moves. */
function replayLine(movesUci: string): { fen: string; sans: string[] } {
  const game = new Chess();
  const sans: string[] = [];

  for (const token of movesUci.split(" ")) {
    if (!token) continue;
    try {
      const move = game.move({
        from: token.slice(0, 2),
        to: token.slice(2, 4),
        promotion: token.length > 4 ? token[4] : "q",
      });
      sans.push(move.san);
    } catch {
      break;
    }
  }

  return { fen: game.fen(), sans };
}

/** "1. e4 e5 2. Nf3 …" — the move text as a human writes it. */
function toPgnText(sans: string[]): string {
  let out = "";
  sans.forEach((san, index) => {
    if (index % 2 === 0) out += `${index / 2 + 1}. `;
    out += `${san} `;
  });
  return out.trim();
}

/** Just the opening moves, for the dense result rows. */
function previewOf(movesUci: string, max = 6): string {
  const { sans } = replayLine(movesUci);
  if (sans.length === 0) return "";
  const head = toPgnText(sans.slice(0, max));
  return sans.length > max ? `${head} …` : head;
}

export default function OpeningsExplorer({
  total,
  initial,
}: {
  total: number;
  initial: OpeningSummary[];
}) {
  const [text, setText] = useState("");
  const [volume, setVolume] = useState<string>("");
  const [results, setResults] = useState<OpeningSummary[]>(initial);
  const [selected, setSelected] = useState<OpeningSummary | null>(
    initial[0] ?? null,
  );
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const tokenRef = useRef(0);

  useEffect(() => {
    const requestId = tokenRef.current + 1;
    tokenRef.current = requestId;
    setLoading(true);

    const timer = setTimeout(async () => {
      const trimmed = text.trim();
      const prefix = trimmed ? parseMovePrefix(trimmed) : null;

      try {
        const rows = await searchOpenings({
          text: prefix ? undefined : trimmed,
          movePrefix: prefix ?? undefined,
          eco: volume || undefined,
          limit: 60,
        });
        if (tokenRef.current !== requestId) return;
        setResults(rows);
        setSelected(rows[0] ?? null);
      } finally {
        if (tokenRef.current === requestId) setLoading(false);
      }
    }, 220);

    return () => clearTimeout(timer);
  }, [text, volume]);

  const detail = useMemo(
    () => (selected ? replayLine(selected.movesUci) : null),
    [selected],
  );
  const pgn = detail ? toPgnText(detail.sans) : "";

  // Only the visible page of results is replayed — 60 lines, ~6 moves each.
  const previews = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of results) map.set(row.movesUci, previewOf(row.movesUci));
    return map;
  }, [results]);

  async function copyLine() {
    if (!selected || !pgn) return;
    await navigator.clipboard.writeText(`${selected.eco} ${selected.name}\n${pgn}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link
            href="/"
            className="text-xs text-[var(--muted)] transition-colors hover:text-[var(--text)]"
          >
            ← Your repertoires
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Opening library
          </h1>
          <p className="text-sm text-[var(--muted)]">
            {total.toLocaleString()} named lines — the full ECO table from Lichess&apos;s
            open dataset
          </p>
        </div>
      </header>

      <div className="mb-5 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[240px] flex-1">
            <input
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Search: “Najdorf”, “B90”, or “1.e4 c5”"
              className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm outline-none transition focus:border-[var(--accent)]"
            />
            {loading && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-[var(--muted)]">
                …
              </span>
            )}
          </div>

          <div className="flex items-center gap-1">
            <FilterChip
              active={volume === ""}
              onClick={() => setVolume("")}
              label="All"
            />
            {VOLUMES.map((letter) => (
              <FilterChip
                key={letter}
                active={volume === letter}
                onClick={() => setVolume(letter)}
                label={letter}
              />
            ))}
          </div>
        </div>
        <p className="mt-2 text-[11px] text-[var(--muted)]">
          Name, ECO code, or a move sequence — a line query matches every opening
          that starts with those moves. A–E are the five ECO volumes.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_320px]">
        <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)]">
          <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-2.5">
            <span className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
              Results
            </span>
            <span className="font-mono text-[11px] text-[var(--muted)]">
              {results.length}
              {results.length === 60 ? "+" : ""}
            </span>
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            {results.length === 0 ? (
              <p className="px-4 py-8 text-center text-xs text-[var(--muted)]">
                Nothing matched. Try a shorter phrase, or a move sequence like
                &nbsp;<span className="font-mono">1.e4</span>.
              </p>
            ) : (
              <ul>
                {results.map((row) => {
                  const isActive =
                    selected?.movesUci === row.movesUci &&
                    selected?.eco === row.eco;
                  return (
                    <li key={`${row.eco}-${row.movesUci}`}>
                      <button
                        onClick={() => setSelected(row)}
                        className={[
                          "flex w-full items-center gap-3 border-b border-[var(--line)]/60 px-4 py-2.5 text-left transition-colors",
                          isActive
                            ? "bg-[var(--accent)]/10"
                            : "hover:bg-[var(--panel-2)]",
                        ].join(" ")}
                      >
                        <span className="w-10 shrink-0 rounded bg-[var(--bg)] px-1.5 py-0.5 text-center font-mono text-[11px] text-[var(--accent)]">
                          {row.eco}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">{row.name}</span>
                          <span className="mt-0.5 block truncate font-mono text-[11px] text-[var(--muted)]">
                            {previews.get(row.movesUci) ?? ""}
                          </span>
                        </span>
                        <span className="shrink-0 font-mono text-[11px] text-[var(--muted)]">
                          {Math.ceil(row.ply / 2)}m
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        <aside className="flex flex-col gap-3">
          {selected && detail ? (
            <>
              <div className="overflow-hidden rounded-xl border border-[var(--line)]">
                <Chessboard
                  options={{
                    id: "openings-board",
                    position: detail.fen,
                    boardOrientation: "white",
                    lightSquareStyle: LIGHT_SQUARE,
                    darkSquareStyle: DARK_SQUARE,
                    animationDurationInMs: 0,
                  }}
                />
              </div>

              <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 rounded bg-[var(--accent)]/15 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-[var(--accent)]">
                    {selected.eco}
                  </span>
                  <h2 className="text-sm font-medium leading-snug">
                    {selected.name}
                  </h2>
                </div>

                <p className="mt-3 font-mono text-xs leading-relaxed text-[var(--muted)]">
                  {pgn}
                </p>

                <div className="mt-3 flex items-center gap-2">
                  <button
                    onClick={copyLine}
                    className="rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-[11px] transition hover:border-[var(--accent)]"
                  >
                    {copied ? "Copied ✓" : "Copy PGN"}
                  </button>
                  <Link
                    href="/"
                    className="text-[11px] text-[var(--muted)] transition-colors hover:text-[var(--text)]"
                  >
                    Build a repertoire from it →
                  </Link>
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-[var(--line)] p-6 text-center text-xs text-[var(--muted)]">
              Pick a line to preview it on the board.
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}

function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
        active
          ? "bg-[var(--accent)] text-[#0b1602]"
          : "border border-[var(--line)] text-[var(--muted)] hover:text-[var(--text)]",
      ].join(" ")}
    >
      {label}
    </button>
  );
}
