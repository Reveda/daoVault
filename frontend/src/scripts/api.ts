export type DashboardData = {
  walletAddress: string;
  referralCode: string;
  sponsorCode: string | null;
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
    status: string;
  }>;
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

// Local Vite uses a same-origin /api proxy, so browser CORS cannot block it.
// Production can provide VITE_API_BASE_URL for a separately hosted API.
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '');

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
    credentials: 'include',
  });
  const payload = (await response.json().catch(() => null)) as { success: boolean; data: T; error?: string } | null;
  if (!response.ok || !payload?.success) {
    throw new ApiError(payload?.error || `API request failed (${response.status})`, response.status);
  }
  return payload.data;
}

const post = <T>(path: string, body: unknown, token?: string) =>
  request<T>(path, { method: 'POST', body: JSON.stringify(body), token });

export function getDashboardData(walletAddress: string): Promise<DashboardData> {
  return request<DashboardData>(`/dashboard/${encodeURIComponent(walletAddress)}`);
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

// ── withdrawals ──
export const getWithdrawals = (token: string) => request<WithdrawalSummary>('/withdrawals', { token });
export const requestWithdrawal = (token: string, amountUsd: number) => post<Withdrawal>('/withdrawals', { amountUsd }, token);
export const confirmWithdrawal = (token: string, id: string, txHash: string) => post<Withdrawal>(`/withdrawals/${id}/confirm`, { txHash }, token);

// ── admin ──
export type AdminStats = {
  members: number;
  packages: number;
  volumeUsd: number;
  levelCommissionsUsd: number;
  rankRewardsUsd: number;
  withdrawals: Partial<Record<Withdrawal['status'], { count: number; netUsd: number }>>;
  payout: { contract: string; paused?: boolean; maxPerClaimUsd?: number; dailyLimitUsd?: number; floatUsd?: number; error?: string } | null;
};
export const getAdminStats = (token: string) => request<AdminStats>('/admin/stats', { token });
export const getAdminWithdrawals = (token: string, status?: Withdrawal['status']) =>
  request<Withdrawal[]>(`/admin/withdrawals${status ? `?status=${status}` : ''}`, { token });
export const approveWithdrawal = (token: string, id: string) => post<Withdrawal>(`/admin/withdrawals/${id}/approve`, {}, token);
export const rejectWithdrawal = (token: string, id: string, reason: string) => post<Withdrawal>(`/admin/withdrawals/${id}/reject`, { reason }, token);
export const completeWithdrawal = (token: string, id: string, payoutTxHash: string) =>
  post<Withdrawal>(`/admin/withdrawals/${id}/complete`, { payoutTxHash }, token);
