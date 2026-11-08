// Validation for data/products.json and (with --output) the generated
// artifacts derived from it. Exits non-zero on any ERROR. WARNINGs do not
// fail the build but are always printed.
import { readFileSync, existsSync } from 'node:fs';
import {
  readJson, escapeHtml, isValidHttpUrl, metaFeedMissingFields, isValidPriceFormat, isValidCurrencyFormat,
} from './lib/util.js';
import {
  PRODUCTS_JSON_PATH, INDEX_HTML_PATH, PRODUCTS_DIR, SITE_BASE_URL, SITEMAP_PATH, ROBOTS_PATH,
  COMMERCE_STATUS, ALLOWED_AVAILABILITY, ALLOWED_CONDITION,
  META_FEED_REQUIRED_FIELDS,
} from './lib/config.js';

const EXPECTED_COUNT = 184;
const SCHEMA_AVAILABILITY = {
  'in stock': 'https://schema.org/InStock',
  'out of stock': 'https://schema.org/OutOfStock',
  preorder: 'https://schema.org/PreOrder',
  'available for order': 'https://schema.org/MadeToOrder',
};
const SCHEMA_CONDITION = {
  new: 'https://schema.org/NewCondition',
  refurbished: 'https://schema.org/RefurbishedCondition',
  used: 'https://schema.org/UsedCondition',
};

function parseJsonLd(html, label, errors) {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)];
  if (blocks.length !== 1) {
    errors.push(`${label} has ${blocks.length} JSON-LD blocks, expected 1`);
    return null;
  }
  try {
    return JSON.parse(blocks[0][1]);
  } catch (error) {
    errors.push(`${label} has invalid JSON-LD: ${error.message}`);
    return null;
  }
}

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
  if (!html.includes('<link rel="canonical" href="https://shop.weboflife.in/">')) {
    errors.push('index.html is missing its exact self-canonical');
  }
  if (!html.includes('<meta name="description"')) errors.push('index.html is missing a meta description');
  if (!html.includes('<meta property="og:url" content="https://shop.weboflife.in/">')) {
    errors.push('index.html is missing its exact Open Graph URL');
  }
  if (!html.includes('<meta name="twitter:card" content="summary_large_image">')) {
    errors.push('index.html is missing Twitter card metadata');
  }
  if (!html.includes('alt="Attraversiamo sculptural work by Web of Life"')) {
    errors.push('index.html hero image is missing its descriptive alt text');
  }

  const detailHrefs = [...html.matchAll(/href="\/products\/([^"/]+)\/"/g)].map((match) => match[1]);
  const uniqueDetailHrefs = new Set(detailHrefs);
  if (uniqueDetailHrefs.size !== sourceProducts.length) {
    errors.push(`index.html links to ${uniqueDetailHrefs.size} unique product pages, expected ${sourceProducts.length}`);
  }
  for (const p of sourceProducts) {
    const escapedTitle = escapeHtml(p.title);
    if (!html.includes(`<h3>${escapedTitle}</h3>`)) errors.push(`Title lost/changed in index.html: "${p.title}"`);
    if (!html.includes(p.hero_image)) errors.push(`Hero image URL lost/changed in index.html: "${p.hero_image}" [${p.slug}]`);
    if (!html.includes(p.whatsapp_url)) errors.push(`WhatsApp URL lost/changed in index.html: [${p.slug}]`);
    const productPath = `/products/${encodeURIComponent(p.slug)}/`;
    const card = cardBlocks.find((block) => block.includes(`data-title="`) && block.includes(`<h3>${escapedTitle}</h3>`));
    if (!card) continue;
    if (!card.includes(`<a class="card-media" href="${productPath}"`)) {
      errors.push(`Product image does not link to its detail page: [${p.slug}]`);
    }
    if (!card.includes(`<a class="card-title" href="${productPath}"><h3>${escapedTitle}</h3></a>`)) {
      errors.push(`Product title does not link to its detail page: [${p.slug}]`);
    }
    if (!card.includes(p.whatsapp_url)) errors.push(`Card WhatsApp CTA lost/changed: [${p.slug}]`);
  }

  const schema = parseJsonLd(html, 'index.html', errors);
  if (schema) {
    if (schema['@type'] !== 'CollectionPage') errors.push('index.html JSON-LD is not a CollectionPage');
    const list = schema.mainEntity;
    if (list?.['@type'] !== 'ItemList') errors.push('index.html JSON-LD is missing its ItemList');
    if (list?.numberOfItems !== sourceProducts.length) {
      errors.push(`index.html ItemList numberOfItems is ${list?.numberOfItems}, expected ${sourceProducts.length}`);
    }
    const items = list?.itemListElement || [];
    if (items.length !== sourceProducts.length) {
      errors.push(`index.html ItemList has ${items.length} entries, expected ${sourceProducts.length}`);
    }
    const schemaUrls = new Set(items.map((item) => item.url));
    for (const p of sourceProducts) {
      const expected = `${SITE_BASE_URL}/products/${p.slug}/`;
      if (!schemaUrls.has(expected)) errors.push(`ItemList is missing product URL: ${expected}`);
    }
  }
  return { errors, warnings };
}

