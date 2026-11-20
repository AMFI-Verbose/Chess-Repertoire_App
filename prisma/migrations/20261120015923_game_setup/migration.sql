-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Game" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL DEFAULT 'engine',
    "playerColor" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "resultText" TEXT NOT NULL DEFAULT '',
    "skill" INTEGER NOT NULL DEFAULT 12,
    "level" INTEGER NOT NULL DEFAULT 4,
    "timeControl" TEXT NOT NULL DEFAULT 'unlimited',
    "startFen" TEXT NOT NULL DEFAULT '',
    "pgn" TEXT NOT NULL,
    "fen" TEXT NOT NULL,
    "plies" INTEGER NOT NULL DEFAULT 0,
    "analysis" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Game" ("analysis", "createdAt", "fen", "id", "kind", "pgn", "playerColor", "plies", "result", "resultText", "skill") SELECT "analysis", "createdAt", "fen", "id", "kind", "pgn", "playerColor", "plies", "result", "resultText", "skill" FROM "Game";
DROP TABLE "Game";
ALTER TABLE "new_Game" RENAME TO "Game";
CREATE INDEX "Game_createdAt_idx" ON "Game"("createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
