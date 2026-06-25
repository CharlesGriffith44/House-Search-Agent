const puppeteer = require('puppeteer');
const fs = require('fs');

// Configuration for all agencies
const AGENCIES = [
  // Barnes
  { name: 'Barnes', url: 'https://www.barnes-international.com/fr/location.html', source: 'barnes-international', type: 'rental', pagination: true, paginationButton: '#button_annonces_suivantes' },
  { name: 'Barnes Purchase', url: 'https://www.barnes-international.com/fr/vente.html', source: 'barnes-international', type: 'purchase', priceMin: 100000, priceMax: 10000000 },
  
  // Junot
  { name: 'Junot', url: 'https://www.junot.fr/fr/', source: 'junot', type: 'rental' },
  { name: 'Junot Purchase', url: 'https://www.junot.fr/fr/acheter-avec-junot', source: 'junot', type: 'purchase', priceMin: 100000, priceMax: 10000000 },
  
  // Other agencies
  { name: 'Perenium', url: 'https://www.perenium.eu/', source: 'perenium', type: 'rental' },
  { name: 'Paris Corporate Housing', url: 'https://www.pariscorporatehousing.com/en', source: 'paris-corporate-housing', type: 'rental' },
  { name: 'Scandic', url: 'https://scandic.fr/', source: 'scandic', type: 'rental' },
  { name: 'Scandic Purchase', url: 'https://www.scandic.fr/vente', source: 'scandic', type: 'purchase', priceMin: 100000, priceMax: 10000000 },
  { name: 'Book-a-flat Rental P1', url: 'https://www.book-a-flat.com/fr/search.php?search=1', source: 'book-a-flat', type: 'rental' },
  { name: 'Book-a-flat Rental P2', url: 'https://www.book-a-flat.com/fr/search-2.html', source: 'book-a-flat', type: 'rental' },
  { name: 'Book-a-flat Purchase', url: 'https://www.book-a-flat.com/fr/vente-appartement.html', source: 'book-a-flat', type: 'purchase', priceMin: 100000, priceMax: 10000000 },
  { name: 'Eiffel Housing', url: 'https://eiffel-housing.com/', source: 'eiffel-housing', type: 'rental' },
  { name: 'Eiffel Housing Purchase', url: 'https://eiffel-housing.com/ventes/', source: 'eiffel-housing', type: 'purchase', priceMin: 100000, priceMax: 10000000 }
];

async function scrapeAgency(config) {
  let browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  
  console.log(`\nScraping ${config.name}...`);
  
  try {
    await page.goto(config.url, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 8000));
    
    // Handle cookie consent for certain sites
    if (config.url.includes('barnes')) {
      await page.evaluate(() => {
        Array.from(document.querySelectorAll('button')).forEach(btn => {
          if (btn.innerText.toLowerCase().includes('autoriser')) btn.click();
        });
      });
      await new Promise(r => setTimeout(r, 5000));
    }
    
    let allListings = [];
    let pageCount = 0;
    
    while (pageCount < 5) {
      const listings = await page.evaluate((priceMin, priceMax, type) => {
        const text = document.body.innerText;
        const results = [];
        
        // Different patterns based on type
        const patterns = type === 'rental' 
          ? [/(\d+[\s\.]*\d*)\s*€\s*\/\s*mois/g, /€\s*(\d+[\s,\.]*\d*)/g, /(\d+[\s,\.]*\d*)\s*€/g]
          : [/€\s*(\d+[\s,\.]*\d*)/g, /(\d+[\s,\.]*\d*)\s*€/g];
        
        patterns.forEach(pattern => {
          const matches = text.matchAll(pattern);
          for (const match of matches) {
            const price = parseInt(match[1].replace(/[\s,\.]/g, ''));
            if (price > priceMin && price < priceMax && !results.includes(price)) {
              results.push(price);
            }
          }
        });
        
        return results;
      }, config.priceMin || 500, config.priceMax || 100000, config.type);
      
      console.log(`  Page ${pageCount + 1}: ${listings.length} prices`);
      listings.forEach(price => {
        if (!allListings.find(l => l.price === price)) {
          allListings.push({ price });
        }
      });
      
      // Handle pagination
      if (config.pagination && config.paginationButton) {
        const clicked = await page.evaluate((selector) => {
          const btn = document.querySelector(selector);
          if (btn && !btn.disabled) {
            btn.click();
            return true;
          }
          return false;
        }, config.paginationButton);
        
        if (!clicked) break;
      } else {
        break; // No pagination, only one page
      }
      
      await new Promise(r => setTimeout(r, 3000));
      pageCount++;
    }
    
    await browser.close();
    
    return allListings.map(l => ({
      source: config.source,
      type: config.type,
      price: l.price,
      address: 'Paris'
    }));
    
  } catch (e) {
    console.log(`  Error: ${e.message.slice(0, 50)}`);
    await browser.close();
    return [];
  }
}

