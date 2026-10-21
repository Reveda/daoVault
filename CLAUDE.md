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
**Launch day (owner, Hinglish): what turns real by itself vs the owner's switches:** `LAUNCH-DAY.md`.
**Power Business (owner, Hinglish: business for one member ID, one side; table power_businesses; no script in the
code, records go straight into the DB). Owner 2026-10-19: it COUNTS for rank + rank rewards of that member AND
every PLACEMENT upline, on the side the member sits under each (like real business), NEVER level income. Never
written into left/right_volume: plan/power.ts powerArriving (recursive CTE up from each record) + legsWithPower
(power on ONE side only = the side with the most arriving; the other side must be real) used by activation.engine
recomputeRanks + powerRankCandidates (every plan run, also with no events) and dashboard.service powerSides / level
modal ranks. NEVER shown apart (owner 2026-10-20): GET /dashboard legs / teamVolume / nextRank include it as normal
business, no powerBusiness field, no Power cards / DAO progress strip; leg card + rings capped at the target. Contract unchanged:** `POWER-BUSINESS-POLICY.md`.
**Binary Left/Right placement (owner 2026-10-17, IN CODE 2026-10-18; Hinglish graphs + RAM/ALOK examples):**
`PLACEMENT-PLAN.md`.
**Join / team / activation scenarios for non-technical readers (owner, Hinglish: pre-launch, 10 Nov, A-B-C unpaid
sponsor example, the sponsor popup):** `ACTIVATION-FLOW.md`.
GitHub repo Reveda/daoVault was PUBLIC on 2026-10-10 (owner told to make it private); history had no secrets.
**Design/UX reference:** TPR World (tprworld.org). Its full code teardown (design tokens, sections, 3D scene, wallet flow, API, what not to copy) is in `tpr-reference.md`. Read it for UI, wallet or dashboard work instead of re-fetching the site.

## Business rules (summary)
- $300 fixed package, no passive ROI. 40% ($120) paid across 20 upline levels (L1 10%, L2 5%, L3-4 3%, L5-7 2%, L8-20 1%), levels unlock by direct-referral count (15 directs unlocks all 20).
- 11 rank tiers (Starter 25 DAO/$150, Builder 50/$300, Leader 100/$500, Elite 200/$1,200, Executive 375/$2,500, Crown Exec 1,000/$7,500,
  Crown Director 3,000/$15,000, Ambassador 7,000/$30,000, Crown Ambassador 12,000/$50,000, President 20,000/$75,000, Crown President 50,000/$200,000; owner plan 2026-10-09); 1 DAO = 1 activated package. Rank rule (owner, 2026-10-08): the DAO matching is needed on EACH side; since binary
  placement (2026-10-17) the sides are the member's LEFT and RIGHT placement team (UI "Left Leg" / "Right Leg"; was Strong /
  Other leg of the sponsor tree) (Starter 25 = 25 + 25); matchedVolume = min(left, right). Single source: plan.ts.
