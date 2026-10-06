-- AlterTable
ALTER TABLE "users" ADD COLUMN     "team_volume" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "withdrawals" ADD COLUMN     "reject_reason" VARCHAR(280),
ADD COLUMN     "reviewed_at" TIMESTAMP(3),
ADD COLUMN     "reviewed_by" VARCHAR(42),
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "auth_nonces" (
    "wallet_address" VARCHAR(42) NOT NULL,
    "message" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_nonces_pkey" PRIMARY KEY ("wallet_address")
);
