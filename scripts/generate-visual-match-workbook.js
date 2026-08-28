// Generates reports/Web-of-Life-Visual-Price-Matches.xlsx — one row per
// product, showing our hero image side by side with the visually-matched
// external candidate image (if any), so the owner can approve/reject each
// match without opening any links. Read-only: derives everything from
// data/products.json + data/external-price-candidates.json, writes nothing
// back to either.
//
// Sorted by match confidence tier (VISUAL_EXACT, VISUAL_HIGH_CONFIDENCE,
// VISUAL_POSSIBLE, NO_MATCH), then by product title within each tier.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import sharp from 'sharp';
import { readJson, titleSortKey } from './lib/util.js';
import { PRODUCTS_JSON_PATH, SITE_BASE_URL } from './lib/config.js';
import { matchAllProducts, VISUAL_MATCH_CONFIDENCE } from './lib/match-external-prices.js';

const CANDIDATES_PATH = 'data/external-price-candidates.json';
const OUTPUT_PATH = 'reports/Web-of-Life-Visual-Price-Matches.xlsx';
const HERO_CACHE_DIR = '.cache/hero-images';
const EXTERNAL_CACHE_DIR = '.cache/external-images';
const THUMB_TARGET_HEIGHT = 135;
const THUMB_MAX_WIDTH = 190;
const PX_TO_PT = 0.75;

function productUrl(p) {
  return `${SITE_BASE_URL}/products/${p.slug}/`;
}

