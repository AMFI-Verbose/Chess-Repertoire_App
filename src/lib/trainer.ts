/**
 * Repertoire trainer: the spaced-repetition maths and the "what is a card" rule,
 * kept free of Prisma so it can be unit-tested on its own.
 *
 * A card is a *position where you have to move*. It is attached to the node the
 * position sits on, and its answers are every recorded child move. That way a
 * position where you wrote down two playable moves still counts as one card and
 * both answers are accepted.
 */

export type TrainerAnswer = {
  san: string;
  uci: string;
  isMain: boolean;
};

export type TrainerCard = {
  nodeId: string;
  fen: string;
  ply: number;
  /** Moves from the repertoire root to this position, SAN, for context. */
  line: string[];
  answers: TrainerAnswer[];
  /** Position name from the ECO table, when the position is known theory. */
  openingName: string | null;
  openingEco: string | null;
};

export type TrainableNode = {
  id: string;
  parentId: string | null;
  san: string;
  uci: string;
  fen: string;
  ply: number;
  isMain: boolean;
};

const MAX_INTERVAL_DAYS = 180;
const LAPSE_DELAY_MS = 4 * 60 * 60 * 1000; // wrong answer comes back later today

export function sideToMove(fen: string): "white" | "black" {
  return fen.split(" ")[1] === "b" ? "black" : "white";
}

/**
 * Positions that deserve a card: the side you play is on move there, and you
 * have at least one recorded reply. The root is included — your first move is
 * a real thing to remember.
 */
export function trainableNodes(nodes: TrainableNode[], side: "white" | "black"): TrainableNode[] {
  const hasChild = new Set<string>();
  for (const node of nodes) {
    if (node.parentId) hasChild.add(node.parentId);
  }
  return nodes.filter((node) => hasChild.has(node.id) && sideToMove(node.fen) === side);
}

/** Walk each prompt down from the root so the card can show its line. */
export function lineTo(nodes: TrainableNode[], node: TrainableNode): string[] {
  const byId = new Map(nodes.map((item) => [item.id, item]));
  const out: string[] = [];
  let cursor: TrainableNode | undefined = node;
  while (cursor && cursor.parentId) {
    out.push(cursor.san);
    cursor = byId.get(cursor.parentId);
  }
  return out.reverse();
}

export function answersFor(nodes: TrainableNode[], nodeId: string): TrainerAnswer[] {
  return nodes
    .filter((node) => node.parentId === nodeId)
    .sort((a, b) => Number(b.isMain) - Number(a.isMain))
    .map((node) => ({ san: node.san, uci: node.uci, isMain: node.isMain }));
}

/**
 * Success: 1 → 3 → 7 → 21 days, then multiply by the ease factor.
 * Nothing is scheduled further than 180 days out, so a card never disappears.
 */
export function scheduleCorrect(
  interval: number,
  ease: number,
): { interval: number; ease: number; dueInMs: number } {
  const nextInterval = interval <= 1 ? 3 : interval < 7 ? 7 : interval < 21 ? 21 : Math.min(
    Math.round(interval * ease),
    MAX_INTERVAL_DAYS,
  );
  const nextEase = Math.min(3, ease + 0.05);
  return {
    interval: nextInterval,
    ease: nextEase,
    dueInMs: nextInterval * 24 * 60 * 60 * 1000,
  };
}

/** A miss costs you the interval and a slice of ease, never below 1.3. */
export function scheduleWrong(
  ease: number,
): { interval: number; ease: number; dueInMs: number } {
  return {
    interval: 1,
    ease: Math.max(1.3, ease - 0.2),
    dueInMs: LAPSE_DELAY_MS,
  };
}

export function accuracyOf(attempts: number, correct: number): number {
  if (attempts === 0) return 0;
  return Math.round((correct / attempts) * 100);
}
