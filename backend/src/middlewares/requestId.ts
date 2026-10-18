import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

/** an id a caller may pass on (x-request-id): short and plain, so it can never break a log line */
const SAFE_ID = /^[A-Za-z0-9._-]{8,64}$/;

export const requestId: RequestHandler = (req, res, next) => {
  const given = req.get("x-request-id");
  const id = given && SAFE_ID.test(given) ? given : randomUUID();
  req.requestId = id;
  res.setHeader("x-request-id", id);
  next();
};
