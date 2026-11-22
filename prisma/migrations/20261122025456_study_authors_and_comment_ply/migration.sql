-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Comment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studyId" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "ply" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Comment_studyId_fkey" FOREIGN KEY ("studyId") REFERENCES "Study" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Comment" ("author", "body", "createdAt", "id", "studyId") SELECT "author", "body", "createdAt", "id", "studyId" FROM "Comment";
DROP TABLE "Comment";
ALTER TABLE "new_Comment" RENAME TO "Comment";
CREATE INDEX "Comment_studyId_idx" ON "Comment"("studyId");
CREATE TABLE "new_Study" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "subtitle" TEXT NOT NULL DEFAULT '',
    "pgn" TEXT NOT NULL,
    "eco" TEXT NOT NULL DEFAULT '',
    "author" TEXT NOT NULL DEFAULT 'Community',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Study" ("createdAt", "eco", "id", "pgn", "subtitle", "title") SELECT "createdAt", "eco", "id", "pgn", "subtitle", "title" FROM "Study";
DROP TABLE "Study";
ALTER TABLE "new_Study" RENAME TO "Study";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
