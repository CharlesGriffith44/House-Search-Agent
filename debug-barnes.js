const puppeteer = require('puppeteer');
const fs = require('fs');

async function debug() {
  let browser;
  try {
    browser = await puppeteer.launch({ headless: false });
    
    const page = await browser.newPage();
    await page.goto('https://www.barnes-international.com/locations/paris', { waitUntil: 'networkidle2', timeout: 30000 });
    
    console.log('Waiting 5 seconds for JS to load...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Get the full HTML
    const html = await page.content();
    
    // Check for articles
    const articleCount = (html.match(/<article/g) || []).length;
    console.log('Articles in HTML:', articleCount);
    
    // Check for prices
    const priceMatches = html.match(/€\s*\d+/g) || [];
    console.log('Prices found:', priceMatches.slice(0, 5));
    
    // Save a snapshot
    fs.writeFileSync('page-snapshot.html', html);
    console.log('Saved page-snapshot.html');
    
    await browser.close();
  } catch (e) {
    console.log('Error:', e.message);
  }
}

debug();
