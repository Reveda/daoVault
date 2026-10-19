import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middlewares/auth.js";
import { validateRequest } from "../../middlewares/validateRequest.js";
import { listNotifications, markRead, removeNotifications } from "./notifications.service.js";

/** the signed-in member's own notifications (owner, 2026-10-19) */
export const notificationsRouter = Router();

notificationsRouter.get(
  "/",
  requireAuth,
  validateRequest({
    query: z.object({
      page: z.coerce.number().int().min(1).max(1_000).optional(),
      limit: z.coerce.number().int().min(1).max(30).optional(),
      filter: z.enum(["all", "unread"]).optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      res.json({
        success: true,
        data: await listNotifications(req.auth!.sub, {
          page: req.query.page ? Number(req.query.page) : 1,
          limit: req.query.limit ? Number(req.query.limit) : 20,
          unreadOnly: req.query.filter === "unread",
        }),
      });
    } catch (error) {
      next(error);
    }
  },
);

/** removes one notification (id) or every read one (no id) */
notificationsRouter.post(
  "/remove",
  requireAuth,
  validateRequest({ body: z.object({ id: z.string().uuid().optional() }) }),
  async (req, res, next) => {
    try {
      res.json({ success: true, data: await removeNotifications(req.auth!.sub, req.body.id) });
    } catch (error) {
      next(error);
    }
  },
);

notificationsRouter.post(
  "/read",
  requireAuth,
  validateRequest({ body: z.object({ id: z.string().uuid().optional() }) }),
  async (req, res, next) => {
    try {
      res.json({ success: true, data: await markRead(req.auth!.sub, req.body.id) });
    } catch (error) {
      next(error);
    }
  },
);
