// eiffel-housing-scraper.js
//
// VERIFIED LIVE:
//   - https://eiffel-housing.com/en/locations/ — "113 properties found",
//     real server-rendered content (unlike Scandic/Paris Corporate
//     Housing, which showed empty content via the same fetch method,
//     suggesting a JS-heavy SPA architecture).
//   - Listing link pattern: /en/properties/{slug} — clean.
//   - SUBURBS ALREADY INCLUDED: Neuilly and Colombes both appeared
//     directly in the same default listing feed as Paris arrondissements
//     — no separate suburb-specific scraping needed.
//   - Price format: "10,000 €/month" — comma-thousands, already matches
//     the existing rent regex.
//   - Address format: bare "Paris 16" with NO ordinal suffix at all (not
//     "16e", "16ème", or "16th") — a genuinely new format. Fixed in
//     parse-listing.js and normalize-area.js (made the suffix optional,
//     with a digit-guard to avoid misreading a nearby price as part of
//     the arrondissement number).
//   - Elevator/furnished/floor info already in the summary card text
//     ("Unfurnished 1st floor with elevator") — confirmed working
//     directly via extractDetailFeatures(), no detail-page visits needed
//     at all, unlike Barnes/SeLoger.
//   - PAGINATION NOT SOLVED: the pagination controls use "#listing"
//     anchor links, not real page URLs — suggesting AJAX/JS-based
//     pagination (similar to Barnes' click-based pagination) rather than
//     a simple ?page=2 pattern. Rather than guess at unverified mechanics
//     and risk another multi-round iteration cycle, this scrapes the
//     first page only (12 listings, sorted by availability date by
//     default) — same "first page only" tradeoff already accepted for
//     SeLoger's Paris pagination.

const parseListing = require('./parse-listing');
const { extractDetailFeatures } = require('./parse-listing');

const URL_RENT = 'https://eiffel-housing.com/en/locations/';
const LISTING_SELECTOR = 'a[href*="/en/properties/"]';

async function getBrowser() {
  const puppeteer = require('puppeteer');
  return puppeteer.launch({
    headless: true,
    defaultViewport: { width: 1920, height: 1080 },
    args: ['--disable-dev-shm-usage', '--disable-gpu', '--no-sandbox', '--disable-setuid-sandbox']
  });
}

function extractListings() {
  const results = [];
  const seen = new Set();
  const links = Array.from(document.querySelectorAll('a[href*="/en/properties/"]'));

  for (const link of links) {
    const href = link.href;
    if (seen.has(href)) continue;
    seen.add(href);

    let container = link;
    let text = '';
    for (let i = 0; i < 8; i++) {
      container = container.parentElement;
      if (!container) break;
      text = container.innerText || '';
      if (text.includes('€')) break;
    }

    if (text.includes('€')) {
      results.push({ url: href.split('?')[0], rawText: text.slice(0, 500) });
    }
  }

  return results;
}

async function scrapeEiffelHousing(searchType = 'rent') {
  let browser;
  let page;
  try {
    browser = await getBrowser();
    page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setDefaultNavigationTimeout(20000);

    console.log(`[Eiffel Housing] Navigating to ${URL_RENT}`);
    await page.goto(URL_RENT, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});

    try {
      await page.waitForSelector(LISTING_SELECTOR, { timeout: 10000 });
    } catch (e) {
      console.log('[Eiffel Housing] No listings found — genuinely empty, or blocked.');
    }

    const raw = await page.evaluate(extractListings);
    console.log(`[Eiffel Housing] Page 1: ${raw.length} raw items`);

    const listings = raw.map(item => {
      const listing = parseListing(item.rawText);
      // Elevator/furnished/balcony already present in the summary card —
      // reuse the same detail-feature extraction directly on the raw
      // text, no separate detail-page visit needed (confirmed working
      // via testing before this was built).
      const details = extractDetailFeatures(item.rawText);
      listing.url = item.url;
      listing.source = 'Eiffel Housing';
      listing.searchType = searchType;
      listing.isExactListing = true;
      listing.elevator = details.elevator;
      listing.balcony = details.balcony;
      listing.furnished = details.furnished;
      if (listing.bathrooms == null) listing.bathrooms = details.bathroomsFromDetail;
      return listing;
    });

    await browser.close();
    console.log(`[Eiffel Housing] Total listings: ${listings.length}`);

    return { source: 'Eiffel Housing', searchType, listings, error: null };

  } catch (error) {
    console.error(`[Eiffel Housing] Fatal error: ${error.message}`);
    if (page) { try { await page.close(); } catch (e) {} }
    if (browser) { try { await browser.close(); } catch (e) {} }
    return { source: 'Eiffel Housing', searchType, listings: [], error: error.message };
  }
}

module.exports = { scrapeEiffelHousing };
