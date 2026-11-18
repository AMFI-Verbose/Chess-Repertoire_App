import { Chess, type Square } from "chess.js";

/** The standard starting position, in FEN notation. */
export const START_FEN = new Chess().fen();

export type MoveResult = {
  san: string; // "Nf3"  — for humans
  uci: string; // "g1f3" — stable machine id
  fen: string; // position AFTER the move
};

/**
 * Apply a move to a position. Returns null if the move is illegal.
 * `chess.js` throws on illegal input, so we catch it — an illegal move is
 * a normal thing here, not an exception worth crashing over.
 */
export function tryMove(
  fen: string,
  from: string,
  to: string,
  promotion = "q",
): MoveResult | null {
  const game = new Chess(fen);
  try {
    const move = game.move({ from, to, promotion });
    if (!move) return null;
    return {
      san: move.san,
      uci: `${move.from}${move.to}${move.promotion ?? ""}`,
      fen: game.fen(),
    };
  } catch {
    return null;
  }
}

/** Every legal destination square for a piece on `from` (used to draw dots). */
export function legalTargets(fen: string, from: string): string[] {
  const game = new Chess(fen);
  return game.moves({ square: from as Square, verbose: true }).map((m) => m.to);
}

/** Whose turn it is in this position. */
export function turnOf(fen: string): "w" | "b" {
  return fen.split(" ")[1] === "b" ? "b" : "w";
}

/** "1." for white's move, "1..." for black's — used to label the move list. */
export function moveNumberOf(ply: number): string {
  const moveNo = Math.floor((ply + 1) / 2);
  return ply % 2 === 1 ? `${moveNo}.` : `${moveNo}...`;
}
