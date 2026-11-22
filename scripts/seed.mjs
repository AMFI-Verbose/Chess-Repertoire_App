// Seed two example repertoires so the app has something to explore on first run.
// Run with: npm run db:seed   (safe to run twice — it skips existing names)

import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { PrismaClient } = require("@prisma/client");
const { Chess } = require("chess.js");

const prisma = new PrismaClient();
const START_FEN = new Chess().fen();

const seeds = [
  {
    name: "Italian Game — White",
    side: "white",
    lines: [
      // Giuoco Pianissimo main line
      ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "c3", "Nf6", "d4", "exd4", "cxd4", "Bb4+"],
      // 4.d3 sideline
      ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "d3"],
      // Two Knights Defence — a different 3... move
      ["e4", "e5", "Nf3", "Nc6", "Bc4", "Nf6"],
    ],
  },
  {
    name: "Najdorf Sicilian — Black",
    side: "black",
    lines: [["e4", "c5", "Nf3", "d6", "d4", "cxd4", "Nxd4", "Nf6", "Nc3", "a6"]],
  },
];

async function main() {
  // A fresh install still needs an arena on the home page, otherwise the
  // "Open tournaments" card has nothing real to show.
  if ((await prisma.tournament.count()) === 0) {
    const now = Date.now();
    await prisma.tournament.createMany({
      data: [
        {
          name: "Sunday Blitz Arena",
          timeControl: "3+2",
          startsAt: new Date(now - 20 * 60_000),
          endsAt: new Date(now + 40 * 60_000),
        },
        {
          name: "Daily Rapid Arena",
          timeControl: "10+0",
          startsAt: new Date(now + 2 * 3600_000),
          endsAt: new Date(now + 3 * 3600_000),
        },
      ],
    });
    console.log("created: 2 arena tournaments");
  }

  for (const seed of seeds) {
    const already = await prisma.repertoire.findFirst({
      where: { name: seed.name },
    });
    if (already) {
      console.log(`skip (already exists): ${seed.name}`);
      continue;
    }

    const repertoire = await prisma.repertoire.create({
      data: {
        name: seed.name,
        side: seed.side,
        nodes: {
          create: { san: "", uci: "", fen: START_FEN, ply: 0, isMain: true },
        },
      },
    });

    const root = await prisma.node.findFirst({
      where: { repertoireId: repertoire.id, ply: 0 },
    });

    for (const line of seed.lines) {
      const game = new Chess();
      let parent = root;

      for (const san of line) {
        const move = game.move(san);
        const uci = `${move.from}${move.to}${move.promotion ?? ""}`;

        let node = await prisma.node.findFirst({
          where: { parentId: parent.id, uci },
        });

        if (!node) {
          const siblings = await prisma.node.count({
            where: { parentId: parent.id },
          });
          node = await prisma.node.create({
            data: {
              repertoireId: repertoire.id,
              parentId: parent.id,
              san: move.san,
              uci,
              fen: game.fen(),
              ply: parent.ply + 1,
              isMain: siblings === 0, // first child wins the main-line flag
            },
          });
        }
        parent = node;
      }
    }
    console.log(`created: ${seed.name} (${seed.lines.length} lines)`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
