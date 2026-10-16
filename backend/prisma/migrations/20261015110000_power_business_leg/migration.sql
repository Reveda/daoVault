-- Power Business placed in ONE leg (owner, 2026-10-15): the direct whose leg receives the whole
-- amount. Empty = not placed in a leg (then it forms its own side).
SET lock_timeout = '10s';
ALTER TABLE "power_businesses" ADD COLUMN "leg_user_id" UUID;
ALTER TABLE "power_businesses" ADD CONSTRAINT "power_businesses_leg_user_id_fkey"
  FOREIGN KEY ("leg_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
