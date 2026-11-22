/**
 * A 52px final-position thumbnail, the way Lichess lists games. Pure markup so
 * it can render on the server; the glyphs are Unicode pieces, not images.
 */

const GLYPHS: Record<string, string> = {
  K: "♔",
  Q: "♕",
  R: "♖",
  B: "♗",
  N: "♘",
  P: "♙",
  k: "♚",
  q: "♛",
  r: "♜",
  b: "♝",
  n: "♞",
  p: "♟",
};

function squaresFromFen(fen: string) {
  const rows = fen.split(" ")[0]?.split("/") ?? [];
  const squares: { piece: string | null; dark: boolean }[] = [];
  for (let rank = 0; rank < 8; rank++) {
    const row = rows[rank] ?? "8";
    let file = 0;
    for (const token of row) {
      if (/\d/.test(token)) {
        const empty = Number(token);
        for (let i = 0; i < empty; i++) {
          squares.push({ piece: null, dark: (rank + file) % 2 === 1 });
          file++;
        }
      } else {
        squares.push({ piece: GLYPHS[token] ?? null, dark: (rank + file) % 2 === 1 });
        file++;
      }
    }
  }
  return squares;
}

export default function MiniBoard({ fen, size = 52 }: { fen: string; size?: number }) {
  const squares = squaresFromFen(fen);
  return (
    <div
      aria-hidden
      className="grid shrink-0 grid-cols-8 overflow-hidden rounded-[3px] border border-[var(--line)] shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
      style={{ width: size, height: size }}
    >
      {squares.map((square, index) => (
        <span
          key={index}
          className="flex items-center justify-center leading-none"
          style={{
            background: square.dark ? "#b58863" : "#f0d9b5",
            color: "#2e2d29",
            fontSize: Math.max(8, Math.round(size / 6)),
          }}
        >
          {square.piece}
        </span>
      ))}
    </div>
  );
}
