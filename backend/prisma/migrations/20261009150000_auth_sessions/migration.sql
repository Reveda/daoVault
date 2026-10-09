-- "Log out all devices": a session version per wallet; tokens with an older version are refused.
CREATE TABLE "auth_sessions" (
    "wallet_address" VARCHAR(42) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("wallet_address")
);
