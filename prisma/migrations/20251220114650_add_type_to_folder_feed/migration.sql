-- AlterTable
ALTER TABLE "Feed" ADD COLUMN "type" TEXT NOT NULL DEFAULT 'article';

-- AlterTable
ALTER TABLE "Folder" ADD COLUMN "type" TEXT NOT NULL DEFAULT 'article';
