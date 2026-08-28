// Validation for data/products.json and (with --output) the generated
// artifacts derived from it. Exits non-zero on any ERROR. WARNINGs do not
// fail the build but are always printed.
import { readFileSync, existsSync } from 'node:fs';
import {
  readJson, isValidHttpUrl, metaFeedMissingFields, isValidPriceFormat, isValidCurrencyFormat,
} from './lib/util.js';
import {
  PRODUCTS_JSON_PATH, INDEX_HTML_PATH, PRODUCTS_DIR,
  COMMERCE_STATUS, ALLOWED_AVAILABILITY, ALLOWED_CONDITION,
  META_FEED_REQUIRED_FIELDS,
} from './lib/config.js';

const EXPECTED_COUNT = 184;

export function validateSource({ checkNetwork = false } = {}) {
  const errors = [];
  const warnings = [];

  if (!existsSync(PRODUCTS_JSON_PATH)) {
    return { errors: [`${PRODUCTS_JSON_PATH} does not exist`], warnings: [] };
  }
  const data = readJson(PRODUCTS_JSON_PATH);
  const products = data.products || [];

  if (products.length !== EXPECTED_COUNT) {
    errors.push(`Expected ${EXPECTED_COUNT} products, found ${products.length}`);
  }

  const seenIds = new Map();
  const seenSlugs = new Map();
  const seenTitles = new Map();

  for (const p of products) {
    const where = `[${p.id || p.slug || p.title || '?'}]`;

    // duplicates
    if (seenIds.has(p.id)) errors.push(`Duplicate id "${p.id}" (${where})`);
    seenIds.set(p.id, (seenIds.get(p.id) || 0) + 1);
    if (seenSlugs.has(p.slug)) errors.push(`Duplicate slug "${p.slug}" (${where})`);
    seenSlugs.set(p.slug, (seenSlugs.get(p.slug) || 0) + 1);
    const titleKey = (p.title || '').trim().toLowerCase();
    if (seenTitles.has(titleKey)) errors.push(`Duplicate title "${p.title}" (${where})`);
    seenTitles.set(titleKey, (seenTitles.get(titleKey) || 0) + 1);

    // required base fields
    if (!p.title) errors.push(`Missing title ${where}`);
    if (!p.category) errors.push(`Missing category ${where}`);
    if (!p.slug) errors.push(`Missing slug ${where}`);
    if (!p.id) errors.push(`Missing id ${where}`);

    // hero image
    if (!p.hero_image) {
      errors.push(`Missing hero_image ${where}`);
    } else if (!isValidHttpUrl(p.hero_image)) {
      errors.push(`Malformed hero_image URL "${p.hero_image}" ${where}`);
    }

    // whatsapp url
    if (!p.whatsapp_url) {
      errors.push(`Missing whatsapp_url ${where}`);
    } else if (!isValidHttpUrl(p.whatsapp_url)) {
      errors.push(`Malformed whatsapp_url "${p.whatsapp_url}" ${where}`);
    }

    // additional images, if present, must be well-formed URLs
    for (const img of p.additional_images || []) {
      if (!isValidHttpUrl(img)) errors.push(`Malformed additional_image URL "${img}" ${where}`);
    }

    // price / currency format, only if present (null is always valid — unset)
    if (p.price !== null && p.price !== undefined) {
      if (!isValidPriceFormat(p.price)) errors.push(`Invalid price format "${p.price}" ${where}`);
      if (!isValidCurrencyFormat(p.currency)) errors.push(`price is set but currency is missing/invalid ${where}`);
    }
    if (p.currency !== null && p.currency !== undefined && !isValidCurrencyFormat(p.currency)) {
      errors.push(`Invalid currency format "${p.currency}" (expected 3-letter ISO 4217) ${where}`);
    }

    // availability / condition enums, only if present
    if (p.availability !== null && p.availability !== undefined && !ALLOWED_AVAILABILITY.includes(p.availability)) {
      errors.push(`Invalid availability value "${p.availability}" ${where}`);
    }
    if (p.condition !== null && p.condition !== undefined && !ALLOWED_CONDITION.includes(p.condition)) {
      errors.push(`Invalid condition value "${p.condition}" ${where}`);
    }

    // commerce_status enum + consistency
    if (!Object.values(COMMERCE_STATUS).includes(p.commerce_status)) {
      errors.push(`Invalid commerce_status "${p.commerce_status}" ${where}`);
    }
    if (p.commerce_status === COMMERCE_STATUS.META_FEED_READY) {
      const missing = metaFeedMissingFields(p, META_FEED_REQUIRED_FIELDS);
      if (missing.length) {
        errors.push(`Marked META_FEED_READY but missing required field(s) [${missing.join(', ')}] ${where}`);
      }
    }

    if (checkNetwork) {
      // handled by caller (async), see checkImagesReachable below
    }
  }

  return { errors, warnings, data };
}

