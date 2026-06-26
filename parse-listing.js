// netlify/functions/parse-listing.js
// Converts raw HTML text to structured listing objects

function parseListing(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return {
      price: 0,
      rooms: null,
      sqm: null,
      address: '',
      meuble: false,
      ref: '',
      matchScore: 0,
      isExactListing: false
    };
  }

  const text = rawText.trim();

  // Extract price (€/month or total €)
  const priceMatch = text.match(/(\d[\d\s]*)\s*€\s*\/\s*mois/i);
  let price = 0;
  if (priceMatch) {
    price = parseInt(priceMatch[1].replace(/\s/g, ''));
  } else {
    // Try to find any € amount
    const eurMatch = text.match(/€\s*(\d[\d\s,\.]*)/);
    if (eurMatch) {
      price = parseInt(eurMatch[1].replace(/[\s,\.]/g, ''));
    }
  }

  // Extract rooms (T1, T2, Pièce, etc.)
  const roomsMatch = text.match(/([tT])(\d+)|(\d+)\s*[pP]i[eè]ce/i);
  let rooms = null;
  if (roomsMatch) {
    rooms = parseInt(roomsMatch[2] || roomsMatch[3]);
  }

  // Extract square meters
  const sqmMatch = text.match(/(\d+(?:[.,]\d+)?)\s*[mM][²2]/);
  let sqm = null;
  if (sqmMatch) {
    sqm = parseFloat(sqmMatch[1].replace(',', '.'));
  }

  // Extract reference number
  const refMatch = text.match(/[rR]ef[a-z]*\s*:?\s*([a-zA-Z0-9\-]+)/i);
  let ref = refMatch ? refMatch[1] : '';

  // Check if furnished
  const meuble = /meubl[e\s]/i.test(text) && !/non[\s-]*meubl/i.test(text);

  // Extract address (rough approximation)
  let address = '';
  const addressPatterns = [
    /(\d+\s+(?:rue|avenue|boulevard|place|square|allée|chemin)[^,\n]*)/i,
    /([0-9]{5}[^,\n]*)/
  ];
  for (const pattern of addressPatterns) {
    const match = text.match(pattern);
    if (match) {
      address = match[1].trim();
      break;
    }
  }

  // If no structured address found, try to get first line
  if (!address) {
    const lines = text.split('\n').filter(l => l.trim().length > 5);
    address = lines[0] || '';
  }

  // Calculate price per sqm
  let pricePerSqm = null;
  if (price > 0 && sqm > 0) {
    pricePerSqm = Math.round(price / sqm);
  }

  // Calculate sqft from sqm
  let sqft = null;
  if (sqm > 0) {
    sqft = Math.round(sqm * 10.764);
  }

  // Determine match score based on how much data we have
  let matchScore = 0;
  if (price > 0) matchScore += 25;
  if (rooms !== null) matchScore += 25;
  if (sqm !== null) matchScore += 25;
  if (address && address.length > 5) matchScore += 25;

  return {
    price,
    pricePerSqm,
    rooms,
    bedrooms: null,
    bathrooms: null,
    sqm,
    sqft,
    address: address.substring(0, 200), // Limit address length
    meuble,
    ref,
    floor: null,
    totalFloors: null,
    elevator: null,
    balcony: null,
    haussman: null,
    equippedKitchen: null,
    matchScore,
    isExactListing: matchScore >= 75
  };
}

module.exports = parseListing;
