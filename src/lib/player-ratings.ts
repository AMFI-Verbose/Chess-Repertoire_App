import { prisma } from "@/lib/prisma";
import { botById } from "@/lib/bots";
import { levelByNumber, timeControlById } from "@/lib/gameOptions";
import { expectedScore, MAX_DELTA, MAX_RATING, MIN_RATING, START_RATING, updateRating } from "@/lib/elo";

export const RATING_CATEGORIES = [
  "bullet",
  "blitz",
  "rapid",
  "classical",
  "correspondence",
  "puzzle",
] as const;

export type RatingCategory = (typeof RATING_CATEGORIES)[number];
export type GameRatingCategory = Exclude<RatingCategory, "puzzle">;

export const RATING_META: Record<
  RatingCategory,
  { label: string; short: string; color: string; description: string }
> = {
  bullet: {
    label: "Bullet",
    short: "1–2 min",
    color: "#d9544d",
    description: "Games under three minutes.",
  },
  blitz: {
    label: "Blitz",
    short: "3–8 min",
    color: "#cb8b20",
    description: "Fast games with a little room to think.",
  },
  rapid: {
    label: "Rapid",
    short: "10–25 min",
    color: "#3186a8",
    description: "The main thinking time control.",
  },
  classical: {
    label: "Classical",
    short: "30 min +",
    color: "#7c5cc4",
    description: "Long games and deep calculation.",
  },
  correspondence: {
    label: "Correspondence",
    short: "No clock",
    color: "#6a7d8d",
    description: "Untimed games, including imports.",
  },
  puzzle: {
    label: "Puzzles",
    short: "Tactics",
    color: "#629924",
    description: "Tactics rating, moved by rated puzzles.",
  },
};

/** Lichess thresholds: bullet ≤ 2 min, blitz ≤ 8, rapid ≤ 25, else classical. */
export function timeControlCategory(timeControl: string): GameRatingCategory {
  if (timeControl === "unlimited") return "correspondence";
  const known = timeControlById(timeControl);
  if (timeControl === known.id) {
    const category = known.category;
    if (category === "Bullet") return "bullet";
    if (category === "Blitz") return "blitz";
    if (category === "Rapid") return "rapid";
    if (category === "Classical") return "classical";
    if (category === "Untimed") return "correspondence";
  }
  const match = /^(\d+)(?:\+(\d+))?$/.exec(timeControl.trim());
  if (!match) return "rapid";
  const minutes = Number(match[1]);
  if (minutes <= 2) return "bullet";
  if (minutes <= 8) return "blitz";
  if (minutes <= 25) return "rapid";
  return "classical";
}

export function opponentRatingForGame(game: { level: number; botId: string | null }): number {
  if (game.botId) return botById(game.botId).rating;
  return levelByNumber(game.level).rating;
}

function gameK(games: number): number {
  if (games < 10) return 40;
  if (games < 30) return 32;
  return 24;
}

function gameElo(input: {
  rating: number;
  opponent: number;
  score: number;
  games: number;
}): { rating: number; delta: number } {
  const k = gameK(input.games);
  const expected = expectedScore(input.rating, input.opponent);
  let delta = Math.round(k * (input.score - expected));
  delta = Math.max(-MAX_DELTA, Math.min(MAX_DELTA, delta));
  const rating = Math.max(MIN_RATING, Math.min(MAX_RATING, input.rating + delta));
  return { rating, delta: rating - input.rating };
}

function categoryFor(rating: string) {
  return RATING_CATEGORIES.includes(rating as RatingCategory)
    ? (rating as RatingCategory)
    : null;
}

export type RatingRow = {
  id: string;
  userId: string;
  category: string;
  rating: number;
  peak: number;
  games: number;
  wins: number;
  draws: number;
  losses: number;
};

/**
 * Every account has six ratings from the moment it first needs one. Existing
 * local history (which predates accounts) is replayed once so the first profile
 * has a real graph instead of six flat 1500 lines.
 */
