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
const { scrapeJunot } = require('./junot-scraper');
const { scrapeBarnesSuburbs } = require('./barnes-suburbs-scraper');
const { scrapeSeLogerSuburbs } = require('./seloger-suburbs-scraper');

// Blanket timeout wrapper — catches a hang ANYWHERE inside a scraper
// function, not just at browser launch. Real successful runs (both local
// and the one confirmed working GitHub Actions run) completed well under
// 30 seconds per source on the fast path; 3 minutes is generous headroom
// while still failing fast enough that a hang costs minutes, not hours.
function withTimeout(promise, ms, label) {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms: ${label}`)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
}

// Increased from 3 minutes after real evidence: a legitimate Barnes run
// completed in 176.5s (confirmed via logs) but was falsely reported as
// failed because it raced past the old 180000ms ceiling by mere seconds.
// Promise.race-based timeouts don't cancel the underlying operation, so a
// too-tight margin causes exactly this: real success arriving just after
// we'd already given up on it. 5 minutes gives real headroom above the
// observed worst case.
const PER_SOURCE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// Shared runner for every source: wraps in a timeout, catches any thrown
// error, and always contributes a sourceStatus entry — so one source
// failing (timeout, thrown error, or a clean {error: ...} return) never
// stops the others from running or from being reflected in the output.
async function runSource(label, promiseFactory, results, sourceStatus) {
  try {
    console.log(`\n=== Scraping ${label} ===`);
    const result = await withTimeout(promiseFactory(), PER_SOURCE_TIMEOUT_MS, `${label} scrape`);
    if (result.error) {
      sourceStatus.push({ source: label, found: 0, error: result.error });
    } else {
      results.push(...result.listings);
      sourceStatus.push({ source: label, found: result.listings.length, error: null });
    }
  } catch (error) {
    console.error(`${label} threw unexpectedly (or hung and was timed out):`, error.message);
    sourceStatus.push({ source: label, found: 0, error: error.message });
  }
}

async function combineAllSources(searchType = 'rent', options = {}) {
  const { fetchDetails = false, excludeSeLogerSuburbs = false, externalListings = [], externalSourceStatus = [] } = options;
  const results = [...externalListings];
  const sourceStatus = [...externalSourceStatus];

  await runSource('Barnes', () => scrapeBarnes(searchType, { fetchDetails }), results, sourceStatus);
  await runSource('Barnes-Suburbs', () => scrapeBarnesSuburbs(searchType), results, sourceStatus);
  await runSource('Junot', () => scrapeJunot(searchType), results, sourceStatus);

  // SeLoger and its suburbs: rent only for now (first page only, see
  // seloger-scraper.js and seloger-suburbs-scraper.js for why).
  if (searchType === 'rent') {
    await runSource('SeLoger', () => scrapeSeLoger(searchType), results, sourceStatus);
    // SeLoger-Suburbs is excluded here when it's being run as separate
    // isolated matrix jobs instead (see scrape-single-seloger-suburb.js) —
    // each suburb gets its OWN GitHub Actions runner/session, testing
    // whether SeLoger's anti-bot system is flagging the PATTERN of many
    // distinct location searches within one session, not just volume.
    if (!excludeSeLogerSuburbs) {
      await runSource('SeLoger-Suburbs', () => scrapeSeLogerSuburbs(searchType), results, sourceStatus);
    }
  } else {
    sourceStatus.push({ source: 'SeLoger', found: 0, error: 'Purchase not yet supported for SeLoger' });
    if (!excludeSeLogerSuburbs) {
      sourceStatus.push({ source: 'SeLoger-Suburbs', found: 0, error: 'Purchase not yet supported for SeLoger' });
    }
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
