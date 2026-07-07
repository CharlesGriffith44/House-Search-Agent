// barnes-suburbs-scraper.js
//
// VERIFIED LIVE: https://www.barnes-international.com/en/for-rent/france/neuilly-sur-seine.html
// is real and active ("21 propriétés en location à Neuilly-sur-Seine").
// Barnes uses the identical per-town URL pattern as Junot
// (.../france/{town-slug}.html), so this reuses the same town list already
// built for junot-scraper.js rather than re-deriving it.
//
// Pagination: reuses the exact same proven logic from scrape-runner.js
// (call annonces_suivantes() directly, count unique listing URLs, stop on
// no-growth or missing button) since some suburb towns may have enough
// listings to actually need it, even though most probably won't (Barnes'
// entire Paris rental market was only ~146 listings total, so individual
// suburb towns are likely single-to-low-double-digit counts).
//
// NOT individually verified beyond Neuilly-sur-Seine: the other ~50 towns
// use the same confirmed pattern; zero-result towns and genuine failures
// are both handled without crashing, same approach as junot-scraper.js.

const parseListing = require('./parse-listing');
const { HAUTS_DE_SEINE_SLUGS, YVELINES_SLUGS } = (() => {
  // Reuse Junot's town list rather than duplicating it — same suburb
  // coverage should apply across every source per the project's standing
  // instruction to always cover Paris + suburbs together.
  const junotModule = require('./junot-scraper');
  // junot-scraper.js only exports ALL_SLUGS (which includes 'paris' at
  // index 0) — strip that off since Barnes' Paris coverage is handled
  // separately by scrape-runner.js already.
  const suburbSlugs = junotModule.ALL_SLUGS.filter(s => s !== 'paris');
  return { HAUTS_DE_SEINE_SLUGS: suburbSlugs, YVELINES_SLUGS: [] };
})();

const SUBURB_SLUGS = HAUTS_DE_SEINE_SLUGS; // combined list, name kept for clarity at call sites

const LISTING_SELECTOR = 'a[href*="/ref-"]';
const NEXT_BUTTON_SELECTOR = 'a[href^="javascript:annonces_suivantes"]';
const MAX_LISTINGS_PER_TOWN = 100; // same cap as Paris — will simply never be hit for small towns
const MAX_PAGE_CLICKS = 10;
const MAX_CONCURRENT = 3; // matches scrape-runner.js's existing concurrency choice for Barnes

function extractListings() {
  const results = [];
  const seen = new Set();
  const links = Array.from(document.querySelectorAll('a[href*="/ref-"]'));

  for (const link of links) {
    const href = link.href;
    if (seen.has(href)) continue;
    seen.add(href);

    let container = link;
    let text = '';
    for (let i = 0; i < 6; i++) {
      container = container.parentElement;
      if (!container) break;
      text = container.innerText || '';
      if (text.includes('€')) break;
    }

    if (text.includes('€')) {
      results.push({ url: href, rawText: text.slice(0, 400) });
    }
  }

  return results;
}

async function countUniqueListings(page) {
  return page.evaluate((sel) => {
    const anchors = Array.from(document.querySelectorAll(sel));
    return new Set(anchors.map(a => a.href)).size;
  }, LISTING_SELECTOR);
}

// Same proven pagination approach as scrape-runner.js's collectWithPagination.
async function collectWithPagination(page) {
  let previousCount = 0;
  let clicks = 0;

  while (clicks < MAX_PAGE_CLICKS) {
    const currentCount = await countUniqueListings(page);
    if (currentCount >= MAX_LISTINGS_PER_TOWN) break;
    if (clicks > 0 && currentCount === previousCount) break;

    const nextButton = await page.$(NEXT_BUTTON_SELECTOR);
    if (!nextButton) break; // no next button = all results already loaded (the common case for small towns)

    previousCount = currentCount;

    const calledDirectly = await page.evaluate(() => {
      if (typeof window.annonces_suivantes === 'function') {
        try { window.annonces_suivantes(); return true; } catch (e) { return false; }
      }
      return false;
    });
    if (!calledDirectly) {
      await nextButton.click().catch(() => {});
    }

    try {
      await page.waitForFunction(
        (sel, prev) => new Set(Array.from(document.querySelectorAll(sel)).map(a => a.href)).size > prev,
        { timeout: 8000 },
        LISTING_SELECTOR,
        previousCount
      );
    } catch (e) {
      break;
    }

    clicks++;
  }

  return page.evaluate(extractListings);
}

async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const current = nextIndex++;
      results[current] = await fn(items[current], current);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
  return results;
}

async function scrapeTown(browser, slug, searchType) {
  let page;
  try {
    page = await browser.newPage();
    await page.setDefaultNavigationTimeout(20000);
    const urlBase = searchType === 'purchase'
      ? 'https://www.barnes-international.com/en/for-sale/france/'
      : 'https://www.barnes-international.com/en/for-rent/france/';
    await page.goto(urlBase + slug + '.html', { waitUntil: 'domcontentloaded', timeout: 20000 });

    try {
      await page.waitForSelector(LISTING_SELECTOR, { timeout: 8000 });
    } catch (e) {
      // Genuinely zero listings for this town today — expected, not an error.
    }

    const raw = await collectWithPagination(page);
    await page.close();
    return { slug, listings: raw, error: null };

  } catch (error) {
    if (page) { try { await page.close(); } catch (e) {} }
    return { slug, listings: [], error: error.message };
  }
}

async function scrapeBarnesSuburbs(browser, searchType = 'rent') {
  console.log(`[Barnes-Suburbs] Scraping ${SUBURB_SLUGS.length} suburb towns...`);
  let completed = 0;
  const start = Date.now();

  const results = await mapWithConcurrency(SUBURB_SLUGS, MAX_CONCURRENT, async (slug) => {
    const result = await scrapeTown(browser, slug, searchType);
    completed++;
    if (completed % 10 === 0 || completed === SUBURB_SLUGS.length) {
      const elapsed = ((Date.now() - start) / 1000).toFixed(0);
      console.log(`[Barnes-Suburbs] Progress: ${completed}/${SUBURB_SLUGS.length} (${elapsed}s elapsed)`);
    }
    return result;
  });

  const allListings = [];
  const failedSlugs = [];
  let zeroResultCount = 0;

  for (const r of results) {
    if (r.error) { failedSlugs.push(`${r.slug} (${r.error})`); continue; }
    if (r.listings.length === 0) { zeroResultCount++; continue; }
    for (const item of r.listings) {
      const listing = parseListing(item.rawText);
      listing.url = item.url;
      listing.source = 'Barnes';
      listing.searchType = searchType;
      listing.isExactListing = true;
      allListings.push(listing);
    }
  }

  console.log(`[Barnes-Suburbs] Total listings: ${allListings.length}`);
  console.log(`[Barnes-Suburbs] Zero-result towns: ${zeroResultCount}/${SUBURB_SLUGS.length}`);
  if (failedSlugs.length > 0) console.log(`[Barnes-Suburbs] Failed towns: ${failedSlugs.join(', ')}`);

  return { listings: allListings, diagnostics: { zeroResultCount, failedSlugs } };
}

module.exports = { scrapeBarnesSuburbs, SUBURB_SLUGS };
