/**
 * Landing "Verify it yourself" card (owner, 2026-10-09): the Activation contract and the USDT
 * token it accepts, each with one "View on BscScan" button. No address is printed and nothing
 * from our database is listed: BscScan itself shows every activation transaction.
 * Badges are earned, never assumed: "Live on BSC" only when eth_getCode finds contract code at
 * the address. A row appears only once its address is configured (no placeholder text).
 */
import { BSC_CHAIN_ID, showToast } from './core.ts';
import { BSC_PARAMS } from './wallet.ts';

const isAddress = (v: string) => /^0x[a-fA-F0-9]{40}$/.test(v);
const PAYMENT = String(import.meta.env.VITE_PAYMENT_CONTRACT_ADDRESS || '').trim();
const USDT = String(import.meta.env.VITE_USDT_CONTRACT_ADDRESS || '').trim();
const SCAN = BSC_CHAIN_ID === 97 ? 'https://testnet.bscscan.com' : 'https://bscscan.com';

async function hasCode(address: string): Promise<boolean | null> {
  try {
    const res = await fetch(BSC_PARAMS.rpcUrls[0], {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getCode', params: [address, 'latest'] }),
    });
    const json = await res.json();
    return typeof json.result === 'string' ? json.result.length > 2 : null;
  } catch {
    return null; // RPC unreachable: say nothing rather than guess
  }
}

function row(label: string, address: string, hint: string, button: string): string {
  if (!isAddress(address)) return '';
  return `
    <div class="vc-row">
      <span class="vc-label mono">${label}</span>
      <a class="vc-btn mono" href="${SCAN}/address/${address}" target="_blank" rel="noopener">${button} &#8599;</a>
      <small>${hint}</small>
    </div>`;
}

export function initChainProof(): void {
  const card = document.getElementById('verifyCard');
  const rows = document.getElementById('verifyRows');
  const badges = document.getElementById('verifyBadges');
  if (!card || !rows || !badges) return;

  // follows the build: the live site (chain 56) says BSC Mainnet, a testnet build says BSC Testnet
  const network = BSC_CHAIN_ID === 97 ? 'BSC Testnet' : 'BSC Mainnet';
  rows.innerHTML =
    row('Activation contract', PAYMENT, 'Receives the $300 USDT activation and records your sponsor on-chain. Every activation is listed there.', 'View transactions on BscScan') +
    row('USDT token (BEP-20)', USDT, 'The only token the contract accepts.', 'View token on BscScan');

  // "Check any wallet": opens BscScan for the pasted address (its USDT transfers once the token is set)
  const form = document.getElementById('verifyCheck') as HTMLFormElement | null;
  const input = document.getElementById('verifyWallet') as HTMLInputElement | null;
  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    const wallet = (input?.value || '').trim();
    if (!isAddress(wallet)) { showToast('Paste a full wallet address: 0x followed by 40 characters.', true); input?.focus(); return; }
    const url = isAddress(USDT) ? `${SCAN}/token/${USDT}?a=${wallet}` : `${SCAN}/address/${wallet}`;
    window.open(url, '_blank', 'noopener');
  });

  const badge = (cls: string, text: string) => `<span class="vc-badge ${cls} mono">${text}</span>`;
  const configured = isAddress(PAYMENT);
  rows.hidden = !rows.innerHTML.trim();
  badges.innerHTML = badge('is-net', network) + (configured ? badge('is-wait', 'Checking chain…') : '');
  if (!configured) return;

  // one RPC call, only when the card comes near the screen
  const run = async () => {
    const live = await hasCode(PAYMENT);
    badges.innerHTML = badge('is-net', network)
      + (live === true ? badge('is-live', '&#9679; Live on BSC') : live === false ? badge('is-wait', 'Not deployed on this network') : '');
  };
  if (!('IntersectionObserver' in window)) { void run(); return; }
  const io = new IntersectionObserver((entries) => {
    if (entries.some((en) => en.isIntersecting)) { io.disconnect(); void run(); }
  }, { rootMargin: '300px' });
  io.observe(card);
}
