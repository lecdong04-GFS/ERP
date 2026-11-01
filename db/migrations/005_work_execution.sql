-- 업무실행등록 (일일 업무 일지)
CREATE TABLE IF NOT EXISTS "WorkExecution" (
  id              serial PRIMARY KEY,
  "execDate"      text NOT NULL,
  "execType"      text NOT NULL DEFAULT '정기업무',
  title           text NOT NULL,
  content         text NOT NULL DEFAULT '',
  hours           double precision NOT NULL DEFAULT 0,
  status          text NOT NULL DEFAULT '완료',
  department      text NOT NULL DEFAULT '',
  "authorId"      integer,
  "authorLoginId" text NOT NULL DEFAULT '',
  "authorName"    text NOT NULL DEFAULT '',
  "createdAt"     timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"     timestamp(3) NOT NULL DEFAULT now(),
  "deletedAt"     timestamp(3)
);

CREATE INDEX IF NOT EXISTS "WorkExecution_date_idx" ON "WorkExecution" ("execDate");
CREATE INDEX IF NOT EXISTS "WorkExecution_type_idx" ON "WorkExecution" ("execType");
CREATE INDEX IF NOT EXISTS "WorkExecution_deleted_idx" ON "WorkExecution" ("deletedAt");
CREATE INDEX IF NOT EXISTS "WorkExecution_author_idx" ON "WorkExecution" ("authorId");
