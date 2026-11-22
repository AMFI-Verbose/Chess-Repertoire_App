import Link from "next/link";

import { listStudies } from "@/app/actions";
import CommunityBrowser from "@/components/CommunityBrowser";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Community · Chess Repertoire",
};

export default async function CommunityPage() {
  const studies = await listStudies();

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-7">
        <p className="mb-2 text-[11px] uppercase tracking-[0.2em] text-[var(--accent)]">
          studies
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Community</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">
          Annotated classics, real games pulled from Lichess tournaments every
          morning, and games published by players like you. Step through them
          move by move, pin a note to a position, and copy any game into your
          own repertoire with one click.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Link
            href="/games"
            className="rounded-lg border border-[var(--accent)] px-3.5 py-2 text-xs font-medium text-[var(--accent)] transition hover:bg-[var(--accent)] hover:text-[#04231d]"
          >
            Publish one of your games →
          </Link>
          <span className="text-[11px] text-[var(--muted)]">
            Finish a game, open it, then publish it with a title of your own.
          </span>
        </div>
      </header>

      {studies.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--line)] p-10 text-center">
          <p className="text-sm text-[var(--muted)]">
            No studies yet — run <code className="text-[var(--accent)]">npm run db:content</code>{" "}
            to load the built-in library.
          </p>
        </div>
      ) : (
        <CommunityBrowser studies={studies} />
      )}
    </main>
  );
}
