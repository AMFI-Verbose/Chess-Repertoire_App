"use server";

// Everything in this file runs ON THE SERVER ONLY.
// The browser calls these functions by name over the network — Next.js turns
// them into POST endpoints automatically. This is the whole backend.
// Rule: never trust arguments coming from the client. Re-validate everything.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Chess } from "chess.js";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import {
  START_FEN,
  normalizedFen,
  parsePgnGame,
  splitPgnGames,
  type PgnMove,
} from "@/lib/chess";
import type { NodeDTO } from "@/lib/types";
import { START_RATING, updateRating } from "@/lib/elo";
import { getViewer } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

type DbNode = {
  id: string;
  parentId: string | null;
  san: string;
  uci: string;
  fen: string;
  ply: number;
  comment: string | null;
  isMain: boolean;
};

function toDTO(node: DbNode): NodeDTO {
  return {
    id: node.id,
    parentId: node.parentId,
    san: node.san,
    uci: node.uci,
    fen: node.fen,
    ply: node.ply,
    comment: node.comment,
    isMain: node.isMain,
  };
}

/** Create a new empty repertoire: a row plus its single root node (ply 0). */
export async function createRepertoire(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const sideRaw = String(formData.get("side") ?? "white");
  const side = sideRaw === "black" ? "black" : "white";

  if (name.length === 0) return;
  if (name.length > 80) return;

  const repertoire = await prisma.repertoire.create({
    data: {
      name,
      side,
      nodes: {
        create: {
          san: "",
          uci: "",
          fen: START_FEN,
          ply: 0,
          isMain: true,
        },
      },
    },
  });

  revalidatePath("/");
  redirect(`/r/${repertoire.id}`);
}

/**
 * Add one move to the tree under a given position.
 * The repertoire is derived from the parent node, so the client can't lie about it.
 * The first child of a position automatically becomes the main line.
 */
export async function addMove(input: {
  parentNodeId: string;
  san: string;
  uci: string;
  fen: string;
}): Promise<NodeDTO> {
  const parent = await prisma.node.findUnique({
    where: { id: input.parentNodeId },
  });
  if (!parent) throw new Error("Parent position not found");

  // Idempotent: clicking "add" twice must not create duplicates.
  const existing = await prisma.node.findFirst({
    where: { parentId: parent.id, uci: input.uci },
  });
  if (existing) return toDTO(existing);

  const siblingCount = await prisma.node.count({
    where: { parentId: parent.id },
  });

  const node = await prisma.node.create({
    data: {
      repertoireId: parent.repertoireId,
      parentId: parent.id,
      san: input.san,
      uci: input.uci,
      fen: input.fen,
      normFen: normalizedFen(input.fen),
      ply: parent.ply + 1,
      isMain: siblingCount === 0,
    },
  });

  revalidatePath(`/r/${parent.repertoireId}`);
  return toDTO(node);
}

/** Delete a position and every move that follows it. The root can never be deleted. */
export async function deleteSubtree(nodeId: string): Promise<void> {
  const node = await prisma.node.findUnique({ where: { id: nodeId } });
  if (!node) return;
  if (node.ply === 0) return; // protect the root

  // onDelete: Cascade in the schema removes all descendants for us.
  await prisma.node.delete({ where: { id: nodeId } });

  revalidatePath(`/r/${node.repertoireId}`);
}

/** Promote one sibling to be the main line, demoting the others. */
export async function setMainLine(nodeId: string): Promise<void> {
  const node = await prisma.node.findUnique({ where: { id: nodeId } });
  if (!node || node.ply === 0) return;

  await prisma.$transaction([
    prisma.node.updateMany({
      where: { parentId: node.parentId },
      data: { isMain: false },
    }),
    prisma.node.update({ where: { id: nodeId }, data: { isMain: true } }),
  ]);

  revalidatePath(`/r/${node.repertoireId}`);
}

/** Save a personal note on a position. */
export async function saveComment(nodeId: string, comment: string): Promise<void> {
  const node = await prisma.node.findUnique({ where: { id: nodeId } });
  if (!node) return;

  await prisma.node.update({
    where: { id: nodeId },
    data: { comment: comment.trim().slice(0, 2000) || null },
  });

  revalidatePath(`/r/${node.repertoireId}`);
}

/**
 * Merge one or more pasted PGN games into the tree.
 *
 * The important property: this is an *idempotent merge*, not an insert.
 * Every move is matched against the children that already exist, so pasting
 * the same game twice creates nothing the second time, and a game that shares
 * the first 8 moves with an existing line only adds the moves after they diverge.
 *
 * All writes happen inside one transaction: either the whole paste lands or
 * nothing does, so a bad PGN halfway through can't leave a half-built line.
 */
