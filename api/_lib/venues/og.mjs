// Link preview picture (og:image) for <slug>.namax.at: 1200×630 PNG in the colors and lettering of the
// venue's own page, drawn on request and cached by the CDN. WhatsApp, Instagram, Telegram and Facebook show it.
import { readFileSync } from 'node:fs';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { PALETTES, LETTERINGS, DEFAULT_THEME } from './themes.mjs';
import { kindLabel } from './i18n.mjs';
export { ogVersion, ogImageUrl } from './og-url.mjs';

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

const font = (file) => readFileSync(new URL(`./og-fonts/${file}.woff`, import.meta.url));
let fonts; // loaded on first use, so pages that never draw a picture do not read them
const loadFonts = () => fonts ||= [
  ['Block', 400, 'anton', 400], ['Narrow', 700, 'archivo-narrow', 700], ['Small', 400, 'archivo-narrow', 400], ['Serif', 700, 'gelasio', 700],
].flatMap(([name, weight, file, w]) => ['latin', 'latin-ext'].map((sub) => ({ name: sub === 'latin' ? name : name + 'Ext', weight, style: 'normal', data: font(`${file}-${sub}-${w}-normal`) })));

// Each face comes in two files; the second holds ŞğıčćžđŁ… and is listed as the fallback.
const fam = (name) => `${name}, ${name}Ext`;
const FACE = { block: { family: 'Block', weight: 400, width: 0.47 }, narrow: { family: 'Narrow', weight: 700, width: 0.5 }, serif: { family: 'Serif', weight: 700, width: 0.6 } };

function look(v) {
  const theme = { ...DEFAULT_THEME, ...(v.theme || {}) };
  const pal = Object.hasOwn(PALETTES, theme.palette) ? PALETTES[theme.palette] : PALETTES[DEFAULT_THEME.palette];
  const key = Object.hasOwn(LETTERINGS, theme.lettering) ? theme.lettering : DEFAULT_THEME.lettering;
  return { pal, letter: LETTERINGS[key], face: FACE[key] };
}

/** Largest font size (px) at which the name fits the frame in at most 3 lines. */
function nameSize(text, charWidth) {
  const box = { w: 960, h: 330 };
  const words = text.split(/\s+/);
  const longest = Math.max(...words.map((w) => w.length));
  for (let size = 150; size > 40; size -= 4) {
    const perLine = Math.floor(box.w / (size * charWidth));
    if (longest > perLine) continue;
    let lines = 1, used = 0;
    for (const w of words) { if (used && used + 1 + w.length > perLine) { lines++; used = w.length; } else used += (used ? 1 : 0) + w.length; }
    if (lines <= 3 && lines * size * 1.08 <= box.h) return size;
  }
  return 40;
}

const el = (style, children) => ({ type: 'div', props: { style: { display: 'flex', ...style }, children } });

/** The picture as a tree for the renderer (plain objects, no React). */
export function ogTree(v) {
  const { pal, letter, face } = look(v);
  const name = letter.upper ? v.name.toUpperCase() : v.name;
  const kind = kindLabel(v.kind, 'de');
  const where = [kind, v.address && v.address.street, v.address && `${v.address.zip} ${v.address.city}`].filter(Boolean).join(' · ');
  const small = { fontFamily: fam('Small'), fontWeight: 400, color: pal.signInk };
  return el({ width: OG_WIDTH, height: OG_HEIGHT, background: pal.signBg, padding: 36, position: 'relative' }, [
    el({ flex: 1, flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', border: `6px solid ${pal.signInk}`, padding: '34px 50px 30px' }, [
      el({ ...small, fontFamily: fam('Narrow'), fontWeight: 700, fontSize: 30, letterSpacing: 6 }, (v.area || '').toUpperCase() || ' '),
      el({ fontFamily: fam(face.family), fontWeight: face.weight, fontSize: nameSize(name, face.width), lineHeight: 1.04, color: pal.signInk, textAlign: 'center', justifyContent: 'center' }, name),
      el({ ...small, fontSize: 30, opacity: 0.88, textAlign: 'center' }, where || ' '),
    ]),
    el({ ...small, position: 'absolute', right: 44, bottom: 4, fontSize: 22, opacity: 0.7 }, 'namax.at'),
  ]);
}

/** venue → PNG Response. The address carries the version, so the picture can be cached for a year. */
export async function renderOg(v) {
  const svg = await satori(ogTree(v), { width: OG_WIDTH, height: OG_HEIGHT, fonts: loadFonts() });
  const bytes = new Resvg(svg, { fitTo: { mode: 'width', value: OG_WIDTH } }).render().asPng();
  return new Response(bytes, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400, s-maxage=31536000' } });
}
