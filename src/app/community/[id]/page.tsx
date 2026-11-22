import Link from "next/link";
import { notFound } from "next/navigation";

import { getStudy } from "@/app/actions";
import { getViewer } from "@/lib/auth";
import StudyViewer from "@/components/StudyViewer";

export const dynamic = "force-dynamic";

export default async function StudyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [study, viewer] = await Promise.all([getStudy(id), getViewer()]);

  if (!study) notFound();

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-6">
        <Link
          href="/community"
          className="text-xs text-[var(--muted)] transition hover:text-[var(--accent)]"
        >
          ← Community
        </Link>
      </header>

      <StudyViewer
        study={study}
        viewer={viewer ? { id: viewer.id, handle: viewer.handle } : null}
      />
    </main>
  );
}
