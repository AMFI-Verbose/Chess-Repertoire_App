-- AlterTable
ALTER TABLE "PuzzleAttempt" ADD COLUMN "ratingAfter" INTEGER;
ALTER TABLE "PuzzleAttempt" ADD COLUMN "ratingBefore" INTEGER;

-- CreateTable
CREATE TABLE "Profile" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'local',
    "name" TEXT NOT NULL DEFAULT 'You',
    "puzzleRating" INTEGER NOT NULL DEFAULT 1500,
    "peakRating" INTEGER NOT NULL DEFAULT 1500,
    "updatedAt" DATETIME NOT NULL
);
