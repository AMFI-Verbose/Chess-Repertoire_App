import { prisma } from "@/lib/prisma";
import { acceptDuel, createDuel } from "@/lib/duels";
import { timeControlById } from "@/lib/gameOptions";

export type TournamentStatus = "upcoming" | "live" | "finished";

export type TournamentSummary = {
  id: string;
  name: string;
  startsAt: string;
  endsAt: string;
  timeControl: string;
  players: number;
  status: TournamentStatus;
};

export function tournamentStatus(startsAt: Date, endsAt: Date, now = new Date()): TournamentStatus {
  if (now < startsAt) return "upcoming";
  if (now < endsAt) return "live";
  return "finished";
}

function summary(row: {
  id: string;
  name: string;
  startsAt: Date;
  endsAt: Date;
  timeControl: string;
  _count: { entries: number };
}): TournamentSummary {
  return {
    id: row.id,
    name: row.name,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    timeControl: row.timeControl,
    players: row._count.entries,
    status: tournamentStatus(row.startsAt, row.endsAt),
  };
}

/** Live and upcoming arenas, soonest first. */
export async function listOpenTournaments(take = 12): Promise<TournamentSummary[]> {
  const rows = await prisma.tournament.findMany({
    where: { endsAt: { gt: new Date() } },
    orderBy: { startsAt: "asc" },
    take,
    include: { _count: { select: { entries: true } } },
  });
  return rows.map(summary);
}

export async function listRecentTournaments(take = 5) {
  const rows = await prisma.tournament.findMany({
    orderBy: { startsAt: "desc" },
    take,
    include: { _count: { select: { entries: true } } },
  });
  return rows.map(summary);
}

export async function getTournament(id: string) {
  const row = await prisma.tournament.findUnique({
    where: { id },
    include: {
      _count: { select: { entries: true } },
      entries: { orderBy: [{ score: "desc" }, { joinedAt: "asc" }] },
    },
  });
  if (!row) return null;

  const users = await prisma.user.findMany({
    where: { id: { in: row.entries.map((entry) => entry.userId) } },
    select: { id: true, handle: true },
  });
  const handles = new Map(users.map((user) => [user.id, user.handle]));

  return {
    ...summary(row),
    entries: row.entries.map((entry, index) => ({
      rank: index + 1,
      handle: handles.get(entry.userId) ?? "Player",
      userId: entry.userId,
      score: entry.score,
    })),
  };
}

export async function createTournament(input: {
  name: string;
  startsInMinutes: number;
  durationMinutes: number;
  timeControl: string;
}) {
  const name = input.name.trim().slice(0, 60);
  if (name.length < 3) throw new Error("Give the tournament a name of at least 3 characters.");
  if (!timeControlById(input.timeControl)) throw new Error("Pick a real time control.");
  const startsInMinutes = Math.max(0, Math.min(1440, Math.round(input.startsInMinutes)));
  const durationMinutes = Math.max(15, Math.min(240, Math.round(input.durationMinutes)));
  const startsAt = new Date(Date.now() + startsInMinutes * 60_000);
  const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);

  return prisma.tournament.create({
    data: { name, startsAt, endsAt, timeControl: input.timeControl },
    select: { id: true },
  });
}

export async function joinTournament(tournamentId: string, userId: string) {
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) throw new Error("This tournament does not exist.");
  if (tournament.endsAt <= new Date()) throw new Error("This tournament has already finished.");
  await prisma.tournamentEntry.upsert({
    where: { tournamentId_userId: { tournamentId, userId } },
    update: {},
    create: { tournamentId, userId },
  });
}

export async function leaveTournament(tournamentId: string, userId: string) {
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) throw new Error("This tournament does not exist.");
  if (tournament.startsAt <= new Date()) {
    throw new Error("The tournament has started — you cannot withdraw now.");
  }
  await prisma.tournamentEntry.deleteMany({ where: { tournamentId, userId } });
}

/**
 * Arena pairing, lite: if you already have a tournament game open, go back to
 * it; otherwise take the oldest waiting challenge from another entrant; if
 * nobody is waiting, post your own challenge. Every game is a normal duel, so
 * the clock, resignation and result banner all keep working.
 */
export async function findTournamentGame(tournamentId: string, userId: string) {
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) throw new Error("This tournament does not exist.");
  if (tournament.endsAt <= new Date()) throw new Error("This tournament has already finished.");

  const entry = await prisma.tournamentEntry.findUnique({
    where: { tournamentId_userId: { tournamentId, userId } },
  });
  if (!entry) throw new Error("Join the tournament before you look for a game.");

  const mine = await prisma.duel.findFirst({
    where: {
      tournamentId,
      status: { in: ["open", "playing"] },
      OR: [{ hostId: userId }, { guestId: userId }],
    },
    orderBy: { createdAt: "desc" },
    select: { code: true },
  });
  if (mine) return mine.code;

  const waiting = await prisma.duel.findFirst({
    where: {
      tournamentId,
      status: "open",
      visibility: "public",
      hostId: { not: userId },
    },
    orderBy: { createdAt: "asc" },
    select: { code: true },
  });
  if (waiting) {
    await acceptDuel(waiting.code, userId);
    return waiting.code;
  }

  const created = await createDuel({
    hostId: userId,
    timeControl: tournament.timeControl,
    color: "random",
    visibility: "public",
    tournamentId,
  });
  return created.code;
}
