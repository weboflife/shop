// Imports owner-approved commerce fields from reports/commerce-owner-input.csv
// (or --file=<path>) back into data/products.json. Matches rows by stable
// `id`. Only ever writes: price, currency, availability, condition,
// commerce_status, owner_notes. title/slug/category/material/hero_image/
// whatsapp_url/description/dimensions are never modified by this script,
// regardless of what those columns contain in the CSV — they're read-only
// reference columns there, included only so the sheet is self-describing.
//
// Blank cell == "no change" (existing value kept), not "clear to null" —
// this supports filling the sheet in incrementally across multiple imports.
// To intentionally clear a field, edit data/products.json directly.
//
// All-or-nothing: every row is validated first (duplicate ids, unknown ids,
// malformed price/currency/availability/condition). If ANY row fails,
// nothing is written to data/products.json.
//
// commerce_status is derived, not trusted blindly from the CSV:
//   - CSV cell "ENQUIRY_ONLY" or "SOLD_ARCHIVE" -> stored as-is (explicit
//     owner decision — a sold/archived or bespoke-quote product is never
//     something field-completeness alone should determine)
//   - anything else (blank, "MISSING_COMMERCE_DATA", "META_FEED_READY", or
//     unrecognized text) -> recomputed from field completeness after this
//     import's updates are applied. A row claiming META_FEED_READY whose
//     fields don't actually validate is downgraded, with a warning — never
//     marked META_FEED_READY just because the CSV says so.
import { readFileSync, existsSync } from 'node:fs';
import {
  readJson, writeJson, parseCsv, isValidPriceFormat, isValidCurrencyFormat,
} from './lib/util.js';
import {
  PRODUCTS_JSON_PATH, OWNER_INPUT_CSV_PATH, COMMERCE_STATUS,
  ALLOWED_AVAILABILITY, ALLOWED_CONDITION,
} from './lib/config.js';

const REFERENCE_ONLY_FIELDS = ['title', 'category', 'material'];

function parseArgs(argv) {
  const fileArg = argv.find((a) => a.startsWith('--file='));
  return {
    file: fileArg ? fileArg.slice('--file='.length) : OWNER_INPUT_CSV_PATH,
    dryRun: argv.includes('--dry-run'),
  };
}

