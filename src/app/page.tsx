import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { createRepertoire } from "./actions";
import { botById } from "@/lib/bots";

// Read from the database on every request — never serve a stale cached page.
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [
    repertoires,
    openingCount,
    solvedPuzzles,
    studyCount,
    recentAttempts,
    profile,
    gameCount,
    recentGames,
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
          Stockfish and grade every move in review.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            href="/play"
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[#0b1602] transition hover:brightness-110"
          >
            Play a character →
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
                            : "bg-[#e8edf5] text-[#0b0e14]"
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
                        vs {botById(game.botId).name} · {game.timeControl} ·{" "}
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
              className="mt-1 rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-[#0b0e14] transition hover:brightness-110"
            >
              Create repertoire
            </button>
          </form>
        </aside>
      </div>
    </main>
  );
}
