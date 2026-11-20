import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { deleteGame } from "@/app/actions";
import { levelByNumber } from "@/lib/gameOptions";

export const dynamic = "force-dynamic";

const RESULT_STYLE: Record<string, { label: string; color: string; text: string }> = {
  win: { label: "Win", color: "#81b64c", text: "#0b1602" },
  loss: { label: "Loss", color: "#e0564b", text: "#2a0503" },
  draw: { label: "Draw", color: "#c2a35a", text: "#1b1300" },
};

type Analysis = {
  accuracyWhite: number;
  accuracyBlack: number;
  acplWhite: number;
  acplBlack: number;
  ratedWhite?: number;
  ratedBlack?: number;
};

function parseAnalysis(raw: string | null): Analysis | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Analysis;
    if (typeof parsed.accuracyWhite !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

export default async function GamesPage() {
  const games = await prisma.game.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const wins = games.filter((game) => game.result === "win").length;
  const draws = games.filter((game) => game.result === "draw").length;
  const losses = games.filter((game) => game.result === "loss").length;
  const played = wins + draws + losses;

  const stats = [
    { label: "Games", value: played },
    { label: "Wins", value: wins },
    { label: "Draws", value: draws },
    {
      label: "Win rate",
      value: played === 0 ? "—" : `${Math.round((wins / played) * 100)}%`,
    },
  ];

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-[11px] uppercase tracking-[0.2em] text-[var(--accent)]">
            games
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Your games</h1>
          <p className="mt-1 max-w-xl text-sm text-[var(--muted)]">
            Every finished game against Stockfish is stored here as a PGN, so it can
            be replayed, graded move by move, and exported.
          </p>
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

      {games.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--line)] p-10 text-center">
          <p className="text-sm text-[var(--muted)]">
            No games yet. Open a repertoire → Play, finish a game (mate or resign),
            and it lands here.
          </p>
          <Link
            href="/"
            className="mt-4 inline-block rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-medium text-[#0b1602]"
          >
            Go to repertoires
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {games.map((game) => {
            const style = RESULT_STYLE[game.result] ?? RESULT_STYLE.draw;
            const analysis = parseAnalysis(game.analysis);
            // Accuracy only exists for moves the engine could actually judge —
            // a game that never left the opening book has nothing to score.
            const yourRated = analysis
              ? game.playerColor === "white"
                ? analysis.ratedWhite
                : analysis.ratedBlack
              : undefined;
            const yourAccuracy =
              analysis && yourRated !== undefined && yourRated > 0
                ? game.playerColor === "white"
                  ? analysis.accuracyWhite
                  : analysis.accuracyBlack
                : null;

            return (
              <li
                key={game.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3"
              >
                <span
                  className="w-12 shrink-0 rounded-md py-1 text-center text-[11px] font-semibold"
                  style={{ background: style.color, color: style.text }}
                >
                  {style.label}
                </span>

                <span className="min-w-0 flex-1">
                  <Link
                    href={`/games/${game.id}`}
                    className="block truncate text-sm font-medium hover:text-[var(--accent)]"
                  >
                    vs Stockfish · {levelByNumber(game.level).name}
                  </Link>
                  <span className="mt-0.5 block text-[11px] text-[var(--muted)]">
                    {game.playerColor === "white" ? "White" : "Black"} ·{" "}
                    {game.timeControl === "unlimited" ? "no clock" : game.timeControl} ·{" "}
                    {Math.ceil(game.plies / 2)} moves ·{" "}
                    {new Intl.DateTimeFormat("en-GB", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(game.createdAt)}
                  </span>
                </span>

                {yourAccuracy !== null ? (
                  <span className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[11px] tabular-nums text-[var(--muted)]">
                    {yourAccuracy.toFixed(1)}% accuracy
                  </span>
                ) : (
                  <span className="text-[11px] text-[var(--muted)]">
                    {analysis ? "book only" : "not reviewed"}
                  </span>
                )}

                <Link
                  href={`/games/${game.id}`}
                  className="rounded-lg border border-[var(--line)] px-2.5 py-1 text-[11px] transition hover:border-[var(--accent)]"
                >
                  Review →
                </Link>

                <form action={deleteGame.bind(null, game.id)}>
                  <button
                    type="submit"
                    className="rounded-lg px-2 py-1 text-[11px] text-[var(--muted)] transition hover:text-[#e0564b]"
                    aria-label="Delete game"
                  >
                    Delete
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
