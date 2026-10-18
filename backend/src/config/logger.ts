/**
 * One logger for the API, the worker and the signer (owner, 2026-10-18: pino instead of morgan).
 *  - production: one JSON line per event on stdout (Docker keeps it: docker compose logs backend),
 *    readable by log tools; level as text ("info", "warn", "error"), ISO time, the container host
 *  - development: coloured, readable lines (pino-pretty, a dev dependency)
 *  - secrets never reach a log: cookies (dv_rt refresh token, dv_ag), Authorization headers,
 *    passwords, private keys, signatures and voucher secrets are replaced by "[Redacted]"
 * Reads process.env directly (not config/env.ts): the signer container has no database settings.
 */
import { hostname } from "node:os";
import { format } from "node:util";
import pino from "pino";

const dev = process.env.NODE_ENV !== "production";
/** readable coloured lines in development; LOG_PRETTY=false keeps JSON there too (tests, CI) */
const pretty = dev && process.env.LOG_PRETTY !== "false";

/** field names that may carry a secret, wherever they appear (one or two levels deep) */
const SECRET_KEYS = [
  "authorization", "cookie", "set-cookie", "password", "secret", "token", "accessToken", "refreshToken",
  "privateKey", "private_key", "mnemonic", "seed", "signature", "keystore", "jwt",
];

export const logger = pino({
  level: process.env.LOG_LEVEL || (dev ? "debug" : "info"),
  base: { host: hostname() },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: { level: (label) => ({ level: label }) },
  redact: {
    paths: [
      "req.headers.authorization", "req.headers.cookie", 'res.headers["set-cookie"]',
      ...SECRET_KEYS.map((k) => `*.${k}`),
      ...SECRET_KEYS.map((k) => `*.*.${k}`),
    ],
    censor: "[Redacted]",
  },
  ...(pretty ? { transport: { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:HH:MM:ss", ignore: "pid,host" } } } : {}),
});

/**
 * Sends console.log / info / warn / error / debug of this process through the logger, so every line
 * a long-running service writes (API, worker, signer) is one JSON line at the right level; an Error
 * argument keeps its stack. Called by those entry points only: CLI tools keep plain console output.
 */
export function captureConsole(): void {
  const write = (level: "debug" | "info" | "warn" | "error") => (...args: unknown[]) => {
    const err = args.find((a): a is Error => a instanceof Error);
    const rest = err ? args.filter((a) => a !== err) : args;
    const message = format(...rest) || err?.message || "";
    if (err) logger[level]({ err }, message);
    else logger[level](message);
  };
  console.debug = write("debug");
  console.log = write("info");
  console.info = write("info");
  console.warn = write("warn");
  console.error = write("error");
}
