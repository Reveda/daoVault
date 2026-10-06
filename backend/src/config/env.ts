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
}).superRefine((value, ctx) => {
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
