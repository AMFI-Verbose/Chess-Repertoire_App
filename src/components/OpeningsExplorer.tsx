"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";

import { searchOpenings, type OpeningSummary } from "@/app/actions";
import { DARK_SQUARE, LIGHT_SQUARE } from "@/lib/boardTheme";

const VOLUMES = ["A", "B", "C", "D", "E"] as const;
const START_FEN = new Chess().fen();
const PLAY_MS = 620;

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

type Line = {
  /** Position before every move, plus the final one: fens.length = moves + 1. */
  fens: string[];
  sans: string[];
  ucis: string[];
};

/**
 * Replay a UCI line into every position it passes through, so the board can
 * step forward and back instead of only showing the end of the variation.
 */
function buildLine(movesUci: string): Line {
  const game = new Chess();
  const fens: string[] = [game.fen()];
  const sans: string[] = [];
  const ucis: string[] = [];

  for (const token of movesUci.split(" ")) {
    if (!token) continue;
    try {
      const move = game.move({
        from: token.slice(0, 2),
        to: token.slice(2, 4),
        promotion: token.length > 4 ? token[4] : "q",
      });
      sans.push(move.san);
      ucis.push(`${move.from}${move.to}${move.promotion ?? ""}`);
      fens.push(game.fen());
    } catch {
      break;
    }
  }

  return { fens, sans, ucis };
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
  const { sans } = buildLine(movesUci);
  if (sans.length === 0) return "";
  const head = toPgnText(sans.slice(0, max));
  return sans.length > max ? `${head} …` : head;
}

