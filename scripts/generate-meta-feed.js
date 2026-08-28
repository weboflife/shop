// Generates:
//   meta/meta-catalog.csv        — ONLY products passing META_FEED_READY validation
//   reports/meta-commerce-audit.csv — all products, with per-field gap status
//
// Never emits placeholder values to satisfy a required column: a product
// that is not META_FEED_READY simply does not get a row in meta-catalog.csv.
import { mkdirSync } from 'node:fs';
import { writeFileSync } from 'node:fs';
import { readJson, toCsv, effectiveDescription, metaFeedMissingFields } from './lib/util.js';
import {
  PRODUCTS_JSON_PATH, META_FEED_PATH, AUDIT_REPORT_PATH, SITE_BASE_URL, BRAND,
  COMMERCE_STATUS, META_FEED_REQUIRED_FIELDS, META_CSV_HEADERS, AUDIT_CSV_HEADERS,
} from './lib/config.js';

function productUrl(p) {
  return `${SITE_BASE_URL}/products/${p.slug}/`;
}

function auditRow(p) {
  const missing = [];
  if (p.price === null || p.price === undefined || p.price === '') missing.push('price');
  if (p.currency === null || p.currency === undefined || p.currency === '') missing.push('currency');
  if (p.availability === null || p.availability === undefined || p.availability === '') missing.push('availability');
  if (p.condition === null || p.condition === undefined || p.condition === '') missing.push('condition');

  return {
    id: p.id,
    title: p.title,
    category: p.category,
    material: p.material ?? '',
    price: p.price ?? '',
    currency: p.currency ?? '',
    availability: p.availability ?? '',
    condition: p.condition ?? '',
    commerce_status: p.commerce_status,
    missing_fields: missing.join(';'),
    product_url: productUrl(p),
    image_status: p.hero_image ? 'present' : 'missing',
  };
}

function metaRow(p) {
  const { text: description } = effectiveDescription(p);
  return {
    id: p.id,
    title: p.title,
    description,
    availability: p.availability,
    condition: p.condition,
    price: `${p.price} ${p.currency}`,
    link: productUrl(p),
    image_link: p.hero_image,
    additional_image_link: p.additional_images.join(','),
    brand: BRAND,
    product_type: p.category,
  };
}

function main() {
  const { products } = readJson(PRODUCTS_JSON_PATH);

  mkdirSync('meta', { recursive: true });
  mkdirSync('reports', { recursive: true });

  const metaFeedReady = [];
  const rejectedButMarked = [];

  for (const p of products) {
    if (p.commerce_status === COMMERCE_STATUS.META_FEED_READY) {
      const missing = metaFeedMissingFields(p, META_FEED_REQUIRED_FIELDS);
      if (missing.length === 0) {
        metaFeedReady.push(p);
      } else {
        rejectedButMarked.push({ product: p, missing });
      }
    }
  }

  if (rejectedButMarked.length > 0) {
    console.error('The following products are marked META_FEED_READY but fail validation — excluded from meta-catalog.csv:');
    for (const { product, missing } of rejectedButMarked) {
      console.error(`  [${product.slug}] missing: ${missing.join(', ')}`);
    }
  }

  const metaRows = metaFeedReady.map(metaRow);
  writeFileSync(META_FEED_PATH, toCsv(metaRows, META_CSV_HEADERS), 'utf8');
  console.log(`${META_FEED_PATH}: ${metaRows.length} product row(s) (META_FEED_READY only).`);

  const auditRows = products.map(auditRow);
  writeFileSync(AUDIT_REPORT_PATH, toCsv(auditRows, AUDIT_CSV_HEADERS), 'utf8');
  console.log(`${AUDIT_REPORT_PATH}: ${auditRows.length} product row(s) (all products, gap report).`);

  const missingCommerceCount = products.filter((p) => p.commerce_status === COMMERCE_STATUS.MISSING_COMMERCE_DATA).length;
  const enquiryOnlyCount = products.filter((p) => p.commerce_status === COMMERCE_STATUS.ENQUIRY_ONLY).length;
  const soldArchiveCount = products.filter((p) => p.commerce_status === COMMERCE_STATUS.SOLD_ARCHIVE).length;
  console.log(`\nStatus breakdown: META_FEED_READY=${metaFeedReady.length}, ENQUIRY_ONLY=${enquiryOnlyCount}, SOLD_ARCHIVE=${soldArchiveCount}, MISSING_COMMERCE_DATA=${missingCommerceCount}`);

  if (rejectedButMarked.length > 0) {
    process.exitCode = 1;
  }
}

main();
