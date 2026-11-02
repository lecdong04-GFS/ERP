-- 성장전략 아이디어
CREATE TABLE IF NOT EXISTS "GrowthIdea" (
  id              serial PRIMARY KEY,
  "ideaDate"      text NOT NULL,
  category        text NOT NULL DEFAULT '업무개선',
  title           text NOT NULL,
  content         text NOT NULL DEFAULT '',
  "expectedEffect" text NOT NULL DEFAULT '',
  status          text NOT NULL DEFAULT '제안',
  department      text NOT NULL DEFAULT '',
  "authorId"      integer,
  "authorLoginId" text NOT NULL DEFAULT '',
  "authorName"    text NOT NULL DEFAULT '',
  "createdAt"     timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"     timestamp(3) NOT NULL DEFAULT now(),
  "deletedAt"     timestamp(3)
);

CREATE INDEX IF NOT EXISTS "GrowthIdea_status_idx" ON "GrowthIdea" (status);
CREATE INDEX IF NOT EXISTS "GrowthIdea_category_idx" ON "GrowthIdea" (category);
CREATE INDEX IF NOT EXISTS "GrowthIdea_date_idx" ON "GrowthIdea" ("ideaDate");
CREATE INDEX IF NOT EXISTS "GrowthIdea_deleted_idx" ON "GrowthIdea" ("deletedAt");
CREATE INDEX IF NOT EXISTS "GrowthIdea_author_idx" ON "GrowthIdea" ("authorId");
