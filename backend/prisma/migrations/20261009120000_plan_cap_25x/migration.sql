-- Marketing plan update (owner, 2026-10-09): the level-income cap is 25x the package (was 10x).
ALTER TABLE "packages" ALTER COLUMN "max_cap_limit" SET DEFAULT 7500;

-- Existing packages move to the new cap; a package capped under the old 10x limit earns again.
UPDATE "packages" SET "max_cap_limit" = "package_amount" * 25;
UPDATE "packages" SET "status" = 'ACTIVE' WHERE "status" = 'CAPPED' AND "total_earned" < "max_cap_limit";
