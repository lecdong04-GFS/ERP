-- 일정관리
CREATE TABLE IF NOT EXISTS "Schedule" (
  id              serial PRIMARY KEY,
  title           text NOT NULL,
  content         text NOT NULL DEFAULT '',
  "scheduleDate"  text NOT NULL,
  "startTime"     text NOT NULL DEFAULT '',
  "endTime"       text NOT NULL DEFAULT '',
  category        text NOT NULL DEFAULT '기타',
  "allDay"        boolean NOT NULL DEFAULT true,
  department      text NOT NULL DEFAULT '',
  "authorId"      integer,
  "authorLoginId" text NOT NULL DEFAULT '',
  "authorName"    text NOT NULL DEFAULT '',
  "createdAt"     timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"     timestamp(3) NOT NULL DEFAULT now(),
  "deletedAt"     timestamp(3)
);

CREATE INDEX IF NOT EXISTS "Schedule_date_idx" ON "Schedule" ("scheduleDate");
CREATE INDEX IF NOT EXISTS "Schedule_category_idx" ON "Schedule" (category);
CREATE INDEX IF NOT EXISTS "Schedule_deleted_idx" ON "Schedule" ("deletedAt");
