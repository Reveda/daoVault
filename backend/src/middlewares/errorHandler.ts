import type { ErrorRequestHandler } from "express";

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const status = typeof error?.statusCode === "number" ? error.statusCode : 500;
  if (status >= 500) console.error(error);
  res.status(status).json({
    success: false,
    error: status === 500 ? "Internal server error" : error.message,
  });
};
