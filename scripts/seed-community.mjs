// Seed the app's built-in "community" content: a handful of puzzles and
// studies. Everything is verified with chess.js before it is inserted —
// a puzzle whose solution does not end in mate is skipped instead of shipped.
//
// Run: npm run db:content
//
// Note: this is starter content, not a library. The daily puzzle comes from
// Lichess's public API (see `getDailyPuzzle` in actions.ts) and is cached in
// the Puzzle table.

import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { PrismaClient } = require("@prisma/client");
const { Chess } = require("chess.js");

const prisma = new PrismaClient();

// ---------------------------------------------------------------- puzzles ---

const puzzles = [
  {
    id: "seed-opera-game",
    title: "The Opera Game",
    themes: "mateIn2 sac attraction backRankMate",
    rating: 1650,
    pgn: `1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6
          7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8
          13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8#`,
    atPly: 30,
  },
  {
    id: "seed-legal-mate",
    title: "Légal's Mate",
    themes: "mateIn3 discoveredAttack",
    rating: 1450,
    pgn: `1. e4 e5 2. Nf3 d6 3. Bc4 Bg4 4. Nc3 g6 5. Nxe5 Bxd1 6. Bxf7+ Ke7 7. Nd5#`,
    // 10, not 9: the solver must start *after* 5...Bxd1, i.e. on White's move.
    atPly: 10,
  },
  {
    id: "seed-scholar",
    title: "Find the finish",
    themes: "mateIn1 fork",
    rating: 1000,
    fen: "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 4 4",
    solution: ["f3f7"],
  },
  {
    id: "seed-back-rank",
    title: "Back-rank basics",
    themes: "mateIn1 backRankMate",
    rating: 900,
    fen: "6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1",
    solution: ["e1e8"],
  },
];

/** Replay a puzzle's solution from its starting position. Returns uci or null. */
function buildPuzzle(entry) {
  let startFen = entry.fen;
  let solution = entry.solution;

  if (entry.pgn) {
    const game = new Chess();
    try {
      game.loadPgn(entry.pgn);
    } catch {
      return { error: "pgn did not parse" };
    }
    const history = game.history({ verbose: true });
    if (history.length <= entry.atPly) return { error: "not enough moves" };

    // Position the solver sees: after the opponent's move at `atPly`.
    startFen = history[entry.atPly - 1].after;
    solution = history
      .slice(entry.atPly)
      .map((move) => `${move.from}${move.to}${move.promotion ?? ""}`);
  }

  const board = new Chess(startFen);
  for (const uci of solution) {
    try {
      const move = board.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci.length > 4 ? uci[4] : "q",
      });
      if (!move) return { error: `illegal move ${uci}` };
    } catch {
      return { error: `illegal move ${uci}` };
    }
  }

  if (!board.isCheckmate()) {
    return { error: "solution does not end in checkmate" };
  }

  return {
    id: entry.id,
    fen: startFen,
    solution: solution.join(" "),
    rating: entry.rating,
    themes: entry.themes,
    title: entry.title,
    source: "seed",
  };
}

// ----------------------------------------------------------------- studies ---

