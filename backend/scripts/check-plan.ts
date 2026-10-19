/**
 * Plan check: runs real activations through the commission/rank engine against the
 * configured database inside ONE transaction that is always rolled back, so nothing is
 * left behind. Run: npm run check:plan
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { PrismaClient, type Prisma } from "@prisma/client";
import {
  linkUpline,
  placeMember,
  processActivation,
  processPlanEvents,
  processTopUp,
  uniqueReferralCode,
  type ActivationResult,
  type Side,
} from "../src/modules/activation/activation.engine.js";
import { rankForLegs, summarizeLegs, withdrawalSplit } from "../src/modules/plan/plan.js";
import { env } from "../src/config/env.js";
import { balanceOf, reservedPayout } from "../src/modules/withdrawals/withdrawals.service.js";

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
check(
  "matching: 25 + 25 legs is Starter (25 DAO on each side)",
  rankForLegs(summarizeLegs([25, 25])) === 1,
);
check(
  "matching: 13 + 13 legs is NOT Starter any more (old split rule)",
  rankForLegs(summarizeLegs([13, 13])) === 0,
);
check("matching: one 1000 leg alone ranks nothing", rankForLegs(summarizeLegs([1000])) === 0);
check(
  "matching: 100 + 100 legs is Leader, not Elite Leader",
  rankForLegs(summarizeLegs([100, 100])) === 3,
);
check("matching: 200 + 200 legs is Elite Leader", rankForLegs(summarizeLegs([200, 200])) === 4);
check(
  "matching: the power leg needs the full DAO too (30 power vs 24 other is not Starter)",
  rankForLegs(summarizeLegs([30, 24])) === 0,
);
check(
  "matching: other legs combine (25 + 12 + 13 is Starter)",
  rankForLegs(summarizeLegs([25, 12, 13])) === 1,
);
check(
  "Crown Ambassador needs 12,000 on each side",
  rankForLegs(summarizeLegs([12000, 11999])) === 8 &&
    rankForLegs(summarizeLegs([12000, 12000])) === 9,
);
const split = withdrawalSplit(10_000, 5);
check("5% fee on $100", split.feeCents === 500 && split.netCents === 9_500);

class Rollback extends Error {}

// every member without a sponsor joins the company root (owner, 2026-10-18): the checks run under a
// throw-away root so the real one is never touched
const savedCompanyRoot = env.COMPANY_WALLET_ADDRESS;
const TEST_ROOT = wallet();
env.COMPANY_WALLET_ADDRESS = TEST_ROOT;

try {
  await prisma.$transaction(
    async (tx: Prisma.TransactionClient) => {
      // the engine records the payment; the plan queue (same transaction here) pays the levels
      const withPlan = async (recorded: ActivationResult): Promise<ActivationResult> => {
        const batch = await processPlanEvents(tx, { lock: false });
        const mine = batch.events.find((e) => e.wallet === recorded.walletAddress);
        return {
          ...recorded,
          commissions: mine?.commissions ?? [],
          skipped: mine?.skipped ?? [],
          rankUps: batch.rankUps,
        };
      };
      const pkgOf = async (w: string) =>
        (await tx.package.findFirst({ where: { user: { walletAddress: w } } }))!;
      const userOf = async (w: string) =>
        (await tx.user.findUnique({ where: { walletAddress: w } }))!;
      const register = async (w: string) =>
        tx.user.create({
          data: { walletAddress: w, referralCode: await uniqueReferralCode(tx, w) },
        });
      // the website's join (users.joinTeam): invite code = sponsor, chosen side = placement spot
      const join = async (w: string, sponsor: string, side: Side) => {
        const me =
          (await tx.user.findUnique({ where: { walletAddress: w } })) ?? (await register(w));
        const sp = await userOf(sponsor);
        return (
          (await linkUpline(tx, me.id, sp.id)) && Boolean(await placeMember(tx, me.id, sp.id, side))
        );
      };
      // pays (on-chain sponsor = `sponsor`); with `side` the member joined on the website first,
      // without it the engine places it at the bottom of the sponsor's LEFT side
      const activate = async (w: string, sponsor = ZERO, hash = txHash(), side?: Side) => {
        if (side && sponsor !== ZERO) await join(w, sponsor, side);
        return withPlan(
          await processActivation(tx, {
            walletAddress: w,
            sponsorAddress: sponsor,
            transactionHash: hash,
            amountUsd: 300,
          }),
        );
      };

      // A (root) -> B, D ; B -> C
      const A = wallet(),
        B = wallet(),
        C = wallet(),
        D = wallet();
      await activate(A);
      const rB = await activate(B, A);
      check("B links to A", rB.sponsorLinked);
      check(
        "A earns L1 $30 from B",
        rB.commissions.length === 1 &&
          rB.commissions[0].amountUsd === 30 &&
          rB.commissions[0].wallet === A,
      );
      check("A has 1 active direct", (await userOf(A)).activeDirectsCount === 1);

      const rC = await activate(C, B);
      check(
        "B earns L1 $30 from C",
        rC.commissions.some((c) => c.wallet === B && c.level === 1 && c.amountUsd === 30),
      );
      check(
        "A's L2 is locked with 1 direct",
        rC.skipped.some((s) => s.wallet === A && s.level === 2 && s.reason === "level_locked"),
      );

      await activate(D, A);
      check("A now has 2 directs", (await userOf(A)).activeDirectsCount === 2);
      const E = wallet();
      const rE = await activate(E, C);
      check(
        "A's L3 still locked (needs 3 directs)",
        rE.skipped.some((s) => s.wallet === A && s.level === 3),
      );
      const F = wallet();
      const rF = await activate(F, B); // B L1, A L2 (A has 2 directs -> L2 open)
      check(
        "A earns L2 $15 once 2 directs",
        rF.commissions.some((c) => c.wallet === A && c.level === 2 && c.amountUsd === 15),
      );
      check("A team volume = 5", (await userOf(A)).teamVolume === 5);

      // idempotent replay
      const hash = txHash();
      const G = wallet();
      await activate(G, D, hash);
      const replay = await activate(G, D, hash);
      check(
        "same tx twice is processed once",
        replay.alreadyProcessed && replay.commissions.length === 0,
      );
      let dup = false;
      try {
        await activate(G, D);
      } catch {
        dup = true;
      }
      check("second package for same wallet refused", dup);

      // no known sponsor: the member joins under the company root (owner, 2026-10-18), which earns nothing
      const H = wallet();
      const rH = await activate(H, wallet());
      const testRoot = await userOf(TEST_ROOT);
      check(
        "no referral: a member with an unknown sponsor joins under the company root (Left)",
        rH.sponsorLinked &&
          (await userOf(H)).uplineId === testRoot.id &&
          (await userOf(H)).placementSide === "LEFT" &&
          rH.commissions.length === 0,
      );

      // 25x cap: A at $7,490 earns only $10 more, then is CAPPED and skipped
      const pkgA = await pkgOf(A);
      await tx.package.update({ where: { id: pkgA.id }, data: { totalEarned: 7490 } });
      const rI = await activate(wallet(), A);
      check(
        "cap: A paid only $10",
        rI.commissions.some((c) => c.wallet === A && c.amountUsd === 10),
      );
      check(
        "cap: A package is CAPPED at $7,500",
        (await pkgOf(A)).status === "CAPPED" && Number((await pkgOf(A)).totalEarned) === 7500,
      );
      const rJ = await activate(wallet(), A);
      check(
        "cap: capped A is skipped",
        rJ.skipped.some((s) => s.wallet === A && s.reason === "capped"),
      );

      // referral code collision: same first 6 hex chars
      const same1 = `0xabcdef${randomBytes(17).toString("hex")}`;
      const same2 = `0xabcdef${randomBytes(17).toString("hex")}`;
      const c1 = await activate(same1);
      const c2 = await activate(same2);
      check(
        "referral codes stay unique",
        c1.referralCode !== c2.referralCode,
        `${c1.referralCode} / ${c2.referralCode}`,
      );

      // rank: R with two legs of 25 -> Starter + $150 reward, once
      const R = wallet();
      await activate(R);
      // one leg on each side of R (each next member under the previous one)
      const buildLeg = async (size: number, side: Side) => {
        let parent = R;
        for (let i = 0; i < size; i++) {
          const w = wallet();
          await activate(w, parent, txHash(), i === 0 ? side : undefined);
          parent = w;
        }
      };
      await buildLeg(25, "LEFT");
      await buildLeg(24, "RIGHT");
      check("rank: 25 + 24 is not Starter yet", (await userOf(R)).currentRank === 0);
      const last = wallet();
      const lastLegHead = await tx.user.findMany({
        where: { upline: { walletAddress: R } },
        orderBy: { teamVolume: "asc" },
        take: 1,
      });
      const rRank = await activate(last, lastLegHead[0].walletAddress);
      check(
        "rank: 25 + 25 makes R Starter",
        (await userOf(R)).currentRank === 1,
        JSON.stringify(rRank.rankUps.filter((u) => u.wallet === R)),
      );
      const rewards = await tx.earning.findMany({
        where: { recipient: { walletAddress: R }, type: "RANK_REWARD" },
      });
      check(
        "rank: Starter reward $150 paid once",
        rewards.length === 1 && Number(rewards[0].amountUsd) === 150,
      );

      // ── confirmed rule: a level is never back-paid once it unlocks ──
      const P = wallet();
      await activate(P);
      const P1 = wallet();
      await activate(P1, P); // P has 1 direct: L2 locked
      await activate(wallet(), P1); // L2 member for P while locked -> skipped
      await activate(wallet(), P); // 2nd direct: L2 unlocks now
      const l2Before = await tx.earning.count({
        where: { recipient: { walletAddress: P }, level: 2 },
      });
      check(
        "no back-pay: L2 earns nothing for the member who joined while it was locked",
        l2Before === 0,
      );
      await activate(wallet(), P1); // new L2 member after unlock
      const l2After = await tx.earning.findMany({
        where: { recipient: { walletAddress: P }, level: 2 },
      });
      check(
        "no back-pay: only the new L2 member pays $15",
        l2After.length === 1 && Number(l2After[0].amountUsd) === 15,
      );

      // ── confirmed rule (owner, 2026-10-18): rank rewards count toward the 25x cap too ──
      const Q = wallet();
      await activate(Q);
      const pkgQ = await pkgOf(Q);
      await tx.package.update({
        where: { id: pkgQ.id },
        data: { totalEarned: 7500, status: "CAPPED" },
      });
      for (const side of ["LEFT", "RIGHT"] as const) {
        let parent = Q;
        for (let i = 0; i < 25; i++) {
          const w = wallet();
          await activate(w, parent, txHash(), i === 0 ? side : undefined);
          parent = w;
        }
      }
      const qRewards = await tx.earning.findMany({
        where: { recipient: { walletAddress: Q }, type: "RANK_REWARD" },
      });
      const qLevel = await tx.earning.count({
        where: { recipient: { walletAddress: Q }, type: "LEVEL_COMMISSION" },
      });
      check(
        "inside cap: a CAPPED member reaches Starter but gets no rank reward",
        (await userOf(Q)).currentRank === 1 && qRewards.length === 0,
      );
      check("inside cap: the capped member gets no more level income", qLevel === 0);
      check(
        "inside cap: total earnings stay at exactly $7,500",
        Number((await pkgOf(Q)).totalEarned) === 7500,
      );

      // ── every level pays its exact share: L1 $30, L2 $15, L3–4 $9, L5–7 $6, L8–20 $3 = $120 (40%) ──
      const chainUp: string[] = [];
      for (let i = 0; i < 20; i++) {
        const w = wallet();
        await activate(w, chainUp[i - 1] ?? ZERO);
        chainUp.push(w);
      }
      // 15 directs each: every level open (the directs themselves are not needed for the payout maths)
      await tx.user.updateMany({
        where: { walletAddress: { in: chainUp } },
        data: { activeDirectsCount: 15 },
      });
      const rDeep = await activate(wallet(), chainUp[19]);
      const expected = [30, 15, 9, 9, 6, 6, 6, ...Array(13).fill(3)];
      const paidByLevel = expected.map(
        (_, i) =>
          rDeep.commissions.find((c) => c.level === i + 1 && c.wallet === chainUp[19 - i])
            ?.amountUsd ?? 0,
      );
      check(
        "20 levels: each upline is paid its exact share",
        paidByLevel.every((v, i) => v === expected[i]),
        paidByLevel.join(","),
      );
      check(
        "20 levels: the total is $120 = 40% of $300",
        paidByLevel.reduce((s, v) => s + v, 0) === 120,
      );

      // ── rank rewards beyond Starter: Builder needs 50 + 50 and pays $300 on top of Starter's $150 ──
      const RB = wallet();
      await activate(RB);
      for (const side of ["LEFT", "RIGHT"] as const) {
        let parent = RB;
        for (let i = 0; i < 50; i++) {
          const w = wallet();
          await activate(w, parent, txHash(), i === 0 ? side : undefined);
          parent = w;
        }
      }
      const rbRewards = (
        await tx.earning.findMany({
          where: { recipient: { walletAddress: RB }, type: "RANK_REWARD" },
          orderBy: { level: "asc" },
        })
      ).map((e) => Number(e.amountUsd));
      check(
        "rank: 50 + 50 reaches Builder and pays Starter $150 + Builder $300, once each",
        (await userOf(RB)).currentRank === 2 && rbRewards.join(",") === "150,300",
        rbRewards.join(","),
      );

      // ── withdrawals use up the balance exactly ──
      const rbUser = await userOf(RB);
      const before = await balanceOf(tx, rbUser.id);
      await tx.withdrawal.create({
        data: {
          userId: rbUser.id,
          grossAmount: 100,
          feeAmount: 5,
          netAmount: 95,
          destinationWallet: RB,
        },
      });
      const after = await balanceOf(tx, rbUser.id);
      check(
        "withdrawal: a $100 request takes exactly $100 off the available balance",
        before.availableCents - after.availableCents === 10_000 && after.pendingCents === 10_000,
        `${before.availableCents} -> ${after.availableCents}`,
      );

      // ── confirmed rule (owner, 2026-10-10): top-up / re-entry after the cap ──
      const topUp = async (w: string, hash = txHash()) =>
        withPlan(
          await processTopUp(tx, { walletAddress: w, transactionHash: hash, amountUsd: 300 }),
        );
      const S = wallet(),
        T = wallet();
      await activate(S);
      await activate(T, S);
      const tPkg1 = await pkgOf(T);
      await tx.package.update({
        where: { id: tPkg1.id },
        data: { totalEarned: 7500, status: "CAPPED" },
      });
      const sDirects = (await userOf(S)).activeDirectsCount,
        sVolume = (await userOf(S)).teamVolume;
      const tHash = txHash();
      const rTop = await topUp(T, tHash);
      const tPkgs = await tx.package.findMany({
        where: { user: { walletAddress: T } },
        orderBy: { createdAt: "asc" },
      });
      check(
        "top-up: a capped member gets a new ACTIVE package with its own $7,500 cap",
        tPkgs.length === 2 && tPkgs[1].status === "ACTIVE" && Number(tPkgs[1].maxCapLimit) === 7500,
      );
      check(
        "top-up: the sponsor is paid the L1 $30 again",
        rTop.commissions.some((c) => c.wallet === S && c.level === 1 && c.amountUsd === 30),
      );
      check(
        "top-up: the sponsor gains no new direct, but +1 team volume (1 DAO)",
        (await userOf(S)).activeDirectsCount === sDirects &&
          (await userOf(S)).teamVolume === sVolume + 1,
      );
      check(
        "top-up: same transaction twice is processed once",
        (await topUp(T, tHash)).alreadyProcessed,
      );
      const rJoin = await activate(wallet(), T);
      const tNew = await tx.package.findUnique({ where: { id: tPkgs[1].id } });
      check(
        "top-up: new income goes into the new package",
        rJoin.commissions.some((c) => c.wallet === T && c.amountUsd === 30) &&
          Number(tNew!.totalEarned) === 30,
      );
      let noPkg = false;
      try {
        await topUp(wallet());
      } catch {
        noPkg = true;
      }
      check("top-up: refused for a wallet that never activated", noPkg);
      // an early top-up waits in line; a share that overflows the old cap spills into it
      const U = wallet(),
        V = wallet();
      await activate(U);
      await activate(V, U);
      const vPkg1 = await pkgOf(V);
      await tx.package.update({ where: { id: vPkg1.id }, data: { totalEarned: 7490 } });
      await topUp(V);
      const rSpill = await activate(wallet(), V);
      const vPkgs = await tx.package.findMany({
        where: { user: { walletAddress: V } },
        orderBy: { createdAt: "asc" },
      });
      check(
        "top-up: $30 splits $10 into the old package (now CAPPED) + $20 into the next",
        rSpill.commissions.some((c) => c.wallet === V && c.amountUsd === 30) &&
          vPkgs[0].status === "CAPPED" &&
          Number(vPkgs[0].totalEarned) === 7500 &&
          Number(vPkgs[1].totalEarned) === 20,
        `${vPkgs.map((p) => `${p.status}:${p.totalEarned}`).join(" / ")}`,
      );

      // ── confirmed rule (owner, 2026-10-09): the company wallet is the ROOT ──
      // it sponsors without paying, gains directs and team volume, but never earns
      const ROOT = wallet();
      const savedRoot = env.COMPANY_WALLET_ADDRESS;
      env.COMPANY_WALLET_ADDRESS = ROOT;
      const M1 = wallet();
      const rM1 = await activate(M1, ROOT); // no root record yet: the engine creates it
      const root = await userOf(ROOT);
      check(
        "root: a member joins under the company root without the root paying",
        rM1.sponsorLinked && (await userOf(M1)).uplineId === root.id,
      );
      check(
        "root: the root has no package and gets no level commission",
        !(await tx.package.findFirst({ where: { userId: root.id } })) &&
          !rM1.commissions.some((c) => c.wallet === ROOT),
      );
      check(
        "root: its share is skipped (stays in the treasury)",
        rM1.skipped.some((s) => s.wallet === ROOT && s.reason === "no_package"),
      );
      check("root: counts the active direct", root.activeDirectsCount === 1);
      for (let leg = 0; leg < 2; leg++) {
        let parent = leg === 0 ? M1 : ROOT;
        for (let i = leg === 0 ? 1 : 0; i < 25; i++) {
          const w = wallet();
          await activate(w, parent, txHash(), leg === 1 && i === 0 ? "RIGHT" : undefined);
          parent = w;
        }
      }
      const rootAfter = await userOf(ROOT);
      const rootRewards = await tx.earning.count({ where: { recipientId: root.id } });
      check(
        "root: reaches Starter on 25 + 25 but is paid no rank reward",
        rootAfter.currentRank === 1 && rootRewards === 0,
        `rank ${rootAfter.currentRank}, earnings ${rootRewards}`,
      );
      env.COMPANY_WALLET_ADDRESS = savedRoot;

      // ── confirmed rule (owner, 2026-10-13): pre-launch teams, unpaid sponsors ──
      // invite links build the tree before anyone pays; an unpaid sponsor's share stays with the company
      const plP = wallet(),
        plQ = wallet(),
        plS = wallet();
      await activate(plP);
      const plq = await register(plQ),
        pls = await register(plS);
      check("pre-launch: unpaid Q joins under paid P by invite link", await join(plQ, plP, "LEFT"));
      check("pre-launch: unpaid S joins under unpaid Q", await join(plS, plQ, "LEFT"));
      check(
        "pre-launch: a loop is refused (Q under its own member S)",
        !(await linkUpline(tx, plq.id, pls.id)) &&
          (await userOf(plQ)).uplineId === (await userOf(plP)).id,
      );
      const rPlS = await activate(plS, plQ);
      check(
        "unpaid sponsor: S pays first and keeps Q as its sponsor",
        rPlS.sponsorLinked && (await userOf(plS)).uplineId === plq.id,
      );
      check(
        "unpaid sponsor: Q's L1 share stays with the company",
        rPlS.skipped.some((e) => e.wallet === plQ && e.reason === "no_package") &&
          !rPlS.commissions.some((c) => c.wallet === plQ),
      );
      check(
        "unpaid sponsor: Q counts S as an active direct, P gets +1 team volume",
        (await userOf(plQ)).activeDirectsCount === 1 && (await userOf(plP)).teamVolume === 1,
        `Q directs ${(await userOf(plQ)).activeDirectsCount}, P volume ${(await userOf(plP)).teamVolume}`,
      );
      const rPlQ = await activate(plQ, plP);
      check(
        "unpaid sponsor: Q pays later, keeps its upline P, P earns L1 $30",
        rPlQ.commissions.some((c) => c.wallet === plP && c.level === 1 && c.amountUsd === 30),
      );
      const earlyShare = await tx.earning.count({
        where: { recipient: { walletAddress: plQ }, source: { walletAddress: plS } },
      });
      check("unpaid sponsor: Q gets nothing back from S's earlier payment", earlyShare === 0);
      // ── plan queue (owner, 2026-10-13: launch-day scaling) ──
      // a burst of payments is only recorded; one batch then pays them in order and writes each upline once
      const B0 = wallet();
      await activate(B0);
      const burst = [wallet(), wallet(), wallet()];
      for (const w of burst)
        await processActivation(tx, {
          walletAddress: w,
          sponsorAddress: B0,
          transactionHash: txHash(),
          amountUsd: 300,
        });
      const b0Before = await userOf(B0);
      check(
        "queue: recorded payments change nothing until the queue runs",
        b0Before.activeDirectsCount === 0 &&
          b0Before.teamVolume === 0 &&
          (await tx.package.count({
            where: { user: { walletAddress: { in: burst } }, countedAt: null },
          })) === 3,
      );
      const burstBatch = await processPlanEvents(tx, { lock: false });
      const b0After = await userOf(B0);
      const b0Paid = burstBatch.events
        .flatMap((e) => e.commissions)
        .filter((c) => c.wallet === B0)
        .reduce((s, c) => s + c.amountUsd, 0);
      check(
        "queue: one batch pays all three in order (3 directs, 3 DAO, 3 x L1 $30)",
        burstBatch.processed === 3 &&
          b0After.activeDirectsCount === 3 &&
          b0After.teamVolume === 3 &&
          b0Paid === 90,
        `paid $${b0Paid}`,
      );
      check(
        "queue: every package is counted and nothing is left waiting",
        (await tx.package.count({
          where: { user: { walletAddress: { in: burst } }, countedAt: null },
        })) === 0 && (await tx.planEvent.count({ where: { processedAt: null } })) === 0,
      );

      // ── on-chain sponsor differs from the invite link (owner review, 2026-10-14) ──
      const SA = wallet(),
        SB = wallet(),
        SM = wallet(),
        SN = wallet(),
        SC = wallet();
      await activate(SA);
      await activate(SB);
      const sm = await register(SM),
        sn = await register(SN);
      await linkUpline(tx, sm.id, (await userOf(SA)).id); // SM's invite link: SA
      const rSM = await activate(SM, SB); // ...but SM pays on-chain under SB
      check(
        "chain sponsor: an unpaid team follows the on-chain sponsor",
        rSM.sponsorMismatch === "moved" && (await userOf(SM)).uplineId === (await userOf(SB)).id,
      );
      await linkUpline(tx, sn.id, (await userOf(SA)).id); // SN under SA, and SC (paid) under SN
      await activate(SC, SN);
      const rSN = await activate(SN, SB); // SN pays under SB, but its team already paid
      check(
        "chain sponsor: a team that already paid keeps the recorded tree",
        rSN.sponsorMismatch === "kept" && (await userOf(SN)).uplineId === (await userOf(SA)).id,
      );

      // ── withdrawal reservations (owner review, 2026-10-14) ──
      const RW = await userOf(SA);
      const base = await reservedPayout(tx);
      const mk = (data: Partial<Prisma.WithdrawalUncheckedCreateInput>) =>
        tx.withdrawal.create({
          data: {
            userId: RW.id,
            grossAmount: 10,
            feeAmount: 0.5,
            netAmount: 9.5,
            destinationWallet: RW.walletAddress,
            ...data,
          } as Prisma.WithdrawalUncheckedCreateInput,
        });
      const now = Date.now();
      await mk({
        status: "PROCESSING",
        voucherId: txHash(),
        voucherAmount: "100",
        voucherDeadline: new Date(now + 600_000),
      }); // open: counts
      await mk({
        status: "PROCESSING",
        voucherId: txHash(),
        voucherAmount: "1000",
        voucherDeadline: new Date(now - 600_000),
      }); // expired: no
      await mk({ status: "PENDING", voucherAmount: "10" }); // being signed: counts
      await mk({ status: "PENDING", voucherAmount: "5000", createdAt: new Date(now - 3_600_000) }); // stale unsigned: no
      await mk({
        status: "COMPLETED",
        voucherId: txHash(),
        voucherAmount: "7",
        voucherDeadline: new Date(now + 600_000),
      }); // paid: no
      check(
        "withdrawals: open and in-signing vouchers are reserved, expired / stale / paid ones are not",
        (await reservedPayout(tx)) - base === 110n,
        `${(await reservedPayout(tx)) - base}`,
      );
      // 2nd review: a voucher claimed AND settled after the chain was read is missing from the chain numbers too
      const readAt = new Date(now - 10_000);
      const beforeRead = await reservedPayout(tx, readAt);
      await mk({
        status: "COMPLETED",
        voucherId: txHash(),
        voucherAmount: "40",
        voucherDeadline: new Date(now + 600_000),
        reviewedAt: new Date(now),
      }); // settled after the read: counts
      await mk({
        status: "COMPLETED",
        voucherId: txHash(),
        voucherAmount: "900",
        voucherDeadline: new Date(now - 3_000_000),
        reviewedAt: new Date(now - 3_600_000),
      }); // settled long before: no
      check(
        "withdrawals: a voucher settled after the chain read is still counted",
        (await reservedPayout(tx, readAt)) - beforeRead === 40n,
        `${(await reservedPayout(tx, readAt)) - beforeRead}`,
      );

      // a wallet registered with no sponsor whose team already paid: joining moves that business up
      const plX = wallet(),
        plY = wallet();
      await register(plX);
      await activate(plY, plX);
      const pVolume = (await userOf(plP)).teamVolume;
      await join(plX, plP, "LEFT");
      check(
        "late join: X's team business (1) moves up to P",
        (await userOf(plP)).teamVolume === pVolume + 1,
        `${pVolume} -> ${(await userOf(plP)).teamVolume}`,
      );

      // ── binary placement (owner, 2026-10-17): the RAM / ALOK example ──
      // RAM's Left chain A > B > C > D, Right chain E > F > G > H (each sponsored by the one above)
      const RAM = wallet();
      await activate(RAM);
      const chainOf = async (side: Side) => {
        const ids: string[] = [];
        for (let i = 0; i < 4; i++) {
          const w = wallet();
          await activate(w, ids[i - 1] ?? RAM, txHash(), i === 0 ? side : undefined);
          ids.push(w);
        }
        return ids;
      };
      const [bA, bB, bC, bD] = await chainOf("LEFT");
      const [bE] = await chainOf("RIGHT");
      const leftOf = async (w: string) => (await userOf(w)).leftVolume;
      const leftBefore = await Promise.all([bD, bC, bB, bA, RAM].map(leftOf));
      const eBefore = await userOf(bE);
      const ALOK = wallet();
      const rAlok = await activate(ALOK, RAM, txHash(), "LEFT");
      const alok = await userOf(ALOK);
      check(
        "binary: ALOK (RAM's link, Left) is placed at the bottom of RAM's Left side, under D",
        alok.placementId === (await userOf(bD)).id &&
          alok.placementSide === "LEFT" &&
          alok.uplineId === (await userOf(RAM)).id,
      );
      check(
        "binary: RAM has 3 directs (A, E, ALOK) whatever their placement",
        (await userOf(RAM)).activeDirectsCount === 3,
      );
      check(
        "binary: ALOK's level income goes to RAM only (L1 $30), never to A, B, C, D",
        rAlok.commissions.length === 1 &&
          rAlok.commissions[0].wallet === RAM &&
          rAlok.commissions[0].amountUsd === 30 &&
          (await tx.earning.count({
            where: {
              source: { walletAddress: ALOK },
              recipient: { walletAddress: { in: [bA, bB, bC, bD] } },
            },
          })) === 0,
      );
      const leftAfter = await Promise.all([bD, bC, bB, bA, RAM].map(leftOf));
      check(
        "binary: ALOK's business is +1 DAO on the Left of D, C, B, A and RAM",
        leftAfter.every((v, i) => v === leftBefore[i] + 1),
        `${leftBefore.join(",")} -> ${leftAfter.join(",")}`,
      );
      check(
        "binary: the Right side (E) is untouched",
        (await userOf(bE)).teamVolume === eBefore.teamVolume,
      );
      // Example 2: NEHA joins with ALOK's link on the Right
      const NEHA = wallet();
      const aBefore = await userOf(ALOK);
      const rNeha = await activate(NEHA, ALOK, txHash(), "RIGHT");
      check(
        "binary: NEHA sits on ALOK's Right",
        (await userOf(NEHA)).placementId === alok.id &&
          (await userOf(NEHA)).placementSide === "RIGHT",
      );
      check(
        "binary: NEHA pays ALOK L1 $30 and RAM L2 $15 (sponsor tree), nothing to A, B, C, D",
        rNeha.commissions.some((c) => c.wallet === ALOK && c.level === 1 && c.amountUsd === 30) &&
          rNeha.commissions.some((c) => c.wallet === RAM && c.level === 2 && c.amountUsd === 15) &&
          !rNeha.commissions.some((c) => [bA, bB, bC, bD].includes(c.wallet)),
      );
      check(
        "binary: NEHA counts on ALOK's RIGHT but on the LEFT of D ... RAM",
        (await userOf(ALOK)).rightVolume === aBefore.rightVolume + 1 &&
          (await leftOf(bD)) === leftAfter[0] + 1 &&
          (await leftOf(RAM)) === leftAfter[4] + 1,
      );
      // spillover continues below ALOK; a spot is taken once
      const NEXT = wallet();
      await activate(NEXT, RAM, txHash(), "LEFT");
      check(
        "binary: the next Left joiner under RAM goes below ALOK",
        (await userOf(NEXT)).placementId === alok.id &&
          (await userOf(NEXT)).placementSide === "LEFT",
      );
      check(
        "binary: a placed member cannot move (the spot is permanent)",
        (await placeMember(tx, alok.id, (await userOf(RAM)).id, "RIGHT")) === null &&
          (await userOf(ALOK)).placementId === alok.placementId,
      );
      check(
        "binary: one member per spot (D's Left is ALOK only)",
        (await tx.user.count({
          where: { placementId: (await userOf(bD)).id, placementSide: "LEFT" },
        })) === 1,
      );
      // a direct contract payment without joining on the website: bottom of the sponsor's Left
      const DIRECT = wallet();
      await activate(DIRECT, bE);
      check(
        "binary: paying without choosing a side places the member on the sponsor's Left",
        (await userOf(DIRECT)).placementSide === "LEFT",
      );

      // ── fast-start bonus (owner, 2026-10-18): 10 paid directs within 3 days $100, within 7 days $50 ──
      const tenDirects = async (sponsor: string) => {
        for (let i = 0; i < 10; i++) await activate(wallet(), sponsor);
      };
      const bonusOf = async (w: string) =>
        tx.earning.findMany({
          where: { recipient: { walletAddress: w }, type: "FAST_START_BONUS" },
        });
      const backdate = async (w: string, days: number) =>
        tx.package.update({
          where: { id: (await pkgOf(w)).id },
          data: { paidAt: new Date(Date.now() - days * 86_400_000) },
        });
      const FS3 = wallet();
      await activate(FS3);
      for (let i = 0; i < 9; i++) await activate(wallet(), FS3);
      check("fast start: 9 directs pay no bonus yet", (await bonusOf(FS3)).length === 0);
      await activate(wallet(), FS3);
      const fs3 = await bonusOf(FS3);
      check(
        "fast start: the 10th direct within 3 days pays the Rocket Start Bonus $100 at once",
        fs3.length === 1 && fs3[0].level === 3 && Number(fs3[0].amountUsd) === 100,
      );
      await activate(wallet(), FS3);
      check(
        "fast start: only one bonus per member ($100, never $100 + $50)",
        (await bonusOf(FS3)).length === 1,
      );
      const FS7 = wallet();
      await activate(FS7);
      await backdate(FS7, 5);
      await tenDirects(FS7);
      const fs7 = await bonusOf(FS7);
      check(
        "fast start: 10 directs on day 5 pay the Fast Start Bonus $50",
        fs7.length === 1 && fs7[0].level === 7 && Number(fs7[0].amountUsd) === 50,
      );
      const FSL = wallet();
      await activate(FSL);
      await backdate(FSL, 8);
      await tenDirects(FSL);
      check("fast start: 10 directs after 7 days pay nothing", (await bonusOf(FSL)).length === 0);
      // the clock is the ON-CHAIN payment time (owner, 2026-10-18): paid 4 days ago, recorded only now
      const FSO = wallet();
      await withPlan(await processActivation(tx, { walletAddress: FSO, sponsorAddress: ZERO, transactionHash: txHash(), amountUsd: 300, paidAt: new Date(Date.now() - 4 * 86_400_000) }));
      await tenDirects(FSO);
      const fso = await bonusOf(FSO);
      check("fast start: counted from the on-chain payment time (paid 4 days ago, recorded late) = $50, not $100",
        fso.length === 1 && fso[0].level === 7 && Number(fso[0].amountUsd) === 50);
      // only directs who paid AFTER the member's own payment count (owner 2026-10-19): A stays unpaid
      // while 10 directs pay under its link, then A activates -> no bonus; 10 new directs -> $100
      const FSE = wallet();
      await register(FSE);
      const early: string[] = [];
      for (let i = 0; i < 10; i++) {
        const d = wallet();
        early.push(d);
        await activate(d, FSE);
      }
      await tx.package.updateMany({
        where: { user: { walletAddress: { in: early } } },
        data: { paidAt: new Date(Date.now() - 3_600_000) },
      });
      await activate(FSE);
      check(
        "fast start: 10 directs who paid BEFORE the member activated do not count (no bonus)",
        (await bonusOf(FSE)).length === 0,
      );
      await tenDirects(FSE);
      const fse = await bonusOf(FSE);
      check(
        "fast start: 10 directs paying after the member activated pay the Rocket Start Bonus $100",
        fse.length === 1 && fse[0].level === 3 && Number(fse[0].amountUsd) === 100,
      );
      // inside the 25x cap: $7,170 + 10 x L1 $30 = $7,470, so only $30 of the $100 fits
      const FSC = wallet();
      await activate(FSC);
      await tx.package.update({
        where: { id: (await pkgOf(FSC)).id },
        data: { totalEarned: 7170 },
      });
      await tenDirects(FSC);
      const fsc = await bonusOf(FSC);
      check(
        "fast start: the bonus fills only what is left of the 25x cap ($30 of $100)",
        fsc.length === 1 &&
          Number(fsc[0].amountUsd) === 30 &&
          Number((await pkgOf(FSC)).totalEarned) === 7500 &&
          (await pkgOf(FSC)).status === "CAPPED",
        `${fsc.map((e) => e.amountUsd).join(",")} / ${(await pkgOf(FSC)).totalEarned}`,
      );
      const fscTotal = await tx.earning.aggregate({
        where: { recipient: { walletAddress: FSC } },
        _sum: { amountUsd: true },
      });
      check(
        "25x cap: only $330 more was credited ($7,170 -> $7,500), never past the cap",
        Number(fscTotal._sum.amountUsd) === 330,
        String(fscTotal._sum.amountUsd),
      );

      // ── caps add up (owner, 2026-10-18): every package adds $7,500; income fills them oldest first ──
      const CU = wallet();
      await activate(CU);
      await tx.package.update({ where: { id: (await pkgOf(CU)).id }, data: { totalEarned: 7450 } });
      await topUp(CU); // a second package while the first still has room
      await tenDirects(CU);
      const cuPkgs = await tx.package.findMany({
        where: { user: { walletAddress: CU } },
        orderBy: { createdAt: "asc" },
      });
      const cuBonus = await bonusOf(CU);
      check(
        "caps add up: two packages hold $15,000; L1 income fills the first to $7,500 and spills into the second",
        cuPkgs[0].status === "CAPPED" &&
          Number(cuPkgs[0].totalEarned) === 7500 &&
          cuPkgs[1].status === "ACTIVE",
        cuPkgs.map((p) => `${p.status}:${p.totalEarned}`).join(" / "),
      );
      check(
        "caps add up: the $100 bonus is paid in full from the second package's room",
        cuBonus.length === 1 &&
          Number(cuBonus[0].amountUsd) === 100 &&
          Number(cuPkgs[1].totalEarned) === 350,
        String(cuPkgs[1].totalEarned),
      );

      throw new Rollback();
    },
    { timeout: 600_000, maxWait: 20_000 },
  );
} catch (error) {
  if (!(error instanceof Rollback)) {
    failures++;
    console.error(error);
  }
} finally {
  env.COMPANY_WALLET_ADDRESS = savedCompanyRoot;
  await prisma.$disconnect();
}

console.log(
  failures
    ? `\n${failures} check(s) failed`
    : "\nAll plan checks passed (database rolled back, nothing saved).",
);
process.exit(failures ? 1 : 0);
