import { getDailyPuzzle } from "@/app/actions";
import PuzzleTrainer from "@/components/PuzzleTrainer";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Puzzles · Chess Repertoire",
};

export default async function PuzzlesPage() {
  const { puzzle, stats, isDaily } = await getDailyPuzzle();

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8">
        <p className="mb-2 text-[11px] uppercase tracking-[0.2em] text-[var(--accent)]">
          tactics
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Puzzles</h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-[var(--muted)]">
          One fresh tactic every day, plus a practice set that ships offline.
          Your solve streak is stored locally — no account required.
        </p>
      </header>

      <PuzzleTrainer initial={puzzle} initialStats={stats} isDaily={isDaily} />
    </main>
  );
}