export async function importPgn(input: {
  repertoireId: string;
  pgn: string;
}): Promise<{
  createdNodes: NodeDTO[];
  gamesImported: number;
  gamesFailed: number;
  movesWalked: number;
}> {
  const root = await prisma.node.findFirst({
    where: { repertoireId: input.repertoireId, ply: 0 },
  });
  if (!root) throw new Error("Repertoire not found");

  const chunks = splitPgnGames(input.pgn);
  const lines: PgnMove[][] = [];
  let gamesFailed = 0;

  for (const chunk of chunks) {
    const moves = parsePgnGame(chunk);
    if (moves && moves.length > 0) lines.push(moves);
    else gamesFailed += 1;
  }

  const movesWalked = lines.reduce((total, line) => total + line.length, 0);

  const createdNodes = await prisma.$transaction(async (tx) => {
    const existing = await tx.node.findMany({
      where: { repertoireId: input.repertoireId },
    });

    // In-memory index of what already exists: "<parentId>|<uci>" -> node.
    // This is what makes the merge O(moves) instead of a query per move.
    const byKey = new Map<string, { id: string; ply: number }>();
    const childCount = new Map<string, number>();

    for (const node of existing) {
      if (!node.parentId) continue; // the root itself has no move
      byKey.set(`${node.parentId}|${node.uci}`, node);
      childCount.set(node.parentId, (childCount.get(node.parentId) ?? 0) + 1);
    }

    const created: NodeDTO[] = [];

    for (const line of lines) {
      let cursorId = root.id;
      let cursorPly = 0;

      for (const move of line) {
        const key = `${cursorId}|${move.uci}`;
        let node = byKey.get(key);

        if (!node) {
          const siblings = childCount.get(cursorId) ?? 0;
          const row = await tx.node.create({
            data: {
              repertoireId: input.repertoireId,
              parentId: cursorId,
              san: move.san,
              uci: move.uci,
              fen: move.fen,
              normFen: normalizedFen(move.fen),
              ply: cursorPly + 1,
              isMain: siblings === 0, // first child of a position = main line
            },
          });
          node = { id: row.id, ply: row.ply };
          byKey.set(key, node);
          childCount.set(cursorId, siblings + 1);
          created.push(toDTO(row));
        }

        cursorId = node.id;
        cursorPly = node.ply;
      }
    }

    return created;
  });

  revalidatePath(`/r/${input.repertoireId}`);

  return {
    createdNodes,
    gamesImported: lines.length,
    gamesFailed,
    movesWalked,
  };
}

export type TranspositionHit = {
  repertoireId: string;
  repertoireName: string;
  nodeId: string;
  sanPath: string[];
};

/**
 * Auto-detection: does the current position also occur in ANOTHER repertoire?
 *
 * That is the whole point of `normFen`. A position reached by 1.e4 c5 2.Nf3 d6
 * and by 1.e4 d6 2.d4 c5 3.Nf3 is the same position, so both tree nodes share
 * one `normFen` value and one indexed lookup finds them. This is how you discover
 * that your White and Black repertoires meet in the same middlegame.
 */
export async function findTranspositions(input: {
  normFen: string;
  excludeRepertoireId: string;
}): Promise<TranspositionHit[]> {
  const matches = await prisma.node.findMany({
    where: {
      normFen: input.normFen,
      ply: { gt: 0 },
      repertoireId: { not: input.excludeRepertoireId },
    },
    include: { repertoire: { select: { id: true, name: true } } },
    take: 50,
  });

  if (matches.length === 0) return [];

  // One extra query loads every node of the involved repertoires, so building
  // the SAN path for each hit costs no further round trips.
  const repertoireIds = Array.from(new Set(matches.map((m) => m.repertoireId)));
  const allNodes = await prisma.node.findMany({
    where: { repertoireId: { in: repertoireIds } },
  });

  const parentIndex = new Map<
    string,
    { parentId: string | null; san: string; ply: number }
  >();
  for (const node of allNodes) {
    parentIndex.set(node.id, {
      parentId: node.parentId,
      san: node.san,
      ply: node.ply,
    });
  }

  const pathOf = (nodeId: string): string[] => {
    const parts: string[] = [];
    let cursor = parentIndex.get(nodeId);
    let guard = 0;
    while (cursor && cursor.ply > 0 && guard < 300) {
      parts.unshift(cursor.san);
      cursor = cursor.parentId ? parentIndex.get(cursor.parentId) : undefined;
      guard += 1;
    }
    return parts;
  };

  const hits: TranspositionHit[] = [];
  const seen = new Set<string>();

  for (const match of matches) {
    if (seen.has(match.repertoireId)) continue; // one hit per repertoire
    seen.add(match.repertoireId);
    hits.push({
      repertoireId: match.repertoireId,
      repertoireName: match.repertoire.name,
      nodeId: match.id,
      sanPath: pathOf(match.id),
    });
    if (hits.length >= 5) break;
  }

  return hits;
}

