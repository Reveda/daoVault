-- Access + refresh tokens: refresh tokens live in an httpOnly cookie; only their hash is stored.
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "wallet_address" VARCHAR(42) NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "family_id" UUID NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");
CREATE INDEX "refresh_tokens_wallet_address_idx" ON "refresh_tokens"("wallet_address");
CREATE INDEX "refresh_tokens_family_id_idx" ON "refresh_tokens"("family_id");
