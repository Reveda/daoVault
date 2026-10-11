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
    // our own short messages ("Invalid wallet address") stay; zod's built-in ones
    // ("Invalid input: expected string, received undefined") describe the schema: generic text
    const message = failed.error.issues[0]?.message ?? "";
    const builtIn = /^(Invalid input|Too (small|big)|Unrecognized|Invalid (string|option|type|union|key|element|value))/.test(message);
    res.status(400).json({ success: false, error: !message || builtIn ? "Invalid request." : message });
    return;
  }

  next();
};