export type PositionDescription = {
  opening: { eco: string; name: string; ply: number } | null;
  transpositions: TranspositionHit[];
};

/**
 * One round trip on every navigation, answering both auto-detection questions:
 *
 * 1. "What opening is this?" — the client sends the normalized FEN of every
 *    position in the current line. We walk from the deepest position back to
 *    the root and return the first one that exists in the Lichess ECO table.
 *    That reproduces Lichess's behaviour: an unnamed move still reports the
 *    opening it belongs to.
 * 2. "Does this position occur in another repertoire?" — delegated to
 *    findTranspositions.
 */
export async function describePosition(input: {
  normFens: string[]; // root → current, deepest last
  excludeRepertoireId: string;
}): Promise<PositionDescription> {
  const normFens = input.normFens.filter((f) => f.length > 0);
  if (normFens.length === 0) {
    return { opening: null, transpositions: [] };
  }

  const rows = await prisma.opening.findMany({
    where: { epd: { in: normFens } },
    select: { eco: true, name: true, ply: true, epd: true },
  });

  let opening: PositionDescription["opening"] = null;
  if (rows.length > 0) {
    // Deepest match wins (most specific name for this position).
    const byEpd = new Map<string, { eco: string; name: string; ply: number }>();
    for (const row of rows) {
      const current = byEpd.get(row.epd);
      if (!current || row.ply > current.ply) {
        byEpd.set(row.epd, { eco: row.eco, name: row.name, ply: row.ply });
      }
    }
    for (let index = normFens.length - 1; index >= 0; index -= 1) {
      const hit = byEpd.get(normFens[index]);
      if (hit) {
        opening = hit;
        break;
      }
    }
  }

  const transpositions = await findTranspositions({
    normFen: normFens[normFens.length - 1],
    excludeRepertoireId: input.excludeRepertoireId,
  });

  return { opening, transpositions };
}

export type OpeningSummary = {
  eco: string;
  name: string;
  movesUci: string;
  ply: number;
  epd: string;
};

/**
 * Search the ECO table for the openings browser.
 *
 * Three input modes, mixed freely:
 *   text        — words that all have to appear in the name, or a partial ECO
 *                 code ("B9"); "sicilian najdorf" works, so does "B90 najdorf"
 *   eco         — restrict to one volume (A/B/C/D/E)
 *   movePrefix  — UCI move tokens; filters to lines that *start* with them
 *
 * Typing "1.e4 c5" on the client becomes "e2e4 c7c5" and returns the whole
 * Sicilian. A complete line also pulls in the lines that reach the same
 * position by a different move order (transpositions), which is the one thing
 * a prefix search alone cannot answer.
 */
export async function searchOpenings(input: {
  text?: string;
  eco?: string;
  movePrefix?: string;
  limit?: number;
}): Promise<OpeningSummary[]> {
  const limit = Math.min(Math.max(input.limit ?? 60, 1), 200);
  const filters: Prisma.OpeningWhereInput[] = [];

  if (input.eco && /^[a-eA-E]$/.test(input.eco)) {
    filters.push({ eco: { startsWith: input.eco.toUpperCase() } });
  }

  const text = input.text?.trim();
  if (text) {
    const upper = text.toUpperCase();
    if (/^[a-e]\d{0,2}$/i.test(text)) {
      // A code, whole or partial: "B", "B9", "B90".
      filters.push({ eco: { startsWith: upper } });
    } else {
      // Every word must show up somewhere in the line's name, so a two-word
      // query narrows instead of exploding ("Sicilian Najdorf" not "either").
      const words = text.split(/\s+/).filter(Boolean);
      filters.push({
        AND: words.map((word) => ({
          OR: [
            { name: { contains: word } },
            { eco: { contains: word.toUpperCase() } },
          ],
        })),
      });
    }
  }

  const prefix = input.movePrefix?.trim();
  if (prefix) {
    filters.push({ movesUci: { startsWith: prefix } });
  }

  const rows = await prisma.opening.findMany({
    where: filters.length > 0 ? { AND: filters } : undefined,
    // A line search reads like a table of contents, so the shortest lines
    // (the family names) come first and the deep variations follow.
    orderBy: prefix ? [{ ply: "asc" }, { name: "asc" }] : undefined,
    take: limit + 80,
    select: { eco: true, name: true, movesUci: true, ply: true, epd: true },
  });

  // `startsWith` is a raw string comparison, so "e2e4" would also match a line
  // whose first token is "e2e4c7c5". Enforce the token boundary here.
  let bounded = prefix
    ? rows.filter(
        (row) =>
          row.movesUci === prefix || row.movesUci.startsWith(`${prefix} `),
      )
    : rows;

  // A typed-out line that arrives at a known position by another move order.
  const transpositions: OpeningSummary[] = [];
  if (prefix && bounded.length < 8) {
    const epd = epdOf(prefix);
    if (epd) {
      const same = await prisma.opening.findMany({
        where: { epd, NOT: { movesUci: prefix } },
        orderBy: [{ ply: "asc" }, { name: "asc" }],
        take: 12,
        select: { eco: true, name: true, movesUci: true, ply: true, epd: true },
      });
      for (const row of same) {
        if (!bounded.some((visit) => visit.movesUci === row.movesUci)) {
          transpositions.push(row);
        }
      }
    }
  }

  // Relevance, not the alphabet: an exact code or a name that starts with what
  // was typed comes first, then the family lines, then the deep variations.
  if (text && !prefix) {
    const needle = text.toLowerCase();
    const rank = (row: OpeningSummary) => {
      const name = row.name.toLowerCase();
      if (row.eco.toLowerCase() === needle) return 0;
      if (name.startsWith(needle)) return 1;
      const words = needle.split(/\s+/).filter(Boolean);
      if (words.every((word) => name.startsWith(word) || name.includes(` ${word}`))) {
        return 2;
      }
      return 3;
    };
    bounded = [...bounded].sort(
      (a, b) => rank(a) - rank(b) || a.ply - b.ply || a.name.localeCompare(b.name),
    );
  }

  return [...bounded, ...transpositions].slice(0, limit);
}

