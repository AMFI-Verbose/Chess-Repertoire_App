// Copy the Stockfish WASM build from node_modules into public/engine/.
//
// Why this exists instead of just committing the binaries:
//  1. Stockfish is GPL-3.0. Shipping its compiled binary inside an MIT repo
//     makes the licensing story muddy; regenerating it from the dependency
//     keeps the repo's own code MIT and the engine clearly third-party.
//  2. It's 1.8 MB of generated artefact that npm already gave us — it does not
//     belong in git history.
//
// Runs automatically via `predev` and `prebuild` in package.json.

import { access, copyFile, mkdir } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";

const SOURCE_DIR = path.join("node_modules", "stockfish", "bin");
const TARGET_DIR = path.join("public", "engine");
const FILES = ["stockfish-19-lite-single.js", "stockfish-19-lite-single.wasm"];

const exists = async (file) => {
  try {
    await access(file, constants.F_OK);
    return true;
  } catch {
    return false;
  }
};

async function main() {
  const missing = [];
  for (const file of FILES) {
    if (!(await exists(path.join(SOURCE_DIR, file)))) missing.push(file);
  }

  if (missing.length > 0) {
    // Already copied earlier? Then a missing node_modules is not fatal.
    if (await exists(path.join(TARGET_DIR, FILES[1]))) {
      console.log("[engine] public/engine already populated, skipping copy");
      return;
    }
    console.error(
      `[engine] missing ${missing.join(", ")} in ${SOURCE_DIR}.\n` +
        `         Run "npm install" first, then try again.`,
    );
    process.exit(1);
  }

  await mkdir(TARGET_DIR, { recursive: true });
  for (const file of FILES) {
    await copyFile(path.join(SOURCE_DIR, file), path.join(TARGET_DIR, file));
  }
  console.log(`[engine] copied ${FILES.length} files into public/engine`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
