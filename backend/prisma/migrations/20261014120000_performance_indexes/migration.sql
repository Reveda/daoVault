-- Query-performance indexes for launch traffic.
-- Never block the live site: if a table lock is not granted within 10 s the migration fails
-- (scripts/start.mjs then stops this deploy and the previous version keeps serving), and no single
-- statement may run longer than 5 minutes. Tables are small at launch, so this takes seconds.
SET lock_timeout = '10s';
SET statement_timeout = '5min';

-- Dashboard package history and public activity feed.
CREATE INDEX "packages_user_id_created_at_idx" ON "packages"("user_id", "created_at");
CREATE INDEX "packages_created_at_idx" ON "packages"("created_at");
DROP INDEX IF EXISTS "packages_user_id_idx";

-- Dashboard/activity earning history and type-filtered activity.
CREATE INDEX "earnings_type_created_at_idx" ON "earnings"("type", "created_at");

-- Admin queues, voucher settlement, reserved-capacity checks, and activity feed.
CREATE INDEX "withdrawals_status_created_at_idx" ON "withdrawals"("status", "created_at");
CREATE INDEX "withdrawals_status_updated_at_idx" ON "withdrawals"("status", "updated_at");
CREATE INDEX "withdrawals_status_voucher_id_user_id_idx" ON "withdrawals"("status", "voucher_id", "user_id");
CREATE INDEX "withdrawals_status_voucher_deadline_idx" ON "withdrawals"("status", "voucher_deadline");
CREATE INDEX "withdrawals_status_reviewed_at_idx" ON "withdrawals"("status", "reviewed_at");

-- Daily auth cleanup should delete expired rows without scanning the whole tables.
CREATE INDEX "auth_nonces_expires_at_idx" ON "auth_nonces"("expires_at");
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens"("expires_at");
