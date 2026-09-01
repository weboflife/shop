# Web of Life — Meta Catalogue Advertising Project

This repository is part of the Web of Life Meta catalogue-advertising setup
(catalogue, product sets, Pixel/dataset, Facebook/Instagram, and a live
Meta ad campaign). **Read `META-WOL-HANDOFF.md` in this repo before making
any Meta-side change** — it is the authoritative operational record: every
asset ID, current campaign status and budgets, token-security history,
website/repo paths and deployment state, and the current next actions.

## Critical rules

- **Never recreate an existing Meta asset** (Business Portfolio, ad account,
  catalogue, product set, Pixel/dataset, app, system user, Page, Instagram
  account) unless explicitly instructed otherwise — see the handoff's
  "never recreate / never touch" list for exact IDs.
- **Never print, log, or commit an access token, secret, or card detail.**
  If a token needs to be placed in `.env`, write it directly without
  echoing it back in any command output or response.
- **Never activate a campaign/ad set/ad or increase spend/budget without
  explicit, current-turn approval** from the owner. A past approval does
  not carry forward to new changes.
- **Preserve the existing campaign, catalogue, Pixel/dataset, Page, and
  Instagram identities** exactly as configured unless specifically
  instructed to change them.

See `META-WOL-HANDOFF.md` for everything else — IDs, current state, and
next actions.