- TWO TREES (owner 2026-10-17): SPONSOR tree = users.upline_id (whose invite link): directs, level unlock, 20-level income
  (ancestorsOf). PLACEMENT tree = users.placement_id + placement_side LEFT/RIGHT (binary, UNIQUE(placement_id, side), CHECK
  both-or-none): team business left_volume / right_volume (team_volume = sum), ranks + rank rewards (placementAncestorsOf,
  addSideVolume, recomputeRanks from left/right). Join = POST /users/join {sponsorCode, side} (users.joinTeam: linkUpline +
  activation.engine placeMember = bottom of the sponsor's chosen side, extreme spillover; ONCE, spot + sponsor never change;
  pre-launch teams placed before payment; a placed member's team business moves up). Join GATE right after sign-in
  (dashboard.ts showJoinGate, owner 2026-10-18: full-screen, cannot be closed, only Left / Right or Log out; invite code
  checked first, unknown codes skipped; Left / Right +
  confirmNotice "permanent"), Pay off until joined. Paid without joining (direct contract call / indexer) = bottom of the
  sponsor's LEFT. Server start: usersService.placeUnplacedPaid() (legacy paid members -> Left). Migration
  20261018090000_binary_placement zeroed team_volume (rebuilt by placement). Level modal/20-level table = sponsor tree, rows
  show "Placed Left · DVxxxx". Power Business has `side` (LEFT/RIGHT, was leg_user_id). check-plan: 78 checks incl. RAM/ALOK.
- DV token (owner 2026-10-15): every $300 package (activation or top-up) records 1,500 DAOVAULT (DV) tokens, planned to be
  credited at the DV launch on BSC (planned March 2028). Display only, nothing minted: plan.ts DV_TOKENS_PER_PACKAGE /
  DV_TOKEN_LAUNCH -> GET /dashboard dvToken {perPackage, allocated = packages x 1500 (root 0), launch, network} ->
  dashboard #dvTokenCard under the 4 metric cards (calc chips: N packages x 1,500 = total; the side shows only the "Planned launch" badge: the network / "months away" line and
  the "Credited to this wallet" note were removed 2026-10-19) + header "DV Token" button #dvMenu (total; panel = one line per package: #, Activation/Top-up,
  date, +1,500, sum) (dashboard.ts initDvToken). DV Token Pot #dvBoxBtn on the card (owner 2026-10-18,
  dashboard.ts initDvBox): a polished GOLD pot, belly wrapped in red cloth (gold hems, DAOvault seal on 6 sides), mouth under a RED CLOTH tied with a gold cord (owner: traditional cloth-covered pot;
  card: SVG pot + bobbing DV coin) that opens the giftBox.ts overlay with theme
  'pot' (makePot: lathe pot, gold bands, DV seals, lid = folded red cloth + gold hem, cord, knot + tassels; same parts as makeBox so packing/opening VFX run unchanged;
  14 minted DV coins (dvToken3d.ts dvCoinMaterials, face the camera, gold halo sprites) fountain out and float in
  frame, a gold light column from the mouth, 520 sparks) and reveals the allocation (optional texts format/kicker/label/note/lockedNote/previewNote/
  doneLabel, allowPreview). Sealed before the first package; with tokens it opens EVERYWHERE incl.
  production (owner 2026-10-18: show the member his tokens as soon as he buys); "Preview the opening" on the sealed pot only
  with VITE_REWARD_PREVIEW=true / dev server (VITE_DV_BOX_OPEN removed).
  OPENS ONCE (owner 2026-10-19): users.dv_pot_opened / users.reward_boxes_opened (bit per rank) remember it on the
  server (POST /dashboard/:wallet/boxes/opened {kind dv|rank, rank}, self only; dv needs an allocation, rank <= currentRank;
  migration 20261019090000_reward_boxes_opened); GET /dashboard dvToken.opened + rewardBoxesOpened; an opened pot / box is
  disabled (no replay), labelled "Already opened". localStorage kept as a second copy. Opening NEVER changes a balance (rewards are
  credited by the plan engine; DV is an allocation). A top-up opens the pot once more for its NEW tokens only ("New: +1,500 DV";
  reveal = the new tokens, note = new total); the server stores GREATEST(old, min(server allocation, what the page revealed)). Rank reward boxes: "Preview the opening" on a sealed box only with VITE_REWARD_PREVIEW=true or the dev
  server (rewardVaults.ts REWARD_PREVIEW; render.yaml true; Dockerfile / compose default false = production has no preview). Both show the token as a 3D minted coin (dvToken3d.ts mountDvToken3D:
  three.js, logo face via CanvasTexture turned FACE_TURN upright, engraved "DAOVAULT · DV TOKEN" ring on the card coin,
  reeded edge, ~33 fps, only while visible); html.lite / no WebGL / reduced motion = flat logo + CSS coin spin (.is-css).
  Header pinned to both edges (owner bug 2026-10-18, Trust in-app browser ran the capsule past the right edge): .top-header
  left/right 0 + max-width 100vw (main.css), dashboard wallet chip shrinks with an ellipsis address (end of dashboard.css);
  Phones (<=960px): the capsule keeps a 16px gutter each side on landing + dashboard (width calc(100% - 2rem - insets), end of main.css);
  Phones: .top-header::before = dark scrim behind the capsule (Chrome showed scrolled text above it, owner 2026-10-18).
  html + body use overflow-x: clip (never hidden on html: that makes body a scroll box), body keeps hidden as fallback.
  .dv-token-slot is a fixed round box (overflow hidden, img max 100%): a CSS width:auto once let the 256 px logo stretch
  the header to 290 px (owner bug 2026-10-15). Dashboard header <=430px hides the brand text (logo + DV + wallet fit). Wording: allocation + "planned", never value / profit / guarantee.
- Earnings cap 25x ($7,500) per package (was 10x). Owner 2026-10-18: EVERY income counts toward it (level income, rank
  rewards, fast-start bonus): activation.engine creditIntoCap fills ACTIVE packages oldest first, spills to the next, the
  part over the cap stays with the company (never carried forward). Caps ADD UP: a member can add a $300 package (top-up)
  ANY time (dashboard canTopUp = activated + not root; was "only when every package is capped"), 2 packages = $15,000;
  GET /dashboard capTotalUsd / capEarnedUsd drive the cap meter. 5% withdrawal fee (taken from the amount). Withdrawal
  per request (owner 2026-10-19): minimum $10 (WITHDRAWAL_MIN_USD), maximum $5,000 (WITHDRAWAL_MAX_USD, was $50,000), never more than the
  available balance; checked in withdrawals.service request + the dashboard form (GET /dashboard withdrawalMinUsd /
  withdrawalMaxUsd, summary minimumUsd / maximumUsd; Max button = min(balance, max)). Contract maxPerClaim / dailyLimit and
  signer SIGNER_MAX_PER_CLAIM_USD (5000; contract maxPerClaim $5,000, dailyLimit $250,000) compare the NET amount (after the 5% fee) and may be lower (PRODUCTION-REMIX-DEPLOY 5A).
