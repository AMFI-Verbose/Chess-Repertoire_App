import { Chess } from "chess.js";

import { prisma } from "@/lib/prisma";
import { START_FEN, parsePgnGame, pgnHeader, turnAtPly } from "@/lib/chess";

export type MistakeStats = {
  total: number;
  due: number;
  mastered: number;
  attempts: number;
  accuracy: number;
  nextDueAt: string | null;
};

export type MistakeCard = {
  id: string;
  fen: string;
  solution: string;
  playedSan: string;
  bestSan: string;
  label: string;
  gameId: string;
  ply: number;
  gameLabel: string;
  externalUrl: string | null;
  dueAt: string;
  interval: number;
};

type StoredAnalysis = {
  version?: number;
  plies?: number;
  grades?: (string | null)[];
  bestUci?: (string | null)[];
};

function sanForUci(fen: string, uci: string): string {
  if (!uci || uci.length < 4) return "";
  try {
    const board = new Chess(fen);
    const move = board.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci.length > 4 ? uci[4] : "q",
    });
    return move?.san ?? "";
  } catch {
    return "";
  }
}

/**
 * Turn the losing moves of an already-reviewed game into drill cards.
 *
 * The review stores the engine's best move next to every move, so this is a
 * pure reshape: position before the move, best move, what was actually played.
 * Re-running is safe because the unique key is (gameId, ply), and the schedule
 * of an existing card is never reset.
 */
export async function syncMistakesFromAnalysis(
  gameId: string,
  rawAnalysis: string,
): Promise<number> {
  let parsed: StoredAnalysis;
  try {
    parsed = JSON.parse(rawAnalysis) as StoredAnalysis;
  } catch {
    return 0;
  }
  if (!parsed.grades || !parsed.bestUci) return 0;

  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: { id: true, pgn: true, playerColor: true, startFen: true },
  });
  if (!game) return 0;

  const moves = parsePgnGame(game.pgn);
  if (!moves || moves.length === 0) return 0;

  const startFen = game.startFen || START_FEN;
  const positions = [startFen, ...moves.map((move) => move.fen)];
  const player = game.playerColor === "black" ? "b" : "w";
  const keptPlies: number[] = [];
  let inserted = 0;

  for (let index = 0; index < moves.length; index += 1) {
    const label = parsed.grades[index];
    if (label !== "mistake" && label !== "blunder") continue;
    if (turnAtPly(startFen, index) !== player) continue;

    const bestUci = parsed.bestUci[index];
    const playedUci = moves[index].uci;
    if (!bestUci || bestUci === playedUci) continue;

    const fen = positions[index];
    const bestSan = sanForUci(fen, bestUci);
    const ply = index + 1;
    keptPlies.push(ply);

    await prisma.mistake.upsert({
      where: { gameId_ply: { gameId, ply } },
      update: { fen, solution: bestUci, playedUci, playedSan: moves[index].san, bestSan, label },
      create: {
        gameId,
        ply,
        fen,
        solution: bestUci,
        playedUci,
        playedSan: moves[index].san,
        bestSan,
        label,
      },
    });
    inserted += 1;
  }

  await prisma.mistake.deleteMany({
    where: { gameId, ply: { notIn: keptPlies } },
  });
  // A clean game is also a finished extraction: record it so this review is
  // never parsed again just because it happened to contain no mistakes.
  await prisma.game.update({
    where: { id: gameId },
    data: { mistakesSyncedAt: new Date() },
  });
  return inserted;
}

/** Extract cards from reviews that predate the mistake trainer. */
export async function backfillMistakes(take = 30): Promise<number> {
  const games = await prisma.game.findMany({
    where: { analysis: { not: null }, mistakesSyncedAt: null },
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true, analysis: true },
  });
  let cards = 0;
  for (const game of games) {
    if (!game.analysis) continue;
    try {
      cards += await syncMistakesFromAnalysis(game.id, game.analysis);
    } catch {
      // One unreadable old review must not block the rest of the backfill.
    }
  }
  return cards;
}

