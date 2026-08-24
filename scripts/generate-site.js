// Regenerates ONLY the product grid inside index.html from data/products.json.
// Everything else in the file (header, hero, styles, script, footer) is
// preserved byte-for-byte. This is data normalization, not a redesign: the
// card markup produced here is byte-identical in structure to the original
// hand-authored cards, just templated instead of duplicated 184 times.
//
// Card display text is intentionally NOT driven by commerce fields yet
// (price always renders "Price on request", material falls back to
// "Details on request") so the live site's appearance and behaviour do not
// change in this phase, regardless of what gets filled into products.json later.
import { readFileSync, writeFileSync } from 'node:fs';
import { escapeHtml, buildSearchIndex, readJson } from './lib/util.js';
import { PRODUCTS_JSON_PATH, INDEX_HTML_PATH } from './lib/config.js';
import { validateIndexHtml } from './validate.js';

const GRID_START_MARKER = '<main class="grid" id="grid">';
const GRID_END_MARKER = '<p class="empty" id="empty" style="display:none">No pieces match that search.</p>\n  </main>';

function renderCard(p) {
  const cat = escapeHtml(p.category);
  const matText = escapeHtml(p.material ?? 'Details on request');
  const title = escapeHtml(p.title);
  const searchIndex = escapeHtml(buildSearchIndex(p.title, p.material, p.category));
  const eyebrow = escapeHtml(p.category.toUpperCase());
  const wa = p.whatsapp_url; // already a valid, pre-escaped URL from source; used verbatim

  return `      <article class="card" data-cat="${cat}" data-title="${searchIndex}">
        <a class="card-media" href="${wa}" target="_blank" rel="noopener">
          <img loading="lazy" src="${p.hero_image}" alt="${title}">
          <span class="save" aria-label="Save"><i class="ti ti-bookmark"></i></span>
        </a>
        <div class="card-body">
          <span class="eyebrow">${eyebrow}</span>
          <h3>${title}</h3>
          <p class="mat">${matText}</p>
          <div class="card-foot">
            <span class="price">Price on request</span>
            <a class="buy" href="${wa}" target="_blank" rel="noopener"><i class="ti ti-brand-whatsapp"></i> Enquire</a>
          </div>
        </div>
      </article>`;
}

function main() {
  const { products } = readJson(PRODUCTS_JSON_PATH);
  const html = readFileSync(INDEX_HTML_PATH, 'utf8');

  const startIdx = html.indexOf(GRID_START_MARKER);
  const endIdx = html.indexOf(GRID_END_MARKER);
  if (startIdx === -1 || endIdx === -1) {
    throw new Error('Could not locate product grid markers in index.html — aborting to avoid corrupting the file.');
  }

  const before = html.slice(0, startIdx + GRID_START_MARKER.length);
  const after = html.slice(endIdx);

  const cardsHtml = products.map(renderCard).join('\n');
  const newHtml = `${before}\n${cardsHtml}\n    ${after}`;

  // Verify in-memory before writing anything to disk.
  const tmpCheck = newHtml;
  const cardBlocks = tmpCheck.match(/<article class="card".*?<\/article>/gs) || [];
  if (cardBlocks.length !== products.length) {
    throw new Error(`Pre-write check failed: generated ${cardBlocks.length} cards, expected ${products.length}. Not writing.`);
  }
  for (const p of products) {
    if (!tmpCheck.includes(`<h3>${escapeHtml(p.title)}</h3>`)) {
      throw new Error(`Pre-write check failed: title "${p.title}" missing from generated output. Not writing.`);
    }
    if (!tmpCheck.includes(p.hero_image)) {
      throw new Error(`Pre-write check failed: hero image for "${p.title}" missing from generated output. Not writing.`);
    }
    if (!tmpCheck.includes(p.whatsapp_url)) {
      throw new Error(`Pre-write check failed: WhatsApp URL for "${p.title}" missing from generated output. Not writing.`);
    }
  }
  const categories = new Set(products.map((p) => p.category));
  for (const c of categories) {
    if (!tmpCheck.includes(`data-cat="${escapeHtml(c)}"`)) {
      throw new Error(`Pre-write check failed: category "${c}" missing from generated output. Not writing.`);
    }
  }

  writeFileSync(INDEX_HTML_PATH, newHtml, 'utf8');
  console.log(`index.html regenerated: ${products.length} product cards written.`);

  const post = validateIndexHtml(products);
  if (post.errors.length) {
    console.error('POST-WRITE VALIDATION FAILED:');
    post.errors.forEach((e) => console.error('  ERROR ' + e));
    process.exitCode = 1;
  } else {
    console.log('Post-write validation passed: count, titles, hero images, and WhatsApp links all match products.json.');
  }
}

main();
