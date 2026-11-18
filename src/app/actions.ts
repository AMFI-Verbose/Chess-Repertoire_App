"use server";

// Everything in this file runs ON THE SERVER ONLY.
// The browser calls these functions by name over the network — Next.js turns
// them into POST endpoints automatically. This is the whole backend.
// Rule: never trust arguments coming from the client. Re-validate everything.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { START_FEN } from "@/lib/chess";
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
