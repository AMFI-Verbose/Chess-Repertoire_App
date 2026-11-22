"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import {
  endSession,
  hashPassword,
  startSession,
  verifyPassword,
} from "@/lib/auth";

export type AuthResult = { ok: true } | { ok: false; error: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HANDLE = /^[a-z0-9_]{3,20}$/;

const MESSAGES = {
  email: "That email address does not look right.",
  handle: "Handles are 3–20 characters: letters, digits or underscore.",
  short: "Use at least 8 characters.",
  taken: "That email or handle is already taken.",
  wrong: "Email/handle and password do not match.",
};

/**
 * Create an account and sign in immediately. Handles are lowercased so
 * "@Anna" and "@anna" cannot become two different people.
 */
export async function signUp(input: {
  email: string;
  handle: string;
  password: string;
}): Promise<AuthResult> {
  const email = input.email.trim().toLowerCase();
  const handle = input.handle.trim().toLowerCase();
  const password = input.password;

  if (!EMAIL.test(email)) return { ok: false, error: MESSAGES.email };
  if (!HANDLE.test(handle)) return { ok: false, error: MESSAGES.handle };
  if (password.length < 8) return { ok: false, error: MESSAGES.short };

  const clash = await prisma.user.findFirst({
    where: { OR: [{ email }, { handle }] },
    select: { id: true },
  });
  if (clash) return { ok: false, error: MESSAGES.taken };

  const user = await prisma.user.create({
    data: { email, handle, passwordHash: hashPassword(password) },
  });

  await startSession(user.id);
  revalidatePath("/community");
  return { ok: true };
}

/** Sign in with either the email or the handle, plus the password. */
export async function signIn(input: {
  identity: string;
  password: string;
}): Promise<AuthResult> {
  const identity = input.identity.trim().toLowerCase();
  if (!identity || !input.password) return { ok: false, error: MESSAGES.wrong };

  const user = await prisma.user.findFirst({
    where: { OR: [{ email: identity }, { handle: identity }] },
  });

  // Same answer for "no such user" and "wrong password", and always run a
  // hash comparison so the response time does not reveal which one it was.
  const stored = user?.passwordHash ?? hashPassword("placeholder-password");
  const matches = verifyPassword(stored, input.password);
  if (!user || !matches) return { ok: false, error: MESSAGES.wrong };

  await startSession(user.id);
  revalidatePath("/community");
  return { ok: true };
}

export async function signOutAction(): Promise<void> {
  await endSession();
  revalidatePath("/community");
}
