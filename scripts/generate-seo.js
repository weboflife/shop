// Generates crawl-discovery files from the same product source of truth as
// the catalogue. No timestamps are invented: URLs and image references are
// emitted only from confirmed source records.
import { writeFileSync } from 'node:fs';
import { escapeHtml, readJson } from './lib/util.js';
import {
  PRODUCTS_JSON_PATH, SITE_BASE_URL, SITEMAP_PATH, ROBOTS_PATH,
} from './lib/config.js';

function xmlEscape(value) {
  return escapeHtml(value).replace(/'/g, '&apos;');
}

function renderUrl(location, product = null) {
  const image = product
    ? `\n    <image:image>\n      <image:loc>${xmlEscape(product.hero_image)}</image:loc>\n    </image:image>`
    : '';
  return `  <url>\n    <loc>${xmlEscape(location)}</loc>${image}\n  </url>`;
}

function main() {
  const { products } = readJson(PRODUCTS_JSON_PATH);
  const urls = [
    renderUrl(`${SITE_BASE_URL}/`),
    ...products.map((p) => renderUrl(`${SITE_BASE_URL}/products/${p.slug}/`, p)),
  ];
  const sitemap = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n');
  const robots = [
    'User-agent: *',
    'Allow: /',
    '',
    `Sitemap: ${SITE_BASE_URL}/sitemap.xml`,
    '',
  ].join('\n');

  writeFileSync(SITEMAP_PATH, sitemap, 'utf8');
  writeFileSync(ROBOTS_PATH, robots, 'utf8');
  console.log(`${SITEMAP_PATH} generated: ${products.length + 1} page URLs and ${products.length} image entries.`);
  console.log(`${ROBOTS_PATH} generated with crawl access and sitemap discovery.`);
}

main();
