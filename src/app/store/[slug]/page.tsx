import Link from "next/link";
import { notFound } from "next/navigation";

import { buyProductAction } from "@/app/store/actions";
import { productBySlug, usd } from "@/lib/products";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = productBySlug(slug);
  return { title: product ? `${product.name} · Swag Store` : "Swag Store" };
}

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug } = await params;
  const { error } = await searchParams;
  const product = productBySlug(slug);
  if (!product) notFound();

  const messages: Record<string, string> = {
    size: "Pick a size from the list.",
    name: "Enter the name for the order.",
    email: "Enter a valid email so the order can be confirmed.",
  };

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <Link href="/store" className="text-[11px] text-[var(--muted)] hover:text-[var(--text)]">
        ← Swag Store
      </Link>

      <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
          <div className="relative aspect-square bg-[var(--panel-2)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={product.image}
              alt={product.name}
              className="h-full w-full object-cover"
            />
          </div>
        </div>

        <div>
          <p className="text-[11px] uppercase tracking-[0.18em]" style={{ color: product.accent }}>
            Swag Store
          </p>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight">{product.name}</h1>
          <p className="mt-1 text-[18px] tabular-nums">{usd(product.priceCents)}</p>
          <p className="mt-3 text-[13px] leading-relaxed text-[var(--muted)]">
            {product.description}
          </p>

          {error && messages[error] && (
            <p className="mt-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-[11px] text-red-700">
              {messages[error]}
            </p>
          )}

          <form action={buyProductAction} className="mt-5 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4">
            <input type="hidden" name="slug" value={product.slug} />

            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] text-[var(--muted)]">Size</span>
              <select
                name="size"
                defaultValue={product.sizes[Math.min(1, product.sizes.length - 1)]}
                className="rounded-md border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
              >
                {product.sizes.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] text-[var(--muted)]">Quantity</span>
                <select
                  name="qty"
                  defaultValue="1"
                  className="rounded-md border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                >
                  {[1, 2, 3, 4, 5].map((qty) => (
                    <option key={qty} value={qty}>
                      {qty}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] text-[var(--muted)]">Name</span>
                <input
                  name="name"
                  required
                  minLength={2}
                  maxLength={60}
                  placeholder="Who is it for?"
                  className="rounded-md border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                />
              </label>
            </div>

            <label className="mt-3 flex flex-col gap-1.5">
              <span className="text-[11px] text-[var(--muted)]">Email</span>
              <input
                name="email"
                type="email"
                required
                maxLength={120}
                placeholder="you@example.com"
                className="rounded-md border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
              />
            </label>

            <button
              type="submit"
              className="mt-4 w-full rounded-md bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-95"
            >
              Place order →
            </button>
            <p className="mt-2 text-[10px] leading-relaxed text-[var(--muted)]">
              Demo checkout: the order is saved with an id and shown on the next screen.
              No card is charged.
            </p>
          </form>
        </div>
      </div>
    </main>
  );
}
