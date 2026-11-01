-- 업무연락 (부서간 커뮤니케이션)
CREATE TABLE IF NOT EXISTS "WorkContact" (
  id              serial PRIMARY KEY,
  title           text NOT NULL,
  content         text NOT NULL,
  "contactType"   text NOT NULL DEFAULT '요청',
  "receiverName"  text NOT NULL DEFAULT '',
  status          text NOT NULL DEFAULT '접수',
  response        text NOT NULL DEFAULT '',
  "respondedAt"   timestamp(3),
  "senderId"      integer,
  "senderLoginId" text NOT NULL DEFAULT '',
  "senderName"    text NOT NULL DEFAULT '',
  "createdAt"     timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"     timestamp(3) NOT NULL DEFAULT now(),
  "deletedAt"     timestamp(3)
);

CREATE INDEX IF NOT EXISTS "WorkContact_status_idx" ON "WorkContact" (status);
CREATE INDEX IF NOT EXISTS "WorkContact_type_idx" ON "WorkContact" ("contactType");
CREATE INDEX IF NOT EXISTS "WorkContact_deleted_idx" ON "WorkContact" ("deletedAt");
CREATE INDEX IF NOT EXISTS "WorkContact_sender_idx" ON "WorkContact" ("senderId");
