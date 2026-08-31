// Generates one static page per product at products/<slug>/index.html from
// data/products.json. Only fields with a real (non-null) value are rendered —
// dimensions are omitted entirely when unknown, never shown as a placeholder.
//
// Price/availability/condition/CTA are commerce_status-aware:
//   META_FEED_READY -> real INR price + availability + condition shown as
//                       facts; CTA unchanged ("Enquire on WhatsApp").
//   ENQUIRY_ONLY     -> no price shown (none exists); a plain note explains
//                       it's made-to-order; CTA unchanged.
//   SOLD_ARCHIVE     -> a "Status: Sold" fact instead of price; CTA relabeled
//                       "Enquire about similar work" so the page never reads
//                       as an offer to buy this specific piece — but still
//                       links this product's own WhatsApp URL, so no link is
//                       lost or changed from what's stored in products.json.
//
// These pages are generated into the working tree only, ready to deploy
// alongside index.html — deployment itself is a separate explicit step.
import { existsSync, mkdirSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { escapeHtml, readJson, effectiveDescription } from './lib/util.js';
import { PRODUCTS_JSON_PATH, PRODUCTS_DIR, SITE_BASE_URL, BRAND, COMMERCE_STATUS } from './lib/config.js';
import { pixelBaseScript, viewContentScript, CONTACT_EVENT_ONCLICK } from './lib/pixel.js';

function formatPriceINR(price) {
  return `₹${Number(price).toLocaleString('en-IN')}`;
}

function renderProductPage(p) {
  const title = escapeHtml(p.title);
  const category = escapeHtml(p.category);
  const { text: description } = effectiveDescription(p);
  const descEsc = escapeHtml(description);
  const canonical = `${SITE_BASE_URL}/products/${p.slug}/`;

  const factRows = [];
  factRows.push(['Category', category]);
  if (p.material) factRows.push(['Material', escapeHtml(p.material)]);
  if (p.dimensions) factRows.push(['Dimensions', escapeHtml(p.dimensions)]);

  let ctaLabel = 'Enquire on WhatsApp';
  let noteHtml = '';
  if (p.commerce_status === COMMERCE_STATUS.META_FEED_READY) {
    factRows.push(['Price', formatPriceINR(p.price)]);
    if (p.availability) factRows.push(['Availability', escapeHtml(p.availability)]);
    if (p.condition) factRows.push(['Condition', escapeHtml(p.condition)]);
  } else if (p.commerce_status === COMMERCE_STATUS.ENQUIRY_ONLY) {
    noteHtml = '<p class="note">Made to order — price on enquiry.</p>';
  } else if (p.commerce_status === COMMERCE_STATUS.SOLD_ARCHIVE) {
    factRows.push(['Status', 'Sold — one of a kind, no longer available']);
    ctaLabel = 'Enquire about similar work';
  } else {
    noteHtml = '<p class="note">Availability and price on request.</p>';
  }

  const ldJson = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.title,
    image: [p.hero_image, ...p.additional_images],
    description,
    brand: { '@type': 'Brand', name: BRAND },
    category: p.category,
  };
  if (p.material) ldJson.material = p.material;
  // Offers omitted entirely when price is unknown — no fabricated offer.
  if (p.price !== null && p.price !== undefined && p.currency && p.availability) {
    ldJson.offers = {
      '@type': 'Offer',
      price: String(p.price),
      priceCurrency: p.currency,
      availability: `https://schema.org/${p.availability === 'in stock' ? 'InStock' : 'OutOfStock'}`,
      url: canonical,
    };
  }

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} — Web of Life</title>
<meta name="description" content="${descEsc}">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="product">
<meta property="og:title" content="${title} — Web of Life">
<meta property="og:description" content="${descEsc}">
<meta property="og:image" content="${p.hero_image}">
<meta property="og:url" content="${canonical}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.1.0/dist/tabler-icons.min.css">
<script type="application/ld+json">${JSON.stringify(ldJson)}</script>
${pixelBaseScript()}
${p.commerce_status === COMMERCE_STATUS.META_FEED_READY ? viewContentScript(p) : ''}
<style>
  :root{ --bg:#0e0e0c; --panel:#161613; --card:#17170f; --line:#2a2a24; --ink:#f3f1ea; --mut:#a3a196; --accent:#c9a36a; }
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);font-family:'Inter',system-ui,sans-serif;-webkit-font-smoothing:antialiased}
  a{color:inherit;text-decoration:none}
  .wrap{max-width:760px;margin:0 auto;padding:0 20px}
  header.top{padding:22px 0;border-bottom:1px solid var(--line)}
  .brand{font-family:'Fraunces',serif;font-size:19px}
  .brand small{display:block;font-family:'Inter';font-size:10px;letter-spacing:.24em;color:var(--mut);margin-top:2px}
  .back{color:var(--mut);font-size:13px;margin-top:10px;display:inline-block}
  .back:hover{color:var(--ink)}
  main{padding:36px 0 60px}
  .media{border-radius:16px;overflow:hidden;background:#0c0c0a;aspect-ratio:1/1;max-width:520px;margin:0 auto 28px}
  .media img{width:100%;height:100%;object-fit:cover;display:block}
  .eyebrow{font-size:11px;letter-spacing:.18em;color:var(--accent)}
  h1{font-family:'Fraunces',serif;font-weight:400;font-size:clamp(26px,4vw,38px);margin:8px 0 18px;line-height:1.1}
  .desc{color:#d9d7cd;font-size:16px;line-height:1.6;margin:0 0 24px;max-width:60ch}
  .facts{border-top:1px solid var(--line);padding-top:16px;margin-bottom:28px}
  .fact{display:flex;gap:14px;padding:7px 0;font-size:14px}
  .fact dt{color:var(--mut);min-width:110px}
  .fact dd{margin:0}
  .cta{display:inline-flex;gap:8px;align-items:center;background:var(--accent);color:#1a1408;font-weight:500;padding:13px 22px;border-radius:11px;font-size:15px}
  .note{color:var(--mut);font-size:12px;margin-top:14px}
</style>
</head>
<body>
<header class="top"><div class="wrap">
  <div class="brand">Web of Life<small>AUROVILLE · INDIA</small></div>
  <a class="back" href="${SITE_BASE_URL}/">&larr; Back to the collection</a>
</div></header>
<main><div class="wrap">
  <div class="media"><img src="${p.hero_image}" alt="${title}"></div>
  <span class="eyebrow">${escapeHtml(p.category.toUpperCase())}</span>
  <h1>${title}</h1>
  <p class="desc">${descEsc}</p>
  <dl class="facts">
${factRows.map(([k, v]) => `    <div class="fact"><dt>${k}</dt><dd>${v}</dd></div>`).join('\n')}
  </dl>
  <a class="cta" href="${p.whatsapp_url}" target="_blank" rel="noopener" onclick="${CONTACT_EVENT_ONCLICK}"><i class="ti ti-brand-whatsapp"></i> ${ctaLabel}</a>
  ${noteHtml}
</div></main>
</body>
</html>
`;
}

function main() {
  const { products } = readJson(PRODUCTS_JSON_PATH);

  // Clean out any stale generated pages (e.g. from a slug that no longer
  // exists) before regenerating, so removed products don't leave orphans.
  if (existsSync(PRODUCTS_DIR)) {
    for (const entry of readdirSync(PRODUCTS_DIR, { withFileTypes: true })) {
      if (entry.isDirectory()) rmSync(`${PRODUCTS_DIR}/${entry.name}`, { recursive: true, force: true });
    }
  } else {
    mkdirSync(PRODUCTS_DIR, { recursive: true });
  }

  for (const p of products) {
    const dir = `${PRODUCTS_DIR}/${p.slug}`;
    mkdirSync(dir, { recursive: true });
    writeFileSync(`${dir}/index.html`, renderProductPage(p), 'utf8');
  }

  console.log(`Generated ${products.length} product pages under ${PRODUCTS_DIR}/<slug>/index.html`);
}

main();
