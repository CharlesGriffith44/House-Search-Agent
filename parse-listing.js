// netlify/functions/parse-listing.js
//
// FIXED vs original price regex bug (unchanged from earlier fix):
//   Real listing text is "12 000 000 €" / "€ 17,000 / month" — digits
//   before OR after the symbol depending on rent vs buy phrasing on this
//   site. Both are handled below.
//
// NEW this pass: "Price upon request" / "Prix sur demande" listings.
//   These are legitimate ultra-high-end properties with no public price —
//   NOT a parsing failure. They must be distinguished from a genuine
//   parse miss (price: 0 because the regex didn't match) so a future
//   debugging pass doesn't waste time "fixing" something that isn't broken.

const PRICE_ON_REQUEST_PATTERNS = [
  /price\s+upon\s+request/i,
  /prix\s+sur\s+demande/i,
];

function parseListing(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return emptyListing();
  }

  const text = rawText.trim();

  const isPriceOnRequest = PRICE_ON_REQUEST_PATTERNS.some(p => p.test(text));

  // ---- PRICE -----------------------------------------------------------
  let price = 0;

  if (!isPriceOnRequest) {
    const rentAfter = text.match(/(\d[\d\s.,]*\d|\d)\s*€\s*\/\s*(mois|month)/i);
    const rentBefore = text.match(/€\s*(\d[\d\s.,]*\d|\d)\s*\/\s*(mois|month)/i);
    const saleAfter = text.match(/(\d[\d\s.,]*\d|\d)\s*€(?!\s*\d)/);
    const saleBefore = text.match(/€\s*(\d[\d\s.,]*\d|\d)(?!\s*(?:AED|\$|USD|CHF|£|₪|¥))/i);

    const toInt = (s) => parseInt(s.replace(/[\s.,]/g, ''), 10);

    if (rentAfter) price = toInt(rentAfter[1]);
    else if (rentBefore) price = toInt(rentBefore[1]);
    else if (saleAfter) price = toInt(saleAfter[1]);
    else if (saleBefore) price = toInt(saleBefore[1]);

    if (!Number.isFinite(price) || price <= 0 || price > 100000000) price = 0;
  }

  // ---- ROOMS / BEDROOMS ----------------------------------------------------
  const bedroomsMatch = text.match(/(\d+)\s*(?:bedrooms?|chambres?)\b/i);
  const bedrooms = bedroomsMatch ? parseInt(bedroomsMatch[1], 10) : null;

  const roomsMatch = text.match(/\bT(\d+)\b|\b(\d+)\s*(?:pi[eè]ces?|rooms?)\b/i);
  const rooms = roomsMatch ? parseInt(roomsMatch[1] || roomsMatch[2], 10) : bedrooms;

  const bathroomsMatch = text.match(/(\d+)\s*(?:bathrooms?|salles?\s+de\s+bains?)\b/i);
  const bathrooms = bathroomsMatch ? parseInt(bathroomsMatch[1], 10) : null;

  // ---- SURFACE -------------------------------------------------------------
  const sqmMatch = text.match(/(\d[\d\s]*(?:[.,]\d+)?)\s*m(?:²|2)\b(?!\w)/i) ||
                    text.match(/(\d[\d\s]*(?:[.,]\d+)?)\s*m(?:²|2)/i);
  const sqm = sqmMatch ? parseFloat(sqmMatch[1].replace(/\s/g, '').replace(',', '.')) : null;

  // ---- ADDRESS / ARRONDISSEMENT --------------------------------------------
  let address = '';
  const parisMatch = text.match(/Paris\s*\d{1,2}(?:er|ème|eme|th|st|nd|rd)\b/i);
  if (parisMatch) {
    address = parisMatch[0];
  } else {
    const addressPatterns = [
      /(\d+\s+(?:rue|avenue|boulevard|place|square|allée|chemin|quai)[^,\n|]*)/i,
      /(\b7\d{4}\b[^,\n|]*)/
    ];
    for (const pattern of addressPatterns) {
      const match = text.match(pattern);
      if (match) { address = match[1].trim(); break; }
    }
  }
  if (!address) {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 5);
    address = lines[0] || '';
  }

  // ---- DERIVED FIELDS -----------------------------------------------------
  const pricePerSqm = (price > 0 && sqm > 0) ? Math.round(price / sqm) : null;
  const sqft = (sqm > 0) ? Math.round(sqm * 10.764) : null;

  let matchScore = 0;
  if (price > 0 || isPriceOnRequest) matchScore += 25;
  if (rooms !== null) matchScore += 25;
  if (sqm !== null) matchScore += 25;
  if (address && address.length > 3) matchScore += 25;

  return {
    price,
    priceOnRequest: isPriceOnRequest,
    pricePerSqm,
    rooms,
    bedrooms,
    bathrooms,
    sqm,
    sqft,
    address: address.substring(0, 200),
    matchScore,
    isExactListing: matchScore >= 75
  };
}

function emptyListing() {
  return {
    price: 0,
    priceOnRequest: false,
    pricePerSqm: null,
    rooms: null,
    bedrooms: null,
    bathrooms: null,
    sqm: null,
    sqft: null,
    address: '',
    matchScore: 0,
    isExactListing: false
  };
}

// Extracts elevator/balcony/furnished from an individual listing DETAIL
// page's full body text (not the summary card — this data only exists on
// the detail page). Deliberately text-based rather than selector-based:
// we can't inspect Barnes' actual CSS classes/DOM structure from outside,
// so matching on words in the rendered text is more robust to markup
// changes than guessing at selectors we can't verify.
function extractDetailFeatures(pageText) {
  const text = (pageText || '');

  const elevator = /\b(lift|elevator|ascenseur)\b/i.test(text);
  const balcony = /\b(balcony|balcon)\b/i.test(text);

  // Order matters: "unfurnished" contains "furnished" as a substring.
  let furnished = null;
  if (/\bunfurnished\b/i.test(text) || /\bnon[\s-]?meubl[ée]/i.test(text)) {
    furnished = false;
  } else if (/\bfurnished\b/i.test(text) || /\bmeubl[ée]\b/i.test(text)) {
    furnished = true;
  }

  return { elevator, balcony, furnished };
}

module.exports = parseListing;
module.exports.extractDetailFeatures = extractDetailFeatures;
