// Shared constants for the catalogue -> Meta feed pipeline.
// Brand is applied only at generation time (Meta outputs, product pages),
// not stored per-record in data/products.json.
export const SITE_BASE_URL = 'https://shop.weboflife.in';
export const BRAND = 'Web of Life';

export const PRODUCTS_JSON_PATH = 'data/products.json';
export const INDEX_HTML_PATH = 'index.html';
export const PRODUCTS_DIR = 'products';
export const META_FEED_PATH = 'meta/meta-catalog.csv';
export const AUDIT_REPORT_PATH = 'reports/meta-commerce-audit.csv';
export const OWNER_INPUT_CSV_PATH = 'reports/commerce-owner-input.csv';

// Meta test catalog confirmed manually in Commerce Manager (business:
// WEB OF LIFE DESIGN LAB, id 398895781164523). NOT a production catalog —
// scripts/sync-to-meta.js defaults to this id specifically so a bare
// invocation can never accidentally target a real catalog.
export const META_TEST_CATALOG_ID = '4026302901007451';

// Meta Pixel ID for shop.weboflife.in, from Meta Events Manager > Connect
// Data Sources > Web. Left null until the owner creates the pixel — no
// placeholder/fake ID is ever set here. See scripts/lib/pixel.js: as long as
// this is null, no pixel code is emitted anywhere in the generated output.
export const META_PIXEL_ID = null;

export const COMMERCE_STATUS = {
  META_FEED_READY: 'META_FEED_READY',
  ENQUIRY_ONLY: 'ENQUIRY_ONLY',
  SOLD_ARCHIVE: 'SOLD_ARCHIVE',
  MISSING_COMMERCE_DATA: 'MISSING_COMMERCE_DATA',
};

export const ALLOWED_AVAILABILITY = ['in stock', 'out of stock', 'preorder', 'available for order'];
export const ALLOWED_CONDITION = ['new', 'refurbished', 'used'];

// Fields Meta requires on any row actually written into meta-catalog.csv.
export const META_FEED_REQUIRED_FIELDS = [
  'id', 'title', 'description', 'availability', 'condition',
  'price', 'currency', 'link', 'hero_image',
];

export const META_CSV_HEADERS = [
  'id', 'title', 'description', 'availability', 'condition',
  'price', 'link', 'image_link', 'additional_image_link', 'brand', 'product_type',
];

export const AUDIT_CSV_HEADERS = [
  'id', 'title', 'category', 'material', 'price', 'currency', 'availability', 'condition',
  'commerce_status', 'missing_fields', 'product_url', 'image_status',
];

export const OWNER_INPUT_CSV_HEADERS = [
  'id', 'title', 'slug', 'category', 'material', 'current_description', 'hero_image',
  'product_url', 'price', 'currency', 'availability', 'condition', 'commerce_status', 'owner_notes',
];
