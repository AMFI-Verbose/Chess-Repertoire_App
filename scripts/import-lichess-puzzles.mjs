// Import tactics from Lichess's public puzzle database into SQLite.
//
//   npm run db:puzzles                    # 25,000 puzzles, ratings 700-2400
//   npm run db:puzzles -- --count=60000   # take more next time
//
// The source is https://database.lichess.org/lichess_db_puzzle.csv.zst
// (~309 MB compressed, 5M+ rows). We stream it through `zstd -dc` instead of
// decompressing to disk, keep only puzzles inside the rating band and with
// short solutions, verify each line with chess.js, and bulk-insert with raw
// SQL. Re-running is safe: inserts are INSERT OR IGNORE, so the table only
// grows with new puzzles.

import { spawn } from "node:child_process";
import { createReadStream, existsSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import readline from "node:readline";

const require = createRequire(import.meta.url);
const { PrismaClient } = require("@prisma/client");
const { Chess } = require("chess.js");

const prisma = new PrismaClient();

const CACHE = path.resolve(process.cwd(), ".cache/lichess_db_puzzle.csv.zst");
const URL = "https://database.lichess.org/lichess_db_puzzle.csv.zst";

function arg(name, fallback) {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit ? Number(hit.split("=")[1]) : fallback;
}

const TARGET = arg("count", 25_000);
const MIN_RATING = arg("min", 700);
const MAX_RATING = arg("max", 2400);
const MAX_PLIES = arg("plies", 8);
const MIN_POPULARITY = arg("popularity", 70);
const BATCH = 400;

const THEME_TITLES = {
  mateIn1: "Mate in one",
  mateIn2: "Mate in two",
  mateIn3: "Mate in three",
  mateIn4: "Mate in four",
  mateIn5: "Mate in five",
  fork: "Fork",
  pin: "Pin",
  skewer: "Skewer",
  discoveredAttack: "Discovered attack",
  doubleCheck: "Double check",
  sacrifice: "Sacrifice",
  backRankMate: "Back-rank mate",
  smotheredMate: "Smothered mate",
  hangingPiece: "Hanging piece",
  deflection: "Deflection",
  attraction: "Attraction",
  clearance: "Clearance",
  interference: "Interference",
  xRayAttack: "X-ray attack",
  capturingDefender: "Remove the defender",
  trappedPiece: "Trapped piece",
  promotion: "Promotion",
  enPassant: "En passant",
  zugzwang: "Zugzwang",
  quietMove: "Quiet move",
  defensiveMove: "Defence",
  endgame: "Endgame technique",
  middlegame: "Middlegame tactic",
  opening: "Opening tactic",
};

function titleFor(themes) {
  const first = themes.split(" ")[0] ?? "";
  if (THEME_TITLES[first]) return THEME_TITLES[first];
  return first
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (character) => character.toUpperCase())
    .slice(0, 40);
}

/**
 * Turn a database row into the shape the trainer expects.
 *
 * Lichess stores the FEN *before* the opponent's setup move and lists that
 * setup move first, e.g. `Qxh5 Qg2#` with White to move — the solver is Black
 * and answers from the position after Qxh5. So we play the setup move, then
 * keep only the solver's line. Anything after a checkmate is dropped: the
 * database sometimes appends the move that ended the real game.
 */
function prepare(fen, moves) {
  try {
    const board = new Chess(fen);
    const all = moves.trim().split(" ").filter(Boolean);
    if (all.length < 2) return null;

    const setup = board.move({
      from: all[0].slice(0, 2),
      to: all[0].slice(2, 4),
      promotion: all[0].length > 4 ? all[0][4] : "q",
    });
    if (!setup) return null;

    const startFen = board.fen();
    const solution = [];

    for (const uci of all.slice(1)) {
      const moved = board.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci.length > 4 ? uci[4] : "q",
      });
      if (!moved) return null;
      solution.push(uci);
      if (board.isCheckmate()) break;
    }

    if (solution.length === 0) return null;
    return { fen: startFen, solution: solution.join(" ") };
  } catch {
    return null;
  }
}

