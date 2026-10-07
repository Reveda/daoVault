-- AlterTable
ALTER TABLE "withdrawals" ADD COLUMN     "voucher_amount" VARCHAR(80),
ADD COLUMN     "voucher_deadline" TIMESTAMP(3),
ADD COLUMN     "voucher_id" VARCHAR(66),
ADD COLUMN     "voucher_signature" VARCHAR(140);

-- CreateIndex
CREATE UNIQUE INDEX "withdrawals_voucher_id_key" ON "withdrawals"("voucher_id");
