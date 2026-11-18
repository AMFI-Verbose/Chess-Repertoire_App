// Backfill Node.normFen for rows that existed before the column was added.
// Safe to run repeatedly — it only writes rows that are out of sync.

import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const normFen = (fen) => fen.split(" ").slice(0, 4).join(" ");

async function main() {
  const nodes = await prisma.node.findMany();
  let updated = 0;

  for (const node of nodes) {
    const target = normFen(node.fen);
    if (node.normFen !== target) {
      await prisma.node.update({
        where: { id: node.id },
        data: { normFen: target },
      });
      updated += 1;
    }
  }

  console.log(`backfilled ${updated} of ${nodes.length} nodes`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
