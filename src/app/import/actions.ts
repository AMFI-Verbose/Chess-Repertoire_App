"use server";

import { revalidatePath } from "next/cache";

import { sideOfPgn, storeImportedGame } from "@/lib/imported-games";

export type PlatformImportResult = {
  platform: "Lichess" | "chess.com";
  imported: number;
  skipped: number;
  failed: number;
  firstGameId: string | null;
  detail: string;
};

const USER_AGENT = "ChessRepertoire/1.0 (local chess club app)";

function safeUsername(raw: string): string {
  const username = raw.trim();
  if (!/^[A-Za-z0-9_-]{2,32}$/.test(username)) {
    throw new Error("Enter a plain username — letters, numbers, _ or -.");
  }
  return username;
}

function clampLimit(raw: number | undefined): number {
  const value = Number.isFinite(raw) ? Math.round(raw as number) : 20;
  return Math.max(5, Math.min(30, value));
}

function sideFromPlayers(
  username: string,
  white: string | undefined,
  black: string | undefined,
): "white" | "black" | null {
  const target = username.toLowerCase();
  if (white?.toLowerCase() === target) return "white";
  if (black?.toLowerCase() === target) return "black";
  return null;
}

/** Pull recent finished games from a public Lichess profile. */
export async function importLichessGames(
  rawUsername: string,
  rawLimit?: number,
): Promise<PlatformImportResult> {
  const username = safeUsername(rawUsername);
  const limit = clampLimit(rawLimit);

  const url = `https://lichess.org/api/games/user/${encodeURIComponent(
    username,
  )}?max=${limit}&pgnInJson=true&clocks=false&evals=false&opening=false`;
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: "application/x-ndjson", "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
  } catch {
    throw new Error("Lichess did not answer. Try again in a moment.");
  }
  if (response.status === 404) throw new Error(`Lichess has no player called “${username}”.`);
  if (!response.ok) throw new Error(`Lichess returned HTTP ${response.status}.`);

  const text = await response.text();
  const lines = text.split("\n").filter((line) => line.trim().startsWith("{"));
  if (lines.length === 0) throw new Error(`@${username} has no public games to import.`);

  let imported = 0;
  let skipped = 0;
  let failed = 0;
  let firstGameId: string | null = null;

  for (const line of lines) {
    let game: {
      id?: string;
      pgn?: string;
      status?: string;
      createdAt?: number;
      players?: { white?: { user?: { name?: string } }; black?: { user?: { name?: string } } };
    };
    try {
      game = JSON.parse(line);
    } catch {
      failed += 1;
      continue;
    }
    if (!game.id || !game.pgn || game.status === "started") {
      failed += 1;
      continue;
    }

    const fromHeaders = sideOfPgn(game.pgn, username);
    const as =
      fromHeaders ??
      sideFromPlayers(
        username,
        game.players?.white?.user?.name,
        game.players?.black?.user?.name,
      );
    if (!as) {
      failed += 1;
      continue;
    }

    try {
      const stored = await storeImportedGame({
        pgn: game.pgn,
        as,
        externalId: `lichess:${game.id}`,
        externalUrl: `https://lichess.org/${game.id}`,
        playedAt: game.createdAt ? new Date(game.createdAt) : undefined,
      });
      if (stored.created) {
        imported += 1;
        firstGameId ??= stored.id;
      } else {
        skipped += 1;
      }
    } catch {
      failed += 1;
    }
  }

  revalidatePath("/games");
  revalidatePath("/");
  return {
    platform: "Lichess",
    imported,
    skipped,
    failed,
    firstGameId,
    detail:
      imported === 0 && skipped > 0
        ? "These games were already in your library."
        : `Scanned ${lines.length} public game${lines.length === 1 ? "" : "s"}.`,
  };
}

/** Pull the two most recent monthly archives from a public chess.com profile. */
export async function importChessComGames(
  rawUsername: string,
  rawLimit?: number,
): Promise<PlatformImportResult> {
  const username = safeUsername(rawUsername).toLowerCase();
  const limit = clampLimit(rawLimit);

  const headers = { "User-Agent": USER_AGENT, Accept: "application/json" };
  let archiveResponse: Response;
  try {
    archiveResponse = await fetch(
      `https://api.chess.com/pub/player/${encodeURIComponent(username)}/games/archives`,
      { headers, signal: AbortSignal.timeout(12_000), cache: "no-store" },
    );
  } catch {
    throw new Error("chess.com did not answer. Try again in a moment.");
  }
  if (archiveResponse.status === 404) {
    throw new Error(`chess.com has no player called “${username}”.`);
  }
  if (!archiveResponse.ok) {
    throw new Error(`chess.com returned HTTP ${archiveResponse.status}.`);
  }

  const archivePayload = (await archiveResponse.json()) as { archives?: string[] };
  const archives = (archivePayload.archives ?? []).slice(-2);
  if (archives.length === 0) throw new Error(`@${username} has no public game archives.`);

  type ChessComGame = {
    uuid?: string;
    url?: string;
    pgn?: string;
    rules?: string;
    end_time?: number;
    white?: { username?: string };
    black?: { username?: string };
  };
  const games: ChessComGame[] = [];
  for (const archive of archives) {
    try {
      const response = await fetch(archive, {
        headers,
        signal: AbortSignal.timeout(12_000),
        cache: "no-store",
      });
      if (!response.ok) continue;
      const payload = (await response.json()) as { games?: ChessComGame[] };
      for (const game of payload.games ?? []) {
        if (game.rules === "chess") games.push(game);
      }
    } catch {
      // One unavailable month should not throw away the other month.
    }
  }

  if (games.length === 0) throw new Error(`@${username} has no standard games in the last two months.`);
  games.sort((a, b) => (b.end_time ?? 0) - (a.end_time ?? 0));

  let imported = 0;
  let skipped = 0;
  let failed = 0;
  let firstGameId: string | null = null;

  for (const game of games.slice(0, limit)) {
    if (!game.uuid || !game.pgn) {
      failed += 1;
      continue;
    }
    const fromHeaders = sideOfPgn(game.pgn, username);
    const as = fromHeaders ?? sideFromPlayers(username, game.white?.username, game.black?.username);
    if (!as) {
      failed += 1;
      continue;
    }

    try {
      const stored = await storeImportedGame({
        pgn: game.pgn,
        as,
        externalId: `chesscom:${game.uuid}`,
        externalUrl: game.url,
        playedAt: game.end_time ? new Date(game.end_time * 1000) : undefined,
      });
      if (stored.created) {
        imported += 1;
        firstGameId ??= stored.id;
      } else {
        skipped += 1;
      }
    } catch {
      failed += 1;
    }
  }

  revalidatePath("/games");
  revalidatePath("/");
  return {
    platform: "chess.com",
    imported,
    skipped,
    failed,
    firstGameId,
    detail:
      imported === 0 && skipped > 0
        ? "These games were already in your library."
        : `Scanned the last ${archives.length} monthly archive${archives.length === 1 ? "" : "s"}.`,
  };
}
