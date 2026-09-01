# Web of Life — Meta Catalogue Advertising: Project Handoff

Last updated: 2026-09-01
No tokens, secrets, card details, or credentials appear anywhere in this file.

## 1. Core Meta assets (never recreate any of these)

| Asset | Name | ID |
|---|---|---|
| Business Portfolio | WEB OF LIFE DESIGN LAB | `398895781164523` |
| Ad account (correct, business-owned — use this one only) | web of life design lab | `1075411968370666` |
| Ad account (DO NOT USE — see §5) | — | `537419933409358` |
| Catalogue | WOL catalog API test | `4026302901007451` |
| Product set — primary, in use | Collector & Specifier Collection | `2581637935599998` (22 products) |
| Product set — secondary, not yet used | Collectible Design Objects | `1400370004773130` (69 products) |
| Product set — Meta default | All Products | `28545428685060798` |
| Website Pixel/Dataset (correct, genuine Web dataset — use this one) | web of life website | `2962661034068063` |
| Old dataset (App-typed, NOT a real web pixel — see §5) | Web of Life Commerce (App) | `2795537464153509` |
| Meta App | Web of Life Commerce | `2795537464153509` (same ID as above — Marketing API product added, App Mode: **Live**) |
| System user (correct, in use) | wolcatalogautomation | `122095789695459032` |
| System user (appeared on its own, untouched, not created by us) | Conversions API System User | `122098555857463822` |
| Facebook Page | Web Of Life Design Lab | `109428295136105` |
| Instagram | @weboflifedesignlab | `17841439622357696` |

## 2. Live campaign structure

| Object | ID | Status | Budget |
|---|---|---|---|
| Campaign — "Collector & Specifier Collection — Catalogue Sales (Test)", objective OUTCOME_SALES | `120253113510360785` | **ACTIVE** | — |
| Ad Set A — Hyderabad High Intent (city, 30mi radius) | `120253113519570785` | **ACTIVE** | ₹500/day |
| Ad Set B — India Luxury-Design Metros (Delhi, Mumbai, Bengaluru, Chennai, Pune, 25mi each) | `120253113521800785` | **ACTIVE** | ₹250/day |
| Ad A (under Ad Set A) | `120253133223210785` | **ACTIVE** | — |
| Ad B (under Ad Set B) | `120253133224590785` | **ACTIVE** | — |
| Creative — dynamic catalogue creative, product_set `2581637935599998` | `2003372646992913` | — | — |

**Combined configured daily budget: ₹750/day.**

Both ad sets: ages 30–60, interests (Interior design `6002920953955`, Architecture `6004140335706`, Luxury goods `6007828099136`, Furniture `6003132926214`), Advantage+ audience expansion **off**, Facebook + Instagram placements, destination **Website**, `promoted_object` = product set `2581637935599998` + pixel `2962661034068063` + `custom_event_type: CONTENT_VIEW` (not Purchase — no verified purchase-conversion signal exists yet).

Creative copy: *"Collectible furniture, sculpture and objects shaped through material, craft and experimentation. Discover selected works by Web of Life Design Lab."* — dynamic `{{product.name}}` per catalogue item, CTA **Learn More**, links to each product's `shop.weboflife.in` page.

## 3. Current launch state

