-- Drop old unique index on link
DROP INDEX IF EXISTS "Article_link_key";

-- Add composite unique index on feedId + link
CREATE UNIQUE INDEX "Article_feedId_link_key" ON "Article"("feedId", "link");
