/**
 * Plan check: runs real activations through the commission/rank engine against the
 * configured database inside ONE transaction that is always rolled back, so nothing is
 * left behind. Run: npm run check:plan
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { PrismaClient, type Prisma } from "@prisma/client";
import { processActivation, processTopUp } from "../src/modules/activation/activation.engine.js";
import { rankForLegs, summarizeLegs, withdrawalSplit } from "../src/modules/plan/plan.js";
import { env } from "../src/config/env.js";
import { balanceOf } from "../src/modules/withdrawals/withdrawals.service.js";

const prisma = new PrismaClient();
const ZERO = "0x0000000000000000000000000000000000000000";
const wallet = (prefix = "") => `0x${(prefix + randomBytes(20).toString("hex")).slice(0, 40)}`;
const txHash = () => `0x${randomBytes(32).toString("hex")}`;

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

// ── pure rules ──
// rank rule (owner, 2026-10-08): the DAO matching is needed on EACH side
check("matching: 25 + 24 legs is not Starter", rankForLegs(summarizeLegs([25, 24])) === 0);
check("matching: 25 + 25 legs is Starter (25 DAO on each side)", rankForLegs(summarizeLegs([25, 25])) === 1);
check("matching: 13 + 13 legs is NOT Starter any more (old split rule)", rankForLegs(summarizeLegs([13, 13])) === 0);
check("matching: one 1000 leg alone ranks nothing", rankForLegs(summarizeLegs([1000])) === 0);
check("matching: 100 + 100 legs is Leader, not Elite Leader", rankForLegs(summarizeLegs([100, 100])) === 3);
check("matching: 200 + 200 legs is Elite Leader", rankForLegs(summarizeLegs([200, 200])) === 4);
check("matching: the power leg needs the full DAO too (30 power vs 24 other is not Starter)", rankForLegs(summarizeLegs([30, 24])) === 0);
check("matching: other legs combine (25 + 12 + 13 is Starter)", rankForLegs(summarizeLegs([25, 12, 13])) === 1);
check("Crown Ambassador needs 12,000 on each side", rankForLegs(summarizeLegs([12000, 11999])) === 8 && rankForLegs(summarizeLegs([12000, 12000])) === 9);
const split = withdrawalSplit(10_000, 5);
check("5% fee on $100", split.feeCents === 500 && split.netCents === 9_500);

class Rollback extends Error {}

try {
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const activate = (w: string, sponsor = ZERO, hash = txHash()) =>
      processActivation(tx, { walletAddress: w, sponsorAddress: sponsor, transactionHash: hash, amountUsd: 300 });
    const pkgOf = async (w: string) => (await tx.package.findFirst({ where: { user: { walletAddress: w } } }))!;
    const userOf = async (w: string) => (await tx.user.findUnique({ where: { walletAddress: w } }))!;

    // A (root) -> B, D ; B -> C
    const A = wallet(), B = wallet(), C = wallet(), D = wallet();
    await activate(A);
    const rB = await activate(B, A);
    check("B links to A", rB.sponsorLinked);
    check("A earns L1 $30 from B", rB.commissions.length === 1 && rB.commissions[0].amountUsd === 30 && rB.commissions[0].wallet === A);
    check("A has 1 active direct", (await userOf(A)).activeDirectsCount === 1);

    const rC = await activate(C, B);
    check("B earns L1 $30 from C", rC.commissions.some((c) => c.wallet === B && c.level === 1 && c.amountUsd === 30));
    check("A's L2 is locked with 1 direct", rC.skipped.some((s) => s.wallet === A && s.level === 2 && s.reason === "level_locked"));

    await activate(D, A);
    check("A now has 2 directs", (await userOf(A)).activeDirectsCount === 2);
    const E = wallet();
    const rE = await activate(E, C);
    check("A's L3 still locked (needs 3 directs)", rE.skipped.some((s) => s.wallet === A && s.level === 3));
    const F = wallet();
    const rF = await activate(F, B); // B L1, A L2 (A has 2 directs -> L2 open)
    check("A earns L2 $15 once 2 directs", rF.commissions.some((c) => c.wallet === A && c.level === 2 && c.amountUsd === 15));
    check("A team volume = 5", (await userOf(A)).teamVolume === 5);

    // idempotent replay
    const hash = txHash(); const G = wallet();
    await activate(G, D, hash);
    const replay = await activate(G, D, hash);
    check("same tx twice is processed once", replay.alreadyProcessed && replay.commissions.length === 0);
    let dup = false;
    try { await activate(G, D); } catch { dup = true; }
    check("second package for same wallet refused", dup);

    // sponsor that is not a member is ignored, upline stays empty
    const H = wallet();
    const rH = await activate(H, wallet());
    check("unknown sponsor is not linked", !rH.sponsorLinked && rH.commissions.length === 0);

    // 25x cap: A at $7,490 earns only $10 more, then is CAPPED and skipped
    const pkgA = await pkgOf(A);
    await tx.package.update({ where: { id: pkgA.id }, data: { totalEarned: 7490 } });
    const rI = await activate(wallet(), A);
    check("cap: A paid only $10", rI.commissions.some((c) => c.wallet === A && c.amountUsd === 10));
    check("cap: A package is CAPPED at $7,500", (await pkgOf(A)).status === "CAPPED" && Number((await pkgOf(A)).totalEarned) === 7500);
    const rJ = await activate(wallet(), A);
    check("cap: capped A is skipped", rJ.skipped.some((s) => s.wallet === A && s.reason === "capped"));

    // referral code collision: same first 6 hex chars
    const same1 = `0xabcdef${randomBytes(17).toString("hex")}`;
    const same2 = `0xabcdef${randomBytes(17).toString("hex")}`;
    const c1 = await activate(same1); const c2 = await activate(same2);
    check("referral codes stay unique", c1.referralCode !== c2.referralCode, `${c1.referralCode} / ${c2.referralCode}`);

    // rank: R with two legs of 25 -> Starter + $150 reward, once
    const R = wallet();
    await activate(R);
    const buildLeg = async (size: number) => {
      let parent = R;
      for (let i = 0; i < size; i++) { const w = wallet(); await activate(w, parent); parent = w; }
    };
    await buildLeg(25);
    await buildLeg(24);
    check("rank: 25 + 24 is not Starter yet", (await userOf(R)).currentRank === 0);
    const last = wallet();
    const lastLegHead = await tx.user.findMany({ where: { upline: { walletAddress: R } }, orderBy: { teamVolume: "asc" }, take: 1 });
    const rRank = await activate(last, lastLegHead[0].walletAddress);
    check("rank: 25 + 25 makes R Starter", (await userOf(R)).currentRank === 1, JSON.stringify(rRank.rankUps.filter((u) => u.wallet === R)));
    const rewards = await tx.earning.findMany({ where: { recipient: { walletAddress: R }, type: "RANK_REWARD" } });
    check("rank: Starter reward $150 paid once", rewards.length === 1 && Number(rewards[0].amountUsd) === 150);

    // ── confirmed rule: a level is never back-paid once it unlocks ──
    const P = wallet(); await activate(P);
    const P1 = wallet(); await activate(P1, P);          // P has 1 direct: L2 locked
    await activate(wallet(), P1);                       // L2 member for P while locked -> skipped
    await activate(wallet(), P);                        // 2nd direct: L2 unlocks now
    const l2Before = await tx.earning.count({ where: { recipient: { walletAddress: P }, level: 2 } });
    check("no back-pay: L2 earns nothing for the member who joined while it was locked", l2Before === 0);
    await activate(wallet(), P1);                       // new L2 member after unlock
    const l2After = await tx.earning.findMany({ where: { recipient: { walletAddress: P }, level: 2 } });
    check("no back-pay: only the new L2 member pays $15", l2After.length === 1 && Number(l2After[0].amountUsd) === 15);

    // ── confirmed rule: rank rewards sit outside the 25x cap ──
    const Q = wallet(); await activate(Q);
    const pkgQ = await pkgOf(Q);
    await tx.package.update({ where: { id: pkgQ.id }, data: { totalEarned: 7500, status: "CAPPED" } });
    for (let leg = 0; leg < 2; leg++) {
      let parent = Q;
      for (let i = 0; i < 25; i++) { const w = wallet(); await activate(w, parent); parent = w; }
    }
    const qRewards = await tx.earning.findMany({ where: { recipient: { walletAddress: Q }, type: "RANK_REWARD" } });
    const qLevel = await tx.earning.count({ where: { recipient: { walletAddress: Q }, type: "LEVEL_COMMISSION" } });
    check("outside cap: a CAPPED member still gets the Starter $150 rank reward", qRewards.length === 1 && Number(qRewards[0].amountUsd) === 150);
    check("outside cap: the capped member gets no more level income", qLevel === 0);
    check("outside cap: the rank reward does not use up the 25x cap", Number((await pkgOf(Q)).totalEarned) === 7500);

    // ── every level pays its exact share: L1 $30, L2 $15, L3–4 $9, L5–7 $6, L8–20 $3 = $120 (40%) ──
    const chainUp: string[] = [];
    for (let i = 0; i < 20; i++) { const w = wallet(); await activate(w, chainUp[i - 1] ?? ZERO); chainUp.push(w); }
    // 15 directs each: every level open (the directs themselves are not needed for the payout maths)
    await tx.user.updateMany({ where: { walletAddress: { in: chainUp } }, data: { activeDirectsCount: 15 } });
    const rDeep = await activate(wallet(), chainUp[19]);
    const expected = [30, 15, 9, 9, 6, 6, 6, ...Array(13).fill(3)];
    const paidByLevel = expected.map((_, i) => rDeep.commissions.find((c) => c.level === i + 1 && c.wallet === chainUp[19 - i])?.amountUsd ?? 0);
    check("20 levels: each upline is paid its exact share", paidByLevel.every((v, i) => v === expected[i]), paidByLevel.join(","));
    check("20 levels: the total is $120 = 40% of $300", paidByLevel.reduce((s, v) => s + v, 0) === 120);

    // ── rank rewards beyond Starter: Builder needs 50 + 50 and pays $300 on top of Starter's $150 ──
    const RB = wallet(); await activate(RB);
    for (let leg = 0; leg < 2; leg++) {
      let parent = RB;
      for (let i = 0; i < 50; i++) { const w = wallet(); await activate(w, parent); parent = w; }
    }
    const rbRewards = (await tx.earning.findMany({ where: { recipient: { walletAddress: RB }, type: "RANK_REWARD" }, orderBy: { level: "asc" } })).map((e) => Number(e.amountUsd));
    check("rank: 50 + 50 reaches Builder and pays Starter $150 + Builder $300, once each", (await userOf(RB)).currentRank === 2 && rbRewards.join(",") === "150,300", rbRewards.join(","));

    // ── withdrawals use up the balance exactly ──
    const rbUser = await userOf(RB);
    const before = await balanceOf(tx, rbUser.id);
    await tx.withdrawal.create({ data: { userId: rbUser.id, grossAmount: 100, feeAmount: 5, netAmount: 95, destinationWallet: RB } });
    const after = await balanceOf(tx, rbUser.id);
    check("withdrawal: a $100 request takes exactly $100 off the available balance", before.availableCents - after.availableCents === 10_000 && after.pendingCents === 10_000, `${before.availableCents} -> ${after.availableCents}`);

    // ── confirmed rule (owner, 2026-10-10): top-up / re-entry after the cap ──
    const topUp = (w: string, hash = txHash()) => processTopUp(tx, { walletAddress: w, transactionHash: hash, amountUsd: 300 });
    const S = wallet(), T = wallet();
    await activate(S); await activate(T, S);
    const tPkg1 = await pkgOf(T);
    await tx.package.update({ where: { id: tPkg1.id }, data: { totalEarned: 7500, status: "CAPPED" } });
    const sDirects = (await userOf(S)).activeDirectsCount, sVolume = (await userOf(S)).teamVolume;
    const tHash = txHash();
    const rTop = await topUp(T, tHash);
    const tPkgs = await tx.package.findMany({ where: { user: { walletAddress: T } }, orderBy: { createdAt: "asc" } });
    check("top-up: a capped member gets a new ACTIVE package with its own $7,500 cap", tPkgs.length === 2 && tPkgs[1].status === "ACTIVE" && Number(tPkgs[1].maxCapLimit) === 7500);
    check("top-up: the sponsor is paid the L1 $30 again", rTop.commissions.some((c) => c.wallet === S && c.level === 1 && c.amountUsd === 30));
    check("top-up: the sponsor gains no new direct, but +1 team volume (1 DAO)", (await userOf(S)).activeDirectsCount === sDirects && (await userOf(S)).teamVolume === sVolume + 1);
    check("top-up: same transaction twice is processed once", (await topUp(T, tHash)).alreadyProcessed);
    const rJoin = await activate(wallet(), T);
    const tNew = await tx.package.findUnique({ where: { id: tPkgs[1].id } });
    check("top-up: new income goes into the new package", rJoin.commissions.some((c) => c.wallet === T && c.amountUsd === 30) && Number(tNew!.totalEarned) === 30);
    let noPkg = false;
    try { await topUp(wallet()); } catch { noPkg = true; }
    check("top-up: refused for a wallet that never activated", noPkg);
    // an early top-up waits in line; a share that overflows the old cap spills into it
    const U = wallet(), V = wallet();
    await activate(U); await activate(V, U);
    const vPkg1 = await pkgOf(V);
    await tx.package.update({ where: { id: vPkg1.id }, data: { totalEarned: 7490 } });
    await topUp(V);
    const rSpill = await activate(wallet(), V);
    const vPkgs = await tx.package.findMany({ where: { user: { walletAddress: V } }, orderBy: { createdAt: "asc" } });
    check("top-up: $30 splits $10 into the old package (now CAPPED) + $20 into the next",
      rSpill.commissions.some((c) => c.wallet === V && c.amountUsd === 30) && vPkgs[0].status === "CAPPED" && Number(vPkgs[0].totalEarned) === 7500 && Number(vPkgs[1].totalEarned) === 20,
      `${vPkgs.map((p) => `${p.status}:${p.totalEarned}`).join(" / ")}`);

    // ── confirmed rule (owner, 2026-10-09): the company wallet is the ROOT ──
    // it sponsors without paying, gains directs and team volume, but never earns
    const ROOT = wallet();
    const savedRoot = env.COMPANY_WALLET_ADDRESS;
    env.COMPANY_WALLET_ADDRESS = ROOT;
    const M1 = wallet();
    const rM1 = await activate(M1, ROOT); // no root record yet: the engine creates it
    const root = await userOf(ROOT);
    check("root: a member joins under the company root without the root paying", rM1.sponsorLinked && (await userOf(M1)).uplineId === root.id);
    check("root: the root has no package and gets no level commission", !(await tx.package.findFirst({ where: { userId: root.id } })) && !rM1.commissions.some((c) => c.wallet === ROOT));
    check("root: its share is skipped (stays in the treasury)", rM1.skipped.some((s) => s.wallet === ROOT && s.reason === "no_package"));
    check("root: counts the active direct", root.activeDirectsCount === 1);
    for (let leg = 0; leg < 2; leg++) {
      let parent = leg === 0 ? M1 : ROOT;
      for (let i = leg === 0 ? 1 : 0; i < 25; i++) { const w = wallet(); await activate(w, parent); parent = w; }
    }
    const rootAfter = await userOf(ROOT);
    const rootRewards = await tx.earning.count({ where: { recipientId: root.id } });
    check("root: reaches Starter on 25 + 25 but is paid no rank reward", rootAfter.currentRank === 1 && rootRewards === 0, `rank ${rootAfter.currentRank}, earnings ${rootRewards}`);
    env.COMPANY_WALLET_ADDRESS = savedRoot;

    throw new Rollback();
  }, { timeout: 180_000, maxWait: 20_000 });
} catch (error) {
  if (!(error instanceof Rollback)) { failures++; console.error(error); }
} finally {
  await prisma.$disconnect();
}

console.log(failures ? `\n${failures} check(s) failed` : "\nAll plan checks passed (database rolled back, nothing saved).");
process.exit(failures ? 1 : 0);
