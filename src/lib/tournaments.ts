import { prisma } from "@/lib/prisma";
import { acceptDuel, createDuel } from "@/lib/duels";
import { timeControlById } from "@/lib/gameOptions";

export type TournamentStatus = "upcoming" | "live" | "finished";

export type TournamentSource = "local" | "lichess" | "chess.com";

export type TournamentSummary = {
  id: string;
  name: string;
  startsAt: string;
  endsAt: string;
  timeControl: string;
  players: number;
  status: TournamentStatus;
  source: TournamentSource;
  externalUrl: string | null;
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
  source: string;
  externalUrl: string | null;
  players: number;
  _count: { entries: number };
}): TournamentSummary {
  return {
    id: row.id,
    name: row.name,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    timeControl: row.timeControl,
    players: row.source === "local" ? row._count.entries : row.players,
    status: tournamentStatus(row.startsAt, row.endsAt),
    source: row.source as TournamentSource,
    externalUrl: row.externalUrl,
  };
}

let lastLichessRefresh = 0;

/**
 * Lichess publishes its arena calendar at /api/tournament. We copy the live
 * and upcoming ones into our own table so the home page can show real events
 * with their real player counts, and link straight back to Lichess.
 */
export async function refreshLichessTournaments(force = false) {
  const now = Date.now();
  if (!force && now - lastLichessRefresh < 10 * 60_000) return;
  lastLichessRefresh = now;

  try {
    const response = await fetch("https://lichess.org/api/tournament", {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    if (!response.ok) return;
    const payload = (await response.json()) as {
      created?: LichessTournament[];
      started?: LichessTournament[];
      finished?: LichessTournament[];
    };

    for (const event of [
      ...(payload.finished ?? []),
      ...(payload.started ?? []),
      ...(payload.created ?? []),
    ]) {
      const limit = event.clock?.limit ?? 0;
      const increment = event.clock?.increment ?? 0;
      const minutes = Math.round((limit / 60) * 10) / 10;
      const timeControl = `${minutes}+${increment}`;
      const startsAt = new Date(event.startsAt);
      const endsAt = new Date(event.finishesAt);

      await prisma.tournament.upsert({
        where: { source_externalId: { source: "lichess", externalId: event.id } },
        update: {
          name: event.fullName,
          startsAt,
          endsAt,
          timeControl,
          players: event.nbPlayers ?? 0,
          externalUrl: `https://lichess.org/tournament/${event.id}`,
        },
        create: {
          name: event.fullName,
          startsAt,
          endsAt,
          timeControl,
          players: event.nbPlayers ?? 0,
          source: "lichess",
          externalId: event.id,
          externalUrl: `https://lichess.org/tournament/${event.id}`,
        },
      });
    }
  } catch {
    // Lichess being down must never take the local arena down with it.
  }
}

type LichessTournament = {
  id: string;
  fullName: string;
  startsAt: number;
  finishesAt: number;
  nbPlayers?: number;
  clock?: { limit: number; increment: number };
};

let lastChessComRefresh = 0;

/**
 * Chess.com does not expose a tournament API, but its "upcoming arena" page is
 * server-rendered. We read that table and mirror the public arenas so they show
 * up next to Lichess, labelled with their source.
 */
export async function refreshChessComTournaments(force = false) {
  const now = Date.now();
  if (!force && now - lastChessComRefresh < 10 * 60_000) return;
  lastChessComRefresh = now;

  try {
    const response = await fetch("https://www.chess.com/tournament/upcoming/arena", {
      headers: {
        Accept: "text/html",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    });
    if (!response.ok) return;
    const html = await response.text();
    const rows = html.split("<tr").slice(1);

    for (const row of rows) {
      const id = row.match(/\/play\/arena\/(\d+)/)?.[1];
      const nameMatch = row.match(/tournaments-upcoming-name\s*"[^>]*>\s*([^<]+)/);
      const startMatch = row.match(
        /tournaments-upcoming-start\s*">\s*([A-Za-z]{3} \d{1,2}, \d{4})\s*<\/span>\s*<span class="tournaments-upcoming-start\s*">\s*([\d:]+\s*[AP]M)/,
      );
      if (!id || !nameMatch || !startMatch) continue;

      const name = nameMatch[1].trim().replace(/&amp;/g, "&").replace(/&#39;/g, "'");
      if (!/^\d+\s*\+\s*\d+\s+(Rapid|Blitz|Bullet|Bughouse)$/i.test(name)) continue;

      const startsAt = parseChessComDate(startMatch[1], startMatch[2]);
      if (!startsAt) continue;
      const endsAt = new Date(startsAt.getTime() + 2 * 60 * 60_000);
      const clock = name.match(/^(\d+)\s*\+\s*(\d+)/);
      const timeControl = clock ? `${clock[1]}+${clock[2]}` : name;

      await prisma.tournament.upsert({
        where: { source_externalId: { source: "chess.com", externalId: id } },
        update: {
          name,
          startsAt,
          endsAt,
          timeControl,
          externalUrl: `https://www.chess.com/play/arena/${id}`,
        },
        create: {
          name,
          startsAt,
          endsAt,
          timeControl,
          players: 0,
          source: "chess.com",
          externalId: id,
          externalUrl: `https://www.chess.com/play/arena/${id}`,
        },
      });
    }
  } catch {
    // Same rule as Lichess: an external calendar never breaks the club's own.
  }
}

/** Chess.com renders its public calendar in Pacific time. */
function parseChessComDate(date: string, time: string) {
  const parsed = new Date(`${date} ${time} -08:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Refresh both external calendars at most every ten minutes. */
export async function refreshTournamentCalendar(force = false) {
  await Promise.all([refreshLichessTournaments(force), refreshChessComTournaments(force)]);
}

/** Live and upcoming arenas, soonest first. */
export async function listOpenTournaments(take = 200): Promise<TournamentSummary[]> {
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
    where: { source: "local" },
    orderBy: { startsAt: "desc" },
    take,
    include: { _count: { select: { entries: true } } },
  });
  return rows.map(summary);
}

/** External events that just ended, newest first. */
export async function listFinishedTournaments(take = 8): Promise<TournamentSummary[]> {
  const rows = await prisma.tournament.findMany({
    where: { source: { not: "local" }, endsAt: { lte: new Date() } },
    orderBy: { endsAt: "desc" },
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