- No referral (owner 2026-10-18): nobody stays outside the tree. processActivation without a (known) on-chain sponsor and
  without a recorded one links the member under the company root (rootFallback) and places it on the root's LEFT; the
  join gate falls back to GET /dashboard companyCode ("DAOVAULT (DVxxxx)"); placeUnplacedPaid at start (after the root
  record exists) also links sponsor-less paid members to the root. check-plan runs under a throw-away TEST_ROOT (90 checks).
- Fast-start bonus (owner 2026-10-18; plan.ts FAST_START): 10 PAID directs (sponsor tree) counted from the member's own
  activation (joining date): within 3 days = "Rocket Start Bonus" $100, else within 7 days = "Fast Start Bonus" $50. ONE
  bonus per member (faster wins, never both), paid at once by the plan queue (awardFastStart after the 10th direct or the
  member's own activation), inside the 25x cap. EarningType FAST_START_BONUS (level = 3 / 7). Dashboard #fastStartCard (ABOVE #dvTokenCard, owner 2026-10-18: rocket badge, directs ring + bar from --fs-fill
  (@property, filled once on screen), soft sheen, open tier breathes; bonus rows = gold frame with a running light,
  rocket / bolt gold medallion, reward in a gold coin pill with a sheen, sparkles (green when earned, grey when closed); dashboard.ts riseIn = one rise-in on first view for
  both cards; lite / reduced motion static) (under the
  metric cards, ALWAYS shown: offer before activation, countdown + per-bonus rows, earned / closed; root = info only)
  GET /dashboard bonusUsd + fastStart (always sent, eligible=false for root); admin "rank rewards" totals include the bonus.
  Only directs who paid AT OR AFTER the member's own payment count (owner 2026-10-19: unpaid A, 10 directs pay, A activates
  -> no bonus); engine + dashboard ring; SQL compares (col AT TIME ZONE 'UTC') since the timestamp columns hold UTC without
  a zone and a local Postgres on Asia/Calcutta shifted them 5.5h (analytics.ts charts still compare plainly: fine on UTC DBs).
  Clock = ON-CHAIN payment time (owner 2026-10-18): packages.paid_at = the Activated / ToppedUp event timestamp
  (activation.service eventTime; future/unreadable = now); member join + directs use COALESCE(paid_at, created_at).
- Referral: `?ref=CODE` saved to `localStorage['daovault_pending_ref']`; the latest link opened before JOINING is the one the
  join card offers (2026-10-17; was "latest link wins until payment"); joining saves it (users.pending_sponsor_code) and drops
  the browser copy; activation pays with that sponsor from any browser.
