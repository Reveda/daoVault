-- Binary placement (owner, 2026-10-17): every member also sits in a LEFT / RIGHT placement tree.
-- The sponsor tree (upline_id) keeps directs and the 20-level income; team business, legs and
-- ranks follow the placement tree. A spot is taken once and never changes.
SET lock_timeout = '10s';
CREATE TYPE "PlacementSide" AS ENUM ('LEFT', 'RIGHT');

ALTER TABLE "users"
  ADD COLUMN "placement_id" UUID,
  ADD COLUMN "placement_side" "PlacementSide",
  ADD COLUMN "left_volume" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "right_volume" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD CONSTRAINT "users_placement_both_or_none"
  CHECK (("placement_id" IS NULL) = ("placement_side" IS NULL));
ALTER TABLE "users" ADD CONSTRAINT "users_placement_id_fkey"
  FOREIGN KEY ("placement_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "users_placement_id_placement_side_key" ON "users"("placement_id", "placement_side");

-- team volume now means the placement team (left + right): it is rebuilt as members are placed
UPDATE "users" SET "team_volume" = 0;

-- Power Business goes to one SIDE of its member (was: the leg of one direct)
ALTER TABLE "power_businesses" DROP CONSTRAINT IF EXISTS "power_businesses_leg_user_id_fkey";
ALTER TABLE "power_businesses" DROP COLUMN IF EXISTS "leg_user_id";
ALTER TABLE "power_businesses" ADD COLUMN "side" "PlacementSide" NOT NULL DEFAULT 'LEFT';
