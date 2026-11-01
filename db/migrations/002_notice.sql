-- 공지사항 게시판
CREATE TABLE IF NOT EXISTS "Notice" (
  id              serial PRIMARY KEY,
  title           text NOT NULL,
  content         text NOT NULL,
  category        text NOT NULL DEFAULT '공지',
  "isPinned"      boolean NOT NULL DEFAULT false,
  "isPublished"   boolean NOT NULL DEFAULT true,
  "authorId"      integer,
  "authorLoginId" text NOT NULL DEFAULT '',
  "authorName"    text NOT NULL DEFAULT '',
  "viewCount"     integer NOT NULL DEFAULT 0,
  "createdAt"     timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"     timestamp(3) NOT NULL DEFAULT now(),
  "deletedAt"     timestamp(3)
);

CREATE INDEX IF NOT EXISTS "Notice_pinned_created_idx" ON "Notice" ("isPinned", "createdAt");
CREATE INDEX IF NOT EXISTS "Notice_category_idx" ON "Notice" (category);
CREATE INDEX IF NOT EXISTS "Notice_deleted_idx" ON "Notice" ("deletedAt");
