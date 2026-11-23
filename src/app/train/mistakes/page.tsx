import Link from "next/link";

import MistakeTrainer from "@/components/MistakeTrainer";
import { pgnHeader } from "@/lib/chess";
import {
  backfillMistakes,
  mistakeStats,
  nextMistake,
} from "@/lib/mistakes";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const metadata = { title: "Mistake trainer · Chess Repertoire" };

function formatWhen(iso: string | null) {
  if (!iso) return "soon";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export default async function MistakesPage({
  searchParams,
}: {
  searchParams: Promise<{ game?: string; ahead?: string }>;
}) {
  const { game: gameParam, ahead: aheadParam } = await searchParams;
  const gameId = gameParam?.trim() || undefined;
  const ahead = aheadParam === "1";

  if (!gameId) await backfillMistakes(30);

  const [stats, card, game] = await Promise.all([
    mistakeStats(gameId),
    nextMistake(undefined, gameId, ahead),
    gameId
      ? prisma.game.findUnique({ where: { id: gameId }, select: { pgn: true } })
      : Promise.resolve(null),
  ]);

  const scope = game
    ? `${pgnHeader(game.pgn, "White") || "White"} vs ${pgnHeader(game.pgn, "Black") || "Black"}`
    : null;

  return (
    <main className="mx-auto w-full max-w-6xl 2xl:max-w-[1440px] px-6 py-10">
      <header className="mb-6">
        <Link
          href="/train"
          className="text-xs text-[var(--muted)] transition hover:text-[var(--text)]"
        >
          ← Repertoire training
        </Link>
        <p className="mt-4 text-[11px] uppercase tracking-[0.2em] text-[var(--accent)]">
          your own games
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Mistake trainer</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">
          Every move the review marked as a mistake or blunder becomes one position.
          Find the move the engine wanted, and the card comes back later —
          {scope ? " this session is only from the game below." : " spaced across your whole game history."}
        </p>
        {scope && (
          <p className="mt-2 text-[11px] text-[var(--muted)]">
            Scope: <span className="text-[var(--text)]">{scope}</span> ·{" "}
            <Link href="/train/mistakes" className="underline decoration-dotted">
              all games
            </Link>
          </p>
        )}
      </header>

      {card ? (
        <MistakeTrainer
          initial={card}
          initialStats={stats}
          gameId={gameId}
          ignoreDue={ahead}
          key={card.id}
        />
      ) : stats.total === 0 ? (
        <section className="rounded-xl border border-dashed border-[var(--line)] bg-[var(--panel)] px-6 py-10 text-center">
          <p className="text-sm font-medium">No mistake cards yet.</p>
          <p className="mx-auto mt-2 max-w-md text-[12px] leading-relaxed text-[var(--muted)]">
            Open a reviewed game and let the engine finish its pass. Every mistake or
            blunder on your side becomes a card automatically. Imported games work too.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Link
              href="/games"
              className="rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-[#0b1602]"
            >
              Review a game →
            </Link>
            <Link
              href="/import"
              className="rounded-lg border border-[var(--line)] px-3 py-2 text-xs text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--text)]"
            >
              Import from Lichess or chess.com
            </Link>
          </div>
        </section>
      ) : (
        <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-6 py-8">
          <p className="text-sm font-medium">Nothing is due right now.</p>
          <p className="mt-1 text-[12px] text-[var(--muted)]">
            {stats.total} card{stats.total === 1 ? "" : "s"} in the deck ·{" "}
            {stats.mastered} mastered · next review {formatWhen(stats.nextDueAt)}.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={`/train/mistakes?ahead=1${gameId ? `&game=${gameId}` : ""}`}
              className="rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-[#0b1602]"
            >
              Practise ahead →
            </Link>
            <Link
              href="/train"
              className="rounded-lg border border-[var(--line)] px-3 py-2 text-xs text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--text)]"
            >
              Back to repertoire training
            </Link>
          </div>
        </section>
      )}
    </main>
  );
}
