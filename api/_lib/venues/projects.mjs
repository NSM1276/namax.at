// Nasim's projects whose request forms all land in the /liste "Anfragen" (js/contact.js on each site).
// The project of a request is taken from the site it was sent from (the Origin header), never from the body,
// so another site cannot send requests in a project's name. Roles and wishes are each project's own words.

export const PROJECTS = {
  namax: {
    name: 'namax', site: 'namax.at', origins: /^https:\/\/(www\.)?namax\.at$/,
    roles: { nosite: 'hat noch keine Website', hassite: 'hat eine Website, will sie besser', misc: 'etwas anderes' },
    wishes: { website: 'Website', social: 'Social Media', content: 'Content & Reels', seo: 'SEO', ads: 'Werbung', advice: 'weiß noch nicht, will Beratung' },
  },
  akiwi: {
    name: 'Akiwi', site: 'akiwi.at', origins: /^https:\/\/([a-z0-9-]+\.)?akiwi\.at$/,
    roles: { owner: 'Inhaber/in eines Lokals', staff: 'Mitarbeiter/Familie', guest: 'Gast' },
    wishes: { add: 'Lokal eintragen', fix: 'Angaben ändern', certificate: 'Halal-Zertifikat schicken', photos: 'Fotos schicken', report: 'Fehler melden', remove: 'Lokal entfernen', other: 'etwas anderes' },
    // A guest telling us something is wrong needs no way back: the message is what counts.
    phoneOptional: (role) => role === 'guest',
    // The entry form (/eintrag/<id>) sends the whole list of corrections with the request: opening hours for seven days and more.
    maxText: 1500,
  },
  fightfolio: {
    name: 'FightFolio', site: 'fightfolio.de', origins: /^https:\/\/(www\.)?fightfolio\.de$/,
    roles: { fighter: 'Kämpfer/in', coach: 'Trainer/in', gym: 'Club / Gym', other: 'jemand anderes' },
    wishes: { profile: 'Profil anlegen', fix: 'Angaben korrigieren', remove: 'Profil entfernen', collab: 'Zusammenarbeit', other: 'etwas anderes' },
  },
};
export const PROJECT_KEYS = Object.keys(PROJECTS);

const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/** The project a browser request comes from, by its Origin: null for a site that is not ours.
 *  No Origin (not a browser) and the local preview count as namax. */
export function projectOf(origin) {
  if (!origin || LOCAL.test(origin)) return 'namax';
  return PROJECT_KEYS.find((k) => PROJECTS[k].origins.test(origin)) || null;
}

/** The project of a stored request or form event: requests carry it, events keep it in front of the page ("akiwi:lokale"). */
export const requestProject = (q) => (q && PROJECTS[q.project] ? q.project : 'namax');
