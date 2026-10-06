# TPR World — Reference Teardown

Source studied: https://tprworld.org/index.html?ref=TR18AF8C15 (fetched 2026-10-06, asset version `v=2026100301`).
DAOvault uses TPR as its UX/design benchmark. Only TPR's frontend is public; its backend below is inferred from the API calls in its JS.

---

## 1. What TPR actually is (differs from DAOvault's plan)

| | TPR | DAOvault (`project.md`) |
|---|---|---|
| Entry | 1 NFT for a fixed **0.0007 BTC** (BSC) | Fixed **$300 USDT** package |
| Earnings | Free memecoin rewards (SHIB/PEPE/BONK/FLOKI) in "surprise boxes" at referral milestones; pool + "lifetime royalty" promised later | 20-level commissions (40%), 11 rank rewards, 10x cap, 5% withdrawal fee |
| Big prize | "Top 127 Achiever" bonanza: luxury cars + family trips, by order of completing the top matrix level | Rank pool up to $100,000 |
| On-chain | **None in code yet.** Wallet is used only to get the address ("no signature, no transaction") | Activation contract + backend on-chain verification |
| Dates | Free-referral phase closes 17 Oct 2026; launch 18 Oct 2026; withdrawals 18 Nov 2026 | — |

## 2. Frontend architecture

