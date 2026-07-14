// normalize-area.js
//
// Solves the core problem driving this whole feature: the same
// arrondissement or suburb shows up written many different ways across
// our 9 sources — "Paris 16ème" (Barnes/SeLoger), "Paris 16e" (Junot/
// ParisRental), "Paris 16th" (Book-a-Flat), "PARIS 16EME ARRONDISSEMENT"
// (Perenium), "Paris 16ème (75016)" (DanielFeau) — all the same place,
// four different strings. Filtering by raw address text would miss most
// matches. This maps ANY of those variants to one canonical value.
//
// Works in both Node (require) and the browser (plain <script> tag) via
// the export guard at the bottom — no build step needed for the frontend.

// Canonical suburb/town list — display name plus every spelling variant
// seen live across sources (case differences handled separately via
// lowercasing before comparison, so only genuinely different spellings,
// accents, or abbreviations need listing here).
const SUBURB_ALIASES = [
  { canonical: 'Neuilly-sur-Seine', aliases: ['neuilly-sur-seine', 'neuilly sur seine', 'neuilly'] },
  { canonical: 'Boulogne-Billancourt', aliases: ['boulogne-billancourt', 'boulogne billancourt', 'boulogne'] },
  { canonical: 'Levallois-Perret', aliases: ['levallois-perret', 'levallois perret', 'levallois'] },
  { canonical: 'Rueil-Malmaison', aliases: ['rueil-malmaison', 'rueil malmaison', 'rueil'] },
  { canonical: 'Suresnes', aliases: ['suresnes'] },
  { canonical: 'Puteaux', aliases: ['puteaux'] },
  { canonical: 'Saint-Cloud', aliases: ['saint-cloud', 'saint cloud', 'st-cloud', 'st cloud'] },
  { canonical: 'Saint-Germain-en-Laye', aliases: ['saint-germain-en-laye', 'saint germain en laye', 'st-germain-en-laye', 'st germain en laye'] },
  { canonical: 'Le Vésinet', aliases: ['le vésinet', 'le vesinet'] },
  { canonical: 'Vaucresson', aliases: ['vaucresson'] },
  { canonical: 'Garches', aliases: ['garches'] },
  { canonical: 'Marnes-la-Coquette', aliases: ['marnes-la-coquette', 'marnes la coquette'] },
  { canonical: "Ville-d'Avray", aliases: ["ville-d'avray", 'ville d avray', "ville-d avray"] },
  { canonical: 'Versailles', aliases: ['versailles'] },
  { canonical: 'Courbevoie', aliases: ['courbevoie'] },
  { canonical: 'Issy-les-Moulineaux', aliases: ['issy-les-moulineaux', 'issy les moulineaux', 'issy'] },
  { canonical: 'Colombes', aliases: ['colombes'] },
  { canonical: 'Nanterre', aliases: ['nanterre'] },
  { canonical: 'Chatou', aliases: ['chatou'] },
  { canonical: 'Croissy-sur-Seine', aliases: ['croissy-sur-seine', 'croissy sur seine'] },
  { canonical: 'La Celle-Saint-Cloud', aliases: ['la celle-saint-cloud', 'la celle saint cloud'] },
];

// Strips accents so "Vésinet" and "Vesinet" compare equal — French place
// names get written both ways depending on the source's own conventions.
function stripAccents(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizeArea(rawAddress) {
  if (!rawAddress || typeof rawAddress !== 'string') {
    return { area: 'Unknown', kind: 'unknown' };
  }

  const text = rawAddress.trim();
  const lower = stripAccents(text.toLowerCase());

  // ---- Paris arrondissements ----------------------------------------
  // Covers every ordinal style seen live: "1er", "6e", "7ème", "16eme",
  // "16th", plus the spelled-out "20EME ARRONDISSEMENT" / "16th
  // arrondissement" forms that don't have "Paris" directly attached to
  // the number in the same way.
  const arrPatterns = [
    /paris\s*(\d{1,2})\s*(?:er|ème|eme|e|th|st|nd|rd)\b/i,
    /(\d{1,2})\s*(?:ème|eme|th|st|nd|rd)\s*(?:arrondissement|district)/i,
    /\(?\b750(\d{2})\b\)?/, // postal code fallback, e.g. "(75016)" or "75012" -> arrondissement number; 750XX is unambiguously Paris, no "Paris" word required nearby
  ];

  for (const pattern of arrPatterns) {
    const m = text.match(pattern);
    if (m) {
      let n = parseInt(m[1], 10);
      if (n >= 1 && n <= 20) {
        const label = n === 1 ? 'Paris 1er' : `Paris ${n}e`;
        return { area: label, kind: 'paris', arrondissement: n };
      }
    }
  }

  // ---- Known suburb towns --------------------------------------------
  for (const entry of SUBURB_ALIASES) {
    for (const alias of entry.aliases) {
      if (lower.includes(stripAccents(alias))) {
        return { area: entry.canonical, kind: 'suburb' };
      }
    }
  }

  // ---- Fallback: genuinely unrecognized ------------------------------
  // Keeps the raw text as its own bucket rather than hiding it — an
  // imperfect address is still better shown than silently dropped.
  return { area: text || 'Unknown', kind: 'other' };
}

// UMD-lite export: works via require() in Node (the data-generation
// pipeline) and as a plain global in the browser (the frontend), with no
// build step or bundler needed for either.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { normalizeArea, SUBURB_ALIASES };
} else if (typeof window !== 'undefined') {
  window.normalizeArea = normalizeArea;
  window.SUBURB_ALIASES = SUBURB_ALIASES;
}
