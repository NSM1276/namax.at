// Looks a venue page can take. The palette follows the venue's own shop sign,
// the lettering follows the kind of letters on it.
export const PALETTES = {
  'black-gold':  { signBg: '#151311', signInk: '#e9c46a', pageBg: '#f6f1e8', ink: '#1a1714', accent: '#151311', accentInk: '#e9c46a', boardBg: '#151311', boardInk: '#f3ead7' },
  'black-white': { signBg: '#151311', signInk: '#ffffff', pageBg: '#f1f0ec', ink: '#111111', accent: '#151311', accentInk: '#ffffff', boardBg: '#ffffff', boardInk: '#111111' },
  'white-black': { signBg: '#ffffff', signInk: '#111111', pageBg: '#f1f0ec', ink: '#111111', accent: '#111111', accentInk: '#ffffff', boardBg: '#ffffff', boardInk: '#111111' },
  'red-yellow':  { signBg: '#d7261e', signInk: '#ffffff', pageBg: '#fff8e8', ink: '#1a1714', accent: '#ffc93c', accentInk: '#1a1714', boardBg: '#151311', boardInk: '#fff3d1' },
  'cream-green': { signBg: '#1f4d3a', signInk: '#f3ead7', pageBg: '#f6f1e8', ink: '#17231d', accent: '#1f4d3a', accentInk: '#f3ead7', boardBg: '#fffdf8', boardInk: '#17231d' },
  'blue-white':  { signBg: '#123a7a', signInk: '#ffffff', pageBg: '#f2f5fa', ink: '#101826', accent: '#123a7a', accentInk: '#ffffff', boardBg: '#ffffff', boardInk: '#101826' },
};

const FONT_BASE = '/v/_shared/fonts';
const LATIN = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+2000-206F,U+20AC,U+2122';
const LATIN_EXT = 'U+0100-02AF,U+1E00-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0';
const face = (family, file, extra = '') =>
  `@font-face{font-family:${family};src:url(${FONT_BASE}/${file}-latin.woff2) format('woff2');${extra}unicode-range:${LATIN};font-display:swap}` +
  `@font-face{font-family:${family};src:url(${FONT_BASE}/${file}-latin-ext.woff2) format('woff2');${extra}unicode-range:${LATIN_EXT};font-display:swap}`;

export const LETTERINGS = {
  block:  { family: "VenueBlock,Impact,'Arial Narrow',sans-serif", weight: 400, upper: true,  spacing: '.01em', faces: face('VenueBlock', 'anton') },
  narrow: { family: "VenueNarrow,'Arial Narrow',Arial,sans-serif", weight: 700, upper: true,  spacing: '.02em', faces: face('VenueNarrow', 'archivo-narrow', 'font-weight:400 700;') },
  serif:  { family: "Georgia,'Times New Roman',serif",             weight: 700, upper: false, spacing: '0',     faces: '' },
};

export const DEFAULT_THEME = { palette: 'white-black', lettering: 'block' };
