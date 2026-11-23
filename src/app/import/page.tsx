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
          Import your games
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-[var(--muted)]">
          Pull your recent Lichess or chess.com games by username, or paste a single
          PGN. Every imported game opens in the same review: accuracy, centipawn
          loss, a label on every move and a graph you can click.
        </p>
      </header>

      <ImportForm />

      <p className="mt-4 px-1 text-[11px] leading-relaxed text-[var(--muted)]">
        Imported games are stored in the same local database and appear in your
        games list with their real date and original link. Reviewing one also
        turns your mistakes into drill cards for the mistake trainer.
      </p>
    </main>
  );
}