- Pre-launch marketing (owner, 2026-10-13; replaces "only an ACTIVATED sponsor"): ANY registered wallet can sponsor, paid or
  not; members join (sponsor + placement) before payment. Contract has no sponsor check (only != self). An unpaid upline's
  commission / rank reward stays with the company (engine skips no_package) and is not paid back later.
  PAYMENTS_OPEN_AT (backend env, ISO; default 2026-11-10T00:00+05:30, owner 2026-10-13; past date = open): dashboard paymentsOpen/paymentsOpenAt -> activation card: only "Activation opens on <date>" + countdown (no other message, owner), button off
  until then (website only, no contract switch; check-plan has the pre-launch checks). Paying under an UNPAID sponsor:
  dashboard.ts shows core.ts confirmNotice first ("Your sponsor's ID is not active yet ... they will not receive a reward
  from your activation"; never mentions the company; owner 2026-10-14); resolveSponsor returns activated. Codes are `DV` + first 6 hex chars of wallet (longer if taken; the server value wins).

- Claim to collect + notifications (owner 2026-10-19): earnings.collected_at. LEVEL_COMMISSION is collected at once; RANK_REWARD and
  FAST_START_BONUS are credited (amount + 25x cap fixed) by the plan engine but reach the balance (withdrawals.service balanceOf,
  dashboard totals, income list) only after the member opens the box: POST /dashboard/:wallet/rewards/collect {kind rank|bonus}
  (self only, rank <= currentRank, one guarded update = once). GET /dashboard rankRewards / pendingRewards / rewardsWaitingUsd /
  fastStart.collected. Rank boxes (rewardVaults.ts renderRewardVaults(wallet, rank, rankRewards, collect)) = Ready to collect /
  Already collected; fast-start card #fastStartCollect; dashboard refreshAfterCollect re-renders + event dv:balance-changed.
  Migration 20261019120000_collect_rewards_notifications backfilled every older earning as collected.
  Owner 2026-10-20: opening a rank box / the bonus / the DV pot on the page DELETES its notifications (notifications.service
  removeLinked by link rank:N / bonus / dv; dv only once every token is revealed); dashboard.ts dispatches
  dv:notifications-changed and the bell reloads. A ready box / pot calls to be opened: light sweep, breathing gold glow,
  rising embers, pulsing label (last block of dashboard.css "Ready to open"; lite / reduced motion = static glow).
  Metric cards row 2 (owner 2026-10-19): #metricWaitingCard "Ready to Collect" (rewardsWaitingUsd, count, Collect -> link, gold
  pulse while waiting) + #metricAvailCard "Withdrawable Balance" (availableUsd, pending / withdrawn); dashboard.ts renderMoneyCards
  (also after a collect); dashboardFx 3D icon from data-icon.
  Notifications: table notifications (modules/notifications): notify() rows written in the SAME transaction as the event (level income
  per upline, rank reached / reward ready, bonus ready, DV tokens ready, withdrawal paid / returned); pushPending() claims rows once
  (pushed_at, FOR UPDATE SKIP LOCKED) and emits over socket.io (socket.ts: path /api/v1/socket.io, CORS + allowRequest = FRONTEND_URL
  origins like app.ts (any in development, no Origin allowed), JWT handshake, room per wallet,
  redis adapter with REDIS_URL, worker = redis emitter); pusher every 2s in each API copy + worker, kicked after each plan batch.
  GET /notifications?page&limit&filter=all|unread (+ unread, total), POST /notifications/read {id?}, POST /notifications/remove {id?}
  (no id = every read one). Retention (owner 2026-10-19): each member keeps only the newest 30 (KEEP_PER_MEMBER; trimmed right after every
  delivery in pushPending + daily), read ones go after 30 days, any after 90 (cleanupNotifications: worker auth-cleanup daily;
  API without Redis daily). Frontend notifications.ts = header bell #notifMenu (count, the 5 newest, × per item,
  "View all notifications" = full-history window: All / Unread tabs, 20 per page Load more, Mark all as read, Clear read; tap = scroll to the section), socket.io-client websocket first, polling fallback (Render rewrites have no
  websockets); Nginx location /api/v1/socket.io/ upgrades; Vite dev proxy ws: true. /health NEWEST_TABLES includes notifications.

