import { FallbackProvider, JsonRpcProvider, type AbstractProvider } from "ethers";
import { env } from "./env.js";

/**
 * Chain reads must survive one RPC provider being slow or unavailable. FallbackProvider
 * keeps the API/indexer on the same chain while switching providers automatically.
 * Values are never trusted for money without the existing contract/event checks and confirmations.
 */
const split = (value: string) => value.split(",").map((v) => v.trim()).filter(Boolean);
const unique = (urls: string[]) => [...new Set(urls)];

const make = (urls: string[]): AbstractProvider => {
  const providers = unique(urls).map((url, index) => ({
    provider: new JsonRpcProvider(url, env.BSC_CHAIN_ID, { staticNetwork: true }),
    priority: index,
    weight: 1,
    stallTimeout: index === 0 ? 1_500 : 3_000,
  }));
  if (!providers.length) throw new Error("No blockchain RPC URL is configured");
  return new FallbackProvider(providers, env.BSC_CHAIN_ID, { quorum: 1 });
};

let main: AbstractProvider | null = null;
let indexer: AbstractProvider | null = null;

export const chainProvider = (): AbstractProvider => {
  if (!main) main = make([env.BSC_RPC_URL, ...split(env.BSC_RPC_URLS)]);
  return main;
};

export const indexerProvider = (): AbstractProvider => {
  if (!indexer) indexer = make([
    ...(env.INDEXER_RPC_URL ? [env.INDEXER_RPC_URL] : []),
    ...split(env.INDEXER_RPC_URLS),
    env.BSC_RPC_URL,
    ...split(env.BSC_RPC_URLS),
  ]);
  return indexer;
};