const escape = (value) => String(value).replaceAll("'", "''");

async function flush(batch) {
  if (batch.length === 0) return;
  const values = batch
    .map(
      (row) =>
        `('${escape(row.id)}','${escape(row.fen)}','${escape(row.solution)}',${row.rating},'${escape(row.themes)}','${escape(row.title)}','lichess-db',NULL,datetime('now'))`,
    )
    .join(",");
  await prisma.$executeRawUnsafe(
    `INSERT OR IGNORE INTO "Puzzle" (id,fen,solution,rating,themes,title,source,day,createdAt) VALUES ${values}`,
  );
}

async function main() {
  if (!existsSync(CACHE)) {
    console.error(
      `Missing ${CACHE}\nDownload it first:\n  curl -L -o .cache/lichess_db_puzzle.csv.zst ${URL}`,
    );
    process.exit(1);
  }

  if (process.argv.includes("--reset")) {
    const removed = await prisma.puzzle.deleteMany({
      where: { source: "lichess-db" },
    });
    console.log(`  reset: removed ${removed.count.toLocaleString()} imported puzzles`);
  }

  const before = await prisma.puzzle.count();
  console.log(
    `\nImporting up to ${TARGET.toLocaleString()} puzzles rated ${MIN_RATING}-${MAX_RATING} ` +
      `(max ${MAX_PLIES} plies, popularity >= ${MIN_POPULARITY}). DB already holds ${before.toLocaleString()}.\n`,
  );

  // zstd -dc writes the CSV to stdout; we read it line by line and never
  // materialise the whole 1 GB file.
  // The cached file may be a prefix of the full archive (see README), so
  // zstd reports a premature end; the rows before that point are valid.
  const unzip = spawn("zstd", ["-dc", CACHE], {
    stdio: ["ignore", "pipe", "ignore"],
  });
  const lines = readline.createInterface({ input: unzip.stdout });

  let seen = 0;
  let kept = 0;
  let batch = [];
  let inserted = 0;
  const startedAt = Date.now();

  for await (const line of lines) {
    if (!line || line.startsWith("PuzzleId,")) continue;
    seen += 1;

    const parts = line.split(",", 9);
    if (parts.length < 8) continue;

    const [id, fen, solution, ratingRaw, , popularityRaw, , themes] = parts;
    const rating = Number(ratingRaw);
    const popularity = Number(popularityRaw);
    if (!Number.isFinite(rating) || rating < MIN_RATING || rating > MAX_RATING) continue;
    if (!Number.isFinite(popularity) || popularity < MIN_POPULARITY) continue;

    const prepared = prepare(fen, solution);
    if (!prepared) continue;

    const plies = prepared.solution.split(" ").length;
    if (plies > MAX_PLIES) continue;

    batch.push({
      id,
      fen: prepared.fen,
      solution: prepared.solution,
      rating,
      themes,
      title: titleFor(themes),
    });
    kept += 1;

    if (batch.length >= BATCH) {
      await flush(batch);
      inserted += batch.length;
      batch = [];
      if (inserted % 2000 === 0) {
        const seconds = ((Date.now() - startedAt) / 1000).toFixed(0);
        console.log(`  ${inserted.toLocaleString()} inserted · ${seconds}s`);
      }
    }

    if (kept >= TARGET) break;
  }

  await flush(batch);
  inserted += batch.length;
  unzip.kill();

  const after = await prisma.puzzle.count();
  const added = after - before;
  const seconds = ((Date.now() - startedAt) / 1000).toFixed(0);
  const size = (statSync(path.resolve(process.cwd(), "prisma/dev.db")).size / 1e6).toFixed(1);

  console.log(
    `\nscanned ${seen.toLocaleString()} rows · kept ${kept.toLocaleString()} · ` +
      `new rows ${added.toLocaleString()} · DB now ${after.toLocaleString()} puzzles (${size} MB) · ${seconds}s`,
  );

  if (added < kept) {
    console.log(`${(kept - added).toLocaleString()} were duplicates already in the table.`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
