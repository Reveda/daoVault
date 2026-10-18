import type { IncomingMessage, ServerResponse } from "node:http";
import { pinoHttp } from "pino-http";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";

type Req = IncomingMessage & { requestId?: string; ip?: string; originalUrl?: string };

/** the path without its query string: queries never reach a log line */
const pathOf = (req: IncomingMessage) => ((req as Req).originalUrl ?? req.url ?? "").split("?")[0];

/**
 * One JSON line per API request (owner, 2026-10-18: pino-http instead of morgan): request id, method,
 * path, status, time taken and the visitor IP. Headers and bodies are never logged (only the fields
 * below), so cookies and tokens cannot leak; logger.ts redacts them as a second line of defence.
 * Health checks are skipped; LOG_REQUESTS=false turns request lines off. 5xx = error, 4xx = warn.
 * req.log is the request's own logger: every line written through it carries the same reqId.
 */
export const requestLogger = pinoHttp({
  logger,
  genReqId: (req) => (req as Req).requestId ?? "",
  autoLogging: {
    ignore: (req) => !env.LOG_REQUESTS || (req.url ?? "").split("?")[0].includes("/health"),
  },
  customLogLevel: (_req, res, error) => (error || res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info"),
  customSuccessMessage: (req, res, ms) => `${req.method} ${pathOf(req)} ${res.statusCode} ${Math.round(ms)}ms`,
  customErrorMessage: (req, res) => `${req.method} ${pathOf(req)} ${res.statusCode} failed`,
  serializers: {
    req: (req: { id: string; method: string; url: string; raw: Req }) => ({
      id: req.id,
      method: req.method,
      // the path only: query strings stay out of the logs
      path: pathOf(req.raw),
      ip: req.raw.ip,
    }),
    res: (res: { statusCode: number; raw?: ServerResponse }) => ({ status: res.statusCode }),
  },
});