/** The four-field FEN of a UCI line, i.e. its position with no move counters. */
function epdOf(movesUci: string): string | null {
  const game = new Chess();
  for (const token of movesUci.split(" ")) {
    if (!token) continue;
    try {
      game.move({
        from: token.slice(0, 2),
        to: token.slice(2, 4),
        promotion: token.length > 4 ? token[4] : "q",
      });
    } catch {
      return null;
    }
  }
  return game.fen().split(" ").slice(0, 4).join(" ");
}

// ===========================================================================
// Puzzles — daily tactics + a practice set
// ===========================================================================

export type PuzzleDTO = {
  id: string;
  fen: string;
  solution: string; // space-separated UCI, starts with the solver's move
  rating: number;
  themes: string;
  title: string;
  source: string;
};

export type PuzzleStats = {
  attempted: number;
  solved: number;
  streak: number;
  accuracy: number;
  /** Elo of the local player, moved by every attempt. */
  rating: number;
  peak: number;
  /** Points gained/lost on the most recent attempt. */
  lastDelta: number;
};

type DbPuzzle = {
  id: string;
  fen: string;
  solution: string;
  rating: number;
  themes: string;
  title: string;
  source: string;
};

function toPuzzleDTO(row: DbPuzzle): PuzzleDTO {
  return {
    id: row.id,
    fen: row.fen,
    solution: row.solution,
    rating: row.rating,
    themes: row.themes,
    title: row.title,
    source: row.source,
  };
}

/** Local calendar date, so the daily puzzle flips at local midnight. */
function today(): string {
  return new Date().toLocaleDateString("sv-SE");
}

/** The single local player. Created on first read — no auth, by design. */
async function ensureProfile() {
  return prisma.profile.upsert({
    where: { id: "local" },
    update: {},
    create: {
      id: "local",
      puzzleRating: START_RATING,
      peakRating: START_RATING,
    },
  });
}

async function puzzleStats(): Promise<PuzzleStats> {
  const profile = await ensureProfile();

  const [attempted, solved, recent, last] = await Promise.all([
    prisma.puzzleAttempt.count(),
    prisma.puzzleAttempt.count({ where: { solved: true } }),
    prisma.puzzleAttempt.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { solved: true },
    }),
    prisma.puzzleAttempt.findFirst({
      orderBy: { createdAt: "desc" },
      select: { ratingBefore: true, ratingAfter: true },
    }),
  ]);

  // Current streak = consecutive solved attempts from the most recent one back.
  let streak = 0;
  for (const attempt of recent) {
    if (!attempt.solved) break;
    streak += 1;
  }

  const lastDelta =
    last && last.ratingBefore != null && last.ratingAfter != null
      ? last.ratingAfter - last.ratingBefore
      : 0;

  return {
    attempted,
    solved,
    streak,
    accuracy: attempted > 0 ? Math.round((solved / attempted) * 100) : 0,
    rating: profile.puzzleRating,
    peak: profile.peakRating,
    lastDelta,
  };
}

/**
 * Fetch and cache Lichess's daily puzzle. Their API returns the game up to the
 * puzzle position plus a UCI solution, which is exactly our storage shape —
 * so a live puzzle and a seeded one are indistinguishable downstream.
 */
