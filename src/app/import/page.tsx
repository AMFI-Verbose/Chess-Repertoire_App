import Link from "next/link";

import ImportForm from "@/components/ImportForm";

export const metadata = {
  title: "Import a game · Chess Repertoire",
};

export default function ImportPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <header className="mb-8">
        <Link
          href="/games"
          className="text-xs text-[var(--muted)] transition-colors hover:text-[var(--text)]"
        >
          ← Your games
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          Import a game
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-[var(--muted)]">
          Bring a game in from anywhere and review it with the same engine pass
          every other game gets: accuracy, centipawn loss, a label on every move
          and a graph you can click.
        </p>
      </header>

      <ImportForm />

      <p className="mt-4 px-1 text-[11px] leading-relaxed text-[var(--muted)]">
        Imported games are stored in the same local database and appear in your
        games list, labelled by their PGN headers rather than by an opponent
        rating.
      </p>
    </main>
  );
}