export function validateProductPages(sourceProducts) {
  const errors = [];
  const warnings = [];
  let pageCount = 0;
  const canonicals = new Set();
  for (const p of sourceProducts) {
    const path = `${PRODUCTS_DIR}/${p.slug}/index.html`;
    if (!existsSync(path)) {
      errors.push(`Missing generated product page for "${p.slug}"`);
    } else {
      pageCount += 1;
      const html = readFileSync(path, 'utf8');
      const canonical = `${SITE_BASE_URL}/products/${p.slug}/`;
      if (!html.includes(`<link rel="canonical" href="${canonical}">`)) {
        errors.push(`Missing or incorrect canonical in product page: [${p.slug}]`);
      }
      canonicals.add(canonical);
      if (!html.includes(p.whatsapp_url)) errors.push(`WhatsApp CTA lost/changed in product page: [${p.slug}]`);

      const schema = parseJsonLd(html, path, errors);
      const graph = schema?.['@graph'] || [];
      const product = graph.find((node) => node['@type'] === 'Product');
      const breadcrumb = graph.find((node) => node['@type'] === 'BreadcrumbList');
      if (!product) {
        errors.push(`Product JSON-LD node missing: [${p.slug}]`);
        continue;
      }
      if (!breadcrumb || breadcrumb.itemListElement?.length !== 2) {
        errors.push(`BreadcrumbList JSON-LD is missing or incomplete: [${p.slug}]`);
      }
      if (product.sku !== p.id || product.productID !== p.id) {
        errors.push(`Product JSON-LD stable identifier mismatch: [${p.slug}]`);
      }
      if (product.url !== canonical || product.mainEntityOfPage !== canonical) {
        errors.push(`Product JSON-LD page relationship mismatch: [${p.slug}]`);
      }
      if (product.brand?.name !== 'Web of Life') errors.push(`Product JSON-LD brand mismatch: [${p.slug}]`);
      if (p.condition) {
        if (product.itemCondition !== SCHEMA_CONDITION[p.condition]) {
          errors.push(`Product JSON-LD itemCondition mismatch: [${p.slug}]`);
        }
      } else if ('itemCondition' in product) {
        errors.push(`Product JSON-LD invents an unconfirmed itemCondition: [${p.slug}]`);
      }
      const shouldHaveOffer = p.commerce_status === COMMERCE_STATUS.META_FEED_READY
        && p.price !== null && p.price !== undefined && p.currency && p.availability;
      if (shouldHaveOffer) {
        if (!product.offers) {
          errors.push(`Product JSON-LD offer missing despite confirmed commerce data: [${p.slug}]`);
        } else {
          if (product.offers.availability !== SCHEMA_AVAILABILITY[p.availability]) {
            errors.push(`Product JSON-LD availability mismatch: [${p.slug}]`);
          }
          if (product.offers.seller?.name !== 'Web of Life') {
            errors.push(`Product JSON-LD seller missing or incorrect: [${p.slug}]`);
          }
        }
      } else if ('offers' in product) {
        errors.push(`Product JSON-LD invents an offer without confirmed commerce data: [${p.slug}]`);
      }
    }
  }
  if (canonicals.size !== sourceProducts.length) {
    errors.push(`Generated product pages have ${canonicals.size} unique canonicals, expected ${sourceProducts.length}`);
  }
  return { errors, warnings, pageCount };
}

export function validateDiscoveryFiles(sourceProducts) {
  const errors = [];
  const warnings = [];
  if (!existsSync(SITEMAP_PATH)) errors.push(`${SITEMAP_PATH} does not exist`);
  if (!existsSync(ROBOTS_PATH)) errors.push(`${ROBOTS_PATH} does not exist`);
  if (errors.length) return { errors, warnings };

  const sitemap = readFileSync(SITEMAP_PATH, 'utf8');
  const pageUrls = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1]);
  const imageUrls = [...sitemap.matchAll(/<image:loc>(.*?)<\/image:loc>/g)].map((match) => match[1]);
  const expectedPageUrls = [
    `${SITE_BASE_URL}/`,
    ...sourceProducts.map((p) => `${SITE_BASE_URL}/products/${p.slug}/`),
  ];
  if (pageUrls.length !== expectedPageUrls.length || new Set(pageUrls).size !== expectedPageUrls.length) {
    errors.push(`${SITEMAP_PATH} has ${pageUrls.length} page URLs (${new Set(pageUrls).size} unique), expected ${expectedPageUrls.length}`);
  }
  for (const url of expectedPageUrls) {
    if (!pageUrls.includes(url)) errors.push(`${SITEMAP_PATH} is missing page URL: ${url}`);
  }
  if (imageUrls.length !== sourceProducts.length) {
    errors.push(`${SITEMAP_PATH} has ${imageUrls.length} image entries, expected ${sourceProducts.length}`);
  }
  for (const p of sourceProducts) {
    if (!imageUrls.includes(escapeHtml(p.hero_image))) {
      errors.push(`${SITEMAP_PATH} is missing hero image: [${p.slug}]`);
    }
  }

  const robots = readFileSync(ROBOTS_PATH, 'utf8');
  if (!/^User-agent: \*$/m.test(robots) || !/^Allow: \/$/m.test(robots)) {
    errors.push(`${ROBOTS_PATH} does not explicitly allow crawling`);
  }
  if (!robots.includes(`Sitemap: ${SITE_BASE_URL}/sitemap.xml`)) {
    errors.push(`${ROBOTS_PATH} is missing the canonical sitemap URL`);
  }
  return { errors, warnings };
}

export function validateOutput(sourceProducts) {
  const a = validateIndexHtml(sourceProducts);
  const b = validateProductPages(sourceProducts);
  const c = validateDiscoveryFiles(sourceProducts);
  return {
    errors: [...a.errors, ...b.errors, ...c.errors],
    warnings: [...a.warnings, ...b.warnings, ...c.warnings],
    pageCount: b.pageCount,
  };
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
