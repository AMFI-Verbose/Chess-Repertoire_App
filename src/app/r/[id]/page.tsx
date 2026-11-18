import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import RepertoireBuilder from "@/components/RepertoireBuilder";
import type { NodeDTO } from "@/lib/types";
import { normalizedFen } from "@/lib/chess";

export const dynamic = "force-dynamic";

export default async function RepertoirePage({
  params,
}: {
  // In Next.js 15 route params are async — you must await them.
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // The full ECO table is ~3,900 rows, so it stays on the server. The client
  // asks for a single position description per navigation instead.
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

  // Preload the opening name for every position already in this repertoire.
  // The client can then label navigation instantly; the per-position server
  // call is only needed for a move that was added during this session.
  const nodeKeys = initialNodes.map((node) => normalizedFen(node.fen));
  const rows =
    nodeKeys.length > 0
      ? await prisma.opening.findMany({
          where: { epd: { in: nodeKeys } },
          select: { eco: true, name: true, ply: true, epd: true },
        })
      : [];

  const openingIndex: Record<string, { eco: string; name: string; ply: number }> = {};
  for (const row of rows) {
    const current = openingIndex[row.epd];
    if (!current || row.ply > current.ply) {
      openingIndex[row.epd] = { eco: row.eco, name: row.name, ply: row.ply };
    }
  }

  return (
    <RepertoireBuilder
      repertoireId={repertoire.id}
      name={repertoire.name}
      side={repertoire.side === "black" ? "black" : "white"}
      initialNodes={initialNodes}
      openingIndex={openingIndex}
    />
  );
}
