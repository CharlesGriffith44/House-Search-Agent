const puppeteer = require('puppeteer');
const fs = require('fs');

async function debug() {
  let browser;
  try {
    browser = await puppeteer.launch({ headless: true });
    
    const page = await browser.newPage();
    await page.goto('https://www.barnes-international.com/locations/paris', { waitUntil: 'networkidle0', timeout: 30000 });
    
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      buttons.forEach(btn => {
        if (btn.innerText.toLowerCase().includes('autoriser')) {
          btn.click();
        }
      });
    });
    
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const text = await page.evaluate(() => document.body.innerText);
    
    // Find lines with prices
    const lines = text.split('\n').filter(line => line.includes('€'));
    console.log('Lines with prices:');
    lines.slice(0, 10).forEach(line => console.log(line));
    
    fs.writeFileSync('price-lines.txt', lines.join('\n'));
    console.log('\nSaved first 10 price lines to price-lines.txt');
    
    await browser.close();
  } catch (e) {
    console.log('Error:', e.message);
  }
}

debug();
