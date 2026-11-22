import Link from "next/link";
import { notFound } from "next/navigation";

import RepertoireTrainer from "@/components/RepertoireTrainer";
import { getSession } from "../actions";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession(id);
  return { title: session ? `Train ${session.name}` : "Train · Chess Repertoire" };
}

export default async function TrainSessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession(id);
  if (!session) notFound();

  if (session.cards.length === 0) {
    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-12">
        <p className="text-[11px] uppercase tracking-wider text-[var(--accent)]">nothing left today</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{session.name}</h1>
        <p className="mt-3 max-w-lg text-sm leading-relaxed text-[var(--muted)]">
          {session.totalFresh > 0
            ? `${session.totalFresh} positions are still waiting for their first pass — reload to pick them up.`
            : session.totalDue > 0
              ? `${session.totalDue} positions are due but could not be loaded. Reload the page.`
              : "Every position is scheduled for a later date. Come back tomorrow — that gap is what makes the recall stick."}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/train" className="rounded-lg border border-[var(--line)] px-3.5 py-2 text-sm transition hover:border-[var(--accent)]">
            ← All repertoires
          </Link>
          <Link href={`/r/${session.repertoireId}`} className="rounded-lg border border-[var(--line)] px-3.5 py-2 text-sm transition hover:border-[var(--accent)]">
            Edit repertoire
          </Link>
        </div>
      </main>
    );
  }

  return (
    <RepertoireTrainer
      repertoireId={session.repertoireId}
      name={session.name}
      side={session.side}
      cards={session.cards}
    />
  );
}
