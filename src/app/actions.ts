"use server";

// Everything in this file runs ON THE SERVER ONLY.
// The browser calls these functions by name over the network — Next.js turns
// them into POST endpoints automatically. This is the whole backend.
// Rule: never trust arguments coming from the client. Re-validate everything.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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
 *   text        — substring match on the name, or a partial ECO code ("B9")
 *   eco         — restrict to one volume (A/B/C/D/E)
 *   movePrefix  — UCI move tokens; filters to lines that *start* with them
 *
 * The last one is what makes the search feel clever: typing "1.e4 c5" on the
 * client is parsed into "e2e4 c7c5", and this returns the whole Sicilian.
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
    filters.push({
      OR: [{ name: { contains: text } }, { eco: { contains: upper } }],
    });
  }

  const prefix = input.movePrefix?.trim();
  if (prefix) {
    filters.push({ movesUci: { startsWith: prefix } });
  }

  const rows = await prisma.opening.findMany({
    where: filters.length > 0 ? { AND: filters } : undefined,
    // A line search reads like a table of contents, so the shortest lines
    // (the family names) come first and the deep variations follow.
    orderBy: prefix ? [{ ply: "asc" }, { name: "asc" }] : [{ name: "asc" }],
    take: limit + 40,
    select: { eco: true, name: true, movesUci: true, ply: true, epd: true },
  });

  // `startsWith` is a raw string comparison, so "e2e4" would also match a line
  // whose first token is "e2e4c7c5". Enforce the token boundary here.
  const bounded = prefix
    ? rows.filter(
        (row) =>
          row.movesUci === prefix || row.movesUci.startsWith(`${prefix} `),
      )
    : rows;

  return bounded.slice(0, limit);
}
