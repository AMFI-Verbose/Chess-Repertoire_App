import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";
import ReviewSequence, { type ReviewMove } from "@/components/ReviewSequence";
import CopyPgn from "@/components/CopyPgn";
import { START_FEN, normalizedFen, parsePgnGame } from "@/lib/chess";
import { botById } from "@/lib/bots";

export const dynamic = "force-dynamic";

export default async function GamePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ply?: string }>;
}) {
  const { id } = await params;
  const { ply } = await searchParams;
  const initialPly = Math.max(0, Math.min(Number.parseInt(ply ?? "0", 10) || 0, 500));

  const game = await prisma.game.findUnique({ where: { id } });
  if (!game) notFound();

  const parsed = parsePgnGame(game.pgn);
  if (!parsed) notFound();

  const moves: ReviewMove[] = parsed.map((move, index) => ({
    san: move.san,
    uci: move.uci,
    fen: move.fen,
    ply: index + 1,
  }));

  // Positions that exist in the ECO table are "book": the review labels them
  // that way instead of pretending it knows better than the opening.
  const normFens = moves.map((move) => normalizedFen(move.fen));
  const known =
    normFens.length > 0
      ? await prisma.opening.findMany({
          where: { epd: { in: normFens } },
          select: { epd: true },
        })
      : [];
  const knownEpds = new Set(known.map((row) => row.epd));
  const bookPlies = moves
    .filter((move) => knownEpds.has(normalizedFen(move.fen)))
    .map((move) => move.ply);

  const resultColor =
    game.result === "win" ? "#81b64c" : game.result === "loss" ? "#e0564b" : "#c2a35a";

  return (
    <ReviewSequence
      moves={moves}
      orientation={game.playerColor === "black" ? "black" : "white"}
      title={`vs ${botById(game.botId).name} (≈${botById(game.botId).rating})`}
      subtitle={`${game.resultText} · ${
        game.timeControl === "unlimited" ? "no clock" : game.timeControl
      } · ${new Intl.DateTimeFormat("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(game.createdAt)}`}
      backHref="/games"
      backLabel="All games"
      gameId={game.id}
      bookPlies={bookPlies}
      startFen={game.startFen || START_FEN}
      initialPly={initialPly}
      storedAnalysis={game.analysis}
      extra={
        <div className="flex flex-col gap-2">
          <div
            className="rounded-lg px-3 py-2 text-center text-[11px] font-semibold"
            style={{ background: resultColor, color: "#0b1602" }}
          >
            {game.result.toUpperCase()} · {game.playerColor}
          </div>
          <CopyPgn pgn={game.pgn} />
          <details className="rounded-lg border border-[var(--line)] p-2">
            <summary className="cursor-pointer text-[11px] text-[var(--muted)]">
              Show PGN
            </summary>
            <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words text-[10px] leading-relaxed text-[var(--muted)]">
              {game.pgn}
            </pre>
          </details>
        </div>
      }
    />
  );
}
