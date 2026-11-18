// Seed the full ECO opening table from the free Lichess dataset.
// Source: https://github.com/lichess-org/chess-openings (CC0 public domain)
//
// Each TSV row is [eco, name, pgn]. We replay the PGN with chess.js to derive
// two things the app actually needs:
//   movesUci — the move sequence in a comparable form
//   epd      — the normalized FEN of the final position (the position key)
//
// Run: npm run db:openings

import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { PrismaClient } = require("@prisma/client");
const { Chess } = require("chess.js");

const prisma = new PrismaClient();

const BASE = "https://raw.githubusercontent.com/lichess-org/chess-openings/master";
const FILES = ["a", "b", "c", "d", "e"];

const normFen = (fen) => fen.split(" ").slice(0, 4).join(" ");

async function fetchTsv(name) {
  const response = await fetch(`${BASE}/${name}.tsv`);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${name}.tsv`);
  return await response.text();
}

async function main() {
  const rows = [];
  let skipped = 0;

  for (const file of FILES) {
    const text = await fetchTsv(file);
    const lines = text.split("\n").filter((line) => line.trim().length > 0);

    for (const line of lines) {
      const [eco, name, pgn] = line.split("\t");
      if (!eco || !name || !pgn) {
        skipped += 1;
        continue;
      }

      const game = new Chess();
      const uci = [];
      try {
        game.loadPgn(pgn.trim());
      } catch {
        skipped += 1;
        continue;
      }

      const history = game.history({ verbose: true });
      if (history.length === 0) {
        skipped += 1;
        continue;
      }

      for (const move of history) {
        uci.push(`${move.from}${move.to}${move.promotion ?? ""}`);
      }

      rows.push({
        eco,
        name: name.replace(/_/g, " ").trim(),
        movesUci: uci.join(" "),
        epd: normFen(game.fen()),
        ply: uci.length,
      });
    }
    console.log(`  ${file}.tsv → ${lines.length} lines`);
  }

  const uniqueEpds = new Set(rows.map((r) => r.epd)).size;
  console.log(
    `parsed ${rows.length} openings (${skipped} skipped), ${uniqueEpds} unique positions`,
  );

  await prisma.opening.deleteMany();

  // createMany in chunks so one giant statement doesn't blow SQLite's limits.
  for (let index = 0; index < rows.length; index += 400) {
    await prisma.opening.createMany({ data: rows.slice(index, index + 400) });
  }

  console.log(`inserted ${rows.length} opening rows`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
