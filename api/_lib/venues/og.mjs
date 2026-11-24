// Link preview picture (og:image) for <slug>.namax.at: 1200×630 PNG as the same enamel plate as the
// venue's own page, drawn on request and cached by the CDN. WhatsApp, Instagram, Telegram, Facebook and Google show it.
// When the page shows a niche picture (Symbolbild), the preview shows that dish with a small name plate on it (Nasim, 2026-11-24).
import { readFileSync } from 'node:fs';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import jpeg from 'jpeg-js';
import { PALETTES, DEFAULT_THEME } from './themes.mjs';
import { kindLabel } from './i18n.mjs';
import { districtLine } from './template.mjs';
import { signName } from './signname.mjs';
import { faviconSvg } from './around.mjs';
import { ogDish } from './og-url.mjs';
export { ogVersion, ogImageUrl, ogDish } from './og-url.mjs';

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

const font = (file) => readFileSync(new URL(`./og-fonts/${file}.woff`, import.meta.url));
let fonts; // loaded on first use, so pages that never draw a picture do not read them
const loadFonts = () => fonts ||= [['Display', 'barlow-condensed'], ['Text', 'figtree']]
  .flatMap(([name, file]) => ['latin', 'latin-ext'].map((sub) => ({ name: sub === 'latin' ? name : name + 'Ext', weight: 700, style: 'normal', data: font(`${file}-${sub}-700-normal`) })));

// Each face comes in two files; the second holds ŞğıčćžđŁ… and is listed as the fallback.
const fam = (name) => `${name}, ${name}Ext`;

function palette(v) {
  const name = (v.theme && v.theme.palette) || DEFAULT_THEME.palette;
  return Object.hasOwn(PALETTES, name) ? PALETTES[name] : PALETTES[DEFAULT_THEME.palette];
}

// Inside the rim: 1200 − 2×48 page margin − 2×18 plate padding − 2×6 rim − 2×44 rim padding.
const NAME_BOX = { w: 968, h: 290 };

/** Largest font size (px) at which the name fits the box in at most `maxLines` lines (Barlow Condensed capitals ≈ 0.5em wide). */
function nameSize(text, box = NAME_BOX, maxLines = 3, max = 150, min = 40, charWidth = 0.5) {
  const words = text.split(/\s+/);
  const longest = Math.max(...words.map((w) => w.length));
  for (let size = max; size > min; size -= 2) {
    const perLine = Math.floor(box.w / (size * charWidth));
    if (longest > perLine) continue;
    let lines = 1, used = 0;
    for (const w of words) { if (used && used + 1 + w.length > perLine) { lines++; used = w.length; } else used += (used ? 1 : 0) + w.length; }
    if (lines <= maxLines && lines * size * 1.0 <= box.h) return size;
  }
  return min;
}

const el = (style, children) => ({ type: 'div', props: { style: { display: 'flex', ...style }, children } });

/** The words on the plate: the trade word or kind label above, the proper name big (signname.mjs), the district below. */
function plateText(v) {
  const sn = signName(v.name);
  return { top: (sn.pre || kindLabel(v.kind, 'de')).toUpperCase(), name: sn.main.toUpperCase(), district: districtLine(v) };
}

const dishData = new Map();
const dishSrc = (name) => {
  if (!dishData.has(name)) dishData.set(name, 'data:image/jpeg;base64,' + readFileSync(new URL(`./og-niche/${name}.jpg`, import.meta.url)).toString('base64'));
  return dishData.get(name);
};

// The small plate on the dish: at most 2 name lines in a 396×116 box.
const SMALL_BOX = { w: 396, h: 116 };

/** The dish full-bleed (JPEG copy from og-niche/, the renderer cannot read webp), a small plate bottom left, "Symbolbild" top right. */
export function ogDishTree(v, dish) {
  const pal = palette(v);
  const t = plateText(v);
  const small = { fontFamily: fam('Text'), fontWeight: 700, color: pal.signInk, fontSize: 17 };
  const tag = { fontFamily: fam('Text'), fontWeight: 700, fontSize: 20, color: '#fff', borderRadius: 8, padding: '6px 12px' };
  return el({ width: OG_WIDTH, height: OG_HEIGHT, position: 'relative', background: '#111' }, [
    { type: 'img', props: { src: dishSrc(dish), width: OG_WIDTH, height: OG_HEIGHT, style: { position: 'absolute', left: 0, top: 0 } } },
    el({ position: 'absolute', left: 0, bottom: 0, width: OG_WIDTH, height: 300, backgroundImage: 'linear-gradient(to bottom, rgba(0,0,0,0), rgba(0,0,0,.45))' }, []),
    el({ position: 'absolute', left: 36, bottom: 36, width: 492, background: pal.signBg, borderRadius: 20, padding: 12, boxShadow: '0 14px 30px rgba(0,0,0,.45)' }, [
      el({ flex: 1, flexDirection: 'column', alignItems: 'center', border: `4px solid ${pal.signInk}`, borderRadius: 13, padding: '16px 24px' }, [
        el({ ...small, letterSpacing: 4 }, t.top || ' '),
        el({ fontFamily: fam('Display'), fontWeight: 700, fontSize: nameSize(t.name, SMALL_BOX, 2, 72, 28), lineHeight: 1.0, color: pal.signInk, textAlign: 'center', justifyContent: 'center', margin: '10px 0' }, t.name),
        el({ ...small, fontSize: 15, letterSpacing: 2, opacity: 0.9 }, t.district || ' '),
      ]),
    ]),
    el({ position: 'absolute', right: 28, top: 24, ...tag, background: 'rgba(0,0,0,.55)' }, 'Symbolbild'),
    el({ position: 'absolute', right: 28, bottom: 24, ...tag, opacity: 0.85 }, 'namax.at'),
  ]);
}

