"use server";

import { normalizedFen } from "@/lib/chess";
import { prisma } from "@/lib/prisma";
import {
  accuracyOf,
  answersFor,
  lineTo,
  scheduleCorrect,
  scheduleWrong,
  trainableNodes,
  type TrainerCard,
  type TrainableNode,
} from "@/lib/trainer";

export type TrainOverview = {
  id: string;
  name: string;
  side: "white" | "black";
  positions: number;
  due: number;
  fresh: number;
  learning: number;
  accuracy: number;
  lastSeen: string | null;
  updatedAt: string;
};

export type Session = {
  repertoireId: string;
  name: string;
  side: "white" | "black";
  cards: TrainerCard[];
  totalDue: number;
  totalFresh: number;
};

async function nodesOf(repertoireId: string): Promise<TrainableNode[]> {
  const rows = await prisma.node.findMany({
    where: { repertoireId },
    select: {
      id: true,
      parentId: true,
      san: true,
      uci: true,
      fen: true,
      ply: true,
      isMain: true,
    },
    orderBy: [{ ply: "asc" }, { createdAt: "asc" }],
  });
  return rows;
}

/** Every repertoire with its due / new / accuracy counts. */
export async function getTrainOverview(): Promise<TrainOverview[]> {
  const repertoires = await prisma.repertoire.findMany({
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, side: true, updatedAt: true },
  });

  const now = Date.now();
  const out: TrainOverview[] = [];

  for (const repertoire of repertoires) {
    const side = repertoire.side === "black" ? "black" : "white";
    const nodes = await nodesOf(repertoire.id);
    const prompts = trainableNodes(nodes, side);

    const reviews = prompts.length
      ? await prisma.review.findMany({
          where: { nodeId: { in: prompts.map((node) => node.id) } },
          select: { nodeId: true, dueAt: true, attempts: true, correct: true, lastSeenAt: true },
        })
      : [];

    const byNode = new Map(reviews.map((review) => [review.nodeId, review]));
    let due = 0;
    let fresh = 0;
    let learning = 0;
    let attempts = 0;
    let correct = 0;
    let lastSeen: Date | null = null;

    for (const prompt of prompts) {
      const review = byNode.get(prompt.id);
      if (!review) {
        fresh += 1;
        continue;
      }
      attempts += review.attempts;
      correct += review.correct;
      if (review.lastSeenAt && (!lastSeen || review.lastSeenAt > lastSeen)) {
        lastSeen = review.lastSeenAt;
      }
      if (review.attempts === 0) fresh += 1;
      else if (review.dueAt.getTime() <= now) due += 1;
      else learning += 1;
    }

    out.push({
      id: repertoire.id,
      name: repertoire.name,
      side,
      positions: prompts.length,
      due,
      fresh,
      learning,
      accuracy: accuracyOf(attempts, correct),
      lastSeen: lastSeen ? lastSeen.toISOString() : null,
      updatedAt: repertoire.updatedAt.toISOString(),
    });
  }

  return out;
}

/**
 * Build a session: everything that is due first, then unseen positions, capped
 * at `limit`. Missing Review rows are created here, so the trainer never needs
 * a separate "prepare" step.
 */
