-- Fast-start bonuses (owner, 2026-10-18): one new earning type. ADD VALUE stands alone in its
-- migration (the new value cannot be used inside the transaction that adds it).
SET lock_timeout = '10s';
ALTER TYPE "EarningType" ADD VALUE IF NOT EXISTS 'FAST_START_BONUS';
