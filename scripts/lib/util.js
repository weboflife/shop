import { readFileSync, writeFileSync } from 'node:fs';

// URL-safe, ASCII, deterministic slug derived from a title. Strips diacritics
// and punctuation rather than inventing an identifier.
const COMBINING_DIACRITICS = /[̀-ͯ]/g;

export function slugify(input) {
  return input
    .normalize('NFKD')
    .replace(COMBINING_DIACRITICS, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Assigns `base`, or base-2/base-3/... deterministically (by first-seen
// order) if `base` collides with an already-used slug.
export function uniqueSlug(base, used) {
  let candidate = base;
  let n = 2;
  while (used.has(candidate)) {
    candidate = `${base}-${n}`;
    n += 1;
  }
  used.add(candidate);
  return candidate;
}

// Lowercased free-text search index matching the site's original data-title
// convention: title + material (or "details on request") + category, all lowercase.
export function buildSearchIndex(title, material, category) {
  const matText = material ?? 'Details on request';
  return `${title} ${matText} ${category}`.toLowerCase();
}

// Strips leading punctuation/quotes before a title is used as a sort key.
// A few titles open with a curly quote (e.g. "“Ripple effect” seater"), and
// plain localeCompare gives that character enough weight to sort it out of
// alphabetical order from a human's point of view.
export function titleSortKey(title) {
  return title.replace(/^[^\p{L}\p{N}]+/u, '');
}

export function sortByCategoryThenTitle(products) {
  return [...products].sort((a, b) => {
    const catCmp = a.category.localeCompare(b.category);
    if (catCmp !== 0) return catCmp;
    return titleSortKey(a.title).localeCompare(titleSortKey(b.title));
  });
}

export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function isValidHttpUrl(str) {
  if (!str) return false;
  try {
    const u = new URL(str);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function csvField(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\n]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export function toCsv(rows, headers) {
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => csvField(row[h])).join(','));
  }
  return lines.join('\n') + '\n';
}

const PRICE_FORMAT_RE = /^\d+(\.\d{1,2})?$/;
const CURRENCY_FORMAT_RE = /^[A-Z]{3}$/;

export function isValidPriceFormat(value) {
  if (value === null || value === undefined || value === '') return false;
  if (typeof value === 'number') return Number.isFinite(value) && value > 0;
  return PRICE_FORMAT_RE.test(String(value)) && Number(value) > 0;
}

export function isValidCurrencyFormat(value) {
  return typeof value === 'string' && CURRENCY_FORMAT_RE.test(value);
}

// Minimal RFC4180 CSV parser (quoted fields, "" escapes, CRLF or LF).
// Matches the shape produced by toCsv(), and tolerant of a spreadsheet
// round-trip (Excel/Sheets export uses the same conventions).
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const len = text.length;
  while (i < len) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i += 1; continue;
      }
      field += c; i += 1; continue;
    }
    if (c === '"') { inQuotes = true; i += 1; continue; }
    if (c === ',') { row.push(field); field = ''; i += 1; continue; }
    if (c === '\r') { i += 1; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i += 1; continue; }
    field += c; i += 1;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  if (rows.length === 0) return [];

  const headers = rows[0];
  return rows
    .slice(1)
    .filter((r) => !(r.length === 1 && r[0] === ''))
    .map((r) => Object.fromEntries(headers.map((h, idx) => [h, r[idx] !== undefined ? r[idx] : ''])));
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function writeJson(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

// Fields required for a product to legitimately appear in meta-catalog.csv.
// `link` and `description` are computed, not stored on the record, so they
// are checked specially rather than via a plain p[field] lookup.
export function metaFeedMissingFields(p, requiredFields) {
  const { text: description } = effectiveDescription(p);
  return requiredFields.filter((f) => {
    if (f === 'description') return !description;
    if (f === 'link') return !p.slug;
    return p[f] === null || p[f] === undefined || p[f] === '';
  });
}

// Returns { text, source } — `product.description` if authored, otherwise a
// restrained factual fallback built only from fields already on the record.
// Never persisted back onto the record: computed fresh at generation time so
// "authored" vs "fallback" never gets blurred in the source of truth.
export function effectiveDescription(product) {
  if (product.description) {
    return { text: product.description, source: 'authored' };
  }
  if (product.material) {
    return {
      text: `${product.title} — a sculptural work in ${product.material.toLowerCase()} by Web of Life.`,
      source: 'fallback_material',
    };
  }
  return {
    text: `${product.title} — a work from Web of Life's ${product.category} collection.`,
    source: 'fallback_category',
  };
}
