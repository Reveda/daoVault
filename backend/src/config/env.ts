import "dotenv/config";
import { z } from "zod";

// an empty value (`KEY=` in an env file) means "not set", not an invalid value
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    schema.optional(),
  );
const address = () => optional(z.string().regex(/^0x[a-fA-F0-9]{40}$/));

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(5000),
    API_PREFIX: z.string().default("/api/v1"),
    FRONTEND_URL: z.string().default("http://localhost:3000"),
    DATABASE_URL: z.string().min(1),
    JWT_SECRET: z.string().min(16),
    BSC_RPC_URL: z.string().url().default("https://bsc-dataseed.binance.org/"),
    /** Comma-separated RPC fallbacks. The first URL remains BSC_RPC_URL for backwards compatibility. */
    BSC_RPC_URLS: z.string().default(""),
    BSC_CHAIN_ID: z.coerce.number().int().default(56),
    PAYMENT_CONTRACT_ADDRESS: address(),
    USDT_CONTRACT_ADDRESS: address(),
    COMPANY_WALLET_ADDRESS: address(),
    ACTIVATION_AMOUNT_USDT: z.coerce.number().positive().default(300),
    /**
     * Pre-launch marketing (owner, 2026-10-13): before this moment members register, get their ID
     * and build their team; the dashboard shows "Pay & Activate" only from then on. ISO 8601 with
     * offset. Default (owner, 2026-10-13): 10 Nov 2026, 00:00 India time. To open at once (e.g.
     * testnet testing) set a past date such as 2026-01-01T00:00:00+05:30. Website only: the contract
     * itself has no switch.
     */
    PAYMENTS_OPEN_AT: optional(z.coerce.date()).transform(
      (d) => d ?? new Date("2026-11-10T00:00:00+05:30"),
    ),
    TRUST_PROXY: z.coerce.number().int().min(0).default(1),
    API_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
    // per IP. Sized for shared mobile IPs (owner, 2026-10-13: launch traffic): one Jio / Airtel public
    // IP can carry thousands of real members (CGNAT); floods are stopped earlier by Cloudflare + Nginx
    API_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(1_200),
    AUTH_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900_000),
    // per IP: 600 = 300 sign-ins per IP per 15 min (each sign-in is challenge + verify); was 60, too
    // low for shared mobile IPs. The real per-person limit is AUTH_WALLET_RATE_LIMIT_MAX.
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(600),
    /** per wallet: sign-in requests per AUTH_RATE_LIMIT_WINDOW_MS (20 = 10 sign-ins per 15 min) */
    AUTH_WALLET_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
    FINANCIAL_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
    FINANCIAL_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(200),
    LOG_REQUESTS: z.coerce.boolean().default(true),
    /** Shared rate-limit counters when several API copies run (docker-compose.prod.yml). Empty = in-memory (one copy). */
    REDIS_URL: optional(
      z.string().regex(/^rediss?:\/\//, "REDIS_URL must start with redis:// or rediss://"),
    ),
    // background worker (src/worker.ts, BullMQ on REDIS_URL)
    /** first block to read contract events from (the activation contract's deploy block); empty = from now on */
    INDEXER_START_BLOCK: optional(z.coerce.number().int().min(0)),
    /** RPC that answers eth_getLogs (BNB Chain's own public dataseed refuses it); empty = BSC_RPC_URL */
    INDEXER_RPC_URL: optional(z.string().url()),
    /** Comma-separated indexer RPC fallbacks; when empty, BSC_RPC_URLS is used. */
    INDEXER_RPC_URLS: z.string().default(""),
    INDEXER_CONFIRMATIONS: z.coerce.number().int().min(0).max(100).default(3),
    INDEXER_BLOCK_CHUNK: z.coerce.number().int().min(10).max(50_000).default(2_000),
    INDEXER_INTERVAL_SECONDS: z.coerce.number().int().min(5).max(3_600).default(15),
    // monitoring (config/alerts.ts, jobs/watch.ts): problems go to the server log only (no Telegram, owner 2026-10-13)
    /** the same alert at most once per this many minutes */
    ALERT_REPEAT_MINUTES: z.coerce.number().int().min(1).max(1_440).default(15),
    /** warn when the payout contract's float drops below this many USDT */
    PAYOUT_FLOAT_ALERT_USD: z.coerce.number().min(0).default(500),
    // wallet-signature login
    // access token (memory only, short) + refresh token (httpOnly cookie, rotated on every use)
    ACCESS_TOKEN_MINUTES: z.coerce.number().int().min(1).max(60).default(15),
    REFRESH_TOKEN_DAYS: z.coerce.number().int().min(1).max(90).default(30),
    /** comma-separated wallets allowed to use /admin (they still have to sign in with that wallet) */
    // forgiving (owner, 2026-10-12: a value pasted with quotes was silently dropped): quotes, spaces,
    // commas, semicolons and new lines all separate; anything that is not a full 0x address is ignored
    // (server.ts logs which wallets were accepted)
    ADMIN_WALLETS: z
      .string()
      .default("")
      .transform((v) =>
        v
          .replace(/["'`]/g, " ")
          .split(/[\s,;]+/)
          .map((w) => w.trim().toLowerCase())
          .filter((w) => /^0x[a-f0-9]{40}$/.test(w)),
      ),
    // withdrawals
    // withdrawal limits per request, the amount the member asks for (before the 5% fee)
    // (owner 2026-10-19: minimum $10, maximum $50,000; never more than the available balance either)
    WITHDRAWAL_MIN_USD: z.coerce.number().positive().default(10),
    WITHDRAWAL_MAX_USD: z.coerce.number().positive().default(50_000),
    WITHDRAWAL_FEE_PERCENT: z.coerce.number().min(0).max(50).default(5),
    // instant withdrawals (contracts/DAOvaultPayout.sol). There is no admin review (owner, 2026-10-13):
    // without a contract + signer, members get "Withdrawals are not open yet".
    PAYOUT_CONTRACT_ADDRESS: address(),
    /** mainnet signer: the Docker `signer` service (src/signer/server.ts), e.g. http://signer:7000. Holds the key, not this API. */
    PAYOUT_SIGNER_URL: optional(z.string().url()),
    /** shared secret the API sends to the signer service (must match the signer's token) */
    PAYOUT_SIGNER_TOKEN: optional(
      z.string().min(32, "PAYOUT_SIGNER_TOKEN must be at least 32 characters"),
    ),
    /** TESTNET ONLY: throwaway key that signs payout vouchers (holds no funds). Mainnet must use a KMS signer. */
    PAYOUT_SIGNER_TESTNET_KEY: optional(
      z
        .string()
        .regex(
          /^0x[a-fA-F0-9]{64}$/,
          "PAYOUT_SIGNER_TESTNET_KEY must be a 0x-prefixed 32-byte hex key",
        ),
    ),
    PAYOUT_VOUCHER_MINUTES: z.coerce.number().int().min(2).max(60).default(15),
  })
  .superRefine((value, ctx) => {
    // project rule: no private keys in env on mainnet. The voucher signer key is a testnet-only exception.
    if (value.PAYOUT_SIGNER_TESTNET_KEY && value.BSC_CHAIN_ID !== 97) {
      ctx.addIssue({
        code: "custom",
        path: ["PAYOUT_SIGNER_TESTNET_KEY"],
        message:
          "The env voucher key is allowed on BSC Testnet (97) only; use the signer service (PAYOUT_SIGNER_URL) on mainnet",
      });
    }
    if (value.PAYOUT_SIGNER_URL && !value.PAYOUT_SIGNER_TOKEN) {
      ctx.addIssue({
        code: "custom",
        path: ["PAYOUT_SIGNER_TOKEN"],
        message: "PAYOUT_SIGNER_URL needs PAYOUT_SIGNER_TOKEN",
      });
    }
    if (value.NODE_ENV === "production") {
      if (value.JWT_SECRET.length < 32 || value.JWT_SECRET.includes("replace")) {
        ctx.addIssue({
          code: "custom",
          path: ["JWT_SECRET"],
          message: "Use a long random JWT secret (at least 32 characters) in production",
        });
      }
      if (value.FRONTEND_URL.split(",").some((origin) => !origin.trim().startsWith("https://"))) {
        ctx.addIssue({
          code: "custom",
          path: ["FRONTEND_URL"],
          message: "Production frontend origins must use HTTPS",
        });
      }
    }
  });

export const env = envSchema.parse(process.env);