const studies = [
  {
    title: "The Opera Game",
    subtitle: "Morphy — Duke of Brunswick & Count Isouard, Paris 1858 · White to play",
    eco: "C41",
    pgn: `[Event "Paris Opera"]
[White "Paul Morphy"]
[Black "Duke of Brunswick and Count Isouard"]
[Result "1-0"]

1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6
7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8
13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0`,
    comments: [
      {
        author: "Coach Ravi",
        ply: 0,
        body: "The cleanest development lesson ever played: every piece joins the attack, and none of them is defended by a plan you would not teach a beginner.",
      },
      {
        author: "Anna",
        // 12.O-O-O is White's 12th move, i.e. half-move 23.
        ply: 23,
        body: "12.O-O-O is the moment I always show students — castling into the open file to bring the last piece into the game.",
      },
      {
        author: "Mikhail",
        // 16.Qb8+ is half-move 31.
        ply: 31,
        body: "16.Qb8+ is pure deflection. The knight must take, and then the back rank belongs to White.",
      },
    ],
  },
  {
    title: "The Immortal Game",
    subtitle: "Anderssen — Kieseritzky, London 1851 · a queen and two rooks for mate",
    eco: "C33",
    pgn: `[Event "London"]
[White "Adolf Anderssen"]
[Black "Lionel Kieseritzky"]
[Result "1-0"]

1. e4 e5 2. f4 exf4 3. Bc4 Qh4+ 4. Kf1 b5 5. Bxb5 Nf6 6. Nf3 Qh6 7. d3 Nh5
8. Nh4 Qg5 9. Nf5 c6 10. g4 Nf6 11. Rg1 cxb5 12. h4 Qg6 13. h5 Qg5 14. Qf3 Ng8
15. Bxf4 Qf6 16. Nc3 Bc5 17. Nd5 Qxb2 18. Bd6 Bxg1 19. e5 Qxa1+ 20. Ke2 Na6
21. Nxg7+ Kd8 22. Qf6+ Nxf6 23. Be7# 1-0`,
    comments: [
      {
        author: "Anna",
        ply: 0,
        body: "Three sacrifices in the last five moves. Anderssen was down two rooks and a queen and still did not care.",
      },
      {
        author: "Mikhail",
        // 22.Qf6+ is half-move 43.
        ply: 43,
        body: "Do not try this at home — but do study 22.Qf6+. The deflection is the whole point.",
      },
    ],
  },
  {
    title: "Légal's Mate",
    subtitle: "A 1750 trap that still catches people in 2026 blitz",
    eco: "C41",
    pgn: `[Event "Paris"]
[White "Légal de Kermeur"]
[Black "Saint Brie"]
[Result "1-0"]

1. e4 e5 2. Nf3 d6 3. Bc4 Bg4 4. Nc3 g6 5. Nxe5 Bxd1 6. Bxf7+ Ke7 7. Nd5# 1-0`,
    comments: [
      {
        author: "Coach Ravi",
        ply: 0,
        body: "Classic bait: hang the queen, then mate with two minor pieces. Worth knowing both as the trap and as the refutation.",
      },
    ],
  },
];

async function main() {
  // --- puzzles
  let insertedPuzzles = 0;
  for (const entry of puzzles) {
    const built = buildPuzzle(entry);
    if (built.error) {
      console.warn(`  skipped puzzle "${entry.title}": ${built.error}`);
      continue;
    }
    await prisma.puzzle.upsert({
      where: { id: built.id },
      update: {
        fen: built.fen,
        solution: built.solution,
        rating: built.rating,
        themes: built.themes,
        title: built.title,
      },
      create: built,
    });
    insertedPuzzles += 1;
    console.log(`  puzzle ✓ ${built.title} (${built.solution})`);
  }

  // --- studies
  let insertedStudies = 0;
  for (const entry of studies) {
    const game = new Chess();
    try {
      game.loadPgn(entry.pgn);
    } catch {
      console.warn(`  skipped study "${entry.title}": pgn did not parse`);
      continue;
    }
    if (game.history().length === 0) {
      console.warn(`  skipped study "${entry.title}": no moves`);
      continue;
    }

    const existing = await prisma.study.findFirst({
      where: { title: entry.title },
    });

    if (existing) {
      await prisma.study.update({
        where: { id: existing.id },
        data: {
          pgn: entry.pgn,
          subtitle: entry.subtitle,
          eco: entry.eco,
          author: "Community",
          source: "seed",
        },
      });
      // Backfill the move each seeded note is about, so an older database
      // gains the anchored-comment UI instead of showing every note as general.
      for (const comment of entry.comments) {
        await prisma.comment.updateMany({
          where: { studyId: existing.id, author: comment.author, body: comment.body },
          data: { ply: comment.ply ?? 0 },
        });
      }
      insertedStudies += 1;
      continue;
    }

    const study = await prisma.study.create({
      data: {
        title: entry.title,
        subtitle: entry.subtitle,
        eco: entry.eco,
        pgn: entry.pgn,
        author: "Community",
        source: "seed",
        comments: {
          create: entry.comments.map((comment) => ({
            author: comment.author,
            body: comment.body,
            ply: comment.ply ?? 0,
          })),
        },
      },
    });
    void study;
    insertedStudies += 1;
    console.log(
      `  study ✓ ${entry.title} (${game.history().length} plies, ${entry.comments.length} comments)`,
    );
  }

  console.log(`\nseeded ${insertedPuzzles} puzzles, ${insertedStudies} studies`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