async function cacheLichessDaily(day: string): Promise<DbPuzzle | null> {
  try {
    const response = await fetch("https://lichess.org/api/puzzle/daily", {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;

    const payload = (await response.json()) as {
      game?: { id?: string };
      puzzle: {
        id: string;
        initialPgn?: string;
        fen?: string;
        solution: string[];
        rating?: number;
        themes?: string[];
      };
    };

    const puzzle = payload.puzzle;
    if (!puzzle?.solution?.length) return null;

    let fen = puzzle.fen ?? "";
    if (!fen && puzzle.initialPgn) {
      const game = new Chess();
      game.loadPgn(puzzle.initialPgn);
      fen = game.fen();
    }
    if (!fen) return null;

    // Sanity check: every solution move must be legal from that position.
    const board = new Chess(fen);
    for (const uci of puzzle.solution) {
      const move = board.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci.length > 4 ? uci[4] : "q",
      });
      if (!move) return null;
    }

    const id = `lichess-${puzzle.id}`;
    const existing = await prisma.puzzle.findUnique({
      where: { id },
      select: { id: true },
    });

    if (existing) {
      // Lichess keeps serving the same puzzle for a while (the endpoint is
      // published once and reused), so the same puzzle id can arrive on a new
      // day. Keying an upsert on `day` made that a primary-key collision and
      // the daily puzzle silently degraded to a seed puzzle; re-date instead.
      return await prisma.puzzle.update({
        where: { id },
        data: { day },
        select: {
          id: true,
          fen: true,
          solution: true,
          rating: true,
          themes: true,
          title: true,
          source: true,
        },
      });
    }

    return await prisma.puzzle.create({
      data: {
        id,
        fen,
        solution: puzzle.solution.join(" "),
        rating: puzzle.rating ?? 1500,
        themes: (puzzle.themes ?? []).join(" "),
        title: "Lichess daily puzzle",
        source: "lichess-daily",
        day,
      },
      select: {
        id: true,
        fen: true,
        solution: true,
        rating: true,
        themes: true,
        title: true,
        source: true,
      },
    });
  } catch {
    // Offline, rate-limited, or the shape changed — fall back to local content.
    return null;
  }
}

export async function getDailyPuzzle(): Promise<{
  puzzle: PuzzleDTO;
  stats: PuzzleStats;
  isDaily: boolean;
}> {
  const day = today();

  let row = await prisma.puzzle.findUnique({
    where: { day },
    select: {
      id: true,
      fen: true,
      solution: true,
      rating: true,
      themes: true,
      title: true,
      source: true,
    },
  });

  if (!row) row = await cacheLichessDaily(day);

  let isDaily = true;
  if (!row) {
    // No cached daily and no network — serve a local puzzle instead.
    isDaily = false;
    row = await prisma.puzzle.findFirst({
      where: { source: "seed" },
      orderBy: { rating: "asc" },
      select: {
        id: true,
        fen: true,
        solution: true,
        rating: true,
        themes: true,
        title: true,
        source: true,
      },
    });
  }

  if (!row) throw new Error("No puzzles available — run `npm run db:content`");

  return { puzzle: toPuzzleDTO(row), stats: await puzzleStats(), isDaily };
}

/**
 * Adaptive practice puzzle.
 *
 * Difficulty is anchored to the player's rating, so the pool gets harder as
 * the Elo climbs. We widen the search only when the narrow band is empty, and
 * we skip the puzzles attempted most recently so a session does not repeat.
 */
export async function getPracticePuzzle(
  excludeId: string,
  theme?: string,
): Promise<{
  puzzle: PuzzleDTO;
  stats: PuzzleStats;
}> {
  const select = {
    id: true,
    fen: true,
    solution: true,
    rating: true,
    themes: true,
    title: true,
    source: true,
  } as const;

  const profile = await ensureProfile();
  const rating = profile.puzzleRating;

  const recent = await prisma.puzzleAttempt.findMany({
    orderBy: { createdAt: "desc" },
    take: 24,
    select: { puzzleId: true },
  });

  const excluded = Array.from(
    new Set([excludeId, ...recent.map((attempt) => attempt.puzzleId)]),
  );

  // Narrow first: a puzzle rated close to you is the useful one. The upper
  // edge is a little further out, so you are usually reaching slightly up.
  const bands: Array<[number, number]> = [
    [rating - 60, rating + 120],
    [rating - 150, rating + 220],
    [Math.max(400, rating - 350), rating + 400],
    [400, 3200],
  ];

  for (const [min, max] of bands) {
    const where = {
      rating: { gte: min, lte: max },
      id: { notIn: excluded },
      // A theme is a word in a space-separated list ("mateIn1 fork pin").
      ...(theme ? { themes: { contains: theme } } : {}),
    };
    const count = await prisma.puzzle.count({ where });
    if (count === 0) continue;

    const row = await prisma.puzzle.findFirst({
      where,
      orderBy: [{ rating: "asc" }, { id: "asc" }],
      skip: Math.floor(Math.random() * count),
      select,
    });
    if (row) return { puzzle: toPuzzleDTO(row), stats: await puzzleStats() };
  }

  // Every puzzle in the recent list was the whole table: repeat one rather
  // than fail the request.
  const fallback = await prisma.puzzle.findFirst({
    where: {
      id: { not: excludeId },
      ...(theme ? { themes: { contains: theme } } : {}),
    },
    orderBy: { createdAt: "asc" },
    select,
  });
  if (!fallback) throw new Error("No puzzles available — run `npm run db:puzzles`");

  return { puzzle: toPuzzleDTO(fallback), stats: await puzzleStats() };
}

