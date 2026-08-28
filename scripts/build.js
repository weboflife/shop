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

run('1/5 Validate source (data/products.json)', 'scripts/validate.js', ['--source']);
run('2/5 Generate site (index.html)', 'scripts/generate-site.js');
run('3/5 Generate product pages (products/<slug>/)', 'scripts/generate-product-pages.js');
run('4/5 Generate Meta feed + audit report', 'scripts/generate-meta-feed.js');
run('5/5 Validate output', 'scripts/validate.js', ['--output']);

console.log('\nBuild complete.');
