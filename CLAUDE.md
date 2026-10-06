# DAOvault AI — Project Map

Web3 referral/affiliate reward dApp on **BNB Smart Chain (BEP-20)**. Users connect a wallet, pay a fixed **$300 USDT** activation via a smart contract, and earn from referrals. Full business spec: `project.md`. Contract deploy/test guide: `smartcontract-payment.md`. Read those only when the task needs plan details.
**Design/UX reference:** TPR World (tprworld.org). Its full code teardown (design tokens, sections, 3D scene, wallet flow, API, what not to copy) is in `tpr-reference.md`. Read it for UI, wallet or dashboard work instead of re-fetching the site.

## Business rules (summary)
- $300 fixed package, no passive ROI. 40% ($120) paid across 20 upline levels (L1 10%, L2 5%, L3-4 3%, L5-7 2%, L8-20 1%), levels unlock by direct-referral count (15 directs unlocks all 20).
- 11 rank tiers (Starter 25 DAO/$100 ... Crown President 50,000 DAO/$100,000); 1 DAO = 1 active package; max 50% of volume from one leg.
- Earnings cap 10x ($3,000) per package; 5% withdrawal fee.
- Referral: `?ref=CODE` saved to `localStorage['daovault_pending_ref']`. Referral codes are `DV` + first 6 hex chars of wallet.

## Layout
```
contracts/DAOvaultActivation.sol   Solidity 0.8.20. activate(sponsor) pulls USDT via transferFrom -> immutable treasury,
                                   emits Activated(user, sponsor, amount, timestamp). No commissions/withdrawals yet.
backend/   Node + Express 5 + TypeScript (ESM, .js import suffixes) + Prisma 6 + PostgreSQL + zod 4 + ethers 6. Port 5000.
  src/app.ts               middleware + router mounting (prefix /api/v1)
  src/config/env.ts        zod-validated env (contract addrs optional)
  src/modules/<name>/      routes -> controller -> service -> repository pattern
    health      GET  /health
    users       GET  /users/:walletAddress
    dashboard   GET  /dashboard/:walletAddress
    activation  POST /activation/verify  (financial rate limit; verifies tx receipt + Activated event on-chain, then upserts User + Package)
  prisma/schema.prisma     User, Package, Earning (LEVEL_COMMISSION|RANK_REWARD), Withdrawal
  prisma/seed.ts           local dashboard fixture (SEED_WALLET_ADDRESS)
frontend/  Vite 6 + vanilla TypeScript (no framework), three.js, gsap, lottie-web, vanta, ethers 6. Port 3000, proxies /api -> :5000.
  index.html -> src/scripts/app.ts        landing page (3D scene, rank cards, wallet picker)
  dashboard.html -> src/scripts/dashboard.ts  user dashboard
  scripts: core.ts (referral capture, preloader, countUp, reveal stagger, toast), wallet.ts (EIP-6963, BSC switch, reconnect),
           payment.ts (approve + activate + POST verify), api.ts (backend calls), trophy.ts/walletDialog3D.ts
           (three.js visuals), rankGameCard.ts (RANK_DATA), matrixAutoDeck.ts, scrollAnimations.ts (GSAP per section,
           matrix card-stack deck), types.ts
  Motion layer (TPR + iorca inspired, DAOvault identity; see tpr-reference.md):
    particleScene.ts  one morphing gold particle cloud + lightning; hero = loose dust, sections re-form it into the
                      DAOvault logo sampled from public/assets/DAOlogo.jpg ('logo' | 'mark' | 'dial'); SCENE_STATES maps
                      [data-scene] -> shape; shapes anchor into `.scene-slot` divs beside headings (hidden < 1180px)
    scene.ts          init3DScene() wires the particle scene; hero shows ONLY the logo video (public/assets/daoAnimation.MP4,
                      mirrored after 1.7s edge-on so text reads correctly). The 3D vault emblem is a hidden fallback for
                      when the video can't play. No sparks, orbits or intro around the logo (owner's request).
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
    dashboardFx.ts    card cascade, rollNumber(), pointer spotlight, 3D metric icons, celebrate() confetti
    matrixDial.ts     #matrix "Explore Any Generation" interactive SVG vault dial (drives the hidden level pills;
                      app.ts autoplay steps a level every 2s while .matrix-calc-box is on screen)
    rewardVaults.ts   dashboard #rewardsSection: 11 rank boxes (locked/ready/opened, opened state in localStorage only,
                      never a payout) + header #walletMenu (copy, BscScan, Log out = #dashLogoutBtn)
    giftBox.ts        openGiftBox(): TPR-style three.js surprise box overlay (drop, rattle, shake, lid burst, reward reveal)
  Landing nav: no Matrix/Dashboard items; li.nav-dash shows only with body.wallet-connected; landingFx initNavIndicator
  glides a highlight. MutationObservers must never react to their own writes (classList.add re-sets the attribute even
  when unchanged); a self-triggering observer froze the page on the preloader once.
  wallet.ts autoReconnect() waits for EIP-6963 announcements and tries every wallet (else the dashboard bounced to
  the landing page on refresh). Dashboard header: Main Site button + wallet menu; metric captions are data-driven.
  Preloader/footer use --bg-dark (#050505) like the landing page. The wallet modal card never tilts.
  CSS for the motion layer is the last block of main.css and dashboard.css ("TPR motion layer").
  styles: src/styles/main.css (large, ~4.7k lines), dashboard.css
```

## Commands
- Backend: `cd backend; npm run dev` | `npm run typecheck` | `npx prisma migrate dev` | `npm run db:seed:local`
- Frontend: `cd frontend; npm run dev` | `npm run build`
- No git repo, no test suite yet.

## Not built yet
Wallet signature auth (JWT deps present, unused), 20-level commission engine, rank calculation, 10x cap enforcement, withdrawals, referral-code to sponsor-wallet lookup (frontend currently sends the zero address as sponsor).

## Rules
- Never put private keys or seed phrases in `.env`, code, or the DB. Never trust amounts or status sent by the browser; the chain is the source of truth.
- Testnet = chain 97, Mainnet = 56. Don't mix token/contract addresses between them.