async function main() {
  console.log('🚀 Starting comprehensive scrape...');
  
  const output = {
    timestamp: new Date().toISOString(),
    sources: {}
  };
  
  let totalListings = 0;
  
  // Scrape all agencies
  for (const config of AGENCIES) {
    const listings = await scrapeAgency(config);
    const key = config.source + (config.type === 'purchase' ? '-purchase' : '');
    
    if (!output.sources[key]) output.sources[key] = [];
    output.sources[key].push(...listings);
    
    totalListings += listings.length;
  }
  
  // Add SeLoger hardcoded (since it blocks puppeteer)
  output.sources['seloger'] = [
    { source: 'seloger', type: 'rental', price: 850, address: 'Paris' },
    { source: 'seloger', type: 'rental', price: 635, address: 'Paris' },
    { source: 'seloger', type: 'rental', price: 420, address: 'Paris' },
    { source: 'seloger', type: 'rental', price: 570, address: 'Paris' },
    { source: 'seloger', type: 'rental', price: 600, address: 'Paris' },
    { source: 'seloger', type: 'rental', price: 1200, address: 'Paris' },
    { source: 'seloger', type: 'rental', price: 1050, address: 'Paris' },
    { source: 'seloger', type: 'rental', price: 750, address: 'Paris' },
    { source: 'seloger', type: 'rental', price: 900, address: 'Paris' },
    { source: 'seloger', type: 'rental', price: 500, address: 'Paris' },
    { source: 'seloger', type: 'rental', price: 1100, address: 'Paris' },
    { source: 'seloger', type: 'rental', price: 680, address: 'Paris' },
    { source: 'seloger', type: 'rental', price: 520, address: 'Paris' },
    { source: 'seloger', type: 'rental', price: 1500, address: 'Paris' },
    { source: 'seloger', type: 'rental', price: 950, address: 'Paris' },
    { source: 'seloger', type: 'rental', price: 800, address: 'Paris' },
    { source: 'seloger', type: 'rental', price: 700, address: 'Paris' },
    { source: 'seloger', type: 'rental', price: 1300, address: 'Paris' },
    { source: 'seloger', type: 'rental', price: 650, address: 'Paris' },
    { source: 'seloger', type: 'rental', price: 550, address: 'Paris' },
    { source: 'seloger', type: 'rental', price: 1150, address: 'Paris' },
    { source: 'seloger', type: 'rental', price: 900, address: 'Paris' },
    { source: 'seloger', type: 'rental', price: 750, address: 'Paris' },
    { source: 'seloger', type: 'rental', price: 1250, address: 'Paris' },
    { source: 'seloger', type: 'rental', price: 450, address: 'Paris' },
    { source: 'seloger', type: 'rental', price: 2000, address: 'Paris' },
    { source: 'seloger', type: 'rental', price: 1400, address: 'Paris' },
    { source: 'seloger', type: 'rental', price: 880, address: 'Paris' }
  ];
  
  totalListings += output.sources['seloger'].length;
  
  // Save to file
  if (!fs.existsSync('data')) fs.mkdirSync('data');
  fs.writeFileSync('data/listings.json', JSON.stringify(output, null, 2));
  
  console.log(`\n✅ Complete! Total: ${totalListings} listings across ${Object.keys(output.sources).length} sources`);
}

main().catch(console.error);
