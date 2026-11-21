// Looks a venue page can take. Every page is a Viennese enamel street-sign plate: signBg is the enamel,
// signInk the rim and letters. The palette follows the kind of venue (later: the colors of its own sign).
export const PALETTES = {
  'black-gold':  { signBg: '#1b1917', signInk: '#dcb85e', pageBg: '#efece6', ink: '#1a1714', accent: '#1b1917', accentInk: '#e6c470', boardBg: '#1b1917', boardInk: '#f3ead7' },
  'black-white': { signBg: '#1c1d20', signInk: '#ffffff', pageBg: '#eceef0', ink: '#141518', accent: '#1c1d20', accentInk: '#ffffff', boardBg: '#ffffff', boardInk: '#141518' },
  'white-black': { signBg: '#fbfbf8', signInk: '#17191c', pageBg: '#e8eaed', ink: '#17191c', accent: '#17191c', accentInk: '#ffffff', boardBg: '#ffffff', boardInk: '#17191c' },
  'red-yellow':  { signBg: '#b5221c', signInk: '#ffffff', pageBg: '#f3eee6', ink: '#1d1613', accent: '#b5221c', accentInk: '#ffffff', boardBg: '#1d1613', boardInk: '#fff3d1' },
  'cream-green': { signBg: '#1f4a37', signInk: '#f1e9d6', pageBg: '#edefe9', ink: '#16231c', accent: '#1f4a37', accentInk: '#f1e9d6', boardBg: '#fffdf8', boardInk: '#16231c' },
  'blue-white':  { signBg: '#1f3d74', signInk: '#ffffff', pageBg: '#e9edf2', ink: '#152238', accent: '#1f3d74', accentInk: '#ffffff', boardBg: '#ffffff', boardInk: '#152238' },
};

const FONT_BASE = '/v/_shared/fonts';
const LATIN = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+2000-206F,U+20AC,U+2122';
const LATIN_EXT = 'U+0100-02AF,U+1E00-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0';
const face = (family, file, weight) => ['latin', 'latin-ext'].map((sub) =>
  `@font-face{font-family:${family};src:url(${FONT_BASE}/${file}-${sub}-${weight}.woff2) format('woff2');font-weight:${weight};unicode-range:${sub === 'latin' ? LATIN : LATIN_EXT};font-display:swap}`).join('');

/** The namax brand pair, the same on every venue page: a condensed sign face and a clear text face. */
export const BRAND = {
  display: "NamaxDisplay,'Arial Narrow',sans-serif",
  text: "NamaxText,system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif",
  faces: face('NamaxDisplay', 'barlow-condensed', 700) + face('NamaxText', 'figtree', 400) + face('NamaxText', 'figtree', 700),
};

// Kept so stored venues stay valid; since the enamel look every page uses BRAND.display for the sign.
export const LETTERINGS = { block: {}, narrow: {}, serif: {} };

export const DEFAULT_THEME = { palette: 'white-black', lettering: 'block' };
