// Copy the old SQLite database into Postgres, row for row.
//
// The SQLite file is read with the `sqlite3` CLI (JSON output) so this script
// does not need a second Prisma client: one Prisma client, pointed at Postgres,
// writes everything in foreign-key order.
//
// Usage: node scripts/migrate-sqlite-to-postgres.mjs [--sqlite=prisma/dev.db]

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const arg = process.argv.find((value) => value.startsWith("--sqlite="));
const SQLITE = arg ? arg.split("=")[1] : "prisma/dev.db";

/** Date columns per table: SQLite stores them as epoch milliseconds. */
const DATES = {
  Repertoire: ["createdAt", "updatedAt"],
  Node: ["createdAt"],
  Puzzle: ["createdAt"],
  PuzzleAttempt: ["createdAt"],
  Game: ["createdAt"],
  Profile: ["updatedAt"],
  Study: ["createdAt"],
  Comment: ["createdAt"],
  Review: ["dueAt", "lastSeenAt"],
  User: ["createdAt"],
  Session: ["expiresAt", "createdAt"],
};

function dump(table) {
  const result = spawnSync("sqlite3", ["-json", SQLITE, `select * from "${table}";`], {
    encoding: "utf8",
    maxBuffer: 512 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`${table}: ${result.stderr || "sqlite3 failed"}`);
  }
  const text = result.stdout.trim();
  return text ? JSON.parse(text) : [];
}

/** SQLite has both: Prisma's epoch milliseconds and raw `datetime('now')` text. */
function toDate(value) {
  if (typeof value === "number") return new Date(value);
  const text = String(value);
  if (/^\d+$/.test(text)) return new Date(Number(text));
  // "2026-11-20 01:13:14" is UTC, written by SQLite's datetime('now').
  const iso = text.includes("T") ? text : `${text.replace(" ", "T")}Z`;
  return new Date(iso);
}

function clean(table, rows) {
  const dateKeys = DATES[table] ?? [];
  return rows.map((row) => {
    const next = { ...row };
    for (const key of dateKeys) {
      if (next[key] == null) continue;
      next[key] = toDate(next[key]);
    }
    if (table === "Node") next.isMain = Boolean(next.isMain);
    if (table === "PuzzleAttempt") next.solved = Boolean(next.solved);
    if (table === "User") next.emailVerified = Boolean(next.emailVerified);
    return next;
  });
}

async function copy(table, rows, { order } = {}) {
  if (rows.length === 0) {
    console.log(`  ${table}: 0`);
    return;
  }
  const data = clean(table, rows);
  if (order) data.sort(order);
  // Big tables (puzzles, openings) go in chunks so one INSERT is not enormous.
  const size = table === "Puzzle" || table === "Opening" || table === "Node" ? 5000 : 1000;
  for (let index = 0; index < data.length; index += size) {
    await prisma[modelOf(table)].createMany({
      data: data.slice(index, index + size),
      skipDuplicates: true,
    });
  }
  console.log(`  ${table}: ${data.length}`);
}

function modelOf(table) {
  return table[0].toLowerCase() + table.slice(1);
}

async function main() {
  console.log(`Reading ${SQLITE}…`);

  await copy("User", dump("User"));
  await copy("Repertoire", dump("Repertoire"));
  // Parents before children: a node's parent always has a smaller ply.
  await copy("Node", dump("Node"), { order: (a, b) => a.ply - b.ply });
  await copy("Review", dump("Review"));
  await copy("Opening", dump("Opening"));
  await copy("Puzzle", dump("Puzzle"));
  await copy("PuzzleAttempt", dump("PuzzleAttempt"));
  await copy("Game", dump("Game"));
  await copy("Profile", dump("Profile"));
  await copy("Study", dump("Study"));
  await copy("Comment", dump("Comment"));
  await copy("Session", dump("Session"));

  // Everyone who had an account before verification existed is taken as
  // verified; they were already trusted to post.
  const verified = await prisma.user.updateMany({
    where: { emailVerified: false },
    data: { emailVerified: true },
  });
  if (verified.count) console.log(`  marked ${verified.count} existing user(s) verified`);

  await prisma.$disconnect();
  console.log("done");
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
