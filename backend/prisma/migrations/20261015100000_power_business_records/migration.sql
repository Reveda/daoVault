-- Display-only Power Business records. These are intentionally separate from packages:
-- no plan event, commission, rank reward, activation transaction, or withdrawal balance.
SET lock_timeout = '10s';
CREATE TABLE "power_businesses" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "amount_usd" DECIMAL(18,2) NOT NULL,
    "reference" VARCHAR(100) NOT NULL,
    "note" VARCHAR(280),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "power_businesses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "power_businesses_reference_key" ON "power_businesses"("reference");
CREATE INDEX "power_businesses_user_id_created_at_idx" ON "power_businesses"("user_id", "created_at");

ALTER TABLE "power_businesses" ADD CONSTRAINT "power_businesses_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
