/**
 * Production settings check (owner review, 2026-10-14). Run before going live, and after any
 * settings change, on the server itself:
 *
 *   docker compose --env-file .env.prod -f docker-compose.prod.yml run --rm backend node dist/tools/checkEnv.js
 *   (Render / a PC: cd backend && npm run check:env)
 *
 * Checks that every value the live system needs is set AND agrees with the blockchain:
 * contracts exist, the payment contract's token / treasury / payout contract / amount match these
 * settings, the payout contract trusts our signer, the indexer can read from its start block,
 * the database has every migration, Redis answers. Prints only names, short addresses and
 * numbers, never a secret. Exit code 1 if anything is wrong.
 */
import { Contract, formatUnits, getAddress } from "ethers";
import { env } from "../config/env.js";
import { prisma } from "../config/prisma.js";
import { signerAddress } from "../modules/withdrawals/voucherSigner.js";
import { chainProvider, indexerProvider } from "../config/rpc.js";

const MAINNET_USDT = "0x55d398326f99059fF775485246999027B3197955";
let failures = 0;
let warnings = 0;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const ok = (msg: string) => console.log(`  OK    ${msg}`);
const fail = (msg: string) => {
  failures++;
  console.log(`  FAIL  ${msg}`);
};
const warn = (msg: string) => {
  warnings++;
  console.log(`  WARN  ${msg}`);
};
const same = (a?: string | null, b?: string | null) =>
  Boolean(a && b && a.toLowerCase() === b.toLowerCase());

