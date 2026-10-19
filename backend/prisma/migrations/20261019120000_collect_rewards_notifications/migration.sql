-- Claim to collect + live notifications (owner, 2026-10-19).
-- earnings.collected_at: rank rewards and the fast-start bonus reach the balance only once collected.
-- Every reward that exists before this change stays in the balance (counted as collected).
SET lock_timeout = '10s';
ALTER TABLE "earnings" ADD COLUMN "collected_at" TIMESTAMP(3);
UPDATE "earnings" SET "collected_at" = "created_at" WHERE "collected_at" IS NULL;

CREATE TABLE "notifications" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "kind" VARCHAR(32) NOT NULL,
  "title" VARCHAR(120) NOT NULL,
  "body" VARCHAR(300) NOT NULL,
  "link" VARCHAR(40),
  "read_at" TIMESTAMP(3),
  "pushed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at");
CREATE INDEX "notifications_pushed_at_idx" ON "notifications"("pushed_at");
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
