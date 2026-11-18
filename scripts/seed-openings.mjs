// Seed the Opening reference table.
//
// Every entry is written in SAN and validated by chess.js before it is stored,
// so a typo in the move sequence fails loudly instead of quietly poisoning
// opening detection.
//
// Detection works by longest-prefix match: the app compares your current line
// against `movesUci` and keeps the longest opening that still matches.
// Add rows to extend coverage — no code change needed.

import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { PrismaClient } = require("@prisma/client");
const { Chess } = require("chess.js");

const prisma = new PrismaClient();

// [ECO, Name, moves in SAN]
const OPENINGS = [
  ["A00", "Queen's Pawn Opening", "d4"],
  ["A01", "Nimzo-Larsen Attack", "b3"],
  ["A02", "Bird's Opening", "f4"],
  ["A04", "Réti Opening", "Nf3"],
  ["A10", "English Opening", "c4"],
  ["A20", "English Opening, Reversed Sicilian", "c4 e5"],
  ["A30", "English Opening, Symmetrical", "c4 c5"],
  ["A80", "Dutch Defence", "d4 f5"],
  ["B00", "King's Pawn Opening", "e4"],
  ["B00", "Alekhine Defence", "e4 Nf6"],
  ["B00", "Nimzowitsch Defence", "e4 Nc6"],
  ["B01", "Scandinavian Defence", "e4 d5"],
  ["B02", "Scandinavian, Main Line", "e4 d5 exd5 Nf6"],
  ["B06", "Modern Defence", "e4 g6"],
  ["B07", "Pirc Defence", "e4 d6"],
  ["B07", "Pirc Defence, Classical", "e4 d6 d4 Nf6 Nc3 g6"],
  ["B10", "Caro-Kann Defence", "e4 c6"],
  ["B12", "Caro-Kann, Advance Variation", "e4 c6 d4 d5 e5"],
  ["B13", "Caro-Kann, Exchange Variation", "e4 c6 d4 d5 exd5 cxd5"],
  ["B18", "Caro-Kann, Classical", "e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5"],
  ["B20", "Sicilian Defence", "e4 c5"],
  ["B22", "Sicilian, Alapin Variation", "e4 c5 c3"],
  ["B23", "Sicilian, Closed", "e4 c5 Nc3"],
  ["B30", "Sicilian, Old Variation", "e4 c5 Nf3 Nc6"],
  ["B40", "Sicilian, Paulsen Variation", "e4 c5 Nf3 e6"],
  ["B50", "Sicilian, Modern Variations", "e4 c5 Nf3 d6"],
  ["B70", "Sicilian, Dragon Variation", "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6"],
  ["B80", "Sicilian, Scheveningen Variation", "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 e6"],
  ["B90", "Sicilian, Najdorf Variation", "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6"],
  [
    "B90",
    "Sicilian, Najdorf, English Attack",
    "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3 e5",
  ],
  ["C00", "French Defence", "e4 e6"],
  ["C01", "French, Exchange Variation", "e4 e6 d4 d5 exd5 exd5"],
  ["C02", "French, Advance Variation", "e4 e6 d4 d5 e5"],
  ["C03", "French, Tarrasch Variation", "e4 e6 d4 d5 Nd2"],
  ["C11", "French, Classical Variation", "e4 e6 d4 d5 Nc3 Nf6"],
  ["C20", "King's Pawn Game", "e4 e5"],
  ["C23", "Bishop's Opening", "e4 e5 Bc4"],
  ["C25", "Vienna Game", "e4 e5 Nc3"],
  ["C30", "King's Gambit", "e4 e5 f4"],
  ["C33", "King's Gambit Accepted", "e4 e5 f4 exf4"],
  ["C40", "King's Knight Opening", "e4 e5 Nf3"],
  ["C41", "Philidor Defence", "e4 e5 Nf3 d6"],
  ["C42", "Petrov Defence", "e4 e5 Nf3 Nf6"],
  ["C44", "Open Game", "e4 e5 Nf3 Nc6"],
  ["C45", "Scotch Game", "e4 e5 Nf3 Nc6 d4"],
  ["C47", "Four Knights Game", "e4 e5 Nf3 Nc6 Nc3 Nf6"],
  ["C50", "Italian Game", "e4 e5 Nf3 Nc6 Bc4"],
  ["C50", "Giuoco Piano", "e4 e5 Nf3 Nc6 Bc4 Bc5"],
  ["C50", "Giuoco Pianissimo", "e4 e5 Nf3 Nc6 Bc4 Bc5 c3"],
  ["C55", "Two Knights Defence", "e4 e5 Nf3 Nc6 Bc4 Nf6"],
  ["C60", "Ruy Lopez", "e4 e5 Nf3 Nc6 Bb5"],
  ["C65", "Ruy Lopez, Berlin Defence", "e4 e5 Nf3 Nc6 Bb5 Nf6"],
  ["C68", "Ruy Lopez, Exchange Variation", "e4 e5 Nf3 Nc6 Bb5 a6 Bxc6"],
  ["C84", "Ruy Lopez, Closed", "e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6"],
  ["D00", "Closed Game", "d4 d5"],
  ["D02", "London System", "d4 Nf6 Bf4"],
  ["D06", "Queen's Gambit", "d4 d5 c4"],
  ["D10", "Slav Defence", "d4 d5 c4 c6"],
  ["D20", "Queen's Gambit Accepted", "d4 d5 c4 dxc4"],
  ["D30", "Queen's Gambit Declined", "d4 d5 c4 e6"],
  ["D35", "QGD, Exchange Variation", "d4 d5 c4 e6 Nc3 Nf6 cxd5"],
  ["D51", "QGD, Orthodox Defence", "d4 d5 c4 e6 Nc3 Nf6 Bg5"],
  ["D80", "Grünfeld Defence", "d4 Nf6 c4 g6 Nc3 d5"],
  ["E00", "Indian Defence", "d4 Nf6 c4 e6"],
  ["E01", "Catalan Opening", "d4 Nf6 c4 e6 g3"],
  ["E20", "Nimzo-Indian Defence", "d4 Nf6 c4 e6 Nc3 Bb4"],
  ["E60", "King's Indian Defence", "d4 Nf6 c4 g6 Nc3 Bg7"],
  ["E60", "King's Indian, Classical", "d4 Nf6 c4 g6 Nc3 Bg7 e4 d6"],
];

async function main() {
  const rows = [];
  const broken = [];

  for (const [eco, name, sanLine] of OPENINGS) {
    const game = new Chess();
    const uci = [];
    let legal = true;

    for (const san of sanLine.split(" ")) {
      try {
        const move = game.move(san);
        uci.push(`${move.from}${move.to}${move.promotion ?? ""}`);
      } catch {
        legal = false;
        break;
      }
    }

    if (!legal || uci.length !== sanLine.split(" ").length) {
      broken.push(`${eco} ${name} — "${sanLine}"`);
      continue;
    }

    rows.push({ eco, name, movesUci: uci.join(" "), ply: uci.length });
  }

  await prisma.opening.deleteMany();
  await prisma.opening.createMany({ data: rows });

  console.log(`seeded ${rows.length} openings`);
  if (broken.length > 0) {
    console.warn(`SKIPPED ${broken.length} illegal sequences:`);
    broken.forEach((line) => console.warn(`  ${line}`));
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
