import { prisma } from "@/lib/prisma";
import OpeningsExplorer from "@/components/OpeningsExplorer";

export const dynamic = "force-dynamic";

export default async function OpeningsPage() {
  // Start with the alphabet: 40 rows, so the page is never an empty shell.
  const [total, initial] = await Promise.all([
    prisma.opening.count(),
    prisma.opening.findMany({
      orderBy: { name: "asc" },
      take: 40,
      select: { eco: true, name: true, movesUci: true, ply: true, epd: true },
    }),
  ]);

  return <OpeningsExplorer total={total} initial={initial} />;
}
