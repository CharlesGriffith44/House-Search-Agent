const puppeteer = require('puppeteer-core');

function formatListing(price, address) {
  return {
    source: 'barnes-international',
    price,
    address,
    rooms: 0,
    features: {}
  };
}

async function scrapeBarnesWithTimeout() {
  const cdpEndpoint = 'wss://cdp.catalystsmartbrowz.eu/__catalyst/headless-chrome?projectId=15560000000014028&api-key=ca45fa84dde01401b1ef25c10969f53a8e54715fef80367707cd6c9e745169a4';
  
  let browser;
  try {
    console.log('Connecting to Catalyst...');
    
    // Wrap connection with timeout
    browser = await Promise.race([
      puppeteer.connect({ browserWSEndpoint: cdpEndpoint }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout after 8s')), 8000))
    ]);
    
    console.log('Connected! Creating page...');
    const page = await browser.newPage();
    
    console.log('Navigating to Barnes...');
    await page.goto('https://www.barnes-international.com/locations/paris', { waitUntil: 'networkidle2', timeout: 20000 });
    
    console.log('Extracting prices...');
    const results = await page.evaluate(() => {
      const prices = [];
      document.querySelectorAll('article').forEach(article => {
        const text = article.innerText;
        const match = text.match(/€\s*(\d+[\s,\.]*\d*)/);
        if (match) {
          const price = parseInt(match[1].replace(/[\s,\.]/g, ''));
          if (price > 500) prices.push(price);
        }
      });
      return prices;
    });
    
    console.log('Found', results.length, 'prices');
    await browser.close();
    
    return results.map(p => formatListing(p, 'Paris'));
  } catch (e) {
    console.log('Error:', e.message);
    if (browser) {
      try { await browser.close(); } catch (e2) {}
    }
    return [];
  }
}

exports.handler = async (event) => {
  try {
    const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    const sources = body.sources || [];

    if (!sources.includes('barnes-international')) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Only barnes-international supported' })
      };
    }

    const listings = await scrapeBarnesWithTimeout();
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        prospectorResult: {
          listings,
          count: listings.length
        }
      })
    };
  } catch (e) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: e.message })
    };
  }
};
