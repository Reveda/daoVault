export type DashboardData = {
  walletAddress: string;
  referralCode: string;
  activeDirects: number;
  currentRank: number;
  totalEarned: number | string;
  packages: Array<{
    packageAmount: number | string;
    totalEarned: number | string;
    maxCapLimit: number | string;
    status: string;
  }>;
};

// Local Vite uses a same-origin /api proxy, so browser CORS cannot block it.
// Production can provide VITE_API_BASE_URL for a separately hosted API.
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '');

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { Accept: 'application/json' },
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(`API request failed (${response.status})`);
  }

  const payload = (await response.json()) as { success: boolean; data: T; error?: string };
  if (!payload.success) throw new Error(payload.error || 'API request failed');
  return payload.data;
}

export function getDashboardData(walletAddress: string): Promise<DashboardData> {
  return getJson<DashboardData>(`/dashboard/${encodeURIComponent(walletAddress)}`);
}

export type ActivationVerification = {
  walletAddress: string;
  transactionHash: string;
  status: string;
};

export async function verifyActivation(payload: {
  walletAddress: string;
  transactionHash: string;
  sponsorAddress?: string;
}): Promise<ActivationVerification> {
  const response = await fetch(`${API_BASE_URL}/activation/verify`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`Activation verification failed (${response.status})`);
  const body = (await response.json()) as { success: boolean; data: ActivationVerification; error?: string };
  if (!body.success) throw new Error(body.error || 'Activation verification failed');
  return body.data;
}