export async function ensurePlayerRatings(userId: string): Promise<RatingRow[]> {
  const existing = await prisma.playerRating.findMany({ where: { userId } });
  if (existing.length === RATING_CATEGORIES.length) return existing;

  if (existing.length > 0) {
    await prisma.playerRating.createMany({
      data: RATING_CATEGORIES.filter(
        (category) => !existing.some((row) => row.category === category),
      ).map((category) => ({ userId, category, rating: START_RATING, peak: START_RATING })),
      skipDuplicates: true,
    });
    return prisma.playerRating.findMany({ where: { userId } });
  }

  const [games, attempts] = await Promise.all([
    prisma.game.findMany({
      where: { userId, kind: "engine" },
      orderBy: { createdAt: "asc" },
      select: {
        result: true,
        timeControl: true,
        level: true,
        botId: true,
        createdAt: true,
      },
    }),
    prisma.puzzleAttempt.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      select: {
        solved: true,
        ratingBefore: true,
        ratingAfter: true,
        createdAt: true,
      },
    }),
  ]);

  const states = new Map<
    GameRatingCategory,
    { rating: number; peak: number; games: number; wins: number; draws: number; losses: number }
  >();
  const points: { userId: string; category: RatingCategory; rating: number; createdAt: Date }[] = [];

  for (const game of games) {
    const category = timeControlCategory(game.timeControl);
    const state = states.get(category) ?? {
      rating: START_RATING,
      peak: START_RATING,
      games: 0,
      wins: 0,
      draws: 0,
      losses: 0,
    };
    if (state.games === 0) {
      // Start the line one second before the first real game, not at account
      // creation: legacy games predate the account row.
      points.push({
        userId,
        category,
        rating: state.rating,
        createdAt: new Date(game.createdAt.getTime() - 1000),
      });
    }
    const score = game.result === "win" ? 1 : game.result === "draw" ? 0.5 : 0;
    const update = gameElo({
      rating: state.rating,
      opponent: opponentRatingForGame(game),
      score,
      games: state.games,
    });
    state.rating = update.rating;
    state.peak = Math.max(state.peak, update.rating);
    state.games += 1;
    if (score === 1) state.wins += 1;
    else if (score === 0.5) state.draws += 1;
    else state.losses += 1;
    states.set(category, state);
    points.push({ userId, category, rating: update.rating, createdAt: game.createdAt });
  }

  let puzzleRating = START_RATING;
  let puzzlePeak = START_RATING;
  let solved = 0;
  for (const attempt of attempts) {
    // Snapshots are authoritative; old rows without them simply keep the
    // previous rating rather than inventing a delta.
    const after = attempt.ratingAfter ?? puzzleRating;
    if (attempt.ratingBefore == null) puzzleRating = after;
    puzzlePeak = Math.max(puzzlePeak, puzzleRating, after);
    puzzleRating = after;
    if (attempt.solved) solved += 1;
    points.push({ userId, category: "puzzle", rating: puzzleRating, createdAt: attempt.createdAt });
  }
  if (attempts.length > 0) {
    points.push({
      userId,
      category: "puzzle",
      rating: START_RATING,
      createdAt: new Date(attempts[0].createdAt.getTime() - 1000),
    });
  }

  const rows = RATING_CATEGORIES.map((category) => {
    const state =
      category === "puzzle"
        ? {
            rating: puzzleRating,
            peak: puzzlePeak,
            games: attempts.length,
            wins: solved,
            draws: 0,
            losses: attempts.length - solved,
          }
        : states.get(category) ?? {
            rating: START_RATING,
            peak: START_RATING,
            games: 0,
            wins: 0,
            draws: 0,
            losses: 0,
          };
    return { userId, category, ...state };
  });

  if (rows.length > 0) {
    await prisma.$transaction([
      prisma.playerRating.createMany({ data: rows, skipDuplicates: true }),
      points.length > 0 ? prisma.ratingPoint.createMany({ data: points }) : prisma.ratingPoint.deleteMany({ where: { id: "__never__" } }),
    ]);
  }

  return prisma.playerRating.findMany({ where: { userId } });
}

/** Read one player's rating, creating the six defaults if this is their first visit. */
export async function getPlayerRating(userId: string, category: RatingCategory) {
  const rows = await ensurePlayerRatings(userId);
  return rows.find((row) => row.category === category) ?? null;
}

