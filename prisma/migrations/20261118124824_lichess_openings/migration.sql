-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Opening" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eco" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "movesUci" TEXT NOT NULL,
    "epd" TEXT NOT NULL DEFAULT '',
    "ply" INTEGER NOT NULL
);
INSERT INTO "new_Opening" ("eco", "id", "movesUci", "name", "ply") SELECT "eco", "id", "movesUci", "name", "ply" FROM "Opening";
DROP TABLE "Opening";
ALTER TABLE "new_Opening" RENAME TO "Opening";
CREATE INDEX "Opening_epd_idx" ON "Opening"("epd");
CREATE INDEX "Opening_ply_idx" ON "Opening"("ply");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
