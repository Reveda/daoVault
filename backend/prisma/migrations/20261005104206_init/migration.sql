-- CreateEnum
CREATE TYPE "PackageStatus" AS ENUM ('ACTIVE', 'CAPPED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "EarningType" AS ENUM ('LEVEL_COMMISSION', 'RANK_REWARD');

-- CreateEnum
CREATE TYPE "WithdrawalStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'REJECTED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "wallet_address" VARCHAR(42) NOT NULL,
    "referral_code" VARCHAR(16) NOT NULL,
    "upline_id" UUID,
    "active_directs_count" INTEGER NOT NULL DEFAULT 0,
    "current_rank" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "packages" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "package_amount" DECIMAL(18,2) NOT NULL DEFAULT 300,
    "total_earned" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "max_cap_limit" DECIMAL(18,2) NOT NULL DEFAULT 3000,
    "status" "PackageStatus" NOT NULL DEFAULT 'ACTIVE',
    "activation_tx_hash" VARCHAR(66) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "earnings" (
    "id" UUID NOT NULL,
    "recipient_id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "package_id" UUID NOT NULL,
    "type" "EarningType" NOT NULL,
    "level" INTEGER,
    "percentage" DECIMAL(5,2),
    "amount_usd" DECIMAL(18,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "earnings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "withdrawals" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "gross_amount" DECIMAL(18,2) NOT NULL,
    "fee_amount" DECIMAL(18,2) NOT NULL,
    "net_amount" DECIMAL(18,2) NOT NULL,
    "destination_wallet" VARCHAR(42) NOT NULL,
    "status" "WithdrawalStatus" NOT NULL DEFAULT 'PENDING',
    "payout_tx_hash" VARCHAR(66),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "withdrawals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_wallet_address_key" ON "users"("wallet_address");

-- CreateIndex
CREATE UNIQUE INDEX "users_referral_code_key" ON "users"("referral_code");

-- CreateIndex
CREATE INDEX "users_upline_id_idx" ON "users"("upline_id");

-- CreateIndex
CREATE UNIQUE INDEX "packages_activation_tx_hash_key" ON "packages"("activation_tx_hash");

-- CreateIndex
CREATE INDEX "packages_user_id_idx" ON "packages"("user_id");

-- CreateIndex
CREATE INDEX "earnings_recipient_id_created_at_idx" ON "earnings"("recipient_id", "created_at");

-- CreateIndex
CREATE INDEX "earnings_package_id_idx" ON "earnings"("package_id");

-- CreateIndex
CREATE UNIQUE INDEX "withdrawals_payout_tx_hash_key" ON "withdrawals"("payout_tx_hash");

-- CreateIndex
CREATE INDEX "withdrawals_user_id_status_idx" ON "withdrawals"("user_id", "status");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_upline_id_fkey" FOREIGN KEY ("upline_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packages" ADD CONSTRAINT "packages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "earnings" ADD CONSTRAINT "earnings_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "earnings" ADD CONSTRAINT "earnings_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "earnings" ADD CONSTRAINT "earnings_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