export async function mistakeStats(gameId?: string): Promise<MistakeStats> {
  const scope = gameId ? { gameId } : {};
  const now = new Date();
  const [total, due, mastered, aggregate, next] = await Promise.all([
    prisma.mistake.count({ where: scope }),
    prisma.mistake.count({ where: { ...scope, dueAt: { lte: now } } }),
    prisma.mistake.count({ where: { ...scope, interval: { gte: 21 } } }),
    prisma.mistake.aggregate({
      where: scope,
      _sum: { attempts: true, solvedCount: true },
    }),
    prisma.mistake.findFirst({
      where: scope,
      orderBy: { dueAt: "asc" },
      select: { dueAt: true },
    }),
  ]);

  const attempts = aggregate._sum.attempts ?? 0;
  const solved = aggregate._sum.solvedCount ?? 0;
  return {
    total,
    due,
    mastered,
    attempts,
    accuracy: attempts > 0 ? Math.round((solved / attempts) * 100) : 0,
    nextDueAt: next?.dueAt.toISOString() ?? null,
  };
}

function card(row: {
  id: string;
  fen: string;
  solution: string;
  playedSan: string;
  bestSan: string;
  label: string;
  gameId: string;
  ply: number;
  dueAt: Date;
  interval: number;
  game: { pgn: string; externalUrl: string | null };
}): MistakeCard {
  const white = pgnHeader(row.game.pgn, "White") || "White";
  const black = pgnHeader(row.game.pgn, "Black") || "Black";
  return {
    id: row.id,
    fen: row.fen,
    solution: row.solution,
    playedSan: row.playedSan,
    bestSan: row.bestSan,
    label: row.label,
    gameId: row.gameId,
    ply: row.ply,
    gameLabel: `${white} vs ${black}`,
    externalUrl: row.game.externalUrl,
    dueAt: row.dueAt.toISOString(),
    interval: row.interval,
  };
}

/** The card that has been waiting longest, optionally scoped to one game. */
export async function nextMistake(
  excludeId?: string,
  gameId?: string,
  ignoreDue = false,
): Promise<MistakeCard | null> {
  const now = new Date();
  const row = await prisma.mistake.findFirst({
    where: {
      ...(gameId ? { gameId } : {}),
      ...(ignoreDue ? {} : { dueAt: { lte: now } }),
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }],
    include: { game: { select: { pgn: true, externalUrl: true } } },
  });
  return row ? card(row) : null;
}

/**
 * One card, one best move. Solved intervals grow 1 → 3 → 7 → 21 → 45 → 90
 * days; a miss brings it back in half an hour instead of punishing it for a
 * week. No Elo is touched here — this is about your own games, not the puzzle
 * rating.
 */
export async function submitMistakeAttempt(
  id: string,
  solved: boolean,
  gameId?: string,
  ignoreDue = false,
): Promise<{ stats: MistakeStats; next: MistakeCard | null; dueAt: string }> {
  const row = await prisma.mistake.findUnique({
    where: { id },
    select: { attempts: true, interval: true },
  });
  if (!row) throw new Error("This mistake card no longer exists.");

  const intervals = [1, 3, 7, 21, 45, 90];
  let nextInterval = 1;
  if (solved) {
    const stage = Math.min(row.attempts, intervals.length - 1);
    nextInterval = intervals[stage];
  }

  const now = new Date();
  const dueAt = solved
    ? new Date(now.getTime() + nextInterval * 24 * 60 * 60_000)
    : new Date(now.getTime() + 30 * 60_000);

  await prisma.mistake.update({
    where: { id },
    data: {
      attempts: { increment: 1 },
      solvedCount: solved ? { increment: 1 } : undefined,
      interval: nextInterval,
      dueAt,
      lastSeen: now,
    },
  });

  return {
    stats: await mistakeStats(gameId),
    next: await nextMistake(id, gameId, ignoreDue),
    dueAt: dueAt.toISOString(),
  };
}

export async function mistakeCountForGame(gameId: string): Promise<number> {
  return prisma.mistake.count({ where: { gameId } });
}
