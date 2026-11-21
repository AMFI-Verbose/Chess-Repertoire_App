/**
 * Verifies the Learn curriculum against chess.js: every SAN move must be legal
 * in the position it is played from, every task must be findable, and a move
 * written as mate must actually be checkmate.
 *
 * Run with: npx tsx scripts/check-lessons.mts (also runs before every build).
 */
import { Chess } from "chess.js";

import { CHAPTERS, LESSONS } from "../src/lib/learn";

let failures = 0;
const fail = (message: string) => {
  console.error(`✗ ${message}`);
  failures += 1;
};

for (const chapter of CHAPTERS) {
  if (chapter.lessons.length === 0) fail(`${chapter.id}: chapter has no lessons`);

  for (const lesson of chapter.lessons) {
    let game: Chess;
    try {
      game = new Chess(lesson.startFen);
    } catch (error) {
      fail(`${lesson.id}: invalid start FEN — ${(error as Error).message}`);
      continue;
    }

    let asks = 0;
    const ids = new Set<string>();

    if (ids.has(lesson.id)) fail(`${lesson.id}: duplicate lesson id`);
    ids.add(lesson.id);

    for (const [index, step] of lesson.steps.entries()) {
      const label = `${lesson.id} step ${index + 1}`;

      if (!step.say || step.say.trim().length < 20) {
        fail(`${label}: coach line is missing or too short`);
      }
      if (step.ask && step.play) fail(`${label}: a step cannot both ask and play`);

      const moves = [
        ...(step.play ? [{ san: step.play, kind: "play" as const }] : []),
        ...(step.ask
          ? [{ san: step.ask, kind: "ask" as const }, ...(step.accept ?? []).map((san) => ({ san, kind: "ask" as const }))]
          : []),
      ];

      for (const entry of moves) {
        if (entry.kind === "ask") asks += 1;
        try {
          if (entry.kind === "ask") {
            // Test the student's move on a throwaway board; the main board only
            // advances on the primary answer.
            const trial = new Chess(game.fen());
            const move = trial.move(entry.san);
            if (entry.san.endsWith("#") && !trial.isCheckmate()) {
              fail(`${label}: ${entry.san} claimed mate but is not mate`);
            }
            void move;
            if (entry.san === step.ask) game.move(entry.san);
          } else {
            const move = game.move(entry.san);
            if (entry.san.endsWith("#") && !game.isCheckmate()) {
              fail(`${label}: ${entry.san} claimed mate but is not mate`);
            }
            void move;
          }
        } catch (error) {
          fail(`${label}: ${entry.san} is illegal — ${(error as Error).message}`);
        }
      }
    }

    if (asks === 0) fail(`${lesson.id}: no interactive step`);
    if (!lesson.blurb || lesson.blurb.length < 20) fail(`${lesson.id}: no blurb`);
    if (!Number.isFinite(lesson.minutes) || lesson.minutes <= 0) {
      fail(`${lesson.id}: minutes must be a positive number`);
    }

    console.log(
      `✓ ${chapter.id} / ${lesson.id} — ${asks} task(s), ${lesson.steps.length} steps, final ${game.fen().split(" ")[0]}`,
    );
  }
}

const total = LESSONS.length;
const pro = LESSONS.filter((lesson) => lesson.tier === "pro").length;
console.log(`\n${total} lessons (${pro} pro) in ${CHAPTERS.length} chapters.`);

if (failures > 0) {
  console.error(`${failures} problem(s)`);
  process.exit(1);
}
console.log("All lessons are legal.");
