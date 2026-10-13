# DAOvault AI — Project Map

Web3 referral/affiliate reward dApp on **BNB Smart Chain (BEP-20)**. Users connect a wallet, pay a fixed **$300 USDT** activation via a smart contract, and earn from referrals. Full business spec: `project.md`. Contract deploy/test guide: `smartcontract-payment.md`. Read those only when the task needs plan details.
**Build status, decisions, setup:** `document.md` (keep it updated when features land).
**Deploy runbook (Render, contracts, every env value, testnet + mainnet):** `DEPLOYMENT.md` (update addresses there when contracts deploy).
**Testnet step by step (owner, Hinglish; status, wallets, faucets, Render values, test flow):** `TESTNET-SETUP.md`.
**Owner's own Remix deploy of the 3 contracts (Hinglish, click by click):** `REMIX-DEPLOY.md`.
**Mainnet (launch) Remix deploy + wallet-role scenarios (MetaMask/Trust/Ledger/Safe, deployer != treasury):** `PRODUCTION-REMIX-DEPLOY.md`.
**Production hosting plan (owner, 2026-10-10): Hostinger VPS + Docker + Nginx + Cloudflare Tunnel, secrets, signer
options (KMS / Docker signer / admin review), hardening, backups, emergency plan:** `PRODUCTION-SETUP.md`.
**Withdrawal + money flow for non-technical readers (owner, Hinglish: 45/55 split, one signer vs a voucher per
withdrawal, keygen what to note, Remix fields not code):** `WITHDRAWAL-FLOW.md`.
GitHub repo Reveda/daoVault was PUBLIC on 2026-10-10 (owner told to make it private); history had no secrets.
**Design/UX reference:** TPR World (tprworld.org). Its full code teardown (design tokens, sections, 3D scene, wallet flow, API, what not to copy) is in `tpr-reference.md`. Read it for UI, wallet or dashboard work instead of re-fetching the site.

## Business rules (summary)
- $300 fixed package, no passive ROI. 40% ($120) paid across 20 upline levels (L1 10%, L2 5%, L3-4 3%, L5-7 2%, L8-20 1%), levels unlock by direct-referral count (15 directs unlocks all 20).
- 11 rank tiers (Starter 25 DAO/$150, Builder 50/$300, Leader 100/$500, Elite 200/$1,200, Executive 375/$2,500, Crown Exec 1,000/$7,500,
  Crown Director 3,000/$15,000, Ambassador 7,000/$30,000, Crown Ambassador 12,000/$50,000, President 20,000/$75,000, Crown President 50,000/$200,000; owner plan 2026-10-09); 1 DAO = 1 activated package. Rank rule (owner, 2026-10-08): the DAO matching is needed on EACH side, power leg (UI: "Strong Leg") AND
  other legs combined (UI: "Other Leg") (Starter 25 = 25 + 25 = 50 total); matchedVolume = min(power, other). Replaced the old split rule
  (V/2 + V/2). Single source: backend/src/modules/plan/plan.ts.
- Earnings cap 25x ($7,500) of level income per package (was 10x; rank rewards outside it); 5% withdrawal fee.
- Referral: `?ref=CODE` saved to `localStorage['daovault_pending_ref']`; on the next dashboard visit of an unpaid wallet it is saved on the
  server (POST /users/pending-sponsor -> users.pending_sponsor_code) and the browser copy dropped. LATEST invite link
  opened before paying wins (owner, 2026-10-09); activation pays with that sponsor from any browser.
- Pre-launch marketing (owner, 2026-10-13; replaces "only an ACTIVATED sponsor"): ANY registered wallet can sponsor, paid or
  not. savePendingSponsor links users.upline_id at once (activation.engine linkUpline: no loops, moves team volume up;
  sponsor change only while unpaid AND teamVolume 0). Contract has no sponsor check (only != self). An unpaid upline's
  commission / rank reward stays with the company (engine skips no_package) and is not paid back later.
  PAYMENTS_OPEN_AT (backend env, ISO; default 2026-11-10T00:00+05:30, owner 2026-10-13; past date = open): dashboard paymentsOpen/paymentsOpenAt -> activation card: only "Activation opens on <date>" + countdown (no other message, owner), button off
  until then (website only, no contract switch; check-plan has the pre-launch checks). Codes are `DV` + first 6 hex chars of wallet (longer if taken; the server value wins).

