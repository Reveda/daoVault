export type Side = 'LEFT' | 'RIGHT';

export type DashboardData = {
  walletAddress: string;
  referralCode: string;
  sponsorCode: string | null;
  /** the company root's invite code: a member without a referral joins under it */
  companyCode?: string | null;
  /** before payment: the invite code the member joined with (null once activated) */
  pendingSponsorCode: string | null;
  /** binary placement (owner, 2026-10-17): where the member sits; null = has not joined a team yet */
  placement?: { side: Side; underCode: string | null } | null;
  /** pre-launch marketing (owner, 2026-10-13): Pay & Activate opens at this moment (null = open) */
  paymentsOpenAt?: string | null;
  paymentsOpen?: boolean;
  /** minimum withdrawal in USD (WITHDRAWAL_MIN_USD) */
  withdrawalMinUsd?: number;
  /** company root (treasury): active without paying, anyone joins under it, earns nothing itself */
  isRoot?: boolean;
  /** ADMIN_WALLETS (the company wallet): show the company overview */
  isAdmin?: boolean;
  activeDirects: number;
  levelsUnlocked: number;
  currentRank: number;
  rankName: string | null;
  teamVolume: number;
  /** Left / Right business (DAO) of the placement tree; members = everyone placed on that side, paid or not */
  legs: { left: number; right: number; total: number; leftMembers?: number; rightMembers?: number };
  nextRank: {
    rank: number;
    name: string;
    volume: number;
    rewardUsd: number;
    countedVolume: number;
  } | null;
  totalEarned: number | string;
  levelIncomeUsd: number;
  rankRewardsUsd: number;
  /** fast-start bonus paid (Rocket Start $100 / Fast Start $50); counts toward the 25x cap */
  bonusUsd?: number;
  /**
   * Fast-start bonus progress (owner, 2026-10-18): paid directs counted from the member's own
   * activation; null before activation and for the company root
   */
  fastStart?: {
    /** false for the company root (it earns nothing itself) */
    eligible: boolean;
    directsNeeded: number;
    /** the member's own activation; null = not activated yet (the clock has not started) */
    joinedAt: string | null;
    earnedUsd: number;
    /** 3 = Rocket Start, 7 = Fast Start, null = not earned */
    earnedDays: number | null;
    /** deadline null until activation */
    tiers: Array<{
      name: string;
      days: number;
      rewardUsd: number;
      deadline: string | null;
      directs: number;
    }>;
  } | null;
  /** virtual Power Business (display only: no income, reward, withdrawal or DV token) */
  powerBusiness?: {
    totalUsd: number | string;
    /** the member's own virtual business in whole DAO (1 DAO = $300) */
    dao: number;
    /** both sides with the virtual business added (official volume included); rank needs the DAO on EACH side */
    legs: { left: number; right: number; matched: number };
    rank: number;
    rankName: string | null;
    nextRank: { rank: number; name: string; volume: number } | null;
  };
  availableUsd: number;
  pendingWithdrawalUsd: number;
  withdrawnUsd: number;
  packages: Array<{
    packageAmount: number | string;
    totalEarned: number | string;
    maxCapLimit: number | string;
    activationTxHash?: string;
    status: string;
    createdAt?: string;
  }>;
  /** the package earning now: the oldest still ACTIVE, else the latest */
  currentPackage: DashboardData['packages'][number] | null;
  packageCount: number;
  /** DV token allocation: 1,500 DV per package, credited at the planned DV launch */
  dvToken?: {
    perPackage: number;
    allocated: number;
    launch: string;
    launchDate?: string;
    network: string;
  };
  /** every package reached its cap: offer a $300 top-up (re-entry) */
  canTopUp: boolean;
  /** the whole 25x cap: $7,500 per package added up, and what all packages have earned */
  capTotalUsd?: number;
  capEarnedUsd?: number;
  levels: Array<{
    level: number;
    pct: number;
    reqDirects: number;
    unlocked: boolean;
    members: number;
    earnedUsd: number;
  }>;
  recentEarnings: Array<{
    type: 'LEVEL_COMMISSION' | 'RANK_REWARD' | 'FAST_START_BONUS';
    level: number | null;
    amountUsd: number;
    from: string;
    at: string;
  }>;
};

