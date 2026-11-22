// Pull real games off Lichess into the community shelf.
//
// Sources, in order of preference:
//   1. Broadcast rounds of top events (the FIDE World Championship feed, etc.)
//   2. Arena tournaments that finished recently — the same hourly arenas you
//      can watch on lichess.org, full of titled players
//
// Every game is replayed with chess.js before it is stored, so a malformed or
// unfinished PGN can never reach the community. Games are keyed by their
// Lichess id, which makes the import idempotent: run it every day and only the
// new games appear.
//
// Usage: node scripts/import-lichess.mjs [--count=8] [--dry] [--min=2200]

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { PrismaClient } = require("@prisma/client");
const { Chess } = require("chess.js");

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const hit = args.find((arg) => arg.startsWith(`--${name}=`));
  return hit ? Number.parseInt(hit.split("=")[1], 10) : fallback;
};
const COUNT = flag("count", 8);
const MIN_ELO = flag("min", 2000);
const DRY = args.includes("--dry");
const KEEP = 220; // imported studies kept on the shelf; the rest rotate out

const HEADERS = { "User-Agent": "chess-repertoire-local/1.0" };

async function get(url, as = "json") {
  const response = await fetch(url, {
    headers: HEADERS,
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`${url} -> ${response.status}`);
  return as === "json" ? response.json() : response.text();
}

const TAG = (pgn, name) => {
  const match = pgn.match(new RegExp(`\\[${name} "([^"]*)"\\]`));
  return match ? match[1] : "";
};

/** A multi-game PGN is just games glued together; split before the [Event] tag. */
function splitGames(text) {
  return text
    .split(/(?=\[Event )/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.startsWith("[Event"));
}

function gameIdOf(pgn) {
  const explicit = TAG(pgn, "GameId");
  if (explicit) return explicit;
  const site = TAG(pgn, "Site");
  const match = site.match(/lichess\.org\/(?:broadcast\/[^\s/]+\/|\w+\/)?([A-Za-z0-9]{8})$/);
  return match ? match[1] : "";
}

function describe(pgn) {
  const chess = new Chess();
  try {
    chess.loadPgn(pgn);
  } catch {
    return null;
  }
  const history = chess.history();
  if (history.length < 12) return null;
  // Only finished games: an ongoing game is a moving target, and its PGN would
  // be rewritten on every visit.
  if (TAG(pgn, "Result") === "*") return null;
  if (TAG(pgn, "Variant") && TAG(pgn, "Variant") !== "Standard") return null;

  const white = TAG(pgn, "White");
  const black = TAG(pgn, "Black");
  if (!white || !black) return null;

  const whiteElo = Number.parseInt(TAG(pgn, "WhiteElo"), 10) || 0;
  const blackElo = Number.parseInt(TAG(pgn, "BlackElo"), 10) || 0;
  const id = gameIdOf(pgn);
  if (!id) return null;

  const opening = TAG(pgn, "Opening") || "Lichess game";
  const eco = TAG(pgn, "ECO") || "";
  const timeControl = TAG(pgn, "TimeControl") || "";
  const event = TAG(pgn, "Event") || "Lichess";

  return {
    id,
    pgn,
    plies: history.length,
    avgElo: (whiteElo + blackElo) / 2,
    white,
    black,
    whiteElo,
    blackElo,
    opening,
    eco,
    event,
    timeControl,
    url: TAG(pgn, "Site") || `https://lichess.org/${id}`,
  };
}

async function fromBroadcasts() {
  const top = await get("https://lichess.org/api/broadcast/top").catch(() => null);
  if (!top || !Array.isArray(top.active)) return [];
  const out = [];
  const tours = top.active.filter((entry) => (entry.tour?.tier ?? 0) >= 3).slice(0, 6);
  for (const entry of tours) {
    const roundId = entry.round?.id;
    if (!roundId) continue;
    try {
      const pgn = await get(`https://lichess.org/api/broadcast/round/${roundId}.pgn`, "text");
      out.push(...splitGames(pgn));
    } catch {
      // A round that vanished between listing and fetching is not an error.
    }
  }
  return out;
}

async function fromTournaments() {
  const list = await get("https://lichess.org/api/tournament").catch(() => null);
  if (!list || !Array.isArray(list.finished)) return [];
  const arenas = list.finished
    .filter((tour) => tour.variant?.key === "standard")
    .slice(0, 8);
  const out = [];
  for (const tour of arenas) {
    try {
      const pgn = await get(
        `https://lichess.org/api/tournament/${tour.id}/games?nb=40&tags=true&clocks=false&evals=false&opening=true`,
        "text",
      );
      out.push(...splitGames(pgn));
    } catch {
      // Skip a tournament whose games endpoint rejects us.
    }
  }
  return out;
}

async function main() {
  console.log("Fetching Lichess games…");
  const [broadcastGames, tournamentGames] = await Promise.all([
    fromBroadcasts(),
    fromTournaments(),
  ]);
  console.log(
    `  broadcast rounds: ${broadcastGames.length} games, tournaments: ${tournamentGames.length} games`,
  );

  const seen = new Set();
  const candidates = [];
  for (const pgn of [...broadcastGames, ...tournamentGames]) {
    const game = describe(pgn);
    if (!game || seen.has(game.id)) continue;
    if (game.whiteElo && game.blackElo && Math.min(game.whiteElo, game.blackElo) < MIN_ELO) {
      continue;
    }
    seen.add(game.id);
    candidates.push(game);
  }

  candidates.sort((a, b) => b.avgElo - a.avgElo);
  console.log(`  ${candidates.length} finished standard games pass the replay check`);

  const existing = new Set(
    (
      await prisma.study.findMany({
        where: { externalId: { not: null } },
        select: { externalId: true },
      })
    ).map((row) => row.externalId),
  );

  const fresh = candidates.filter((game) => !existing.has(game.id)).slice(0, COUNT);
  console.log(`  ${fresh.length} new game(s) to publish`);

  for (const game of fresh) {
    const title = `${game.opening} · ${game.white} vs ${game.black}`.slice(0, 90);
    const subtitle = [
      `${game.white} (${game.whiteElo || "?"}) vs ${game.black} (${game.blackElo || "?"})`,
      game.timeControl ? tcLabel(game.timeControl) : "",
      game.event,
    ]
      .filter(Boolean)
      .join(" · ")
      .slice(0, 200);

    if (DRY) {
      console.log(`  [dry] ${title} — ${game.plies} plies, ${Math.round(game.avgElo)} avg`);
      continue;
    }

    await prisma.study.create({
      data: {
        title,
        subtitle,
        pgn: game.pgn,
        eco: game.eco,
        author: "Lichess",
        source: "lichess",
        sourceUrl: game.url,
        externalId: game.id,
      },
    });
    console.log(`  ✓ ${title} (${game.plies} plies)`);
  }

  if (!DRY) await rotate();
  await prisma.$disconnect();
}

/** Keep the imported shelf bounded; seeded and user studies are never touched. */
async function rotate() {
  const imported = await prisma.study.findMany({
    where: { source: "lichess" },
    orderBy: { createdAt: "desc" },
    select: { id: true, _count: { select: { comments: true } } },
  });
  const excess = imported.slice(KEEP).filter((row) => row._count.comments === 0);
  if (excess.length === 0) return;
  await prisma.study.deleteMany({ where: { id: { in: excess.map((row) => row.id) } } });
  console.log(`  rotated out ${excess.length} old game(s)`);
}

function tcLabel(tc) {
  const match = tc.match(/^(\d+)\+(\d+)$/);
  if (!match) return tc;
  return `${Math.round(Number(match[1]) / 60)}+${match[2]}`;
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
