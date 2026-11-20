/**
 * Engine levels and time controls — the two things a player picks before a
 * game. Kept in one module so the setup UI, the saved game record and the
 * engine call all read the same numbers instead of drifting apart.
 */

export type EngineLevel = {
  level: number;
  name: string;
  /** Stockfish Skill Level 0–20 (how often it picks a weaker move). */
  skill: number;
  /** Search time in ms: a level also gets weaker by thinking less. */
  movetime: number;
  /** Rough equivalent human rating, for orientation only — not a measurement. */
  rating: number;
  blurb: string;
};

export const ENGINE_LEVELS: EngineLevel[] = [
  { level: 1, name: "Novice", skill: 0, movetime: 80, rating: 800, blurb: "Hangs pieces, misses mates in one." },
  { level: 2, name: "Beginner", skill: 2, movetime: 120, rating: 1100, blurb: "Sees one move ahead, not two." },
  { level: 3, name: "Casual", skill: 4, movetime: 160, rating: 1350, blurb: "Punishes obvious blunders." },
  { level: 4, name: "Club", skill: 7, movetime: 220, rating: 1600, blurb: "Solid tactics, loose strategy." },
  { level: 5, name: "Strong club", skill: 10, movetime: 300, rating: 1900, blurb: "Rarely drops material for free." },
  { level: 6, name: "Expert", skill: 13, movetime: 420, rating: 2200, blurb: "Punishes small inaccuracies." },
  { level: 7, name: "Master", skill: 16, movetime: 600, rating: 2500, blurb: "Long forcing lines, precise endgames." },
  { level: 8, name: "Maximum", skill: 20, movetime: 900, rating: 2900, blurb: "Full strength — no deliberate weakness." },
];

export function levelByNumber(level: number): EngineLevel {
  return ENGINE_LEVELS.find((entry) => entry.level === level) ?? ENGINE_LEVELS[3];
}

export type TimeControl = {
  id: string;
  label: string;
  /** Base time in seconds; null = no clock at all. */
  initial: number | null;
  /** Increment per move, in seconds. */
  increment: number;
  category: "Bullet" | "Blitz" | "Rapid" | "Classical" | "Untimed";
};

export const TIME_CONTROLS: TimeControl[] = [
  { id: "1+0", label: "1 + 0", initial: 60, increment: 0, category: "Bullet" },
  { id: "2+1", label: "2 + 1", initial: 120, increment: 1, category: "Bullet" },
  { id: "3+0", label: "3 + 0", initial: 180, increment: 0, category: "Blitz" },
  { id: "3+2", label: "3 + 2", initial: 180, increment: 2, category: "Blitz" },
  { id: "5+0", label: "5 + 0", initial: 300, increment: 0, category: "Blitz" },
  { id: "5+3", label: "5 + 3", initial: 300, increment: 3, category: "Blitz" },
  { id: "10+0", label: "10 + 0", initial: 600, increment: 0, category: "Rapid" },
  { id: "10+5", label: "10 + 5", initial: 600, increment: 5, category: "Rapid" },
  { id: "15+10", label: "15 + 10", initial: 900, increment: 10, category: "Rapid" },
  { id: "30+0", label: "30 + 0", initial: 1800, increment: 0, category: "Classical" },
  { id: "unlimited", label: "No clock", initial: null, increment: 0, category: "Untimed" },
];

export function timeControlById(id: string): TimeControl {
  return TIME_CONTROLS.find((entry) => entry.id === id) ?? TIME_CONTROLS[10];
}

export type GameMode = "standard" | "custom";

/** mm:ss, and tenths once a side is under 20 seconds — the chess.com behaviour. */
export function formatClock(ms: number): string {
  const clamped = Math.max(0, ms);
  const totalSeconds = Math.floor(clamped / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const tenths = Math.floor((clamped % 1000) / 100);

  if (totalSeconds < 20) {
    return `${minutes}:${String(seconds).padStart(2, "0")}.${tenths}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