/** The picture as a tree for the renderer (plain objects, no React): the enamel plate on the page background. */
export function ogTree(v) {
  const pal = palette(v);
  const { top: kind, name, district } = plateText(v);
  const small = { fontFamily: fam('Text'), fontWeight: 700, color: pal.signInk, fontSize: 30 };
  const screw = (side) => el({ position: 'absolute', top: 222, [side]: 6, width: 12, height: 12, borderRadius: 6, background: pal.signInk, opacity: 0.7 }, []);
  return el({ width: OG_WIDTH, height: OG_HEIGHT, background: pal.pageBg, padding: '40px 48px 58px', position: 'relative' }, [
    el({ flex: 1, position: 'relative', background: pal.signBg, borderRadius: 28, padding: 18, boxShadow: '0 18px 36px rgba(0,0,0,.28)' }, [
      el({ flex: 1, flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', border: `6px solid ${pal.signInk}`, borderRadius: 18, padding: '30px 44px 28px' }, [
        el({ ...small, letterSpacing: 7 }, kind || ' '),
        el({ fontFamily: fam('Display'), fontWeight: 700, fontSize: nameSize(name), lineHeight: 1.0, color: pal.signInk, textAlign: 'center', justifyContent: 'center' }, name),
        el({ ...small, letterSpacing: 4, opacity: 0.9 }, district || ' '),
      ]),
      screw('left'), screw('right'),
    ]),
    el({ position: 'absolute', right: 52, bottom: 12, fontFamily: fam('Text'), fontWeight: 700, fontSize: 24, color: pal.ink, opacity: 0.7 }, 'namax.at'),
  ]);
}

const ICON_SIZE = { ico: 48, png: 192, apple: 180 };

/** An ICO file holding one PNG (every browser and Google read PNG inside ICO). */
function ico(png, size) {
  const head = Buffer.alloc(22);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(1, 4);
  head.writeUInt8(size % 256, 6); head.writeUInt8(size % 256, 7); head.writeUInt16LE(1, 10); head.writeUInt16LE(32, 12);
  head.writeUInt32LE(png.length, 14); head.writeUInt32LE(22, 18);
  return Buffer.concat([head, png]);
}

/** venue, 'ico' | 'png' | 'apple' → the medallion icon (same drawing as /favicon.svg) as ICO or PNG; null for another name. */
export function renderIcon(v, kind) {
  if (!Object.hasOwn(ICON_SIZE, kind)) return null;
  const size = ICON_SIZE[kind];
  const png = new Resvg(faviconSvg(v), { fitTo: { mode: 'width', value: size } }).render().asPng();
  const body = kind === 'ico' ? ico(png, size) : png;
  return new Response(body, { headers: { 'Content-Type': kind === 'ico' ? 'image/x-icon' : 'image/png', 'Cache-Control': 'public, max-age=86400, s-maxage=86400' } });
}

/** venue → image Response: the plate as PNG, a dish picture as JPEG (as PNG it weighs ~1 MB, too much for WhatsApp).
 * The address carries the version, so the picture can be cached for a year. */
export async function renderOg(v) {
  const dish = ogDish(v);
  const svg = await satori(dish ? ogDishTree(v, dish) : ogTree(v), { width: OG_WIDTH, height: OG_HEIGHT, fonts: loadFonts() });
  const img = new Resvg(svg, { fitTo: { mode: 'width', value: OG_WIDTH } }).render();
  const [bytes, type] = dish
    ? [jpeg.encode({ data: img.pixels, width: img.width, height: img.height }, 82).data, 'image/jpeg']
    : [img.asPng(), 'image/png'];
  return new Response(bytes, { headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=86400, s-maxage=31536000' } });
}