## Layout
```
contracts/production/              mainnet copies of DAOvaultActivation.sol + DAOvaultPayout.sol (no TestUSDT) + README
                                   (values, SHA-256). Keep IDENTICAL to contracts/*.sol: re-copy after any contract fix.
contracts/DAOvaultActivation.sol   Solidity 0.8.20. activate(sponsor) / topUp() pull USDT via transferFrom and split it (owner,
                                   2026-10-13): 45% (PAYOUT_SHARE_BPS 4500) -> immutable payoutVault (= DAOvaultPayout, the
                                   withdrawal float, deployed FIRST), 55% -> immutable treasury. Constructor (usdt, treasury,
                                   payoutVault, amount). Backend refuses a payment contract whose payoutVault != PAYOUT_CONTRACT_ADDRESS.
                                   Emits Activated(user, sponsor, amount, timestamp). Any sponsor except the payer (2026-10-13).
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
                wallet, sponsor code, joined date; 50/page) -> frontend levelModal.ts (tap a 20-Level Downline row; a ranked member shows its rank crest as avatar, 2026-10-19)
    activation  POST /activation/topup/verify (re-entry, owner 2026-10-10: contract topUp() -> ToppedUp; processTopUp adds a
                package with its own 25x cap, uplines paid the 20 levels again, +1 DAO volume, no new direct. Commissions fill
                the OLDEST ACTIVE package and spill into the next; dashboard currentPackage/canTopUp -> "Top-up $300" card)
    activation  POST /activation/verify  (records ONLY a payment in a FINAL block (owner 2026-10-19, reorg safety):
                activation.service finalReceipt waits up to 25s for BSC "finalized" (1-2 blocks behind head; RPC without the
                tag = 3 confirmations), re-reads the receipt and checks its block is still canonical, else 503 "still being
                confirmed"; payment.ts untilRecorded retries 503 3x every 5s, then the pending retry on the next visit;
                verifies tx + Activated event on-chain, then activation.engine.ts processActivation:
                directs, 20-level commissions w/ unlock + 25x cap, team volume, 50:50 ranks + rank rewards; serializable tx)
    users       GET  /users/referral/:code  (invite code -> sponsor wallet)
                POST /users/register  (first dashboard visit: reserves the wallet's permanent code, no package/upline;
                processActivation keeps the record + code; any registered code can sponsor, paid or not)
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
  scripts/check-plan.ts    npm run check:plan: 99 engine checks (incl. owner-confirmed rules, plan queue, reservations) on the real DB, always rolled back
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
                                          Filters (owner 2026-10-18): ledger Daily / Weekly / Monthly = GET /admin/ledger?group=day|week|month
                                          (analytics.ts adminLedger: 30 days / 12 ISO weeks / 12 months, running treasury); withdrawals All / 7 / 30 days =
                                          GET /admin/withdrawals?period=all|week|month (+ count and net total). .ad-seg in admin.css.
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
           payment.ts (resolveSponsor, approve + activate + POST verify, retry pending),
           (browser closed at any moment, owner 2026-10-19: the tx hash is saved to localStorage the moment the wallet SENDS
           it, not after mining; settlePreviousPayment blocks a new pay / top-up while an earlier one is still recording; a
           saved tx the server refuses (4xx) for 10 min is forgotten; dashboard load retries it; the VPS indexer records it too), api.ts (backend calls),
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
    quiz.ts           "Crack the Vault" quiz above the footer (gold/red answers, 3D coins, canvas lightning, data-scene quiz);
                      QUESTION_BANK of 15 (owner 2026-10-18), 5 random per round, Play again = 5 others (pickRound)
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
  rank rule copy says "DAO Matching on Both Sides"; legs are "Left Leg" / "Right Leg" everywhere (was Strong / Other,
  owner 2026-10-18); #ranks leg card ends with .btn-leg-shine (gold outline + sheen) -> #rankCalcCard. CTA has only Connect Wallet. Flip hint says Tap on touch screens.
    landingFx.ts      nav scrollspy, "How to Join" progress rail / lit steps, initDropCards() ([data-drop] cards fall
                      from above then their .drop-body unfolds; used by the #vision DAO + VAULT = DAOVAULT cards); initJoinSteps(): #how expanding step
                      cards (one open at a time, auto-advance, progress stage)
  Also: preloader + header/footer brand use the DAOvault logo images (DAOlogo.jpg / favicon.png); loader counts 1%..100%;
  #how stage has electric arcs (landingFx electrifyStage); signal cards rise in ONCE on phones and stay (initSignalCardFlips, owner 2026-10-18: no flip-away, threshold 0.08; id-level CSS so the tap-glow transition cannot drop the fade);
  countdown digits drop in; gold buttons sheen; on phones the compare table and dashboard 20-level table become cards.
  Hero kicker pill (owner 2026-10-18): .kicker-seg spans; <=600px two centred lines + dot beside, font min(0.64rem, 2.75vw).
  Browser tab (owner 2026-10-19): every page <title> is just "DAOvault" (admin.ts too); tab icon = /favicon-tab.png?v=3 (owner 2026-10-19:
  the black square looked heavy on light tabs: transparent, trimmed gold DV made from favicon.png; bump v= on change);
  apple-touch-icon stays /favicon.png?v=2 (opaque for home screens). favicon.png itself unchanged (header, seals, coins use it).
  Brand copy: "DAOVAULT — Where Communities Build Wealth Together" (hero, #vision, CTA, footer, meta).
  Mobile: audited at 360/390/768/1024 with no horizontal overflow; see "Mobile hardening" block at end of main.css.
  GSAP cleanup must clear only animated props (ANIMATED_PROPS in scrollAnimations.ts), never clearProps 'all'.
  Performance: html.lite (inline <head> script: <=900px / <=4 cores / <=4GB) read via perf.ts LITE: particles 1300 @1x 30fps,
  no backdrop-filter / permanent will-change, static small logos, no dashboard 3D icons. core.ts initOffscreenPause pauses
  CSS animations of off-screen sections. Revealed [data-reveal] content must end with transform:none (crisp text).
  The hero has no WebGL any more (initHeroCore3D just mounts the dvLogo). Splash: SPLASH_MS 2800; repeat visits
  (dv_splash_seen < 24h) SPLASH_REPEAT_MS 1100. Page entries (owner 2026-10-19, black JPEG then logo pop): the HTML loads a
  tiny landing/dashboard/admin.entry.ts that mounts every [data-dv-logo] at once and then import()s app/dashboard/admin.ts;
  those start with core.ts whenReady (never a bare DOMContentLoaded listener: it has already fired). dvlogo.css keeps a
  logo's fallback <img> invisible until mounted (shown after 2.5s only without JS). CSS stays in HTML <link>s; admin links
  main.css + admin-page.css (@import dashboard.css + admin.css: imported apart, the build put dashboard.css after admin.css).
    dashboardFx.ts    card cascade, rollNumber(), pointer spotlight, 3D metric icons, celebrate() confetti
    Dashboard particles (owner 2026-10-18): sections carry data-scene dashTop / dashRewards / dashRanks / dashTeam /
                      dashIncome (particleScene SCENE_STATES): logo, DV mark, dial with lightning beside the cards while scrolling.
    Tap glow (owner 2026-10-18, like the Arbit landing in gold, SOFT: a gentle 2px lift over 0.6s, no press-jump): core.ts enableTouchPress;
                      phone: the tapped card STAYS lit (.tap-glow) until another card or outside is tapped; desktop click = brief glow;
                      last block of main.css = gold border + light halo + faint inner glow, 0.45s fade.
    matrixDial.ts     #matrix "Explore Any Generation" interactive SVG vault dial (drives the hidden level pills;
                      app.ts autoplay steps a level every 2s while .matrix-calc-box is on screen)
    rewardVaults.ts   wallet menu "Go to" shortcuts (data-jump: only Withdraw + Rewards, owner 2026-10-11; was also Rank, Invite,
                      20 levels, Income; smooth scroll + .jump-flash; hidden sections left out). Owner 2026-10-11.
                      Dashboard: is-offscreen never pauses .lvl-row / .reward-box entrances (rows went blank on fast phone scroll).
    rewardVaults.ts   dashboard #rewardsSection: 11 rank boxes (locked/ready/opened; opened = server mask, opens once,
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
  Wallet modal (owner 2026-10-10): MetaMask, Binance, Trust, TokenPocket (tpdapp:// deeplink), SafePal (link.safepal.io app link,
  window.safepalProvider), Other; dark-gold lifted theme (#walletModal block, end of main.css).
  Android (owner 2026-10-20): Binance, SafePal and TokenPocket open through intent:// links for their package (bnc scheme /
  link.safepal.io verified app link / tpdapp) with a Play Store fallback, so no "did not open" notice (openWalletApp skips it
  for intent links); MetaMask / Trust keep their https universal links. iOS: Binance http link, SafePal https link.
  Wallet modal footer (owner 2026-10-12): "Joining under DV…" replaces "Earnings Cap 25×" (app.ts showJoiningUnder: ?ref or
  saved code, checked with GET /users/referral/:code; amber "Invite DV… not found"; no code = "DAOVAULT"). The bigger
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
  Logging (owner 2026-10-18): pino JSON lines (config/logger.ts; level as text, ISO time, host; redacts cookies,
  Authorization, password/token/privateKey/signature fields; LOG_LEVEL, LOG_PRETTY=false for JSON in dev, pino-pretty in
  dev); requestLogger = pino-http (req id from requestId, which rejects unsafe x-request-id; path only, no headers/body/
  query; health skipped; 5xx error, 4xx warn); captureConsole() in server.ts / worker.ts / signer turns console.* into
  JSON lines (CLI tools keep plain console). morgan removed. DEPLOYMENT.md 18 = reading logs, 19 = UptimeRobot.
  Monitoring: config/alerts.ts = "[alert]" lines in the server log only (via the logger, field alert=<level>) (owner 2026-10-13 REMOVED Telegram: no bot, no
  activity messages, no daily summary; do not re-add), deduped, no secrets, from errorHandler 5xx, crashes,
  payout/signer failures, float low, session theft, admin sign-in, worker job failures; jobs/watch.ts every 2 min in the
  worker (API every 5 min when no REDIS_URL). config/cache.ts caches dashboard member counts 120s.
  Backups: docker/backup/backup.sh (gzip -t + alert), offsite.sh (rclone crypt, profile offsite, secrets/rclone.conf),
  restore-test.sh (throwaway DB). DOCKER.md B13-B16.
  Also: "PAID BUT NOT RECORDED" (activation.service after the on-chain event checks out + chain indexer refusals, one key per
  tx), config mismatch alerts. Sponsor policy: the dashboard pays with the recorded upline; an on-chain sponsor that differs
  moves the tree only if the member's team has no payment yet, else the recorded tree is kept + [alert] (ACTIVATION-FLOW.md).
  Launch traffic (owner 2026-10-13, measured on the dev PC, 1 Node copy, 200 conns): health ~2.5k req/s, invite lookup ~1.5k,
  dashboard ~350 req/s, plan queue ~92 payments/s. Per-IP limits sized for CGNAT shared mobile IPs (API 1200/min, auth
  600/15min, financial 200/min; Nginx api 100r/s, auth 20r/s) + per-wallet sign-in limiter (authWalletRateLimiter,
  AUTH_WALLET_RATE_LIMIT_MAX 20), also in render.yaml (owner asked, 2026-10-13). VPS env (owner 2026-10-18): ONE file, root .env.prod
  (git-ignored; every key, secrets filled, contract addresses / tunnel token / INDEXER_START_BLOCK empty until known); compose
  reads it as --env-file AND env_file of backend + worker. All *.example templates and the old root .env.production /
  backend/.env.prd were removed; local dev keeps backend/.env + frontend/.env. activation.service caches the payment contract's immutable config per address.
  Render backend is the free plan: not for launch traffic (VPS / paid plan + paid RPC).
  Review fixes (2026-10-14): withdrawals reserve payout capacity (reservedPayout: open unexpired vouchers + requests being
  signed, checked inside the serializable create; voucherAmount set at create; unsigned >5 min released); on-chain sponsor
  != recorded upline -> tree follows the chain if the team has no payment yet, else kept + [alert] (result.sponsorMismatch;
  the dashboard pays with dashboardData.sponsorCode first); package amount = the contract's activationAmount (decimals read),
  env mismatch -> [alert]; indexer refuses to start without INDEXER_START_BLOCK (no cursor). transferOwnership(0) is not a
  bug (two-step: owner stays until accept; contract test proves it). 2nd review: reservedPayout(tx, checkedAt) also counts
  vouchers settled after the chain read (non-atomic snapshot). Contract tests: 24/24 (run in an isolated hardhat copy).
  Review round 3 (2026-10-14): plan.ts toCents parses decimal strings exactly (no float multiply; numbers via toFixed(6),
  half-up; refuses > MAX_SAFE cents); dashboard money via cents; admin stats/analytics money-in = SUM(packages.package_amount);
  start.mjs EXITS on a failed migration; redis.connect() not awaited (API runs degraded); watch steps isolated; unsigned
  requests released even with payouts off; a capacity refusal settles open vouchers and retries once; API (no Redis) settles
  vouchers every 60s; teamHasPayment() shared + depth-guarded; sponsorMismatch "loop"; signer mounts ONLY ./secrets/signer;
  backend/src/tools/checkEnv.ts (npm run check:env / dist/tools/checkEnv.js) verifies prod settings vs chain; DOCKER.md B17
  = VPS cutover checklist (keep Render until it passes). /health = database up AND newest tables present (NEWEST_TABLES in
  health.routes.ts: add a new migration's table there), else 503. Migrations: start with SET lock_timeout = '10s' (a stuck
  lock fails the deploy, never blocks the site); on BIG tables (after launch) add indexes with CREATE INDEX CONCURRENTLY, ONE
  statement per migration file (it cannot run inside a multi-statement transaction). Withdrawals has 7 indexes: add no more
  without a query that needs one. Load test: src/tools/loadTest.ts (dist/tools/loadTest.js; LOAD_USERS/SECONDS/SIGNIN,
  LOAD_CLEANUP=1 removes the seeded test wallets), DOCKER.md B17.
  Load test found (2026-10-14): parallel sign-ups hit P2034 in a SERIALIZABLE register -> 500s. register() is now a plain
  create guarded by the unique wallet / code constraints (P2002 -> return the winner or pick the code again): 400/400 ok.
  serializable() retries 10x with exponential backoff + jitter. Verified: 100 activations at once under one sponsor ->
  100/100 recorded, 000 L1 exact; HTTP 100 signed-in users, 0 errors.
  Admin / company wallet (owner 2026-10-15): the dashboard never shows #activationCard or #withdrawSection to an isAdmin
  wallet, in any view (also ?view=member); .dash-content-grid.is-single; the Withdraw menu shortcut hides with it; the
  server refuses an admin withdrawal (403, withdrawals.service request).
  Launch gate (owner 2026-10-18): dashboard.ts gateLaunch hides #activationCard, #incomeCard, #withdrawSection (+ .is-single)
  until PAYMENTS_OPEN_AT; an open page reloads itself at that moment (clock ahead of server = recheck in 60s; the activation
  countdown no longer reloads); withdrawals.service request refuses (403) before it. render.yaml sets PAYMENTS_OPEN_AT to a
  past date (Render = testing, shows all now; remove before launch there; VPS leaves it unset = 10 Nov). Withdraw box = .wd-* layout (dashboard.css end): Max button #withMaxBtn, fee label #withFeeLbl.
  Withdrawal flow (owner 2026-10-19): the member pays the network fee and claims with the wallet (claim(); a gas-free relayer
  was built and REMOVED the same day, contracts unchanged); never mention fees / technical terms. Pressing Withdraw swaps
  #withForm for #withFlow: 4 pills (Amount, Confirm, Sending, Received) + ONE card at a time (dashboard.ts setStage:
  verify / preparing / confirm / sending / arriving / done; Sending has a 3-line checklist; done = full success screen with
  +net USDT, transaction link, Done button); errors return to the form with a toast. ?wdDemo on the dev server walks it
  without sending. (The withdraw-preview.html review page was deleted 2026-10-19.)
  Dashboard 20-level rows open the level modal whenever the level has members (locked levels are viewable, owner).
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
  amber dot, "sample •" per line). Never label sample data as live. From payments open on (GET /activity/recent?v=2 ->
  {items, live}; live = PAYMENTS_OPEN_AT passed, remembered in localStorage dv_pulse_live) NO samples ever: real events
  or "Waiting for the first activation" (owner 2026-10-15). Without ?v=2 the route still returns the plain list.
  FAQ (owner 2026-10-12): gold-themed cards with numbered questions; open/close is a grid-row 0fr->1fr transition
  (landingFx initFaqAccordion wraps content in .faq-answer-inner; max-height made the close jump); plain plan-accurate answers.
  Rank calculator: data-unfold (unfoldCard.ts): scrolling down it drops in from above and its content opens top-down,
  scrolling up it rises from below and opens bottom-up (clip-path, replays after it leaves); gold-only internals,
  slider gold fill via --fill (rankCalculator.ts); the quick-target pill of the rank the numbers reach gets .is-active
  (markPill, owner 2026-10-18: typed / +- team size selects its pill; ranks without a pill light none);
  Results cards = raised 3D gold panels with a staggered light sweep, slider pin = 3D gold ball on a sunken glossy track
  (end of main.css, owner 2026-10-18); texts plain (no literal &bull;, no "instant cash", no emoji).
  Mobile nav (owner 2026-10-13): <=960px the header is one floating gold capsule (logo, Connect Wallet, 2-line menu
  button #mnavToggle); landingFx initMobileNav opens #mnavPanel (numbered sections with icons, active highlight, Connect
  CTA), tap = close + smooth scroll below the header. Tap glow never changes the transform of .matrix-stack-card,
  #rankDisplayCard or .flip-card-wrap (scroll animations own it; changing it made the level cards vanish on tap).
  Status-bar space (owner bug 2026-10-15): header / toast / mobile-menu tops use var(--safe-top) = 0 in browsers and wallet
  in-app browsers (Android 15 edge-to-edge WebViews report the status bar as safe-area-inset-top: the capsule header slid
  down and the page showed above it); env(safe-area-inset-top) only under display-mode standalone/fullscreen (end of main.css).
  Four pillars (#about) retitled "Four Rules That Keep It Fair & Balanced", gold-only.
  #bonus (owner 2026-10-18, between #matrix and #about): "Start Fast, Earn Extra" = Rocket Start $100 / Fast Start $50 cards,
  Day 0-3-7 timeline, two notes (one bonus; directs = referral link + activated; the credited/25x note and "(72 hours)"
  removed by the owner 2026-10-18; bottom padding tightened); data-scene "bonus" (logo); .fsb-* in main.css.
  #matrix level cards (owner 2026-10-11): matrixAutoDeck.ts revealCard on every active-card change (after the deck
  reaches 70% of the screen): .mx-scan light sweeps down, content drops in piece by piece, % and USDT count up; CSS
  `.mx-reveal` block at the end of main.css, removed after 2.4s so the cards' own loops return; off for reduced motion.
  The deck observer stays on (owner 2026-10-19): leaving the screen resets revealedTier, so the active card replays its
  arrival every time the deck comes back. .meter-info wraps (label shrinks, value margin-left:auto) so meter lines never
  run past a card on phones.
  Landing "We go live on 22 October" notice REMOVED (owner 2026-10-21). Hero countdown (app.ts initCountdown) = 2 stages in the
  same place: until VITE_LAUNCH_DATE (22 Oct) "Official Genesis Mainnet Launch", then until VITE_PAYMENTS_OPEN_AT (Docker build arg = .env.prod
  PAYMENTS_OPEN_AT, required; code default 2026-11-10 IST) "ACTIVATION STARTS ON 10 NOVEMBER", then hidden. Dashboard notice stays once.
  CSS for the motion layer is the last block of main.css and dashboard.css ("TPR motion layer").
  styles: src/styles/main.css (large, ~4.7k lines), dashboard.css
```

