import { Chess, type Square } from "chess.js";

/**
 * Board affordances shared by every board in the app:
 *  - dots on every square the piece under the cursor can legally reach
 *  - the king's square tinted red when it is in check
 *
 * Everything is derived from a FEN, so the caller only passes what it already
 * has and no move generator is stored anywhere.
 */

const LEGAL_DOT =
  "radial-gradient(circle, rgba(20,20,20,0.28) 24%, transparent 26%)";

const LEGAL_CAPTURE =
  "radial-gradient(circle, transparent 60%, rgba(20,20,20,0.28) 62%, transparent 72%)";

const CHECK_TINT =
  "radial-gradient(circle, rgba(235, 72, 63, 0.85) 0%, rgba(235, 72, 63, 0.55) 55%, transparent 78%)";

const SELECTED_TINT = "rgba(255, 214, 102, 0.55)";

export type SquareStyle = {
  backgroundImage?: string;
  backgroundColor?: string;
  boxShadow?: string;
};

/** One square the given piece can move to, or an empty array if it can't move. */
export function legalTargets(fen: string, square: string): string[] {
  try {
    const board = new Chess(fen);
    const moves = board.moves({ square: square as Square, verbose: true });
    return moves.map((move) => move.to);
  } catch {
    return [];
  }
}

/** True when the side about to move is in check. */
export function isKingInCheck(fen: string): boolean {
  try {
    return new Chess(fen).isCheck();
  } catch {
    return false;
  }
}

/** The square of the king belonging to the side to move. */
export function kingSquare(fen: string): string | null {
  try {
    const board = new Chess(fen);
    const turn = board.turn();
    for (const row of board.board()) {
      for (const cell of row) {
        if (cell && cell.type === "k" && cell.color === turn) return cell.square;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Styles for a position plus optional interaction state.
 * Order matters: a selected square keeps its tint even when it also holds a
 * dot, and a checked king is drawn on top of everything.
 */
export function hintStyles(
  fen: string,
  options: {
    selected?: string | null;
    lastMove?: string | null;
    legalMovesFor?: string | null;
  } = {},
): Record<string, SquareStyle> {
  const styles: Record<string, SquareStyle> = {};
  const { selected, lastMove, legalMovesFor } = options;

  if (lastMove && lastMove.length >= 4) {
    const from = lastMove.slice(0, 2);
    const to = lastMove.slice(2, 4);
    styles[from] = { backgroundImage: "linear-gradient(rgba(155,199,0,0.41), rgba(155,199,0,0.41))" };
    styles[to] = { backgroundImage: "linear-gradient(rgba(155,199,0,0.41), rgba(155,199,0,0.41))" };
  }

  if (legalMovesFor) {
    const board = new Chess(fen);
    let targets: string[] = [];
    try {
      targets = board
        .moves({ square: legalMovesFor as Square, verbose: true })
        .map((move) => move.to);
    } catch {
      targets = [];
    }
    for (const target of targets) {
      // A capture gets a ring, an empty square gets a dot — chess.com's cue.
      const occupied = board.get(target as Square);
      styles[target] = { backgroundImage: occupied ? LEGAL_CAPTURE : LEGAL_DOT };
    }
  }

  if (selected) {
    styles[selected] = {
      ...(styles[selected] ?? {}),
      backgroundColor: SELECTED_TINT,
    };
  }

  if (isKingInCheck(fen)) {
    const king = kingSquare(fen);
    if (king) {
      styles[king] = {
        ...(styles[king] ?? {}),
        backgroundImage: CHECK_TINT,
      };
    }
  }

  return styles;
}
