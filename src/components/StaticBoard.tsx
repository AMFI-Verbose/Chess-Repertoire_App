"use client";

import { Chessboard } from "react-chessboard";

/**
 * A real, non-interactive board for previews. The old preview drew Unicode
 * glyphs on a CSS grid, which never looked like the board you actually play on.
 */
export default function StaticBoard({ fen, size = 200 }: { fen: string; size?: number }) {
  return (
    <div
      className="overflow-hidden rounded-md border border-[var(--line)]"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <Chessboard
        options={{
          position: fen,
          allowDragging: false,
          showNotation: true,
          animationDurationInMs: 0,
          lightSquareStyle: { backgroundColor: "#f0d9b5" },
          darkSquareStyle: { backgroundColor: "#b58863" },
        }}
      />
    </div>
  );
}