export type Withdrawal = {
  id: string;
  grossUsd: number;
  feeUsd: number;
  netUsd: number;
  destinationWallet: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'REJECTED';
  /** paid by the payout contract (voucher) rather than by an admin */
  instant?: boolean;
  /** open instant voucher the member's wallet can claim (until it expires) */
  voucher?: {
    contract: string;
    id: string;
    amount: string;
    deadline: number;
    signature: string;
  } | null;
  payoutTxHash: string | null;
  rejectReason: string | null;
  createdAt: string;
  referralCode?: string;
};

export type WithdrawalSummary = {
  availableUsd: number;
  pendingUsd: number;
  withdrawnUsd: number;
  feePercent: number;
  minimumUsd: number;
  instant: boolean;
  items: Withdrawal[];
};

// The API lives on the site's own origin: Render rewrites /api/* on the frontend to the
// backend service, and Vite proxies /api locally. Same origin = no CORS and a first-party
// refresh cookie. VITE_API_BASE_URL can still point elsewhere; a template placeholder
// ("ACTUAL-BACKEND-URL") once sent every live request to a dead host, so it is ignored.
function resolveApiBase(): string {
  const configured = String(import.meta.env.VITE_API_BASE_URL || '').trim();
  const placeholder = /ACTUAL-BACKEND-URL|example\.com|your[-_]/i.test(configured);
  if (configured && !placeholder) return configured.replace(/\/$/, '');
  return '/api/v1';
}

const API_BASE_URL = resolveApiBase();

/** Error that keeps the HTTP status, so callers can tell "not found" from "server down". */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const { token, ...rest } = init;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...rest,
    headers: {
      Accept: 'application/json',
      ...(rest.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    // The API is served from the site's own origin (Render rewrite /api/* -> backend, Vite
    // proxy locally), so the httpOnly refresh cookie travels with same-origin requests only.
    // Never 'include': a cross-origin API would then need Allow-Credentials.
    credentials: 'same-origin',
  });
  const payload = (await response.json().catch(() => null)) as {
    success: boolean;
    data: T;
    error?: string;
  } | null;
  if (!response.ok || !payload?.success) {
    throw new ApiError(
      payload?.error || `API request failed (${response.status})`,
      response.status,
    );
  }
  return payload.data;
}

const post = <T>(path: string, body: unknown, token?: string) =>
  request<T>(path, { method: 'POST', body: JSON.stringify(body), token });

/** The member's own vault: needs their sign-in token (session.ts). */
export function getDashboardData(walletAddress: string, token: string): Promise<DashboardData> {
  return request<DashboardData>(`/dashboard/${encodeURIComponent(walletAddress)}`, { token });
}

export type LevelMembers = {
  level: number;
  total: number;
  page: number;
  pageSize: number;
  /** rank = the rank the member's own dashboard shows (0 = none yet) */
  members: Array<{
    referralCode: string;
    wallet: string;
    sponsorCode: string | null;
    joinedAt: string | null;
    rank: number;
    rankName: string | null;
    /** where the member sits in the placement tree (null = has not joined a side yet) */
    placement: { side: Side; underCode: string | null } | null;
  }>;
};

/** Who joined at one level of the wallet's downline (dashboard level modal), 50 per page. */
export function getLevelMembers(
  walletAddress: string,
  level: number,
  page: number,
  token: string,
): Promise<LevelMembers> {
  return request<LevelMembers>(
    `/dashboard/${encodeURIComponent(walletAddress)}/levels/${level}?page=${page}`,
    { token },
  );
}

