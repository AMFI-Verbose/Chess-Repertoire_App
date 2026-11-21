/**
 * Move classification — the labels Lichess and Chess.com put on a move in
 * analysis ("Brilliant", "Blunder", …).
 *
 * The method is the same one both sites use, in principle: compare the
 * evaluation of the move you played against the evaluation of the move the
 * engine wanted, both measured from the mover's point of view. The gap is your
 * "centipawn loss". Small gap → fine move, large gap → a mistake.
 *
 * Two of the labels cannot be derived from loss alone:
 *   Brilliant — the best move, and it gives material away on purpose
 *   Great     — the best move, and the *only* move that keeps the advantage
 * Both need extra signals (a material count, and the second-best line), which
 * the analyser supplies.
 *
 * Thresholds are approximations of the published ladders, not exact replicas.
 */

export type MoveLabel =
  | "book"
  | "brilliant"
  | "great"
  | "best"
  | "excellent"
  | "good"
  | "inaccuracy"
  | "mistake"
  | "blunder";

type LabelStyle = {
  label: string;
  glyph: string; // PGN-style annotation shown after the move
  color: string; // badge / square tint
  text: string; // text colour on that tint
};

export const LABEL_STYLES: Record<MoveLabel, LabelStyle> = {
  brilliant: { label: "Brilliant", glyph: "!!", color: "#1baca6", text: "#001a19" },
  great: { label: "Great", glyph: "!", color: "#5b8baf", text: "#04131f" },
  best: { label: "Best", glyph: "✓", color: "#81b64c", text: "#0b1602" },
  excellent: { label: "Excellent", glyph: "✓", color: "#96bc4b", text: "#0c1502" },
  good: { label: "Good", glyph: "", color: "#b0b7bd", text: "#12161a" },
  book: { label: "Book", glyph: "≡", color: "#c2a35a", text: "#1b1300" },
  inaccuracy: {
    label: "Inaccuracy",
    glyph: "?!",
    color: "#f7c631",
    text: "#2a1f00",
  },
  mistake: { label: "Mistake", glyph: "?", color: "#f2a33c", text: "#2b1300" },
  blunder: { label: "Blunder", glyph: "??", color: "#e0564b", text: "#2a0503" },
};

export type ClassifyInput = {
  /** Best line score, mover's point of view (cp). */
  best: number | null;
  /** Second-best line score, mover's point of view (cp). */
  second: number | null;
  /** Score after the move actually played, mover's point of view (cp). */
  played: number | null;
  /** Was the played move the engine's first choice? */
  isBestMove: boolean;
  /** Was this position still inside the opening book? */
  isBook: boolean;
  /** Did the move shed material while staying (roughly) sound? */
  isSacrifice: boolean;
};

/**
 * Mate scores are ±(10000 - n*10), three orders of magnitude larger than a
 * normal eval. Comparing them as raw centipawns made every move in a mating
 * position look like it threw away ninety pawns: a game that ended in mate
 * was graded as fourteen blunders while the same numbers still scored 92%
 * accuracy. So grading happens on the win-probability curve, where mate is
 * simply "won", and centipawn loss for ACPL is capped.
 */
const MATE_SCORE = 9000;

/** Push a mate score down to a normal-looking eval, keeping its sign. */
export function clampEval(cp: number): number {
  if (cp >= MATE_SCORE) return 1000;
  if (cp <= -MATE_SCORE) return -1000;
  return Math.max(-1000, Math.min(1000, cp));
}

export function classifyMove(input: ClassifyInput): MoveLabel {
  const { best, second, played, isBestMove, isBook, isSacrifice } = input;

  if (best === null || played === null) return isBook ? "book" : "good";

  const before = clampEval(best);
  const after = clampEval(played);
  const loss = before - after;

  // Being inside a known opening does not excuse a losing move: 2.Ke2 is in
  // the ECO table (the Bongcloud), but it still throws away most of White's
  // advantage. Only a move that is both in the book *and* near-best keeps the
  // "Book" label; anything worse is graded on what it actually cost.
  if (isBook && loss <= 60) return "book";

  if (isBestMove) {
    if (isSacrifice && after > -50) return "brilliant";
    if (second !== null && clampEval(best) - clampEval(second) > 150) {
      return "great";
    }
    return "best";
  }

  // How much of the game did this move give away? Measured in win points, so
  // that a slip from +9.0 to +6.0 (still winning) is not a catastrophe, while
  // the same 300 cp at +0.3 really is.
  const drop = winPercent(before) - winPercent(after);

  if (drop <= 1) return "excellent";
  if (drop <= 3) return "good";
  if (drop <= 8) return "inaccuracy";
  if (drop <= 16) return "mistake";
  return "blunder";
}

const PIECE_VALUES: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };

/**
 * Total material for one side, read straight off a FEN board field.
 * Used only for the sacrifice test, so precision is not the point.
 */
export function materialFor(fen: string, side: "w" | "b"): number {
  const board = fen.split(" ")[0];
  let total = 0;
  for (const char of board) {
    const piece = PIECE_VALUES[char.toLowerCase()];
    if (!piece) continue;
    const isWhite = char === char.toUpperCase();
    if ((side === "w") === isWhite) total += piece;
  }
  return total;
}

/**
 * Win percentage from a centipawn score.
 *
 * This is the curve Lichess uses to turn an eval into "how likely is a win",
 * which matters because accuracy is defined on win% swings, not raw centipawns:
 * dropping 100 cp at +0.00 hurts far more than at +8.00.
 */
export function winPercent(cp: number): number {
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

/**
 * Accuracy for one move, from the win% before it and after it (mover's view).
 * The constants are the ones published for this curve (103.1668 / 0.04354 /
 * 3.1669), clipped to 0–100 so a single bad move cannot produce a negative.
 */
export function moveAccuracy(winBefore: number, winAfter: number): number {
  const swing = Math.max(0, winBefore - winAfter);
  const raw = 103.1668 * Math.exp(-0.04354 * swing) - 3.1669;
  return Math.max(0, Math.min(100, raw));
}
