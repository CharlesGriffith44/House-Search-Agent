function comprehensiveExtract() {
  const results = [];
  const seen = new Set();
  
  try {
    const listings = document.querySelectorAll('article, .listing, .property, [data-property], .annonce');
    
    for (const listing of listings) {
      const text = listing.innerText || '';
      const html = listing.innerHTML || '';
      const combined = text + ' ' + html;
      
      if (seen.has(combined.substring(0, 100))) continue;
      seen.add(combined.substring(0, 100));
      
      const priceMatch = combined.match(/€\s*(\d+[\s,\.]*\d*)/);
      const price = priceMatch ? parseInt(priceMatch[1].replace(/[\s,\.]/g, '')) : 0;
      
      const roomMatch = combined.match(/(\d+)\s*(?:pièce|pi|chambre|room|bed|br)/i);
      const rooms = roomMatch ? parseInt(roomMatch[1]) : 0;
      
      const bedroomMatch = combined.match(/(\d+)\s*(?:chambre|bedroom|bed|br)(?!\s*d)/i);
      const bedrooms = bedroomMatch ? parseInt(bedroomMatch[1]) : 0;
      
      const sqmMatch = combined.match(/(\d+)\s*(?:m²|m2|sqm)/i);
      const sqm = sqmMatch ? parseInt(sqmMatch[1]) : 0;
      
      const addressMatch = combined.match(/(?:Paris|Boulogne|Neuilly|Levallois)/i);
      const address = addressMatch ? addressMatch[0] : 'Île-de-France';
      
      const hasElevator = /ascenseur|elevator/i.test(combined);
      const hasBalcony = /balcon|balcony|terrasse/i.test(combined);
      const hasKitchen = /cuisine|kitchen|equipée/i.test(combined);
      const isFurnished = /meublé|furnished/i.test(combined);
      
      if (price > 0 || sqm > 0 || rooms > 0) {
        results.push({ price, rooms, bedrooms, bathrooms: 0, sqm, address, elevator: hasElevator, balcony: hasBalcony, kitchen: hasKitchen, furnished: isFurnished, rawText: text.slice(0, 500) });
      }
    }
  } catch (e) {}
  
  return results;
}

function formatListing(raw, source) {
  return {
    source,
    price: raw.price || 0,
    rooms: raw.rooms || 0,
    bedrooms: raw.bedrooms || 0,
    bathrooms: raw.bathrooms || 0,
    sqm: raw.sqm || 0,
    address: raw.address || 'Île-de-France',
    features: { elevator: raw.elevator, balcony: raw.balcony, kitchen: raw.kitchen, furnished: raw.furnished }
  };
}

