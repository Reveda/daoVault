import { Interface, JsonRpcProvider, type Log } from "ethers";
import { env } from "../config/env.js";
import { prisma } from "../config/prisma.js";
import { activationService } from "../modules/activation/activation.service.js";

/**
 * Chain indexer (background worker): reads the payment contract's Activated / ToppedUp events
 * block by block and records each one through the SAME verification the website uses
 * (activationService.verify / verifyTopUp: receipt, sender, contract, token, treasury, amount).
 * So a payment counts even when the member's browser closed before it reported it, and a
 * sponsor's activation can no longer go missing. Idempotent: a transaction already recorded
 * (by the website or an earlier run) is skipped by its unique hash.
 * The cursor (last finished block) lives in Postgres; a block range is retried until it passes.
 */
const CURSOR = "payment-contract";
const MAX_CHUNKS_PER_RUN = 10;
const iface = new Interface([
  "event Activated(address indexed user, address indexed sponsor, uint256 amount, uint256 timestamp)",
  "event ToppedUp(address indexed user, uint256 amount, uint256 count, uint256 timestamp)",
]);
const ACTIVATED = iface.getEvent("Activated")!.topicHash;
const TOPPED_UP = iface.getEvent("ToppedUp")!.topicHash;

/** 4xx from the verification = this event can never pass (logged, skipped); anything else is retried */
const isPermanent = (error: unknown) => {
  const status = (error as { statusCode?: number })?.statusCode;
  return typeof status === "number" && status < 500;
};

async function record(log: Log): Promise<"recorded" | "skipped"> {
  const parsed = iface.parseLog(log);
  if (!parsed) return "skipped";
  const walletAddress = String(parsed.args[0]);
  try {
    const result = parsed.name === "Activated"
      ? await activationService.verify({ walletAddress, transactionHash: log.transactionHash, sponsorAddress: String(parsed.args[1]) })
      : await activationService.verifyTopUp({ walletAddress, transactionHash: log.transactionHash });
    if (!result.alreadyProcessed) console.log(`[indexer] ${parsed.name} ${walletAddress} recorded from ${log.transactionHash}`);
    return "recorded";
  } catch (error) {
    if (!isPermanent(error)) throw error;
    console.warn(`[indexer] ${parsed.name} ${walletAddress} in ${log.transactionHash} NOT recorded: ${(error as Error).message}`);
    return "skipped";
  }
}

export async function indexPaymentEvents(): Promise<{ from?: number; to?: number; events: number; skipped: number }> {
  if (!env.PAYMENT_CONTRACT_ADDRESS) return { events: 0, skipped: 0 };
  const provider = new JsonRpcProvider(env.INDEXER_RPC_URL ?? env.BSC_RPC_URL, env.BSC_CHAIN_ID, { staticNetwork: true });
  const safeHead = (await provider.getBlockNumber()) - env.INDEXER_CONFIRMATIONS;

  const cursor = await prisma.chainCursor.findUnique({ where: { name: CURSOR } });
  let from: number;
  if (cursor) from = Number(cursor.block) + 1;
  else if (env.INDEXER_START_BLOCK !== undefined) from = env.INDEXER_START_BLOCK;
  else {
    console.warn("[indexer] INDEXER_START_BLOCK is not set: reading new blocks only (set it to the contract's deploy block to catch up past payments)");
    from = safeHead;
  }

  const firstBlock = from;
  let events = 0;
  let skipped = 0;
  for (let chunk = 0; chunk < MAX_CHUNKS_PER_RUN && from <= safeHead; chunk++) {
    const to = Math.min(safeHead, from + env.INDEXER_BLOCK_CHUNK - 1);
    const logs = await provider.getLogs({ address: env.PAYMENT_CONTRACT_ADDRESS, fromBlock: from, toBlock: to, topics: [[ACTIVATED, TOPPED_UP]] })
      .catch((error: Error) => {
        // checked 2026-10-11: bnbchain.org / binance.org dataseeds answer "limit exceeded" to any
        // eth_getLogs; publicnode.com allows 5,000 blocks; paid RPCs more
        throw new Error(`eth_getLogs ${from}-${to} refused (${error.message.slice(0, 80)}). Set INDEXER_RPC_URL to an RPC that allows it, or lower INDEXER_BLOCK_CHUNK.`);
      });
    logs.sort((a, b) => a.blockNumber - b.blockNumber || a.index - b.index); // sponsors before their members
    for (const log of logs) {
      if ((await record(log)) === "skipped") skipped++;
      events++;
    }
    await prisma.chainCursor.upsert({
      where: { name: CURSOR },
      update: { block: BigInt(to) },
      create: { name: CURSOR, block: BigInt(to) },
    });
    from = to + 1;
  }
  return { from: firstBlock, to: from - 1, events, skipped };
}