/** Apply a rated bot game. Imported games are deliberately not rated. */
export async function recordEngineGameRating(input: {
  userId: string;
  game: {
    result: string;
    timeControl: string;
    level: number;
    botId: string | null;
    createdAt: Date;
  };
}): Promise<{ category: GameRatingCategory; delta: number } | null> {
  const category = timeControlCategory(input.game.timeControl);
  const rows = await ensurePlayerRatings(input.userId);
  const current = rows.find((row) => row.category === category);
  if (!current) return null;

  const score = input.game.result === "win" ? 1 : input.game.result === "draw" ? 0.5 : 0;
  const update = gameElo({
    rating: current.rating,
    opponent: opponentRatingForGame(input.game),
    score,
    games: current.games,
  });

  await prisma.$transaction([
    prisma.playerRating.update({
      where: { id: current.id },
      data: {
        rating: update.rating,
        peak: Math.max(current.peak, update.rating),
        games: { increment: 1 },
        wins: score === 1 ? { increment: 1 } : undefined,
        draws: score === 0.5 ? { increment: 1 } : undefined,
        losses: score === 0 ? { increment: 1 } : undefined,
      },
    }),
    prisma.ratingPoint.create({
      data: {
        userId: input.userId,
        category,
        rating: update.rating,
        createdAt: input.game.createdAt,
      },
    }),
  ]);

  return { category, delta: update.delta };
}

/**
 * Rated puzzle attempt. The old anonymous Profile is untouched, so the public
 * profile and casual practice cannot poison signed-in puzzle history.
 */
export async function recordPuzzleAttemptForUser(input: {
  userId: string;
  puzzleId: string;
  puzzleRating: number;
  solved: boolean;
}): Promise<{ ratingBefore: number; ratingAfter: number }> {
  const rows = await ensurePlayerRatings(input.userId);
  const current = rows.find((row) => row.category === "puzzle");
  if (!current) throw new Error("Puzzle rating unavailable");

  const update = updateRating({
    rating: current.rating,
    puzzleRating: input.puzzleRating,
    solved: input.solved,
    attempts: current.games,
  });
  const now = new Date();

  await prisma.$transaction([
    prisma.puzzleAttempt.create({
      data: {
        puzzleId: input.puzzleId,
        userId: input.userId,
        solved: input.solved,
        ratingBefore: current.rating,
        ratingAfter: update.rating,
        createdAt: now,
      },
    }),
    prisma.playerRating.update({
      where: { id: current.id },
      data: {
        rating: update.rating,
        peak: Math.max(current.peak, update.rating),
        games: { increment: 1 },
        wins: input.solved ? { increment: 1 } : undefined,
        losses: input.solved ? undefined : { increment: 1 },
      },
    }),
    prisma.ratingPoint.create({
      data: {
        userId: input.userId,
        category: "puzzle",
        rating: update.rating,
        createdAt: now,
      },
    }),
  ]);

  return { ratingBefore: current.rating, ratingAfter: update.rating };
}

export function ratingRowsByCategory(rows: RatingRow[]) {
  return new Map(
    rows
      .map((row) => [categoryFor(row.category), row] as const)
      .filter((entry): entry is [RatingCategory, RatingRow] => entry[0] !== null),
  );
}

export type PublicPlayer = {
  id: string;
  handle: string;
  emailVerified: boolean;
  createdAt: Date;
  ratings: RatingRow[];
  ratingPoints: { category: string; rating: number; createdAt: Date }[];
  recentGames: {
    id: string;
    result: string;
    resultText: string;
    timeControl: string;
    level: number;
    botId: string | null;
    kind: string;
    createdAt: Date;
    externalUrl: string | null;
    playerColor: string;
  }[];
  puzzle: {
    attempted: number;
    solved: number;
    accuracy: number;
    streak: number;
  };
  activity: { date: string; count: number }[];
  counts: {
    games: number;
    ratedGames: number;
    importedGames: number;
    puzzleAttempts: number;
    wins: number;
    draws: number;
    losses: number;
  };
};

function localDay(date: Date): string {
  return date.toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
}