/** First dashboard visit: reserves the wallet's permanent referral code (no payment needed; idempotent). */
export function registerWallet(
  walletAddress: string,
  token: string,
): Promise<{ walletAddress: string; referralCode: string; activated: boolean }> {
  return post('/users/register', { walletAddress }, token);
}

/**
 * Joins a team once (owner, 2026-10-17): the invite code becomes the sponsor and the member takes
 * the bottom spot of the chosen side. The spot never changes afterwards.
 */
export function joinTeam(
  walletAddress: string,
  sponsorCode: string,
  side: Side,
  token: string,
): Promise<{ sponsorCode: string; placement: { side: Side; underCode: string } }> {
  return post('/users/join', { walletAddress, sponsorCode, side }, token);
}

/** Invite code -> sponsor wallet (404 when the code is unknown). Any registered wallet can sponsor (owner, 2026-10-13). */
export function getSponsorByCode(
  code: string,
): Promise<{ walletAddress: string; referralCode: string; activated?: boolean }> {
  return request(`/users/referral/${encodeURIComponent(code.trim().toUpperCase())}`);
}

export type ActivationVerification = {
  walletAddress: string;
  referralCode: string;
  transactionHash: string;
  status: string;
  alreadyProcessed: boolean;
  sponsorLinked: boolean;
};

/** Re-entry: the backend checks the ToppedUp on-chain, then adds the new $300 package. */
export function verifyTopUp(payload: {
  walletAddress: string;
  transactionHash: string;
}): Promise<ActivationVerification> {
  return post('/activation/topup/verify', payload);
}

export function verifyActivation(payload: {
  walletAddress: string;
  transactionHash: string;
  sponsorAddress?: string;
}): Promise<ActivationVerification> {
  return post('/activation/verify', payload);
}

// ── wallet-signature sign-in ──
export const getAuthChallenge = (walletAddress: string) =>
  post<{ message: string; expiresAt: string }>('/auth/challenge', { walletAddress });
export const verifyAuthSignature = (walletAddress: string, signature: string) =>
  post<{ token: string; role: 'member' | 'admin'; walletAddress: string; expiresAt: string }>(
    '/auth/verify',
    { walletAddress, signature },
  );
/** "Log out all devices": every token of this wallet stops working. */
/** New access token from the httpOnly refresh cookie (the cookie is rotated). */
export const refreshAuthSession = () =>
  post<{ token: string; role: 'member' | 'admin'; walletAddress: string; expiresAt: string }>(
    '/auth/refresh',
    {},
  );
/** Log out this device: the server deletes the refresh token and clears the cookie. */
export const logoutAuthSession = () => post<{ loggedOut: boolean }>('/auth/logout', {});

// ── withdrawals ──
export const getWithdrawals = (token: string) =>
  request<WithdrawalSummary>('/withdrawals', { token });
export const requestWithdrawal = (token: string, amountUsd: number) =>
  post<Withdrawal>('/withdrawals', { amountUsd }, token);
export const confirmWithdrawal = (token: string, id: string, txHash: string) =>
  post<Withdrawal>(`/withdrawals/${id}/confirm`, { txHash }, token);

