-- CreateTable
CREATE TABLE "chain_cursors" (
    "name" VARCHAR(64) NOT NULL,
    "block" BIGINT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chain_cursors_pkey" PRIMARY KEY ("name")
);
