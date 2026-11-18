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

export function classifyMove(input: ClassifyInput): MoveLabel {
  const { best, second, played, isBestMove, isBook, isSacrifice } = input;

  if (isBook) return "book";

  if (best === null || played === null) return "good";

  if (isBestMove) {
    if (isSacrifice && played > -50) return "brilliant";
    if (second !== null && best - second > 150) return "great";
    return "best";
  }

  const loss = best - played;

  if (loss <= 20) return "excellent";
  if (loss <= 60) return "good";
  if (loss <= 120) return "inaccuracy";
  if (loss <= 250) return "mistake";
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
