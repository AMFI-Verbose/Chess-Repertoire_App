"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { importGame } from "@/app/actions";
import {
  importChessComGames,
  importLichessGames,
  type PlatformImportResult,
} from "@/app/import/actions";

const SAMPLE = `[Event "Paris"]
[Site "Paris FRA"]
[Date "1858.??.??"]
[White "Morphy, Paul"]
[Black "Duke Karl / Count Isouard"]
[Result "1-0"]

1.e4 e5 2.Nf3 d6 3.d4 Bg4 4.dxe5 Bxf3 5.Qxf3 dxe5 6.Bc4 Nf6 7.Qb3 Qe7
8.Nc3 c6 9.Bg5 b5 10.Nxb5 cxb5 11.Bxb5+ Nbd7 12.O-O-O Rd8 13.Rxd7 Rxd7
14.Rd1 Qe6 15.Bxd7+ Nxd7 16.Qb8+ Nxb8 17.Rd8# 1-0`;

type Mode = "lichess" | "chess.com" | "pgn";

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: "lichess", label: "Lichess", hint: "Public games, no password" },
  { id: "chess.com", label: "chess.com", hint: "Public monthly archives" },
  { id: "pgn", label: "Paste PGN", hint: "One game from anywhere" },
];

export default function ImportForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("lichess");
  const [username, setUsername] = useState("");
  const [limit, setLimit] = useState(20);
  const [pgn, setPgn] = useState("");
  const [as, setAs] = useState<"white" | "black">("white");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PlatformImportResult | null>(null);
  const [pending, startTransition] = useTransition();

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setResult(null);
  }

  function importPlatform() {
    setError(null);
    setResult(null);
    startTransition(async () => {
      try {
        const next =
          mode === "lichess"
            ? await importLichessGames(username, limit)
            : await importChessComGames(username, limit);
        setResult(next);
        router.refresh();
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message.replace(/^Error: /, "")
            : "That account could not be imported.",
        );
      }
    });
  }

  function submitPgn() {
    setError(null);
    setResult(null);
    startTransition(async () => {
      try {
        const { id } = await importGame({ pgn, as });
        router.push(`/games/${id}`);
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message.replace(/^Error: /, "")
            : "That PGN could not be imported.",
        );
      }
    });
  }

  const active = MODES.find((entry) => entry.id === mode) ?? MODES[0];

  return (
    <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)]">
      <div className="border-b border-[var(--line)] px-5 py-3">
        <h2 className="text-sm font-medium">Bring your games in</h2>
        <p className="mt-0.5 text-[11px] text-[var(--muted)]">
          Pick an account and we copy recent finished games into the same review every
          other game uses. No password, no OAuth.
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {MODES.map((entry) => {
            const selected = mode === entry.id;
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => switchMode(entry.id)}
                className="rounded-lg border px-3 py-2 text-left transition"
                style={{
                  borderColor: selected ? "var(--accent)" : "var(--line)",
                  background: selected ? "var(--panel-2)" : "transparent",
                }}
              >
                <span className="block text-[12px] font-medium">{entry.label}</span>
                <span className="block text-[10px] text-[var(--muted)]">{entry.hint}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-3 px-5 py-4">
        {mode === "pgn" ? (
          <>
            <textarea
              value={pgn}
              onChange={(event) => setPgn(event.target.value)}
              rows={10}
              spellCheck={false}
              placeholder={`[Event "Club game"]\n[White "You"]\n[Black "Opponent"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 …`}
              className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 font-mono text-[12px] leading-relaxed outline-none focus:border-[var(--accent)]"
            />
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
                I was
              </span>
              <div className="flex gap-2">
                {(["white", "black"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setAs(option)}
                    className="rounded-lg border px-3 py-1.5 text-xs capitalize transition"
                    style={{
                      borderColor: as === option ? "var(--accent)" : "var(--line)",
                      background: as === option ? "var(--panel-2)" : "transparent",
                    }}
                  >
                    {option}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setPgn(SAMPLE)}
                className="ml-auto text-[11px] text-[var(--muted)] underline decoration-dotted hover:text-[var(--text)]"
              >
                use a sample game
              </button>
            </div>
          </>
        ) : (
          <>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
                {active.label} username
              </span>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder={mode === "lichess" ? "e.g. DrNykterstein" : "e.g. Hikaru"}
                autoComplete="off"
                spellCheck={false}
                className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)]"
              />
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
                How many
              </span>
              {[10, 20, 30].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setLimit(value)}
                  className="rounded-lg border px-3 py-1.5 text-xs tabular-nums transition"
                  style={{
                    borderColor: limit === value ? "var(--accent)" : "var(--line)",
                    background: limit === value ? "var(--panel-2)" : "transparent",
                  }}
                >
                  {value}
                </button>
              ))}
            </div>
            <p className="text-[11px] leading-relaxed text-[var(--muted)]">
              {mode === "lichess"
                ? "Lichess exposes finished games publicly, so this works for any account. The newest games come first."
                : "chess.com exposes the last two monthly archives. Only standard chess is imported; variants are skipped."}
            </p>
          </>
        )}

        {error && <p className="text-xs text-[#e0564b]">{error}</p>}

        {result && (
          <div className="rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/5 px-4 py-3">
            <p className="text-sm font-medium">
              {result.imported > 0
                ? `Imported ${result.imported} game${result.imported === 1 ? "" : "s"} from ${result.platform}.`
                : `No new games from ${result.platform}.`}
            </p>
            <p className="mt-1 text-[11px] text-[var(--muted)]">
              {result.detail}
              {result.skipped > 0 ? ` · ${result.skipped} already in the library` : ""}
              {result.failed > 0 ? ` · ${result.failed} could not be read` : ""}
            </p>
            {result.imported > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {result.firstGameId && (
                  <Link
                    href={`/games/${result.firstGameId}`}
                    className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-[#0b1602]"
                  >
                    Review the newest →
                  </Link>
                )}
                <Link
                  href="/games"
                  className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--text)]"
                >
                  All games
                </Link>
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={mode === "pgn" ? submitPgn : importPlatform}
          disabled={pending || (mode === "pgn" ? pgn.trim().length === 0 : username.trim().length < 2)}
          className="rounded-lg bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-[#0b1602] transition hover:brightness-110 disabled:opacity-50"
        >
          {pending
            ? "Importing…"
            : mode === "pgn"
              ? "Import and analyse →"
              : `Import up to ${limit} games →`}
        </button>

        <p className="text-[10.5px] leading-relaxed text-[var(--muted)]">
          Imported games keep their real date and link back to the original. Open one to
          run the engine review; mistakes in your moves become drill cards automatically.
        </p>
      </div>
    </section>
  );
}
