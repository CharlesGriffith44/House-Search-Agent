// netlify/functions/search.js
// Main API endpoint for property search

const { scrapeSources } = require('./scrape-runner');
const { SCRAPER_CONFIG } = require('./source-config');

exports.handler = async (event, context) => {
  try {
    // Handle CORS
    if (event.httpMethod === 'OPTIONS') {
      return {
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
        },
        body: 'OK'
      };
    }

    // Parse request body
    let sources = [];
    let minPrice = 0;
    let maxPrice = 100000;
    let searchType = 'rental'; // 'rental' or 'purchase'

    if (event.body) {
      try {
        const body = JSON.parse(event.body);
        sources = body.sources || Object.keys(SCRAPER_CONFIG);
        minPrice = body.minPrice || 0;
        maxPrice = body.maxPrice || 100000;
        searchType = body.searchType || 'rental';
      } catch (e) {
        console.log('Could not parse body:', e.message);
      }
    }

    // If no sources specified, use all
    if (!sources || sources.length === 0) {
      sources = Object.keys(SCRAPER_CONFIG);
    }

    console.log(`Scraping sources: ${sources.join(', ')}`);
    console.log(`Price range: €${minPrice} - €${maxPrice}, Type: ${searchType}`);

    // Run scraper
    const results = await scrapeSources(sources);

    // Combine and filter results
    const allListings = [];
    for (const result of results) {
      if (result.error) {
        console.error(`${result.source}: ${result.error}`);
        continue;
      }

      if (result.listings) {
        for (const listing of result.listings) {
          // Filter by price range
          if (listing.price && listing.price >= minPrice && listing.price <= maxPrice) {
            allListings.push(listing);
          }
        }
      }
    }

    console.log(`Total listings found: ${allListings.length}`);

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        success: true,
        count: allListings.length,
        listings: allListings,
        timestamp: new Date().toISOString()
      })
    };

  } catch (error) {
    console.error('Search error:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        success: false,
        error: error.message || 'Internal server error'
      })
    };
  }
};
