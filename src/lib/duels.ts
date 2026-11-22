import { Chess } from "chess.js";

import { prisma } from "@/lib/prisma";
import { START_FEN } from "@/lib/chess";
import { timeControlById } from "@/lib/gameOptions";
import type { DuelState, DuelStatus } from "@/lib/duel-types";

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

function makeCode() {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return code;
}

export function timeControlMs(tcId: string) {
  const tc = timeControlById(tcId);
  return (tc.initial ?? 0) * 1000;
}

function colorOf(duel: { hostColor: string; guestId: string | null }, userId: string) {
  if (duel.guestId !== userId) return duel.hostColor as "white" | "black";
  return duel.hostColor === "white" ? "black" : "white";
}

function toState(row: {
  code: string;
  status: string;
  visibility: string;
  timeControl: string;
  clocked: boolean;
  hostColor: string;
  host: { handle: string };
  guest: { handle: string } | null;
  whiteMs: number;
  blackMs: number;
  turn: string;
  fen: string;
  pgn: string;
  winner: string | null;
  resultText: string;
  lastMoveAt: Date | null;
  createdAt: Date;
}): DuelState {
  return {
    code: row.code,
    status: row.status as DuelStatus,
    visibility: row.visibility as "public" | "private",
    timeControl: row.timeControl,
    clocked: row.clocked,
    hostHandle: row.host.handle,
    hostColor: row.hostColor as "white" | "black",
    guestHandle: row.guest?.handle ?? null,
    whiteMs: row.whiteMs,
    blackMs: row.blackMs,
    turn: row.turn as "w" | "b",
    fen: row.fen,
    pgn: row.pgn,
    winner: (row.winner as DuelState["winner"]) ?? null,
    resultText: row.resultText,
    lastMoveAt: row.lastMoveAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

const SELECT = {
  code: true,
  status: true,
  visibility: true,
  timeControl: true,
  clocked: true,
  hostColor: true,
  host: { select: { handle: true } },
  guest: { select: { handle: true } },
  whiteMs: true,
  blackMs: true,
  turn: true,
  fen: true,
  pgn: true,
  winner: true,
  resultText: true,
  lastMoveAt: true,
  createdAt: true,
} as const;

export async function getDuelState(code: string): Promise<DuelState | null> {
  const row = await prisma.duel.findUnique({ where: { code }, select: SELECT });
  return row ? toState(row) : null;
}

export async function listOpenDuels() {
  const rows = await prisma.duel.findMany({
    where: { status: "open", visibility: "public" },
    orderBy: { createdAt: "desc" },
    take: 12,
    select: SELECT,
  });
  return rows.map(toState);
}

export async function listDuelsForUser(userId: string) {
  const rows = await prisma.duel.findMany({
    where: {
      OR: [{ hostId: userId }, { guestId: userId }],
      status: { in: ["open", "playing"] },
    },
    orderBy: { createdAt: "desc" },
    take: 12,
    select: SELECT,
  });
  return rows.map(toState);
}

export async function listFinishedDuelsForUser(userId: string, take = 4) {
  const rows = await prisma.duel.findMany({
    where: {
      OR: [{ hostId: userId }, { guestId: userId }],
      status: "finished",
    },
    orderBy: { updatedAt: "desc" },
    take,
    select: SELECT,
  });
  return rows.map(toState);
}

export async function createDuel(input: {
  hostId: string;
  timeControl: string;
  color: "white" | "black" | "random";
  visibility: "public" | "private";
  tournamentId?: string;
}) {
  const hostColor =
    input.color === "random" ? (Math.random() < 0.5 ? "white" : "black") : input.color;
  const clocked = input.timeControl !== "correspondence" && input.timeControl !== "unlimited";
  const startMs = clocked ? timeControlMs(input.timeControl) : 0;

  let code = makeCode();
  for (let attempt = 0; attempt < 5; attempt++) {
    const clash = await prisma.duel.findUnique({ where: { code }, select: { id: true } });
    if (!clash) break;
    code = makeCode();
  }

  return prisma.duel.create({
    data: {
      code,
      hostId: input.hostId,
      hostColor,
      visibility: input.visibility,
      timeControl: input.timeControl,
      tournamentId: input.tournamentId ?? null,
      clocked,
      whiteMs: startMs,
      blackMs: startMs,
      fen: START_FEN,
    },
    select: SELECT,
  });
}

export async function acceptDuel(code: string, guestId: string): Promise<DuelState> {
  const duel = await prisma.duel.findUnique({ where: { code } });
  if (!duel) throw new Error("This challenge does not exist.");
  if (duel.hostId === guestId) throw new Error("This is your own challenge — send the link to a friend.");
  if (duel.status !== "open") throw new Error("This challenge is no longer open.");

  const updated = await prisma.duel.update({
    where: { id: duel.id },
    data: { guestId, status: "playing", lastMoveAt: new Date() },
    select: SELECT,
  });

  return toState(updated);
}

function finish(
  duel: {
    whiteMs: number;
    blackMs: number;
    pgn: string;
    fen: string;
    turn: string;
  },
  winner: "white" | "black" | "draw",
  resultText: string,
) {
  return {
    status: "finished",
    winner,
    resultText,
    whiteMs: duel.whiteMs,
    blackMs: duel.blackMs,
    pgn: duel.pgn,
    fen: duel.fen,
    turn: duel.turn,
  };
}

/** Arena points: a win is 2, a draw is 1 for each side. */
async function awardTournamentPoints(
  duel: { tournamentId: string | null; hostId: string; guestId: string | null; hostColor: string },
  winner: "white" | "black" | "draw",
) {
  if (!duel.tournamentId || !duel.guestId) return;
  const hostIsWhite = duel.hostColor === "white";
  const whiteId = hostIsWhite ? duel.hostId : duel.guestId;
  const blackId = hostIsWhite ? duel.guestId : duel.hostId;

  const entries =
    winner === "draw"
      ? [
          { userId: whiteId, points: 1 },
          { userId: blackId, points: 1 },
        ]
      : [{ userId: winner === "white" ? whiteId : blackId, points: 2 }];

  await Promise.all(
    entries.map((entry) =>
      prisma.tournamentEntry.updateMany({
        where: { tournamentId: duel.tournamentId!, userId: entry.userId },
        data: { score: { increment: entry.points } },
      }),
    ),
  );
}

export async function moveDuel(input: {
  code: string;
  userId: string;
  from: string;
  to: string;
  promotion?: "q" | "r" | "b" | "n";
}): Promise<{ ok: true; state: DuelState } | { ok: false; error: string }> {
  const duel = await prisma.duel.findUnique({ where: { code: input.code }, select: { ...SELECT, id: true, hostId: true, guestId: true, tournamentId: true } });
  if (!duel) return { ok: false, error: "This game does not exist." };
  if (duel.status !== "playing") return { ok: false, error: "This game is not in progress." };
  if (duel.hostId !== input.userId && duel.guestId !== input.userId) {
    return { ok: false, error: "You are not a player in this game." };
  }

  const yourColor = colorOf(duel, input.userId);
  const yourTurn = yourColor === "white" ? "w" : "b";
  if (duel.turn !== yourTurn) return { ok: false, error: "It is not your turn." };

  const now = Date.now();
  let whiteMs = duel.whiteMs;
  let blackMs = duel.blackMs;

  if (duel.clocked && duel.lastMoveAt) {
    const elapsed = Math.max(0, now - duel.lastMoveAt.getTime());
    if (yourColor === "white") whiteMs -= elapsed;
    else blackMs -= elapsed;

    if ((yourColor === "white" ? whiteMs : blackMs) <= 0) {
      const finished = finish(
        { whiteMs: Math.max(0, whiteMs), blackMs: Math.max(0, blackMs), pgn: duel.pgn, fen: duel.fen, turn: duel.turn },
        yourColor === "white" ? "black" : "white",
        yourColor === "white" ? "Black won on time" : "White won on time",
      );
      const row = await prisma.duel.update({
        where: { id: duel.id },
        data: { ...finished, lastMoveAt: new Date() },
        select: SELECT,
      });
      await awardTournamentPoints(duel, finished.winner);
      return { ok: true, state: toState(row) };
    }
  }

  const game = new Chess(duel.fen);
  try {
    game.move({ from: input.from, to: input.to, promotion: input.promotion ?? "q" });
  } catch {
    return { ok: false, error: "That move is not legal here." };
  }

  // Rebuild from the PGN *plus* this move so the stored line stays complete.
  const wholeGame = new Chess();
  if (duel.pgn) {
    try {
      wholeGame.loadPgn(duel.pgn);
    } catch {
      return { ok: false, error: "The stored game is unreadable." };
    }
  }
  wholeGame.move({ from: input.from, to: input.to, promotion: input.promotion ?? "q" });

  const tc = timeControlById(duel.timeControl);
  if (duel.clocked) {
    if (yourColor === "white") whiteMs += tc.increment * 1000;
    else blackMs += tc.increment * 1000;
  }

  const nextTurn = wholeGame.turn();
  let winner: "white" | "black" | "draw" | null = null;
  let resultText = "";

  if (wholeGame.isCheckmate()) {
    winner = yourColor;
    resultText = `${yourColor === "white" ? "White" : "Black"} wins by checkmate`;
  } else if (wholeGame.isDraw()) {
    winner = "draw";
    resultText = wholeGame.isStalemate()
      ? "Draw by stalemate"
      : wholeGame.isThreefoldRepetition()
        ? "Draw by repetition"
        : "Draw";
  }

  const row = await prisma.duel.update({
    where: { id: duel.id },
    data: {
      pgn: wholeGame.pgn(),
      fen: wholeGame.fen(),
      turn: nextTurn,
      whiteMs: Math.max(0, whiteMs),
      blackMs: Math.max(0, blackMs),
      lastMoveAt: new Date(),
      status: winner ? "finished" : "playing",
      winner: winner ?? null,
      resultText,
    },
    select: SELECT,
  });

  if (winner) await awardTournamentPoints(duel, winner);
  return { ok: true, state: toState(row) };
}

export async function resignDuel(code: string, userId: string): Promise<DuelState> {
  const duel = await prisma.duel.findUnique({ where: { code }, select: { ...SELECT, id: true, hostId: true, guestId: true, tournamentId: true } });
  if (!duel) throw new Error("This game does not exist.");
  if (duel.status !== "playing") throw new Error("This game is not in progress.");
  const yourColor = colorOf(duel, userId);
  const winner = yourColor === "white" ? "black" : "white";
  const row = await prisma.duel.update({
    where: { id: duel.id },
    data: {
      status: "finished",
      winner,
      resultText: `${yourColor === "white" ? "White" : "Black"} resigned`,
    },
    select: SELECT,
  });
  await awardTournamentPoints(duel, winner);
  return toState(row);
}

export async function cancelDuel(code: string, userId: string): Promise<DuelState> {
  const duel = await prisma.duel.findUnique({ where: { code }, select: { ...SELECT, id: true, hostId: true } });
  if (!duel) throw new Error("This challenge does not exist.");
  if (duel.hostId !== userId) throw new Error("Only the host can cancel this challenge.");
  if (duel.status !== "open") throw new Error("This challenge is already in play.");
  const row = await prisma.duel.update({
    where: { id: duel.id },
    data: { status: "cancelled" },
    select: SELECT,
  });
  return toState(row);
}
