-- CreateTable
CREATE TABLE "Game" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL DEFAULT 'engine',
    "playerColor" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "resultText" TEXT NOT NULL DEFAULT '',
    "skill" INTEGER NOT NULL DEFAULT 12,
    "pgn" TEXT NOT NULL,
    "fen" TEXT NOT NULL,
    "plies" INTEGER NOT NULL DEFAULT 0,
    "analysis" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "Game_createdAt_idx" ON "Game"("createdAt");
