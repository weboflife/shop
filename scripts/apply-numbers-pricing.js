// Turns the reconciled Numbers pricing data (.cache/numbers-export/reconciliation.json,
// produced by audit-numbers-pricing.js) into an import-ready CSV matching
// commerce-owner-input.csv's schema, applying the owner's confirmed
// business rules for this pricing round:
//
//   - FORCED_SOLD_ARCHIVE ids -> SOLD_ARCHIVE regardless of what the sheet's
//     price cell says (owner explicitly overrode the ambiguity for these).
//   - price cell was "Sold"-type text -> SOLD_ARCHIVE.
//   - price cell was "Customisable"-type text -> ENQUIRY_ONLY.
//   - price cell was a clean positive number -> currency=INR, availability=
//     "in stock", condition="new"; commerce_status left BLANK so the
//     existing importer (scripts/import-commerce-data.js) derives
//     META_FEED_READY itself from field completeness — never hardcoded
//     here, so there's exactly one place that decision gets made.
//
// Writes .cache/numbers-export/decided-import.csv. Does NOT write to
// data/products.json itself — run scripts/import-commerce-data.js
// --file=.cache/numbers-export/decided-import.csv afterward for that.
import { writeFileSync } from 'node:fs';
import { readJson, toCsv } from './lib/util.js';
import { PRODUCTS_JSON_PATH, OWNER_INPUT_CSV_HEADERS, SITE_BASE_URL } from './lib/config.js';

const RECONCILIATION_PATH = '.cache/numbers-export/reconciliation.json';
const OUTPUT_PATH = '.cache/numbers-export/decided-import.csv';

const FORCED_SOLD_ARCHIVE = new Set([
  'fertility', 'ogamagi', 'transformation', 'tiki-head', 'wood-oracle-mirror',
]);

function classifyPriceText(issueText) {
  const m = issueText.match(/"(.*)"/);
  if (!m) return 'other';
  const t = m[1].trim().toLowerCase();
  if (t.includes('sold') && t.includes('customis')) return 'hybrid';
  if (t.includes('sold')) return 'sold';
  if (t.includes('customis')) return 'customisable';
  return 'other';
}

function productUrl(p) {
  return `${SITE_BASE_URL}/products/${p.slug}/`;
}

function main() {
  const reconciliation = readJson(RECONCILIATION_PATH);
  const { products } = readJson(PRODUCTS_JSON_PATH);
  const productsById = new Map(products.map((p) => [p.id, p]));
  const warningById = new Map(reconciliation.priceFormatWarnings.map((w) => [w.id, w]));

  const counts = { SOLD_ARCHIVE: 0, ENQUIRY_ONLY: 0, numericActive: 0, forcedOverride: 0, unresolved: [] };
  const rows = [];

  for (const pr of reconciliation.pricingRows) {
    const p = productsById.get(pr.id);
    if (!p) { counts.unresolved.push(pr.id); continue; } // shouldn't happen, all 184 reconciled already

    const base = {
      id: p.id,
      title: p.title,
      slug: p.slug,
      category: p.category,
      material: p.material ?? '',
      current_description: '',
      hero_image: p.hero_image,
      product_url: productUrl(p),
      owner_notes: '',
    };

    if (FORCED_SOLD_ARCHIVE.has(pr.id)) {
      counts.forcedOverride += 1;
      counts.SOLD_ARCHIVE += 1;
      rows.push({ ...base, price: '', currency: '', availability: '', condition: '', commerce_status: 'SOLD_ARCHIVE' });
      continue;
    }

    if (pr.price !== null && pr.price > 0) {
      counts.numericActive += 1;
      rows.push({ ...base, price: pr.price, currency: 'INR', availability: 'in stock', condition: 'new', commerce_status: '' });
      continue;
    }

    // No clean price -> classify by the original sheet text.
    const warning = warningById.get(pr.id);
    const kind = warning ? classifyPriceText(warning.issue) : 'other';

    if (kind === 'sold' || kind === 'hybrid') {
      counts.SOLD_ARCHIVE += 1;
      rows.push({ ...base, price: '', currency: '', availability: '', condition: '', commerce_status: 'SOLD_ARCHIVE' });
    } else if (kind === 'customisable') {
      counts.ENQUIRY_ONLY += 1;
      rows.push({ ...base, price: '', currency: '', availability: '', condition: '', commerce_status: 'ENQUIRY_ONLY' });
    } else {
      counts.unresolved.push(pr.id);
      rows.push({ ...base, price: '', currency: '', availability: '', condition: '', commerce_status: '' });
    }
  }

  writeFileSync(OUTPUT_PATH, toCsv(rows, OWNER_INPUT_CSV_HEADERS), 'utf8');

  console.log(`${OUTPUT_PATH}: ${rows.length} rows written.`);
  console.log('\nClassification counts:');
  console.log(`  Forced SOLD_ARCHIVE override (owner-specified ids): ${counts.forcedOverride}`);
  console.log(`  Total SOLD_ARCHIVE: ${counts.SOLD_ARCHIVE}`);
  console.log(`  Total ENQUIRY_ONLY: ${counts.ENQUIRY_ONLY}`);
  console.log(`  Numeric priced (commerce_status left blank for importer to derive META_FEED_READY): ${counts.numericActive}`);
  console.log(`  Unresolved (could not classify): ${counts.unresolved.length}`, counts.unresolved);
}

main();