export async function checkImagesReachable(products) {
  const warnings = [];
  const results = await Promise.allSettled(
    products.map(async (p) => {
      try {
        const res = await fetch(p.hero_image, { method: 'HEAD', signal: AbortSignal.timeout(8000) });
        if (!res.ok) warnings.push(`Hero image returned HTTP ${res.status}: ${p.hero_image} [${p.slug}]`);
      } catch (e) {
        warnings.push(`Hero image unreachable (network check skipped/failed: ${e.message}): ${p.hero_image} [${p.slug}]`);
      }
    })
  );
  return warnings;
}

export function validateIndexHtml(sourceProducts) {
  const errors = [];
  const warnings = [];

  if (!existsSync(INDEX_HTML_PATH)) {
    errors.push(`${INDEX_HTML_PATH} does not exist`);
    return { errors, warnings };
  }
  const html = readFileSync(INDEX_HTML_PATH, 'utf8');
  const cardBlocks = html.match(/<article class="card".*?<\/article>/gs) || [];
  if (cardBlocks.length !== sourceProducts.length) {
    errors.push(`index.html has ${cardBlocks.length} product cards, expected ${sourceProducts.length}`);
  }
  for (const p of sourceProducts) {
    if (!html.includes(`<h3>${p.title}</h3>`)) errors.push(`Title lost/changed in index.html: "${p.title}"`);
    if (!html.includes(p.hero_image)) errors.push(`Hero image URL lost/changed in index.html: "${p.hero_image}" [${p.slug}]`);
    if (!html.includes(p.whatsapp_url)) errors.push(`WhatsApp URL lost/changed in index.html: [${p.slug}]`);
  }
  return { errors, warnings };
}

export function validateProductPages(sourceProducts) {
  const errors = [];
  const warnings = [];
  let pageCount = 0;
  for (const p of sourceProducts) {
    const path = `${PRODUCTS_DIR}/${p.slug}/index.html`;
    if (!existsSync(path)) {
      errors.push(`Missing generated product page for "${p.slug}"`);
    } else {
      pageCount += 1;
    }
  }
  return { errors, warnings, pageCount };
}

export function validateOutput(sourceProducts) {
  const a = validateIndexHtml(sourceProducts);
  const b = validateProductPages(sourceProducts);
  return { errors: [...a.errors, ...b.errors], warnings: [...a.warnings, ...b.warnings], pageCount: b.pageCount };
}

async function main() {
  const args = process.argv.slice(2);
  const mode = args.includes('--output') ? 'output' : 'source';
  const checkNetwork = args.includes('--network');

  const { errors, warnings, data } = validateSource({ checkNetwork });

  let networkWarnings = [];
  if (checkNetwork && data) {
    networkWarnings = await checkImagesReachable(data.products);
  }

  let outputErrors = [];
  let outputWarnings = [];
  if (mode === 'output' && data) {
    const out = validateOutput(data.products);
    outputErrors = out.errors;
    outputWarnings = out.warnings;
  }

  const allWarnings = [...warnings, ...networkWarnings, ...outputWarnings];
  const allErrors = [...errors, ...outputErrors];

  for (const w of allWarnings) console.warn(`WARN  ${w}`);
  for (const e of allErrors) console.error(`ERROR ${e}`);

  console.log(`\n${allErrors.length} error(s), ${allWarnings.length} warning(s)`);
  if (allErrors.length > 0) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
