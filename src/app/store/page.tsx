import Link from "next/link";

import { PRODUCTS, usd } from "@/lib/products";

export const metadata = {
  title: "Swag Store · Chess Repertoire",
};

export default function StorePage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <Link href="/" className="text-[11px] text-[var(--muted)] hover:text-[var(--text)]">
        ← Home
      </Link>
      <header className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-[#9a6a1f]">Swag Store</p>
          <h1 className="mt-1 text-[30px] font-semibold tracking-tight">Play chess in style</h1>
          <p className="mt-1 max-w-xl text-[13px] text-[var(--muted)]">
            Four small things, made properly. Orders are created here; card payment is the
            next integration.
          </p>
        </div>
        <p className="rounded-md border border-[var(--line)] bg-[var(--panel)] px-3 py-1.5 text-[10px] uppercase tracking-wider text-[var(--muted)]">
          Demo checkout · no card charged
        </p>
      </header>

      <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PRODUCTS.map((product) => (
          <li key={product.slug}>
            <Link
              href={`/store/${product.slug}`}
              className="group block overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel)] transition hover:border-[var(--accent)]"
            >
              <div className="relative aspect-square overflow-hidden bg-[var(--panel-2)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={product.image}
                  alt={product.name}
                  className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                />
              </div>
              <div className="px-4 py-3">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="text-[14px] font-semibold">{product.name}</h2>
                  <span className="text-[13px] tabular-nums">{usd(product.priceCents)}</span>
                </div>
                <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--muted)]">
                  {product.blurb}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
