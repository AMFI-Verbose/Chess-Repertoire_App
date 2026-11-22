"use server";

import { redirect } from "next/navigation";

import { getViewer } from "@/lib/auth";
import {
  createTournament,
  findTournamentGame,
  joinTournament,
  leaveTournament,
} from "@/lib/tournaments";

function back(path: string, message: string) {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

export async function createTournamentAction(formData: FormData) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  const name = String(formData.get("name") ?? "");
  const startsInMinutes = Number(formData.get("startsInMinutes") ?? 10);
  const durationMinutes = Number(formData.get("durationMinutes") ?? 60);
  const timeControl = String(formData.get("timeControl") ?? "3+2");

  try {
    const created = await createTournament({ name, startsInMinutes, durationMinutes, timeControl });
    redirect(`/tournaments/${created.id}`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    back("/tournaments", error instanceof Error ? error.message : "Could not create it.");
  }
}

export async function joinTournamentAction(formData: FormData) {
  const viewer = await getViewer();
  const id = String(formData.get("id") ?? "");
  if (!viewer) redirect("/login");

  try {
    await joinTournament(id, viewer.id);
  } catch (error) {
    back(`/tournaments/${id}`, error instanceof Error ? error.message : "Could not join.");
  }
  redirect(`/tournaments/${id}`);
}

export async function leaveTournamentAction(formData: FormData) {
  const viewer = await getViewer();
  const id = String(formData.get("id") ?? "");
  if (!viewer) redirect("/login");

  try {
    await leaveTournament(id, viewer.id);
  } catch (error) {
    back(`/tournaments/${id}`, error instanceof Error ? error.message : "Could not withdraw.");
  }
  redirect(`/tournaments/${id}`);
}

export async function findTournamentGameAction(formData: FormData) {
  const viewer = await getViewer();
  const id = String(formData.get("id") ?? "");
  if (!viewer) redirect("/login");

  let code = "";
  try {
    code = await findTournamentGame(id, viewer.id);
  } catch (error) {
    back(`/tournaments/${id}`, error instanceof Error ? error.message : "Could not pair you.");
  }
  redirect(`/duel/${code}`);
}
