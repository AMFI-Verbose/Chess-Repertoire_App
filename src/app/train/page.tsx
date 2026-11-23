import Link from "next/link";

import { getTrainOverview } from "./actions";

export const dynamic = "force-dynamic";

export const metadata = { title: "Train · Chess Repertoire" };

function whenLabel(iso: string | null): string {
  if (!iso) return "never reviewed";
  const diff = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return "reviewed just now";
  if (hours < 24) return `reviewed ${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "reviewed yesterday" : `reviewed ${days} days ago`;
}

export default async function TrainPage() {
  const overview = await getTrainOverview();
  const due = overview.reduce((sum, item) => sum + item.due, 0);
  const fresh = overview.reduce((sum, item) => sum + item.fresh, 0);
  const positions = overview.reduce((sum, item) => sum + item.positions, 0);
  const seen = overview.filter((item) => item.lastSeen);
  const accuracy = seen.length
    ? Math.round(seen.reduce((sum, item) => sum + item.accuracy, 0) / seen.length)
    : 0;
  // The hero only promotes real revision that is waiting, not a first pass —
  // otherwise a scratch repertoire with 25 unseen positions outranks the lines
  // you actually reviewed yesterday.
  const nextUp = overview
    .filter((item) => item.due > 0)
    .sort((a, b) => b.due - a.due)[0];

  return (
    <main className="mx-auto w-full max-w-6xl 2xl:max-w-[1440px] px-6 py-10">
      <header className="mb-6">
        <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--accent)]">
          repertoire trainer
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          Drill what you actually play
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">
          Every position in your repertoires where it is <em>your</em> move becomes
          a flashcard. Get it right and it comes back in 3 days, then 7, then 21 —
          get it wrong and it returns tonight. This is the part of an opening
          repertoire that stops the lines evaporating after one week.
        </p>
      </header>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Due now", value: due },
          { label: "Never seen", value: fresh },
          { label: "Positions", value: positions },
          { label: "Accuracy", value: `${accuracy}%` },
        ].map((item) => (
          <div key={item.label} className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
            <p className="text-xl font-semibold tabular-nums">{item.value}</p>
            <p className="text-[10px] uppercase tracking-wider text-[var(--muted)]">{item.label}</p>
          </div>
        ))}
      </div>

      {!nextUp && (
        <div className="mb-4 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-5 py-3.5">
          <p className="text-sm">
            Nothing is due right now{fresh > 0 ? ` — ${fresh} positions are waiting for their first pass` : ""}.
          </p>
          <p className="mt-1 text-[11.5px] leading-relaxed text-[var(--muted)]">
            Pick a repertoire below and start one: the first pass sets the schedule,
            and from then on the queue comes to you.
          </p>
        </div>
      )}

      {nextUp && (
        <Link
          href={`/train/${nextUp.id}`}
          className="group mb-4 flex flex-wrap items-center gap-4 rounded-xl border border-[var(--accent)]/50 bg-[var(--panel)] px-5 py-4 transition hover:border-[var(--accent)]"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--line)] bg-[#f0d9b5] text-lg text-[#b58863]">
            ♟
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] uppercase tracking-wider text-[var(--accent)]">
              {nextUp.due + nextUp.fresh > 0 ? "Start here" : "Everything is scheduled"}
            </span>
            <span className="mt-0.5 block font-medium">{nextUp.name}</span>
            <span className="mt-0.5 block text-xs text-[var(--muted)]">
              {nextUp.due} due · {nextUp.fresh} never seen · {nextUp.accuracy}% recall
            </span>
          </span>
          <span className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-[#0b1602] transition group-hover:translate-x-0.5">
            Train →
          </span>
        </Link>
      )}

      <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">
            Pro feature — unlocked as a preview
          </p>
          <span className="rounded bg-[var(--accent)]/15 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-[var(--accent)]">
            pro
          </span>
        </div>
        <p className="mt-1 max-w-3xl text-[11.5px] leading-relaxed text-[var(--muted)]">
          Scheduling, intervals and recall stats are the pieces people pay a
          subscription for, and they run fully here. Billing is not connected yet,
          so nothing stops you using it — that flag is what a paywall will read.
        </p>
      </section>

      <div className="mt-6 flex flex-col gap-3">
        {overview.length === 0 && (
          <p className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-4 text-sm text-[var(--muted)]">
            No repertoires yet. Build one on the <Link href="/" className="text-[var(--accent)]">dashboard</Link>, then come back.
          </p>
        )}
        {overview.map((item) => {
          const ready = item.positions > 0;
          return (
            <div key={item.id} className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3.5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">
                    {item.name}
                    <span className="ml-2 text-[10px] uppercase tracking-wider text-[var(--muted)]">
                      {item.side}
                    </span>
                  </p>
                  <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                    {item.positions} positions · {item.due} due · {item.fresh} new ·{" "}
                    {item.learning} scheduled · {whenLabel(item.lastSeen)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-24">
                    <div className="h-1.5 overflow-hidden rounded-full bg-[var(--panel-2)]">
                      <div
                        className="h-full rounded-full bg-[var(--accent)]"
                        style={{ width: `${item.positions ? Math.round(((item.positions - item.fresh - item.due) / item.positions) * 100) : 0}%` }}
                      />
                    </div>
                    <p className="mt-1 text-right font-mono text-[10px] text-[var(--muted)]">
                      {item.accuracy}% recall
                    </p>
                  </div>
                  {ready ? (
                    <Link
                      href={`/train/${item.id}`}
                      className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs transition hover:border-[var(--accent)]"
                    >
                      {item.due + item.fresh > 0 ? "Train" : "Review anyway"}
                    </Link>
                  ) : (
                    <Link
                      href={`/r/${item.id}`}
                      className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs text-[var(--muted)] transition hover:border-[var(--accent)]"
                    >
                      Add moves
                    </Link>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
