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

Two ways to do this — pick whichever fits how you're working:

**Directly:** open `data/products.json`, find the product by `slug`, edit
whichever fields you have real values for (see field reference below), run
`node scripts/build.js`, then check `reports/meta-commerce-audit.csv` for
that product's row to confirm `missing_fields` reflects what you expect.

**Via the owner-input spreadsheet:** see below — better for filling in
price/availability/condition across many products at once.

## Bulk commerce data via spreadsheet

For filling in price/currency/availability/condition across many products
(rather than hand-editing JSON), use the CSV round-trip:

1. `node scripts/generate-owner-input.js` — writes
   `reports/commerce-owner-input.csv`, one row per product, with the known
   facts (title, category, material, image, product URL, current/fallback
   description) plus blank `price`/`currency`/`availability`/`condition`
   columns and a free-text `owner_notes` column.
2. Open it in a spreadsheet, fill in whatever you have confirmed. Leave a
   cell blank to leave that field untouched — you can fill the sheet in
   incrementally over several passes, you don't have to complete it in one
   sitting.
3. `node scripts/import-commerce-data.js` — validates every row first (all
   formats, all IDs); if anything is wrong, **nothing is written** and you
   get an exact list of what to fix. If everything passes, it writes the
   changes into `data/products.json`.
4. Run `node scripts/build.js` to regenerate everything downstream.

Add `--dry-run` to step 3 to preview what would change without writing
anything. Add `--file=<path>` to import from a different CSV (e.g. a working
copy while iterating).

**What the importer will and won't touch:** only `price`, `currency`,
`availability`, `condition`, `commerce_status`, and `owner_notes` are ever
written back to `data/products.json`. The `title`/`category`/`material`
columns in the sheet are reference-only — if you edit them there, the
importer ignores the edit and prints a warning naming the mismatch; it never
overwrites source-of-truth product facts from the commerce sheet.

**`commerce_status` in the sheet is mostly hands-off.** Leave it as
`MISSING_COMMERCE_DATA`, or write `ENQUIRY_ONLY` / `SOLD_ARCHIVE` to
explicitly declare a piece as WhatsApp-enquiry-only or already-sold — those
are the two statuses you set by hand. `META_FEED_READY` is never taken on
faith from the sheet: the importer recomputes it from whether
price/currency/availability/condition are all actually present and valid,
every time. If you type `META_FEED_READY` into the sheet for a product
that isn't actually complete, the importer downgrades it back to
`MISSING_COMMERCE_DATA` and prints a warning — it will not silently trust
the label.

**Regenerating the sheet is destructive to unimported edits.** Running
`node scripts/generate-owner-input.js` again overwrites
`reports/commerce-owner-input.csv` from the current `data/products.json` —
if you've typed data into it that hasn't been imported yet, that data is
lost. It's intentionally not part of `node scripts/build.js` for this
reason; only regenerate it when you actually want a fresh sheet (e.g. after
adding new products).

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

Allowed `availability` values: `in stock`, `out of stock`, `available for order`,
`discontinued` (matches Meta's actual Product Catalog API enum, confirmed
against the `items_batch` API docs).
Allowed `condition` values: `new`, `refurbished`, `used`.

Both are stored as `null` until you explicitly set them — the build never
assumes a product is in stock just because it's listed, and never assumes
`condition: new`.

## Commerce status

Set on the product record: `MISSING_COMMERCE_DATA`, `ENQUIRY_ONLY`,
`SOLD_ARCHIVE`, or `META_FEED_READY`.

- **MISSING_COMMERCE_DATA** — default for every product until you decide
  otherwise. Never appears in `meta/meta-catalog.csv`.
- **ENQUIRY_ONLY** — set this explicitly when a piece is intentionally
  WhatsApp-enquiry-only with no plan to sell it directly through Meta (e.g.
  made-to-order/customisable pieces with no fixed price). Still excluded
  from `meta/meta-catalog.csv` (no checkout price).
- **SOLD_ARCHIVE** — set this explicitly for a one-of-a-kind piece that has
  already sold. The catalogue record, images, description, and website page
  are all preserved — nothing gets deleted — it's simply excluded from the
  Meta feed since it can't be purchased. Like `ENQUIRY_ONLY`, this is an
  explicit owner decision the importer stores as-is, never derived from
  field completeness.
- **META_FEED_READY** — set this once `price`, `currency`, `availability`,
  and `condition` are all filled in. The build will **refuse to include the
  product in `meta/meta-catalog.csv`** if any required field is still
  missing (see validation, below) — it doesn't silently drop it, it fails
  the build with an error naming the product and the missing field(s).

## Descriptions

If `description` is `null`, the build auto-generates a restrained factual
fallback from `title` + `material` + `category` (never invented details —
see `scripts/lib/util.js:effectiveDescription`). To use your own copy, just
set `description` on the record; it always takes priority over the fallback.
`reports/commerce-owner-input.csv`'s `current_description` column shows
exactly what would currently be used for each product, so you can see at a
glance which ones still only have the generated version — it's a preview,
not a stored field, and re-generating the sheet always reflects the latest
description in `data/products.json`.

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

- `meta/meta-catalog.csv` — only `META_FEED_READY` products that pass full
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
condition formats, products marked `META_FEED_READY` without all required
fields, product-count mismatches between source and generated output, and
WhatsApp links being lost or changed during generation.

## Syncing to Meta

`node scripts/sync-to-meta.js` reads `meta/meta-catalog.csv`, cross-checks
every row against `data/products.json` (never trusting the CSV alone), and
builds the Meta Catalog Batch API payload for the `META_FEED_READY`
products. **By default it is a fully offline dry run** — it prints the
payload it would send and makes no network call at all.

```
node scripts/sync-to-meta.js                          # dry run, all META_FEED_READY products
node scripts/sync-to-meta.js --product=<id>            # dry run, one product only — for a pilot test
node scripts/sync-to-meta.js --limit=5                 # dry run, first 5 only
node scripts/sync-to-meta.js --catalog-id=<id>         # override the target (default: the confirmed TEST catalog)
```

`--execute` exists as a flag but reaches a branch that currently refuses to
run — the live network-send call is intentionally not implemented yet, so
this script cannot mutate Meta no matter how it's invoked, until that's
built out and explicitly approved. There is no delete capability anywhere
in this script.

`META_CATALOG_ACCESS_TOKEN` is read from `.env` only, held in memory, and
never printed, logged, or included in any output this script produces.

## Not set up yet (by design)

No scheduled/CI automation exists yet — `node scripts/build.js` is run
locally, on demand, until the architecture has been validated in production
use. No files here are deployed automatically; publishing `index.html` or
the `products/` pages to the live site is a separate, explicit step.
