-- 대시보드 읽기 모델: 집계 결과 1행 스냅샷
CREATE TABLE IF NOT EXISTS "DashboardSnapshot" (
  key                text PRIMARY KEY,
  payload            jsonb NOT NULL DEFAULT '{}'::jsonb,
  as_of              text NOT NULL DEFAULT '1970-01-01',
  updated_at         timestamptz NOT NULL DEFAULT now(),
  refresh_started_at timestamptz
);

CREATE INDEX IF NOT EXISTS "DashboardSnapshot_updated_at_idx"
  ON "DashboardSnapshot" (updated_at);
