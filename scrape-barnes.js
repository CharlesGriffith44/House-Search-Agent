const puppeteer = require('puppeteer');
const fs = require('fs');

async function scrapeBarnesWithPagination() {
  let browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  
  console.log('Loading page...');
  await page.goto('https://www.barnes-international.com/fr/location.html', { waitUntil: 'networkidle0', timeout: 30000 });
  
  console.log('Accepting cookies...');
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('button')).forEach(btn => {
      if (btn.innerText.toLowerCase().includes('autoriser')) btn.click();
    });
  });
  
  await new Promise(r => setTimeout(r, 5000));
  
  let allListings = [];
  let pageCount = 0;
  
  while (pageCount < 5) {
    console.log(`Extracting page ${pageCount + 1}...`);
    
    const listings = await page.evaluate(() => {
      const text = document.body.innerText;
      const results = [];
      const matches = text.matchAll(/(\d+[\s\.]*\d*)\s*€\s*\/\s*mois/g);
      for (const match of matches) {
        const price = parseInt(match[1].replace(/[\s\.]/g, ''));
        if (price > 500 && price < 50000) {
          results.push({ price });
        }
      }
      return results;
    });
    
    console.log(`Found ${listings.length} listings on page ${pageCount + 1}`);
    allListings.push(...listings.filter(l => !allListings.find(a => a.price === l.price)));
    
    const clicked = await page.evaluate(() => {
      const btn = document.getElementById('button_annonces_suivantes');
      if (btn && !btn.disabled) {
        btn.click();
        return true;
      }
      return false;
    });
    
    if (!clicked) break;
    
    await new Promise(r => setTimeout(r, 3000));
    pageCount++;
  }
  
  await browser.close();
  return allListings;
}

(async () => {
  const listings = await scrapeBarnesWithPagination();
  console.log(`Total unique listings: ${listings.length}`);
  
  const output = {
    timestamp: new Date().toISOString(),
    sources: {
      'barnes-international': listings.map(l => ({
        source: 'barnes-international',
        type: 'rental',
        price: l.price,
        address: 'Paris'
      }))
    }
  };
  
  if (!fs.existsSync('data')) fs.mkdirSync('data');
  fs.writeFileSync('data/listings.json', JSON.stringify(output, null, 2));
  console.log('Saved to data/listings.json');
})();
