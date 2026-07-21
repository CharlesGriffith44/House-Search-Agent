// scrape-main-sources.js
// Runs Barnes, Barnes-Suburbs, Junot, Book-a-Flat, and Perenium —
// everything EXCEPT SeLoger, SeLoger-Suburbs, and ParisRental, which run
// as separate isolated jobs (see scrape-single-seloger.js,
// scrape-single-seloger-suburb.js, and scrape-single-parisrental-page.js)
// to test whether giving each its own GitHub Actions runner/session avoids
// anti-bot blocking.
//
// SeLoger (Paris-wide) moved out of this shared job for a different
// reason than the others: its own page/result cap was removed by design
// (no limit on how many listings it pulls), so a full run routinely takes
// longer than combine-sources.js's PER_SOURCE_TIMEOUT_MS (5 min) — inside
// that shared budget, the timeout would silently discard ALL of its
// progress every run rather than return a partial result. Same class of
// problem DanielFeau/Eiffel Housing were moved out for.
//
// Writes its result to output-main.json — a later job downloads this
// alongside all the individual JSON files and merges everything into the
// final Excel file.

const fs = require('fs');
const { combineAllSources } = require('./combine-sources');

async function main() {
  const searchType = process.argv[2] === 'sale' ? 'sale' : 'rent';
  const fetchDetails = process.argv[3] === 'details';

  console.log(`Scraping main sources for ${searchType}${fetchDetails ? ' (with detail enrichment)' : ''} (SeLoger, SeLoger-Suburbs, and ParisRental excluded — run separately)...`);
  const data = await combineAllSources(searchType, { fetchDetails, excludeSeLoger: true, excludeSeLogerSuburbs: true, excludeParisRental: true, excludeDanielFeau: true, excludeEiffelHousing: true });

  console.log(`\nMain sources total: ${data.totalListings}`);
  data.sourceStatus.forEach(s => console.log(`  ${s.source}: ${s.error ? 'FAILED - ' + s.error : s.found + ' listings'}`));

  const outputFilename = searchType === 'sale' ? 'output-main-sale.json' : 'output-main.json';
  fs.writeFileSync(outputFilename, JSON.stringify(data, null, 2));
  console.log(`\n✅ Wrote ${outputFilename}`);
}

main().then(() => process.exit(0)).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
