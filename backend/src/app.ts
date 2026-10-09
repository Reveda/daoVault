import express from "express";
import cors from "cors";
import compression from "compression";
import helmet from "helmet";
import { env } from "./config/env.js";
import { errorHandler } from "./middlewares/errorHandler.js";
import { notFound } from "./middlewares/notFound.js";
import { healthRouter } from "./modules/health/health.routes.js";
import { dashboardRouter } from "./modules/dashboard/dashboard.routes.js";
import { usersRouter } from "./modules/users/users.routes.js";
import { requestId } from "./middlewares/requestId.js";
import { requestLogger } from "./middlewares/requestLogger.js";
import { apiRateLimiter } from "./middlewares/rateLimiter.js";
import { activationRouter } from "./modules/activation/activation.routes.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { adminRouter, withdrawalsRouter } from "./modules/withdrawals/withdrawals.routes.js";

export const app = express();

app.disable("x-powered-by");
app.set("trust proxy", env.TRUST_PROXY);
app.use(helmet());
const configuredOrigins = env.FRONTEND_URL.split(",").map((origin) => origin.trim()).filter(Boolean);
const allowedOrigins = new Set(configuredOrigins);
app.use(cors({
  origin: (origin, callback) => {
    // Local development may use Vite dev/preview ports or localhost aliases.
    // Production remains restricted to FRONTEND_URL below.
    if (env.NODE_ENV === "development") return callback(null, true);
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error("Origin is not allowed by CORS"));
  },
}));
app.use(compression());
app.use(requestId);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "100kb" }));
app.use(requestLogger);

app.get("/", (_req, res) => {
  res.json({ name: "DAOvault AI API", version: "0.1.0", docs: "API is under construction" });
});

// API answers hold private member data and pass through the frontend's rewrite proxy:
// never stored by the browser or any cache in between
app.use(env.API_PREFIX, (_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
app.use(`${env.API_PREFIX}/health`, healthRouter);
app.use(apiRateLimiter);
app.use(`${env.API_PREFIX}/users`, usersRouter);
app.use(`${env.API_PREFIX}/dashboard`, dashboardRouter);
app.use(`${env.API_PREFIX}/activation`, activationRouter);
app.use(`${env.API_PREFIX}/auth`, authRouter);
app.use(`${env.API_PREFIX}/withdrawals`, withdrawalsRouter);
app.use(`${env.API_PREFIX}/admin`, adminRouter);

app.use(notFound);
app.use(errorHandler);
