// Public venue pages stay on Vercel's CDN for hours instead of a minute (Nasim, 2026-11-24: fewer function runs and database reads).
// Each page carries cache tags: its own slug and its neighbours' (it links them), so any write to a venue made through the
// functions refreshes every page that shows it at once. Writes made by local tools straight into the database are not purged;
// those pages refresh on their own within the cache time, and every deploy starts with an empty cache.
// No stale-while-revalidate (review R4): after a change nobody may see the old page, so a purge deletes, it does not mark stale.
export const PAGE_CACHE = 'public, s-maxage=21600';

export const pageTag = (slug) => `v-${slug}`;
/** The Vercel-Cache-Tag value of a page: itself and every neighbour it may link (at most 128 tags per response). */
export const pageTags = (slug, near = []) => [...new Set([slug, ...near.map((n) => n && n.slug).filter(Boolean)])].slice(0, 120).map(pageTag).join(',');

// Store methods whose first argument is a slug and whose write can change that venue's public page.
export const PAGE_WRITES = ['upsertFacts', 'applyPending', 'setStatus', 'setConfirmed', 'addPhoto', 'setPhotoKind', 'removePhoto', 'setFacade', 'setChatOpen'];

/** The store with each page-changing write followed by purge([tags]); a failed purge never fails the write. */
export function purgingStore(store, purge) {
  const out = { ...store };
  const safe = async (tags) => { try { await purge(tags); } catch (e) { console.error('cache purge failed', tags.join(','), e?.message); } };
  for (const m of PAGE_WRITES) {
    if (typeof store[m] !== 'function') continue;
    out[m] = async (slug, ...rest) => { const r = await store[m](slug, ...rest); await safe([pageTag(slug)]); return r; };
  }
  if (typeof store.setContexts === 'function') {
    out.setContexts = async (entries) => { const r = await store.setContexts(entries); await safe(entries.map((e) => pageTag(e.slug))); return r; };
  }
  return out;
}
