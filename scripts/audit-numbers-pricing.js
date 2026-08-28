// Reads the owner's completed pricing workbook (exported from Numbers to
// .cache/numbers-export/exported.xlsx) and reconciles it against
// data/products.json. Read-only: writes nothing back to either file.
// Matches columns by header NAME (case-insensitive, trimmed), never by
// fixed position — the owner's copy has a different column order than the
// one we generated.
import { readJson } from './lib/util.js';
import { PRODUCTS_JSON_PATH, ALLOWED_AVAILABILITY, ALLOWED_CONDITION } from './lib/config.js';
import ExcelJS from 'exceljs';

const EXPORTED_PATH = '.cache/numbers-export/exported.xlsx';

function buildHeaderMap(headerRow) {
  const map = {};
  headerRow.eachCell((cell, colNumber) => {
    const key = String(cell.value ?? '').trim().toLowerCase();
    if (key) map[key] = colNumber;
  });
  return map;
}

function col(map, ...candidates) {
  for (const c of candidates) {
    if (map[c.toLowerCase()] !== undefined) return map[c.toLowerCase()];
  }
  return null;
}

function flattenTextValue(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'string') return v.trim() || null;
  if (typeof v === 'object' && Array.isArray(v.richText)) return v.richText.map((r) => r.text).join('').trim() || null;
  if (typeof v === 'object' && v.text !== undefined) return flattenTextValue(v.text); // hyperlink cell: {text, hyperlink}
  return String(v).trim() || null;
}

function cellText(row, colIdx) {
  if (colIdx === null) return null;
  return flattenTextValue(row.getCell(colIdx).value);
}

function cellRaw(row, colIdx) {
  if (colIdx === null) return undefined;
  return row.getCell(colIdx).value;
}

