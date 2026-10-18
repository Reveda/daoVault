-- Fast-start clock (owner, 2026-10-18): when the member paid on-chain (the event's block time), so a
-- payment recorded late still counts from the moment it was made. Nullable: older rows use created_at.
SET lock_timeout = '10s';
ALTER TABLE "packages" ADD COLUMN "paid_at" TIMESTAMP(3);
