import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(5000),
  API_PREFIX: z.string().default("/api/v1"),
  FRONTEND_URL: z.string().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  BSC_RPC_URL: z.string().url().default("https://bsc-dataseed.binance.org/"),
  BSC_CHAIN_ID: z.coerce.number().int().default(56),
  PAYMENT_CONTRACT_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
  USDT_CONTRACT_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
  COMPANY_WALLET_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
  ACTIVATION_AMOUNT_USDT: z.coerce.number().positive().default(300),
  TRUST_PROXY: z.coerce.number().int().min(0).default(1),
  API_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  API_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
  AUTH_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900_000),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
  FINANCIAL_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  FINANCIAL_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
  LOG_REQUESTS: z.coerce.boolean().default(true),
  // wallet-signature login
  // access token (memory only, short) + refresh token (httpOnly cookie, rotated on every use)
  ACCESS_TOKEN_MINUTES: z.coerce.number().int().min(1).max(60).default(15),
  REFRESH_TOKEN_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  /** comma-separated wallets allowed to use /admin (they still have to sign in with that wallet) */
  ADMIN_WALLETS: z.string().default("").transform((v) => v.split(",").map((w) => w.trim().toLowerCase()).filter((w) => /^0x[a-f0-9]{40}$/.test(w))),
  // withdrawals
  WITHDRAWAL_MIN_USD: z.coerce.number().positive().default(10),
  WITHDRAWAL_FEE_PERCENT: z.coerce.number().min(0).max(50).default(5),
  // instant withdrawals (contracts/DAOvaultPayout.sol). Without these, withdrawals go to admin review.
  PAYOUT_CONTRACT_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
  /** TESTNET ONLY: throwaway key that signs payout vouchers (holds no funds). Mainnet must use a KMS signer. */
  PAYOUT_SIGNER_TESTNET_KEY: z.string().regex(/^0x[a-fA-F0-9]{64}$/, "PAYOUT_SIGNER_TESTNET_KEY must be a 0x-prefixed 32-byte hex key").optional(),
  PAYOUT_VOUCHER_MINUTES: z.coerce.number().int().min(2).max(60).default(15),
}).superRefine((value, ctx) => {
  // project rule: no private keys in env on mainnet. The voucher signer key is a testnet-only exception.
  if (value.PAYOUT_SIGNER_TESTNET_KEY && value.BSC_CHAIN_ID !== 97) {
    ctx.addIssue({ code: "custom", path: ["PAYOUT_SIGNER_TESTNET_KEY"], message: "The env voucher key is allowed on BSC Testnet (97) only; use a KMS signer on mainnet" });
  }
  if (value.NODE_ENV === "production") {
    if (value.JWT_SECRET.length < 32 || value.JWT_SECRET.includes("replace")) {
      ctx.addIssue({ code: "custom", path: ["JWT_SECRET"], message: "Use a long random JWT secret (at least 32 characters) in production" });
    }
    if (value.FRONTEND_URL.split(",").some((origin) => !origin.trim().startsWith("https://"))) {
      ctx.addIssue({ code: "custom", path: ["FRONTEND_URL"], message: "Production frontend origins must use HTTPS" });
    }
  }
});

export const env = envSchema.parse(process.env);
