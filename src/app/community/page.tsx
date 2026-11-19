import Link from "next/link";

import { listStudies } from "@/app/actions";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Community · Chess Repertoire",
};

export default async function CommunityPage() {
  const studies = await listStudies();

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8">
        <p className="mb-2 text-[11px] uppercase tracking-[0.2em] text-[var(--accent)]">
          studies
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Community</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">
          Annotated games that ship with the app, each with a comment thread.
          Step through them move by move, read what others saw, and copy any
          game into your own repertoire with one click.
        </p>
        <p className="mt-2 max-w-2xl text-xs leading-relaxed text-[var(--muted)]">
          No accounts and no server: the library and its threads live in your
          local database. Seeded comments are sample content.
        </p>
      </header>

      <div className="flex flex-col gap-3">
        {studies.map((study, index) => (
          <Link
            key={study.id}
            href={`/community/${study.id}`}
            className="group flex items-center gap-5 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-5 py-4 transition hover:border-[var(--accent)]"
          >
            <span className="w-8 shrink-0 text-center text-xs tabular-nums text-[var(--muted)]">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="truncate font-medium">{study.title}</span>
                {study.eco && (
                  <span className="shrink-0 rounded border border-[var(--line)] px-1.5 py-0.5 text-[10px] text-[var(--muted)]">
                    {study.eco}
                  </span>
                )}
              </span>
              <span className="mt-1 block truncate text-xs text-[var(--muted)]">
                {study.subtitle}
              </span>
            </span>
            <span className="hidden shrink-0 items-center gap-4 text-[11px] text-[var(--muted)] sm:flex">
              <span>{study.plies} plies</span>
              <span>
                {study.commentCount} 💬
              </span>
            </span>
            <span className="shrink-0 text-xs text-[var(--muted)] transition group-hover:text-[var(--accent)]">
              →
            </span>
          </Link>
        ))}

        {studies.length === 0 && (
          <div className="rounded-xl border border-dashed border-[var(--line)] p-10 text-center">
            <p className="text-sm text-[var(--muted)]">
              No studies yet — run <code className="text-[var(--accent)]">npm run db:content</code>{" "}
              to load the built-in library.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
