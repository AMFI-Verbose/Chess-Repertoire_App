-- Account ownership for games and puzzle attempts.
ALTER TABLE "Game" ADD COLUMN "userId" TEXT;
ALTER TABLE "PuzzleAttempt" ADD COLUMN "userId" TEXT;

CREATE INDEX "Game_userId_createdAt_idx" ON "Game"("userId", "createdAt");
CREATE INDEX "PuzzleAttempt_userId_createdAt_idx" ON "PuzzleAttempt"("userId", "createdAt");

ALTER TABLE "Game"
  ADD CONSTRAINT "Game_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PuzzleAttempt"
  ADD CONSTRAINT "PuzzleAttempt_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The app stored one local history before accounts owned records. Claim it for
-- the oldest account so the first real profile is not empty. Fresh databases
-- have no users yet, in which case the subquery yields NULL and the rows stay
-- unowned until the next import or game.
UPDATE "Game"
SET "userId" = (SELECT "id" FROM "User" ORDER BY "createdAt" ASC LIMIT 1)
WHERE "userId" IS NULL;

UPDATE "PuzzleAttempt"
SET "userId" = (SELECT "id" FROM "User" ORDER BY "createdAt" ASC LIMIT 1)
WHERE "userId" IS NULL;

-- One rating per player and time-control family, plus the raw points that
-- make the Lichess-style history graph possible.
CREATE TABLE "PlayerRating" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "rating" INTEGER NOT NULL DEFAULT 1500,
  "peak" INTEGER NOT NULL DEFAULT 1500,
  "games" INTEGER NOT NULL DEFAULT 0,
  "wins" INTEGER NOT NULL DEFAULT 0,
  "draws" INTEGER NOT NULL DEFAULT 0,
  "losses" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlayerRating_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RatingPoint" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "rating" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RatingPoint_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlayerRating_userId_category_key" ON "PlayerRating"("userId", "category");
CREATE INDEX "PlayerRating_category_rating_idx" ON "PlayerRating"("category", "rating");
CREATE INDEX "RatingPoint_userId_category_createdAt_idx" ON "RatingPoint"("userId", "category", "createdAt");

ALTER TABLE "PlayerRating"
  ADD CONSTRAINT "PlayerRating_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RatingPoint"
  ADD CONSTRAINT "RatingPoint_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
