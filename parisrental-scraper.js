// parisrental-scraper.js
//
// VERIFIED LIVE:
//   - https://en.parisrental.com/furnished-apartments/ (page 1) — "92
//     results match your search", well within our normal per-source range.
//   - https://en.parisrental.com/furnished-apartments/?page=2 through
//     ?page=6 — simple URL-based pagination, same easy pattern as
//     Book-a-Flat/Perenium.
//   - Listing link pattern: individual listings live at
//     /furnished-apartments/{slug}-{numeric-ref}, e.g.
//     /furnished-apartments/4-bedrooms-furnished-rental-paris-59373 — no
//     clean fixed prefix like other sources, so the filter here is "lives
//     under /furnished-apartments/ AND ends in a hyphen+digits" (the ref
//     number), which distinguishes real listings from the bare category
//     page link itself.
//   - SUBURBS ALREADY INCLUDED: Boulogne-Billancourt, Neuilly-sur-Seine,
//     Levallois-Perret, Puteaux, Issy-les-Moulineaux, Versailles, and
//     Courbevoie all appear as filter options alongside Paris districts —
//     same situation as Book-a-Flat/Perenium, no separate suburb-specific
//     scraping needed.
//   - Address format: "Paris 16e - Avenue Victor Hugo" — bare "e" ordinal
//     (matches Junot's format, already handled by the shared parser).
//   - Price format: "Monthly rent €7,900" — no explicit "/month" suffix,
//     but correctly falls through to the generic (non-rent-specific)
//     price regex, which doesn't require one.
//   - Room/sqm formats ("4 chambres", "180 m²") already match existing
//     regex, no changes needed.

const parseListing = require('./parse-listing');

const BASE_URL = 'https://en.parisrental.com/furnished-apartments/';
const MAX_PAGES = 8; // safety margin above the ~6-7 pages actually observed

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
  // Must live under /furnished-apartments/ AND end in a hyphen+digits
  // (the ref number) — distinguishes real listing links from the bare
  // category page link ("View all rental apartments" points to the exact
  // same /furnished-apartments/ URL with nothing after it).
  const links = Array.from(document.querySelectorAll('a[href*="/furnished-apartments/"]'))
    .filter(l => /\/furnished-apartments\/.+-\d+\/?$/.test(l.href));

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

async function scrapeParisRental(searchType = 'rent') {
  let browser;
  try {
    browser = await getBrowser();
    const allListings = [];
    const seenUrls = new Set();

    for (let pageNum = 1; pageNum <= MAX_PAGES; pageNum++) {
      const page = await browser.newPage();
      await page.setDefaultNavigationTimeout(20000);
      const url = pageNum === 1 ? BASE_URL : `${BASE_URL}?page=${pageNum}`;

      console.log(`[ParisRental] Navigating to ${url}`);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});

      try {
        await page.waitForSelector('a[href*="/furnished-apartments/"]', { timeout: 10000 });
      } catch (e) {
        console.log(`[ParisRental] No listings found on page ${pageNum} — assuming end of results.`);
        await page.close();
        break;
      }

      const raw = await page.evaluate(extractListings);
      console.log(`[ParisRental] Page ${pageNum}: ${raw.length} raw items`);

      let newCount = 0;
      for (const item of raw) {
        if (seenUrls.has(item.url)) continue;
        seenUrls.add(item.url);
        const listing = parseListing(item.rawText);
        listing.url = item.url;
        listing.source = 'ParisRental';
        listing.searchType = searchType;
        listing.isExactListing = true;
        allListings.push(listing);
        newCount++;
      }
      await page.close();

      if (newCount === 0) {
        console.log(`[ParisRental] Page ${pageNum} had no new listings — stopping.`);
        break;
      }
      if (allListings.length >= 100) {
        console.log(`[ParisRental] Reached 100-listing cap — stopping.`);
        break;
      }
    }

    await browser.close();
    console.log(`[ParisRental] Total unique listings: ${allListings.length}`);

    return { source: 'ParisRental', searchType, listings: allListings, error: null };

  } catch (error) {
    console.error(`[ParisRental] Fatal error: ${error.message}`);
    if (browser) { try { await browser.close(); } catch (e) {} }
    return { source: 'ParisRental', searchType, listings: [], error: error.message };
  }
}

module.exports = { scrapeParisRental };
