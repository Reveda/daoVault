-- The latest invite code a not-yet-activated wallet opened, kept on the server (any browser can pay).
ALTER TABLE "users" ADD COLUMN "pending_sponsor_code" VARCHAR(16);
