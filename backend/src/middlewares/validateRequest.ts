import type { RequestHandler } from "express";
import type { ZodType } from "zod";

type RequestSchemas = {
  body?: ZodType;
  params?: ZodType;
  query?: ZodType;
};

export const validateRequest = (schemas: RequestSchemas): RequestHandler => (req, res, next) => {
  const checks = [
    schemas.body?.safeParse(req.body),
    schemas.params?.safeParse(req.params),
    schemas.query?.safeParse(req.query),
  ].filter((result): result is NonNullable<typeof result> => Boolean(result));

  const failed = checks.find((result) => !result.success);
  if (failed && !failed.success) {
    res.status(400).json({ success: false, error: failed.error.issues[0]?.message ?? "Invalid request" });
    return;
  }

  next();
};