function deriveStatus(product, explicitStatus) {
  if (explicitStatus === COMMERCE_STATUS.ENQUIRY_ONLY) return COMMERCE_STATUS.ENQUIRY_ONLY;
  if (explicitStatus === COMMERCE_STATUS.SOLD_ARCHIVE) return COMMERCE_STATUS.SOLD_ARCHIVE;
  const complete =
    isValidPriceFormat(product.price) &&
    isValidCurrencyFormat(product.currency) &&
    ALLOWED_AVAILABILITY.includes(product.availability) &&
    ALLOWED_CONDITION.includes(product.condition);
  return complete ? COMMERCE_STATUS.META_FEED_READY : COMMERCE_STATUS.MISSING_COMMERCE_DATA;
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!existsSync(args.file)) {
    console.error(`ERROR: ${args.file} does not exist.`);
    process.exit(1);
  }

  const data = readJson(PRODUCTS_JSON_PATH);
  const byId = new Map(data.products.map((p) => [p.id, p]));

  const rows = parseCsv(readFileSync(args.file, 'utf8'));

  const errors = [];
  const warnings = [];
  const seenIds = new Set();
  const plan = [];

  rows.forEach((r, idx) => {
    const rowNum = idx + 2; // header + 1-indexed
    const id = (r.id || '').trim();
    if (!id) { errors.push(`Row ${rowNum}: blank id`); return; }
    if (seenIds.has(id)) { errors.push(`Row ${rowNum}: duplicate id "${id}" in CSV`); return; }
    seenIds.add(id);

    const product = byId.get(id);
    if (!product) { errors.push(`Row ${rowNum}: unknown id "${id}" — no matching product in ${PRODUCTS_JSON_PATH}`); return; }

    for (const f of REFERENCE_ONLY_FIELDS) {
      const csvVal = (r[f] || '').trim();
      if (csvVal && csvVal !== String(product[f] ?? '')) {
        warnings.push(`Row ${rowNum} [${id}]: CSV "${f}" ("${csvVal}") differs from source ("${product[f] ?? ''}") — ignored, not imported.`);
      }
    }

    const priceCell = (r.price ?? '').trim();
    const currencyCell = (r.currency ?? '').trim();
    const availabilityCell = (r.availability ?? '').trim();
    const conditionCell = (r.condition ?? '').trim();
    const notesCell = (r.owner_notes ?? '').trim();
    const statusCell = (r.commerce_status ?? '').trim();

    if (priceCell && !isValidPriceFormat(priceCell)) {
      errors.push(`Row ${rowNum} [${id}]: invalid price format "${priceCell}" (expected a positive number, up to 2 decimals)`);
    }
    if (currencyCell && !isValidCurrencyFormat(currencyCell)) {
      errors.push(`Row ${rowNum} [${id}]: invalid currency "${currencyCell}" (expected 3-letter ISO 4217, e.g. INR)`);
    }
    if (availabilityCell && !ALLOWED_AVAILABILITY.includes(availabilityCell)) {
      errors.push(`Row ${rowNum} [${id}]: invalid availability "${availabilityCell}" (allowed: ${ALLOWED_AVAILABILITY.join(', ')})`);
    }
    if (conditionCell && !ALLOWED_CONDITION.includes(conditionCell)) {
      errors.push(`Row ${rowNum} [${id}]: invalid condition "${conditionCell}" (allowed: ${ALLOWED_CONDITION.join(', ')})`);
    }

    // price and currency must end up either both set or both unset
    const finalPrice = priceCell || product.price;
    const finalCurrency = currencyCell || product.currency;
    const priceIsSet = finalPrice !== null && finalPrice !== undefined && finalPrice !== '';
    const currencyIsSet = finalCurrency !== null && finalCurrency !== undefined && finalCurrency !== '';
    if (priceIsSet !== currencyIsSet) {
      errors.push(`Row ${rowNum} [${id}]: price and currency must both be set together (one would be set without the other after this import)`);
    }

    if (statusCell && statusCell !== COMMERCE_STATUS.META_FEED_READY && !Object.values(COMMERCE_STATUS).includes(statusCell)) {
      warnings.push(`Row ${rowNum} [${id}]: unrecognized commerce_status "${statusCell}" in CSV — status will be auto-derived instead.`);
    }

    plan.push({ id, rowNum, product, priceCell, currencyCell, availabilityCell, conditionCell, notesCell, statusCell });
  });

  for (const w of warnings) console.warn(`WARN  ${w}`);

  if (errors.length > 0) {
    console.error(`\n${errors.length} error(s) — nothing imported:`);
    for (const e of errors) console.error(`  ERROR ${e}`);
    process.exit(1);
  }

  let changedCount = 0;
  const summary = [];

  for (const item of plan) {
    const { product, priceCell, currencyCell, availabilityCell, conditionCell, notesCell, statusCell } = item;

    const before = JSON.stringify([product.price, product.currency, product.availability, product.condition, product.commerce_status, product.owner_notes ?? null]);

    if (priceCell) product.price = Number(priceCell);
    if (currencyCell) product.currency = currencyCell;
    if (availabilityCell) product.availability = availabilityCell;
    if (conditionCell) product.condition = conditionCell;
    if (notesCell) product.owner_notes = notesCell;

    const newStatus = deriveStatus(product, statusCell);
    if (statusCell === COMMERCE_STATUS.META_FEED_READY && newStatus !== COMMERCE_STATUS.META_FEED_READY) {
      console.warn(`WARN  [${item.id}]: CSV marked META_FEED_READY but required fields are incomplete/invalid — stored as ${newStatus} instead.`);
    }
    product.commerce_status = newStatus;

    const after = JSON.stringify([product.price, product.currency, product.availability, product.condition, product.commerce_status, product.owner_notes ?? null]);
    if (before !== after) {
      changedCount += 1;
      summary.push(`  [${item.id}] -> commerce_status=${product.commerce_status}`);
    }
  }

  console.log(`\n${plan.length} row(s) processed, ${changedCount} product(s) changed.`);
  summary.forEach((s) => console.log(s));

  if (args.dryRun) {
    console.log('\nDRY RUN — no changes written to data/products.json.');
    return;
  }

  writeJson(PRODUCTS_JSON_PATH, data);
  console.log('\ndata/products.json updated.');
}

main();
