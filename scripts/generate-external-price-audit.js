// Generates reports/external-price-match-audit.csv — one row per product,
// showing the result of VISUAL matching against pre-decided candidate
// matches in data/external-price-candidates.json. Read-only against
// data/products.json: never writes back, never changes commerce_status,
// never fills owner Price directly here — this is an audit trail for
// review, not an import.
import { writeFileSync, mkdirSync } from 'node:fs';
import { readJson, toCsv } from './lib/util.js';
import { PRODUCTS_JSON_PATH } from './lib/config.js';
import { matchAllProducts } from './lib/match-external-prices.js';

const CANDIDATES_PATH = 'data/external-price-candidates.json';
const OUTPUT_PATH = 'reports/external-price-match-audit.csv';

const HEADERS = [
  'id', 'title', 'category', 'material',
  'existing_price', 'existing_currency',
  'visual_match_confidence', 'matched_source_image', 'source_product_title',
  'source_price', 'source_currency', 'source_url', 'source_availability',
  'source_material', 'source_dimensions', 'match_notes', 'checked_on',
  'existing_price_conflict',
];

function main() {
  const { products } = readJson(PRODUCTS_JSON_PATH);
  const candidatesDoc = readJson(CANDIDATES_PATH);

  const matches = matchAllProducts(products, candidatesDoc.sources, candidatesDoc.checked_on);
  const matchById = new Map(matches.map((m) => [m.id, m]));

  const rows = products.map((p) => {
    const m = matchById.get(p.id);
    const existingHasPrice = p.price !== null && p.price !== undefined;
    const conflict = existingHasPrice && m.source_price !== null && Number(p.price) !== Number(m.source_price);
    return {
      id: p.id,
      title: p.title,
      category: p.category,
      material: p.material ?? '',
      existing_price: p.price ?? '',
      existing_currency: p.currency ?? '',
      visual_match_confidence: m.visual_match_confidence,
      matched_source_image: m.matched_source_image ?? '',
      source_product_title: m.source_product_title ?? '',
      source_price: m.source_price ?? '',
      source_currency: m.source_currency ?? '',
      source_url: m.source_url ?? '',
      source_availability: m.source_availability ?? '',
      source_material: m.source_material ?? '',
      source_dimensions: m.source_dimensions ?? '',
      match_notes: m.match_notes,
      checked_on: m.checked_on,
      existing_price_conflict: conflict ? 'YES — existing confirmed price differs from source, left untouched' : '',
    };
  });

  mkdirSync('reports', { recursive: true });
  writeFileSync(OUTPUT_PATH, toCsv(rows, HEADERS), 'utf8');
  console.log(`${OUTPUT_PATH}: ${rows.length} row(s) generated.`);

  const counts = {};
  for (const m of matches) counts[m.visual_match_confidence] = (counts[m.visual_match_confidence] || 0) + 1;
  console.log('Visual match confidence breakdown:', counts);
}

main();
