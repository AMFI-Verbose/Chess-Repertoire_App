import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";
import PlayVsEngine from "@/components/PlayVsEngine";

export const dynamic = "force-dynamic";

export default async function PlayPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const repertoire = await prisma.repertoire.findUnique({
    where: { id },
    select: { id: true, name: true, side: true },
  });

  if (!repertoire) notFound();

  return (
    <PlayVsEngine
      repertoireId={repertoire.id}
      name={repertoire.name}
      side={repertoire.side === "black" ? "black" : "white"}
    />
  );
}
