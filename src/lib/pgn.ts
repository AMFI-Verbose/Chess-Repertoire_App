/**
 * Repertoire → PGN, with variations.
 *
 * The tree already stores everything a PGN needs: each node is the move that
 * leads to it (SAN + resulting FEN), and its children are the alternatives from
 * that position. This file turns that tree into the nested parenthesised form
 * every chess program understands:
 *
 *   1. e4 e5 (1... c5 2. Nf3) 2. Nf3
 *
 * The one rule that takes care: a variation is placed *after the move it
 * replaces*, before the continuation. So when a position has several children,
 * the main child is written first, every sibling becomes a (...) branch, and
 * only then does the main child's own subtree follow.
 *
 * Kept free of imports so it can be run directly by Node for verification.
 */

export type PgnNode = {
  id: string;
  parentId: string | null;
  san: string;
  fen: string;
  ply: number;
  comment: string | null;
  isMain: boolean;
};

export type PgnInput = {
  name: string;
  side: "white" | "black";
  rootFen: string;
  nodes: PgnNode[];
  /** Injectable for deterministic tests. */
  date?: Date;
};

const STANDARD_START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function headerValue(value: string): string {
  // Quotes and backslashes cannot be escaped inside a PGN tag pair, so fold
  // them into safe characters instead of emitting a file no parser accepts.
  return value.replace(/"/g, "'").replace(/\\/g, "/");
}

/** Braces are delimiters in PGN, so they cannot survive inside a comment. */
function commentText(value: string): string {
  return value
    .replace(/\{/g, "(")
    .replace(/\}/g, ")")
    .replace(/\s+/g, " ")
    .trim();
}

function dateStamp(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}.${m}.${d}`;
}

/** Wrap the movetext near 80 columns, the width PGN was designed for. */
function wrap(tokens: string[], width = 80): string {
  const lines: string[] = [];
  let line = "";
  for (const token of tokens) {
    if (line.length === 0) {
      line = token;
    } else if (line.length + 1 + token.length <= width) {
      line += " " + token;
    } else {
      lines.push(line);
      line = token;
    }
  }
  if (line.length > 0) lines.push(line);
  return lines.join("\n");
}

export function buildRepertoirePgn(input: PgnInput): string {
  const byParent = new Map<string, PgnNode[]>();
  let rootId: string | null = null;

  for (const node of input.nodes) {
    if (node.ply === 0) {
      rootId = node.id;
      continue;
    }
    const key = node.parentId ?? "";
    const bucket = byParent.get(key);
    if (bucket) bucket.push(node);
    else byParent.set(key, [node]);
  }

  // The main line first, then the saved alternatives in creation order.
  // CUIDs are time-ordered, so id keeps branches in the order they were added.
  for (const bucket of byParent.values()) {
    bucket.sort((a, b) => {
      if (a.isMain !== b.isMain) return a.isMain ? -1 : 1;
      return a.id.localeCompare(b.id);
    });
  }

  const moveTokens = (node: PgnNode, forceNumber: boolean): string[] => {
    const out: string[] = [];
    const moveNumber = Math.ceil(node.ply / 2);
    const isWhite = node.ply % 2 === 1;
    if (isWhite) out.push(`${moveNumber}.`);
    else if (forceNumber) out.push(`${moveNumber}...`);
    out.push(node.san);
    if (node.comment && node.comment.trim().length > 0) {
      out.push(`{${commentText(node.comment)}}`);
    }
    return out;
  };

  const positionTokens = (parentId: string, forceNumber: boolean): string[] => {
    const children = byParent.get(parentId) ?? [];
    if (children.length === 0) return [];

    const [main, ...alternatives] = children;
    const out = moveTokens(main, forceNumber);

    for (const alt of alternatives) {
      out.push("(");
      out.push(...moveTokens(alt, true));
      out.push(...positionTokens(alt.id, Boolean(alt.comment)));
      out.push(")");
    }

    // A variation or a comment interrupts the flow, so the next Black move
    // needs its number again ("1. e4 (1. d4 d5) 1... e5").
    const forceNext = alternatives.length > 0 || Boolean(main.comment);
    out.push(...positionTokens(main.id, forceNext));
    return out;
  };

  const movetext = rootId ? positionTokens(rootId, true) : [];
  const tokens = movetext.length > 0 ? [...movetext, "*"] : ["*"];

  const headers: [string, string][] = [
    ["Event", input.name || "Repertoire"],
    ["Site", "Chess Repertoire"],
    ["Date", dateStamp(input.date ?? new Date())],
    ["Round", "-"],
    ["White", "?"],
    ["Black", "?"],
    ["Result", "*"],
  ];

  if (input.rootFen && input.rootFen !== STANDARD_START) {
    headers.push(["SetUp", "1"]);
    headers.push(["FEN", input.rootFen]);
  }

  const headerBlock = headers
    .map(([key, value]) => `[${key} "${headerValue(value)}"]`)
    .join("\n");

  // Tokens keep "(" and ")" separate so the wrapper may break lines safely;
  // close the gaps back up afterwards: "( 1. d4 )" reads like a typo.
  const movetextText = wrap(tokens)
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")");

  return `${headerBlock}\n\n${movetextText}\n`;
}
