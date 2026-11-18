// Shapes that cross the server/client boundary.
// Dates and Prisma objects are deliberately flattened to primitives so that
// React never has to serialise anything unexpected.

export type NodeDTO = {
  id: string;
  parentId: string | null;
  san: string;
  uci: string;
  fen: string;
  ply: number;
  comment: string | null;
  isMain: boolean;
};

export type RepertoireDTO = {
  id: string;
  name: string;
  side: "white" | "black";
  description: string | null;
};
