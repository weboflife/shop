// Joins pre-decided VISUAL matches (recorded on candidates in
// data/external-price-candidates.json) to Web of Life products and applies
// the price/provenance rules. This module does NOT decide whether two
// images show the same object — a visual match cannot be computed from
// text, so `matched_product_id` / `visual_match_confidence` /
// `visual_match_notes` must already be set on a candidate by whoever
// actually compared its image against our hero_image. This module only:
//   - looks up which candidate(s) claim a given product
//   - detects genuine price conflicts across sources for the same match
//   - decides whether a price is eligible to auto-fill the owner's
//     Price (INR) cell (VISUAL_EXACT/VISUAL_HIGH_CONFIDENCE + INR only)
//   - never overwrites a price the owner already entered
const VISUAL_MATCH_CONFIDENCE = {
  VISUAL_EXACT: 'VISUAL_EXACT',
  VISUAL_HIGH_CONFIDENCE: 'VISUAL_HIGH_CONFIDENCE',
  VISUAL_POSSIBLE: 'VISUAL_POSSIBLE',
  NO_MATCH: 'NO_MATCH',
};

const AUTO_FILL_TIERS = [VISUAL_MATCH_CONFIDENCE.VISUAL_EXACT, VISUAL_MATCH_CONFIDENCE.VISUAL_HIGH_CONFIDENCE];

function parsePrice(raw) {
  if (raw === null || raw === undefined) return null;
  const cleaned = String(raw).replace(/[^0-9.]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function allSourceCandidates(candidatesBySource) {
  const out = [];
  for (const [sourceName, source] of Object.entries(candidatesBySource)) {
    for (const candidate of source.products || []) {
      out.push({ sourceName, ...candidate });
    }
  }
  return out;
}

export function matchProduct(product, allCandidates, checkedOn) {
  const hits = allCandidates.filter((c) => c.matched_product_id === product.id && c.visual_match_confidence);

  if (hits.length === 0) {
    return {
      visual_match_confidence: VISUAL_MATCH_CONFIDENCE.NO_MATCH,
      matched_source_image: null,
      source_product_title: null,
      source_price: null,
      source_currency: null,
      source_url: null,
      source_availability: null,
      source_material: null,
      source_dimensions: null,
      match_notes: 'No external image was available/matched for visual comparison.',
      checked_on: checkedOn,
      fill_price_inr: null,
    };
  }

  const priceSignatures = new Set(hits.map((h) => `${parsePrice(h.current_price)}|${(h.currency || '').toUpperCase()}`));

  if (hits.length === 1 || priceSignatures.size === 1) {
    const best = hits.sort((a, b) => {
      const rank = { VISUAL_EXACT: 0, VISUAL_HIGH_CONFIDENCE: 1, VISUAL_POSSIBLE: 2 };
      return rank[a.visual_match_confidence] - rank[b.visual_match_confidence];
    })[0];
    const price = parsePrice(best.current_price);
    const currency = (best.currency || '').toUpperCase();
    const isAutoFillTier = AUTO_FILL_TIERS.includes(best.visual_match_confidence);
    return {
      visual_match_confidence: best.visual_match_confidence,
      matched_source_image: best.image_url || null,
      source_product_title: best.title || null,
      source_price: price,
      source_currency: currency || null,
      source_url: best.url || null,
      source_availability: best.availability_text || null,
      source_material: best.material_text || null,
      source_dimensions: best.dimensions_text || null,
      match_notes: best.visual_match_notes || `${best.sourceName}: ${best.visual_match_confidence.toLowerCase().replace('_', ' ')}.`,
      checked_on: checkedOn,
      fill_price_inr: isAutoFillTier && currency === 'INR' ? price : null,
    };
  }

  // Multiple visually-matched candidates for the same product with
  // different prices — never auto-select. Flag for owner review.
  const variantNotes = hits
    .map((h) => `${h.sourceName}: ${h.current_price ?? '?'} ${h.currency ?? ''} (${h.url})`)
    .join(' | ');
  return {
    visual_match_confidence: VISUAL_MATCH_CONFIDENCE.VISUAL_POSSIBLE,
    matched_source_image: hits[0].image_url || null,
    source_product_title: hits[0].title || null,
    source_price: null,
    source_currency: null,
    source_url: hits.map((h) => h.url).join(' | '),
    source_availability: null,
    source_material: hits[0].material_text || null,
    source_dimensions: hits[0].dimensions_text || null,
    match_notes: `PRICE_CONFLICT — visually matched candidates disagree on price: ${variantNotes}`,
    checked_on: checkedOn,
    fill_price_inr: null,
  };
}

export function matchAllProducts(products, candidatesBySource, checkedOn) {
  const allCandidates = allSourceCandidates(candidatesBySource);
  return products.map((p) => ({ id: p.id, ...matchProduct(p, allCandidates, checkedOn) }));
}

export { VISUAL_MATCH_CONFIDENCE };
