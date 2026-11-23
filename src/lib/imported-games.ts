import { Chess } from "chess.js";

import { prisma } from "@/lib/prisma";
import { pgnHeader } from "@/lib/chess";

export type ImportedGameInput = {
  pgn: string;
  /** Known from the platform API; otherwise it is read from the PGN headers. */
  as?: "white" | "black";
  /** "lichess:<id>" or "chesscom:<uuid>", making repeated imports harmless. */
  externalId?: string;
  externalUrl?: string;
  /** When the game was actually played, not when it was imported. */
  playedAt?: Date;
  /** The account that imported it, so it appears on their public profile. */
  userId?: string | null;
};

export type StoredGame = { id: string; created: boolean };

/**
 * Outside sites write time controls in seconds ("180" or "180+2"), while this
 * app writes minutes ("3+2"). Normalise both shapes; a base below a minute is
 * already minutes, so a local PGN's "5+3" is left alone.
 */
function readableTimeControl(raw: string): string {
  const trimmed = raw.trim();
  const parts = /^(\d+)(?:\+(\d+))?$/.exec(trimmed);
  if (parts) {
    const base = Number(parts[1]);
    const increment = Number(parts[2] ?? 0);
    if (base >= 60) return `${Math.max(1, Math.round(base / 60))}+${increment}`;
    return `${base}+${increment}`;
  }
  return (trimmed || "unlimited").slice(0, 24);
}

/** Which side belongs to the given account, from the PGN headers. */
export function sideOfPgn(pgn: string, username: string): "white" | "black" | null {
  const target = username.trim().toLowerCase();
  if (!target) return null;
  if (pgnHeader(pgn, "White").trim().toLowerCase() === target) return "white";
  if (pgnHeader(pgn, "Black").trim().toLowerCase() === target) return "black";
  return null;
}

/**
 * Validate and persist one outside game. Manual paste and bulk imports share
 * this so the stored PGN, result mapping and duplicate behaviour cannot drift.
 */
export async function storeImportedGame(input: ImportedGameInput): Promise<StoredGame> {
  const raw = input.pgn.trim();
  if (!raw) throw new Error("This game has no PGN.");
  if (raw.length > 200_000) throw new Error("That PGN is too long to import.");

  if (input.externalId) {
    const existing = await prisma.game.findUnique({
      where: { externalId: input.externalId },
      select: { id: true },
    });
    if (existing) return { id: existing.id, created: false };
  }

  const board = new Chess();
  try {
    board.loadPgn(raw);
  } catch {
    throw new Error("That text is not a PGN game chess.js can read.");
  }
  const history = board.history({ verbose: true });
  if (history.length === 0) throw new Error("This PGN has no moves in it.");

  const headers = board.getHeaders();
  const color = input.as ?? null;
  if (!color) throw new Error("Could not tell which colour you played in this game.");

  const resultHeader = headers.Result ?? "*";
  const winner =
    resultHeader === "1-0" ? "white" : resultHeader === "0-1" ? "black" : "draw";
  const outcome: "win" | "loss" | "draw" =
    winner === "draw" ? "draw" : winner === color ? "win" : "loss";

  const white = headers.White || "White";
  const black = headers.Black || "Black";
  const playedAt =
    input.playedAt && !Number.isNaN(input.playedAt.getTime()) && input.playedAt <= new Date()
      ? input.playedAt
      : undefined;

  const created = await prisma.game.create({
    data: {
      kind: "import",
      userId: input.userId ?? null,
      playerColor: color,
      result: outcome,
      resultText: `${white} vs ${black} · ${resultHeader}`.slice(0, 120),
      skill: 12,
      level: 4,
      botId: null,
      timeControl: readableTimeControl(headers.TimeControl || "unlimited"),
      startFen: (headers.FEN ?? "").slice(0, 200),
      pgn: board.pgn({ maxWidth: 80, newline: "\n" }),
      fen: board.fen(),
      plies: history.length,
      externalId: input.externalId ?? null,
      externalUrl: input.externalUrl ?? null,
      ...(playedAt ? { createdAt: playedAt } : {}),
    },
    select: { id: true },
  });

  return { id: created.id, created: true };
}