- Static HTML + **vanilla ES modules, no build step, no framework**. three.js vendored at `assets/vendor/three/`. Hosted on Vercel (static), API on a separate PHP host.
- Pages: `index.html` (landing), `dashboard.html` (connect + member area; all business logic is in a ~2,500-line inline script), `referrals.html` (full referral list), `admin.html` (admin panel, inline script).
- Modules in `assets/v2/`:
  - `core.js`: shared helpers: `safe(name, fn)` (each feature isolated in try/catch), `bootScene()`, `initHeader()`, `spyOn()`, `initCountdown()`, `initReveal()`, `bindTabs()`, `LAUNCH` date.
  - `app.js`: landing behaviour (tiers carousel, ecosystem accordion, join progress line, roadmap, FAQ).
  - `scene.js`: background particle engine (83 KB).
  - `giftbox.js`: 3D surprise-box opening (`window.TPRGift.open({...})`, GLB model `assets/v2/box/tpr-box.glb`).
  - `dash.js`: dashboard look (scene switching, count-ups, progress bars, card spotlight, tiny 3D stat icons).
  - `applink.js`: social links open the native app on Android (intent:// + fallback) and iOS (scheme + 1.6s web fallback).
- CSS: `base.css` (tokens/reset), `app.css` (landing), `dash.css`, `members.css`. Font Awesome 6.5 from cdnjs.
- Token logos are inlined as base64 webp in `window.TPR_COINS`, so they can't fail to load. There's also an img `onerror` retry, then a letter-badge fallback.

## 3. Design system

```css
--ink:#050716; --ink-2:#080c24;              /* background (theme-color #06051a) */
--glass:rgba(9,13,38,.58); --glass-2:rgba(14,20,54,.72);
--line:rgba(0,240,255,.14); --line-2:rgba(217,70,239,.22);
--text:#cbd5e1; --muted:#8492a6;
--cyan:#00f0ff; --blue:#38bdf8; --violet:#8b5cf6; --magenta:#d946ef;
--amber:#fbbf24; --gold:#f59e0b; --lime:#00e676; --red:#f43f5e;
--grad: linear-gradient(95deg,#00f0ff,#38bdf8 26%,#8b5cf6 64%,#d946ef);
--grad-gold: linear-gradient(100deg,#fffbeb,#fde047 30%,#f59e0b 70%,#d946ef);
Fonts: Outfit (display) · Plus Jakarta Sans (body) · Inter · JetBrains Mono (numbers)
--wrap:1320px; --pad:clamp(18px,4vw,52px); --r:20px; --ease:cubic-bezier(.2,.75,.2,1); --top-h:84px;
```
Page layers: `.bg-wash`, `canvas#scene`, `#flash` (lightning flash overlay), `.grain`, `.loader`. Header is a floating pill nav (`.top`, gains `.scrolled` after 12px).

> DAOvault's current `main.css` uses a **black + gold** palette (`--bg-dark:#050505`, `--gold:#d4af37`), not TPR's cyan/violet. Changing it is a product decision. Ask before switching.

## 4. Landing page (section order → `data-scene` → particle shape)

| Section `id` | data-scene | Particle shape | Content |
|---|---|---|---|
| `hero` | hero | TPR logo | Headline, 2 CTAs, countdown (d/h/m/s), double-track ticker |
| `bonanza` | bz1 / bonanza / bzlock | trophy, then **cars** (one per tab), then ring | "Top 127 Achiever Rewards": 7 position tabs auto-rotate every 8s with a timer bar; card tilt + glare; `$` figures count up |
| `about` | manifesto | globe | What is TPR + stat strip |
| `features` | ecosystem | blocks; per-pillar shapes (nft, network, infinity, coins, pool, crown, wallet) | 8-pillar accordion; the 3D shape changes with the open pillar |
| `how` | steps | helix | 5 join steps with a scroll-driven progress line (`.jstep.lit`) |
| `roadmap` | roadmap | galaxy | Phases with `data-until` dates; JS marks past/now |
| `earn` | earn | nova | Reward types |
| `faq` | faq | bubbles | `<details>` list, one open at a time |
| `join` | cta | nova (high "storm") | Final CTA |

Every "Connect Wallet" button on the landing page links to `dashboard.html?connect=1`, which opens the wallet list immediately.

## 5. 3D scene engine (`scene.js`)

- One `THREE.Points` cloud (custom shaders, simplex noise) that **morphs** into a different shape per section. On section change it scatters into a swirl and re-forms (`MORPH_DUR = 2.3s`).
- `STATES` table per scene: `shape, anchor (CSS selector to fit into), fit, x, y, s, tilt, spin, op, storm, hue, shimmer, size`.
- Random **3D lightning bolts** hit the shape; `onFlash(v)` flashes the page via `#flash` opacity. `storm` sets how often.
- Shapes are procedural (globe, ring, helix, galaxy, nova…) or sampled from images (logo, cars from artwork).
- API: `createScene(canvas,{scene,onFlash})` → `{ready, intro(), setScene(name), setShape(section, shape)}`; landing tabs set `window.TPR_SCENE_OVERRIDES[section] = shape`.
- Loader: the counter eases toward a goal that rises as fonts, then scene, then a minimum time complete; hard cap 4.5s so the page is never held hostage. `<html>` gets `.ready`; `.no-webgl` is the fallback class.

## 6. Wallet connection (dashboard inline script)

1. **Discovery:** listen for `eip6963:announceProvider` + dispatch `eip6963:requestProvider`; also `window.ethereum`, `ethereum.providers[]`, `window.safepalProvider`.
2. **Picker** (`#walletPickerOverlay`): fixed rows MetaMask / Trust / SafePal / Binance (tagged "Installed" or "Open app"), then any other installed wallet, then **WalletConnect** ("300+ wallets").
3. Mobile, wallet not installed: deep link into the wallet's in-app browser carrying `?ref=`:
   MetaMask `https://metamask.app.link/dapp/<host/path>`, Trust `https://link.trustwallet.com/open_url?coin_id=20000714&url=<enc>`.
4. **WalletConnect v2:** lazy `import("https://esm.sh/@walletconnect/ethereum-provider@2.23.10?bundle")`, `projectId` from `<html data-walletconnect-project-id>`, `chains:[56]`, `optionalChains:[56,97]`, dark QR modal. The account is cached in `localStorage.tpr_wc_account`.
5. Robustness: `waitForProvider(3000)` polls + `ethereum#initialized`; `pageshow` with `persisted` causes a reload (bfcache loses the provider); `chainChanged` causes a reload; `accountsChanged` re-runs the flow.
6. **Silent restore:** `eth_accounts` on each candidate. `html.wallet-restoring` hides the connect card for up to 2.5s so returning users don't see it flash.
7. **Logout:** sets `sessionStorage.tpr_manual_disconnect` (stops auto-restore), disconnects WC, and goes to `index.html`.
8. All addresses are **lowercased** everywhere (wallets disagree on checksum casing).

## 7. Member flow after connect

`handleAccounts` → admin check (in the background, shows the Admin link) → **quiz gate** → `showDashboard`:
1. **Quiz:** 5 random questions from a client-side bank; the user must pick the right answer to advance; always passes. Saved via `quiz-progress.php`. The localStorage flag `nexadon_verified_<wallet>` is re-validated against the server.
2. `users.php` POST `{wallet_address, referral_code, referred_by}`. The server returns the canonical `referral_code` and `existing` (if `false`, local claim/social caches are wiped).
3. `user-stats.php` gives the referral count. Ranks reached, boxes and progress bar render from it.
4. `claims.php` sync: the server is the source of truth (pending claims are re-sent; stale local claims are cleared; review status is approved/rejected+reason).
5. `notices.php` admin news strip + one-time popup, then **auto-open** the first unopened box once per session.
6. `referral.php` POST `{child_address, referral_code}` registers the sponsor link. `"ADMIN"` = joined without a referral (resolved server-side).
7. `referral-list.php` lists the newest 5 referrals (full list on `referrals.html`).
- Referral code format: `TR` + first 6 hex chars of the wallet + 2 random digits; the server keeps the first one issued. Pending ref key: `trade111_pending_ref`.
- **Rewards:** 10 milestones (1, 5, 10, 25, 50, 100, 250, 500, 750, 1000 referrals → Starter … Legend). Amounts are in Lac/Cr and admin-editable via `reward-tiers.php`. Milestone 1 is "self activation".
- **Social gate:** before collecting the first box (and again before withdrawing), the user must open Instagram, X, YouTube and Telegram; each ticks after 4s. Recorded via `social-follow.php`.
- "Reward waiting" floating pill appears when a ready box is off-screen. Withdraw is locked until `WITHDRAW_OPENS`.
- Share uses `navigator.share`; copy uses `navigator.clipboard`.

## 8. Backend (PHP, inferred). Base `window.TPR_API = "trade111-api/"`

`apiFetch(path, opts, ms)` wraps `fetch` with an AbortController timeout (default 6s). All responses are `{success, ...}`.

| Endpoint | Method | Purpose |
|---|---|---|
| `users.php` | POST | Register/upsert wallet → `referral_code`, `existing` |
| `referral.php` | POST | Bind child to referrer code (`ADMIN` allowed) |
| `user-stats.php?wallet=` | GET | `total_referrals` |
| `referral-list.php?wallet=` | GET | `referrals[{wallet_address, created_at}]` |
| `quiz-progress.php` | GET `?status=` / POST | Quiz completion |
| `claims.php?wallet=` | GET | `claims[{milestone, status, reason}]` |
| `claim-reward.php` | POST | `{wallet_address, milestone, rank_name}`; 403 if rank not reached |
| `reward-tiers.php` | GET | Admin-set token amounts per milestone |
| `social-follow.php` | GET `?wallet=` / POST | Social-follow done flag |
| `notices.php` | GET | `{strip, popup}` news |
| `admin-check.php?wallet=` | GET | `is_admin` (table `admins`) |
| `admin-stats.php?wallet=` | GET | Totals |
| `admin-panel.php` | GET `?action=` / POST `{action}` | `joins, claims, levels, tokens, notices, user, tiers` / `tiers_save, claim_review, notice_save`; `give-token.php` |

**Admin panel:** user table (paged), rank achievements, give token, edit reward tiers, daily joins, claim review (approve/reject with reason), level breakdown, token totals, edit news strip/popup, per-user dashboard drill-down.

## 9. TPR weaknesses: do NOT copy

- **Admin auth = a wallet address in the query/body, no signature.** The admin wallet is also hardcoded in public JS. Anyone can call admin endpoints. DAOvault must use a signed nonce (SIWE/EIP-4361 or EIP-712) → JWT, and check roles server-side.
- User endpoints also trust a bare `wallet` param, so anyone can read or post for any wallet.
- Claim and social state lives in localStorage first; the quiz answer key ships to the client.
- No on-chain payment verification at all. DAOvault's `POST /activation/verify` is already stronger.
- Server data goes into `innerHTML` in places (XSS risk); `alert()` is used for the share fallback.

## 10. Worth adopting in DAOvault

- `?connect=1` deep link from every landing CTA; silent restore with the `wallet-restoring` anti-flash; `pageshow`/bfcache reload; `waitForProvider`.
- WalletConnect v2 lazy-loaded (chains 56, optional 97) as the universal fallback.
- `safe()` per-feature isolation; a loader that never blocks more than 4.5s; `.no-webgl` fallback.
- One morphing particle cloud with per-section `STATES` instead of many separate 3D canvases (lighter on mobile).
- Server as the source of truth for every dashboard number, with a local cache only for instant first paint.
- The admin-editable notices strip/popup and claim review queue (built on proper auth).
- `applink.js` pattern for social links; inline critical images.

## 11. Mapping to existing DAOvault files

| TPR | DAOvault today (motion layer ported 2026-10-06) |
|---|---|
| `core.js` | `frontend/src/scripts/core.ts` (referral capture, preloader, countUp, reveal with stagger) |
| `scene.js` | `particleScene.ts`: own implementation, gold palette, shapes dust → network/trophy/pyramid/shield/blocks/helix/nova/galaxy; anchors = `.scene-slot` beside headings |
| hero logo | `scene.ts` `initHeroCore3D` + `mountLogoVideo` (logo video on a disc; orbit rings/coins removed at the user's request) |
| `app.js` header spy, join progress | `landingFx.ts` |
| `dash.js` count-ups, spotlight, 3D stat icons | `dashboardFx.ts` |
| wallet inline script | `wallet.ts` + `walletDialog3D.ts` (no WalletConnect yet) |
| `giftbox.js` | not ported (no surprise boxes in DAOvault); `celebrate()` confetti on activation |
| bonanza tabs | `rankGameCard.ts`, `matrixAutoDeck.ts` |
| PHP API | `backend/` Express + Prisma (typed, rate-limited, on-chain verified) |
