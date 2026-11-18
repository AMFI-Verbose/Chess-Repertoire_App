"use server";

// Everything in this file runs ON THE SERVER ONLY.
// The browser calls these functions by name over the network — Next.js turns
// them into POST endpoints automatically. This is the whole backend.
// Rule: never trust arguments coming from the client. Re-validate everything.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  START_FEN,
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
