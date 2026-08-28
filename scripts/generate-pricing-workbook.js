// Generates reports/Web-of-Life-Commerce-Pricing.xlsx — a visual owner
// review workbook. Read-only against data/products.json: derives the sheet,
// writes nothing back. Hero images are downloaded, converted from .webp to
// PNG (Excel can't embed .webp), and thumbnailed with sharp; converted
// thumbnails are cached under .cache/hero-images/ (git-ignored) so repeat
// runs don't re-download 184 images every time. Pass --refresh to bypass
// the cache.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import sharp from 'sharp';
import { readJson, sortByCategoryThenTitle } from './lib/util.js';
import {
  PRODUCTS_JSON_PATH, SITE_BASE_URL, COMMERCE_STATUS, ALLOWED_AVAILABILITY, ALLOWED_CONDITION,
} from './lib/config.js';
import { matchAllProducts } from './lib/match-external-prices.js';

const CANDIDATES_PATH = 'data/external-price-candidates.json';

const OUTPUT_PATH = 'reports/Web-of-Life-Commerce-Pricing.xlsx';
const CACHE_DIR = '.cache/hero-images';
const THUMB_TARGET_HEIGHT = 135; // px — middle of the requested 120-150 range
const THUMB_MAX_WIDTH = 190; // px cap for unusually wide/panoramic shots
const PX_TO_PT = 0.75; // 96 DPI screen pixels -> Excel points
const CONCURRENCY = 10;

function productUrl(p) {
  return `${SITE_BASE_URL}/products/${p.slug}/`;
}

