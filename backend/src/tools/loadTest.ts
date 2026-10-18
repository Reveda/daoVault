/**
 * Launch load test (owner, 2026-10-14). Run on the VPS BEFORE launch (DOCKER.md B17), inside the
 * Docker network so it measures the API itself:
 *
 *   docker compose --env-file .env.prod -f docker-compose.prod.yml run --rm \
 *     -e LOAD_USERS=300 -e LOAD_SECONDS=60 -e LOAD_SIGNIN=1 backend node dist/tools/loadTest.js
 *   ... same with -e LOAD_CLEANUP=1 afterwards (removes every test wallet again)
 *
 * Each virtual user acts like a member: (sign-in: challenge -> wallet signature -> verify ->
 * register) then loops dashboard + invite lookup + health. Prints req/s, p50/p95/p99 and errors
 * per endpoint. Test wallets come from LOAD_SEED, so LOAD_CLEANUP=1 finds and deletes exactly them
 * (only wallets without a package; nothing real is touched).
 *
 * The API's per-IP limits apply to this one machine too: raise API_RATE_LIMIT_MAX /
 * AUTH_RATE_LIMIT_MAX / AUTH_WALLET_RATE_LIMIT_MAX for the test, restart the backend, test, and put
 * them back. Many 429s = the limits, not the server.
 */
import { Wallet, id as keccakText } from "ethers";
import { env } from "../config/env.js";
import { prisma } from "../config/prisma.js";

const BASE = (process.env.LOAD_URL ?? "http://backend:5000").replace(/\/$/, "") + env.API_PREFIX;
const USERS = Number(process.env.LOAD_USERS ?? 200);
const SECONDS = Number(process.env.LOAD_SECONDS ?? 30);
const SIGNIN = process.env.LOAD_SIGNIN === "1";
const SEED = process.env.LOAD_SEED ?? "daovault-load-test";
const ORIGIN = process.env.LOAD_ORIGIN ?? env.FRONTEND_URL.split(",")[0].trim();
const wallets = (n: number) =>
  Array.from({ length: n }, (_, i) => new Wallet(keccakText(`${SEED}:${i}`)));

async function cleanup() {
  const addresses = wallets(Math.max(USERS, 5_000)).map((w) => w.address.toLowerCase());
  const test = await prisma.user.findMany({
    where: { walletAddress: { in: addresses }, packages: { none: {} }, downline: { none: {} } },
    select: { id: true, walletAddress: true },
  });
  const ws = test.map((u) => u.walletAddress);
  await prisma.$transaction([
    prisma.authNonce.deleteMany({ where: { walletAddress: { in: addresses } } }),
    prisma.refreshToken.deleteMany({ where: { walletAddress: { in: addresses } } }),
    prisma.authSession.deleteMany({ where: { walletAddress: { in: addresses } } }),
    prisma.user.deleteMany({ where: { walletAddress: { in: ws } } }),
  ]);
  console.log(`cleanup: removed ${ws.length} test wallets (seed "${SEED}") and their sign-in rows`);
}

type Stat = { ms: number[]; errors: Map<string, number> };
const stats = new Map<string, Stat>();
async function hit(name: string, path: string, init: RequestInit = {}): Promise<Response | null> {
  const stat: Stat = stats.get(name) ?? { ms: [], errors: new Map<string, number>() };
  stats.set(name, stat);
  const t = performance.now();
  try {
    const res = await fetch(BASE + path, {
      ...init,
      headers: { origin: ORIGIN, "content-type": "application/json", ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(30_000),
    });
    stat.ms.push(performance.now() - t);
    if (!res.ok)
      stat.errors.set(String(res.status), (stat.errors.get(String(res.status)) ?? 0) + 1);
    return res;
  } catch (error) {
    stat.ms.push(performance.now() - t);
    const key = (error as Error).name === "TimeoutError" ? "timeout" : "network";
    stat.errors.set(key, (stat.errors.get(key) ?? 0) + 1);
    return null;
  }
}

async function virtualUser(wallet: Wallet, code: string, until: number) {
  const address = wallet.address.toLowerCase();
  let token = "";
  if (SIGNIN) {
    const ch = await hit("sign-in challenge", "/auth/challenge", {
      method: "POST",
      body: JSON.stringify({ walletAddress: address }),
    });
    const message = ch?.ok ? (await ch.json()).data?.message : null;
    if (message) {
      const signature = await wallet.signMessage(message);
      const v = await hit("sign-in verify", "/auth/verify", {
        method: "POST",
        body: JSON.stringify({ walletAddress: address, signature }),
      });
      token = v?.ok ? ((await v.json()).data?.token ?? "") : "";
    }
    if (token)
      await hit("register", "/users/register", {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify({ walletAddress: address }),
      });
  }
  while (Date.now() < until) {
    if (token)
      await hit("dashboard", `/dashboard/${address}`, {
        headers: { authorization: `Bearer ${token}` },
      });
    await hit("invite lookup", `/users/referral/${code}`);
    await hit("health", "/health");
  }
}

const pct = (sorted: number[], p: number) =>
  sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : 0;

async function main() {
  if (process.env.LOAD_CLEANUP === "1") return cleanup();
  const root = env.COMPANY_WALLET_ADDRESS?.toLowerCase();
  const code =
    process.env.LOAD_CODE ??
    (root
      ? (
          await prisma.user.findUnique({
            where: { walletAddress: root },
            select: { referralCode: true },
          })
        )?.referralCode
      : undefined) ??
    "DV000000";
  console.log(
    `load test: ${USERS} users for ${SECONDS}s against ${BASE}${SIGNIN ? " (with wallet sign-in)" : ""}`,
  );
  const until = Date.now() + SECONDS * 1000;
  const started = performance.now();
  await Promise.all(wallets(USERS).map((w) => virtualUser(w, code, until)));
  const secs = (performance.now() - started) / 1000;

  console.log(
    `\n${"endpoint".padEnd(20)} ${"requests".padStart(9)} ${"req/s".padStart(8)} ${"p50 ms".padStart(8)} ${"p95 ms".padStart(8)} ${"p99 ms".padStart(8)}  errors`,
  );
  let total = 0,
    failed = 0;
  for (const [name, s] of stats) {
    const sorted = [...s.ms].sort((a, b) => a - b);
    const errs = [...s.errors].map(([k, v]) => `${k}:${v}`).join(" ") || "-";
    total += s.ms.length;
    failed += [...s.errors.values()].reduce((a, b) => a + b, 0);
    console.log(
      `${name.padEnd(20)} ${String(s.ms.length).padStart(9)} ${(s.ms.length / secs).toFixed(0).padStart(8)} ${pct(sorted, 0.5).toFixed(0).padStart(8)} ${pct(sorted, 0.95).toFixed(0).padStart(8)} ${pct(sorted, 0.99).toFixed(0).padStart(8)}  ${errs}`,
    );
  }
  console.log(
    `\ntotal ${total} requests, ${(total / secs).toFixed(0)} req/s, ${failed} errors (${total ? ((failed / total) * 100).toFixed(2) : 0}%)`,
  );
  console.log(
    failed / Math.max(1, total) < 0.01
      ? "PASS: under 1% errors"
      : "CHECK: 1% or more errors (429 = rate limits; 5xx/timeout = capacity)",
  );
  if (SIGNIN)
    console.log(
      `afterwards: run again with LOAD_CLEANUP=1 (same LOAD_SEED) to remove the ${USERS} test wallets`,
    );
}

await main().catch((error) => console.error("load test failed:", (error as Error).message));
await prisma.$disconnect().catch(() => undefined);
