import Link from "next/link";

import { donateAction } from "@/app/support/actions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Donate · Chess Repertoire",
};

const PRESETS = [5, 10, 25, 50];

export default async function SupportPage({
  searchParams,
}: {
  searchParams: Promise<{ thanks?: string; error?: string }>;
}) {
  const { thanks, error } = await searchParams;

  const [total, patrons, monthly] = await Promise.all([
    prisma.donation.aggregate({ _sum: { amountCents: true } }),
    prisma.donation.count(),
    prisma.donation.aggregate({ where: { recurring: true }, _sum: { amountCents: true } }),
  ]);

  const raised = (total._sum.amountCents ?? 0) / 100;
  const perMonth = (monthly._sum.amountCents ?? 0) / 100;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <Link href="/" className="text-[11px] text-[var(--muted)] hover:text-[var(--text)]">
        ← Home
      </Link>
      <header className="mt-2 max-w-2xl">
        <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--accent)]">
          Support the project
        </p>
        <h1 className="mt-1 text-[30px] font-semibold tracking-tight">
          Keep the boards free
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-[var(--muted)]">
          No adverts, no paywalled puzzles, no locked game review. Donations pay for the
          database, the engine and the time it takes to keep the Lichess import running.
        </p>
      </header>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
          <p className="text-2xl font-semibold tabular-nums">${raised.toFixed(0)}</p>
          <p className="text-[10px] uppercase tracking-wider text-[var(--muted)]">pledged so far</p>
        </div>
        <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
          <p className="text-2xl font-semibold tabular-nums">{patrons}</p>
          <p className="text-[10px] uppercase tracking-wider text-[var(--muted)]">patrons</p>
        </div>
        <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
          <p className="text-2xl font-semibold tabular-nums">${perMonth.toFixed(0)}</p>
          <p className="text-[10px] uppercase tracking-wider text-[var(--muted)]">per month</p>
        </div>
      </div>

      {thanks === "1" && (
        <div className="mt-5 rounded-lg border border-[var(--accent)] bg-[var(--accent)]/10 px-4 py-3 text-[12px]">
          <p className="font-medium">Thank you — your pledge is recorded.</p>
          <p className="mt-0.5 text-[var(--muted)]">
            No card was charged. A payment provider is the next piece of plumbing.
          </p>
        </div>
      )}
      {error === "amount" && (
        <p className="mt-5 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-[12px] text-red-700">
          Choose an amount between $1 and $1,000.
        </p>
      )}

      <form
        action={donateAction}
        className="mt-5 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5"
      >
        <fieldset>
          <legend className="text-[11px] font-medium uppercase tracking-wider text-[var(--muted)]">
            One-time amount
          </legend>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {PRESETS.map((amount) => (
              <label
                key={amount}
                className="flex cursor-pointer items-center justify-center rounded-md border border-[var(--line)] py-3 transition hover:border-[var(--accent)] has-[:checked]:border-[var(--accent)] has-[:checked]:bg-[var(--accent)]/10"
              >
                <input
                  type="radio"
                  name="preset"
                  value={amount}
                  defaultChecked={amount === 10}
                  className="sr-only"
                />
                <span className="text-lg font-semibold tabular-nums">${amount}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] text-[var(--muted)]">Or a custom amount (USD)</span>
            <input
              type="number"
              name="custom"
              min={1}
              max={1000}
              step={1}
              placeholder="e.g. 15"
              className="rounded-md border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] text-[var(--muted)]">Name (optional)</span>
            <input
              name="name"
              maxLength={60}
              placeholder="Anonymous"
              className="rounded-md border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
            />
          </label>
        </div>

        <label className="mt-3 flex flex-col gap-1.5">
          <span className="text-[11px] text-[var(--muted)]">Message (optional)</span>
          <textarea
            name="message"
            rows={3}
            maxLength={240}
            placeholder="What would you like to see next?"
            className="rounded-md border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
        </label>

        <label className="mt-3 flex items-center gap-2 text-[12px]">
          <input type="checkbox" name="recurring" className="accent-[var(--accent)]" />
          Make it monthly
        </label>

        <p className="mt-4 rounded-md bg-[var(--panel-2)] px-3 py-2 text-[11px] leading-relaxed text-[var(--muted)]">
          Demo checkout: the pledge is saved in this app&apos;s database; no card is charged and
          nothing is sent to a payment processor yet.
        </p>

        <button
          type="submit"
          className="mt-4 w-full rounded-md bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-95 sm:w-auto"
        >
          Donate →
        </button>
      </form>
    </main>
  );
}
