import Link from "next/link";
import { notFound } from "next/navigation";

import DuelRoom from "@/components/DuelRoom";
import { getViewer } from "@/lib/auth";
import { getDuelState } from "@/lib/duels";

export const dynamic = "force-dynamic";

export const metadata = { title: "Game · Chess Repertoire" };

export default async function DuelPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const [state, viewer] = await Promise.all([getDuelState(code), getViewer()]);
  if (!state) notFound();

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-7 sm:px-6">
      <header className="mb-5">
        <Link href="/play" className="text-[11px] text-[var(--muted)] hover:text-[var(--text)]">
          ← Play
        </Link>
        <h1 className="mt-1 text-[26px] font-semibold tracking-tight">Challenge</h1>
        <p className="text-[12px] text-[var(--muted)]">
          {state.hostHandle}
          {state.guestHandle ? ` vs ${state.guestHandle}` : " · waiting for an opponent"} ·{" "}
          {state.visibility === "private" ? "private link" : "public lobby"}
        </p>
      </header>

      <DuelRoom
        initial={state}
        viewerHandle={viewer?.handle ?? null}
        viewerVerified={viewer?.emailVerified ?? false}
      />
    </main>
  );
}