// ── admin ──
export type AdminStats = {
  registered: number;
  members: number;
  packages: number;
  topUps: number;
  activePackages: number;
  cappedPackages: number;
  payments24h: number;
  payments7d: number;
  volumeUsd: number;
  levelCommissionsUsd: number;
  rankRewardsUsd: number;
  creditedUsd: number;
  paidOutUsd: number;
  feesUsd: number;
  memberBalancesUsd: number;
  companyNetUsd: number;
  withdrawals: Partial<Record<Withdrawal['status'], { count: number; netUsd: number }>>;
  payout: {
    contract: string;
    paused?: boolean;
    maxPerClaimUsd?: number;
    dailyLimitUsd?: number;
    floatUsd?: number;
    error?: string;
  } | null;
};
export const getAdminStats = (token: string) => request<AdminStats>('/admin/stats', { token });
/** Charts of the admin dashboard: 30-day series and splits (GET /admin/analytics). */
export type AdminAnalytics = {
  days: number;
  /** treasury on the first day of the window (deposits − payouts before it) */
  openingTreasuryUsd: number;
  series: Array<{
    day: string;
    activations: number;
    topups: number;
    moneyInUsd: number;
    levelUsd: number;
    rankUsd: number;
    paidOutUsd: number;
    newWallets: number;
  }>;
  commissionsByLevel: Array<{ level: number; usd: number; count: number }>;
  membersByRank: Array<{ rank: number; name: string; members: number }>;
  treeByDepth: Array<{ depth: number; members: number }>;
  topEarners: Array<{
    code: string;
    earnedUsd: number;
    rank: number;
    directs: number;
    team: number;
  }>;
};
export const getAdminAnalytics = (token: string) =>
  request<AdminAnalytics>('/admin/analytics', { token });
/** Treasury ledger grouped by day (30), week (12) or month (12), oldest first (GET /admin/ledger). */
export type LedgerGroup = 'day' | 'week' | 'month';
export type AdminLedger = {
  group: LedgerGroup;
  openingTreasuryUsd: number;
  periods: Array<{
    start: string;
    activations: number;
    topups: number;
    depositsUsd: number;
    levelUsd: number;
    rewardsUsd: number;
    paidOutUsd: number;
    treasuryUsd: number;
  }>;
};
export const getAdminLedger = (token: string, group: LedgerGroup) =>
  request<AdminLedger>(`/admin/ledger?group=${group}`, { token });
/** admin withdrawal queue, 20 per page; period = requested in the last 7 / 30 days, or all */
export type WithdrawalPeriod = 'all' | 'week' | 'month';
export const getAdminWithdrawals = (
  token: string,
  status: Withdrawal['status'],
  page = 1,
  period: WithdrawalPeriod = 'all',
) =>
  request<{
    total: number;
    page: number;
    pageSize: number;
    grossUsd: number;
    netUsd: number;
    items: Withdrawal[];
  }>(`/admin/withdrawals?status=${status}&page=${page}&period=${period}`, { token });
export const approveWithdrawal = (token: string, id: string) =>
  post<Withdrawal>(`/admin/withdrawals/${id}/approve`, {}, token);
export const rejectWithdrawal = (token: string, id: string, reason: string) =>
  post<Withdrawal>(`/admin/withdrawals/${id}/reject`, { reason }, token);
export const completeWithdrawal = (token: string, id: string, payoutTxHash: string) =>
  post<Withdrawal>(`/admin/withdrawals/${id}/complete`, { payoutTxHash }, token);

/**
 * Wakes the backend (Render's free plan sleeps it after ~15 idle minutes and the first
 * request then waits 30-50s). Fired when the landing page opens, so the API is awake by
 * the time the visitor reaches the dashboard; repeated every 10 minutes while the tab is
 * visible. Fire-and-forget: failures are ignored.
 */
export function wakeBackend(): void {
  const ping = () => {
    if (document.hidden) return;
    fetch(`${API_BASE_URL}/health`, { cache: 'no-store', keepalive: true }).catch(() => {});
  };
  ping();
  window.setInterval(ping, 10 * 60_000);
}

// ── landing live pulse (real events only) ──
export type ActivityItem = {
  type: 'activation' | 'topup' | 'rank' | 'withdrawal';
  wallet: string;
  detail: string;
  amountUsd: number;
  at: string;
  txHash: string | null;
};
/** latest real events + whether the business is live (payments open): then the landing shows no samples */
export async function getRecentActivity(): Promise<{ items: ActivityItem[]; live: boolean }> {
  const data = await request<ActivityItem[] | { items: ActivityItem[]; live: boolean }>(
    '/activity/recent?v=2',
  );
  return Array.isArray(data) ? { items: data, live: false } : data;
}
