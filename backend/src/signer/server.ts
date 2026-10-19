/**
 * Payout voucher signer (owner, 2026-10-13: Docker signer on the VPS, no admin review).
 *
 * A tiny separate process that holds the ONE key allowed to sign DAOvaultPayout vouchers.
 * The API asks it to sign; the key never enters the API, the database or any env file:
 *  - the key is an encrypted keystore (scripts/signer-keygen.ts) and its password, both given
 *    as Docker secrets (files under /run/secrets), decrypted in memory at start
 *  - reachable only on the internal Docker network `signer` (no port on the VPS, no internet)
 *  - every request needs the shared token (PAYOUT_SIGNER_TOKEN)
 *  - it signs only for its own chain + payout contract, with its own per-claim and daily caps,
 *    and never signs the same voucher id twice with different values
 * The key holds no money: the contract still checks paused / maxPerClaim / dailyLimit / float.
 * If the key ever leaks: pause the contract, setSigner(new address) from the owner wallet.
 *
 * Endpoints: GET /health, GET /address, POST /sign {member, amount, id, deadline}
 */
import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { Wallet, getAddress, isAddress, isHexString, parseUnits, formatUnits } from "ethers";
import { captureConsole } from "../config/logger.js";

// every console line of the signer becomes one JSON log line (config/logger.ts reads no app settings)
captureConsole();

const CLAIM_TYPES = {
  Claim: [
    { name: "member", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "id", type: "bytes32" },
    { name: "deadline", type: "uint256" },
  ],
};

function setting(name: string, fallback?: string): string {
  const fileName = process.env[`${name}_FILE`];
  const value = fileName
    ? readFileSync(fileName, "utf8").trim()
    : process.env[name]?.trim() || fallback;
  if (value === undefined || value === "")
    throw new Error(`signer: ${name} (or ${name}_FILE) is not set`);
  return value;
}

const CHAIN_ID = Number(setting("SIGNER_CHAIN_ID"));
const CONTRACT = getAddress(setting("SIGNER_PAYOUT_CONTRACT"));
const DECIMALS = Number(setting("SIGNER_TOKEN_DECIMALS", "18"));
const MAX_PER_CLAIM = parseUnits(setting("SIGNER_MAX_PER_CLAIM_USD", "50000"), DECIMALS);
const MAX_PER_DAY = parseUnits(setting("SIGNER_MAX_PER_DAY_USD", "250000"), DECIMALS);
const MAX_DEADLINE_S = Number(setting("SIGNER_MAX_DEADLINE_MINUTES", "60")) * 60;
const TOKEN = Buffer.from(setting("PAYOUT_SIGNER_TOKEN"));
const PORT = Number(setting("SIGNER_PORT", "7000"));
const MAX_REQUESTS_PER_MINUTE = Number(setting("SIGNER_MAX_REQUESTS_PER_MINUTE", "120"));
if (![56, 97].includes(CHAIN_ID))
  throw new Error("signer: SIGNER_CHAIN_ID must be 56 (BSC) or 97 (BSC Testnet)");
if (TOKEN.length < 32)
  throw new Error("signer: PAYOUT_SIGNER_TOKEN must be at least 32 characters");

const keystore = setting("SIGNER_KEYSTORE");
const password = setting("SIGNER_KEYSTORE_PASSWORD");
const wallet = await Wallet.fromEncryptedJson(keystore, password);
const domain = {
  name: "DAOvaultPayout",
  version: "1",
  chainId: CHAIN_ID,
  verifyingContract: CONTRACT,
};

// in-memory caps (reset on restart; the contract's own dailyLimit still applies)
let day = -1;
let signedToday = 0n;
const signedIds = new Map<string, string>(); // voucher id -> member|amount|deadline
const requests = new Map<string, { window: number; count: number }>();

const authorised = (req: IncomingMessage) => {
  const given = Buffer.from((req.headers.authorization ?? "").replace(/^Bearer\s+/i, ""));
  return given.length === TOKEN.length && timingSafeEqual(given, TOKEN);
};

const requestAllowed = (req: IncomingMessage) => {
  const now = Date.now();
  const window = Math.floor(now / 60_000);
  const ip = req.socket.remoteAddress ?? "unknown";
  const current = requests.get(ip);
  if (!current || current.window !== window) {
    requests.set(ip, { window, count: 1 });
    return true;
  }
  current.count += 1;
  return current.count <= MAX_REQUESTS_PER_MINUTE;
};

const send = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
};

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 2_000) throw new Error("body too large");
  }
  return JSON.parse(raw) as Record<string, unknown>;
}

async function sign(body: Record<string, unknown>) {
  const { member, amount, id, deadline } = body;
  if (typeof member !== "string" || !isAddress(member)) return { status: 400, error: "bad member" };
  if (typeof id !== "string" || !isHexString(id, 32)) return { status: 400, error: "bad id" };
  if (typeof amount !== "string" || !/^[1-9]\d{0,40}$/.test(amount))
    return { status: 400, error: "bad amount" };
  if (typeof deadline !== "number" || !Number.isInteger(deadline))
    return { status: 400, error: "bad deadline" };
  const value = BigInt(amount);
  const now = Math.floor(Date.now() / 1000);
  if (deadline <= now || deadline > now + MAX_DEADLINE_S)
    return { status: 400, error: "deadline out of range" };
  if (value > MAX_PER_CLAIM) return { status: 403, error: "above the signer's per-claim cap" };

  const today = Math.floor(Date.now() / 86_400_000);
  if (today !== day) {
    day = today;
    signedToday = 0n;
    signedIds.clear();
  }
  const key = `${getAddress(member)}|${value}|${deadline}`;
  const before = signedIds.get(id);
  if (before !== undefined && before !== key)
    return { status: 409, error: "voucher id already signed with other values" };
  if (before === undefined) {
    if (signedToday + value > MAX_PER_DAY)
      return { status: 403, error: "signer daily cap reached" };
    signedToday += value;
    signedIds.set(id, key);
  }
  const signature = await wallet.signTypedData(domain, CLAIM_TYPES, {
    member: getAddress(member),
    amount: value,
    id,
    deadline,
  });
  console.log(
    `[signer] signed ${id.slice(0, 10)}… ${formatUnits(value, DECIMALS)} USDT for ${member.slice(0, 8)}… (today ${formatUnits(signedToday, DECIMALS)})`,
  );
  return { status: 200, signature };
}

createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/health") return send(res, 200, { ok: true });
    if (!authorised(req)) return send(res, 401, { error: "unauthorised" });
    if (!requestAllowed(req)) return send(res, 429, { error: "signer rate limit exceeded" });
    if (req.method === "GET" && req.url === "/address")
      return send(res, 200, { address: wallet.address });
    if (req.method === "POST" && req.url === "/sign") {
      const { status, ...out } = await sign(await readJson(req));
      return send(res, status, out);
    }
    return send(res, 404, { error: "not found" });
  } catch (error) {
    console.error("[signer]", error instanceof Error ? error.message : error);
    return send(res, 400, { error: "bad request" });
  }
}).listen(PORT, "0.0.0.0", () => {
  console.log(
    `[signer] ${wallet.address} signing for chain ${CHAIN_ID}, contract ${CONTRACT}, port ${PORT}`,
  );
  console.log(
    `[signer] caps: ${formatUnits(MAX_PER_CLAIM, DECIMALS)} per claim, ${formatUnits(MAX_PER_DAY, DECIMALS)} per day`,
  );
});
