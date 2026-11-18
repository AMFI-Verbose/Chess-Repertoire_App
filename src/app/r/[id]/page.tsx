import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import RepertoireBuilder from "@/components/RepertoireBuilder";
import type { NodeDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function RepertoirePage({
  params,
}: {
  // In Next.js 15 route params are async — you must await them.
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const repertoire = await prisma.repertoire.findUnique({
    where: { id },
    include: {
      nodes: { orderBy: [{ ply: "asc" }, { createdAt: "asc" }] },
    },
  });

  if (!repertoire) notFound();

  const initialNodes: NodeDTO[] = repertoire.nodes.map((node) => ({
    id: node.id,
    parentId: node.parentId,
    san: node.san,
    uci: node.uci,
    fen: node.fen,
    ply: node.ply,
    comment: node.comment,
    isMain: node.isMain,
  }));

  return (
    <RepertoireBuilder
      repertoireId={repertoire.id}
      name={repertoire.name}
      side={repertoire.side === "black" ? "black" : "white"}
      initialNodes={initialNodes}
    />
  );
}
