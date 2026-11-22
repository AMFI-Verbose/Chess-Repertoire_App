import { prisma } from "@/lib/prisma";

/**
 * Fixed-window rate limiting backed by Postgres, so it works across several
 * app instances (Vercel lambdas, Docker replicas) instead of dying with one
 * process. Each window is its own row, and the row id encodes the window, which
 * makes the upsert a single atomic INSERT … ON CONFLICT.
 */

export type Limit = { ok: true } | { ok: false; retryAfterSeconds: number };

export async function rateLimit(
  bucket: string,
  limit: number,
  windowSeconds: number,
  cost = 1,
): Promise<Limit> {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const windowStart = new Date(Math.floor(now / windowMs) * windowMs);
  const id = `${bucket}:${windowStart.getTime()}`;

  const row = await prisma.rateLimit.upsert({
    where: { id },
    create: { id, bucket, count: cost, windowStart },
    update: { count: { increment: cost } },
    select: { count: true },
  });

  if (row.count > limit) {
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((windowStart.getTime() + windowMs - now) / 1000)),
    };
  }

  // Cheap housekeeping: old windows are useless, and doing it here means no
  // separate cron job has to remember.
  if (Math.random() < 0.02) {
    await prisma.rateLimit
      .deleteMany({ where: { windowStart: { lt: new Date(now - 2 * 24 * 60 * 60 * 1000) } } })
      .catch(() => {});
  }

  return { ok: true };
}