/** The squares a UCI move touches, for the "you are here" highlight. */
function moveStyles(ucis: string[], step: number) {
  if (step === 0 || ucis.length === 0) return undefined;
  const last = ucis[step - 1];
  if (!last) return undefined;
  const from = last.slice(0, 2);
  const to = last.slice(2, 4);
  return {
    [from]: { background: "rgba(155, 199, 0, 0.28)" },
    [to]: {
      background: "rgba(155, 199, 0, 0.45)",
      boxShadow: "inset 0 0 0 2px rgba(155,199,0,0.9)",
    },
  };
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
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [flipped, setFlipped] = useState(false);

  const tokenRef = useRef(0);
  const autoplay = useRef(false);

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
        autoplay.current = false;
        setResults(rows);
        setSelected(rows[0] ?? null);
      } finally {
        if (tokenRef.current === requestId) setLoading(false);
      }
    }, 220);

    return () => clearTimeout(timer);
  }, [text, volume]);

  const line = useMemo(
    () => (selected ? buildLine(selected.movesUci) : null),
    [selected],
  );
  const lastStep = line ? line.fens.length - 1 : 0;

  // A newly picked line always starts at move one and plays itself in: that is
  // the "watch it" behaviour, and pressing pause stops it where it stands.
  useEffect(() => {
    setStep(0);
    setPlaying(Boolean(line && line.sans.length > 0 && autoplay.current));
  }, [line]);

  useEffect(() => {
    if (!playing) return;
    if (step >= lastStep) {
      setPlaying(false);
      return;
    }
    const timer = setTimeout(() => setStep((value) => value + 1), PLAY_MS);
    return () => clearTimeout(timer);
  }, [playing, step, lastStep]);

  const go = useCallback(
    (next: number) => {
      setPlaying(false);
      setStep(Math.min(Math.max(next, 0), lastStep));
    },
    [lastStep],
  );

  // Arrow keys walk the line whenever this page is the active tab and the user
  // is not typing in the search box.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (event.key === "ArrowRight") {
        event.preventDefault();
        setPlaying(false);
        setStep((value) => Math.min(value + 1, lastStep));
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        setPlaying(false);
        setStep((value) => Math.max(value - 1, 0));
      } else if (event.key === "Home") {
        event.preventDefault();
        setPlaying(false);
        setStep(0);
      } else if (event.key === "End") {
        event.preventDefault();
        setPlaying(false);
        setStep(lastStep);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lastStep]);

  const pgn = line ? toPgnText(line.sans) : "";

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

  /** Picking a line always restarts it: clicking the active row replays it. */
  function selectLine(row: OpeningSummary) {
    autoplay.current = true;
    if (selected && selected.movesUci === row.movesUci && selected.eco === row.eco) {
      setStep(0);
      setPlaying(true);
      return;
    }
    setSelected(row);
  }

  function randomOpening() {
    const pool = results.length > 0 ? results : initial;
    if (pool.length === 0) return;
    selectLine(pool[Math.floor(Math.random() * pool.length)]);
  }

  const styles = line ? moveStyles(line.ucis, step) : undefined;

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
        <Link
          href="/learn"
          className="rounded-lg border border-[var(--line)] px-3 py-2 text-xs transition hover:border-[var(--accent)]"
        >
          New to openings? Learn them →
        </Link>
      </header>

      <div className="mb-5 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[240px] flex-1">
            <input
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Search: “Najdorf”, “B90”, “Sicilian dragon”, or “1.e4 c5”"
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
          Every word has to match the name, so “sicilian najdorf” finds the
          Najdorf and nothing else. A move sequence matches lines that start with
          those moves, and pulls in transpositions. A–E are the ECO volumes.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_380px]">
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

          <div className="max-h-[62vh] overflow-y-auto">
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
                        onClick={() => selectLine(row)}
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
          {selected && line ? (
            <>
              <div className="overflow-hidden rounded-xl border border-[var(--line)]">
                <Chessboard
                  options={{
                    id: "openings-board",
                    position: line.fens[step] ?? START_FEN,
                    boardOrientation: flipped ? "black" : "white",
                    squareStyles: styles,
                    lightSquareStyle: LIGHT_SQUARE,
                    darkSquareStyle: DARK_SQUARE,
                    animationDurationInMs: 320,
                  }}
                />
              </div>

              <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1">
                    <StepButton
                      label="⏮"
                      title="Back to the start"
                      onClick={() => go(0)}
                      disabled={step === 0}
                    />
                    <StepButton
                      label="◀"
                      title="Previous move"
                      onClick={() => go(step - 1)}
                      disabled={step === 0}
                    />
                    <button
                      onClick={() => {
                        if (step >= lastStep) setStep(0);
                        setPlaying((value) => !value);
                      }}
                      title={playing ? "Pause" : "Play the line"}
                      className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm transition hover:border-[var(--accent)]"
                    >
                      {playing ? "❚❚" : "▶"}
                    </button>
                    <StepButton
                      label="▶"
                      title="Next move"
                      onClick={() => go(step + 1)}
                      disabled={step >= lastStep}
                    />
                    <StepButton
                      label="⏭"
                      title="Jump to the final position"
                      onClick={() => go(lastStep)}
                      disabled={step >= lastStep}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-[var(--muted)]">
                      {step}/{lastStep}
                    </span>
                    <button
                      onClick={() => setFlipped((value) => !value)}
                      title="Flip the board"
                      className="rounded-md border border-[var(--line)] px-2 py-1 text-[11px] text-[var(--muted)] transition hover:text-[var(--text)]"
                    >
                      ⇅
                    </button>
                    <button
                      onClick={randomOpening}
                      title="Pick a random line from the results"
                      className="rounded-md border border-[var(--line)] px-2 py-1 text-[11px] text-[var(--muted)] transition hover:text-[var(--text)]"
                    >
                      Random
                    </button>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-baseline gap-x-1 gap-y-1 font-mono text-xs leading-relaxed">
                  {line.sans.map((san, index) => {
                    const whitesTurn = index % 2 === 0;
                    const here = step === index + 1;
                    return (
                      <span key={`${san}-${index}`} className="flex items-baseline gap-1">
                        {whitesTurn && (
                          <span className="text-[var(--muted)]">
                            {index / 2 + 1}.
                          </span>
                        )}
                        <button
                          onClick={() => go(index + 1)}
                          className={[
                            "rounded px-1 transition-colors",
                            here
                              ? "bg-[var(--accent)]/25 text-[var(--text)]"
                              : "text-[var(--muted)] hover:text-[var(--text)]",
                          ].join(" ")}
                        >
                          {san}
                        </button>
                      </span>
                    );
                  })}

                </div>

                <p className="mt-2 text-[11px] text-[var(--muted)]">
                  ← → arrows, or click a move to jump · ▶ watches the whole line
                </p>
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

                <p className="mt-2 font-mono text-[11px] leading-relaxed text-[var(--muted)]">
                  {pgn}
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-3">
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
              Pick a line to watch it move by move.
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}

function StepButton({
  label,
  title,
  onClick,
  disabled,
}: {
  label: string;
  title: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className="rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-sm transition enabled:hover:border-[var(--accent)] disabled:opacity-35"
    >
      {label}
    </button>
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
