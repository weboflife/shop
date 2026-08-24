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

export const COMMERCE_STATUS = {
  DIRECT_BUY_READY: 'DIRECT_BUY_READY',
  ENQUIRY_ONLY: 'ENQUIRY_ONLY',
  MISSING_COMMERCE_DATA: 'MISSING_COMMERCE_DATA',
};

export const ALLOWED_AVAILABILITY = ['in stock', 'out of stock', 'preorder', 'available for order'];
export const ALLOWED_CONDITION = ['new', 'refurbished', 'used'];

// Fields Meta requires on any row actually written into meta-catalog.csv.
export const DIRECT_BUY_REQUIRED_FIELDS = [
  'id', 'title', 'description', 'availability', 'condition',
  'price', 'currency', 'link', 'hero_image',
];

export const META_CSV_HEADERS = [
  'id', 'title', 'description', 'availability', 'condition',
  'price', 'link', 'image_link', 'additional_image_link', 'brand', 'product_type',
];

export const AUDIT_CSV_HEADERS = [
  'id', 'title', 'slug', 'commerce_status', 'price_status', 'availability_status',
  'condition_status', 'description_status', 'product_url', 'image_status', 'missing_fields',
];
