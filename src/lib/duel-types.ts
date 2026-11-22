export type DuelStatus = "open" | "playing" | "finished" | "cancelled";

/** Everything the client needs, and nothing that leaks an email. */
export type DuelState = {
  code: string;
  status: DuelStatus;
  visibility: "public" | "private";
  timeControl: string;
  clocked: boolean;
  hostHandle: string;
  hostColor: "white" | "black";
  guestHandle: string | null;
  whiteMs: number;
  blackMs: number;
  turn: "w" | "b";
  fen: string;
  pgn: string;
  winner: "white" | "black" | "draw" | null;
  resultText: string;
  lastMoveAt: string | null;
  createdAt: string;
};
