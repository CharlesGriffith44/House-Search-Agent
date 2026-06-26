// netlify/functions/scrape-runner.js
// Orchestrates scraping using Puppeteer with Catalyst CDP

const puppeteerCore = require('puppeteer-core');
const { SCRAPER_CONFIG } = require('./source-config');
const parseListings = require('./parse-listing');

async function connectBrowser() {
  try {
    const browserWSEndpoint = process.env.CATALYST_CDP_URL;
    if (!browserWSEndpoint) {
      throw new Error('CATALYST_CDP_URL environment variable not set');
    }

    const browser = await puppeteerCore.connect({
      browserWSEndpoint,
      defaultViewport: { width: 1920, height: 1080 }
    });

    return browser;
  } catch (error) {
    console.error('Failed to connect browser:', error.message);
    throw error;
  }
}

async function scrapeSource(browser, sourceName, config) {
  let page;
  try {
    console.log(`[${sourceName}] Starting scrape...`);

    page = await browser.newPage();
    await page.setDefaultNavigationTimeout(30000);
    await page.setDefaultTimeout(30000);

    // Navigate to page
    console.log(`[${sourceName}] Navigating to ${config.url}`);
    await page.goto(config.url, { waitUntil: 'networkidle2' }).catch(err => {
      console.warn(`[${sourceName}] Navigation warning: ${err.message}`);
    });

    // Wait for listings to load
    console.log(`[${sourceName}] Waiting for listings...`);
    try {
      await page.waitForSelector(config.waitForSelector, { timeout: 15000 });
    } catch (e) {
      console.warn(`[${sourceName}] Selector timeout, trying alternate wait...`);
      await page.waitForTimeout(5000);
    }

    // Extract listing data
    console.log(`[${sourceName}] Extracting listings...`);
    const rawListings = await page.evaluate((waitForSelector) => {
      const results = [];
      const links = Array.from(document.querySelectorAll(waitForSelector));

      links.forEach((link) => {
        const url = link.href;
        if (!url) return;

        // Get parent container (usually within 2-3 levels up)
        let container = link;
        for (let i = 0; i < 5; i++) {
          container = container.parentElement;
          if (!container) break;
        }

        // Extract text from container or link
        const text = container ? container.innerText : link.innerText;
        const rawText = text || '';

        if (rawText.trim().length > 0) {
          results.push({
            url,
            rawText
          });
        }
      });

      return results;
    }, config.waitForSelector);

    console.log(`[${sourceName}] Found ${rawListings.length} listings`);

    // Parse listings
    const parsed = rawListings.map(item => {
      const listing = parseListings(item.rawText);
      listing.url = item.url;
      listing.source = sourceName;
      return listing;
    });

    // Filter out incomplete listings
    const validListings = parsed.filter(l => l.price > 0 || l.address);

    console.log(`[${sourceName}] Valid listings: ${validListings.length}`);

    await page.close();

    return {
      source: sourceName,
      listings: validListings.slice(0, 100), // Limit to 100 per site
      error: null
    };

  } catch (error) {
    console.error(`[${sourceName}] Error: ${error.message}`);
    if (page) {
      try {
        await page.close();
      } catch (e) {
        // Ignore close errors
      }
    }

    return {
      source: sourceName,
      listings: [],
      error: error.message
    };
  }
}

async function scrapeSources(sourceNames) {
  let browser;
  const results = [];

  try {
    // Try to connect to browser
    try {
      browser = await connectBrowser();
      console.log('✅ Connected to Catalyst CDP');
    } catch (e) {
      console.error('❌ Failed to connect to Catalyst CDP:', e.message);
      console.error('Make sure CATALYST_CDP_URL is set in Netlify environment variables');
      throw e;
    }

    // Scrape each source
    for (const sourceName of sourceNames) {
      if (!SCRAPER_CONFIG[sourceName]) {
        console.warn(`Source "${sourceName}" not found in configuration`);
        continue;
      }

      const config = SCRAPER_CONFIG[sourceName];
      const result = await scrapeSource(browser, sourceName, config);
      results.push(result);

      // Small delay between requests
      await new Promise(r => setTimeout(r, 1000));
    }

    await browser.disconnect();
    console.log('✅ Scraping complete');

  } catch (error) {
    console.error('Scrape runner error:', error.message);
    if (browser) {
      try {
        await browser.disconnect();
      } catch (e) {
        // Ignore disconnect errors
      }
    }
  }

  return results;
}

module.exports = { scrapeSources };