export async function submitPuzzleAttempt(input: {
  puzzleId: string;
  solved: boolean;
}): Promise<PuzzleStats> {
  const puzzle = await prisma.puzzle.findUnique({
    where: { id: input.puzzleId },
    select: { rating: true },
  });
  if (!puzzle) throw new Error("Unknown puzzle");

  const profile = await ensureProfile();
  const attempts = await prisma.puzzleAttempt.count();
  const solved = Boolean(input.solved);

  // One puzzle = one match. Rating gap sets the expectancy.
  const update = updateRating({
    rating: profile.puzzleRating,
    puzzleRating: puzzle.rating,
    solved,
    attempts,
  });

  // Snapshot both ends of the move so history can be replayed or graphed.
  await prisma.puzzleAttempt.create({
    data: {
      puzzleId: input.puzzleId,
      solved,
      ratingBefore: profile.puzzleRating,
      ratingAfter: update.rating,
    },
  });

  await prisma.profile.update({
    where: { id: profile.id },
    data: {
      puzzleRating: update.rating,
      peakRating: Math.max(profile.peakRating, update.rating),
    },
  });

  return puzzleStats();
}

// ===========================================================================
// Studies + comments (the local "community" layer)
// ===========================================================================

export type StudySummary = {
  id: string;
  title: string;
  subtitle: string;
  eco: string;
  author: string;
  source: string;
  plies: number;
  commentCount: number;
  createdAt: string;
};

export type CommentDTO = {
  id: string;
  author: string;
  body: string;
  ply: number;
  createdAt: string;
};

export type StudyDetail = {
  id: string;
  title: string;
  subtitle: string;
  eco: string;
  author: string;
  source: string;
  sourceUrl: string;
  ownerId: string | null;
  pgn: string;
  comments: CommentDTO[];
};

export async function listStudies(): Promise<StudySummary[]> {
  const rows = await prisma.study.findMany({
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { comments: true } } },
  });

  return rows.map((row) => {
    let plies = 0;
    try {
      const game = new Chess();
      game.loadPgn(row.pgn);
      plies = game.history().length;
    } catch {
      plies = 0;
    }
    return {
      id: row.id,
      title: row.title,
      subtitle: row.subtitle,
      eco: row.eco,
      author: row.author,
      source: row.source,
      plies,
      commentCount: row._count.comments,
      createdAt: row.createdAt.toISOString(),
    };
  });
}

export async function getStudy(id: string): Promise<StudyDetail | null> {
  const row = await prisma.study.findUnique({
    where: { id },
    include: { comments: { orderBy: { createdAt: "asc" } } },
  });
  if (!row) return null;

  return {
    id: row.id,
    title: row.title,
    subtitle: row.subtitle,
    eco: row.eco,
    author: row.author,
    source: row.source,
    sourceUrl: row.sourceUrl,
    ownerId: row.userId ?? null,
    pgn: row.pgn,
    comments: row.comments.map((comment) => ({
      id: comment.id,
      author: comment.author,
      body: comment.body,
      ply: comment.ply,
      createdAt: comment.createdAt.toISOString(),
    })),
  };
}

export async function addComment(input: {
  studyId: string;
  body: string;
  ply?: number;
}): Promise<CommentDTO | null> {
  const viewer = await getViewer();
  if (!viewer || !viewer.emailVerified) return null;

  const commentGate = await rateLimit(`comment:user:${viewer.id}`, 6, 60);
  if (!commentGate.ok) return null;

  const body = input.body.trim().slice(0, 600);
  if (body.length === 0) return null;

  const author = viewer.handle;
  const study = await prisma.study.findUnique({
    where: { id: input.studyId },
    select: { id: true },
  });
  if (!study) return null;

  const ply = Math.max(0, Math.floor(input.ply ?? 0));
  const comment = await prisma.comment.create({
    data: { studyId: input.studyId, author, body, ply, userId: viewer.id },
  });

  revalidatePath(`/community/${input.studyId}`);
  return {
    id: comment.id,
    author: comment.author,
    body: comment.body,
    ply: comment.ply,
    createdAt: comment.createdAt.toISOString(),
  };
}