## Commands
- Backend: `cd backend; npm run dev` | `npm run typecheck` | `npx prisma migrate dev` | `npm run db:seed:local`
- Frontend: `cd frontend; npm run dev` | `npm run build`
- Docker (owner 2026-10-11; plain npm run dev unchanged): dev `docker compose -f docker-compose.dev.yml up --build`
  (own Postgres on 5433, code mounted, vite.config.js DOCKER/API_PROXY_TARGET); prod `docker compose --env-file
  .env.prod -f docker-compose.prod.yml --profile tunnel up -d --build` (db, backend, web = Nginx in frontend/nginx/,
  cloudflared, backup, redis). Scaling (owner 2026-10-11, 4-core VPS): backend deploy.replicas BACKEND_REPLICAS (default 3),
  Nginx round robin via Docker DNS, REDIS_URL -> shared rate-limit store (config/redis.ts, rate-limit-redis; unset = memory),
  Postgres tuned (shared_buffers 1GB, parallel 4), connection_limit=10 per copy. env.ts: empty optional values = unset.
  Owner guide: DOCKER.md. Docker is NOT installed on the dev PC and nothing
  builds the images yet: ci.yml + render.yaml stay Render-only until the owner moves to the VPS (owner 2026-10-11).
- Git: GitHub Reveda/daoVault, branch main. Tests: backend `npm run check:plan` (99, rolled back), `npm run check:env`
  (prod settings vs chain), contract tests in contracts/test (24, Hardhat; run in an isolated copy).

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