const SCRAPER_CONFIG = {
  'book-a-flat': { url: 'https://www.book-a-flat.com/paris/apartments-for-rent', waitForSelector: 'article', extract: comprehensiveExtract },
  'perenium': { url: 'https://www.perenium.com/en/apartments-for-rent/paris', waitForSelector: 'article', extract: comprehensiveExtract },
  'parisrental': { url: 'https://www.parisrental.com/apartments-for-rent/paris', waitForSelector: 'article', extract: comprehensiveExtract },
  'paris-corporate-housing': { url: 'https://www.pariscorporatehousing.com/apartments/location-paris', waitForSelector: 'article', extract: comprehensiveExtract },
  'scandic': { url: 'https://www.scandic-immobilier.fr/locations/paris', waitForSelector: 'article', extract: comprehensiveExtract },
  'barnes-international': { url: 'https://www.barnes-international.com/locations/paris', waitForSelector: 'article', extract: comprehensiveExtract },
  'danielfeau': { url: 'https://www.danielfeau.com/locations/paris', waitForSelector: 'article', extract: comprehensiveExtract },
  'eiffel-housing': { url: 'https://www.eiffel-housing.com/apartments-for-rent/paris', waitForSelector: 'article', extract: comprehensiveExtract },
  'junot': { url: 'https://www.junot-paris.com/locations/paris', waitForSelector: 'article', extract: comprehensiveExtract },
  'seloger': { url: 'https://www.seloger.com/locations/paris', waitForSelector: 'article', extract: comprehensiveExtract },
  'orpi': { url: 'https://www.orpi.com/annonces/location-paris', waitForSelector: 'article', extract: comprehensiveExtract },
  'john-taylor': { url: 'https://www.john-taylor.com/locations/paris', waitForSelector: 'article', extract: comprehensiveExtract },
  'palaisroyalimmobilier': { url: 'https://www.palais-royal-immobilier.com/locations/paris', waitForSelector: 'article', extract: comprehensiveExtract },
  'emilegarcin': { url: 'https://www.emile-garcin.com/locations/paris', waitForSelector: 'article', extract: comprehensiveExtract },
  'quodetassocies': { url: 'https://www.quodet-associes.com/locations/paris', waitForSelector: 'article', extract: comprehensiveExtract },
  'breteuilhomes': { url: 'https://www.breteuilhomes.com/locations/paris', waitForSelector: 'article', extract: comprehensiveExtract },
  'capitale-partners': { url: 'https://www.capitale-partners.com/locations/paris', waitForSelector: 'article', extract: comprehensiveExtract },
  'cosyhome': { url: 'https://www.cosyhome.com/apartments/paris', waitForSelector: 'article', extract: comprehensiveExtract },
  'engelvoelkers': { url: 'https://www.engelvoelkers.com/en/paris/apartments-for-rent', waitForSelector: 'article', extract: comprehensiveExtract },
  'helix-immobilier': { url: 'https://www.helix-immobilier.fr/locations/paris', waitForSelector: 'article', extract: comprehensiveExtract },
  'tiemo': { url: 'https://www.tiemo.fr/locations/paris', waitForSelector: 'article', extract: comprehensiveExtract },
  'bellesdemeures': { url: 'https://www.bellesdemeures.fr/locations/paris', waitForSelector: 'article', extract: comprehensiveExtract },
  'ena-parte-paris': { url: 'https://www.ena-parte-paris.com/locations/paris', waitForSelector: 'article', extract: comprehensiveExtract },
  'nicolas-devillard': { url: 'https://www.nicolas-devillard.com/locations/paris', waitForSelector: 'article', extract: comprehensiveExtract },
  'patrimoine-immo': { url: 'https://www.patrimoine-immo.com/locations/paris', waitForSelector: 'article', extract: comprehensiveExtract },
  'moncim': { url: 'https://www.moncim.com/locations/paris', waitForSelector: 'article', extract: comprehensiveExtract },
  'dynagest-immobilier': { url: 'https://www.dynagest-immobilier.com/locations/paris', waitForSelector: 'article', extract: comprehensiveExtract },
  'fred-elion': { url: 'https://www.fred-elion.com/locations/paris', waitForSelector: 'article', extract: comprehensiveExtract },
  'la-foret': { url: 'https://www.la-foret.com/locations/paris', waitForSelector: 'article', extract: comprehensiveExtract },
  'vielmon': { url: 'https://www.vielmon.fr/annonces/transaction/Location.html', waitForSelector: 'a', extract: comprehensiveExtract },
  'cabinet-montoro': { url: 'https://www.cabinet-montoro.fr/annonces/transaction/Location.html', waitForSelector: 'a', extract: comprehensiveExtract },
  'afr-immobilier': { url: 'https://www.afr-immobilier.com/annonces/transaction/Location.html', waitForSelector: 'a', extract: comprehensiveExtract },
  'patrimoine-ouest-parisien': { url: 'https://www.patrimoineouestparisien.fr/annonces/transaction/Location.html', waitForSelector: 'a', extract: comprehensiveExtract },
  'paris-seine-immobilier': { url: 'https://www.paris-seine-immobilier.com/annonces/transaction/Location.html', waitForSelector: 'a', extract: comprehensiveExtract },
  'century-21': { url: 'https://century21.fr/locations/paris', waitForSelector: 'article', extract: comprehensiveExtract }
};

module.exports = { SCRAPER_CONFIG, formatListing };