/** 84 days ending today, always Monday-aligned enough to read as a strip. */
function activityDays(): string[] {
  const now = new Date();
  const days: string[] = [];
  for (let offset = 83; offset >= 0; offset -= 1) {
    const day = new Date(now);
    day.setDate(now.getDate() - offset);
    days.push(localDay(day));
  }
  return days;
}

export async function getPublicPlayer(handle: string): Promise<PublicPlayer | null> {
  const user = await prisma.user.findUnique({
    where: { handle: handle.toLowerCase() },
    select: { id: true, handle: true, emailVerified: true, createdAt: true },
  });
  if (!user) return null;

  await ensurePlayerRatings(user.id);

  const [ratings, ratingPoints, recentGames, counts, puzzleRows, activityGames, activityPuzzles, resultGroups] = await Promise.all([
    prisma.playerRating.findMany({ where: { userId: user.id } }),
    prisma.ratingPoint.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
      take: 600,
      select: { category: true, rating: true, createdAt: true },
    }),
    prisma.game.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: {
        id: true,
        result: true,
        resultText: true,
        timeControl: true,
        level: true,
        botId: true,
        kind: true,
        createdAt: true,
        externalUrl: true,
        playerColor: true,
      },
    }),
    Promise.all([
      prisma.game.count({ where: { userId: user.id } }),
      prisma.game.count({ where: { userId: user.id, kind: "engine" } }),
      prisma.game.count({ where: { userId: user.id, kind: "import" } }),
      prisma.puzzleAttempt.count({ where: { userId: user.id } }),
    ]),
    prisma.puzzleAttempt.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 60,
      select: { solved: true },
    }),
    prisma.game.findMany({
      where: { userId: user.id, createdAt: { gte: new Date(Date.now() - 85 * 86400000) } },
      select: { createdAt: true },
    }),
    prisma.puzzleAttempt.findMany({
      where: { userId: user.id, createdAt: { gte: new Date(Date.now() - 85 * 86400000) } },
      select: { createdAt: true },
    }),
    prisma.game.groupBy({
      by: ["result"],
      where: { userId: user.id, kind: "engine" },
      _count: true,
    }),
  ]);

  let streak = 0;
  for (const row of puzzleRows) {
    if (!row.solved) break;
    streak += 1;
  }
  const attempted = puzzleRows.length > 0 ? counts[3] : 0;
  const solved = puzzleRows.filter((row) => row.solved).length;
  // The 60-row window is enough for streak; total solved comes from every
  // attempt via the persisted rating row when available.
  const puzzleRating = ratings.find((row) => row.category === "puzzle");
  const solvedTotal = puzzleRating?.wins ?? solved;

  const activity = new Map(activityDays().map((date) => [date, 0]));
  for (const row of [...activityGames, ...activityPuzzles]) {
    const day = localDay(row.createdAt);
    if (activity.has(day)) activity.set(day, (activity.get(day) ?? 0) + 1);
  }

  return {
    ...user,
    ratings,
    ratingPoints,
    recentGames,
    puzzle: {
      attempted,
      solved: solvedTotal,
      accuracy: attempted > 0 ? Math.round((solvedTotal / attempted) * 100) : 0,
      streak,
    },
    activity: Array.from(activity, ([date, count]) => ({ date, count })),
    counts: {
      games: counts[0],
      ratedGames: counts[1],
      importedGames: counts[2],
      puzzleAttempts: counts[3],
      wins: resultGroups.find((row) => row.result === "win")?._count ?? 0,
      draws: resultGroups.find((row) => row.result === "draw")?._count ?? 0,
      losses: resultGroups.find((row) => row.result === "loss")?._count ?? 0,
    },
  };
}

export type PlayerDirectoryRow = {
  handle: string;
  createdAt: Date;
  ratings: RatingRow[];
};

export async function listPlayers(): Promise<PlayerDirectoryRow[]> {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, handle: true, createdAt: true },
  });
  const rows = await Promise.all(
    users.map(async (user) => ({
      handle: user.handle,
      createdAt: user.createdAt,
      ratings: await ensurePlayerRatings(user.id),
    })),
  );
  return rows.sort((a, b) => {
    const rating = (row: PlayerDirectoryRow) =>
      row.ratings.find((entry) => entry.category === "blitz")?.rating ?? START_RATING;
    return rating(b) - rating(a);
  });
}
