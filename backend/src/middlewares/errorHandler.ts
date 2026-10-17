import type { ErrorRequestHandler } from "express";
import { alert } from "../config/alerts.js";

// what a visitor sees when the error is not one of our own messages (owner, 2026-10-11:
// no internal details, no library / parser text)
const GENERIC: Record<number, string> = {
  400: "Invalid request.",
  401: "Please sign in again.",
  403: "Not allowed.",
  404: "Not found.",
  413: "Request too large.",
  429: "Too many requests. Please try again later.",
};

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  const errorCode = typeof error?.code === "string" ? error.code : "";
  const errorMessage = String(error?.message ?? error);
  const limiterStoreFailure = errorCode.startsWith("ERR_ERL_") || /redis|client is offline|client is closed|client is disconnected|socket closed/i.test(errorMessage);
  const status = limiterStoreFailure ? 503 : typeof error?.statusCode === "number" ? error.statusCode : 500;
  // our services throw Error + statusCode with a message written for members; library errors
  // (JSON body parser, payload size...) carry a `type` / `expose` and only get the generic text.
  // 503 is ours too: "try again later" messages (withdrawals paused, daily limit...)
  const ours = limiterStoreFailure || ((status < 500 || status === 503) && error instanceof Error && !("type" in error) && !("expose" in error));
  if (status >= 500 && !ours) {
    console.error(error);
    // one [alert] log line per route per ALERT_REPEAT_MINUTES; wallets shortened, no request data
    const route = `${req.method} ${req.originalUrl.split("?")[0].replace(/0x[0-9a-fA-F]{40}/g, "0x…")}`;
    alert("critical", `api-500 ${route}`, `Server error on ${route}: ${String(error?.message ?? error).slice(0, 200)}`);
  }
  res.status(status).json({
    statusCode: status,
    success: false,
    error: limiterStoreFailure ? "Security protection is temporarily unavailable. Please try again shortly." : ours ? error.message : GENERIC[status] ?? (status >= 500 ? "Something went wrong. Please try again." : "Request failed."),
  });
};