async function pool(items, worker, concurrency) {
  const results = new Array(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return results;
}

async function getThumbnail(product, refresh) {
  mkdirSync(CACHE_DIR, { recursive: true });
  const cachePath = `${CACHE_DIR}/${product.id}.png`;
  const metaPath = `${CACHE_DIR}/${product.id}.json`;

  if (!refresh && existsSync(cachePath) && existsSync(metaPath)) {
    try {
      const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
      return { ok: true, buffer: readFileSync(cachePath), width: meta.width, height: meta.height };
    } catch {
      // fall through and re-fetch
    }
  }

  try {
    const res = await fetch(product.hero_image, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const arrayBuf = await res.arrayBuffer();
    const resized = sharp(Buffer.from(arrayBuf)).resize({
      height: THUMB_TARGET_HEIGHT,
      width: THUMB_MAX_WIDTH,
      fit: 'inside',
      withoutEnlargement: true,
    });
    const buffer = await resized.png().toBuffer();
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

async function buildPricingSheet(workbook, products, thumbnails, matches) {
  const matchesById = new Map(matches.map((m) => [m.id, m]));
  const sheet = workbook.addWorksheet('Pricing', { views: [{ state: 'frozen', ySplit: 1 }] });

  sheet.columns = [
    { header: 'Image', key: 'image', width: 26 },
    { header: 'Title', key: 'title', width: 30 },
    { header: 'Category', key: 'category', width: 24 },
    { header: 'Material', key: 'material', width: 24 },
    { header: 'Price (INR)', key: 'price', width: 14 },
    { header: 'Availability', key: 'availability', width: 18 },
    { header: 'Condition', key: 'condition', width: 13 },
    { header: 'Commerce Status', key: 'commerce_status', width: 20 },
    { header: 'Owner Notes', key: 'owner_notes', width: 32 },
    { header: 'Product ID', key: 'id', width: 26 },
    { header: 'Product URL', key: 'product_url', width: 42 },
    { header: 'Visual Match Confidence', key: 'visual_match_confidence', width: 22 },
    { header: 'Matched Source Image', key: 'matched_source_image', width: 30 },
    { header: 'Source Product Title', key: 'source_product_title', width: 28 },
    { header: 'Source Price', key: 'source_price', width: 13 },
    { header: 'Source Currency', key: 'source_currency', width: 13 },
    { header: 'Source URL', key: 'source_url', width: 40 },
    { header: 'Source Availability', key: 'source_availability', width: 18 },
    { header: 'Source Material', key: 'source_material', width: 20 },
    { header: 'Source Dimensions', key: 'source_dimensions', width: 18 },
    { header: 'Match Notes', key: 'match_notes', width: 44 },
    { header: 'Checked On', key: 'checked_on', width: 13 },
  ];
  sheet.getRow(1).eachCell((cell) => styleHeader(cell));
  sheet.getRow(1).height = 22;
  sheet.autoFilter = { from: 'A1', to: 'V1' };
  sheet.getCell('H1').note = 'Calculated automatically from Price / Availability / Condition once imported. Do not type META_FEED_READY here — fill in the input columns instead and let the importer derive it.';
  sheet.getCell('L1').note = 'Provenance columns (L-V): filled in only from real published prices on external sites, matched by comparing the actual product image — never by name similarity alone, never guessed or calculated. See Match Notes for why a row is or isn\'t filled. See the companion workbook Web-of-Life-Visual-Price-Matches.xlsx for a side-by-side image comparison.';

  const bandColors = ['FFFFFFFF', 'FFF6F3EA'];
  let bandIndex = 0;
  let prevCategory = null;
  const failures = [];
  const seenIds = new Set();

  products.forEach((p, idx) => {
    const excelRow = idx + 2; // header is row 1
    const row = sheet.getRow(excelRow);

    if (p.category !== prevCategory) { bandIndex = 1 - bandIndex; prevCategory = p.category; }
    const band = bandColors[bandIndex];

    const match = matchesById.get(p.id);
    // Never overwrite a price the owner already entered; only auto-fill from
    // an EXACT/HIGH_CONFIDENCE INR match when the owner's Price cell is
    // still genuinely blank.
    const priceValue = p.price ?? match.fill_price_inr ?? null;

    row.getCell('title').value = p.title;
    row.getCell('category').value = p.category;
    row.getCell('material').value = p.material ?? '';
    row.getCell('price').value = priceValue;
    row.getCell('price').numFmt = '#,##0.00';
    row.getCell('availability').value = p.availability ?? '';
    row.getCell('condition').value = p.condition ?? '';
    row.getCell('commerce_status').value = p.commerce_status;
    row.getCell('owner_notes').value = p.owner_notes ?? '';
    row.getCell('id').value = p.id;
    row.getCell('product_url').value = { text: productUrl(p), hyperlink: productUrl(p) };
    row.getCell('visual_match_confidence').value = match.visual_match_confidence;
    row.getCell('matched_source_image').value = match.matched_source_image
      ? { text: match.matched_source_image, hyperlink: match.matched_source_image }
      : '';
    row.getCell('source_product_title').value = match.source_product_title ?? '';
    row.getCell('source_price').value = match.source_price ?? '';
    row.getCell('source_currency').value = match.source_currency ?? '';
    row.getCell('source_url').value = match.source_url ? { text: match.source_url, hyperlink: match.source_url.split(' | ')[0] } : '';
    row.getCell('source_availability').value = match.source_availability ?? '';
    row.getCell('source_material').value = match.source_material ?? '';
    row.getCell('source_dimensions').value = match.source_dimensions ?? '';
    row.getCell('match_notes').value = match.match_notes;
    row.getCell('checked_on').value = match.checked_on;

    if (match.match_notes.includes('PRICE_CONFLICT')) {
      row.getCell('visual_match_confidence').font = { bold: true, color: { argb: 'FF9C1F1F' } };
    }

    const allKeys = [
      'image', 'title', 'category', 'material', 'price', 'availability', 'condition', 'commerce_status',
      'owner_notes', 'id', 'product_url', 'visual_match_confidence', 'matched_source_image',
      'source_product_title', 'source_price', 'source_currency', 'source_url', 'source_availability',
      'source_material', 'source_dimensions', 'match_notes', 'checked_on',
    ];
    for (const key of allKeys) {
      row.getCell(key).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: band } };
    }
    row.getCell('match_notes').alignment = { wrapText: true, vertical: 'middle' };
    row.getCell('source_product_title').alignment = { wrapText: true, vertical: 'middle' };

    row.getCell('title').alignment = { wrapText: true, vertical: 'middle' };
    row.getCell('material').alignment = { wrapText: true, vertical: 'middle' };
    row.getCell('owner_notes').alignment = { wrapText: true, vertical: 'middle' };
    row.getCell('category').alignment = { vertical: 'middle' };
    row.getCell('commerce_status').font = { italic: true, color: { argb: 'FF6B6B6B' } };
    row.getCell('commerce_status').alignment = { vertical: 'middle' };
    row.getCell('id').font = { color: { argb: 'FF8A8A80' }, size: 10 };
    row.getCell('id').alignment = { vertical: 'middle' };
    row.getCell('product_url').font = { color: { argb: 'FF6B8BFF' }, underline: true, size: 10 };
    row.getCell('product_url').alignment = { vertical: 'middle' };
    row.getCell('price').alignment = { vertical: 'middle' };
    row.getCell('availability').alignment = { vertical: 'middle' };
    row.getCell('condition').alignment = { vertical: 'middle' };

    sheet.getCell(`F${excelRow}`).dataValidation = {
      type: 'list', allowBlank: true, formulae: [`"${ALLOWED_AVAILABILITY.join(',')}"`],
      showErrorMessage: true, errorTitle: 'Invalid availability', error: `Must be one of: ${ALLOWED_AVAILABILITY.join(', ')}`,
    };
    sheet.getCell(`G${excelRow}`).dataValidation = {
      type: 'list', allowBlank: true, formulae: [`"${ALLOWED_CONDITION.join(',')}"`],
      showErrorMessage: true, errorTitle: 'Invalid condition', error: `Must be one of: ${ALLOWED_CONDITION.join(', ')}`,
    };

    const thumb = thumbnails[idx];
    if (thumb.ok) {
      const imageId = workbook.addImage({ buffer: thumb.buffer, extension: 'png' });
      sheet.addImage(imageId, {
        tl: { col: 0.05, row: excelRow - 1 + 0.05 },
        ext: { width: thumb.width, height: thumb.height },
        editAs: 'oneCell',
      });
      row.height = Math.max(20, thumb.height * PX_TO_PT + 8);
    } else {
      const cell = row.getCell('image');
      cell.value = 'IMAGE UNAVAILABLE';
      cell.font = { bold: true, color: { argb: 'FF9C1F1F' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFBD9D9' } };
      cell.alignment = { wrapText: true, vertical: 'middle' };
      row.height = 30;
      failures.push({ id: p.id, title: p.title, error: thumb.error });
    }

    if (seenIds.has(p.id)) failures.push({ id: p.id, title: p.title, error: 'DUPLICATE ID' });
    seenIds.add(p.id);
  });

  return { failures };
}

function buildSummarySheet(workbook, products) {
  const sheet = workbook.addWorksheet('Summary');
  sheet.columns = [{ header: 'Metric', key: 'metric', width: 34 }, { header: 'Value', key: 'value', width: 16 }];
  sheet.getRow(1).eachCell((cell) => styleHeader(cell));

  const byCategory = new Map();
  for (const p of products) byCategory.set(p.category, (byCategory.get(p.category) || 0) + 1);

  const statusCounts = { META_FEED_READY: 0, ENQUIRY_ONLY: 0, SOLD_ARCHIVE: 0, MISSING_COMMERCE_DATA: 0 };
  for (const p of products) statusCounts[p.commerce_status] = (statusCounts[p.commerce_status] || 0) + 1;

  const missingPrice = products.filter((p) => p.price === null || p.price === undefined).length;
  const missingAvailability = products.filter((p) => p.availability === null || p.availability === undefined).length;
  const missingCondition = products.filter((p) => p.condition === null || p.condition === undefined).length;

  const rows = [
    ['Total products', products.length],
    ['', ''],
    ['By category', ''],
    ...[...byCategory.entries()].sort((a, b) => a[0].localeCompare(b[0])),
    ['', ''],
    ['META_FEED_READY', statusCounts.META_FEED_READY],
    ['MISSING_COMMERCE_DATA', statusCounts.MISSING_COMMERCE_DATA],
    ['ENQUIRY_ONLY', statusCounts.ENQUIRY_ONLY],
    ['SOLD_ARCHIVE', statusCounts.SOLD_ARCHIVE],
    ['', ''],
    ['Still missing price', missingPrice],
    ['Still missing availability', missingAvailability],
    ['Still missing condition', missingCondition],
  ];

  for (const [metric, value] of rows) {
    const r = sheet.addRow({ metric, value });
    if (metric === 'By category' || metric === 'Total products') r.getCell('metric').font = { bold: true };
  }
}

function buildInstructionsSheet(workbook, candidatesDoc) {
  const sheet = workbook.addWorksheet('Instructions');
  sheet.getColumn(1).width = 100;
  sheet.getColumn(1).alignment = { wrapText: true, vertical: 'top' };

  const sourceStatusLines = Object.entries(candidatesDoc.sources).map(([name, s]) => {
    if (s.reachable === false) return `  ${name} — NOT reachable as of ${candidatesDoc.checked_on}: ${s.reason}`;
    return `  ${name} — checked ${candidatesDoc.checked_on}, ${s.products.length} candidate product(s) found`;
  });

  const lines = [
    'Web of Life — Commerce Pricing Workbook',
    '',
    'This workbook is for review only. Nothing you type here is imported automatically.',
    'Once reviewed, the confirmed values get transcribed back into the catalogue through',
    'the existing commerce-data import process.',
    '',
    'EXTERNAL PRICE RESEARCH (columns L-V):',
    '  Columns L-V record real published prices found on aase.life and loamandroot.com,',
    '  matched by comparing the actual product photo — never by name alone — for',
    '  comparison only, never guessed, inferred, or calculated. A price is only copied',
    '  into your editable Price (INR) column when the visual match is VISUAL_EXACT or',
    '  VISUAL_HIGH_CONFIDENCE, the source currency is INR, and you have not already',
    '  entered a price yourself (your entry always wins). See Match Notes per row for why.',
    '  See the companion workbook Web-of-Life-Visual-Price-Matches.xlsx to see both',
    '  images side by side and approve or reject each visual match yourself.',
    ...sourceStatusLines,
    '',
    'EDIT THESE COLUMNS:',
    '  Price (INR)     — plain number, no currency symbol, no commas (e.g. 45000 or 45000.50).',
    '                    Leave blank if the price is not yet confirmed. Never guess.',
    '  Availability    — pick from the dropdown (in stock / out of stock / preorder /',
    '                    available for order). Leave blank if not yet confirmed.',
    '  Condition       — pick from the dropdown (new / refurbished / used).',
    '                    Leave blank if not yet confirmed.',
    '  Owner Notes     — free text, for your own notes. Not shown publicly, not sent to Meta.',
    '',
    'LEAVE THESE ALONE:',
    '  Image           — the product photo, shown for identification only.',
    '  Title / Category / Material — factual catalogue data, not editable here.',
    '  Commerce Status — calculated automatically from Price/Availability/Condition once',
    '                    imported. Do not type META_FEED_READY yourself — filling in the',
    '                    three input columns above is what makes a product eligible; the',
    '                    status always gets recalculated, never taken on faith from a label.',
    '  Product ID      — the stable identifier for this product. Do not edit, reorder, or',
    '                    delete this column\'s values — it is how rows get matched back up.',
    '  Product URL     — reference link to the product\'s page, for your own checking.',
    '  Visual Match Confidence / Matched Source Image / Source Product Title / Source Price /',
    '  Source Currency / Source URL / Source Availability / Source Material / Source',
    '  Dimensions / Match Notes / Checked On — external research provenance, for your',
    '  reference while deciding a price. Not editable inputs.',
    '',
    'ROWS MARKED "IMAGE UNAVAILABLE"',
    '  The photo could not be downloaded when this workbook was generated. Please still',
    '  review and price that row — it is not missing from the catalogue, only its preview',
    '  image failed to load this time.',
    '',
    'All 184 products are listed, grouped by category and sorted alphabetically by title',
    'within each category.',
  ];

  lines.forEach((line, i) => {
    const cell = sheet.getCell(i + 1, 1);
    cell.value = line;
    if (i === 0) cell.font = { bold: true, size: 14 };
    else if (line.endsWith(':')) cell.font = { bold: true };
  });
}

async function main() {
  const refresh = process.argv.includes('--refresh');
  const { products: rawProducts } = readJson(PRODUCTS_JSON_PATH);
  const products = sortByCategoryThenTitle(rawProducts);

  console.log(`Downloading/converting ${products.length} hero images (cache: ${CACHE_DIR}, refresh=${refresh})...`);
  const thumbnails = await pool(products, (p) => getThumbnail(p, refresh), CONCURRENCY);
  const failCount = thumbnails.filter((t) => !t.ok).length;
  console.log(`Images ready: ${thumbnails.length - failCount} ok, ${failCount} failed.`);

  const candidatesDoc = readJson(CANDIDATES_PATH);
  const matches = matchAllProducts(rawProducts, candidatesDoc.sources, candidatesDoc.checked_on);
  const matchCounts = {};
  for (const m of matches) matchCounts[m.visual_match_confidence] = (matchCounts[m.visual_match_confidence] || 0) + 1;
  console.log('Visual match confidence breakdown:', matchCounts);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Web of Life Commerce Automation';
  workbook.created = new Date();

  const { failures } = await buildPricingSheet(workbook, products, thumbnails, matches);
  buildSummarySheet(workbook, products);
  buildInstructionsSheet(workbook, candidatesDoc);

  mkdirSync('reports', { recursive: true });
  await workbook.xlsx.writeFile(OUTPUT_PATH);

  console.log(`\n${OUTPUT_PATH} written.`);
  if (failures.length > 0) {
    console.log(`\n${failures.length} row(s) flagged:`);
    for (const f of failures) console.log(`  [${f.id}] "${f.title}" — ${f.error}`);
  }
}

main();
