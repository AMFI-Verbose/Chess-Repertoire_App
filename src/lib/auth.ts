import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

import { prisma } from "@/lib/prisma";

/**
 * Sessions are random tokens stored server-side; the cookie only carries the
 * token. Passwords are scrypt-hashed with a per-user salt — no plaintext and
 * no reversible encoding anywhere.
 */

const COOKIE = "session";
const DAY = 24 * 60 * 60 * 1000;

export type Viewer = { id: string; handle: string; email: string };

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password.normalize("NFKC"), salt, 64).toString("hex");
  return `s1:${salt}:${derived}`;
}

export function verifyPassword(stored: string, password: string): boolean {
  const [version, salt, hash] = stored.split(":");
  if (version !== "s1" || !salt || !hash) return false;
  const derived = scryptSync(password.normalize("NFKC"), salt, 64);
  const expected = Buffer.from(hash, "hex");
  if (expected.length !== derived.length) return false;
  return timingSafeEqual(expected, derived);
}

/** Create the session row and set the cookie. */
export async function startSession(userId: string): Promise<void> {
  const id = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + 30 * DAY);
  await prisma.session.create({ data: { id, userId, expiresAt } });

  const jar = await cookies();
  jar.set(COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { id: token } });
  }
  jar.delete(COOKIE);
}

/** The signed-in user, or null. Safe to call from any server component. */
export async function getViewer(): Promise<Viewer | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { id: token },
    include: { user: { select: { id: true, handle: true, email: true } } },
  });
  if (!session) return null;

  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.session.deleteMany({ where: { id: session.id } });
    return null;
  }
  return session.user;
}
