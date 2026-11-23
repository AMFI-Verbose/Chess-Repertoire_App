import Link from "next/link";

import LiveTime from "@/components/LiveTime";
import { notFound } from "next/navigation";

import {
  findTournamentGameAction,
  joinTournamentAction,
  leaveTournamentAction,
} from "@/app/tournaments/actions";
import { getViewer } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTournament } from "@/lib/tournaments";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tournament = await getTournament(id);
  return { title: tournament ? `${tournament.name} · Arena` : "Arena" };
}

export default async function TournamentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const tournament = await getTournament(id);
  if (!tournament) notFound();

  const viewer = await getViewer();
  const entry = viewer ? tournament.entries.find((row) => row.userId === viewer.id) : null;
  const [openGames, liveGames] = await Promise.all([
    prisma.duel.findMany({
      where: { tournamentId: id, status: "open" },
      orderBy: { createdAt: "asc" },
      select: { code: true, hostId: true, hostColor: true, host: { select: { handle: true } }, timeControl: true },
      take: 10,
    }),
    prisma.duel.findMany({
      where: { tournamentId: id, status: "playing" },
      orderBy: { updatedAt: "desc" },
      select: { code: true, host: { select: { handle: true } }, guest: { select: { handle: true } } },
      take: 10,
    }),
  ]);

  const now = Date.now();
  const finished = tournament.status === "finished";
  const canLeave = tournament.status === "upcoming";

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <Link href="/tournaments" className="text-[11px] text-[var(--muted)] hover:text-[var(--text)]">
        ← Tournaments
      </Link>

      <header className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--accent)]">
            Arena · {tournament.timeControl.replace("+", " + ")}
          </p>
          <h1 className="mt-1 text-[28px] font-semibold tracking-tight">{tournament.name}</h1>
          <p className="mt-1 text-[12px] text-[var(--muted)]">
            {tournament.players} player{tournament.players === 1 ? "" : "s"} ·{" "}
            <LiveTime
              start={tournament.startsAt}
              end={tournament.endsAt}
              initialNow={now}
            />
            {" · "}wins 2, draws 1
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!viewer ? (
            <Link
              href="/login"
              className="rounded-md border border-[var(--line)] px-3 py-2 text-[12px] text-[var(--muted)]"
            >
              Sign in to join
            </Link>
          ) : entry ? (
            <>
              {!finished && (
                <form action={findTournamentGameAction}>
                  <input type="hidden" name="id" value={tournament.id} />
                  <button className="rounded-md bg-[var(--accent)] px-3.5 py-2 text-[12px] font-semibold text-white">
                    Find a game →
                  </button>
                </form>
              )}
              {canLeave && (
                <form action={leaveTournamentAction}>
                  <input type="hidden" name="id" value={tournament.id} />
                  <button className="rounded-md border border-[var(--line)] px-3 py-2 text-[11px] text-[var(--muted)]">
                    Withdraw
                  </button>
                </form>
              )}
            </>
          ) : finished ? (
            <span className="text-[11px] text-[var(--muted)]">Closed</span>
          ) : (
            <form action={joinTournamentAction}>
              <input type="hidden" name="id" value={tournament.id} />
              <button className="rounded-md bg-[var(--accent)] px-4 py-2 text-[12px] font-semibold text-white">
                Join the arena
              </button>
            </form>
          )}
        </div>
      </header>

      {error && (
        <p className="mt-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-[12px] text-red-700">
          {error}
        </p>
      )}

      <section className="mt-5 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
        <p className="text-[11px] leading-relaxed text-[var(--muted)]">
          Pairing is first-come: tap “Find a game” and you either take the oldest waiting
          challenge or post one of your own. Your clock, moves and result are the same
          server-side duels used everywhere else.
        </p>
      </section>

      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <section className="overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel)]">
          <div className="flex items-baseline justify-between border-b border-[var(--line)] px-4 py-2.5">
            <h2 className="text-[13px] font-semibold">Standings</h2>
            <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Score</span>
          </div>
          {tournament.entries.length === 0 ? (
            <p className="px-4 py-6 text-[12px] text-[var(--muted)]">
              No entrants yet. Be the first.
            </p>
          ) : (
            <ol className="divide-y divide-[var(--line)]">
              {tournament.entries.map((row) => (
                <li
                  key={row.userId}
                  className={`flex items-center gap-3 px-4 py-2.5 text-[12px] ${
                    row.userId === viewer?.id ? "bg-[var(--accent)]/5 font-medium" : ""
                  }`}
                >
                  <span className="w-5 text-right text-[10px] tabular-nums text-[var(--muted)]">
                    {row.rank}
                  </span>
                  <span className="min-w-0 flex-1 truncate">@{row.handle}</span>
                  <span className="tabular-nums">{row.score}</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="flex flex-col gap-4">
          <div className="overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel)]">
            <div className="border-b border-[var(--line)] px-4 py-2.5">
              <h2 className="text-[13px] font-semibold">Waiting for an opponent</h2>
            </div>
            {openGames.length === 0 ? (
              <p className="px-4 py-4 text-[11px] text-[var(--muted)]">
                Nobody is waiting. Tap “Find a game” to post a challenge.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--line)]">
                {openGames.map((game) => (
                  <li key={game.code} className="flex items-center justify-between gap-2 px-4 py-2">
                    <span className="min-w-0">
                      <span className="block truncate text-[12px]">@{game.host.handle}</span>
                      <span className="block text-[10px] text-[var(--muted)]">
                        plays {game.hostColor === "white" ? "black" : "white"} ·{" "}
                        {game.timeControl.replace("+", " + ")}
                      </span>
                    </span>
                    {viewer?.id === game.hostId ? (
                      <Link
                        href={`/duel/${game.code}`}
                        className="shrink-0 rounded-sm border border-[var(--line)] px-2 py-1 text-[10px] text-[var(--muted)]"
                      >
                        Your game
                      </Link>
                    ) : (
                      <Link
                        href={`/duel/${game.code}`}
                        className="shrink-0 rounded-sm bg-[var(--accent)] px-2.5 py-1 text-[10px] font-semibold text-white"
                      >
                        Accept
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {liveGames.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel)]">
              <div className="border-b border-[var(--line)] px-4 py-2.5">
                <h2 className="text-[13px] font-semibold">Games in progress</h2>
              </div>
              <ul className="divide-y divide-[var(--line)]">
                {liveGames.map((game) => (
                  <li key={game.code}>
                    <Link
                      href={`/duel/${game.code}`}
                      className="flex items-center justify-between gap-2 px-4 py-2 text-[11.5px] transition hover:bg-[var(--panel-2)]"
                    >
                      <span className="truncate">
                        @{game.host.handle} vs @{game.guest?.handle ?? "…"}
                      </span>
                      <span className="shrink-0 text-[10px] text-[var(--muted)]">live</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