/**
 * Publish one of your own finished games as a community study. The game row
 * stays untouched: the study is a copy of its PGN plus a title and author, so
 * continuing to analyse the game later never rewrites the published version.
 */
export async function publishGameAsStudy(input: {
  gameId: string;
  title?: string;
  subtitle?: string;
  author?: string;
}): Promise<{ studyId: string } | null> {
  const viewer = await getViewer();
  if (!viewer || !viewer.emailVerified) return null;

  const publishGate = await rateLimit(`publish:user:${viewer.id}`, 4, 60 * 60);
  if (!publishGate.ok) return null;

  const game = await prisma.game.findUnique({ where: { id: input.gameId } });
  if (!game || !game.pgn.trim()) return null;

  let plies = game.plies;
  try {
    const parsed = new Chess();
    parsed.loadPgn(game.pgn);
    plies = parsed.history().length;
  } catch {
    // Keep the stored ply count when the PGN cannot be replayed.
  }

  const outcome =
    game.result === "win" ? "won" : game.result === "loss" ? "lost" : "drew";
  const title =
    (input.title ?? "").trim().slice(0, 90) ||
    `${game.playerColor === "white" ? "White" : "Black"} · ${plies} moves · ${outcome}`;
  const subtitle =
    (input.subtitle ?? "").trim().slice(0, 200) ||
    `${game.resultText || `${game.result} as ${game.playerColor}`}${
      game.timeControl && game.timeControl !== "unlimited" ? ` · ${game.timeControl}` : ""
    }`;
  const study = await prisma.study.create({
    data: {
      title,
      subtitle,
      pgn: game.pgn,
      eco: "",
      author: viewer.handle,
      userId: viewer.id,
      source: "local",
    },
  });

  revalidatePath("/community");
  return { studyId: study.id };
}

/** Take your own study down again. The seeded library stays put. */
export async function deleteStudy(input: { studyId: string }): Promise<boolean> {
  const viewer = await getViewer();
  if (!viewer || !viewer.emailVerified) return false;

  const study = await prisma.study.findUnique({
    where: { id: input.studyId },
    select: { id: true, author: true, userId: true },
  });
  if (!study) return false;
  // Only the account that published it, and never the seeded or imported
  // library: those belong to everybody.
  if (study.userId !== viewer.id) return false;

  await prisma.study.delete({ where: { id: study.id } });
  revalidatePath("/community");
  return true;
}

/**
 * Turn a study into a personal repertoire: create the vessel, then hand the
 * PGN to the existing idempotent importer (no second copy of that logic).
 */
export async function addStudyToRepertoire(input: {
  studyId: string;
}): Promise<{ repertoireId: string } | null> {
  const study = await prisma.study.findUnique({ where: { id: input.studyId } });
  if (!study) return null;

  const repertoire = await prisma.repertoire.create({
    data: {
      name: study.title.slice(0, 80),
      side: "white",
      nodes: {
        create: {
          san: "",
          uci: "",
          fen: START_FEN,
          ply: 0,
          isMain: true,
          normFen: normalizedFen(START_FEN),
        },
      },
    },
  });

  await importPgn({ repertoireId: repertoire.id, pgn: study.pgn });

  revalidatePath("/");
  return { repertoireId: repertoire.id };
}

// ===========================================================================
// Games you played against the engine
// ===========================================================================

export type GameAnalysis = {
  accuracyWhite: number;
  accuracyBlack: number;
  acplWhite: number;
  acplBlack: number;
  labels: Record<string, number>;
};

export type SaveGameInput = {
  playerColor: "white" | "black";
  skill: number;
  level: number;
  /** Which character it was, when the opponent was one of the roster. */
  botId?: string | null;
  timeControl: string;
  startFen: string;
  result: "win" | "loss" | "draw";
  resultText: string;
  /** San move text in order, exactly as the board played it. */
  san: string[];
  fen: string;
};

/**
 * Persist a finished game.
 *
 * The client sends the SAN list rather than a PGN string: the server replays
 * it with chess.js, which both validates the game (an illegal move throws) and
 * produces a PGN with correct numbering and headers. Trusting a client-built
 * PGN here would let a malformed game into the record.
 */
