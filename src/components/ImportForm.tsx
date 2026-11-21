"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { importGame } from "@/app/actions";

const SAMPLE = `[Event "Paris"]
[Site "Paris FRA"]
[Date "1858.??.??"]
[White "Morphy, Paul"]
[Black "Duke Karl / Count Isouard"]
[Result "1-0"]

1.e4 e5 2.Nf3 d6 3.d4 Bg4 4.dxe5 Bxf3 5.Qxf3 dxe5 6.Bc4 Nf6 7.Qb3 Qe7
8.Nc3 c6 9.Bg5 b5 10.Nxb5 cxb5 11.Bxb5+ Nbd7 12.O-O-O Rd8 13.Rxd7 Rxd7
14.Rd1 Qe6 15.Bxd7+ Nxd7 16.Qb8+ Nxb8 17.Rd8# 1-0`;

export default function ImportForm() {
  const router = useRouter();
  const [pgn, setPgn] = useState("");
  const [as, setAs] = useState<"white" | "black">("white");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
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

  return (
    <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)]">
      <div className="border-b border-[var(--line)] px-5 py-3">
        <h2 className="text-sm font-medium">Paste a PGN</h2>
        <p className="mt-0.5 text-[11px] text-[var(--muted)]">
          Anything a site exported — tournament PGN, a game from a book, a saved
          study. Headers are optional; the moves are not.
        </p>
      </div>

      <div className="flex flex-col gap-3 px-5 py-4">
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
            onClick={() => setPgn(SAMPLE)}
            className="ml-auto text-[11px] text-[var(--muted)] underline decoration-dotted hover:text-[var(--text)]"
          >
            use a sample game
          </button>
        </div>

        {error && <p className="text-xs text-[#e0564b]">{error}</p>}

        <button
          onClick={submit}
          disabled={pending || pgn.trim().length === 0}
          className="rounded-lg bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-[#0b1602] transition hover:brightness-110 disabled:opacity-50"
        >
          {pending ? "Importing…" : "Import and analyse →"}
        </button>
      </div>
    </section>
  );
}
