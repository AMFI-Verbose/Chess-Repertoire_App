"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import {
  endSession,
  getViewer,
  hashPassword,
  startSession,
  verifyPassword,
} from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { sendVerificationEmail } from "@/lib/mail";

export type AuthResult =
  | { ok: true; devLink?: string; message?: string }
  | { ok: false; error: string; retryAfterSeconds?: number };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HANDLE = /^[a-z0-9_]{3,20}$/;

const MESSAGES = {
  email: "That email address does not look right.",
  handle: "Handles are 3–20 characters: letters, digits or underscore.",
  short: "Use at least 8 characters.",
  taken: "That email or handle is already taken.",
  wrong: "Email/handle and password do not match.",
};

/** The real client address, including behind Vercel's or a reverse proxy's headers. */
async function clientIp(): Promise<string> {
  const store = await headers();
  const forwarded = store.get("x-forwarded-for");
  const candidate = forwarded?.split(",")[0].trim() || store.get("x-real-ip") || "";
  return candidate || "local";
}

function limited(retryAfterSeconds: number, what: string): AuthResult {
  return {
    ok: false,
    error: `Too many ${what} attempts. Try again in ${retryAfterSeconds}s.`,
    retryAfterSeconds,
  };
}

/**
 * Create an account, sign in, and send the confirmation link. The account can
 * read immediately; publishing and notes stay locked until the link is opened.
 */
export async function signUp(input: {
  email: string;
  handle: string;
  password: string;
}): Promise<AuthResult> {
  const ip = await clientIp();
  const gate = await rateLimit(`signup:ip:${ip}`, 5, 60 * 60);
  if (!gate.ok) return limited(gate.retryAfterSeconds, "signup");

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

  // No session yet: the address must be confirmed first, so the sign-up panel
  // (with its local confirmation link) is not replaced by a signed-in view.
  const delivery = await sendVerificationEmail(user.id, user.email);

  return {
    ok: true,
    devLink: delivery.devLink,
    message: delivery.delivered
      ? `We sent a confirmation link to ${email}.`
      : undefined,
  };
}

/** Sign in with either the email or the handle, plus the password. */
export async function signIn(input: {
  identity: string;
  password: string;
}): Promise<AuthResult> {
  const ip = await clientIp();
  const identity = input.identity.trim().toLowerCase();
  if (!identity || !input.password) return { ok: false, error: MESSAGES.wrong };

  const byIp = await rateLimit(`signin:ip:${ip}`, 12, 10 * 60);
  if (!byIp.ok) return limited(byIp.retryAfterSeconds, "sign-in");
  const byIdentity = await rateLimit(`signin:id:${identity}`, 6, 10 * 60);
  if (!byIdentity.ok) return limited(byIdentity.retryAfterSeconds, "sign-in");

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

/** Send the confirmation link again; older links stop working. */
export async function resendVerification(): Promise<AuthResult> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "Sign in first." };
  if (viewer.emailVerified) return { ok: true, message: "Already confirmed." };

  const gate = await rateLimit(`verify:user:${viewer.id}`, 3, 60 * 60);
  if (!gate.ok) return limited(gate.retryAfterSeconds, "confirmation email");

  const delivery = await sendVerificationEmail(viewer.id, viewer.email);
  return {
    ok: true,
    devLink: delivery.devLink,
    message: delivery.delivered ? `Sent again to ${viewer.email}.` : undefined,
  };
}

export async function signOutAction(): Promise<void> {
  await endSession();
  revalidatePath("/community");
}
