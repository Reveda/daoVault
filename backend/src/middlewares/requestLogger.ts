import morgan from "morgan";
import { env } from "../config/env.js";

export const requestLogger = morgan(env.NODE_ENV === "production" ? "combined" : "dev", {
  skip: (req) => !env.LOG_REQUESTS || (req.url ?? "").split("?")[0].endsWith("/health"),
});
