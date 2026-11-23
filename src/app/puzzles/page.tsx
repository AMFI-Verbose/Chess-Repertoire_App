import { getDailyPuzzle } from "@/app/actions";
import { prisma } from "@/lib/prisma";
import PuzzleTrainer from "@/components/PuzzleTrainer";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Puzzles · Chess Repertoire",
};

export default async function PuzzlesPage({
  searchParams,
}: {
  searchParams: Promise<{ theme?: string }>;
}) {
  const { theme } = await searchParams;
  const [{ puzzle, stats, isDaily }, libraryCount] = await Promise.all([
    getDailyPuzzle(),
    prisma.puzzle.count(),
  ]);

  return (
    <main className="mx-auto max-w-6xl 2xl:max-w-[1440px] px-6 py-10">
      <header className="mb-8">
        <p className="mb-2 text-[11px] uppercase tracking-[0.2em] text-[var(--accent)]">
          tactics
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Puzzles</h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-[var(--muted)]">
          One fresh tactic every day from Lichess, plus
          <strong className="text-[var(--text)]"> {libraryCount.toLocaleString()} </strong>
          tactics stored offline. Practice difficulty tracks your rating, so the
          set hardens as your Elo climbs.
        </p>
      </header>

      <PuzzleTrainer
        initial={puzzle}
        initialStats={stats}
        isDaily={isDaily}
        initialTheme={theme}
      />
    </main>
  );
}
