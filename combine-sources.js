// combine-sources.js
// Merges results from every configured agency into ONE array with a
// consistent schema. This is deliberately simple — per the earlier design
// decision, the combiner's job is just concatenation; making sure each
// source honestly produces the shared schema is what the per-agency
// scraper files (scrape-runner.js, seloger-scraper.js) are responsible for.
//
// Each source is wrapped in its own try/catch so one agency failing (e.g.
// SeLoger eventually getting blocked, Barnes' site changing) can't take
// down the others — the run still produces results for whatever worked,
// with per-source status visible in the output rather than a silent gap.

const { scrapeBarnes } = require('./scrape-runner');
const { scrapeSeLoger } = require('./seloger-scraper');

async function combineAllSources(searchType = 'rent', options = {}) {
  const { fetchDetails = false } = options;
  const results = [];
  const sourceStatus = [];

  // Barnes
  try {
    console.log('=== Scraping Barnes ===');
    const barnesResult = await scrapeBarnes(searchType, { fetchDetails });
    if (barnesResult.error) {
      sourceStatus.push({ source: 'Barnes', found: 0, error: barnesResult.error });
    } else {
      results.push(...barnesResult.listings);
      sourceStatus.push({ source: 'Barnes', found: barnesResult.listings.length, error: null });
    }
  } catch (error) {
    console.error('Barnes threw unexpectedly:', error.message);
    sourceStatus.push({ source: 'Barnes', found: 0, error: error.message });
  }

  // SeLoger (rent only for now — first page only, see seloger-scraper.js)
  if (searchType === 'rent') {
    try {
      console.log('\n=== Scraping SeLoger ===');
      const selogerResult = await scrapeSeLoger(searchType);
      if (selogerResult.error) {
        sourceStatus.push({ source: 'SeLoger', found: 0, error: selogerResult.error });
      } else {
        results.push(...selogerResult.listings);
        sourceStatus.push({ source: 'SeLoger', found: selogerResult.listings.length, error: null });
      }
    } catch (error) {
      console.error('SeLoger threw unexpectedly:', error.message);
      sourceStatus.push({ source: 'SeLoger', found: 0, error: error.message });
    }
  } else {
    sourceStatus.push({ source: 'SeLoger', found: 0, error: 'Purchase not yet supported for SeLoger' });
  }

  return {
    searchType,
    fetchDetails,
    generatedAt: new Date().toISOString(),
    totalListings: results.length,
    sourceStatus,
    listings: results
  };
}

module.exports = { combineAllSources };
