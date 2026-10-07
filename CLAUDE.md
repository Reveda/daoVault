# DAOvault AI — Project Map

Web3 referral/affiliate reward dApp on **BNB Smart Chain (BEP-20)**. Users connect a wallet, pay a fixed **$300 USDT** activation via a smart contract, and earn from referrals. Full business spec: `project.md`. Contract deploy/test guide: `smartcontract-payment.md`. Read those only when the task needs plan details.
**Build status, decisions, setup:** `document.md` (keep it updated when features land).
**Design/UX reference:** TPR World (tprworld.org). Its full code teardown (design tokens, sections, 3D scene, wallet flow, API, what not to copy) is in `tpr-reference.md`. Read it for UI, wallet or dashboard work instead of re-fetching the site.

## Business rules (summary)
- $300 fixed package, no passive ROI. 40% ($120) paid across 20 upline levels (L1 10%, L2 5%, L3-4 3%, L5-7 2%, L8-20 1%), levels unlock by direct-referral count (15 directs unlocks all 20).
- 11 rank tiers (Starter 25 DAO/$100 ... Crown Ambassador 12,000/$30,000 ... Crown President 50,000 DAO/$100,000); 1 DAO = 1 activated package; max 50% of volume from one leg. Single source: backend/src/modules/plan/plan.ts.
- Earnings cap 10x ($3,000) per package; 5% withdrawal fee.
- Referral: `?ref=CODE` saved to `localStorage['daovault_pending_ref']`. Codes are `DV` + first 6 hex chars of wallet (longer if taken; the server value wins).