export async function getSession(repertoireId: string, limit = 15): Promise<Session | null> {
  const repertoire = await prisma.repertoire.findUnique({
    where: { id: repertoireId },
    select: { id: true, name: true, side: true },
  });
  if (!repertoire) return null;

  const side = repertoire.side === "black" ? "black" : "white";
  const nodes = await nodesOf(repertoireId);
  const prompts = trainableNodes(nodes, side);

  // Create the shelf: one row per prompt. SQLite has no skipDuplicates, so the
  // existing ids are filtered out first.
  if (prompts.length > 0) {
    const existing = await prisma.review.findMany({
      where: { nodeId: { in: prompts.map((node) => node.id) } },
      select: { nodeId: true },
    });
    const known = new Set(existing.map((row) => row.nodeId));
    const missing = prompts
      .filter((node) => !known.has(node.id))
      .map((node) => ({ nodeId: node.id }));
    if (missing.length > 0) await prisma.review.createMany({ data: missing });
  }

  const reviews = prompts.length
    ? await prisma.review.findMany({
        where: { nodeId: { in: prompts.map((node) => node.id) } },
        select: { nodeId: true, dueAt: true, attempts: true },
      })
    : [];

  const now = Date.now();
  const dueNodes = reviews
    .filter((review) => review.attempts > 0 && review.dueAt.getTime() <= now)
    .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime())
    .slice(0, limit)
    .map((review) => review.nodeId);

  const freshNodes =
    reviews
      .filter((review) => review.attempts === 0)
      .slice(0, Math.max(0, limit - dueNodes.length))
      .map((review) => review.nodeId);

  const chosen = [...dueNodes, ...freshNodes];
  const promptById = new Map(prompts.map((node) => [node.id, node]));

  // Opening names for the chosen positions, in one query.
  const keys = chosen.map((id) => normalizedFen(promptById.get(id)?.fen ?? ""));
  const openings = keys.length
    ? await prisma.opening.findMany({
        where: { epd: { in: keys } },
        select: { eco: true, name: true, epd: true, ply: true },
      })
    : [];
  const openingByKey = new Map<string, { eco: string; name: string; ply: number }>();
  for (const row of openings) {
    const current = openingByKey.get(row.epd);
    if (!current || row.ply > current.ply) {
      openingByKey.set(row.epd, { eco: row.eco, name: row.name, ply: row.ply });
    }
  }

  const cards: TrainerCard[] = chosen.map((id) => {
    const prompt = promptById.get(id)!;
    const key = normalizedFen(prompt.fen);
    const opening = openingByKey.get(key);
    return {
      nodeId: prompt.id,
      fen: prompt.fen,
      ply: prompt.ply,
      line: lineTo(nodes, prompt),
      answers: answersFor(nodes, prompt.id),
      openingName: opening?.name ?? null,
      openingEco: opening?.eco ?? null,
    };
  });

  const totals = {
    totalDue: reviews.filter((review) => review.attempts > 0 && review.dueAt.getTime() <= now).length,
    totalFresh: reviews.filter((review) => review.attempts === 0).length,
  };

  return {
    repertoireId,
    name: repertoire.name,
    side,
    cards,
    ...totals,
  };
}

export type GradeResult = {
  interval: number;
  ease: number;
  dueAt: string;
  correctSoFar: number;
  attemptsSoFar: number;
};

/** Record one answer and reschedule that position. */
export async function gradeCard(input: {
  nodeId: string;
  correct: boolean;
}): Promise<GradeResult> {
  const review = await prisma.review.upsert({
    where: { nodeId: input.nodeId },
    create: { nodeId: input.nodeId },
    update: {},
  });

  const next = input.correct
    ? scheduleCorrect(review.interval, review.ease)
    : scheduleWrong(review.ease);

  const updated = await prisma.review.update({
    where: { nodeId: input.nodeId },
    data: {
      attempts: review.attempts + 1,
      correct: review.correct + (input.correct ? 1 : 0),
      interval: next.interval,
      ease: next.ease,
      dueAt: new Date(Date.now() + next.dueInMs),
      lastSeenAt: new Date(),
    },
  });

  // No revalidatePath here on purpose: refreshing the page mid-session would
  // rebuild the card deck and swallow the feedback the player just earned.
  return {
    interval: updated.interval,
    ease: updated.ease,
    dueAt: updated.dueAt.toISOString(),
    correctSoFar: updated.correct,
    attemptsSoFar: updated.attempts,
  };
}

/** One number for the dashboard banner: how much revision is waiting. */
export async function dueTotal(): Promise<number> {
  const overview = await getTrainOverview();
  return overview.reduce((sum, item) => sum + item.due + item.fresh, 0);
}
