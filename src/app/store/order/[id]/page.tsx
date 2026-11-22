import Link from "next/link";
import { notFound } from "next/navigation";

import { usd, type OrderLine } from "@/lib/products";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await prisma.swagOrder.findUnique({ where: { id } });
  if (!order) notFound();

  const items = (order.items as OrderLine[] | null) ?? [];
  const placed = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(order.createdAt);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
      <div className="rounded-xl border border-[var(--accent)] bg-[var(--panel)] p-6">
        <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--accent)]">
          Order placed
        </p>
        <h1 className="mt-1 text-[24px] font-semibold tracking-tight">
          Thanks, {order.name}.
        </h1>
        <p className="mt-1 text-[13px] text-[var(--muted)]">
          Order <span className="font-mono text-[11px] text-[var(--text)]">{order.id}</span> · {placed}
        </p>

        <ul className="mt-5 divide-y divide-[var(--line)] rounded-lg border border-[var(--line)]">
          {items.map((line) => (
            <li key={`${line.slug}-${line.size}`} className="flex items-center justify-between gap-3 px-4 py-3">
              <span>
                <span className="block text-[13px] font-medium">
                  {line.name} · {line.size}
                </span>
                <span className="block text-[11px] text-[var(--muted)]">
                  {line.qty} × {usd(line.priceCents)}
                </span>
              </span>
              <span className="text-[13px] tabular-nums">{usd(line.priceCents * line.qty)}</span>
            </li>
          ))}
        </ul>

        <div className="mt-3 flex items-baseline justify-between text-[13px]">
          <span className="text-[var(--muted)]">Total</span>
          <span className="font-semibold tabular-nums">{usd(order.totalCents)}</span>
        </div>

        <p className="mt-5 rounded-md bg-[var(--panel-2)] px-3 py-2 text-[11px] leading-relaxed text-[var(--muted)]">
          Demo checkout: the order is stored and visible here, but no payment was taken and
          nothing ships yet. A confirmation would normally go to {order.email}.
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            href="/store"
            className="rounded-md border border-[var(--line)] px-3 py-2 text-[12px] transition hover:border-[var(--accent)]"
          >
            Back to the store
          </Link>
          <Link
            href="/play"
            className="rounded-md bg-[var(--accent)] px-3 py-2 text-[12px] font-semibold text-white"
          >
            Play a game
          </Link>
        </div>
      </div>
    </main>
  );
}
