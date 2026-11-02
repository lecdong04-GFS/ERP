-- 업무분장관리
CREATE TABLE IF NOT EXISTS "WorkRole" (
  id              serial PRIMARY KEY,
  "dutyName"      text NOT NULL,
  category        text NOT NULL DEFAULT '생산',
  department      text NOT NULL DEFAULT '',
  "managerName"   text NOT NULL DEFAULT '',
  "subManagerName" text NOT NULL DEFAULT '',
  cycle           text NOT NULL DEFAULT '매일',
  remark          text NOT NULL DEFAULT '',
  "isUsed"        boolean NOT NULL DEFAULT true,
  "authorId"      integer,
  "authorLoginId" text NOT NULL DEFAULT '',
  "authorName"    text NOT NULL DEFAULT '',
  "createdAt"     timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"     timestamp(3) NOT NULL DEFAULT now(),
  "deletedAt"     timestamp(3)
);

CREATE INDEX IF NOT EXISTS "WorkRole_category_idx" ON "WorkRole" (category);
CREATE INDEX IF NOT EXISTS "WorkRole_department_idx" ON "WorkRole" (department);
CREATE INDEX IF NOT EXISTS "WorkRole_used_idx" ON "WorkRole" ("isUsed");
CREATE INDEX IF NOT EXISTS "WorkRole_deleted_idx" ON "WorkRole" ("deletedAt");
