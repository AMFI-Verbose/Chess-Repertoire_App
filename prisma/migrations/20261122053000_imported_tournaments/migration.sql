ALTER TABLE "Tournament" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'local';
ALTER TABLE "Tournament" ADD COLUMN "externalId" TEXT;
ALTER TABLE "Tournament" ADD COLUMN "externalUrl" TEXT;
ALTER TABLE "Tournament" ADD COLUMN "players" INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX "Tournament_source_externalId_key" ON "Tournament"("source", "externalId");