async function main() {
  console.log(`\nDAOVAULT settings check · chain ${env.BSC_CHAIN_ID} · NODE_ENV ${env.NODE_ENV}\n`);

  console.log("Settings present");
  const required: Array<[string, unknown]> = [
    ["PAYMENT_CONTRACT_ADDRESS", env.PAYMENT_CONTRACT_ADDRESS],
    ["PAYOUT_CONTRACT_ADDRESS", env.PAYOUT_CONTRACT_ADDRESS],
    ["USDT_CONTRACT_ADDRESS", env.USDT_CONTRACT_ADDRESS],
    ["COMPANY_WALLET_ADDRESS", env.COMPANY_WALLET_ADDRESS],
    ["INDEXER_START_BLOCK", env.INDEXER_START_BLOCK],
    ["INDEXER_RPC_URL", env.INDEXER_RPC_URL],
  ];
  for (const [name, value] of required)
    (value === undefined || value === "" ? fail : ok)(
      `${name}${value === undefined || value === "" ? " is not set" : ""}`,
    );
  if (env.ADMIN_WALLETS.length) ok(`ADMIN_WALLETS: ${env.ADMIN_WALLETS.map(short).join(", ")}`);
  else fail("ADMIN_WALLETS has no valid wallet");
  if (env.PAYOUT_SIGNER_URL && env.PAYOUT_SIGNER_TOKEN)
    ok("PAYOUT_SIGNER_URL + PAYOUT_SIGNER_TOKEN set (Docker signer)");
  else if (env.PAYOUT_SIGNER_TESTNET_KEY && env.BSC_CHAIN_ID === 97)
    warn("voucher signer = PAYOUT_SIGNER_TESTNET_KEY (testnet only)");
  else
    fail(
      "no voucher signer: set PAYOUT_SIGNER_URL + PAYOUT_SIGNER_TOKEN (withdrawals stay closed)",
    );
  const origins = env.FRONTEND_URL.split(",").map((o) => o.trim());
  if (origins.every((o) => o.startsWith("https://"))) ok(`FRONTEND_URL: ${origins.join(", ")}`);
  else fail("FRONTEND_URL must be https://");
  if (origins.some((o) => o.includes("onrender.com")) && env.REDIS_URL)
    warn("FRONTEND_URL still names Render while running with Redis (VPS?): set the VPS domain");
  if (
    env.BSC_CHAIN_ID === 56 &&
    env.USDT_CONTRACT_ADDRESS &&
    !same(env.USDT_CONTRACT_ADDRESS, MAINNET_USDT)
  )
    fail(`USDT_CONTRACT_ADDRESS is not BSC USDT (${short(MAINNET_USDT)}) on mainnet`);
  if (![56, 97].includes(env.BSC_CHAIN_ID))
    fail("BSC_CHAIN_ID must be 56 (mainnet) or 97 (testnet)");

  console.log("\nDatabase / Redis");
  try {
    await prisma.$queryRaw`SELECT 1`;
    ok("database reachable");
    try {
      await prisma.planEvent.count();
      await prisma.chainCursor.count();
      ok("latest tables present (migrations applied)");
    } catch {
      fail("tables missing: run `npx prisma migrate deploy` (the API refuses to start without it)");
    }
  } catch (error) {
    fail(`database unreachable: ${(error as Error).message.slice(0, 120)}`);
  }
  if (env.REDIS_URL) {
    const { redis } = await import("../config/redis.js");
    for (let i = 0; i < 20 && !redis?.isReady; i++) await new Promise((r) => setTimeout(r, 250));
    if (redis?.isReady && (await redis.ping()) === "PONG") ok("Redis answers");
    else fail("Redis does not answer (REDIS_URL / password)");
    await redis?.quit().catch(() => undefined);
  } else warn("REDIS_URL not set: one API copy only, no background worker");

  console.log("\nBlockchain");
  const provider = chainProvider();
  const head = await provider.getBlockNumber().catch(() => null);
  if (head === null) {
    fail(`BSC_RPC_URL does not answer for chain ${env.BSC_CHAIN_ID}`);
    return;
  }
  ok(`BSC_RPC_URL answers (block ${head})`);
  const hasCode = async (address: string | undefined, name: string) => {
    if (!address) return false;
    const code = await provider.getCode(address).catch(() => "0x");
    if (code === "0x") {
      fail(
        `${name} ${short(address)} has no contract on chain ${env.BSC_CHAIN_ID} (wrong chain or not deployed)`,
      );
      return false;
    }
    ok(`${name} ${short(address)} is a contract`);
    return true;
  };

  if (await hasCode(env.PAYMENT_CONTRACT_ADDRESS, "payment contract")) {
    const pay = new Contract(
      env.PAYMENT_CONTRACT_ADDRESS!,
      [
        "function usdt() view returns (address)",
        "function treasury() view returns (address)",
        "function payoutVault() view returns (address)",
        "function activationAmount() view returns (uint256)",
      ],
      provider,
    );
    const [usdt, treasury, vault, amount] = (await Promise.all([
      pay.usdt(),
      pay.treasury(),
      pay.payoutVault().catch(() => null),
      pay.activationAmount(),
    ])) as [string, string, string | null, bigint];
    (same(usdt, env.USDT_CONTRACT_ADDRESS) ? ok : fail)(
      `payment contract token ${short(usdt)} ${same(usdt, env.USDT_CONTRACT_ADDRESS) ? "=" : "!="} USDT_CONTRACT_ADDRESS`,
    );
    (same(treasury, env.COMPANY_WALLET_ADDRESS) ? ok : fail)(
      `payment contract treasury ${short(treasury)} ${same(treasury, env.COMPANY_WALLET_ADDRESS) ? "=" : "!="} COMPANY_WALLET_ADDRESS`,
    );
    if (vault === null)
      fail("payment contract has no payoutVault(): an old version without the 45/55 split");
    else
      (same(vault, env.PAYOUT_CONTRACT_ADDRESS) ? ok : fail)(
        `payment contract sends 45% to ${short(vault)} ${same(vault, env.PAYOUT_CONTRACT_ADDRESS) ? "=" : "!="} PAYOUT_CONTRACT_ADDRESS`,
      );
    const decimals = Number(
      await new Contract(usdt, ["function decimals() view returns (uint8)"], provider)
        .decimals()
        .catch(() => 18),
    );
    const usd = Number(formatUnits(amount, decimals));
    (usd === env.ACTIVATION_AMOUNT_USDT ? ok : fail)(
      `activation amount on-chain $${usd} ${usd === env.ACTIVATION_AMOUNT_USDT ? "=" : "!="} ACTIVATION_AMOUNT_USDT ${env.ACTIVATION_AMOUNT_USDT}`,
    );
  }

  if (await hasCode(env.PAYOUT_CONTRACT_ADDRESS, "payout contract")) {
    const payout = new Contract(
      env.PAYOUT_CONTRACT_ADDRESS!,
      [
        "function usdt() view returns (address)",
        "function signer() view returns (address)",
        "function owner() view returns (address)",
        "function paused() view returns (bool)",
        "function floatBalance() view returns (uint256)",
        "function maxPerClaim() view returns (uint256)",
        "function dailyLimit() view returns (uint256)",
      ],
      provider,
    );
    const [usdt, signer, owner, paused, float, maxPerClaim, dailyLimit] = (await Promise.all([
      payout.usdt(),
      payout.signer(),
      payout.owner(),
      payout.paused(),
      payout.floatBalance(),
      payout.maxPerClaim(),
      payout.dailyLimit(),
    ])) as [string, string, string, boolean, bigint, bigint, bigint];
    (same(usdt, env.USDT_CONTRACT_ADDRESS) ? ok : fail)(
      `payout contract token ${short(usdt)} ${same(usdt, env.USDT_CONTRACT_ADDRESS) ? "=" : "!="} USDT_CONTRACT_ADDRESS`,
    );
    ok(
      `payout owner ${short(owner)} · limits $${formatUnits(maxPerClaim, 18)} per claim, $${formatUnits(dailyLimit, 18)} per day · float $${formatUnits(float, 18)}`,
    );
    if (paused) warn("payout contract is PAUSED: nobody can withdraw");
    if (float < BigInt(Math.round(env.PAYOUT_FLOAT_ALERT_USD)) * 10n ** 18n)
      warn(`payout float below PAYOUT_FLOAT_ALERT_USD ($${env.PAYOUT_FLOAT_ALERT_USD})`);
    try {
      const ours = await signerAddress();
      (same(signer, ours) ? ok : fail)(
        `payout contract trusts ${short(signer)} ${same(signer, ours) ? "=" : "!="} our signer ${short(getAddress(ours))}`,
      );
    } catch (error) {
      fail(
        `signer service does not answer (${(error as Error).message.slice(0, 100)}): start it with --profile payouts`,
      );
    }
  }

  if (env.PAYMENT_CONTRACT_ADDRESS && env.INDEXER_START_BLOCK !== undefined) {
    const indexer = indexerProvider();
    if (env.INDEXER_START_BLOCK > head)
      fail(`INDEXER_START_BLOCK ${env.INDEXER_START_BLOCK} is in the future (head ${head})`);
    else {
      try {
        await indexer.getLogs({
          address: env.PAYMENT_CONTRACT_ADDRESS,
          fromBlock: env.INDEXER_START_BLOCK,
          toBlock: Math.min(head, env.INDEXER_START_BLOCK + 100),
        });
        ok(`indexer RPC reads contract logs from block ${env.INDEXER_START_BLOCK}`);
      } catch (error) {
        fail(`INDEXER_RPC_URL refuses eth_getLogs (${(error as Error).message.slice(0, 80)})`);
      }
    }
  }
}

await main().catch((error) => fail(`check crashed: ${(error as Error).message.slice(0, 200)}`));
await prisma.$disconnect().catch(() => undefined);
console.log(
  failures
    ? `\n${failures} problem(s), ${warnings} warning(s): fix the FAIL lines before going live.`
    : `\nAll required settings OK (${warnings} warning(s)).`,
);
process.exit(failures ? 1 : 0);
