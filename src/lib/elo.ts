// Elo for tactics. A puzzle is a one-game match: you either beat it or you
// don't, and the expected score follows from the rating gap.
//
// The K-factor is provisional at first (40 for the opening attempts, 32, then
// 24) so a new rating can move quickly and then settle — the same idea Lichess
// uses for new accounts, expressed in plain Elo.

export const START_RATING = 1500;
export const MIN_RATING = 400;
export const MAX_RATING = 3200;
export const MAX_DELTA = 40;

/** K-factor shrinks as the player accumulates attempts. */
export function kFactor(attempts: number): number {
  if (attempts < 10) return 40;
  if (attempts < 30) return 32;
  return 24;
}

/** Standard Elo expectancy: 1 / (1 + 10^((opponent - you)/400)). */
export function expectedScore(rating: number, opponentRating: number): number {
  return 1 / (1 + Math.pow(10, (opponentRating - rating) / 400));
}

export type RatingUpdate = {
  rating: number;
  delta: number;
  expected: number;
  k: number;
};

export function updateRating(input: {
  rating: number;
  puzzleRating: number;
  solved: boolean;
  attempts: number;
}): RatingUpdate {
  const k = kFactor(input.attempts);
  const expected = expectedScore(input.rating, input.puzzleRating);
  const score = input.solved ? 1 : 0;

  let delta = Math.round(k * (score - expected));

  // Solving a puzzle far below your rating should still be worth a point;
  // missing an easy one should cost at least one. Pure Elo can produce 0.
  if (input.solved && delta < 1) delta = 1;
  if (!input.solved && delta > -1) delta = -1;

  delta = Math.max(-MAX_DELTA, Math.min(MAX_DELTA, delta));

  const rating = Math.max(
    MIN_RATING,
    Math.min(MAX_RATING, input.rating + delta),
  );

  return { rating, delta: rating - input.rating, expected, k };
}
