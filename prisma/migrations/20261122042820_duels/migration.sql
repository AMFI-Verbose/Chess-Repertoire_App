-- CreateTable
CREATE TABLE "Duel" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'public',
    "status" TEXT NOT NULL DEFAULT 'open',
    "hostId" TEXT NOT NULL,
    "hostColor" TEXT NOT NULL,
    "guestId" TEXT,
    "timeControl" TEXT NOT NULL,
    "clocked" BOOLEAN NOT NULL DEFAULT true,
    "whiteMs" INTEGER NOT NULL DEFAULT 0,
    "blackMs" INTEGER NOT NULL DEFAULT 0,
    "turn" TEXT NOT NULL DEFAULT 'w',
    "pgn" TEXT NOT NULL DEFAULT '',
    "fen" TEXT NOT NULL,
    "lastMoveAt" TIMESTAMP(3),
    "winner" TEXT,
    "resultText" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Duel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Duel_code_key" ON "Duel"("code");

-- CreateIndex
CREATE INDEX "Duel_status_visibility_createdAt_idx" ON "Duel"("status", "visibility", "createdAt");

-- CreateIndex
CREATE INDEX "Duel_guestId_idx" ON "Duel"("guestId");

-- AddForeignKey
ALTER TABLE "Duel" ADD CONSTRAINT "Duel_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Duel" ADD CONSTRAINT "Duel_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
