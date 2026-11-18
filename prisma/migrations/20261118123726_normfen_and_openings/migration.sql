-- CreateTable
CREATE TABLE "Opening" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eco" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "movesUci" TEXT NOT NULL,
    "ply" INTEGER NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Node" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "repertoireId" TEXT NOT NULL,
    "parentId" TEXT,
    "san" TEXT NOT NULL,
    "uci" TEXT NOT NULL,
    "fen" TEXT NOT NULL,
    "normFen" TEXT NOT NULL DEFAULT '',
    "ply" INTEGER NOT NULL,
    "comment" TEXT,
    "isMain" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Node_repertoireId_fkey" FOREIGN KEY ("repertoireId") REFERENCES "Repertoire" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Node_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Node" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Node" ("comment", "createdAt", "fen", "id", "isMain", "parentId", "ply", "repertoireId", "san", "uci") SELECT "comment", "createdAt", "fen", "id", "isMain", "parentId", "ply", "repertoireId", "san", "uci" FROM "Node";
DROP TABLE "Node";
ALTER TABLE "new_Node" RENAME TO "Node";
CREATE INDEX "Node_repertoireId_idx" ON "Node"("repertoireId");
CREATE INDEX "Node_parentId_idx" ON "Node"("parentId");
CREATE INDEX "Node_normFen_idx" ON "Node"("normFen");
CREATE UNIQUE INDEX "Node_parentId_uci_key" ON "Node"("parentId", "uci");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Opening_ply_idx" ON "Opening"("ply");
