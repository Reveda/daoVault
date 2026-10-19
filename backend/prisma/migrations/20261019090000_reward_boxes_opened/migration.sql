-- Reward boxes open once (owner, 2026-10-19): the dashboard's DV token pot and the 11 rank reward boxes
-- remember on the server that they were opened, so they never open again on another device or browser.
SET lock_timeout = '10s';
ALTER TABLE "users" ADD COLUMN "dv_pot_opened" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "reward_boxes_opened" INTEGER NOT NULL DEFAULT 0;