export async function saveEngineGame(input: SaveGameInput): Promise<{ id: string }> {
  // Replay from the position the game actually began in. Replaying a game that
  // started from a custom FEN against the standard start position rejects the
  // first black move as illegal and silently stores a truncated game.
  let game: Chess;
  try {
    game = input.startFen ? new Chess(input.startFen) : new Chess();
  } catch {
    game = new Chess();
  }

  let plies = 0;

  for (const san of input.san) {
    try {
      game.move(san);
      plies += 1;
    } catch {
      break; // stop at the first move that does not replay
    }
  }

  game.setHeader("Event", "Play vs Stockfish");
  if (input.startFen) {
    // Without these two headers the PGN would claim the game began on move 1
    // from the standard position, and the replay would fail on the first move.
    game.setHeader("SetUp", "1");
    game.setHeader("FEN", input.startFen);
  }
  game.setHeader("Site", "Chess Repertoire (local)");
  game.setHeader(
    "White",
    input.playerColor === "white" ? "You" : `Stockfish (skill ${input.skill})`,
  );
  game.setHeader(
    "Black",
    input.playerColor === "black" ? "You" : `Stockfish (skill ${input.skill})`,
  );
  game.setHeader(
    "Result",
    input.result === "draw"
      ? "1/2-1/2"
      : (input.result === "win") === (input.playerColor === "white")
        ? "1-0"
        : "0-1",
  );

  const data = {
    kind: "engine",
    playerColor: input.playerColor,
    botId: input.botId ?? null,
    level: Math.max(1, Math.min(8, Math.round(input.level))),
    timeControl: input.timeControl.slice(0, 12),
    startFen: input.startFen.slice(0, 200),
    result: input.result,
    resultText: input.resultText.slice(0, 120),
    skill: Math.max(0, Math.min(20, Math.round(input.skill))),
    pgn: game.pgn({ maxWidth: 80, newline: "\n" }),
    fen: input.fen,
    plies,
  };

  // A finished game is the one thing in this app that must never be lost, so
  // the write gets two chances and a readable failure: a stale Prisma client
  // (one built before the botId migration) rejects the whole row over a
  // column the game can survive without.
  let row: { id: string };
  try {
    row = await prisma.game.create({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/botId/i.test(message)) {
      row = await prisma.game.create({ data: { ...data, botId: null } });
    } else {
      throw new Error(`Could not save this game: ${message.split("\n")[0]}`);
    }
  }

  revalidatePath("/games");
  revalidatePath("/");
  return { id: row.id };
}

/**
 * Import an outside game as a PGN and open it in the review.
 *
 * This is the Lichess "import a game" flow: paste the PGN a tournament site
 * gave you, pick which colour was yours, and the move list lands in the same
 * review every other game uses. The PGN is re-parsed here rather than trusted,
 * so a malformed paste is rejected at the door instead of breaking the board.
 */
export async function importGame(input: {
  pgn: string;
  as: "white" | "black";
}): Promise<{ id: string }> {
  const raw = input.pgn.trim();
  if (!raw) throw new Error("Paste a PGN first.");
  if (raw.length > 200_000) throw new Error("That PGN is too long to import.");

  const board = new Chess();
  try {
    board.loadPgn(raw);
  } catch {
    throw new Error("That text is not a PGN game chess.js can read.");
  }

  const history = board.history({ verbose: true });
  if (history.length === 0) throw new Error("This PGN has no moves in it.");

  const headers = board.getHeaders();
  const resultHeader = headers.Result ?? "*";
  const winner =
    resultHeader === "1-0" ? "white" : resultHeader === "0-1" ? "black" : "draw";
  const outcome: "win" | "loss" | "draw" =
    winner === "draw" ? "draw" : winner === input.as ? "win" : "loss";

  const white = headers.White || "White";
  const black = headers.Black || "Black";
  const event = headers.Event && headers.Event !== "?" ? headers.Event : "Imported game";

  const row = await prisma.game.create({
    data: {
      kind: "import",
      playerColor: input.as,
      result: outcome,
      resultText: `${white} vs ${black} · ${resultHeader}`.slice(0, 120),
      // The engine fields are meaningless for an imported game, so they keep
      // their defaults and the review labels it by its PGN headers instead.
      skill: 12,
      level: 4,
      botId: null,
      timeControl: (headers.TimeControl || "unlimited").slice(0, 12),
      startFen: (headers.FEN ?? "").slice(0, 200),
      pgn: board.pgn({ maxWidth: 80, newline: "\n" }),
      fen: board.fen(),
      plies: history.length,
    },
  });

  void event;
  revalidatePath("/games");
  revalidatePath("/");
  return { id: row.id };
}

/** Store the review's verdict on a saved game, so the history can show accuracy. */
export async function saveGameAnalysis(input: {
  gameId: string;
  analysis: string;
}): Promise<void> {
  const game = await prisma.game.findUnique({
    where: { id: input.gameId },
    select: { id: true },
  });
  if (!game) return;

  await prisma.game.update({
    where: { id: input.gameId },
    data: { analysis: input.analysis.slice(0, 200000) },
  });

  revalidatePath("/games");
  revalidatePath(`/games/${input.gameId}`);
}

export async function deleteGame(gameId: string): Promise<void> {
  await prisma.game.deleteMany({ where: { id: gameId } });
  revalidatePath("/games");
  revalidatePath("/");
}
