/**
 * The roster of opponents you can play instead of the nameless engine.
 *
 * Every character is a real Stockfish with a deliberate handicap on top:
 * how long it thinks, how wide it looks (MultiPV), and how often it settles
 * for one of its other candidate moves instead of the best one. That last
 * number is what separates a 450-rated pawn from a 2600-rated titan — Skill
 * Level alone bottoms out around 1300, which is why the old "Novice" still
 * beat beginners.
 */

export type BotPersonality =
  | "sunny"
  | "cocky"
  | "wild"
  | "calm"
  | "sharp"
  | "cold"
  | "tricky"
  | "titan";

export type BotProfile = {
  id: string;
  name: string;
  /** What the profile card calls them. */
  title: string;
  rating: number;
  /** Kept in step with ENGINE_LEVELS so saved games stay readable. */
  level: number;
  style: string;
  blurb: string;
  avatar: string;
  accent: string;
  personality: BotPersonality;
  /** Handicap: shorter searches, wider candidate set, more sloppiness. */
  play: {
    skill: number;
    movetime: number;
    spread: number;
    sloppiness: number;
  };
};

export const BOTS: BotProfile[] = [
  {
    id: "pip",
    name: "Pip",
    title: "Pip the Pawn",
    rating: 450,
    level: 1,
    style: "Absolute beginner",
    blurb: "Learns the rules as you play. Hangs pieces, misses mates, loves pawn moves.",
    avatar: "/bots/pip.png",
    accent: "#8fd14f",
    personality: "sunny",
    play: { skill: 0, movetime: 50, spread: 6, sloppiness: 0.62 },
  },
  {
    id: "bella",
    name: "Bella",
    title: "Bella",
    rating: 750,
    level: 2,
    style: "Eager improver",
    blurb: "Knows her openings by name and forgets them by move six.",
    avatar: "/bots/bella.png",
    accent: "#f2a33c",
    personality: "cocky",
    play: { skill: 0, movetime: 90, spread: 5, sloppiness: 0.5 },
  },
  {
    id: "rusty",
    name: "Rusty",
    title: "Rusty",
    rating: 1000,
    level: 3,
    style: "Gambit addict",
    blurb: "Will sacrifice anything that looks like a piece. Sometimes it works.",
    avatar: "/bots/rusty.png",
    accent: "#e0564b",
    personality: "wild",
    play: { skill: 1, movetime: 120, spread: 4, sloppiness: 0.4 },
  },
  {
    id: "marlow",
    name: "Marlow",
    title: "Marlow",
    rating: 1350,
    level: 4,
    style: "Quiet positional",
    blurb: "No fireworks. Just better squares, one at a time.",
    avatar: "/bots/marlow.png",
    accent: "#5b8baf",
    personality: "calm",
    play: { skill: 3, movetime: 180, spread: 3, sloppiness: 0.26 },
  },
  {
    id: "kestrel",
    name: "Kestrel",
    title: "Kestrel",
    rating: 1650,
    level: 5,
    style: "Tactical hawk",
    blurb: "Sees the fork before you finish the move. Punishes loose pieces.",
    avatar: "/bots/kestrel.png",
    accent: "#c2a35a",
    personality: "sharp",
    play: { skill: 6, movetime: 260, spread: 3, sloppiness: 0.18 },
  },
  {
    id: "sable",
    name: "Sable",
    title: "Sable",
    rating: 1950,
    level: 6,
    style: "Cold calculator",
    blurb: "Trades into endgames she has already won on paper.",
    avatar: "/bots/sable.png",
    accent: "#9a7bd6",
    personality: "cold",
    play: { skill: 10, movetime: 380, spread: 2, sloppiness: 0.11 },
  },
  {
    id: "vex",
    name: "Vex",
    title: "Vex",
    rating: 2200,
    level: 7,
    style: "Chaos agent",
    blurb: "Plays the move you did not consider, then defends it perfectly.",
    avatar: "/bots/vex.png",
    accent: "#1baca6",
    personality: "tricky",
    play: { skill: 14, movetime: 520, spread: 2, sloppiness: 0.07 },
  },
  {
    id: "titan",
    name: "Titan",
    title: "The Titan",
    rating: 2600,
    level: 8,
    style: "Full strength",
    blurb: "No handicap: maximum Stockfish, thinking as long as it needs.",
    avatar: "/bots/titan.png",
    accent: "#d94f70",
    personality: "titan",
    play: { skill: 20, movetime: 900, spread: 2, sloppiness: 0.02 },
  },
];

export const DEFAULT_BOT = BOTS[3];

import { levelByNumber } from "@/lib/gameOptions";

/** One line describing any opponent, saved game or not: character or engine. */
export function opponentLabel(
  botId: string | null | undefined,
  level: number,
): string {
  if (botId) {
    const bot = botById(botId);
    return `${bot.name} (≈${bot.rating})`;
  }
  const engine = levelByNumber(level);
  return `Stockfish · ${engine.name} (level ${engine.level})`;
}

export function botById(id: string | null | undefined): BotProfile {
  return BOTS.find((bot) => bot.id === id) ?? DEFAULT_BOT;
}

export function botByLevel(level: number): BotProfile {
  return BOTS.find((bot) => bot.level === level) ?? DEFAULT_BOT;
}

/**
 * Ask Stockfish for a move as this character would play it.
 *
 * The search returns its best N candidate moves; a weak character then has a
 * chance of playing one of the others instead. That is the only way to get a
 * genuinely beginner-strength opponent — Skill Level 0 still answers every
 * hanging piece and beats most new players.
 */
export async function chooseBotMove(
  engine: { search: (fen: string, options: { movetime?: number; multiPv?: number; skill?: number }) => Promise<{ bestmove: string | null; lines: { pv: string[] }[] }> },
  fen: string,
  bot: BotProfile,
): Promise<string | null> {
  const result = await engine.search(fen, {
    movetime: bot.play.movetime,
    multiPv: bot.play.spread,
    skill: bot.play.skill,
  });

  const candidates = result.lines
    .map((line) => line.pv[0])
    .filter((uci): uci is string => Boolean(uci));

  if (candidates.length === 0) return result.bestmove;
  if (candidates.length === 1) return candidates[0];

  // Most of the time: the best move. Sometimes: an honest alternative, never
  // the very worst — a bot that randomises completely stops feeling like chess.
  if (Math.random() >= bot.play.sloppiness) return candidates[0];

  const deepest = Math.min(candidates.length - 1, 3);
  const rank = 1 + Math.floor(Math.random() * deepest);
  return candidates[rank] ?? candidates[0];
}
