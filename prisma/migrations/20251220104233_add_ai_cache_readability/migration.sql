-- AlterTable
ALTER TABLE "Article" ADD COLUMN "readabilityContent" TEXT;

-- CreateTable
CREATE TABLE "AiCache" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "articleId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "AiCache_articleId_idx" ON "AiCache"("articleId");

-- CreateIndex
CREATE UNIQUE INDEX "AiCache_articleId_type_language_key" ON "AiCache"("articleId", "type", "language");
