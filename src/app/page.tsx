import Link from "next/link";
import { listStudies } from "@/app/actions";
import MiniBoard from "@/components/MiniBoard";
import { getViewer } from "@/lib/auth";
import { listOpenDuels } from "@/lib/duels";
import { listOpenTournaments } from "@/lib/tournaments";
import { prisma } from "@/lib/prisma";
import { createRepertoire } from "./actions";
import { opponentLabel } from "@/lib/bots";
import { getTrainOverview } from "@/app/train/actions";

// Read from the database on every request — never serve a stale cached page.
export const dynamic = "force-dynamic";

function arenaGap(targetIso: string, now: number) {
  const minutes = Math.round(Math.abs(new Date(targetIso).getTime() - now) / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

export default async function DashboardPage() {
  const viewer = await getViewer();
  const train = await getTrainOverview();
  const trainDue = train.reduce((sum, item) => sum + item.due + item.fresh, 0);

  const [
    repertoires,
    openingCount,
    solvedPuzzles,
    studyCount,
    recentAttempts,
    profile,
    gameCount,
    recentGames,
    studies,
    openDuels,
    dailyPuzzle,
    members,
    tournaments,
    donations,
  ] = await Promise.all([
      prisma.repertoire.findMany({
        orderBy: { updatedAt: "desc" },
        include: { _count: { select: { nodes: true } } },
      }),
      prisma.opening.count(),
      prisma.puzzleAttempt.count({ where: { solved: true } }),
      prisma.study.count(),
      prisma.puzzleAttempt.findMany({
        orderBy: { createdAt: "desc" },
        take: 50,
        select: { solved: true },
      }),
      prisma.profile.findUnique({ where: { id: "local" } }),
      prisma.game.count(),
      prisma.game.findMany({
        orderBy: { createdAt: "desc" },
        take: 3,
        select: {
          id: true,
          result: true,
          botId: true,
          skill: true,
          level: true,
          timeControl: true,
          playerColor: true,
          plies: true,
          createdAt: true,
        },
      }),
      listStudies(),
      listOpenDuels(),
      prisma.puzzle.findFirst({
        where: { day: { not: null } },
        orderBy: { day: "desc" },
        select: { id: true, fen: true, title: true, rating: true, day: true },
      }),
      prisma.user.count(),
      listOpenTournaments(4),
      prisma.donation.aggregate({ _sum: { amountCents: true }, _count: true }),
    ]);

  let streak = 0;
  for (const attempt of recentAttempts) {
    if (!attempt.solved) break;
    streak += 1;
  }

  const stats = [
    { label: "Repertoires", value: repertoires.length },
    { label: "Puzzle rating", value: profile?.puzzleRating ?? 1500 },
    { label: "Puzzles solved", value: solvedPuzzles },
    { label: "Games played", value: gameCount },
  ];
  void studyCount;
  const raised = Math.round((donations._sum.amountCents ?? 0) / 100);

  return (
    <main className="mx-auto max-w-5xl px-6 py-14">
      <header className="mb-10">
        <p className="mb-2 text-[11px] uppercase tracking-[0.2em] text-[var(--accent)]">
          chess · opening trainer
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Your repertoires
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-[var(--muted)]">
          Build the opening lines you actually play, branch them where they
          diverge, keep a note on every position — then test them against
          Stockfish or one of eight characters, and grade every move in review.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            href="/play"
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[#0b1602] transition hover:brightness-110"
          >
            Play Stockfish →
          </Link>
          <Link
            href="/play#characters"
            className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm transition hover:border-[var(--accent)]"
          >
            Play a character
          </Link>
          <Link
            href="/games"
            className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm transition hover:border-[var(--accent)]"
          >
            Your games
          </Link>
        </div>
      </header>

      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3"
          >
            <p className="text-lg font-semibold tabular-nums">{stat.value}</p>
            <p className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
              {stat.label}
            </p>
          </div>
        ))}
      </div>

      {trainDue > 0 && (
        <Link
          href="/train"
          className="group mb-3 flex flex-wrap items-center gap-4 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-5 py-3.5 transition hover:border-[var(--accent)]"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--panel-2)] text-base">
            ⟳
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium">
              {trainDue} positions due in your repertoires
            </span>
            <span className="mt-0.5 block text-xs text-[var(--muted)]">
              Spaced repetition: the lines you saved, asked back at the right moment
            </span>
          </span>
          <span className="text-xs text-[var(--accent)] transition group-hover:translate-x-0.5">
            Train →
          </span>
        </Link>
      )}

      <Link
        href="/learn"
        className="group mb-3 flex flex-wrap items-center gap-4 rounded-xl border border-[var(--accent)]/40 bg-[var(--panel)] px-5 py-4 transition hover:border-[var(--accent)]"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/bots/marlow.png"
          alt="Coach"
          className="h-10 w-10 shrink-0 rounded-full object-cover"
        />
        <span className="min-w-0 flex-1">
          <span className="block font-medium">
            Learn with a coach
            <span className="ml-2 rounded bg-[var(--accent)]/15 px-1.5 py-0.5 text-[10px] font-normal uppercase tracking-wider text-[var(--accent)]">
              new
            </span>
          </span>
          <span className="mt-0.5 block text-xs text-[var(--muted)]">
            16 lessons in 5 chapters — every move explained, every task yours to
            find, every wrong try answered by the engine
          </span>
        </span>
        <span className="text-xs text-[var(--accent)] transition group-hover:translate-x-0.5">
          Start →
        </span>
      </Link>

      <div className="mb-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Link
          href="/openings"
          className="group flex items-center gap-4 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-5 py-4 transition hover:border-[var(--accent)]"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--line)] bg-[#f0d9b5] text-lg text-[#b58863]">
            ♜
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium">Opening library</span>
            <span className="mt-0.5 block text-xs text-[var(--muted)]">
              {openingCount.toLocaleString()} named lines, searchable
            </span>
          </span>
        </Link>

        <Link
          href="/puzzles"
          className="group flex items-center gap-4 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-5 py-4 transition hover:border-[var(--accent)]"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--line)] bg-[#f0d9b5] text-lg text-[#b58863]">
            ♛
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium">Daily puzzle</span>
            <span className="mt-0.5 block text-xs text-[var(--muted)]">
              {streak > 0
                ? `Daily tactic · ${streak} solved in a row`
                : "Daily tactic, plus practice"}
            </span>
          </span>
        </Link>

        <Link
          href="/games"
          className="group flex items-center gap-4 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-5 py-4 transition hover:border-[var(--accent)]"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--line)] bg-[#f0d9b5] text-lg text-[#b58863]">
            ♞
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium">Your games</span>
            <span className="mt-0.5 block text-xs text-[var(--muted)]">
              {gameCount === 0
                ? "Pick from eight characters — every game is saved"
                : `${gameCount} saved · replay & grade`}
            </span>
          </span>
        </Link>

        <Link
          href="/community"
          className="group flex items-center gap-4 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-5 py-4 transition hover:border-[var(--accent)]"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--line)] bg-[#f0d9b5] text-lg text-[#b58863]">
            ♟
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium">Community studies</span>
            <span className="mt-0.5 block text-xs text-[var(--muted)]">
              Annotated games with discussion
            </span>
          </span>
        </Link>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section>
          {repertoires.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--line)] p-10 text-center">
              <p className="text-sm text-[var(--muted)]">
                Nothing here yet. Create your first repertoire on the right →
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {repertoires.map((repertoire) => {
                const moves = Math.max(repertoire._count.nodes - 1, 0);
                return (
                  <li key={repertoire.id}>
                    <Link
                      href={`/r/${repertoire.id}`}
                      className="group flex items-center gap-4 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-5 py-4 transition hover:border-[var(--accent)]"
                    >
                      <span
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--line)] text-lg ${
                          repertoire.side === "black"
                            ? "bg-[#1b1f2a] text-[#c9d4e0]"
                            : "bg-[#e8edf5] text-[#2e2d29]"
                        }`}
                      >
                        {repertoire.side === "black" ? "♚" : "♔"}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">
                          {repertoire.name}
                        </span>
                        <span className="mt-0.5 block text-xs text-[var(--muted)]">
                          {moves} {moves === 1 ? "move" : "moves"} · updated{" "}
                          {new Intl.DateTimeFormat("en-GB", {
                            dateStyle: "medium",
                          }).format(repertoire.updatedAt)}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-[var(--muted)] transition group-hover:text-[var(--accent)]">
                        Open →
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          {recentGames.length > 0 && (
            <div className="mt-8">
              <div className="mb-3 flex items-baseline justify-between">
                <h2 className="text-[11px] font-medium uppercase tracking-wider text-[var(--muted)]">
                  Recent games
                </h2>
                <Link
                  href="/games"
                  className="text-[11px] text-[var(--muted)] transition hover:text-[var(--accent)]"
                >
                  All {gameCount} →
                </Link>
              </div>
              <ul className="flex flex-col gap-2">
                {recentGames.map((game) => (
                  <li key={game.id}>
                    <Link
                      href={`/games/${game.id}`}
                      className="flex items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-2.5 transition hover:border-[var(--accent)]"
                    >
                      <span
                        className="w-11 shrink-0 rounded-md py-0.5 text-center text-[10px] font-semibold"
                        style={{
                          background:
                            game.result === "win"
                              ? "#81b64c"
                              : game.result === "loss"
                                ? "#e0564b"
                                : "#c2a35a",
                          color: "#0b1602",
                        }}
                      >
                        {game.result === "win" ? "WIN" : game.result === "loss" ? "LOSS" : "DRAW"}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs">
                        vs {opponentLabel(game.botId, game.level)} · {game.timeControl} ·{" "}
                        {Math.ceil(game.plies / 2)}{" "}
                        {Math.ceil(game.plies / 2) === 1 ? "move" : "moves"}
                      </span>
                      <span className="shrink-0 text-[11px] text-[var(--muted)]">
                        {new Intl.DateTimeFormat("en-GB", { dateStyle: "short" }).format(
                          game.createdAt,
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <aside className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5">
          <h2 className="text-[11px] font-medium uppercase tracking-wider text-[var(--muted)]">
            New repertoire
          </h2>
          <form action={createRepertoire} className="mt-4 flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-[var(--muted)]">Name</span>
              <input
                name="name"
                required
                maxLength={80}
                placeholder="e.g. Italian Game — White"
                className="rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm outline-none transition focus:border-[var(--accent)]"
              />
            </label>

            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1.5 text-xs text-[var(--muted)]">
                You play as
              </legend>
              <div className="grid grid-cols-2 gap-2">
                {(["white", "black"] as const).map((option) => (
                  <label
                    key={option}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--line)] px-3 py-2 text-sm transition has-[:checked]:border-[var(--accent)] has-[:checked]:bg-[var(--accent)]/10"
                  >
                    <input
                      type="radio"
                      name="side"
                      value={option}
                      defaultChecked={option === "white"}
                      className="accent-[var(--accent)]"
                    />
                    <span className="capitalize">{option}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <button
              type="submit"
              className="mt-1 rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white transition hover:brightness-110"
            >
              Create repertoire
            </button>
          </form>
        </aside>
      </div>

      <section className="mt-12 border-t border-[var(--line)] pt-8">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-[11px] font-medium uppercase tracking-wider text-[var(--muted)]">
            The club
          </h2>
          <span className="text-[10.5px] text-[var(--muted)]">Tournaments, shop and support</span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Donate — the same quiet card Lichess puts at the top left. */}
          <Link
            href="/support"
            className="group flex items-start gap-4 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 transition hover:border-[#c89b4a]"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#f3e7cf] text-2xl text-[#a9782b]">
              ♥
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold text-[#8a5f1d]">Donate</span>
              <span className="mt-0.5 block text-[11.5px] text-[var(--muted)]">
                {raised > 0
                  ? `Become a patron — $${raised} pledged by ${donations._count} so far`
                  : "Be the first patron — every pledge pays for the boards"}
              </span>
              <span className="mt-2 block text-[11px] text-[#a9782b]">Keep the boards ad-free →</span>
            </span>
          </Link>

          {/* Open tournaments — a real arena list, not a placeholder banner. */}
          <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
            <div className="flex items-baseline justify-between">
              <h3 className="text-[15px] font-semibold">Open tournaments</h3>
              <Link href="/tournaments" className="text-[10.5px] text-[var(--muted)] underline">
                More »
              </Link>
            </div>
            {tournaments.length === 0 ? (
              <p className="mt-3 text-[11.5px] leading-relaxed text-[var(--muted)]">
                No arena scheduled.{" "}
                <Link href="/tournaments" className="text-[var(--accent)] underline">
                  Create one
                </Link>
                .
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-[var(--line)]">
                {tournaments.slice(0, 3).map((tournament) => {
                  const live = tournament.status === "live";
                  return (
                    <li key={tournament.id}>
                      <Link
                        href={`/tournaments/${tournament.id}`}
                        className="block py-2 transition hover:bg-[var(--panel-2)]"
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-[12px]">
                            {live ? "● " : "○ "}
                            {tournament.name}
                          </span>
                          <span className="shrink-0 text-[10px] text-[var(--muted)]">
                            {tournament.timeControl.replace("+", "+")}
                          </span>
                        </span>
                        <span className="mt-1 flex items-center gap-2 text-[10px] text-[var(--muted)]">
                          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--panel-2)]">
                            <span
                              className="block h-full rounded-full bg-[linear-gradient(90deg,#d9c8a0,#b9a173)]"
                              style={{
                                width: `${Math.max(
                                  6,
                                  Math.min(
                                    100,
                                    live
                                      ? ((Date.now() - new Date(tournament.startsAt).getTime()) /
                                          Math.max(
                                            1,
                                            new Date(tournament.endsAt).getTime() -
                                              new Date(tournament.startsAt).getTime(),
                                          )) *
                                          100
                                      : 6,
                                  ),
                                )}%`,
                              }}
                            />
                          </span>
                          <span className="shrink-0">
                            {live
                              ? `${arenaGap(tournament.endsAt, Date.now())} left`
                              : `in ${arenaGap(tournament.startsAt, Date.now())}`}{" "}
                            · {tournament.players} players
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Swag Store — the four real products. */}
          <Link
            href="/store"
            className="group flex items-start gap-4 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 transition hover:border-[#c89b4a]"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#f3e7cf] text-2xl text-[#a9782b]">
              ♜
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold text-[#8a5f1d]">Swag Store</span>
              <span className="mt-0.5 block text-[11.5px] text-[var(--muted)]">
                Play chess in style — tees, hoodies, mugs and totes
              </span>
              <span className="mt-2 block text-[11px] text-[#a9782b]">Browse the shop →</span>
            </span>
          </Link>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)_minmax(0,1.1fr)]">
          {/* Daily puzzle — the one board everyone gets today. */}
          <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-[11px] font-medium uppercase tracking-wider text-[var(--muted)]">
                Puzzle of the day
              </h2>
              <Link href="/puzzles" className="text-[11px] text-[var(--accent)]">
                Solve it →
              </Link>
            </div>
            <Link href="/puzzles" className="group flex items-start gap-4">
              {dailyPuzzle ? (
                <MiniBoard fen={dailyPuzzle.fen} size={196} />
              ) : (
                <div className="flex h-[196px] w-[196px] items-center justify-center rounded-md border border-dashed border-[var(--line)] text-[11px] text-[var(--muted)]">
                  No puzzle imported yet
                </div>
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {dailyPuzzle?.title || "Daily tactic"}
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-[var(--muted)]">
                  {dailyPuzzle
                    ? `Rated ${dailyPuzzle.rating} · ${dailyPuzzle.fen.split(" ")[1] === "w" ? "White" : "Black"} to play`
                    : "Import the daily Lichess puzzle to start a streak."}
                </p>
                <p className="mt-3 text-[11px] text-[var(--accent)] transition group-hover:translate-x-0.5">
                  Find the best move →
                </p>
              </div>
            </Link>
          </div>

          {/* Open lobby — a real person can be waiting right now. */}
          <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="text-[11px] font-medium uppercase tracking-wider text-[var(--muted)]">
                Open lobby
              </h2>
              <Link href="/play" className="text-[11px] text-[var(--accent)]">
                Play →
              </Link>
            </div>
            {openDuels.length === 0 ? (
              <p className="mt-3 text-[11px] leading-relaxed text-[var(--muted)]">
                Nobody is waiting.{" "}
                <Link href="/play" className="text-[var(--accent)] underline">
                  Create a challenge
                </Link>{" "}
                and it appears here.
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-[var(--line)]">
                {openDuels.slice(0, 4).map((duel) => (
                  <li key={duel.code} className="flex items-center justify-between gap-2 py-2">
                    <span className="min-w-0">
                      <span className="block truncate text-[12px]">@{duel.hostHandle}</span>
                      <span className="block text-[10px] text-[var(--muted)]">
                        {duel.timeControl === "correspondence"
                          ? "Correspondence"
                          : duel.timeControl.replace("+", " + ")}{" "}
                        · plays {duel.hostColor === "white" ? "black" : "white"}
                      </span>
                    </span>
                    {duel.hostHandle === viewer?.handle ? (
                      <Link
                        href={`/duel/${duel.code}`}
                        className="shrink-0 rounded-sm border border-[var(--line)] px-2 py-1 text-[10px] text-[var(--muted)]"
                      >
                        Your link
                      </Link>
                    ) : (
                      <Link
                        href={viewer ? `/duel/${duel.code}` : "/login"}
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

          {/* Three latest community games, the way Lichess shows its blog. */}
          <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="text-[11px] font-medium uppercase tracking-wider text-[var(--muted)]">
                From the community
              </h2>
              <Link href="/community" className="text-[11px] text-[var(--accent)]">
                All →
              </Link>
            </div>
            <ul className="mt-2 flex flex-col gap-2">
              {[...studies].reverse().slice(0, 3).map((study) => (
                <li key={study.id}>
                  <Link
                    href={`/community/${study.id}`}
                    className="group flex items-center gap-3 rounded-md border border-[var(--line)] p-2 transition hover:border-[var(--accent)]"
                  >
                    <MiniBoard fen={study.finalFen} size={44} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] font-medium group-hover:text-[var(--accent)]">
                        {study.title}
                      </span>
                      <span className="block truncate text-[10px] text-[var(--muted)]">
                        {study.author || "Community"} · {study.plies} plies
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="mt-4 text-[11px] text-[var(--muted)]">
          {members} players · {gameCount} games saved · clocks and challenges are server-side
        </p>
      </section>
    </main>
  );
}
