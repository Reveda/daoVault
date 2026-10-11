import type { RequestHandler } from "express";

// never echo the method or path back: it only helps someone mapping the API
export const notFound: RequestHandler = (_req, res) => {
  res.status(404).json({ success: false, error: "Not found." });
};
