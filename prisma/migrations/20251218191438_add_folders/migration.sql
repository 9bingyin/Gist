-- CreateTable
CREATE TABLE "Folder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Feed" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "siteUrl" TEXT,
    "description" TEXT,
    "imageUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "folderId" TEXT,
    CONSTRAINT "Feed_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Feed" ("createdAt", "description", "id", "imageUrl", "siteUrl", "title", "updatedAt", "url") SELECT "createdAt", "description", "id", "imageUrl", "siteUrl", "title", "updatedAt", "url" FROM "Feed";
DROP TABLE "Feed";
ALTER TABLE "new_Feed" RENAME TO "Feed";
CREATE UNIQUE INDEX "Feed_url_key" ON "Feed"("url");
CREATE INDEX "Feed_folderId_idx" ON "Feed"("folderId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
