/**
 * What each side has captured, read straight off the move list.
 *
 * Lichess and chess.com both show the fallen pieces next to each clock; this
 * is the same information derived from the game itself, so it stays correct
 * after a takeback (the list is replayed from the start position).
 */

import { Chess } from "chess.js";

export type Captured = {
  /** Pieces White has taken (they were Black's). */
  byWhite: string[];
  /** Pieces Black has taken (they were White's). */
  byBlack: string[];
};

const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };

export function pieceValue(type: string): number {
  return VALUE[type] ?? 0;
}

/** Material balance from the captured lists, in pawns. */
export function materialDiff(captured: Captured): number {
  const white = captured.byWhite.reduce((sum, type) => sum + pieceValue(type), 0);
  const black = captured.byBlack.reduce((sum, type) => sum + pieceValue(type), 0);
  return white - black;
}

/**
 * Replay the move list and collect what each side took. SAN is enough, so the
 * same call works for a live game and for an imported PGN.
 */
export function capturedFrom(startFen: string, sanList: string[]): Captured {
  const board = new Chess(startFen || undefined);
  const byWhite: string[] = [];
  const byBlack: string[] = [];
  for (const san of sanList) {
    try {
      const move = board.move(san);
      if (move.captured) {
        if (move.color === "w") byWhite.push(move.captured);
        else byBlack.push(move.captured);
      }
    } catch {
      break;
    }
  }
  return { byWhite, byBlack };
}

/** Sort: pawns first, then knights, bishops, rooks, queens. */
const ORDER = "pnbrq";

export function sortedCaptured(list: string[]): string[] {
  return [...list].sort(
    (a, b) => ORDER.indexOf(a) - ORDER.indexOf(b),
  );
}

export const CAPTURED_GLYPH: Record<string, { w: string; b: string }> = {
  p: { w: "♙", b: "♟" },
  n: { w: "♘", b: "♞" },
  b: { w: "♗", b: "♝" },
  r: { w: "♖", b: "♜" },
  q: { w: "♕", b: "♛" },
};
