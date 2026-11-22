import { Chess, type Square } from "chess.js";

/**
 * Does this attempted move promote? A pawn arriving on rank 8 or rank 1 has to
 * become something, and quietly assuming a queen throws away underpromotion.
 * Every board that accepts a human move asks this before it commits.
 */
export function isPromotion(fen: string, from: string, to: string): boolean {
  try {
    const game = new Chess(fen);
    const piece = game.get(from as Square);
    if (!piece || piece.type !== "p") return false;
    return to[1] === "8" || to[1] === "1";
  } catch {
    return false;
  }
}

/** The standard starting position, in FEN notation. */
export const START_FEN = new Chess().fen();

export type MoveResult = {
  san: string; // "Nf3"  — for humans
  uci: string; // "g1f3" — stable machine id
  fen: string; // position AFTER the move
  captured: boolean; // did this move take a piece?
  check: boolean; // does it give check?
  checkmate: boolean;
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
      captured: Boolean(move.captured),
      check: game.inCheck(),
      checkmate: game.isCheckmate(),
    };
  } catch {
    return null;
  }
}

/**
 * The four fields that define a position for transposition purposes:
 * board, side to move, castling rights, en-passant square.
 * The halfmove clock and fullmove number are cosmetic, so they are dropped —
 * otherwise the same position reached on move 6 and move 12 would look different.
 */
export function normalizedFen(fen: string): string {
  return fen.split(" ").slice(0, 4).join(" ");
}

/** Square of the king currently in check, or null. Drives the red check flash. */
export function kingInCheckSquare(fen: string): string | null {
  const game = new Chess(fen);
  if (!game.inCheck()) return null;
  const turn = game.turn();
  for (const row of game.board()) {
    for (const cell of row) {
      if (cell && cell.type === "k" && cell.color === turn) return cell.square;
    }
  }
  return null;
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

/**
 * Whose move it is at ply `index` of a game that began from `startFen`. Custom
 * positions can start with black to move, so parity alone is not enough.
 */
export function turnAtPly(startFen: string, index: number): "w" | "b" {
  const first = turnOf(startFen);
  if (index % 2 === 0) return first;
  return first === "w" ? "b" : "w";
}

/** "1." for white's move, "1..." for black's — used to label the move list. */
export function moveNumberOf(ply: number): string {
  const moveNo = Math.floor((ply + 1) / 2);
  return ply % 2 === 1 ? `${moveNo}.` : `${moveNo}...`;
}

export type PgnMove = {
  san: string;
  uci: string;
  fen: string; // position AFTER this move
};

/**
 * A PGN file can hold several games. In the standard format each game is
 * `[tag blocks]` + blank line + `move text`, and the NEXT game starts with a
 * new `[` tag block after a blank line. So we split on "blank line followed by
 * a tag block" — which leaves a single game's own blank line untouched.
 */
export function splitPgnGames(pgn: string): string[] {
  const normalized = pgn.replace(/\r\n?/g, "\n").trim();
  if (normalized.length === 0) return [];
  return normalized
    .split(/\n\s*\n(?=\s*\[)/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0);
}

/**
 * Parse one game's text into an ordered list of moves.
 * Returns null when chess.js rejects the PGN (illegal move, bad notation) —
 * a malformed paste must not crash the request.
 */
/** One PGN header value, e.g. pgnHeader(pgn, "White"). */
export function pgnHeader(pgn: string, name: string): string {
  const match = new RegExp(`^\\[${name} "(.+)"\\]`, "m").exec(pgn);
  return match ? match[1] : "";
}

export function parsePgnGame(chunk: string): PgnMove[] | null {
  const game = new Chess();
  try {
    game.loadPgn(chunk);
  } catch {
    return null;
  }
  return game.history({ verbose: true }).map((move) => ({
    san: move.san,
    uci: `${move.from}${move.to}${move.promotion ?? ""}`,
    fen: move.after,
  }));
}
