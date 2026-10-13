-- Plan queue (owner, 2026-10-13): commissions, directs, team volume and ranks are applied by one
-- runner in payment order, so launch-day bursts do not fight over the same upline rows.

-- packages: when the queue counted it (volume, legs). Every existing package was already counted
-- by the old in-transaction engine.
ALTER TABLE "packages" ADD COLUMN "counted_at" TIMESTAMP(3);
UPDATE "packages" SET "counted_at" = "created_at";

CREATE TABLE "plan_events" (
    "id" BIGSERIAL NOT NULL,
    "package_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "is_activation" BOOLEAN NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "plan_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "plan_events_package_id_key" ON "plan_events"("package_id");
CREATE INDEX "plan_events_processed_at_id_idx" ON "plan_events"("processed_at", "id");
