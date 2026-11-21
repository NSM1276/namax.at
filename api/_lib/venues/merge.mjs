// What a venue page shows: the facts, the owner's changes laid over them, the owner's photos.
import { validateVenue } from './schema.mjs';

export const CHANGEABLE = ['phone', 'hours', 'list', 'facts'];
const MAX_ITEMS = 40;
const MAX_SHOWN_PHOTOS = 4;
// Blocks a facts file may mark as uncertain; they stay off the page until the owner confirms or changes them.
const HIDE_WHEN_UNCERTAIN = ['hours', 'phone', 'list'];

function base(record) {
  const { internal, uncertain, ...facts } = structuredClone(record.facts);
  return { venue: { ...facts, ...structuredClone(record.changes || {}) }, uncertain: uncertain || [] };
}

/** record as returned by store.getVenue; photos as returned by store.listPhotos. */
export function effectiveVenue(record, photos = []) {
  const { venue, uncertain } = base(record);
  venue.status = record.status;
  venue.confirmed = Boolean(record.confirmedAt);
  if (!venue.confirmed) {
    for (const field of HIDE_WHEN_UNCERTAIN) {
      if (uncertain.includes(field) && !Object.hasOwn(record.changes || {}, field)) delete venue[field];
    }
  }
  const shown = photos.filter((p) => p.kind === 'show').slice(0, MAX_SHOWN_PHOTOS).map((p) => p.url);
  if (shown.length) venue.photos = shown; else delete venue.photos;
  if (record.facadeUrl) venue.facade = record.facadeUrl; else delete venue.facade;
  // Checked against Overture Maps (CDLA-Permissive-2.0): only the credit reaches the page, never Overture's own facts.
  if (record.facts.internal?.overture?.release) venue.overture = true; else delete venue.overture;
  return venue;
}

/** → { ok: true, changes } | { ok: false, problems: string[] } */
export function checkChanges(record, changes) {
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) return { ok: false, problems: ['changes must be an object'] };
  const keys = Object.keys(changes);
  if (!keys.length) return { ok: false, problems: ['nothing to change'] };
  const outside = keys.filter((k) => !CHANGEABLE.includes(k));
  if (outside.length) return { ok: false, problems: [`only ${CHANGEABLE.join(', ')} can be changed, not ${outside.join(', ')}`] };
  const items = changes.list?.groups?.reduce?.((n, g) => n + (Array.isArray(g?.items) ? g.items.length : 0), 0) || 0;
  if (items > MAX_ITEMS) return { ok: false, problems: [`at most ${MAX_ITEMS} list items, got ${items}`] };
  const { venue } = base(record);
  const merged = { ...venue, ...structuredClone(changes), status: record.status };
  const problems = validateVenue(merged, record.slug);
  return problems.length ? { ok: false, problems } : { ok: true, changes: structuredClone(changes) };
}