## Layout
```
contracts/production/              mainnet copies of DAOvaultActivation.sol + DAOvaultPayout.sol (no TestUSDT) + README
                                   (values, SHA-256). Keep IDENTICAL to contracts/*.sol: re-copy after any contract fix.
contracts/DAOvaultActivation.sol   Solidity 0.8.20. activate(sponsor) / topUp() pull USDT via transferFrom and split it (owner,
                                   2026-10-13): 45% (PAYOUT_SHARE_BPS 4500) -> immutable payoutVault (= DAOvaultPayout, the
                                   withdrawal float, deployed FIRST), 55% -> immutable treasury. Constructor (usdt, treasury,
                                   payoutVault, amount). Backend refuses a payment contract whose payoutVault != PAYOUT_CONTRACT_ADDRESS.
                                   Emits Activated(user, sponsor, amount, timestamp). Sponsor must be activated OR the treasury.
                                   Treasury = company ROOT (owner, 2026-10-09): never pays (TreasuryIsRoot), isActivated() true.
                                   Backend config/root.ts (COMPANY_WALLET_ADDRESS = treasury): root record made at server start,
                                   sponsors without a package, gets directs/volume/rank but NO commissions or rank rewards
                                   (shares stay in the treasury); dashboard isRoot -> "Company root ID". Commissions are off-chain.
backend/   Node + Express 5 + TypeScript (ESM, .js import suffixes) + Prisma 6 + PostgreSQL + zod 4 + ethers 6. Port 5000.
  src/app.ts               middleware + router mounting (prefix /api/v1)
  src/config/env.ts        zod-validated env (contract addrs optional)
  src/modules/<name>/      routes -> controller -> service -> repository pattern
    health      GET  /health
    users       GET  /users/:walletAddress
    dashboard   GET  /dashboard/:walletAddress   (JWT, own wallet or admin: requireSelfOrAdmin; 403 otherwise)
                GET  /dashboard/:walletAddress/levels/:level?page=  (members exactly N levels down: DV code, short
                wallet, sponsor code, joined date; 50/page) -> frontend levelModal.ts (tap a 20-Level Downline row)
    activation  POST /activation/topup/verify (re-entry, owner 2026-10-10: contract topUp() -> ToppedUp; processTopUp adds a
                package with its own 25x cap, uplines paid the 20 levels again, +1 DAO volume, no new direct. Commissions fill
                the OLDEST ACTIVE package and spill into the next; dashboard currentPackage/canTopUp -> "Top-up $300" card)
    activation  POST /activation/verify  (verifies tx + Activated event on-chain, then activation.engine.ts processActivation:
                directs, 20-level commissions w/ unlock + 25x cap, team volume, 50:50 ranks + rank rewards; serializable tx)
    users       GET  /users/referral/:code  (invite code -> sponsor wallet)
                POST /users/register  (first dashboard visit: reserves the wallet's permanent code, no package/upline;
                processActivation keeps the record + code and links the sponsor; only activated codes can sponsor)
    auth        POST /auth/challenge, /auth/verify (EIP-4361 SIWE message: domain from the Origin header only if it is a
                FRONTEND_URL origin, chain ID, nonce 5 min single use -> access JWT with `ver` + refresh cookie) (bumps
                auth_sessions.version on refresh-token theft: every older token is refused). Access token 15 min
                (ACCESS_TOKEN_MINUTES) in the body; refresh token 30 days (REFRESH_TOKEN_DAYS) as httpOnly SameSite=Strict
                cookie dv_rt on /api/v1/auth, hashed in refresh_tokens, rotated by POST /auth/refresh (30s grace for
                parallel tabs; reuse after that revokes the wallet), POST /auth/logout. middlewares/auth.ts requireAuth (async, checks ver),
                requireAdmin, requireSelfOrAdmin. Also protected: GET /users/:wallet, POST /users/register (own wallet).
    withdrawals GET/POST /withdrawals (member) ; /admin/stats, /admin/withdrawals[/:id/approve|reject|complete]
                (ADMIN_WALLETS; complete verifies the USDT payout on-chain; no private keys on the server)
                instant: withdrawals/payout.ts signs EIP-712 vouchers for contracts/DAOvaultPayout.sol (member claims,
                POST /withdrawals/:id/confirm verifies Claimed). PAYOUT_SIGNER_TESTNET_KEY is a testnet-only exception
                (env.ts refuses it unless chain 97). Contract tests: contracts/test/
                NO admin review (owner 2026-10-13): request() runs canPayInstantly BEFORE creating a row; contract
                can't pay (paused / maxPerClaim / daily / float / signer mismatch / nothing configured) -> 4xx/503 with
                a member message (errorHandler passes our 503 texts), nothing reserved. Signing fails -> row REJECTED.
                Admin approve/complete only for older PENDING rows. Mainnet signer = Docker service `signer`
                (src/signer/server.ts: encrypted keystore + password files in ./secrets mounted read-only, own caps,
                internal network `signer`, profile payouts; keygen: dist/signer/keygen.js) called by
                withdrawals/voucherSigner.ts via PAYOUT_SIGNER_URL + PAYOUT_SIGNER_TOKEN. Guide: DOCKER.md B12.
  src/modules/plan/plan.ts  LEVELS, RANKS, 50:50 rankForLegs, cents helpers
  src/config/transaction.ts serializable() retry wrapper for money writes
  scripts/check-plan.ts    npm run check:plan: 32 engine checks (incl. owner-confirmed rules) on the real DB, always rolled back
  prisma/schema.prisma     User (teamVolume), Package, Earning (LEVEL_COMMISSION|RANK_REWARD), Withdrawal (review fields), AuthNonce
  prisma/seed.ts           local dashboard fixture (SEED_WALLET_ADDRESS)
frontend/  Vite 6 + vanilla TypeScript (no framework), three.js, gsap, lottie-web, vanta, ethers 6. Port 3000, proxies /api -> :5000.
  index.html -> src/scripts/app.ts        landing page (3D scene, rank cards, wallet picker)
  dashboard.html -> src/scripts/dashboard.ts  user dashboard (live API data, legs, income, withdraw w/ wallet sign-in)
  admin.html -> src/scripts/admin.ts      Company Command Center for ADMIN_WALLETS (= company wallet): landing particle scene
                                          (state "admin"), .fx-particles per section, KPI cards with icon badges
                                          (companyOverview.ts, also on the company dashboard), 4 panel charts + 7 charts
                                          (adminCharts.ts, Chart.js, admin bundle only), treasury ledger, "How it works",
                                          withdrawal queue. Data: GET /admin/stats + /admin/analytics (withdrawals/analytics.ts).
                                          Pagination (pager.ts): withdrawals 20/page (server), ledger 10/page, top earners
                                          5/page (top 50). Zeros stay visible (line at $0, bar stubs, grey ring).
                                          Admin wallet login: dashboard.ts sends an isAdmin vault to admin.html (unless
                                          ?view=member, the admin's "My dashboard" link); admin.html signs in by itself
                                          when a wallet is connected (refresh cookie: no new signature).
  session.ts: member sign-in (signIn / requireSession: decline -> "Sign in to open your vault" gate). Access token in
           memory only (no localStorage/sessionStorage); missing/expiring -> POST /auth/refresh with the cookie; sign
           again only when that fails. logout() deletes the refresh token. Dashboard, level modal, register and
           admin.ts all get tokens through signIn().
  CSP: no inline scripts (public/boot.js = html.lite + ?ref capture in <head>). Production CSP in render.yaml headers,
           same string in vite.config.js (preview only) and frontend/nginx/security-headers.conf (Docker); keep all 3 in sync. Checked: zero violations on all pages.
  scripts: core.ts (referral capture, preloader, countUp, reveal stagger, toast), wallet.ts (EIP-6963, BSC switch, reconnect),
           payment.ts (resolveSponsor, approve + activate + POST verify, retry pending), api.ts (backend calls),
           trophy3d.ts (old Apex trophy: NOT loaded since 2026-10-12, import commented in app.ts),
           giftShowcase.ts (landing #ranks card: the packed reward box from giftBox.ts makeBox/createPortal/makePacker,
           scroll-driven: gold particles (sampleGift + favicon logo points) swirl into the gift as the card scrolls in
           (progress = gift centre 105%..60% of the screen; morph on the GPU: aStart/aDelay/aSwirl + uProgress, shuffled points,
           adaptive quality: avg frame > 25ms after warm-up = fewer points + pixel ratio 1); the gift STAYS particles (owner 2026-10-12: like the background
           logo; no solid box): GIFT_VERT/FRAG shader = glow+core dots, twinkle, flares, rising light band, breathing,
           orbit ring, hover/tap burst; at 100% lightning + .gift-thunder flash; RED is pure red so additive dots stay red;
           denser (4200 / lite 2600), crisp edge points, DV logo on all 4 seals, far side dimmed 85% via uNear), walletDialog3D.ts, rankGameCard.ts (RANK_DATA), matrixAutoDeck.ts, scrollAnimations.ts (GSAP per section,
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
    heroWallet.ts     our own gold wallet (inline SVG) + 4 CSS coins in the hero Connect badge and the navbar
                      Connect button ([data-wallet-icon]); badge opens into the full button (.is-ready), coins swirl
                      every 5s. Replaced the third-party Lottie (lottie-web no longer loaded on the landing page).
                      The final CTA has no wallet animation (owner removed it). Brand text is "DAOvault" (no ".AI").
    liveMarket.ts     hero metric card #mkCard: live BNB/USDT price + 24h change + 24h sparkline (Binance public API,
                      CoinGecko fallback) and live BSC gas (#mkGas, eth_gasPrice); refresh 60s while on screen.
                      No fake numbers: placeholders until data arrives.
    chainProof.ts     #compare "Verify it yourself" card: Activation contract + USDT rows, each ONE "View on BscScan"
                      button, no address printed (owner). "Live on BSC" badge only if eth_getCode finds code; no address
                      configured = "Published here at launch" / "Coming at launch".
                      Dashboard: #dashActivationTx chip links the member's own activationTxHash on BscScan.
  Landing wording (owner 2026-10-09): no "ROI"/"Ponzi"/"FIFO"/"pool"/"guarantee"/"solvency"/instant-payout claims;
  rank rule copy says "DAO Matching on Both Sides". CTA has only Connect Wallet. Flip hint says Tap on touch screens.
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
    rewardVaults.ts   wallet menu "Go to" shortcuts (data-jump: only Withdraw + Rewards, owner 2026-10-11; was also Rank, Invite,
                      20 levels, Income; smooth scroll + .jump-flash; hidden sections left out). Owner 2026-10-11.
                      Dashboard: is-offscreen never pauses .lvl-row / .reward-box entrances (rows went blank on fast phone scroll).
    rewardVaults.ts   dashboard #rewardsSection: 11 rank boxes (locked/ready/opened, opened state in localStorage only,
                      never a payout) + header #walletMenu (copy, BscScan, Log out = #dashLogoutBtn)
    rankProgress.ts   dashboard #rankListSection "All Ranks": per rank a leg tree (owner 2026-10-11): YOU node, flowing
                      arrows, Strong Leg (left) / Other Leg (right) progress rings; hover/tap = member count bubble
                      (GET /dashboard legs.powerMembers / otherMembers, dashboard.repository membersPerLeg, all depths).
                      Was: per rank Power Leg / Other Legs bars vs the DAO target
                      (each side, DAO only), reward, Achieved/In progress/Locked, All/Achieved/Pending
                      filter. Pure frontend from GET /dashboard legs + currentRank.
    giftBox.ts        openGiftBox(): three.js surprise box overlay; owner 2026-10-11: packing intro (PACK_S 2.3s: body rises,
                      ribbon wraps, lid lands, seals + bow pop; buttons after), gold portal rings + dust, energy from 4 sides
                      + lightning while charging, shockwave on burst (animateVfx), soft-masked canvas edges. Was: (drop, rattle, shake, lid burst, reward reveal); red box,
                      white ribbon + bow, gold-rimmed DAOvault seal on all 4 sides; .gift-scroll keeps it on any screen height
  Landing nav: no Matrix/Dashboard items; li.nav-dash shows only with body.wallet-connected; landingFx initNavIndicator
  glides a highlight. MutationObservers must never react to their own writes (classList.add re-sets the attribute even
  when unchanged); a self-triggering observer froze the page on the preloader once.
  wallet.ts: chainChanged never reloads the page (Trust fired it mid-connect and lost the connection); brand flags are
  checked before isMetaMask (Trust/SafePal/OKX/Binance/Coinbase also set it). Mobile app links add dv_connect=1 and
  app.ts autoConnectFromWalletApp() connects inside the wallet app. api.ts wakeBackend() pings /health on landing
  load + every 10 min (Render free plan sleeps the API).
  wallet.ts: connect and autoReconnect ask the wallet to switch to the build's chain (adding BSC Testnet/Mainnet if missing),
  once per tab, non-blocking (askNetworkOnce). Sign-in uses raw personal_sign (chain-free), so a pending switch never breaks it.
  wallet.ts autoReconnect() waits for EIP-6963 announcements and tries every wallet (else the dashboard bounced to
  the landing page on refresh). On phones it falls back to eth_requestAccounts (Trust returns [] from eth_accounts
  after a load, which caused a landing<->dashboard reload loop). A connected wallet on the landing page is sent to
  its dashboard (sessionStorage dv_dash_bounce + recordAutoRedirect() max 2 per 20s stop bounces). accountsChanged
  is ignored when the account is unchanged (Trust re-emits it on every load: a reload loop once) and when empty on
  phones; only a real switch reloads the dashboard. Dashboard data retries network/5xx ~1 min (Render waking).
  App links carry ?ref (wallet browsers have their own storage); Binance/OKX links use their official formats. Dashboard: header = logo + wallet menu only (owner removed the navbar); no link back to the landing page (only Log out); metric captions are data-driven.
  Preloader/footer use --bg-dark (#050505) like the landing page. The wallet modal card never tilts.
  Wallet modal (owner 2026-10-10): MetaMask, Binance, Trust, TokenPocket (tpdapp:// deeplink), SafePal (no deeplink:
  copies the link on phones; window.safepalProvider), Other; dark-gold lifted theme (#walletModal block, end of main.css).
  Wallet modal footer (owner 2026-10-12): "Joining under DV…" replaces "Earnings Cap 25×" (app.ts showJoiningUnder: ?ref or
  saved code, checked with GET /users/referral/:code; amber "Invite DV… not active yet"; no code = "DAOVAULT"). The bigger
  "You're joining under" strip with a Change form was removed (owner). Short screens: same single column, tighter spacing.
  core.ts showToast: top right below the header, dark-gold card, text-only message (never HTML), timer bar, close.
  Phones (<=600px): compact 300px card in the top-right corner under the status bar, smaller type (owner 2026-10-11).
  Admin page gate (owner 2026-10-11): admin.html shows "Page not found" (#notFound) to everyone but a signed-in admin;
  admin.ts openIfAdmin uses session.ts silentSession (refresh cookie only, never a wallet prompt; no sign-in button,
  admins sign in on the dashboard). Backend sets cookie dv_ag (signed JWT typ admin-gate, path /, Lax) for admin wallets on
  every access token; GET /auth/admin-gate -> 204/401; Nginx auth_request on /admin.html, /admin, /static/admin-*
  -> public/404.html. Unknown paths -> 404.html. Backend errors generic (errorHandler GENERIC, notFound "Not found.",
  validateRequest hides zod built-in texts). Removed unused public/preview_*.html, logo animation page, lottie_page.html.
  Background worker (owner 2026-10-11): backend/src/worker.ts (BullMQ 5 + ioredis on REDIS_URL, 1 copy): chain-indexer
  (jobs/chainIndexer.ts: Activated/ToppedUp logs -> activationService.verify/verifyTopUp, cursor table chain_cursors,
  INDEXER_START_BLOCK / INDEXER_RPC_URL: bnbchain/binance dataseeds refuse eth_getLogs, publicnode allows 5k blocks),
  voucher-settle (withdrawalsService.reconcileAllOpen), auth-cleanup, watch. Not on Render (paid worker); Docker service `worker`.
  Plan queue (owner 2026-10-13, launch-day scaling): processActivation / processTopUp only add the package + a plan_events row;
  activation.engine processPlanEvents (ONE runner: Postgres advisory lock, planQueue.ts kick after each payment + 5s sweep
  in every API copy and the worker) applies directs, 20-level commissions, team volume (batched per upline) and ranks in
  payment order. Packages count for volume/legs only once countedAt is set. linkUpline takes the same lock.
  check-plan runs the queue inside its rollback transaction (processPlanEvents lock:false). Local DB has no
  _prisma_migrations table: apply new migrations there with prisma db execute --file (never migrate dev / reset).
  Monitoring: config/alerts.ts = "[alert]" lines in the server log only (owner 2026-10-13 REMOVED Telegram: no bot, no
  activity messages, no daily summary; do not re-add), deduped, no secrets, from errorHandler 5xx, crashes,
  payout/signer failures, float low, session theft, admin sign-in, worker job failures; jobs/watch.ts every 2 min in the
  worker (API every 5 min when no REDIS_URL). config/cache.ts caches dashboard member counts 120s.
  Backups: docker/backup/backup.sh (gzip -t + alert), offsite.sh (rclone crypt, profile offsite, secrets/rclone.conf),
  restore-test.sh (throwaway DB). DOCKER.md B13-B16.
  Also: "PAID BUT NOT RECORDED" (activation.service after the on-chain event checks out + chain indexer refusals, one key per
  tx), config mismatch alerts. Activation uses the ON-CHAIN sponsor even if the browser sent another one.
  Launch traffic (owner 2026-10-13, measured on the dev PC, 1 Node copy, 200 conns): health ~2.5k req/s, invite lookup ~1.5k,
  dashboard ~350 req/s, plan queue ~92 payments/s. Per-IP limits sized for CGNAT shared mobile IPs (API 1200/min, auth
  600/15min, financial 200/min; Nginx api 100r/s, auth 20r/s) + per-wallet sign-in limiter (authWalletRateLimiter,
  AUTH_WALLET_RATE_LIMIT_MAX 20), also in render.yaml (owner asked, 2026-10-13). VPS env: backend/.env.prd (= backend/.env.production
  on the server; its old PAYMENT_CONTRACT_ADDRESS was an example address, cleared) + root .env.production (generated secrets). activation.service caches the payment contract's immutable config per address.
  Render backend is the free plan: not for launch traffic (VPS / paid plan + paid RPC).
  Dashboard 20-level rows open the level modal only when unlocked.
  Phones (owner 2026-10-12): html.lite = no .lvl-row / .reward-box entrance (a row stayed unpainted), finished entrances dropped
  via tbody/.reward-boxes.is-settled, particleScene skips frames while scrolling on LITE. Tap feedback site-wide: core.ts
  enableTouchPress adds .tap-glow only on a real tap (moved < 10px), CSS floats the card 3px (.tap-glow:not(#_) beats sticky
  :hover rules), no scale press. ADMIN_WALLETS parsing strips quotes/spaces; server.ts logs "Admin wallets: …" at start.
  #join CTA commented out in index.html (its dial + lightning went to the quiz scene); FAQ has the faq particle state. Rank
  calculator card #rankCalcCard has its own data-scene "rankcalc" (dial + lightning behind the card via .scene-slot--calc, also on
  phones); bindSectionScenes returns to the parent section scene when a nested scene leaves the middle band. 25x cap card
  #retopupCycleCard: data-scene "retopup" (DV mark + lightning), gold-themed simulator (matrixVisualizer.ts texts: "Package #N",
  no emojis / "platform protected"); its 4 step cards (.cycle-station) are commented out (owner 2026-10-13).
  Live pulse (owner 2026-10-12): the strip under the hero is gone; signal card 3 (was 25x Cap, commented out) = #livePulseCard
  (liveActivity.ts): real events from GET /activity/recent (modules/activity: packages / rank rewards / paid withdrawals, short
  wallets, 30s cache) + live BSC block number; until a real event exists it shows labelled SAMPLE events ("SAMPLE PREVIEW",
  amber dot, "sample •" per line). Never label sample data as live.
  FAQ (owner 2026-10-12): gold-themed cards with numbered questions; open/close is a grid-row 0fr->1fr transition
  (landingFx initFaqAccordion wraps content in .faq-answer-inner; max-height made the close jump); plain plan-accurate answers.
  Rank calculator: data-unfold (unfoldCard.ts): scrolling down it drops in from above and its content opens top-down,
  scrolling up it rises from below and opens bottom-up (clip-path, replays after it leaves); gold-only internals,
  slider gold fill via --fill (rankCalculator.ts); texts plain (no literal &bull;, no "instant cash", no emoji).
  Mobile nav (owner 2026-10-13): <=960px the header is one floating gold capsule (logo, Connect Wallet, 2-line menu
  button #mnavToggle); landingFx initMobileNav opens #mnavPanel (numbered sections with icons, active highlight, Connect
  CTA), tap = close + smooth scroll below the header. Tap glow never changes the transform of .matrix-stack-card,
  #rankDisplayCard or .flip-card-wrap (scroll animations own it; changing it made the level cards vanish on tap).
  Four pillars (#about) retitled "Four Rules That Keep It Fair & Balanced", gold-only.
  #matrix level cards (owner 2026-10-11): matrixAutoDeck.ts revealCard on every active-card change (after the deck
  reaches 70% of the screen): .mx-scan light sweeps down, content drops in piece by piece, % and USDT count up; CSS
  `.mx-reveal` block at the end of main.css, removed after 2.4s so the cards' own loops return; off for reduced motion.
  Landing launch notice shows on every visit until VITE_LAUNCH_DATE ("We go live on 22 October"); dashboard one stays once.
  CSS for the motion layer is the last block of main.css and dashboard.css ("TPR motion layer").
  styles: src/styles/main.css (large, ~4.7k lines), dashboard.css
```

