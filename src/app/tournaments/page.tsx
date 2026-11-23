import Link from "next/link";

import { createTournamentAction, refreshCalendarAction } from "@/app/tournaments/actions";
import { getViewer } from "@/lib/auth";
import { TIME_CONTROLS } from "@/lib/gameOptions";
import {
  listFinishedTournaments,
  listOpenTournaments,
  listRecentTournaments,
  refreshTournamentCalendar,
} from "@/lib/tournaments";

export const dynamic = "force-dynamic";

export const metadata = { title: "Tournaments · Chess Repertoire" };

const ARENA_TIMES = ["1+0", "2+1", "3+0", "3+2", "5+0", "5+3", "10+0", "10+5"];

const TABS = [
  { id: "all", label: "All" },
  { id: "lichess", label: "Lichess" },
  { id: "chess.com", label: "chess.com" },
  { id: "club", label: "Club" },
] as const;

function humanGap(targetIso: string, now: number) {
  const minutes = Math.round(Math.abs(new Date(targetIso).getTime() - now) / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function humanAgo(targetIso: string, now: number) {
  const minutes = Math.max(0, Math.round((now - new Date(targetIso).getTime()) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function SourceBadge({ source }: { source: string }) {
  if (source === "lichess") {
    return (
      <span className="shrink-0 rounded-sm bg-[#e9e2f5] px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-[#5c3d91]">
        Lichess
      </span>
    );
  }
  if (source === "chess.com") {
    return (
      <span className="shrink-0 rounded-sm bg-[#e2f0e4] px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-[#2f6f3e]">
        chess.com
      </span>
    );
  }
  return (
    <span className="shrink-0 rounded-sm bg-[var(--panel-2)] px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">
      Club
    </span>
  );
}

export default async function TournamentsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; source?: string }>;
}) {
  const { error, source } = await searchParams;
  await refreshTournamentCalendar();
  const viewer = await getViewer();
  const [open, recent, finished] = await Promise.all([
    listOpenTournaments(),
    listRecentTournaments(),
    listFinishedTournaments(12),
  ]);
  const now = Date.now();

  const active = TABS.some((tab) => tab.id === source) ? (source ?? "all") : "all";
  const lichess = open.filter((tournament) => tournament.source === "lichess");
  const chessCom = open.filter((tournament) => tournament.source === "chess.com");
  const local = open.filter((tournament) => tournament.source === "local");

  const interleaved = [
    ...lichess.slice(0, 6),
    ...chessCom.slice(0, 3),
    ...lichess.slice(6, 10),
    ...chessCom.slice(3),
  ];
  const externalOpen =
    active === "chess.com"
      ? chessCom
      : active === "lichess"
        ? lichess.slice(0, 16)
        : interleaved;

  const pastEvents =
    active === "club"
      ? []
      : finished
          .filter((tournament) => active === "all" || tournament.source === active)
          .slice(0, 8);

  const showExternal = active !== "club";
  const showClub = active === "all" || active === "club";
  const counts: Record<string, number> = {
    all: lichess.length + chessCom.length,
    lichess: lichess.length,
    "chess.com": chessCom.length,
    club: local.length,
  };

  return (
    <main className="mx-auto w-full max-w-6xl 2xl:max-w-[1440px] px-4 py-8 sm:px-6">
      <Link href="/" className="text-[11px] text-[var(--muted)] hover:text-[var(--text)]">
        ← Home
      </Link>
      <header className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--accent)]">
            Tournament calendar
          </p>
          <h1 className="mt-1 text-[30px] font-semibold tracking-tight">Arena</h1>
          <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-[var(--muted)]">
            Real arenas and swisses pulled from Lichess and chess.com, plus our own club
            arenas where wins are 2 points and draws 1.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <form action={refreshCalendarAction}>
            <button
              type="submit"
              className="rounded-md border border-[var(--line)] px-3 py-2 text-[12px] text-[var(--muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              Refresh imports
            </button>
          </form>
          {!viewer && (
            <Link
              href="/login"
              className="rounded-md border border-[var(--line)] px-3 py-2 text-[12px] text-[var(--muted)]"
            >
              Sign in to play
            </Link>
          )}
        </div>
      </header>

      {error && (
        <p className="mt-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-[12px] text-red-700">
          {error}
        </p>
      )}

      <nav className="mt-5 flex flex-wrap gap-1.5">
        {TABS.map((tab) => {
          const isActive = active === tab.id;
          return (
            <Link
              key={tab.id}
              href={tab.id === "all" ? "/tournaments" : `/tournaments?source=${tab.id}`}
              className={`rounded-md px-2.5 py-1.5 text-[11.5px] transition ${
                isActive
                  ? "bg-[var(--panel)] font-medium text-[var(--text)] shadow-[inset_0_-2px_0_var(--accent)]"
                  : "text-[var(--muted)] hover:bg-[var(--panel)] hover:text-[var(--text)]"
              }`}
            >
              {tab.label}
              <span className="ml-1.5 text-[10px] text-[var(--muted)]">{counts[tab.id]}</span>
            </Link>
          );
        })}
      </nav>

      {showExternal && (
        <section className="mt-4 overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel)]">
          <div className="flex items-baseline justify-between border-b border-[var(--line)] px-4 py-2.5">
            <h2 className="text-[13px] font-semibold">
              {active === "chess.com"
                ? "Upcoming chess.com arenas"
                : active === "lichess"
                  ? "Lichess arenas"
                  : "Live and upcoming"}
            </h2>
            <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
              {externalOpen.length} listed
            </span>
          </div>
          {externalOpen.length === 0 ? (
            <p className="px-4 py-6 text-[12px] text-[var(--muted)]">
              No imported events right now. Hit “Refresh imports”, or check back in a minute.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--line)]">
              {externalOpen.map((tournament) => {
                const live = tournament.status === "live";
                return (
                  <li key={tournament.id}>
                    <a
                      href={tournament.externalUrl ?? "#"}
                      target="_blank"
                      rel="noreferrer"
                      className="flex flex-wrap items-center gap-3 px-4 py-3 transition hover:bg-[var(--panel-2)]"
                    >
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm ${
                          live
                            ? "bg-[var(--accent)] text-white"
                            : "border border-[var(--line)] text-[var(--muted)]"
                        }`}
                      >
                        ♟
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <SourceBadge source={tournament.source} />
                          <span className="truncate text-[13px] font-medium">
                            {tournament.name}
                          </span>
                        </span>
                        <span className="mt-0.5 block text-[10.5px] text-[var(--muted)]">
                          {tournament.timeControl.replace("+", " + ")} ·{" "}
                          {live
                            ? `${humanGap(tournament.endsAt, now)} remaining`
                            : `starts in ${humanGap(tournament.startsAt, now)}`}
                          {" · "}
                          {tournament.players > 0
                            ? `${tournament.players} player${tournament.players === 1 ? "" : "s"}`
                            : "registration open"}
                        </span>
                      </span>
                      <span
                        className={`shrink-0 rounded-sm px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                          live
                            ? "bg-[var(--accent)]/15 text-[var(--accent)]"
                            : "text-[var(--muted)]"
                        }`}
                      >
                        {live ? "Live" : "Upcoming"}
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {showClub && (
        <section className="mt-5 overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel)]">
          <div className="flex items-baseline justify-between border-b border-[var(--line)] px-4 py-2.5">
            <h2 className="text-[13px] font-semibold">Club arenas</h2>
            <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
              {local.length} open
            </span>
          </div>
          {local.length === 0 ? (
            <p className="px-4 py-6 text-[12px] text-[var(--muted)]">
              Nothing scheduled. Create the first arena below.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--line)]">
              {local.map((tournament) => {
                const live = tournament.status === "live";
                return (
                  <li key={tournament.id}>
                    <Link
                      href={`/tournaments/${tournament.id}`}
                      className="flex flex-wrap items-center gap-3 px-4 py-3 transition hover:bg-[var(--panel-2)]"
                    >
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm ${
                          live
                            ? "bg-[var(--accent)] text-white"
                            : "border border-[var(--line)] text-[var(--muted)]"
                        }`}
                      >
                        ♟
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <SourceBadge source={tournament.source} />
                          <span className="truncate text-[13px] font-medium">
                            {tournament.name}
                          </span>
                        </span>
                        <span className="mt-0.5 block text-[10.5px] text-[var(--muted)]">
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
                          live
                            ? "bg-[var(--accent)]/15 text-[var(--accent)]"
                            : "text-[var(--muted)]"
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
      )}

      {showClub && (
        <section className="mt-5 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4">
          <h2 className="text-[13px] font-semibold">Create a club arena</h2>
          <p className="mt-0.5 text-[11px] text-[var(--muted)]">
            Anyone can join. It appears on the home page immediately.
          </p>
          {viewer ? (
            <form
              action={createTournamentAction}
              className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))_auto]"
            >
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
      )}

      {pastEvents.length > 0 && (
        <section className="mt-8">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-[11px] font-medium uppercase tracking-wider text-[var(--muted)]">
              Recently finished
            </h2>
            <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
              last {pastEvents.length}
            </span>
          </div>
          <ul className="flex flex-col gap-2">
            {pastEvents.map((tournament) => (
              <li key={tournament.id}>
                <a
                  href={tournament.externalUrl ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="flex flex-wrap items-center gap-2 rounded-md border border-[var(--line)] bg-[var(--panel)] px-4 py-2.5 text-[12px] transition hover:bg-[var(--panel-2)]"
                >
                  <SourceBadge source={tournament.source} />
                  <span className="min-w-0 flex-1 truncate">{tournament.name}</span>
                  <span className="shrink-0 text-[10.5px] text-[var(--muted)]">
                    {tournament.players} player{tournament.players === 1 ? "" : "s"} ·{" "}
                    {humanAgo(tournament.endsAt, now)}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {recent.length > 0 && showClub && (
        <section className="mt-8">
          <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-[var(--muted)]">
            Recent club tournaments
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
