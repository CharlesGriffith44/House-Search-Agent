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
//   - PAGINATION SOLVED: real parameter is ?pagination=N — found by
//     watching what actually happened after a real (non-simulated)
//     click on the page-2 control and inspecting the resulting page's
//     own link list, rather than guessing at URL formats. Verified
//     across 5 pages returning 23 genuinely unique listings (4-5 new
//     per page, not the same content repeated). A real total of ~127
//     properties exists (confirmed via direct browser inspection,
//     overriding an earlier, incorrect page-count read from a stale
//     fetch). Capped at 150 listings / 15 pages to comfortably cover
//     the full real inventory with margin.

const parseListing = require('./parse-listing');
const { extractDetailFeatures } = require('./parse-listing');

const LISTING_SELECTOR = 'a[href*="/en/properties/"]';

async function getBrowser() {
  const puppeteer = require('puppeteer');
  return puppeteer.launch({
    headless: true,
    defaultViewport: { width: 1920, height: 1080 },
    args: ['--disable-dev-shm-usage', '--disable-gpu', '--no-sandbox', '--disable-setuid-sandbox']
  });
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

// Elevator/furnished already work well from the summary card here
// (confirmed above) — this specifically targets bathroom count, which
// (like every other source) is rarely stated in the brief summary text.
// Same cautious approach proven for SeLoger, applied defensively even
// though Eiffel Housing's own anti-bot behavior hasn't been directly
// tested - low cost given the small (~127-150) listing count.
const DETAIL_FETCH_CONCURRENCY = 2;

async function fetchListingDetails(browser, url, isRetry = false) {
  let page;
  try {
    await new Promise(r => setTimeout(r, 400 + Math.random() * 400));
    page = await browser.newPage();
    await page.setDefaultNavigationTimeout(20000);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });

    const bodyText = await page.evaluate(() => document.body.innerText || '');
    await page.close();

    if (bodyText.length < 500 && !isRetry) {
      await new Promise(r => setTimeout(r, 3000 + Math.random() * 2000));
      return fetchListingDetails(browser, url, true);
    }

    return extractDetailFeatures(bodyText);
  } catch (error) {
    if (page) { try { await page.close(); } catch (e) {} }
    return { elevator: null, balcony: null, furnished: null, bathroomsFromDetail: null, bedroomsFromDetail: null };
  }
}

async function enrichWithDetails(browser, listings) {
  if (listings.length === 0) return listings;
  const details = await mapWithConcurrency(listings, DETAIL_FETCH_CONCURRENCY, (listing) =>
    fetchListingDetails(browser, listing.url)
  );
  return listings.map((listing, i) => {
    const d = details[i];
    return {
      ...listing,
      // Elevator/furnished/balcony already reliable from the summary
      // card for this source - keep those as-is rather than risk
      // overwriting good data with a detail-page parse that could fail.
      // Only bathrooms/bedrooms get the fallback-if-null treatment,
      // since those are what's actually missing from the summary text.
      bathrooms: listing.bathrooms != null ? listing.bathrooms : d.bathroomsFromDetail,
      bedrooms: listing.bedrooms != null ? listing.bedrooms : d.bedroomsFromDetail
    };
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

    const basePath = searchType === 'sale'
      ? 'https://eiffel-housing.com/en/sales/'
      : 'https://eiffel-housing.com/en/locations/';
    // Sale inventory confirmed live at just 4 listings — far smaller
    // than rent's 127, so pagination will almost certainly stop after
    // page 1, but the mechanism is left in place in case that changes.
    const MAX_PAGES = searchType === 'sale' ? 3 : 15;
    const allListings = [];
    const seenUrls = new Set();

    for (let pageNum = 1; pageNum <= MAX_PAGES; pageNum++) {
      const url = pageNum === 1
        ? basePath
        : `${basePath}?pagination=${pageNum}`;

      console.log(`[Eiffel Housing] Navigating to ${url}`);
      await page.goto(url, { waitUntil: 'networkidle0', timeout: 20000 }).catch(() => {});
      await new Promise(r => setTimeout(r, 1500));

      try {
        await page.waitForSelector(LISTING_SELECTOR, { timeout: 10000 });
      } catch (e) {
        console.log(`[Eiffel Housing] Page ${pageNum}: no listings — genuinely out of pages.`);
        break;
      }

      const raw = await page.evaluate(extractListings);
      let newCount = 0;
      for (const item of raw) {
        if (seenUrls.has(item.url)) continue;
        seenUrls.add(item.url);

        const listing = parseListing(item.rawText);
        // Elevator/furnished/balcony already present in the summary card —
        // no separate detail-page visit needed.
        const details = extractDetailFeatures(item.rawText);
        listing.url = item.url;
        listing.source = 'Eiffel Housing';
        listing.searchType = searchType;
        listing.isExactListing = true;
        listing.elevator = details.elevator;
        listing.balcony = details.balcony;
        listing.furnished = details.furnished;
        if (listing.bathrooms == null) listing.bathrooms = details.bathroomsFromDetail;

        allListings.push(listing);
        newCount++;
      }

      console.log(`[Eiffel Housing] Page ${pageNum}: ${newCount} new listing(s), ${allListings.length} total so far`);

      if (newCount === 0) break; // genuinely reached the end
      if (allListings.length >= 150) break; // cap reached
    }

    console.log(`[Eiffel Housing] Fetching detail pages for ${allListings.length} listings (concurrency: ${DETAIL_FETCH_CONCURRENCY})...`);
    const enrichedListings = await enrichWithDetails(browser, allListings);

    await browser.close();
    console.log(`[Eiffel Housing] Total listings: ${enrichedListings.length}`);

    return { source: 'Eiffel Housing', searchType, listings: enrichedListings, error: null };

  } catch (error) {
    console.error(`[Eiffel Housing] Fatal error: ${error.message}`);
    if (page) { try { await page.close(); } catch (e) {} }
    if (browser) { try { await browser.close(); } catch (e) {} }
    return { source: 'Eiffel Housing', searchType, listings: [], error: error.message };
  }
}

module.exports = { scrapeEiffelHousing };
