"use server";

import {
  mistakeStats,
  nextMistake,
  submitMistakeAttempt,
  type MistakeCard,
  type MistakeStats,
} from "@/lib/mistakes";

export type MistakeLoad = { card: MistakeCard | null; stats: MistakeStats };

export async function loadMistakeCard(
  excludeId?: string,
  gameId?: string,
  ignoreDue = false,
): Promise<MistakeLoad> {
  return {
    card: await nextMistake(excludeId, gameId, ignoreDue),
    stats: await mistakeStats(gameId),
  };
}

export async function recordMistakeAttempt(input: {
  id: string;
  solved: boolean;
  gameId?: string;
  ignoreDue?: boolean;
}): Promise<{ stats: MistakeStats; next: MistakeCard | null; dueAt: string }> {
  // Deliberately no revalidatePath here: it would refresh the page mid-drill
  // and replace the card the user just answered with the next one. The client
  // owns the transition; a later page load reads fresh stats.
  return submitMistakeAttempt(
    input.id,
    input.solved,
    input.gameId,
    input.ignoreDue,
  );
}
