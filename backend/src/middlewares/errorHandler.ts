import type { ErrorRequestHandler } from "express";

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

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const status = typeof error?.statusCode === "number" ? error.statusCode : 500;
  if (status >= 500) console.error(error);
  // our services throw Error + statusCode with a message written for members; library errors
  // (JSON body parser, payload size...) carry a `type` / `expose` and only get the generic text
  const ours = status < 500 && error instanceof Error && !("type" in error) && !("expose" in error);
  res.status(status).json({
    success: false,
    error: ours ? error.message : GENERIC[status] ?? (status >= 500 ? "Something went wrong. Please try again." : "Request failed."),
  });
};
