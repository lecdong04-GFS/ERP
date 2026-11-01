ALTER TABLE "Inventory" ADD COLUMN IF NOT EXISTS "dailyUsage" double precision NOT NULL DEFAULT 0;
