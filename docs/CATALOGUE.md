# Catalogue → Meta Commerce feed — maintainer guide

`data/products.json` is the **source of truth** for the whole catalogue. `index.html`
(the live shop), the `products/<slug>/` pages, `meta/meta-catalog.csv`, and
`reports/meta-commerce-audit.csv` are all **generated files** — never edit them
by hand, edit `data/products.json` and regenerate.

## One command

```
node scripts/build.js
```

Runs, in order: validate source → regenerate `index.html` → regenerate
`products/<slug>/` pages → regenerate the Meta feed + audit report → validate
output. Stops on the first failure so nothing partially-broken gets written.

Individual steps (also available as `npm run <name>`):

| Command | Does |
|---|---|
| `node scripts/validate.js --source` | Validate `data/products.json` only |
| `node scripts/validate.js --source --network` | Also HEAD-check every hero image URL |
| `node scripts/generate-site.js` | Regenerate the product grid in `index.html` |
| `node scripts/generate-product-pages.js` | Regenerate `products/<slug>/index.html` |
| `node scripts/generate-meta-feed.js` | Regenerate `meta/meta-catalog.csv` + `reports/meta-commerce-audit.csv` |
| `node scripts/validate.js --output` | Validate the generated `index.html` + product pages against the source |

## Updating an existing product

1. Open `data/products.json`, find the product by `slug`.
2. Edit whichever fields you have real values for (see field reference below).
3. Run `node scripts/build.js`.
4. Check `reports/meta-commerce-audit.csv` for that product's row — confirm
   `missing_fields` reflects what you expect.

## Adding a new product

1. Add a new object to the `products` array in `data/products.json`. Give it
   a `slug` (lowercase, hyphenated — run it through the same rules as
   existing entries) and set `id` to match. Leave any field you don't have a
   confirmed real value for as `null`.
2. Run `node scripts/build.js`. The validator will catch a duplicate
   id/slug/title, a malformed image URL, or a missing hero image before
   anything is written.

## Supplying a price

Set on the product record:

```json
"price": 45000,
"currency": "INR"
```

`price` must be a positive number (up to 2 decimal places). `currency` must
be a 3-letter ISO 4217 code (e.g. `INR`, `USD`). Both are required together —
one without the other fails validation.

Setting a price does **not** by itself make a product sellable on Meta — see
"Commerce status" below.

## Supplying availability / condition

```json
"availability": "in stock",
"condition": "new"
```

Allowed `availability` values: `in stock`, `out of stock`, `preorder`,
`available for order`.
Allowed `condition` values: `new`, `refurbished`, `used`.

Both are stored as `null` until you explicitly set them — the build never
assumes a product is in stock just because it's listed, and never assumes
`condition: new`.

## Commerce status

Set on the product record: `MISSING_COMMERCE_DATA`, `ENQUIRY_ONLY`, or
`DIRECT_BUY_READY`.

- **MISSING_COMMERCE_DATA** — default for every product until you decide
  otherwise. Never appears in `meta/meta-catalog.csv`.
- **ENQUIRY_ONLY** — set this explicitly when a piece is intentionally
  WhatsApp-enquiry-only with no plan to sell it directly through Meta. Still
  excluded from `meta/meta-catalog.csv` (no checkout price).
- **DIRECT_BUY_READY** — set this once `price`, `currency`, `availability`,
  and `condition` are all filled in. The build will **refuse to include the
  product in `meta/meta-catalog.csv`** if any required field is still
  missing (see validation, below) — it doesn't silently drop it, it fails
  the build with an error naming the product and the missing field(s).

## Descriptions

If `description` is `null`, the build auto-generates a restrained factual
fallback from `title` + `material` + `category` (never invented details —
see `scripts/lib/util.js:effectiveDescription`). To use your own copy, just
set `description` on the record; it always takes priority over the fallback.
`reports/meta-commerce-audit.csv` shows `description_status` as `authored`,
`fallback_material`, or `fallback_category` so you can see at a glance which
products still only have the generated version.

## Regenerating the shop

`node scripts/generate-site.js` rewrites only the product grid inside
`index.html`; header, hero section, styles, and the search/filter script are
untouched byte-for-byte. It refuses to write if the regenerated grid doesn't
contain the exact same product count, titles, hero images, and WhatsApp
links as `data/products.json` — so a bad edit in the data file can't
silently corrupt the live page.

Card display text (price always "Price on request", missing material shown
as "Details on request") intentionally does **not** change based on
commerce fields yet — the live site's appearance and behaviour stay exactly
as they are today regardless of what gets filled into `data/products.json`.
Wiring the live cards to real prices/availability is a future, separate
decision.

## Regenerating the Meta feed

`node scripts/generate-meta-feed.js` writes:

- `meta/meta-catalog.csv` — only `DIRECT_BUY_READY` products that pass full
  validation. Never contains placeholder values to force a row to "look"
  complete.
- `reports/meta-commerce-audit.csv` — all products, with a `missing_fields`
  column so you can see exactly what's blocking each one.

## Running validation

```
node scripts/validate.js --source              # data/products.json only
node scripts/validate.js --source --network     # + check hero images are reachable
node scripts/validate.js --output               # + check generated files match the source
```

Checks include: exact product count, duplicate ids/slugs/titles, malformed
URLs, missing/unreachable hero images, invalid price/currency/availability/
condition formats, products marked `DIRECT_BUY_READY` without all required
fields, product-count mismatches between source and generated output, and
WhatsApp links being lost or changed during generation.

## Not set up yet (by design)

No scheduled/CI automation exists yet — `node scripts/build.js` is run
locally, on demand, until the architecture has been validated in production
use. No files here are deployed automatically; publishing `index.html` or
the `products/` pages to the live site is a separate, explicit step.