**LIVE as of 2026-09-01.** Activated with explicit owner approval after a full QA pass (all objects, all IDs, all budgets, all targeting verified via API read-back before activation): campaign and both ad sets/ads switched to ACTIVE at **₹500/day Hyderabad + ₹250/day Metros = ₹750/day combined**. No Meta warnings or delivery errors were returned at launch. Spend at the moment of activation: **₹0** (delivery/spend typically begins after Meta's brief post-activation ad review completes — both ads showed `effective_status: IN_PROCESS` immediately after activation, which is normal and not an error).

## 4. Website / repo paths and tracking state

**Shop — `shop.weboflife.in`**
- Repo: `/Users/weboflife/Desktop/wol-meta-catalog` (GitHub: `weboflife/shop`)
- Deploys from `main` via GitHub Pages (automatic on push)
- Pixel tracking (PageView + ViewContent on all 91 META_FEED_READY product pages + Contact on all WhatsApp links) is **live in production**, `META_PIXEL_ID = 2962661034068063` in `scripts/lib/config.js`
- Three unrelated, pre-existing files have uncommitted local changes that predate this project's pixel work and were deliberately left untouched throughout: `docs/CATALOGUE.md`, `scripts/lib/config.js` (an `ALLOWED_AVAILABILITY` enum fix), `scripts/sync-to-meta.js` (a real-write implementation). Someone should review and either commit or discard these.

**Main site — `weboflife.in`**
- Repo/worktree: `/Users/weboflife/Documents/Claude/weboflife-site`
- Deploys via the Codex/ChatGPT Sites pipeline (remote `git.chatgpt-team.site`) — Claude has no credentials to this remote; deployment always requires manually handing a commit to that session
- Pixel tracking (PageView + Contact; no ViewContent — this site's catalogue data has no price field and only ~40% of its slugs match the shop catalogue) is **live in production**, deployed as commit `57629753d1dd7e2a5fdacc21b3da82f21fbc8b1a` ("Sites Version 40"), `META_PIXEL_ID = 2962661034068063` in `app/lib/meta-pixel.ts`
- **Legal pages (`/privacy`, `/terms`, `/data-deletion`) — confirmed LIVE.** Deployed as commit `3c017c563dd39f22ac166c1249acae192310c68e` ("Sites Version 41"), correctly based on production `57629753d1dd7e2a5fdacc21b3da82f21fbc8b1a` with zero unrelated changes (verified via diff). An earlier attempt deployed the wrong commit (`b7f39e7`, based on a stale parent) and produced live 404s — that was caught and corrected. All three routes independently re-verified returning HTTP 200 in production, and existing Meta Pixel/tracking confirmed unchanged by this deploy. These pages were the prerequisite for the Meta App Review "Live" mode switch, which has also completed.

## 5. Token security state

- The Meta system-user access token was pasted directly into chat twice during this project and rotated both times as a result — current token (in `.env`) was generated after using Meta's "Revoke all tokens" control on the prior ones.
- Current token verified with all required permissions: `catalog_management`, `business_management`, `ads_management`, `ads_read`, `pages_show_list`, `pages_read_engagement`, `instagram_basic`, `instagram_shopping_tag_products`, `public_profile`.
- `.env` is gitignored and confirmed never committed to the repo.
- No token has ever been printed, logged, or committed by Claude during this project.

## 6. Never recreate / never touch

- Business Portfolio `398895781164523`
- Catalogue `4026302901007451` and both product sets (`2581637935599998`, `1400370004773130`)
- Dataset `2962661034068063` and the old App-typed dataset `2795537464153509` (still connected to the catalogue's `external_event_sources` alongside the new one — never disconnected, leave as-is unless explicitly instructed otherwise)
- App `2795537464153509` ("Web of Life Commerce")
- System user `122095789695459032` (`wolcatalogautomation`)
- Page `109428295136105`, Instagram `17841439622357696`
- **Ad account `537419933409358`** — a personal ad account (not a Business Portfolio asset) holding a ₹7,811.41 balance unrelated to this project. Never use it, never touch its balance. The only correct ad account is `1075411968370666`.

## 7. Monitoring plan

- Check Ads Manager delivery daily for the first week: spend pacing, CTR, CPC, and Content View volume (optimization goal is `CONTENT_VIEW`, not Purchase — there is no verified purchase-conversion signal yet, so ROAS/purchase metrics will not be meaningful).
- Manually track WhatsApp enquiry volume against campaign launch date — there is no automated attribution linking a specific WhatsApp conversation back to a specific ad.
- Periodically re-check the pixel's `last_fired_time` (`2962661034068063`) to confirm it's still actively receiving events.
- **Recommended test window: 10–14 days minimum** before judging performance — premium/considered purchases have longer decision cycles.
- **Scaling criteria:** healthy CTR + Content Views + a visible uptick in WhatsApp enquiries → increase budget incrementally (20–30%), not in large jumps.
- **Stopping/reassessment criteria:** high CPC with negligible engagement through the full test window → pause and revisit targeting/creative before spending further.

## 8. Exact next actions

1. Watch initial campaign delivery over the first 24–72 hours for any Meta-flagged policy or delivery issues.
2. Track WhatsApp enquiry volume manually from launch date forward.
3. At the end of the 10–14 day test window, review performance against the scaling/stopping criteria in §7 and decide next step.
4. Optional, not urgent: revisit Purchase-event optimization only once a genuine, verified conversion signal exists.
5. Optional, not urgent: the "Collectible Design Objects" product set (69 items, `1400370004773130`) is built and ready if a broader Phase 2 campaign is wanted later.
6. Optional, not urgent: review and either commit or discard the three unrelated pending files noted in §4 (shop repo).
