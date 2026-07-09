// scrape-single-seloger-arrondissement.js
// Scrapes ONE Paris arrondissement in isolation — same pattern as
// scrape-single-seloger-suburb.js. Meant to run as its own GitHub Actions
// matrix job (own runner, own session).
//
// Usage:
//   node scrape-single-seloger-arrondissement.js 7

const fs = require('fs');
const { scrapeArrondissement, PARIS_ARRONDISSEMENTS } = require('./seloger-arrondissements-scraper');

async function main() {
  const arrNum = parseInt(process.argv[2], 10);
  if (!arrNum || arrNum < 1 || arrNum > 20) {
    console.error('Usage: node scrape-single-seloger-arrondissement.js <1-20>');
    process.exit(1);
  }

  const arr = PARIS_ARRONDISSEMENTS.find(a => a.arrondissement === arrNum);
  if (!arr) {
    console.error(`Could not find config for arrondissement ${arrNum}`);
    process.exit(1);
  }

  console.log(`[Paris ${arrNum}e] Scraping in isolation (own process, own session)...`);
  const start = Date.now();
  const result = await scrapeArrondissement(arr, 'rent');
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  console.log(`[Paris ${arrNum}e] Done in ${elapsed}s: ${result.listings.length} listings${result.error ? ', ERROR: ' + result.error : ''}`);

  const filename = `output-seloger-arr-${arrNum}.json`;
  fs.writeFileSync(filename, JSON.stringify(result, null, 2));
  console.log(`[Paris ${arrNum}e] Wrote ${filename}`);
}

main().then(() => process.exit(0)).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
