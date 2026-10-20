/**
 * Dashboard notifications (owner, 2026-10-19): level income, rank rewards and bonuses ready to collect,
 * DV tokens, withdrawals. A notification is a database row written in the same transaction as the event
 * (it never announces something that rolled back); pushPending() then delivers new rows live over
 * socket.io (socket.ts). Delivery claims each row once (pushed_at), so several API copies and the worker
 * can all run it without sending twice. A member who is offline sees them in the bell next time.
 */
import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { emitToWallet } from "./socket.js";

type Db = Prisma.TransactionClient | PrismaClient;

export type NotificationKind =
  | "LEVEL_INCOME"
  | "RANK_REWARD"
  | "BONUS"
  | "DV_TOKENS"
  | "WITHDRAWAL_PAID"
  | "WITHDRAWAL_RETURNED";

/** column sizes (schema.prisma Notification): every value is cut to fit, never an insert error */
const TITLE_MAX = 120;
const BODY_MAX = 300;
const LINK_MAX = 40;
const KIND_MAX = 32;

/**
 * Writes one notification. It often runs inside the plan engine's money transaction (commissions,
 * volume, ranks), so it must never fail on length: a too-long title / body / link / kind would roll the
 * whole payment back. Every field is cut to its column size first.
 */
export async function notify(
  db: Db,
  userId: string,
  kind: NotificationKind,
  title: string,
  body: string,
  link?: string,
): Promise<void> {
  await db.notification.create({
    data: {
      userId,
      kind: kind.slice(0, KIND_MAX),
      title: title.slice(0, TITLE_MAX),
      body: body.slice(0, BODY_MAX),
      link: link ? link.slice(0, LINK_MAX) : null,
    },
  });
}

const view = (n: {
  id: string;
  kind: string;
  title: string;
  body: string;
  link: string | null;
  readAt: Date | null;
  createdAt: Date;
}) => ({
  id: n.id,
  kind: n.kind,
  title: n.title,
  body: n.body,
  link: n.link,
  read: Boolean(n.readAt),
  createdAt: n.createdAt,
});

/** a member by wallet; addresses are stored lowercase, so any casing finds them (checksummed or not) */
const findMember = (walletAddress: string) =>
  prisma.user.findUnique({ where: { walletAddress: walletAddress.toLowerCase() }, select: { id: true } });

/**
 * A member's notifications, newest first: the bell shows 5, "View all" pages through the rest
 * (owner 2026-10-19). unreadOnly = the Unread tab.
 */
export async function listNotifications(
  walletAddress: string,
  { page = 1, limit = 20, unreadOnly = false }: { page?: number; limit?: number; unreadOnly?: boolean } = {},
) {
  const user = await findMember(walletAddress);
  if (!user) return { items: [], unread: 0, total: 0, page, pageSize: limit };
  const where = { userId: user.id, ...(unreadOnly ? { readAt: null } : {}) };
  const [items, unread, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
    prisma.notification.count({ where }),
  ]);
  return { items: items.map(view), unread, total, page, pageSize: limit };
}

/** removes one notification (×) or every read one ("Clear read"); returns the unread count */
export async function removeNotifications(walletAddress: string, id?: string) {
  const user = await findMember(walletAddress);
  if (!user) return { unread: 0 };
  await prisma.notification.deleteMany({
    where: id ? { userId: user.id, id } : { userId: user.id, readAt: { not: null } },
  });
  return { unread: await prisma.notification.count({ where: { userId: user.id, readAt: null } }) };
}

/** each member keeps only the newest notifications (owner 2026-10-19: 20 to 30); older ones are removed */
export const KEEP_PER_MEMBER = 30;

/** keeps the newest KEEP_PER_MEMBER notifications of these members (all members when no list) */
async function trimToNewest(userIds?: string[]): Promise<number> {
  if (userIds && !userIds.length) return 0;
  return prisma.$executeRaw`
    DELETE FROM notifications n USING (
      SELECT id FROM (
        SELECT id, row_number() OVER (PARTITION BY user_id ORDER BY created_at DESC, id DESC) AS rn
          FROM notifications
         ${userIds ? Prisma.sql`WHERE user_id = ANY(${userIds}::uuid[])` : Prisma.empty}
      ) ranked WHERE ranked.rn > ${KEEP_PER_MEMBER}
    ) old
    WHERE n.id = old.id`;
}

/**
 * Daily clean-up: read notifications go after 30 days, any notification after 90 days, and no member
 * keeps more than the newest KEEP_PER_MEMBER (also trimmed right after each delivery, pushPending).
 */
export async function cleanupNotifications(): Promise<number> {
  const day = 86_400_000;
  const now = Date.now();
  const { count } = await prisma.notification.deleteMany({
    where: {
      OR: [
        { readAt: { lt: new Date(now - 30 * day) } },
        { createdAt: { lt: new Date(now - 90 * day) } },
      ],
    },
  });
  return count + (await trimToNewest());
}

/** marks one notification (id) or all of them read */
export async function markRead(walletAddress: string, id?: string) {
  const user = await findMember(walletAddress);
  if (!user) return { unread: 0 };
  await prisma.notification.updateMany({
    where: { userId: user.id, readAt: null, ...(id ? { id } : {}) },
    data: { readAt: new Date() },
  });
  return { unread: await prisma.notification.count({ where: { userId: user.id, readAt: null } }) };
}

/**
 * Removes every notification that pointed at something now done (owner 2026-10-20): a reward box or
 * the DV pot opened straight from the dashboard takes its notification out of the bell too.
 */
export async function removeLinked(userId: string, link: string) {
  await prisma.notification.deleteMany({ where: { userId, link } });
}

/**
 * Delivers new notifications to the members' open dashboards. Claims up to 500 rows at once
 * (UPDATE ... RETURNING), so every row is pushed exactly once whichever process runs it.
 */
let pushing = false;
export async function pushPending(): Promise<number> {
  if (pushing) return 0;
  pushing = true;
  try {
    const rows = await prisma.$queryRaw<
      Array<{
        id: string;
        kind: string;
        title: string;
        body: string;
        link: string | null;
        created_at: Date;
        wallet: string;
      }>
    >`
      WITH picked AS (
        SELECT id FROM notifications WHERE pushed_at IS NULL ORDER BY created_at LIMIT 500
        FOR UPDATE SKIP LOCKED
      )
      UPDATE notifications n SET pushed_at = now()
        FROM picked, users u
       WHERE n.id = picked.id AND u.id = n.user_id
      RETURNING n.id, n.kind, n.title, n.body, n.link, n.created_at, u.wallet_address AS wallet`;
    for (const r of rows)
      emitToWallet(r.wallet, "notification", {
        id: r.id,
        kind: r.kind,
        title: r.title,
        body: r.body,
        link: r.link,
        read: false,
        createdAt: r.created_at,
      });
    // the members who just got new ones keep only their newest KEEP_PER_MEMBER
    if (rows.length) {
      const wallets = [...new Set(rows.map((r) => r.wallet))];
      const users = await prisma.user.findMany({
        where: { walletAddress: { in: wallets } },
        select: { id: true },
      });
      await trimToNewest(users.map((u) => u.id)).catch(() => 0);
    }
    return rows.length;
  } finally {
    pushing = false;
  }
}

/** pushes new notifications every 2 seconds (each API copy and the worker; rows go out once) */
export function startNotificationPusher(everyMs = 2_000): NodeJS.Timeout {
  const timer = setInterval(
    () => void pushPending().catch((error) => console.error("[notify]", error)),
    everyMs,
  );
  timer.unref();
  return timer;
}
