// Prepared Meta Catalog Batch API sync. NOT wired into the automatic build
// pipeline and NOT executed as part of writing this file. Defaults to a
// fully offline dry run — it builds and prints the payload that would be
// sent, makes zero network calls, and exits. Passing --execute reaches a
// branch that currently refuses to run (see bottom of main()): the actual
// network-send call is deliberately left unimplemented until explicitly
// approved for a live write, so this script cannot accidentally mutate
// Meta no matter how it's invoked today.
//
// No delete capability exists anywhere in this file — only CREATE/UPDATE
// via method "UPDATE" (Meta's batch API upserts by retailer_id). A delete
// path was not requested and was deliberately not built, rather than built
// and gated behind a flag.
//
// META_CATALOG_ACCESS_TOKEN is read from .env only, held in a local
// variable, and never logged, printed, or included in any error message.
//
// Usage (all safe today — none of these send a network request):
//   node scripts/sync-to-meta.js                       # dry run, all META_FEED_READY rows
//   node scripts/sync-to-meta.js --product=biomorphic-v1  # dry run, one product only
//   node scripts/sync-to-meta.js --limit=5              # dry run, first 5 only
//   node scripts/sync-to-meta.js --catalog-id=<id>      # override the target catalog (default: the confirmed TEST catalog)
//   node scripts/sync-to-meta.js --execute              # reaches the unimplemented live-write branch; refuses and exits 1
import { existsSync, readFileSync } from 'node:fs';
import { readJson, parseCsv } from './lib/util.js';
import { PRODUCTS_JSON_PATH, META_FEED_PATH, COMMERCE_STATUS, META_TEST_CATALOG_ID } from './lib/config.js';

function loadEnv(path = '.env') {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

function parseArgs(argv) {
  const get = (prefix) => {
    const hit = argv.find((a) => a.startsWith(prefix));
    return hit ? hit.slice(prefix.length) : null;
  };
  return {
    execute: argv.includes('--execute'),
    catalogId: get('--catalog-id=') || META_TEST_CATALOG_ID,
    onlyProduct: get('--product='),
    limit: Number(get('--limit=')) || null,
  };
}

// NOTE: mirrors the feed-spec field shape (same as meta/meta-catalog.csv),
// not a confirmed Meta Batch API payload. Re-verify field names/format
// against current Meta Catalog Batch API docs before the first --execute run.
function buildBatchItem(row) {
  return {
    method: 'UPDATE',
    retailer_id: row.id,
    data: {
      name: row.title,
      description: row.description,
      availability: row.availability,
      condition: row.condition,
      price: row.price, // "<amount> <currency>" — verify against current Batch API spec before live use
      link: row.link,
      image_link: row.image_link,
      additional_image_link: row.additional_image_link || undefined,
      brand: row.brand,
      product_type: row.product_type,
    },
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  loadEnv();
  const token = process.env.META_CATALOG_ACCESS_TOKEN;
  if (!token) {
    console.error('ERROR: META_CATALOG_ACCESS_TOKEN not set in .env');
    process.exit(1);
  }

  if (!existsSync(META_FEED_PATH)) {
    console.error(`ERROR: ${META_FEED_PATH} does not exist — run scripts/generate-meta-feed.js first.`);
    process.exit(1);
  }
  const csvRows = parseCsv(readFileSync(META_FEED_PATH, 'utf8'));

  const { products } = readJson(PRODUCTS_JSON_PATH);
  const statusById = new Map(products.map((p) => [p.id, p.commerce_status]));

  // Defense in depth: meta-catalog.csv should already contain only
  // META_FEED_READY rows (generate-meta-feed.js guarantees this), but this
  // script re-checks against products.json directly rather than trusting
  // the CSV blindly, in case it's stale or was hand-edited.
  let targets = [];
  for (const row of csvRows) {
    if (statusById.get(row.id) === COMMERCE_STATUS.META_FEED_READY) {
      targets.push(row);
    } else {
      console.warn(`WARN  Skipping "${row.id}" — present in ${META_FEED_PATH} but products.json shows commerce_status=${statusById.get(row.id)}, not META_FEED_READY.`);
    }
  }

  if (args.onlyProduct) {
    targets = targets.filter((row) => row.id === args.onlyProduct);
    if (targets.length === 0) {
      console.error(`ERROR: --product=${args.onlyProduct} not found among META_FEED_READY rows.`);
      process.exit(1);
    }
  }
  if (args.limit) targets = targets.slice(0, args.limit);

  console.log(`Target catalog: ${args.catalogId}${args.catalogId === META_TEST_CATALOG_ID ? ' (confirmed TEST catalog)' : ' (NOT the default test catalog — verify this is intentional)'}`);
  console.log(`Products targeted: ${targets.length}`);
  console.log(`Mode: ${args.execute ? 'EXECUTE requested' : 'DRY RUN (no network call)'}`);

  if (targets.length === 0) {
    console.log('\nNothing to sync: 0 META_FEED_READY products match the given filters.');
    return;
  }

  const batch = targets.map(buildBatchItem);
  console.log('\nPayload preview (this is what would be sent):');
  console.log(JSON.stringify(batch, null, 2));

  if (!args.execute) {
    console.log('\nDry run complete. No network request was made.');
    return;
  }

  // Deliberately unimplemented. When this is built out, it performs exactly
  // one POST https://graph.facebook.com/v21.0/{catalog_id}/batch with
  // Authorization: Bearer <token>, logs only the HTTP status and response
  // body (never the token), and still contains no delete method anywhere.
  console.error('\nEXECUTE MODE IS NOT YET IMPLEMENTED. Refusing to make any network call.');
  process.exit(1);
}

main();
