// One command to regenerate everything, in the correct order, with
// validation gates before and after. Run with: node scripts/build.js
import { execFileSync } from 'node:child_process';

function run(label, file, args = []) {
  console.log(`\n=== ${label} ===`);
  try {
    execFileSync('node', [file, ...args], { stdio: 'inherit' });
  } catch (e) {
    console.error(`\nBUILD STOPPED: "${label}" failed.`);
    process.exit(e.status || 1);
  }
}

run('1/6 Validate source (data/products.json)', 'scripts/validate.js', ['--source']);
run('2/6 Generate site (index.html)', 'scripts/generate-site.js');
run('3/6 Generate product pages (products/<slug>/)', 'scripts/generate-product-pages.js');
run('4/6 Generate robots.txt + sitemap.xml', 'scripts/generate-seo.js');
run('5/6 Generate Meta feed + audit report', 'scripts/generate-meta-feed.js');
run('6/6 Validate output', 'scripts/validate.js', ['--output']);

console.log('\nBuild complete.');
