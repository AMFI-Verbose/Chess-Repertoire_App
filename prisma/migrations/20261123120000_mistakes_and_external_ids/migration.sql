ALTER TABLE "Game" ADD COLUMN "externalId" TEXT;
ALTER TABLE "Game" ADD COLUMN "externalUrl" TEXT;
CREATE UNIQUE INDEX "Game_externalId_key" ON "Game"("externalId");

CREATE TABLE "Mistake" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "ply" INTEGER NOT NULL,
    "fen" TEXT NOT NULL,
    "solution" TEXT NOT NULL,
    "playedUci" TEXT NOT NULL,
    "playedSan" TEXT NOT NULL DEFAULT '',
    "bestSan" TEXT NOT NULL DEFAULT '',
    "label" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "interval" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "solvedCount" INTEGER NOT NULL DEFAULT 0,
    "lastSeen" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Mistake_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Mistake_gameId_ply_key" ON "Mistake"("gameId", "ply");
CREATE INDEX "Mistake_dueAt_idx" ON "Mistake"("dueAt");

ALTER TABLE "Mistake" ADD CONSTRAINT "Mistake_gameId_fkey"
FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
