// scrape-single-seloger.js
//
// Scrapes SeLoger (Paris-wide) in complete isolation, as its own GitHub
// Actions job. Moved out of scrape-main after removing its page/result
// cap — SeLoger now runs until it genuinely has no more pages left, by
// design (no time or listing-count limit), which routinely exceeds
// combine-sources.js's shared PER_SOURCE_TIMEOUT_MS (5 min). Inside that
// shared budget the timeout discards ALL progress, not a partial result,
// so every run would report 0 SeLoger listings despite the scraper
// working correctly. Same class of problem DanielFeau and Eiffel Housing
// were moved out for — this file follows the identical pattern.
//
// Usage:
//   node scrape-single-seloger.js rent
//   node scrape-single-seloger.js sale
//
// Writes its result to seloger-main-output.json or
// seloger-main-output-sale.json — becomes a GitHub Actions artifact that
// merge-and-generate.js downloads and combines with everything else.
// Deliberately NOT named output-seloger-*.json: that pattern is already
// claimed by the per-suburb result files (see findSeLogerSuburbFiles in
// merge-and-generate.js) — reusing it here would make this file get
// merged as if it were an extra suburb.

const fs = require('fs');
const { scrapeSeLoger } = require('./seloger-scraper');

async function main() {
  const searchType = process.argv[2] === 'sale' ? 'sale' : 'rent';

  console.log(`[SeLoger] Scraping ${searchType} in isolation (own process, own job, no cap)...`);
  const start = Date.now();
  const result = await scrapeSeLoger(searchType);
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  console.log(`[SeLoger] Done in ${elapsed}s: ${result.listings.length} listings${result.error ? ', ERROR: ' + result.error : ''}`);

  const filename = searchType === 'sale' ? 'seloger-main-output-sale.json' : 'seloger-main-output.json';
  fs.writeFileSync(filename, JSON.stringify(result, null, 2));
  console.log(`[SeLoger] Wrote ${filename}`);
}

main().then(() => process.exit(0)).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
