// Fixed interface texts of a venue page, German and English.
export const T = {
  de: {
    call: 'Anrufen', route: 'Route', chat: 'Chat öffnen',
    hoursTitle: 'Öffnungszeiten', addressTitle: 'Adresse', mapLink: 'In Google Maps öffnen',
    closedDay: 'geschlossen', asOf: 'Stand', pricesNote: 'Preise können sich geändert haben.',
    ratingOf: 'von 5', reviewsOn: 'Bewertungen auf',
    walkIn: 'Ohne Termin', byAppointment: 'Mit Termin',
    cash: 'Barzahlung', card: 'Kartenzahlung', transit: 'Öffis', languages: 'Sprachen',
    statusFallback: 'Öffnungszeiten weiter unten',
    openNow: 'Jetzt geöffnet', until: 'bis', closed: 'Geschlossen', opens: 'öffnet', opensAt: 'öffnet um',
    statusWalkIn: 'ohne Termin',
    ownerHead: 'Das ist Ihre Seite',
    by: 'Website von namax.at', unconfirmed: 'Angaben nicht vom Inhaber bestätigt',
    imprint: 'Impressum', privacy: 'Datenschutz', osmData: 'Daten teilweise von',
    daysShort: ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'],
    daysLong: ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'],
    desc: 'Adresse, Öffnungszeiten und Kontakt.',
  },
  en: {
    call: 'Call', route: 'Directions', chat: 'Open chat',
    hoursTitle: 'Opening hours', addressTitle: 'Address', mapLink: 'Open in Google Maps',
    closedDay: 'closed', asOf: 'As of', pricesNote: 'Prices may have changed.',
    ratingOf: 'out of 5', reviewsOn: 'reviews on',
    walkIn: 'Walk-in, no appointment', byAppointment: 'By appointment',
    cash: 'Cash', card: 'Card', transit: 'Public transport', languages: 'Languages',
    statusFallback: 'Opening hours below',
    openNow: 'Open now', until: 'until', closed: 'Closed', opens: 'opens', opensAt: 'opens at',
    statusWalkIn: 'walk-in',
    ownerHead: 'This is your page',
    by: 'Website by namax.at', unconfirmed: 'Details not confirmed by the owner',
    imprint: 'Imprint', privacy: 'Privacy', osmData: 'Some data from',
    daysShort: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    daysLong: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    desc: 'Address, opening hours and contact.',
  },
};

// The same line in every language: it tells the owner they may write in their own.
export const OWNER_LINE = 'Schreiben Sie in Ihrer Sprache — Deutsch, Türkçe, العربية, فارسی, English …';

const LIST_TITLES = {
  food: { de: 'Speisekarte', en: 'Menu' },
  prices: { de: 'Preise', en: 'Prices' },
  repair: { de: 'Reparatur & Preise', en: 'Repairs & prices' },
};
const LIST_GROUP = { imbiss: 'food', restaurant: 'food', cafe: 'food', handy: 'repair' };

export function listTitle(kind, lang) {
  return LIST_TITLES[LIST_GROUP[kind] || 'prices'][lang];
}

const KIND_LABELS = {
  imbiss: { de: 'Imbiss', en: 'Snack bar' }, restaurant: { de: 'Restaurant', en: 'Restaurant' },
  cafe: { de: 'Café', en: 'Café' }, friseur: { de: 'Friseur', en: 'Hairdresser' },
  nails: { de: 'Nagelstudio', en: 'Nail studio' }, kosmetik: { de: 'Kosmetikstudio', en: 'Beauty salon' },
  handy: { de: 'Handyshop', en: 'Phone shop' },
  schneider: { de: 'Schneiderei', en: 'Tailor' },
};
export function kindLabel(kind, lang) {
  return KIND_LABELS[kind] ? KIND_LABELS[kind][lang] : '';
}

const LANGUAGE_NAMES = {
  de: ['Deutsch', 'German'], en: ['Englisch', 'English'], tr: ['Türkisch', 'Turkish'],
  ar: ['Arabisch', 'Arabic'], fa: ['Persisch', 'Persian'], ku: ['Kurdisch', 'Kurdish'],
  sr: ['Serbisch', 'Serbian'], hr: ['Kroatisch', 'Croatian'], bs: ['Bosnisch', 'Bosnian'],
  ru: ['Russisch', 'Russian'], uk: ['Ukrainisch', 'Ukrainian'], pl: ['Polnisch', 'Polish'], ro: ['Rumänisch', 'Romanian'],
  hu: ['Ungarisch', 'Hungarian'], it: ['Italienisch', 'Italian'], fr: ['Französisch', 'French'],
  es: ['Spanisch', 'Spanish'], zh: ['Chinesisch', 'Chinese'], vi: ['Vietnamesisch', 'Vietnamese'],
};
export function languageName(code, lang) {
  const n = LANGUAGE_NAMES[code];
  return n ? n[lang === 'de' ? 0 : 1] : code.toUpperCase();
}
