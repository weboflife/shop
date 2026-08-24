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

export function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function writeJson(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

// Fields required for a product to legitimately appear in meta-catalog.csv.
// `link` and `description` are computed, not stored on the record, so they
// are checked specially rather than via a plain p[field] lookup.
export function directBuyMissingFields(p, requiredFields) {
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
