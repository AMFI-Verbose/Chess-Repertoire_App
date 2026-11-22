import Link from "next/link";

import { confirmToken } from "@/lib/mail";

export const dynamic = "force-dynamic";

export const metadata = { title: "Confirm your email · Chess Repertoire" };

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const result = token ? await confirmToken(token) : null;

  return (
    <main className="mx-auto max-w-md px-6 py-14">
      <p className="mb-2 text-[11px] uppercase tracking-[0.2em] text-[var(--accent)]">
        community
      </p>

      {result ? (
        <>
          <h1 className="text-2xl font-semibold tracking-tight">Email confirmed</h1>
          <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
            <span className="text-[var(--accent)]">@{result.handle}</span> can now
            publish games and write notes.
          </p>
          <Link
            href="/community"
            className="mt-6 inline-block rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white"
          >
            Go to the community
          </Link>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-semibold tracking-tight">Link expired</h1>
          <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
            This confirmation link is used or older than 24 hours. Sign in and ask
            for a new one from the community page.
          </p>
          <Link
            href="/login"
            className="mt-6 inline-block rounded-lg border border-[var(--line)] px-4 py-2 text-sm text-[var(--muted)] transition hover:text-[var(--text)]"
          >
            Sign in
          </Link>
        </>
      )}
    </main>
  );
}
