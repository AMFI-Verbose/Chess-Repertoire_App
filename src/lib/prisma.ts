import { PrismaClient } from "@prisma/client";

// Next.js hot-reloads modules constantly. Without this singleton, every reload
// would create a new connection pool and blow past SQLite's limits.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["warn", "error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
