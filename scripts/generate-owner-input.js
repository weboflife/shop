// Generates reports/commerce-owner-input.csv — one row per product, meant
// to be filled in offline and re-imported via scripts/import-commerce-data.js.
// Only known factual fields are populated; price/currency/availability/
// condition are left genuinely blank wherever unset. Nothing is invented.
//
// NOT part of `node scripts/build.js` — regenerating this sheet overwrites
// any commerce data typed into it that hasn't been imported yet, so it's a
// deliberate, separately-run step (npm run owner-sheet), not an automatic
// regeneration on every build.
import { writeFileSync, mkdirSync } from 'node:fs';
import { readJson, toCsv, effectiveDescription } from './lib/util.js';
import { PRODUCTS_JSON_PATH, SITE_BASE_URL, OWNER_INPUT_CSV_PATH, OWNER_INPUT_CSV_HEADERS } from './lib/config.js';

function productUrl(p) {
  return `${SITE_BASE_URL}/products/${p.slug}/`;
}

function row(p) {
  const { text: description } = effectiveDescription(p);
  return {
    id: p.id,
    title: p.title,
    slug: p.slug,
    category: p.category,
    material: p.material ?? '',
    current_description: description,
    hero_image: p.hero_image,
    product_url: productUrl(p),
    price: p.price ?? '',
    currency: p.currency ?? '',
    availability: p.availability ?? '',
    condition: p.condition ?? '',
    commerce_status: p.commerce_status,
    owner_notes: p.owner_notes ?? '',
  };
}

function main() {
  const { products } = readJson(PRODUCTS_JSON_PATH);
  mkdirSync('reports', { recursive: true });

  const rows = products.map(row);
  writeFileSync(OWNER_INPUT_CSV_PATH, toCsv(rows, OWNER_INPUT_CSV_HEADERS), 'utf8');

  console.log(`${OWNER_INPUT_CSV_PATH}: ${rows.length} row(s) generated.`);
  console.log('current_description shows the auto-generated factual fallback wherever no authored description exists yet — it is a preview, not a stored value.');
  console.log('price / currency / availability / condition are blank wherever not yet confirmed.');
}

main();
