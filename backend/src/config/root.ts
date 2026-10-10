import { env } from "./env.js";

/**
 * The company (treasury) wallet is the ROOT of the referral tree (owner, 2026-10-09). The
 * activation contract never lets it pay and treats it as activated, so anyone can join under
 * it. Here: it can sponsor without a package, it never receives level commissions or rank
 * rewards (they would be the company paying itself; the shares stay in the treasury), and its
 * record is created at server start. Exactly one address: COMPANY_WALLET_ADDRESS, which must
 * equal the contract's immutable treasury. Read at call time so scripts can set it.
 */
export const rootWallet = (): string | null => env.COMPANY_WALLET_ADDRESS?.toLowerCase() ?? null;

export const isRootWallet = (wallet: string): boolean => {
  const root = rootWallet();
  return root !== null && wallet.toLowerCase() === root;
};
