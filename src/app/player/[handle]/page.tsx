import Link from "next/link";
import { notFound } from "next/navigation";

import ProfileRatingIcon from "@/components/ProfileRatingIcon";
import RatingChart from "@/components/RatingChart";
import ShareProfileLink from "@/components/ShareProfileLink";
import { getViewer } from "@/lib/auth";
import { botById } from "@/lib/bots";
import { levelByNumber } from "@/lib/gameOptions";
import {
  getPublicPlayer,
  RATING_CATEGORIES,
  RATING_META,
  ratingRowsByCategory,
  timeControlCategory,
} from "@/lib/player-ratings";
import { getClubSeason } from "@/lib/tournaments";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const player = await getPublicPlayer(handle);
  return { title: player ? `@${player.handle} · Player profile` : "Player not found" };
}

const RESULT_STYLE: Record<string, { label: string; className: string }> = {
  win: { label: "W", className: "bg-[#629924]/15 text-[#4d7d1c]" },
  draw: { label: "D", className: "bg-[#b48b31]/15 text-[#8a681b]" },
  loss: { label: "L", className: "bg-[#cb4a40]/15 text-[#a13830]" },
};

function avatarStyle(handle: string) {
  let hash = 0;
  for (const character of handle) hash = (hash * 31 + character.charCodeAt(0)) % 360;
  return {
    background: `linear-gradient(135deg, hsl(${hash} 38% 88%), hsl(${(hash + 32) % 360} 42% 72%))`,
    color: `hsl(${hash} 38% 27%)`,
  };
}

function fmtDate(date: Date) {
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Shanghai",
  });
}

function fmtShortDate(date: Date) {
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Shanghai",
  });
}

function recordText(row?: { games: number; wins: number; draws: number; losses: number }) {
  if (!row || row.games === 0) return "No rated games yet";
  return `${row.wins}W · ${row.draws}D · ${row.losses}L`;
}