## Commands
- Backend: `cd backend; npm run dev` | `npm run typecheck` | `npx prisma migrate dev` | `npm run db:seed:local`
- Frontend: `cd frontend; npm run dev` | `npm run build`
- Docker (owner 2026-10-11; plain npm run dev unchanged): dev `docker compose -f docker-compose.dev.yml up --build`
  (own Postgres on 5433, code mounted, vite.config.js DOCKER/API_PROXY_TARGET); prod `docker compose --env-file
  .env.production -f docker-compose.prod.yml --profile tunnel up -d --build` (db, backend, web = Nginx in frontend/nginx/,
  cloudflared, backup, redis). Scaling (owner 2026-10-11, 4-core VPS): backend deploy.replicas BACKEND_REPLICAS (default 3),
  Nginx round robin via Docker DNS, REDIS_URL -> shared rate-limit store (config/redis.ts, rate-limit-redis; unset = memory),
  Postgres tuned (shared_buffers 1GB, parallel 4), connection_limit=10 per copy. env.ts: empty optional values = unset.
  Owner guide: DOCKER.md. Docker is NOT installed on the dev PC and nothing
  builds the images yet: ci.yml + render.yaml stay Render-only until the owner moves to the VPS (owner 2026-10-11).
- No git repo, no test suite yet.

