/**
 * Verifies the Learn curriculum against chess.js: every SAN move must be legal
 * in the position it is played from, every task must be findable, and a move
 * written as mate must actually be checkmate.
 *
 * Run with: npx tsx scripts/check-lessons.mts
 */
import { Chess } from "chess.js";

import { LESSONS } from "../src/lib/learn";

let failures = 0;

for (const lesson of LESSONS) {
  const game = new Chess(lesson.startFen);
  let askCount = 0;

  for (const [index, step] of lesson.steps.entries()) {
    const label = `${lesson.id} step ${index + 1}`;

    if (step.ask && step.play) {
      console.error(`✗ ${label}: a step cannot both ask and play`);
      failures += 1;
    }

    for (const san of [step.play, step.ask]) {
      if (!san) continue;
      if (san === step.ask) askCount += 1;
      try {
        const move = game.move(san);
        if (san.endsWith("#") && !game.isCheckmate()) {
          console.error(`✗ ${label}: ${san} claimed mate but is not mate`);
          failures += 1;
        }
        void move;
      } catch (error) {
        console.error(`✗ ${label}: ${san} is illegal — ${(error as Error).message}`);
        failures += 1;
      }
    }
  }

  if (askCount === 0) {
    console.error(`✗ ${lesson.id}: no interactive step`);
    failures += 1;
  }

  console.log(`✓ ${lesson.id} — ${askCount} task(s), final FEN ${game.fen()}`);
}

if (failures > 0) {
  console.error(`\n${failures} problem(s)`);
  process.exit(1);
}
console.log("\nAll lessons are legal.");