export default async function PlayerPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const player = await getPublicPlayer(handle);
  if (!player) notFound();

  const viewer = await getViewer();
  const clubRows = await getClubSeason(50);
  const club = clubRows.find((row) => row.handle.toLowerCase() === player.handle.toLowerCase());
  const byCategory = ratingRowsByCategory(player.ratings);

  const series = RATING_CATEGORIES.map((category) => ({
    category,
    label: RATING_META[category].label,
    color: RATING_META[category].color,
    points: player.ratingPoints
      .filter((point) => point.category === category)
      .map((point) => ({ t: point.createdAt.getTime(), rating: point.rating })),
  }));

  const cells = player.activity;
  const peakActivity = Math.max(1, ...cells.map((cell) => cell.count));
  const winRate =
    player.counts.ratedGames > 0
      ? Math.round((player.counts.wins / player.counts.ratedGames) * 100)
      : 0;

  return (
    <main className="mx-auto w-full max-w-6xl 2xl:max-w-[1440px] px-6 py-10">
      <div className="mb-5 flex items-center justify-between gap-3 text-xs text-[var(--muted)]">
        <Link href="/players" className="transition hover:text-[var(--text)]">
          ← All players
        </Link>
        <span>Public profile</span>
      </div>

      <header className="flex flex-wrap items-center gap-5 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5 sm:p-6">
        <span
          className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full text-2xl font-semibold shadow-inner sm:h-24 sm:w-24"
          style={avatarStyle(player.handle)}
          aria-hidden
        >
          {player.handle.slice(0, 2).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-3xl font-semibold tracking-tight">@{player.handle}</h1>
            {viewer?.id === player.id && (
              <span className="rounded-full bg-[var(--accent)]/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-[var(--accent)]">
                This is you
              </span>
            )}
            {player.emailVerified && (
              <span className="rounded-full border border-[var(--line)] px-2.5 py-1 text-[10px] uppercase tracking-wide text-[var(--muted)]">
                Verified
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Joined {fmtDate(player.createdAt)} · {player.counts.games} game{player.counts.games === 1 ? "" : "s"} ·{" "}
            {player.counts.puzzleAttempts} puzzle attempt{player.counts.puzzleAttempts === 1 ? "" : "s"}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {[
                { value: player.counts.wins, label: "wins" },
                { value: player.counts.draws, label: "draws" },
                { value: player.counts.losses, label: "losses" },
              ].map((stat) => (
                <span
                  key={stat.label}
                  className="rounded-lg border border-[var(--line)] bg-[var(--panel-2)] px-3 py-1.5"
                >
                  <strong className="tabular-nums">{stat.value}</strong>{" "}
                  <span className="text-[var(--muted)]">{stat.label}</span>
                </span>
              ))}
              {player.counts.ratedGames > 0 && (
                <span className="rounded-lg border border-[var(--accent)]/25 bg-[var(--accent)]/[0.06] px-3 py-1.5 text-[var(--muted)]">
                  <strong className="text-[var(--accent)]">{winRate}%</strong> win rate
                </span>
              )}
            </div>
            {club && (
              <span className="rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/5 px-3 py-1.5 text-xs text-[var(--muted)]">
                Club #{club.rank} this month · {club.score} pts
              </span>
            )}
          </div>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <ShareProfileLink handle={player.handle} />
          {viewer?.id === player.id && (
            <Link
              href="/play"
              className="rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-medium text-white transition hover:brightness-110"
            >
              Play a rated game →
            </Link>
          )}
        </div>
      </header>

      <section className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {RATING_CATEGORIES.map((category) => {
          const meta = RATING_META[category];
          const row = byCategory.get(category);
          const rating = row?.rating ?? 1500;
          const peak = row?.peak ?? 1500;
          const provisional = !row || row.games < 10;
          return (
            <div
              key={category}
              className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4"
              style={{ borderTopColor: meta.color, borderTopWidth: 3 }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">
                  {meta.label}
                </span>
                <ProfileRatingIcon category={category} color={meta.color} />
              </div>
              <p className="mt-2 text-2xl font-semibold tabular-nums">
                {rating}
                {provisional && (
                  <span
                    className="ml-0.5 text-sm font-normal text-[var(--muted)]"
                    title="Provisional until 10 rated games"
                  >
                    ?
                  </span>
                )}
              </p>
              <p className="mt-1 text-[11px] text-[var(--muted)]">Peak {peak}</p>
              <p className="mt-2 min-h-4 text-[11px] text-[var(--muted)]">
                {category === "puzzle"
                  ? row?.games
                    ? `${row.games} attempts · ${row.wins} solved`
                    : "No rated attempts yet"
                  : recordText(row)}
              </p>
            </div>
          );
        })}
      </section>

      <div className="mt-6">
        <RatingChart series={series} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)]">
          <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold">Recent games</h2>
              <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                {player.counts.importedGames > 0
                  ? `${player.counts.ratedGames} rated · ${player.counts.importedGames} imported`
                  : "Rated games update the graph above"}
              </p>
            </div>
            <Link href="/games" className="text-[11px] text-[var(--muted)] transition hover:text-[var(--accent)]">
              All games →
            </Link>
          </div>
          {player.recentGames.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="text-sm text-[var(--muted)]">No completed games yet.</p>
              {viewer?.id === player.id && (
                <Link
                  href="/play"
                  className="mt-3 inline-block rounded-lg border border-[var(--line)] px-3 py-2 text-xs transition hover:border-[var(--accent)]"
                >
                  Start a game →
                </Link>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-[var(--line)]">
              {player.recentGames.map((game) => {
                const result = RESULT_STYLE[game.result] ?? RESULT_STYLE.draw;
                const opponent =
                  game.kind === "import"
                    ? "Imported game"
                    : game.botId
                      ? botById(game.botId).name
                      : `Stockfish · ${levelByNumber(game.level).name}`;
                const category = timeControlCategory(game.timeControl);
                return (
                  <li key={game.id}>
                    <Link
                      href={`/games/${game.id}`}
                      className="group flex items-center gap-3 px-5 py-3 transition hover:bg-[var(--panel-2)]"
                    >
                      <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-semibold ${result.className}`}
                      >
                        {result.label}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-medium">{opponent}</span>
                          <span className="text-[10px] uppercase tracking-wide text-[var(--muted)]">
                            {game.kind === "import" ? "Imported" : "Rated"}
                          </span>
                        </span>
                        <span className="mt-0.5 block text-[11px] text-[var(--muted)]">
                          {game.timeControl === "unlimited" ? "No clock" : game.timeControl} ·{" "}
                          {RATING_META[category].label} · {fmtShortDate(game.createdAt)}
                        </span>
                      </span>
                      <span className="text-[11px] text-[var(--muted)] transition group-hover:text-[var(--accent)]">
                        Review →
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <aside className="flex flex-col gap-4">
          <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-[0.16em] text-[var(--accent)]">
                Puzzle record
              </span>
              <Link href="/puzzles" className="text-[11px] text-[var(--muted)] hover:text-[var(--accent)]">
                Solve →
              </Link>
            </div>
            <div className="mt-3 flex items-end gap-2">
              <span className="text-3xl font-semibold tabular-nums">{byCategory.get("puzzle")?.rating ?? 1500}</span>
              <span className="pb-1 text-[11px] text-[var(--muted)]">
                peak {byCategory.get("puzzle")?.peak ?? 1500}
              </span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {[
                { label: "Attempted", value: player.puzzle.attempted },
                { label: "Solved", value: player.puzzle.solved },
                { label: "Accuracy", value: `${player.puzzle.accuracy}%` },
                { label: "Streak", value: player.puzzle.streak },
              ].map((item) => (
                <div key={item.label} className="rounded-lg bg-[var(--panel-2)] px-3 py-2">
                  <p className="text-sm font-semibold tabular-nums">{item.value}</p>
                  <p className="text-[10px] uppercase tracking-wide text-[var(--muted)]">{item.label}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">
                Activity · 12 weeks
              </span>
              <span className="text-[11px] text-[var(--muted)]">
                {player.counts.games + player.counts.puzzleAttempts} total
              </span>
            </div>
            <div className="mt-4 grid grid-cols-12 gap-1">
              {cells.map((cell) => {
                const level = cell.count === 0 ? 0 : Math.min(4, 1 + Math.floor((cell.count / peakActivity) * 3));
                return (
                  <span
                    key={cell.date}
                    title={`${fmtShortDate(new Date(`${cell.date}T12:00:00+08:00`))} · ${cell.count} ${
                      cell.count === 1 ? "activity" : "activities"
                    }`}
                    className="aspect-square rounded-[3px] border"
                    style={{
                      borderColor: level === 0 ? "var(--line)" : "transparent",
                      background:
                        level === 0 ? "var(--panel-2)" : `rgba(98, 153, 36, ${0.18 + level * 0.2})`,
                    }}
                  />
                );
              })}
            </div>
            <div className="mt-3 flex items-center justify-between text-[10px] text-[var(--muted)]">
              <span>Less</span>
              <span className="flex gap-1">
                {[0, 1, 2, 3, 4].map((level) => (
                  <span
                    key={level}
                    className="h-2.5 w-2.5 rounded-[2px] border"
                    style={{
                      borderColor: level === 0 ? "var(--line)" : "transparent",
                      background:
                        level === 0 ? "var(--panel-2)" : `rgba(98, 153, 36, ${0.18 + level * 0.2})`,
                    }}
                  />
                ))}
              </span>
              <span>More</span>
            </div>
          </section>

          <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">
                Club season
              </span>
              <Link href="/tournaments?source=club" className="text-[11px] text-[var(--muted)] hover:text-[var(--accent)]">
                Arenas →
              </Link>
            </div>
            {club ? (
              <p className="mt-3 text-sm">
                <strong className="text-lg tabular-nums">#{club.rank}</strong>{" "}
                <span className="text-[var(--muted)]">
                  with {club.score} points across {club.events} event{club.events === 1 ? "" : "s"}
                </span>
              </p>
            ) : (
              <p className="mt-3 text-sm text-[var(--muted)]">
                No club score this month. Join the next nightly arena to get on the board.
              </p>
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}