## Not built yet
Recovery of sponsor links lost when a
sponsor's activation never reached the backend. See document.md section 4.

## Rules
- Never put private keys or seed phrases in `.env`, code, or the DB. Never trust amounts or status sent by the browser; the chain is the source of truth.
  Only exception (owner-approved): PAYOUT_SIGNER_TESTNET_KEY, a fundless voucher signer, on BSC Testnet only.
  Mainnet voucher key: only in the `signer` container (encrypted keystore file), never in .env / API / DB / git.
- Testnet = chain 97, Mainnet = 56. Don't mix token/contract addresses between them.
- Still in development: no real-money payment may happen. payment.ts REAL_PAYMENTS_LOCKED refuses the activation and
  payout claim on any chain but 97 unless VITE_ALLOW_MAINNET_PAYMENTS=true (render.yaml: "false"). Never flip it
  without the owner saying it is launch time. The live site (daovault-1.onrender.com) is built for chain 56.
- Transactions: requireBSCNetwork(provider) before new BrowserProvider; sign with getSignerFor(provider, account).
- Render: frontend https://daovault-1.onrender.com, backend https://daovault-2.onrender.com (service daoVault-2).
  The API is same-origin: render.yaml routes rewrite /api/* on daovault-1 to daoVault-2 (VITE_API_BASE_URL=/api/v1;
  api.ts falls back to /api/v1, fetch credentials same-origin). Backend `npm start` =
  scripts/start.mjs: prisma migrate deploy, then dist/server.js (free plan: no shell / pre-deploy step).