async function fetchAndThumbnail(url, cacheDir, cacheKey) {
  mkdirSync(cacheDir, { recursive: true });
  const cachePath = `${cacheDir}/${cacheKey}.png`;
  const metaPath = `${cacheDir}/${cacheKey}.json`;
  if (existsSync(cachePath) && existsSync(metaPath)) {
    try {
      const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
      return { ok: true, buffer: readFileSync(cachePath), width: meta.width, height: meta.height };
    } catch { /* fall through */ }
  }
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const arrayBuf = await res.arrayBuffer();
    const buffer = await sharp(Buffer.from(arrayBuf))
      .resize({ height: THUMB_TARGET_HEIGHT, width: THUMB_MAX_WIDTH, fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer();
    const meta = await sharp(buffer).metadata();
    writeFileSync(cachePath, buffer);
    writeFileSync(metaPath, JSON.stringify({ width: meta.width, height: meta.height }));
    return { ok: true, buffer, width: meta.width, height: meta.height };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function styleHeader(cell) {
  cell.font = { bold: true, color: { argb: 'FFF3F1EA' } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17170F' } };
  cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
}

const TIER_ORDER = [
  VISUAL_MATCH_CONFIDENCE.VISUAL_EXACT,
  VISUAL_MATCH_CONFIDENCE.VISUAL_HIGH_CONFIDENCE,
  VISUAL_MATCH_CONFIDENCE.VISUAL_POSSIBLE,
  VISUAL_MATCH_CONFIDENCE.NO_MATCH,
];

const TIER_BAND = {
  VISUAL_EXACT: 'FFE4F3E6',
  VISUAL_HIGH_CONFIDENCE: 'FFF3F3D9',
  VISUAL_POSSIBLE: 'FFFBEBD9',
  NO_MATCH: 'FFF3F1EA',
};

async function main() {
  const { products } = readJson(PRODUCTS_JSON_PATH);
  const candidatesDoc = readJson(CANDIDATES_PATH);
  const matches = matchAllProducts(products, candidatesDoc.sources, candidatesDoc.checked_on);
  const matchById = new Map(matches.map((m) => [m.id, m]));

  const rows = products
    .map((p) => ({ product: p, match: matchById.get(p.id) }))
    .sort((a, b) => {
      const tierCmp = TIER_ORDER.indexOf(a.match.visual_match_confidence) - TIER_ORDER.indexOf(b.match.visual_match_confidence);
      if (tierCmp !== 0) return tierCmp;
      return titleSortKey(a.product.title).localeCompare(titleSortKey(b.product.title));
    });

  console.log(`Preparing ${rows.length} rows (hero images cached, external images fetched on demand)...`);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Web of Life Commerce Automation';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet('Visual Matches', { views: [{ state: 'frozen', ySplit: 1 }] });

  sheet.columns = [
    { header: 'Our Hero Image', key: 'our_image', width: 26 },
    { header: 'Our Title', key: 'our_title', width: 28 },
    { header: 'Our Material/Category', key: 'our_material_category', width: 26 },
    { header: 'External Matched Image', key: 'ext_image', width: 26 },
    { header: 'External Product Title', key: 'ext_title', width: 28 },
    { header: 'Source Website', key: 'source_website', width: 20 },
    { header: 'Published Price', key: 'price', width: 14 },
    { header: 'Currency', key: 'currency', width: 10 },
    { header: 'Visual Match Confidence', key: 'confidence', width: 20 },
    { header: 'Source URL', key: 'source_url', width: 40 },
    { header: 'Match Notes', key: 'match_notes', width: 44 },
  ];
  sheet.getRow(1).eachCell((cell) => styleHeader(cell));
  sheet.getRow(1).height = 22;
  sheet.autoFilter = { from: 'A1', to: 'K1' };

  let excelRow = 2;
  const missingHero = [];
  for (const { product: p, match: m } of rows) {
    const row = sheet.getRow(excelRow);
    const band = TIER_BAND[m.visual_match_confidence] || 'FFFFFFFF';

    row.getCell('our_title').value = p.title;
    row.getCell('our_material_category').value = `${p.material ?? '(material unknown)'} — ${p.category}`;
    row.getCell('ext_title').value = m.source_product_title ?? (m.visual_match_confidence === 'NO_MATCH' ? 'No external image available' : '');
    row.getCell('source_website').value = m.source_url ? new URL(m.source_url.split(' | ')[0]).hostname : '';
    row.getCell('price').value = m.source_price ?? '';
    row.getCell('price').numFmt = '#,##0.00';
    row.getCell('currency').value = m.source_currency ?? '';
    row.getCell('confidence').value = m.visual_match_confidence;
    row.getCell('source_url').value = m.source_url ? { text: m.source_url, hyperlink: m.source_url.split(' | ')[0] } : '';
    row.getCell('match_notes').value = m.match_notes;

    for (const key of ['our_image', 'our_title', 'our_material_category', 'ext_image', 'ext_title', 'source_website', 'price', 'currency', 'confidence', 'source_url', 'match_notes']) {
      row.getCell(key).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: band } };
    }
    row.getCell('match_notes').alignment = { wrapText: true, vertical: 'middle' };
    row.getCell('ext_title').alignment = { wrapText: true, vertical: 'middle' };

    // Our hero image — always available (cached from the main workbook run).
    const heroCache = `${HERO_CACHE_DIR}/${p.id}.png`;
    const heroMeta = `${HERO_CACHE_DIR}/${p.id}.json`;
    let ourThumb = null;
    if (existsSync(heroCache) && existsSync(heroMeta)) {
      const meta = JSON.parse(readFileSync(heroMeta, 'utf8'));
      ourThumb = { buffer: readFileSync(heroCache), width: meta.width, height: meta.height };
    } else {
      missingHero.push(p.id);
    }

    let extThumb = null;
    if (m.matched_source_image) {
      const key = `${p.id}-${Buffer.from(m.matched_source_image).toString('base64').slice(0, 24)}`;
      const result = await fetchAndThumbnail(m.matched_source_image, EXTERNAL_CACHE_DIR, key);
      if (result.ok) extThumb = result;
    }

    const rowHeights = [20];
    if (ourThumb) {
      const id = workbook.addImage({ buffer: ourThumb.buffer, extension: 'png' });
      sheet.addImage(id, { tl: { col: 0.05, row: excelRow - 1 + 0.05 }, ext: { width: ourThumb.width, height: ourThumb.height }, editAs: 'oneCell' });
      rowHeights.push(ourThumb.height * PX_TO_PT + 8);
    } else {
      row.getCell('our_image').value = 'IMAGE UNAVAILABLE';
      row.getCell('our_image').font = { bold: true, color: { argb: 'FF9C1F1F' } };
    }

    if (extThumb) {
      const id = workbook.addImage({ buffer: extThumb.buffer, extension: 'png' });
      sheet.addImage(id, { tl: { col: 3.05, row: excelRow - 1 + 0.05 }, ext: { width: extThumb.width, height: extThumb.height }, editAs: 'oneCell' });
      rowHeights.push(extThumb.height * PX_TO_PT + 8);
    } else {
      row.getCell('ext_image').value = m.visual_match_confidence === 'NO_MATCH' ? 'NO EXTERNAL IMAGE — SOURCE UNREACHABLE' : 'IMAGE UNAVAILABLE';
      row.getCell('ext_image').font = { italic: true, color: { argb: 'FF8A8A80' } };
      row.getCell('ext_image').alignment = { wrapText: true, vertical: 'middle' };
    }

    row.height = Math.max(...rowHeights, 30);
    excelRow += 1;
  }

  mkdirSync('reports', { recursive: true });
  await workbook.xlsx.writeFile(OUTPUT_PATH);
  console.log(`\n${OUTPUT_PATH} written. ${rows.length} rows.`);
  if (missingHero.length) console.log(`Note: ${missingHero.length} hero image(s) not found in cache — run generate-pricing-workbook.js first to populate it.`);
}

main();
