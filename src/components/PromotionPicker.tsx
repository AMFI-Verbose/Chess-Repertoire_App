"use client";

/**
 * The piece chooser shown when a pawn reaches the last rank.
 * Shared by every board that accepts a human move, so underpromotion is never
 * silently turned into a queen.
 */

const GLYPHS = {
  white: { q: "♕", r: "♖", b: "♗", n: "♘" },
  black: { q: "♛", r: "♜", b: "♝", n: "♞" },
} as const;

const NAMES = { q: "Queen", r: "Rook", b: "Bishop", n: "Knight" } as const;

export type PromotionPiece = keyof typeof NAMES;

export default function PromotionPicker({
  side,
  onPick,
  onCancel,
  compact = false,
}: {
  side: "white" | "black";
  onPick: (piece: PromotionPiece) => void;
  onCancel: () => void;
  compact?: boolean;
}) {
  const glyphs = GLYPHS[side === "black" ? "black" : "white"];

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center rounded-xl bg-black/55">
      <div
        className={`rounded-xl border border-[var(--line)] bg-[var(--panel)] shadow-xl ${
          compact ? "p-3" : "p-4"
        }`}
      >
        <p className="mb-2.5 text-center text-xs text-[var(--muted)]">Promote to</p>
        <div className="flex gap-2">
          {(["q", "r", "b", "n"] as PromotionPiece[]).map((piece) => (
            <button
              key={piece}
              onClick={() => onPick(piece)}
              title={NAMES[piece]}
              className={`flex items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--panel-2)] leading-none transition hover:border-[var(--accent)] hover:bg-[var(--panel)] ${
                compact ? "h-10 w-10 text-[22px]" : "h-12 w-12 text-[26px]"
              }`}
            >
              {glyphs[piece]}
            </button>
          ))}
        </div>
        <button
          onClick={onCancel}
          className="mt-2.5 w-full rounded-md border border-[var(--line)] px-2 py-1 text-[11px] text-[var(--muted)] transition hover:text-[var(--text)]"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