async function main() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(EXPORTED_PATH);
  const sheet = workbook.getWorksheet('Pricing');
  if (!sheet) throw new Error('No "Pricing" worksheet found in exported file.');

  const headerMap = buildHeaderMap(sheet.getRow(1));
  const colIdx = {
    image: col(headerMap, 'image'),
    title: col(headerMap, 'title', 'our title'),
    price: col(headerMap, 'price (inr)', 'price'),
    category: col(headerMap, 'category', 'our material/category'),
    material: col(headerMap, 'material'),
    availability: col(headerMap, 'availability'),
    condition: col(headerMap, 'condition'),
    commerce_status: col(headerMap, 'commerce status'),
    owner_notes: col(headerMap, 'owner notes'),
    id: col(headerMap, 'product id'),
    product_url: col(headerMap, 'product url'),
  };

  console.log('Detected column mapping (name -> Excel column #):');
  for (const [k, v] of Object.entries(colIdx)) console.log(`  ${k}: ${v === null ? 'NOT FOUND' : v}`);

  if (colIdx.id === null) throw new Error('Could not find a "Product ID" column — cannot safely match rows.');
  if (colIdx.price === null) throw new Error('Could not find a "Price (INR)" column.');

  const pricingRows = [];
  const priceFormatWarnings = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const id = cellText(row, colIdx.id);
    if (!id) continue; // fully blank row, skip

    const priceRaw = cellRaw(row, colIdx.price);
    const priceCell = row.getCell(colIdx.price);

    // Detect anything that looks like it got auto-converted to a date or
    // is otherwise not a plain number — classic spreadsheet corruption risk.
    let priceValue = null;
    let priceIssue = null;
    if (priceRaw === null || priceRaw === undefined || priceRaw === '') {
      priceValue = null;
    } else if (priceRaw instanceof Date) {
      priceIssue = `Cell looks like a DATE (${priceRaw.toISOString()}), not a price — likely auto-converted.`;
    } else if (typeof priceRaw === 'number') {
      priceValue = priceRaw;
      if (priceCell.numFmt && /d{1,4}|m{1,4}|y{2,4}/i.test(priceCell.numFmt) && !/0/.test(priceCell.numFmt)) {
        priceIssue = `Numeric value but cell format looks date-like: "${priceCell.numFmt}"`;
      }
    } else if (typeof priceRaw === 'object' && priceRaw.result !== undefined) {
      // formula cell
      priceValue = typeof priceRaw.result === 'number' ? priceRaw.result : null;
      if (priceValue === null) priceIssue = `Formula cell with non-numeric result: ${JSON.stringify(priceRaw.result)}`;
    } else if (typeof priceRaw === 'string') {
      const cleaned = priceRaw.replace(/[^0-9.]/g, '');
      const n = Number(cleaned);
      if (Number.isFinite(n) && n > 0 && cleaned === priceRaw.trim().replace(/^₹\s?/, '')) {
        priceValue = n;
        priceIssue = `Price stored as TEXT, not a number: "${priceRaw}" (parsed as ${n})`;
      } else if (Number.isFinite(n) && n > 0) {
        priceValue = n;
        priceIssue = `Price stored as text with symbols/formatting: "${priceRaw}" (parsed as ${n}) — verify this is correct.`;
      } else {
        priceIssue = `Non-numeric price text: "${priceRaw}"`;
      }
    } else {
      priceIssue = `Unrecognized price cell type: ${JSON.stringify(priceRaw)}`;
    }

    if (priceIssue) priceFormatWarnings.push({ id, title: cellText(row, colIdx.title), issue: priceIssue });

    pricingRows.push({
      row: r,
      id,
      title: cellText(row, colIdx.title),
      price: priceValue,
      category: cellText(row, colIdx.category),
      material: cellText(row, colIdx.material),
      availability: cellText(row, colIdx.availability),
      condition: cellText(row, colIdx.condition),
      commerce_status: cellText(row, colIdx.commerce_status),
      owner_notes: cellText(row, colIdx.owner_notes),
      product_url: cellText(row, colIdx.product_url),
    });
  }

  console.log(`\nParsed ${pricingRows.length} pricing-sheet rows (of ${sheet.rowCount - 1} data rows total).`);

  // ---- Reconciliation against data/products.json ----
  const { products } = readJson(PRODUCTS_JSON_PATH);
  const productsById = new Map(products.map((p) => [p.id, p]));

  const seenIds = new Map();
  for (const r of pricingRows) {
    seenIds.set(r.id, (seenIds.get(r.id) || 0) + 1);
  }
  const duplicateIds = [...seenIds.entries()].filter(([, count]) => count > 1);

  const matched = [];
  const noMatchingCatalogueProduct = [];
  for (const r of pricingRows) {
    const p = productsById.get(r.id);
    if (p) matched.push({ pricingRow: r, product: p });
    else noMatchingCatalogueProduct.push(r);
  }

  const matchedIds = new Set(matched.map((m) => m.product.id));
  const catalogueProductsWithNoPricingRow = products.filter((p) => !matchedIds.has(p.id));

  const withPrice = matched.filter((m) => m.pricingRow.price !== null && m.pricingRow.price > 0);
  const withNoPrice = matched.filter((m) => m.pricingRow.price === null || m.pricingRow.price <= 0);

  // Conflicts: pricing sheet price differs from an already-confirmed
  // products.json price (should be none currently, since all are null, but
  // check properly for future runs / in case products.json changed).
  const conflictsWithExisting = matched.filter(
    (m) => m.product.price !== null && m.product.price !== undefined && m.pricingRow.price !== null && Number(m.product.price) !== Number(m.pricingRow.price)
  );

  const missingImages = matched.filter((m) => !m.product.hero_image);
  const missingProductUrls = matched.filter((m) => !m.pricingRow.product_url);
  const missingDescriptions = matched.filter((m) => !m.product.description); // authored description; fallback always exists
  const missingAvailability = matched.filter((m) => !m.pricingRow.availability);
  const missingCondition = matched.filter((m) => !m.pricingRow.condition);

  const invalidAvailability = matched.filter((m) => m.pricingRow.availability && !ALLOWED_AVAILABILITY.includes(m.pricingRow.availability));
  const invalidCondition = matched.filter((m) => m.pricingRow.condition && !ALLOWED_CONDITION.includes(m.pricingRow.condition));

  console.log('\n================ RECONCILIATION SUMMARY ================');
  console.log('Total catalogue products (data/products.json):', products.length);
  console.log('Total pricing-sheet rows parsed:', pricingRows.length);
  console.log('Duplicate Product IDs in pricing sheet:', duplicateIds.length, duplicateIds.map(([id, c]) => `${id}(x${c})`));
  console.log('Pricing rows with NO matching catalogue product:', noMatchingCatalogueProduct.length);
  console.log('Catalogue products with NO pricing row at all:', catalogueProductsWithNoPricingRow.length);
  console.log('Matched rows WITH a price > 0:', withPrice.length);
  console.log('Matched rows with NO price / price <= 0:', withNoPrice.length);
  console.log('Price format warnings (dates/text/symbols in price cell):', priceFormatWarnings.length);
  console.log('Conflicts with an existing confirmed products.json price:', conflictsWithExisting.length);
  console.log('Missing hero image (should be 0, sanity check):', missingImages.length);
  console.log('Missing product URL:', missingProductUrls.length);
  console.log('Missing authored description (fallback exists for all):', missingDescriptions.length);
  console.log('Missing availability:', missingAvailability.length);
  console.log('Missing condition:', missingCondition.length);
  console.log('Invalid availability values:', invalidAvailability.length, invalidAvailability.map(m=>`${m.product.id}:"${m.pricingRow.availability}"`));
  console.log('Invalid condition values:', invalidCondition.length, invalidCondition.map(m=>`${m.product.id}:"${m.pricingRow.condition}"`));

  if (priceFormatWarnings.length) {
    console.log('\n--- Price format warnings (detail) ---');
    for (const w of priceFormatWarnings) console.log(`  [${w.id}] "${w.title}": ${w.issue}`);
  }
  if (noMatchingCatalogueProduct.length) {
    console.log('\n--- Pricing rows with no matching catalogue product ---');
    for (const r of noMatchingCatalogueProduct) console.log(`  row ${r.row}: id="${r.id}" title="${r.title}"`);
  }
  if (catalogueProductsWithNoPricingRow.length) {
    console.log('\n--- Catalogue products missing from pricing sheet entirely ---');
    for (const p of catalogueProductsWithNoPricingRow) console.log(`  [${p.id}] ${p.title}`);
  }

  // Price distribution sanity (helps eyeball INR plausibility / stray zeros / huge outliers)
  const prices = withPrice.map((m) => m.pricingRow.price).sort((a, b) => a - b);
  if (prices.length) {
    console.log('\n--- Price distribution (INR, as entered) ---');
    console.log('  min:', prices[0], ' max:', prices[prices.length - 1], ' median:', prices[Math.floor(prices.length / 2)]);
  }

  // Persist full structured result for the report-writing step
  const fs = await import('node:fs');
  fs.writeFileSync('.cache/numbers-export/reconciliation.json', JSON.stringify({
    pricingRows, duplicateIds, noMatchingCatalogueProduct, catalogueProductsWithNoPricingRow,
    withPriceIds: withPrice.map(m=>m.product.id), withNoPriceIds: withNoPrice.map(m=>m.product.id),
    priceFormatWarnings, conflictsWithExisting: conflictsWithExisting.map(m=>({id:m.product.id, existing:m.product.price, sheet:m.pricingRow.price})),
    missingProductUrlIds: missingProductUrls.map(m=>m.product.id),
    missingAvailabilityIds: missingAvailability.map(m=>m.product.id),
    missingConditionIds: missingCondition.map(m=>m.product.id),
    invalidAvailability: invalidAvailability.map(m=>({id:m.product.id, value:m.pricingRow.availability})),
    invalidCondition: invalidCondition.map(m=>({id:m.product.id, value:m.pricingRow.condition})),
  }, null, 2));
  console.log('\nFull structured reconciliation written to .cache/numbers-export/reconciliation.json');
}

main().catch((e) => { console.error('FAILED:', e); process.exit(1); });
