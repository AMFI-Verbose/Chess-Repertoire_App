import Link from "next/link";

import { getCommunityPulse, listStudies } from "@/app/actions";
import CommunityBrowser from "@/components/CommunityBrowser";
import VerifyNotice from "@/components/VerifyNotice";
import { getViewer } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Community · Chess Repertoire",
};

function shortDate(iso: string) {
  const date = new Date(iso);
  return `${date.getUTCDate()} ${date.toLocaleString("en-GB", {
    month: "short",
    timeZone: "UTC",
  })}`;
}

export default async function CommunityPage() {
  const [studies, viewer, pulse] = await Promise.all([
    listStudies(),
    getViewer(),
    getCommunityPulse(),
  ]);

  const notes = studies.reduce((sum, study) => sum + study.commentCount, 0);
  const fromLichess = studies.filter((study) => study.source === "lichess").length;
  const latest = studies.reduce(
    (max, study) => (study.createdAt > max ? study.createdAt : max),
    studies[0]?.createdAt ?? new Date().toISOString(),
  );

  const stats = [
    { value: studies.length, label: "games" },
    { value: notes, label: "notes" },
    { value: fromLichess, label: "from Lichess" },
    { value: shortDate(latest), label: "latest arrival" },
  ];

  return (
    <main className="mx-auto max-w-6xl 2xl:max-w-[1440px] px-4 py-7 sm:px-6 lg:py-9">
      <header>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-[28px] font-semibold leading-none tracking-tight sm:text-[32px]">
              Community
            </h1>
            <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-[var(--muted)] sm:text-sm">
              Real games from Lichess tournaments, annotated classics, and studies
              published by players. Step through every move, pin a note to the
              position you are looking at, and copy a game into your own repertoire.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/games"
              className="rounded-sm bg-[var(--accent)] px-3.5 py-2 text-[12px] font-semibold text-white transition hover:brightness-95"
            >
              Publish a game
            </Link>
            <Link
              href="/import"
              className="rounded-sm border border-[var(--line)] bg-[var(--panel)] px-3.5 py-2 text-[12px] font-medium text-[var(--text)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              Import PGN
            </Link>
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-2 overflow-hidden rounded-md border border-[var(--line)] bg-[var(--line)] sm:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="bg-[var(--panel)] px-3.5 py-2.5">
              <dd className="text-[19px] font-semibold leading-none tabular-nums">
                {stat.value}
              </dd>
              <dt className="mt-1 text-[10.5px] uppercase tracking-[0.06em] text-[var(--muted)]">
                {stat.label}
              </dt>
            </div>
          ))}
        </dl>
      </header>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          {viewer && !viewer.emailVerified && (
            <div className="mb-4">
              <VerifyNotice />
            </div>
          )}

          {studies.length === 0 ? (
            <div className="rounded-md border border-dashed border-[var(--line)] bg-[var(--panel)] p-10 text-center">
              <p className="text-sm text-[var(--muted)]">
                No games here yet. Publish one of your own, or run{" "}
                <code className="text-[var(--accent)]">npm run db:content</code> to
                load the built-in library.
              </p>
            </div>
          ) : (
            <CommunityBrowser studies={studies} />
          )}
        </div>

        <aside className="flex flex-col gap-4">
          <section className="overflow-hidden rounded-md border border-[var(--line)] bg-[var(--panel)]">
            <div className="flex items-baseline justify-between border-b border-[var(--line)] px-3.5 py-2.5">
              <h2 className="text-[13px] font-semibold">Latest notes</h2>
              <span className="text-[10px] uppercase tracking-[0.06em] text-[var(--muted)]">
                {notes} total
              </span>
            </div>
            {pulse.notes.length === 0 ? (
              <p className="px-3.5 py-5 text-[12px] leading-relaxed text-[var(--muted)]">
                Notes pinned to a position will appear here. Open any game and add
                the first one.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--line)]">
                {pulse.notes.map((note) => (
                  <li key={note.id}>
                    <Link
                      href={`/community/${note.studyId}`}
                      className="block px-3.5 py-2.5 transition hover:bg-[var(--panel-2)]"
                    >
                      <p className="text-[11px] text-[var(--muted)]">
                        <span className="font-medium text-[var(--text)]">@{note.author}</span>
                        {" · "}
                        {note.ply > 0 ? `move ${note.ply}` : "about the game"}
                      </p>
                      <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-[var(--text)]">
                        {note.body}
                      </p>
                      <p className="mt-1 truncate text-[10.5px] text-[var(--muted)]">
                        on {note.studyTitle}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {pulse.top.some((study) => study.notes > 0) && (
            <section className="overflow-hidden rounded-md border border-[var(--line)] bg-[var(--panel)]">
              <h2 className="border-b border-[var(--line)] px-3.5 py-2.5 text-[13px] font-semibold">
                Most annotated
              </h2>
              <ul className="divide-y divide-[var(--line)]">
                {pulse.top
                  .filter((study) => study.notes > 0)
                  .map((study, index) => (
                    <li key={study.id}>
                      <Link
                        href={`/community/${study.id}`}
                        className="flex items-center gap-3 px-3.5 py-2.5 text-[12px] transition hover:bg-[var(--panel-2)]"
                      >
                        <span className="w-3 tabular-nums text-[var(--muted)]">
                          {index + 1}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{study.title}</span>
                        <span className="shrink-0 text-[10.5px] tabular-nums text-[var(--muted)]">
                          {study.notes}
                        </span>
                      </Link>
                    </li>
                  ))}
              </ul>
            </section>
          )}

          <section className="overflow-hidden rounded-md border border-[var(--line)] bg-[var(--panel)]">
            <h2 className="border-b border-[var(--line)] px-3.5 py-2.5 text-[13px] font-semibold">
              The daily feed
            </h2>
            <div className="px-3.5 py-3">
              <p className="text-[12px] leading-relaxed text-[var(--muted)]">
                Broadcast rounds and finished arenas are pulled from lichess.org
                every morning. Only games where both players are rated 2000+ make
                the cut.
              </p>
              <dl className="mt-3 flex flex-col gap-1.5 text-[11px]">
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--muted)]">Source</dt>
                  <dd>Lichess broadcasts</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--muted)]">Updated</dt>
                  <dd>Daily, 07:20</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--muted)]">Archive</dt>
                  <dd>Latest 220 games</dd>
                </div>
              </dl>
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}
