export type DashboardData = {
  walletAddress: string;
  referralCode: string;
  sponsorCode: string | null;
  /** before payment: the latest invite code opened, saved on the server (null once activated) */
  pendingSponsorCode: string | null;
  /** company root (treasury): active without paying, anyone joins under it, earns nothing itself */
  isRoot?: boolean;
  /** ADMIN_WALLETS (the company wallet): show the company overview */
  isAdmin?: boolean;
  activeDirects: number;
  levelsUnlocked: number;
  currentRank: number;
  rankName: string | null;
  teamVolume: number;
  legs: { total: number; power: number; other: number; count: number };
  nextRank: { rank: number; name: string; volume: number; rewardUsd: number; countedVolume: number } | null;
  totalEarned: number | string;
  levelIncomeUsd: number;
  rankRewardsUsd: number;
  availableUsd: number;
  pendingWithdrawalUsd: number;
  withdrawnUsd: number;
  packages: Array<{
    packageAmount: number | string;
    totalEarned: number | string;
    maxCapLimit: number | string;
    activationTxHash?: string;
    status: string;
  }>;
  /** the package earning now: the oldest still ACTIVE, else the latest */
  currentPackage: DashboardData['packages'][number] | null;
  packageCount: number;
  /** every package reached its cap: offer a $300 top-up (re-entry) */
  canTopUp: boolean;
  levels: Array<{ level: number; pct: number; reqDirects: number; unlocked: boolean; members: number; earnedUsd: number }>;
  recentEarnings: Array<{ type: 'LEVEL_COMMISSION' | 'RANK_REWARD'; level: number | null; amountUsd: number; from: string; at: string }>;
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
  voucher?: { contract: string; id: string; amount: string; deadline: number; signature: string } | null;
  /** why it went to admin review instead of an instant payout */
  reviewReason?: string;
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
  constructor(message: string, public status: number) {
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
  const payload = (await response.json().catch(() => null)) as { success: boolean; data: T; error?: string } | null;
  if (!response.ok || !payload?.success) {
    throw new ApiError(payload?.error || `API request failed (${response.status})`, response.status);
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
  members: Array<{ referralCode: string; wallet: string; sponsorCode: string | null; joinedAt: string | null }>;
};

/** Who joined at one level of the wallet's downline (dashboard level modal), 50 per page. */
export function getLevelMembers(walletAddress: string, level: number, page: number, token: string): Promise<LevelMembers> {
  return request<LevelMembers>(`/dashboard/${encodeURIComponent(walletAddress)}/levels/${level}?page=${page}`, { token });
}

/** First dashboard visit: reserves the wallet's permanent referral code (no payment needed; idempotent). */
export function registerWallet(walletAddress: string, token: string): Promise<{ walletAddress: string; referralCode: string; activated: boolean }> {
  return post('/users/register', { walletAddress }, token);
}

/** Latest invite link wins: saves the code as this unpaid wallet's sponsor (any browser can then pay). */
export function savePendingSponsor(walletAddress: string, sponsorCode: string, token: string): Promise<{ pendingSponsorCode: string | null; activated: boolean }> {
  return post('/users/pending-sponsor', { walletAddress, sponsorCode }, token);
}

/** Invite code -> sponsor wallet (404 when the code is unknown or not activated). */
export function getSponsorByCode(code: string): Promise<{ walletAddress: string; referralCode: string }> {
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
export function verifyTopUp(payload: { walletAddress: string; transactionHash: string }): Promise<ActivationVerification> {
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
  post<{ token: string; role: 'member' | 'admin'; walletAddress: string; expiresAt: string }>('/auth/verify', { walletAddress, signature });
/** "Log out all devices": every token of this wallet stops working. */
/** New access token from the httpOnly refresh cookie (the cookie is rotated). */
export const refreshAuthSession = () =>
  post<{ token: string; role: 'member' | 'admin'; walletAddress: string; expiresAt: string }>('/auth/refresh', {});
/** Log out this device: the server deletes the refresh token and clears the cookie. */
export const logoutAuthSession = () => post<{ loggedOut: boolean }>('/auth/logout', {});

// ── withdrawals ──
export const getWithdrawals = (token: string) => request<WithdrawalSummary>('/withdrawals', { token });
export const requestWithdrawal = (token: string, amountUsd: number) => post<Withdrawal>('/withdrawals', { amountUsd }, token);
export const confirmWithdrawal = (token: string, id: string, txHash: string) => post<Withdrawal>(`/withdrawals/${id}/confirm`, { txHash }, token);

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
  payout: { contract: string; paused?: boolean; maxPerClaimUsd?: number; dailyLimitUsd?: number; floatUsd?: number; error?: string } | null;
};
export const getAdminStats = (token: string) => request<AdminStats>('/admin/stats', { token });
/** Charts of the admin dashboard: 30-day series and splits (GET /admin/analytics). */
export type AdminAnalytics = {
  days: number;
  /** treasury on the first day of the window (deposits − payouts before it) */
  openingTreasuryUsd: number;
  series: Array<{ day: string; activations: number; topups: number; moneyInUsd: number; levelUsd: number; rankUsd: number; paidOutUsd: number; newWallets: number }>;
  commissionsByLevel: Array<{ level: number; usd: number; count: number }>;
  membersByRank: Array<{ rank: number; name: string; members: number }>;
  treeByDepth: Array<{ depth: number; members: number }>;
  topEarners: Array<{ code: string; earnedUsd: number; rank: number; directs: number; team: number }>;
};
export const getAdminAnalytics = (token: string) => request<AdminAnalytics>('/admin/analytics', { token });
/** admin withdrawal queue, 20 per page */
export const getAdminWithdrawals = (token: string, status: Withdrawal['status'], page = 1) =>
  request<{ total: number; page: number; pageSize: number; items: Withdrawal[] }>(`/admin/withdrawals?status=${status}&page=${page}`, { token });
export const approveWithdrawal = (token: string, id: string) => post<Withdrawal>(`/admin/withdrawals/${id}/approve`, {}, token);
export const rejectWithdrawal = (token: string, id: string, reason: string) => post<Withdrawal>(`/admin/withdrawals/${id}/reject`, { reason }, token);
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
