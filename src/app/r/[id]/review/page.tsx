import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";
import ReviewSequence, { type ReviewMove } from "@/components/ReviewSequence";
import { normalizedFen } from "@/lib/chess";

export const dynamic = "force-dynamic";

export default async function ReviewPage({
  params,
}: {
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

  // Walk the main line from the root: at every step prefer the child flagged
  // isMain, falling back to the first child (the same rule the builder uses).
  const root = repertoire.nodes.find((node) => node.parentId === null);
  const mainline: typeof repertoire.nodes = [];

  if (root) {
    let cursor = root;
    while (true) {
      const children = repertoire.nodes.filter(
        (node) => node.parentId === cursor.id,
      );
      const next = children.find((child) => child.isMain) ?? children[0];
      if (!next) break;
      mainline.push(next);
      cursor = next;
    }
  }

  const moves: ReviewMove[] = mainline.map((node) => ({
    san: node.san,
    uci: node.uci,
    fen: node.fen,
    ply: node.ply,
  }));

  // "Book" is decided on the server: a position is book if that exact position
  // exists in the Lichess ECO table. One query for the whole line.
  const normFens = mainline.map((node) => normalizedFen(node.fen));
  const known =
    normFens.length > 0
      ? await prisma.opening.findMany({
          where: { epd: { in: normFens } },
          select: { epd: true },
        })
      : [];
  const knownEpds = new Set(known.map((row) => row.epd));
  const bookPlies = mainline
    .filter((node) => knownEpds.has(normalizedFen(node.fen)))
    .map((node) => node.ply);

  return (
    <ReviewSequence
      repertoireId={repertoire.id}
      name={repertoire.name}
      side={repertoire.side === "black" ? "black" : "white"}
      moves={moves}
      bookPlies={bookPlies}
    />
  );
}
