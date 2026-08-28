// ONE-TIME MIGRATION SCRIPT.
//
// Parses the hand-authored <article class="card"> blocks currently in
// index.html and writes data/products.json — using ONLY facts already
// present in the markup. No prices, dimensions, availability, or
// descriptions are invented; fields with no source value are stored as null.
//
// After this migration, data/products.json is the source of truth.
// Re-running this script would re-derive from index.html again, which is
// only correct before index.html itself becomes a generated file. It is
// kept for audit-trail purposes, not as part of the ongoing build.
import { readFileSync } from 'node:fs';
import { slugify, uniqueSlug, writeJson } from './lib/util.js';
import { PRODUCTS_JSON_PATH, INDEX_HTML_PATH, COMMERCE_STATUS } from './lib/config.js';

function decodeEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function main() {
  const html = readFileSync(INDEX_HTML_PATH, 'utf8');
  const cardBlocks = html.match(/<article class="card".*?<\/article>/gs) || [];

  const usedSlugs = new Set();
  const products = [];

  for (const block of cardBlocks) {
    const cat = decodeEntities(block.match(/data-cat="([^"]*)"/)[1]);
    const img = block.match(/<img loading="lazy" src="([^"]*)" alt="([^"]*)">/);
    const heroImage = img[1];
    const h3 = decodeEntities(block.match(/<h3>(.*?)<\/h3>/s)[1].trim());
    const matRaw = decodeEntities(block.match(/<p class="mat">(.*?)<\/p>/s)[1].trim());
    const material = matRaw === 'Details on request' ? null : matRaw;
    const waUrl = block.match(/<a class="card-media" href="([^"]*)"/)[1];
    const buyUrl = block.match(/<a class="buy" href="([^"]*)"/)[1];

    if (waUrl !== buyUrl) {
      throw new Error(`WhatsApp URL mismatch within one card: "${h3}"`);
    }

    const baseSlug = slugify(h3);
    const slug = uniqueSlug(baseSlug, usedSlugs);

    products.push({
      id: slug,
      slug,
      title: h3,
      category: cat,
      material,
      dimensions: null,
      description: null,
      price: null,
      currency: null,
      availability: null,
      condition: null,
      hero_image: heroImage,
      additional_images: [],
      whatsapp_url: waUrl,
      commerce_status: COMMERCE_STATUS.MISSING_COMMERCE_DATA,
    });
  }

  if (products.length !== 184) {
    throw new Error(`Expected 184 products, extracted ${products.length}. Aborting write.`);
  }

  const ids = new Set(products.map((p) => p.id));
  if (ids.size !== products.length) {
    throw new Error('Duplicate ids/slugs produced during extraction. Aborting write.');
  }

  writeJson(PRODUCTS_JSON_PATH, { source: 'index.html (migrated)', product_count: products.length, products });
  console.log(`Extracted ${products.length} products -> ${PRODUCTS_JSON_PATH}`);

  const withMaterial = products.filter((p) => p.material).length;
  console.log(`  material known: ${withMaterial} / ${products.length}`);
  console.log(`  material unknown: ${products.length - withMaterial} / ${products.length}`);
}

main();
