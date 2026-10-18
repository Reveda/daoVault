/**
 * DAOvault AI — Type Definitions
 * Strict types for Marketing Plan, Web3 Providers, and Financial Models
 */

export interface RankTier {
  id: number;
  title: string;
  /** DAO matching: needed on BOTH sides (Left Leg and Right Leg) */
  dao: number;
  reward: number;
  desc: string;
}

export interface LevelMatrixRow {
  level: number;
  pct: number;
  usd: number;
  reqDirects: number;
}

export interface EIP6963ProviderInfo {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
}

export interface EIP6963ProviderDetail {
  info: EIP6963ProviderInfo;
  provider: any;
}

export interface WalletOption {
  id: string;
  name: string;
  icon: string | null;
  provider?: any;
  appLink?: (url: string) => string;
  webLink?: string;
  /** official store listings: Google Play package + App Store app id (opened when the app is not installed) */
  store?: { android: string; ios: string };
}

export interface UserStats {
  account: string;
  sponsor: string;
  directs: number;
  totalEarned: number;
  currentRank: string;
  withdrawableBalance: number;
}
