// Meta Pixel snippet builder for shop.weboflife.in.
//
// Renders NOTHING until META_PIXEL_ID (scripts/lib/config.js) is set to a
// real value from Meta Events Manager — this file must never fabricate or
// hard-code a placeholder pixel ID. Once the real ID is filled in and
// `node scripts/build.js` is run, the base script (PageView) appears in
// every generated page's <head>, and ViewContent appears on every
// META_FEED_READY product page, automatically — no other code change needed.
import { META_PIXEL_ID } from './config.js';

// Standard Meta Pixel base code (fbevents.js loader + init + PageView).
// Verified against Meta's current Pixel base-code reference
// (developers.facebook.com/docs/meta-pixel/get-started).
export function pixelBaseScript() {
  if (!META_PIXEL_ID) return '';
  return `<!-- Meta Pixel Code -->
<script>
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${META_PIXEL_ID}');
fbq('track', 'PageView');
</script>
<noscript><img height="1" width="1" style="display:none"
src="https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1"
/></noscript>
<!-- End Meta Pixel Code -->`;
}

// ViewContent for a single META_FEED_READY product page. content_ids uses the
// catalogue id (== retailer_id == slug, verified 1:1 across all 91 products),
// so this deterministically matches the Meta Commerce Catalog item. Only
// called for META_FEED_READY products — ENQUIRY_ONLY/SOLD_ARCHIVE products
// have no catalogue entry, so no content_ids exist for them to report.
export function viewContentScript(product) {
  if (!META_PIXEL_ID) return '';
  const params = {
    content_ids: [product.id],
    content_type: 'product',
    currency: 'INR',
  };
  if (typeof product.price === 'number') params.value = product.price;
  return `<script>fbq('track', 'ViewContent', ${JSON.stringify(params)});</script>`;
}

// WhatsApp enquiry links fire Meta's standard "Contact" event — the visitor
// is initiating direct contact with the business (a WhatsApp message), which
// is what actually happens. This is deliberately NOT "Lead" (no form is
// submitted) and NOT "Purchase" (no transaction completes on our site or in
// WhatsApp — a human still negotiates/confirms the sale afterward). Safe to
// attach unconditionally: fbq is guarded, so this is a silent no-op until
// pixelBaseScript() above is actually emitting the base code.
export const CONTACT_EVENT_ONCLICK = "if(typeof fbq==='function'){fbq('track','Contact');}";
