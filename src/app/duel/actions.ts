"use server";

import { getViewer } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import {
  acceptDuel,
  cancelDuel,
  createDuel,
  getDuelState,
  moveDuel,
  resignDuel,
} from "@/lib/duels";
import type { DuelState } from "@/lib/duel-types";

export type DuelResult =
  | { ok: true; state: DuelState; code: string }
  | { ok: false; error: string };

function fail(error: string): DuelResult {
  return { ok: false, error };
}

export async function createDuelAction(input: {
  timeControl: string;
  color: "white" | "black" | "random";
  visibility: "public" | "private";
}): Promise<DuelResult> {
  const viewer = await getViewer();
  if (!viewer) return fail("Sign in to create a challenge.");
  if (!viewer.emailVerified) return fail("Confirm your email before creating games.");

  const gate = await rateLimit(`duel:create:${viewer.id}`, 10, 60 * 60);
  if (!gate.ok) return fail("Too many challenges — try again in a little while.");

  try {
    const row = await createDuel({ hostId: viewer.id, ...input });
    const state = await getDuelState(row.code);
    if (!state) return fail("The challenge could not be created.");
    return { ok: true, state, code: row.code };
  } catch {
    return fail("The challenge could not be created.");
  }
}

export async function acceptDuelAction(code: string): Promise<DuelResult> {
  const viewer = await getViewer();
  if (!viewer) return fail("Sign in to accept a challenge.");
  if (!viewer.emailVerified) return fail("Confirm your email before playing.");

  try {
    const state = await acceptDuel(code, viewer.id);
    return { ok: true, state, code };
  } catch (error) {
    return fail(error instanceof Error ? error.message : "That challenge is not available.");
  }
}

export async function moveDuelAction(input: {
  code: string;
  from: string;
  to: string;
  promotion?: "q" | "r" | "b" | "n";
}): Promise<DuelResult> {
  const viewer = await getViewer();
  if (!viewer) return fail("Sign in to play.");

  const result = await moveDuel({ ...input, userId: viewer.id });
  if (!result.ok) return fail(result.error);
  return { ok: true, state: result.state, code: input.code };
}

export async function resignDuelAction(code: string): Promise<DuelResult> {
  const viewer = await getViewer();
  if (!viewer) return fail("Sign in to resign.");
  try {
    const state = await resignDuel(code, viewer.id);
    return { ok: true, state, code };
  } catch (error) {
    return fail(error instanceof Error ? error.message : "That game is not in progress.");
  }
}

export async function cancelDuelAction(code: string): Promise<DuelResult> {
  const viewer = await getViewer();
  if (!viewer) return fail("Sign in to cancel.");
  try {
    const state = await cancelDuel(code, viewer.id);
    return { ok: true, state, code };
  } catch (error) {
    return fail(error instanceof Error ? error.message : "That challenge cannot be cancelled.");
  }
}
