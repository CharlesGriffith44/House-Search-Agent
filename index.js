const https = require('https');

function getFromGitHub(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

exports.handler = async (event) => {
  try {
    const githubUrl = 'https://raw.githubusercontent.com/CharlesGriffith44/House-Search-Agent/main/data/listings.json';
    const data = await getFromGitHub(githubUrl);
    
    // Parse filter parameters from request body
    const body = event.body ? JSON.parse(event.body) : {};
    const filters = {
      sources: body.sources || Object.keys(data.sources),
      type: body.type || ['rental', 'purchase'], // rental, purchase, or both
      minPrice: body.minPrice || 0,
      maxPrice: body.maxPrice || 999999999
    };
    
    // Apply filters
    let listings = [];
    
    for (const source of filters.sources) {
      if (data.sources[source]) {
        const sourceListings = data.sources[source]
          .filter(listing => {
            const typeMatch = filters.type.includes(listing.type);
            const priceMatch = listing.price >= filters.minPrice && listing.price <= filters.maxPrice;
            return typeMatch && priceMatch;
          });
        
        listings.push(...sourceListings);
      }
    }
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prospectorResult: {
          listings,
          count: listings.length,
          timestamp: data.timestamp,
          availableSources: Object.keys(data.sources),
          filters: filters
        }
      })
    };
    
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