## Layout
```
contracts/DAOvaultActivation.sol   Solidity 0.8.20. activate(sponsor) pulls USDT via transferFrom -> immutable treasury,
                                   emits Activated(user, sponsor, amount, timestamp). Sponsor must be activated. Commissions are off-chain.
backend/   Node + Express 5 + TypeScript (ESM, .js import suffixes) + Prisma 6 + PostgreSQL + zod 4 + ethers 6. Port 5000.
  src/app.ts               middleware + router mounting (prefix /api/v1)
  src/config/env.ts        zod-validated env (contract addrs optional)
  src/modules/<name>/      routes -> controller -> service -> repository pattern
    health      GET  /health
    users       GET  /users/:walletAddress
    dashboard   GET  /dashboard/:walletAddress
    activation  POST /activation/verify  (verifies tx + Activated event on-chain, then activation.engine.ts processActivation:
                directs, 20-level commissions w/ unlock + 10x cap, team volume, 50:50 ranks + rank rewards; serializable tx)
    users       GET  /users/referral/:code  (invite code -> sponsor wallet)
    auth        POST /auth/challenge, /auth/verify (wallet signature -> JWT; middlewares/auth.ts requireAuth/requireAdmin)
    withdrawals GET/POST /withdrawals (member) ; /admin/stats, /admin/withdrawals[/:id/approve|reject|complete]
                (ADMIN_WALLETS; complete verifies the USDT payout on-chain; no private keys on the server)
                instant: withdrawals/payout.ts signs EIP-712 vouchers for contracts/DAOvaultPayout.sol (member claims,
                POST /withdrawals/:id/confirm verifies Claimed). PAYOUT_SIGNER_TESTNET_KEY is a testnet-only exception
                (env.ts refuses it unless chain 97); mainnet needs a KMS signer. Contract tests: contracts/test/
  src/modules/plan/plan.ts  LEVELS, RANKS, 50:50 rankForLegs, cents helpers
  src/config/transaction.ts serializable() retry wrapper for money writes
  scripts/check-plan.ts    npm run check:plan: 32 engine checks (incl. owner-confirmed rules) on the real DB, always rolled back
  prisma/schema.prisma     User (teamVolume), Package, Earning (LEVEL_COMMISSION|RANK_REWARD), Withdrawal (review fields), AuthNonce
  prisma/seed.ts           local dashboard fixture (SEED_WALLET_ADDRESS)
frontend/  Vite 6 + vanilla TypeScript (no framework), three.js, gsap, lottie-web, vanta, ethers 6. Port 3000, proxies /api -> :5000.
  index.html -> src/scripts/app.ts        landing page (3D scene, rank cards, wallet picker)
  dashboard.html -> src/scripts/dashboard.ts  user dashboard (live API data, legs, income, withdraw w/ wallet sign-in)
  admin.html -> src/scripts/admin.ts      withdrawal queue for ADMIN_WALLETS
  scripts: core.ts (referral capture, preloader, countUp, reveal stagger, toast), wallet.ts (EIP-6963, BSC switch, reconnect),
           payment.ts (resolveSponsor, approve + activate + POST verify, retry pending), api.ts (backend calls),
           trophy3d.ts (our own three.js Apex trophy), walletDialog3D.ts, rankGameCard.ts (RANK_DATA), matrixAutoDeck.ts, scrollAnimations.ts (GSAP per section,
           matrix card-stack deck), types.ts
  Motion layer (TPR + iorca inspired, DAOvault identity; see tpr-reference.md):
    particleScene.ts  one morphing gold particle cloud + lightning; hero = loose dust, sections re-form it into the
                      DAOvault logo sampled from public/assets/DAOlogo.jpg ('logo' | 'mark' | 'dial'); SCENE_STATES maps
                      [data-scene] -> shape; shapes anchor into `.scene-slot` divs beside headings (hidden < 1180px)
    scene.ts          init3DScene() wires the particle scene; hero shows ONLY the animated DAOVAULT logo (dvLogo.ts).
    dvLogo.ts         the owner's logo animation (public/DAOVault logo animation.html) as a component: [data-dv-logo="full|mark"]
                      in splash, header, footer, hero, rank medallion, quiz. Splash uses a 5s cycle while core.ts
                      bootPreloader counts every number 1..100% over SPLASH_MS.
    quiz.ts           "Crack the Vault" quiz above the footer (gold/red answers, 3D coins, canvas lightning, data-scene quiz)
    rankEmblem.ts     #ranks card medallion (11-segment ring, DV coin flip, sparks)
    coinWalletLottie.ts  hero: wallet plays in a round badge inside the Connect button, then the badge opens into the
                      full button (.is-ready) and Explore slides in; coins swirl every 5s.
                      The final CTA has no wallet animation (owner removed it).
    landingFx.ts      nav scrollspy, "How to Join" progress rail / lit steps, initDropCards() ([data-drop] cards fall
                      from above then their .drop-body unfolds; used by the #vision DAO + VAULT = DAOVAULT cards); initJoinSteps(): #how expanding step
                      cards (one open at a time, auto-advance, progress stage)
  Also: preloader + header/footer brand use the DAOvault logo images (DAOlogo.jpg / favicon.png); loader counts 1%..100%;
  #how stage has electric arcs (landingFx electrifyStage); signal cards flip in/out on phones (initSignalCardFlips);
  countdown digits drop in; gold buttons sheen; on phones the compare table and dashboard 20-level table become cards.
  Brand copy: "DAOVAULT — Where Communities Build Wealth Together" (hero, #vision, CTA, footer, meta).
  Mobile: audited at 360/390/768/1024 with no horizontal overflow; see "Mobile hardening" block at end of main.css.
  GSAP cleanup must clear only animated props (ANIMATED_PROPS in scrollAnimations.ts), never clearProps 'all'.
  Performance: html.lite (inline <head> script: <=900px / <=4 cores / <=4GB) read via perf.ts LITE: particles 1300 @1x 30fps,
  no backdrop-filter / permanent will-change, static small logos, no dashboard 3D icons. core.ts initOffscreenPause pauses
  CSS animations of off-screen sections. Revealed [data-reveal] content must end with transform:none (crisp text).
  The hero has no WebGL any more (initHeroCore3D just mounts the dvLogo). Splash: SPLASH_MS 2800.
    dashboardFx.ts    card cascade, rollNumber(), pointer spotlight, 3D metric icons, celebrate() confetti
    matrixDial.ts     #matrix "Explore Any Generation" interactive SVG vault dial (drives the hidden level pills;
                      app.ts autoplay steps a level every 2s while .matrix-calc-box is on screen)
    rewardVaults.ts   dashboard #rewardsSection: 11 rank boxes (locked/ready/opened, opened state in localStorage only,
                      never a payout) + header #walletMenu (copy, BscScan, Log out = #dashLogoutBtn)
    giftBox.ts        openGiftBox(): TPR-style three.js surprise box overlay (drop, rattle, shake, lid burst, reward reveal)
  Landing nav: no Matrix/Dashboard items; li.nav-dash shows only with body.wallet-connected; landingFx initNavIndicator
  glides a highlight. MutationObservers must never react to their own writes (classList.add re-sets the attribute even
  when unchanged); a self-triggering observer froze the page on the preloader once.
  wallet.ts: chainChanged never reloads the page (Trust fired it mid-connect and lost the connection); brand flags are
  checked before isMetaMask (Trust/SafePal/OKX/Binance/Coinbase also set it). Mobile app links add dv_connect=1 and
  app.ts autoConnectFromWalletApp() connects inside the wallet app. api.ts wakeBackend() pings /health on landing
  load + every 10 min (Render free plan sleeps the API).
  wallet.ts autoReconnect() waits for EIP-6963 announcements and tries every wallet (else the dashboard bounced to
  the landing page on refresh). Dashboard: header = logo + wallet menu only (owner removed the navbar); no link back to the landing page (only Log out); metric captions are data-driven.
  Preloader/footer use --bg-dark (#050505) like the landing page. The wallet modal card never tilts.
  CSS for the motion layer is the last block of main.css and dashboard.css ("TPR motion layer").
  styles: src/styles/main.css (large, ~4.7k lines), dashboard.css
```

## Commands
- Backend: `cd backend; npm run dev` | `npm run typecheck` | `npx prisma migrate dev` | `npm run db:seed:local`
- Frontend: `cd frontend; npm run dev` | `npm run build`
- No git repo, no test suite yet.

## Not built yet
Package re-entry/top-up after the cap (contract allows one activation per wallet), recovery of sponsor links lost when a
sponsor's activation never reached the backend. See document.md section 4.

## Rules
- Never put private keys or seed phrases in `.env`, code, or the DB. Never trust amounts or status sent by the browser; the chain is the source of truth.
  Only exception (owner-approved): PAYOUT_SIGNER_TESTNET_KEY, a fundless voucher signer, on BSC Testnet only.
- Testnet = chain 97, Mainnet = 56. Don't mix token/contract addresses between them.
