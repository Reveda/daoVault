/**
 * DAOvault AI — Live On-Chain Activity Stream Engine (TypeScript)
 * Real-time decentralized pulse pill showing simulated & live blockchain activations,
 * rank milestones, and instant USDT withdrawals.
 */

import { gsap } from 'gsap';
import { LITE } from './perf.ts';

export interface ActivityEvent {
  id: string;
  type: 'activation' | 'rank' | 'withdrawal';
  wallet: string;
  detail: string;
  amount: string;
  timeAgo: string;
  txHash?: string;
}

// Sample on-chain activities (realistic BSC Mainnet addresses and event distribution)
// Ready for live blockchain / backend event polling once contract is active
const SAMPLE_ACTIVITIES: ActivityEvent[] = [
  {
    id: 'act-1',
    type: 'activation',
    wallet: '0x8a14...3f4b',
    detail: 'Activated ID Package',
    amount: '$300 USDT',
    timeAgo: '2m ago',
    txHash: '0x3a9f12b8',
  },
  {
    id: 'act-2',
    type: 'rank',
    wallet: '0x4f82...91c2',
    detail: 'Unlocked Starter Rank',
    amount: '+$150 Cash',
    timeAgo: '7m ago',
    txHash: '0x7c41e0a2',
  },
  {
    id: 'act-3',
    type: 'withdrawal',
    wallet: '0x1d39...e8a2',
    detail: 'Instant Withdrawal (BEP-20)',
    amount: '300.00 USDT',
    timeAgo: '14m ago',
    txHash: '0x992b4fa1',
  },
  {
    id: 'act-4',
    type: 'activation',
    wallet: '0x5a29...c018',
    detail: 'Activated ID Package',
    amount: '$300 USDT',
    timeAgo: '21m ago',
    txHash: '0x10fa98bc',
  },
  {
    id: 'act-5',
    type: 'rank',
    wallet: '0x7c44...b29f',
    detail: 'Unlocked Builder Rank',
    amount: '+$300 Cash',
    timeAgo: '35m ago',
    txHash: '0x51c33a90',
  },
  {
    id: 'act-6',
    type: 'withdrawal',
    wallet: '0x9b31...88f4',
    detail: 'Instant Withdrawal (BEP-20)',
    amount: '750.00 USDT',
    timeAgo: '48m ago',
    txHash: '0x88ea3077',
  },
  {
    id: 'act-7',
    type: 'activation',
    wallet: '0x2e88...a49d',
    detail: 'Activated ID Package',
    amount: '$300 USDT',
    timeAgo: '1h ago',
    txHash: '0x44bf9123',
  },
  {
    id: 'act-8',
    type: 'rank',
    wallet: '0x51c9...247e',
    detail: 'Unlocked Leader Rank',
    amount: '+$500 Cash',
    timeAgo: '1h ago',
    txHash: '0x66a100ce',
  },
  {
    id: 'act-9',
    type: 'withdrawal',
    wallet: '0x6f11...9b05',
    detail: 'Instant Withdrawal (BEP-20)',
    amount: '1,200.00 USDT',
    timeAgo: '2h ago',
    txHash: '0x20de491b',
  },
];

let currentIndex = 0;
let cycleTimer: number | null = null;
let customProvider: (() => Promise<ActivityEvent[]>) | null = null;
let activities: ActivityEvent[] = [...SAMPLE_ACTIVITIES];

/**
 * Hook to plug in real blockchain event listener or backend API
 */
export function setLiveActivityProvider(provider: () => Promise<ActivityEvent[]>): void {
  customProvider = provider;
  refreshActivities();
}

async function refreshActivities(): Promise<void> {
  if (!customProvider) return;
  try {
    const live = await customProvider();
    if (live && live.length > 0) {
      activities = live;
    }
  } catch (err) {
    console.warn('[DAOvault Live Activity] Could not fetch live events, using fallback stream:', err);
  }
}

/**
 * Initializes the Live On-Chain Activity Stream pill in Hero section
 */
export function initLiveActivityStream(): void {
  const container = document.getElementById('liveActivityStream');
  if (!container) return;

  const ticker = document.getElementById('lasTicker');
  if (!ticker) return;

  renderCurrentActivity(false);

  // Cycle every 4.2 seconds
  const startCycling = () => {
    if (cycleTimer) window.clearInterval(cycleTimer);
    cycleTimer = window.setInterval(() => {
      currentIndex = (currentIndex + 1) % activities.length;
      renderCurrentActivity(true);
    }, 4200);
  };

  startCycling();

  // Pause on hover
  container.addEventListener('mouseenter', () => {
    if (cycleTimer) window.clearInterval(cycleTimer);
  });
  container.addEventListener('mouseleave', startCycling);
}

function renderCurrentActivity(animate = true): void {
  const ticker = document.getElementById('lasTicker');
  if (!ticker) return;

  const item = activities[currentIndex];
  if (!item) return;

  let icon = '⚡';
  let badgeClass = 'las-type-activation';
  if (item.type === 'rank') {
    icon = '🏆';
    badgeClass = 'las-type-rank';
  } else if (item.type === 'withdrawal') {
    icon = '💰';
    badgeClass = 'las-type-withdrawal';
  }

  const html = `
    <div class="las-item ${badgeClass}">
      <span class="las-icon">${icon}</span>
      <span class="las-wallet mono">${item.wallet}</span>
      <span class="las-detail">${item.detail}</span>
      <span class="las-amount mono">${item.amount}</span>
      <span class="las-time mono">&bull; ${item.timeAgo}</span>
    </div>
  `;

  if (!animate || LITE) {
    ticker.innerHTML = html;
    return;
  }

  // Smooth slide-up transition using GSAP
  gsap.to(ticker, {
    y: -14,
    opacity: 0,
    duration: 0.28,
    ease: 'power2.in',
    onComplete: () => {
      ticker.innerHTML = html;
      gsap.fromTo(
        ticker,
        { y: 14, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.38, ease: 'power2.out' }
      );
    },
  });
}

