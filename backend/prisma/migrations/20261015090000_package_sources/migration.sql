-- Distinguish verifiable on-chain packages from future system-assigned business.
-- Public activity only exposes ON_CHAIN packages.
SET lock_timeout = '10s';
CREATE TYPE "PackageSource" AS ENUM ('ON_CHAIN', 'POWER_BUSINESS');

ALTER TABLE "packages"
ADD COLUMN "source" "PackageSource" NOT NULL DEFAULT 'ON_CHAIN';
