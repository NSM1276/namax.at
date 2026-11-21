// Address of a venue's link preview picture. Kept apart from og.mjs so the page does not load the renderer.
import { createHash } from 'node:crypto';

/** Changes whenever anything drawn on the picture changes; part of the image address. */
export function ogVersion(v) {
  const drawn = [v.name, v.area, v.kind, v.address && v.address.street, v.address && v.address.zip, v.theme && v.theme.palette, v.theme && v.theme.lettering];
  return createHash('sha1').update(JSON.stringify(drawn)).digest('hex').slice(0, 10);
}

export const ogImageUrl = (v) => `https://${v.slug}.namax.at/api/venue/og?v=${ogVersion(v)}`;
