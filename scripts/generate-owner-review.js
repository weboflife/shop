// Generates reports/commerce-owner-review.csv — a human-friendly, grouped
// reading order over the same underlying facts as commerce-owner-input.csv,
// for the owner to review before pricing. Read-only: derives from
// data/products.json, writes nothing back to it. Product ids are preserved
// exactly so this file can never drift into being its own source of truth.
import { writeFileSync, mkdirSync } from 'node:fs';
import { readJson, toCsv, sortByCategoryThenTitle } from './lib/util.js';
import { PRODUCTS_JSON_PATH, SITE_BASE_URL } from './lib/config.js';

const REVIEW_CSV_PATH = 'reports/commerce-owner-review.csv';
const REVIEW_CSV_HEADERS = [
  'category', 'title', 'material', 'price', 'currency', 'availability', 'condition',
  'commerce_status', 'owner_notes', 'id', 'product_url', 'hero_image',
];

function productUrl(p) {
  return `${SITE_BASE_URL}/products/${p.slug}/`;
}

function row(p) {
  return {
    category: p.category,
    title: p.title,
    material: p.material ?? '',
    price: p.price ?? '',
    currency: p.currency ?? '',
    availability: p.availability ?? '',
    condition: p.condition ?? '',
    commerce_status: p.commerce_status,
    owner_notes: p.owner_notes ?? '',
    id: p.id,
    product_url: productUrl(p),
    hero_image: p.hero_image,
  };
}

function main() {
  const { products } = readJson(PRODUCTS_JSON_PATH);
  mkdirSync('reports', { recursive: true });

  const sorted = sortByCategoryThenTitle(products);

  const rows = sorted.map(row);
  writeFileSync(REVIEW_CSV_PATH, toCsv(rows, REVIEW_CSV_HEADERS), 'utf8');
  console.log(`${REVIEW_CSV_PATH}: ${rows.length} row(s) generated, sorted by category then title.`);

  const counts = new Map();
  for (const p of sorted) counts.set(p.category, (counts.get(p.category) || 0) + 1);
  console.log('\nProduct count by category:');
  for (const [category, count] of [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`  ${category.padEnd(30)} ${count}`);
  }
  console.log(`  ${'TOTAL'.padEnd(30)} ${rows.length}`);
}

main();
