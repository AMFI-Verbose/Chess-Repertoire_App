import Link from "next/link";

import { createTournamentAction } from "@/app/tournaments/actions";
import { getViewer } from "@/lib/auth";
import { TIME_CONTROLS } from "@/lib/gameOptions";
import { listOpenTournaments, listRecentTournaments } from "@/lib/tournaments";

export const dynamic = "force-dynamic";

export const metadata = { title: "Tournaments · Chess Repertoire" };

const ARENA_TIMES = ["1+0", "2+1", "3+0", "3+2", "5+0", "5+3", "10+0", "10+5"];

function humanGap(targetIso: string, now: number) {
  const minutes = Math.round(Math.abs(new Date(targetIso).getTime() - now) / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

export default async function TournamentsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const viewer = await getViewer();
  const [open, recent] = await Promise.all([listOpenTournaments(), listRecentTournaments()]);
  const now = Date.now();

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <Link href="/" className="text-[11px] text-[var(--muted)] hover:text-[var(--text)]">
        ← Home
      </Link>
      <header className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--accent)]">
            Open tournaments
          </p>
          <h1 className="mt-1 text-[30px] font-semibold tracking-tight">Arena</h1>
          <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-[var(--muted)]">
            Join, then pair with whoever else is in the arena. Wins are 2 points, draws 1.
            Every game is a real duel with server-side clocks.
          </p>
        </div>
        {!viewer && (
          <Link
            href="/login"
            className="rounded-md border border-[var(--line)] px-3 py-2 text-[12px] text-[var(--muted)]"
          >
            Sign in to play
          </Link>
        )}
      </header>

      {error && (
        <p className="mt-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-[12px] text-red-700">
          {error}
        </p>
      )}

      <section className="mt-6 overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel)]">
        <div className="flex items-baseline justify-between border-b border-[var(--line)] px-4 py-2.5">
          <h2 className="text-[13px] font-semibold">Live and upcoming</h2>
          <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
            {open.length} open
          </span>
        </div>
        {open.length === 0 ? (
          <p className="px-4 py-6 text-[12px] text-[var(--muted)]">
            Nothing scheduled. Create the first arena below.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--line)]">
            {open.map((tournament) => {
              const live = tournament.status === "live";
              return (
                <li key={tournament.id}>
                  <Link
                    href={`/tournaments/${tournament.id}`}
                    className="flex flex-wrap items-center gap-3 px-4 py-3 transition hover:bg-[var(--panel-2)]"
                  >
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm ${
                        live ? "bg-[var(--accent)] text-white" : "border border-[var(--line)] text-[var(--muted)]"
                      }`}
                    >
                      ♟
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium">{tournament.name}</span>
                      <span className="block text-[10.5px] text-[var(--muted)]">
                        {tournament.timeControl.replace("+", " + ")} ·{" "}
                        {live
                          ? `${humanGap(tournament.endsAt, now)} remaining`
                          : `starts in ${humanGap(tournament.startsAt, now)}`}
                        {" · "}
                        {tournament.players} player{tournament.players === 1 ? "" : "s"}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 rounded-sm px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                        live ? "bg-[var(--accent)]/15 text-[var(--accent)]" : "text-[var(--muted)]"
                      }`}
                    >
                      {live ? "Live" : "Upcoming"}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mt-5 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4">
        <h2 className="text-[13px] font-semibold">Create an arena</h2>
        <p className="mt-0.5 text-[11px] text-[var(--muted)]">
          Anyone can join. It appears on the home page immediately.
        </p>
        {viewer ? (
          <form action={createTournamentAction} className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))_auto]">
            <input
              name="name"
              required
              minLength={3}
              maxLength={60}
              placeholder="Sunday Blitz Arena"
              className="rounded-md border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
            />
            <select
              name="timeControl"
              defaultValue="3+2"
              className="rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-2 text-[12px]"
            >
              {ARENA_TIMES.map((id) => {
                const tc = TIME_CONTROLS.find((entry) => entry.id === id);
                return (
                  <option key={id} value={id}>
                    {tc?.label ?? id}
                  </option>
                );
              })}
            </select>
            <select
              name="startsInMinutes"
              defaultValue="10"
              className="rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-2 text-[12px]"
            >
              {[0, 5, 10, 30, 60, 120].map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes === 0 ? "Start now" : `in ${minutes} min`}
                </option>
              ))}
            </select>
            <select
              name="durationMinutes"
              defaultValue="60"
              className="rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-2 text-[12px]"
            >
              {[30, 45, 60, 90, 120].map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes} min
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded-md bg-[var(--accent)] px-3 py-2 text-[12px] font-semibold text-white"
            >
              Create
            </button>
          </form>
        ) : (
          <p className="mt-3 text-[12px] text-[var(--muted)]">
            <Link href="/login" className="text-[var(--accent)] underline">
              Sign in
            </Link>{" "}
            to create or join an arena.
          </p>
        )}
      </section>

      {recent.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-[var(--muted)]">
            Recent tournaments
          </h2>
          <ul className="flex flex-col gap-2">
            {recent.map((tournament) => (
              <li key={tournament.id}>
                <Link
                  href={`/tournaments/${tournament.id}`}
                  className="flex items-center justify-between gap-3 rounded-md border border-[var(--line)] bg-[var(--panel)] px-4 py-2.5 text-[12px]"
                >
                  <span className="truncate">{tournament.name}</span>
                  <span className="shrink-0 text-[10.5px] text-[var(--muted)]">
                    {tournament.players} players · {tournament.status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
