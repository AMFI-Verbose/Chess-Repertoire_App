import Link from "next/link";

import ProfileRatingIcon from "@/components/ProfileRatingIcon";
import { getViewer } from "@/lib/auth";
import { listPlayers, RATING_CATEGORIES, RATING_META, ratingRowsByCategory } from "@/lib/player-ratings";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Players · Chess Repertoire",
  description: "Public player profiles, ratings and recent activity.",
};

function joined(date: Date) {
  return date.toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric",
    timeZone: "Asia/Shanghai",
  });
}

function initials(handle: string) {
  return handle.slice(0, 2).toUpperCase();
}

function avatar(handle: string) {
  let hash = 0;
  for (const character of handle) hash = (hash * 31 + character.charCodeAt(0)) % 360;
  return {
    background: `linear-gradient(135deg, hsl(${hash} 38% 88%), hsl(${(hash + 32) % 360} 42% 72%))`,
    color: `hsl(${hash} 38% 27%)`,
  };
}

export default async function PlayersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const [{ q }, allPlayers, viewer] = await Promise.all([
    searchParams,
    listPlayers(),
    getViewer(),
  ]);
  const query = (q ?? "").trim().toLowerCase();
  const players = query
    ? allPlayers.filter((player) => player.handle.toLowerCase().includes(query))
    : allPlayers;

  return (
    <main className="mx-auto w-full max-w-6xl 2xl:max-w-[1440px] px-6 py-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-[11px] uppercase tracking-[0.2em] text-[var(--accent)]">
            community
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">Players</h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-[var(--muted)]">
            Every account has its own bullet, blitz, rapid, classical, correspondence
            and puzzle rating. Open a profile for the rating graph and game history.
          </p>
        </div>
        <form action="/players" className="flex w-full items-center gap-2 sm:w-auto">
          <label className="sr-only" htmlFor="player-search">
            Search players
          </label>
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" aria-hidden>
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
                <circle cx="6.8" cy="6.8" r="4.3" />
                <path d="M10.1 10.1 14 14" strokeLinecap="round" />
              </svg>
            </span>
            <input
              id="player-search"
              name="q"
              defaultValue={q ?? ""}
              placeholder="Search by handle"
              autoComplete="off"
              className="h-10 w-full rounded-lg border border-[var(--line)] bg-[var(--panel)] pl-8 pr-3 text-sm outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--accent)] sm:w-56"
            />
          </div>
          <button
            type="submit"
            className="h-10 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 text-xs font-medium transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            Search
          </button>
        </form>
      </header>

      {query && (
        <div className="mb-4 flex items-center justify-between gap-3 text-xs text-[var(--muted)]">
          <span>
            {players.length} {players.length === 1 ? "player" : "players"} matching
            “{q}”
          </span>
          <Link href="/players" className="transition hover:text-[var(--accent)]">
            Clear search
          </Link>
        </div>
      )}

      {players.length === 0 ? (
        <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-6 py-14 text-center">
          <p className="text-sm font-medium">No player matches “{q}”.</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Try a shorter handle, or browse every account.
          </p>
          <Link
            href="/players"
            className="mt-4 inline-block rounded-lg border border-[var(--line)] px-3 py-2 text-xs transition hover:border-[var(--accent)]"
          >
            Show all players
          </Link>
        </div>
      ) : (
        <> 

      <section className="hidden overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)] md:block">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--line)] text-left text-[11px] uppercase tracking-wide text-[var(--muted)]">
              <th className="px-5 py-3 font-medium">Player</th>
              {RATING_CATEGORIES.map((category) => (
                <th key={category} className="px-3 py-3 text-right font-medium">
                  {RATING_META[category].label}
                </th>
              ))}
              <th className="px-5 py-3 text-right font-medium">Joined</th>
            </tr>
          </thead>
          <tbody>
            {players.map((player) => {
              const byCategory = ratingRowsByCategory(player.ratings);
              return (
                <tr
                  key={player.handle}
                  className={`border-b border-[var(--line)] last:border-0 ${
                    viewer?.handle === player.handle ? "bg-[var(--accent)]/[0.04]" : ""
                  }`}
                >
                  <td className="px-5 py-3">
                    <Link href={`/player/${player.handle}`} className="group flex items-center gap-3">
                      <span
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                        style={avatar(player.handle)}
                      >
                        {initials(player.handle)}
                      </span>
                      <span>
                        <span className="block font-medium transition group-hover:text-[var(--accent)]">
                          @{player.handle}
                        </span>
                        <span className="block text-[11px] text-[var(--muted)]">
                          {viewer?.handle === player.handle ? "This is you" : "Player profile"}
                        </span>
                      </span>
                    </Link>
                  </td>
                  {RATING_CATEGORIES.map((category) => {
                    const row = byCategory.get(category);
                    const value = row?.rating ?? 1500;
                    return (
                      <td key={category} className="px-3 py-3 text-right">
                        <span
                          className="tabular-nums"
                          title={`${RATING_META[category].label} · peak ${row?.peak ?? 1500}`}
                        >
                          {value}
                          {(!row || row.games < 10) && (
                            <span className="text-[10px] text-[var(--muted)]">?</span>
                          )}
                        </span>
                      </td>
                    );
                  })}
                  <td className="px-5 py-3 text-right text-[11px] text-[var(--muted)]">
                    {joined(player.createdAt)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <div className="grid gap-3 md:hidden">
        {players.map((player) => {
          const byCategory = ratingRowsByCategory(player.ratings);
          return (
            <Link
              key={player.handle}
              href={`/player/${player.handle}`}
              className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 transition hover:border-[var(--accent)]"
            >
              <div className="flex items-center gap-3">
                <span
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
                  style={avatar(player.handle)}
                >
                  {initials(player.handle)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">@{player.handle}</span>
                  <span className="block text-[11px] text-[var(--muted)]">
                    Joined {joined(player.createdAt)}
                    {viewer?.handle === player.handle ? " · This is you" : ""}
                  </span>
                </span>
                <span className="text-xs text-[var(--muted)]">→</span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                {RATING_CATEGORIES.map((category) => {
                  const row = byCategory.get(category);
                  return (
                    <div key={category} className="rounded-lg bg-[var(--panel-2)] px-2.5 py-2">
                      <div className="flex items-center gap-1.5">
                        <ProfileRatingIcon category={category} color={RATING_META[category].color} />
                        <span className="text-[10px] uppercase tracking-wide text-[var(--muted)]">
                          {RATING_META[category].label}
                        </span>
                      </div>
                      <p className="mt-1 text-base font-semibold tabular-nums">
                        {row?.rating ?? 1500}
                        {(!row || row.games < 10) && (
                          <span className="text-[10px] font-normal text-[var(--muted)]">?</span>
                        )}
                      </p>
                    </div>
                  );
                })}
              </div>
            </Link>
          );
        })}
      </div>
        </>
      )}
    </main>
  );
}
