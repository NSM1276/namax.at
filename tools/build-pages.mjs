// Generates the ten service pages (5 services × DE/EN) as plain static HTML.
// Run: node tools/build-pages.mjs   — then commit the generated files.
// Edit the texts here, never in the generated files.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const V = 7; // asset version, bump when css/js change
const SITE = 'https://www.namax.at';

const WA_ICON = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.107.549 4.09 1.51 5.814L.057 23.428a.75.75 0 0 0 .916.916l5.638-1.447A11.945 11.945 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.75a9.725 9.725 0 0 1-4.964-1.362l-.355-.211-3.685.945.974-3.564-.232-.368A9.718 9.718 0 0 1 2.25 12C2.25 6.615 6.615 2.25 12 2.25S21.75 6.615 21.75 12 17.385 21.75 12 21.75z"/></svg>';

const UI = {
  de: {
    lang: 'de', home: '/', ogLocale: 'de_AT', og: 'og-de.png',
    wa: 'https://wa.me/4367764292055?text=Hallo%2C%20ich%20interessiere%20mich%20f%C3%BCr%20Ihre%20Leistungen.',
    homeLabel: 'namax — Startseite', navLabel: 'Sprache und Kontakt', crumbHome: 'Startseite',
    cta: 'Auf WhatsApp schreiben', gets: 'Was Sie bekommen', flow: 'So läuft es ab', faq: 'Häufige Fragen',
    more: 'Weitere Leistungen', final: 'Schreiben<br>Sie uns.', finalSub: 'Studio für Web &amp; Social · Wien',
    legalLabel: 'Rechtliches', imprint: ['/impressum', 'Impressum'], privacy: ['/datenschutz', 'Datenschutz'],
    copy: '© 2026 namax · Wien',
    priceQ: 'Was kostet das?',
    priceA: 'Das hängt vom Umfang ab. Schreiben Sie uns kurz, was Sie brauchen — dann bekommen Sie ein Angebot.',
  },
  en: {
    lang: 'en', home: '/en', ogLocale: 'en_GB', og: 'og-en.png',
    wa: 'https://wa.me/4367764292055?text=Hello%2C%20I%27m%20interested%20in%20your%20services.',
    homeLabel: 'namax — home', navLabel: 'Language and contact', crumbHome: 'Home',
    cta: 'Message us on WhatsApp', gets: 'What you get', flow: 'How it works', faq: 'Common questions',
    more: 'More services', final: 'Message<br>us.', finalSub: 'Studio for web &amp; social · Vienna',
    legalLabel: 'Legal', imprint: ['/en/impressum', 'Imprint'], privacy: ['/en/datenschutz', 'Privacy'],
    copy: '© 2026 namax · Vienna',
    priceQ: 'What does it cost?',
    priceA: 'That depends on the scope. Tell us briefly what you need and we will send you a quote.',
  },
};

// theme = colour of the page hero; same order and colours as the cards on the home page
const SERVICES = [
  {
    theme: 't-ink',
    de: {
      slug: 'webdesign-wien', nav: 'Websites',
      title: 'Webdesign Wien — Websites für Betriebe | namax',
      desc: 'Websites für Betriebe in Wien: schnell, klar und am Handy perfekt. Von Text und Design bis online — schreiben Sie uns auf WhatsApp.',
      h1: 'Webdesign in Wien: Websites, die man gern besucht.',
      lede: 'Ihre Website ist oft der erste Eindruck. Wir bauen sie so, dass man in wenigen Sekunden versteht, was Sie anbieten — und Sie mit einem Tipp erreicht.',
      gets: [
        ['Am Handy zuerst', 'Die meisten Besucher kommen übers Handy. Darum gestalten wir zuerst für den kleinen Bildschirm und dann für den großen.'],
        ['Texte, die man versteht', 'Wir schreiben mit Ihnen kurze, klare Texte ohne Fachsprache: wer Sie sind, was Sie anbieten, wie man Sie erreicht.'],
        ['Schnell geladen', 'Schlanke Seiten ohne unnötigen Ballast. Das merken Ihre Besucher — und Google auch.'],
        ['Für Google vorbereitet', 'Saubere Überschriften, Seitentitel, Beschreibung und Struktur: die Grundlage, damit Ihre Seite gefunden werden kann.'],
      ],
      flow: [
        ['Schreiben', 'Sie erzählen uns kurz von Ihrem Betrieb.'],
        ['Vorschlag', 'Sie bekommen von uns Aufbau, Texte und Design zur Ansicht.'],
        ['Online', 'Passt alles, stellen wir die Seite online.'],
      ],
      faq: [
        ['Wie lange dauert es?', 'Das hängt vom Umfang ab. Einen Zeitplan bekommen Sie gemeinsam mit dem Angebot.'],
        ['Ich habe schon eine Website. Können Sie sie neu machen?', 'Ja. Wir schauen uns die bestehende Seite an und sagen Ihnen ehrlich, was bleiben kann und was neu werden sollte.'],
      ],
    },
    en: {
      slug: 'web-design-vienna', nav: 'Websites',
      title: 'Web design Vienna — websites for businesses | namax',
      desc: 'Websites for businesses in Vienna: fast, clear and perfect on a phone. From copy and design to launch — message us on WhatsApp.',
      h1: 'Web design in Vienna: websites people enjoy visiting.',
      lede: 'Your website is often the first impression. We build it so that people understand what you offer within seconds — and can reach you with one tap.',
      gets: [
        ['Phone first', 'Most visitors arrive on a phone. So we design for the small screen first and the large one second.'],
        ['Copy people understand', 'We write short, clear texts with you, without jargon: who you are, what you offer, how to reach you.'],
        ['Fast to load', 'Lean pages without unnecessary weight. Your visitors notice — and so does Google.'],
        ['Ready for Google', 'Clean headings, page titles, descriptions and structure: the basis for your site to be found.'],
      ],
      flow: [
        ['Message us', 'You tell us briefly about your business.'],
        ['Proposal', 'We send you structure, copy and design to look at.'],
        ['Live', 'When everything fits, we put the site online.'],
      ],
      faq: [
        ['How long does it take?', 'That depends on the scope. You get a timeline together with the quote.'],
        ['I already have a website. Can you redo it?', 'Yes. We look at the existing site and tell you honestly what can stay and what should be rebuilt.'],
      ],
    },
  },
  {
    theme: 't-red',
    de: {
      slug: 'social-media-wien', nav: 'Social Media',
      title: 'Social Media Betreuung Wien | namax',
      desc: 'Social Media für Betriebe in Wien: Profile einrichten, Beiträge planen und laufend betreuen. Sie arbeiten, wir posten.',
      h1: 'Social Media in Wien: Sie arbeiten, wir posten.',
      lede: 'Ein Profil, auf dem seit Monaten nichts passiert, wirkt wie ein geschlossenes Geschäft. Wir sorgen dafür, dass bei Ihnen regelmäßig etwas Neues zu sehen ist.',
      gets: [
        ['Profile einrichten', 'Instagram und Facebook sauber aufgesetzt: Name, Bild, Beschreibung, Kontakt und Link zur Website.'],
        ['Ein Plan statt Zufall', 'Wir legen mit Ihnen fest, worüber gepostet wird und wie oft — passend zu Ihrem Betrieb.'],
        ['Beiträge, Karussells, Reels', 'Wir gestalten die Inhalte in einem einheitlichen Stil, damit man Sie sofort wiedererkennt.'],
        ['Laufende Betreuung', 'Wir veröffentlichen regelmäßig und halten Ihr Profil aktuell.'],
      ],
      flow: [
        ['Schreiben', 'Sie sagen uns, welche Kanäle Sie haben oder wollen.'],
        ['Plan', 'Sie bekommen einen Vorschlag für Themen, Stil und Rhythmus.'],
        ['Los', 'Wir erstellen und veröffentlichen — Sie geben vorher frei.'],
      ],
      faq: [
        ['Brauche ich Instagram und Facebook?', 'Nicht unbedingt. Wichtig ist der Kanal, auf dem Ihre Kundschaft ist. Das besprechen wir gemeinsam.'],
        ['Muss ich selbst Fotos liefern?', 'Fotos und kurze Videos aus Ihrem Betrieb helfen sehr — sie machen den Auftritt echt. Wie wir sie bekommen, klären wir am Anfang.'],
      ],
    },
    en: {
      slug: 'social-media-vienna', nav: 'Social media',
      title: 'Social media management Vienna | namax',
      desc: 'Social media for businesses in Vienna: we set up your profiles, plan your posts and look after them. You work, we post.',
      h1: 'Social media in Vienna: you work, we post.',
      lede: 'A profile where nothing has happened for months looks like a closed shop. We make sure there is regularly something new to see on yours.',
      gets: [
        ['Profile setup', 'Instagram and Facebook set up properly: name, picture, description, contact and a link to your website.'],
        ['A plan, not chance', 'Together we decide what gets posted and how often — in a way that fits your business.'],
        ['Posts, carousels, reels', 'We design the content in one consistent style so people recognise you at once.'],
        ['Ongoing care', 'We publish regularly and keep your profile up to date.'],
      ],
      flow: [
        ['Message us', 'You tell us which channels you have or want.'],
        ['Plan', 'You get a proposal for topics, style and rhythm.'],
        ['Go', 'We create and publish — you approve first.'],
      ],
      faq: [
        ['Do I need both Instagram and Facebook?', 'Not necessarily. What matters is the channel your customers use. We work that out together.'],
        ['Do I have to supply photos myself?', 'Photos and short videos from your business help a lot — they make it real. How we get them is settled at the start.'],
      ],
    },
  },
  {
    theme: 't-lime',
    de: {
      slug: 'content-reels-wien', nav: 'Content',
      title: 'Reels, Karussells & Motion Design Wien | namax',
      desc: 'Content für Social Media in Wien: Reels, Karussells und Motion Design, die auffallen und zu Ihrem Betrieb passen.',
      h1: 'Reels, Karussells und Motion Design aus Wien.',
      lede: 'Auf Instagram entscheidet die erste Sekunde. Wir machen Inhalte, bei denen man nicht weiterscrollt.',
      gets: [
        ['Reels', 'Kurze Videos mit klarem Anfang, Text im Bild und einem Schluss, der zum Handeln einlädt.'],
        ['Karussells', 'Mehrere Bilder zum Durchwischen: ideal für Angebote, Tipps und Vorher-Nachher.'],
        ['Motion Design', 'Bewegte Schrift und Grafik — für Inhalte, die auch ohne Ton verstanden werden.'],
        ['Ein Stil', 'Farben, Schrift und Aufbau bleiben gleich. So erkennt man Ihre Beiträge sofort.'],
      ],
      flow: [
        ['Schreiben', 'Sie sagen uns, was Sie zeigen wollen.'],
        ['Entwurf', 'Sie bekommen Idee und ersten Entwurf zur Ansicht.'],
        ['Fertig', 'Sie erhalten die Dateien im richtigen Format für jeden Kanal.'],
      ],
      faq: [
        ['Kann ich nur einzelne Inhalte bestellen?', 'Ja. Einzelne Reels oder Karussells sind genauso möglich wie laufende Produktion.'],
        ['Wer filmt?', 'Das klären wir am Anfang. Oft reicht Material vom Handy aus Ihrem Betrieb, das wir schneiden und gestalten.'],
      ],
    },
    en: {
      slug: 'content-reels-vienna', nav: 'Content',
      title: 'Reels, carousels & motion design Vienna | namax',
      desc: 'Content for social media in Vienna: reels, carousels and motion design that stand out and fit your business.',
      h1: 'Reels, carousels and motion design from Vienna.',
      lede: 'On Instagram the first second decides. We make content people stop scrolling for.',
      gets: [
        ['Reels', 'Short videos with a clear opening, text on screen and an ending that invites people to act.'],
        ['Carousels', 'Several images to swipe through: ideal for offers, tips and before-and-after.'],
        ['Motion design', 'Moving type and graphics — for content that works even with the sound off.'],
        ['One style', 'Colours, type and layout stay the same, so your posts are recognised at once.'],
      ],
      flow: [
        ['Message us', 'You tell us what you want to show.'],
        ['Draft', 'You get the idea and a first draft to look at.'],
        ['Done', 'You receive the files in the right format for each channel.'],
      ],
      faq: [
        ['Can I order single pieces of content?', 'Yes. Single reels or carousels are just as possible as ongoing production.'],
        ['Who does the filming?', 'We settle that at the start. Phone footage from your business is often enough; we cut and design it.'],
      ],
    },
  },
  {
    theme: 't-violet',
    de: {
      slug: 'seo-wien', nav: 'SEO',
      title: 'SEO Wien — bei Google gefunden werden | namax',
      desc: 'SEO für Betriebe in Wien: Technik, Inhalte und lokale Einträge, damit man Sie bei Google findet. Ehrlich und ohne leere Versprechen.',
      h1: 'SEO in Wien: damit man Sie bei Google findet.',
      lede: 'Wer in Wien nach Ihrem Angebot sucht, soll Sie auch finden. Dafür muss Google Ihre Seite verstehen — und Ihre Kundschaft auch.',
      gets: [
        ['Bestandsaufnahme', 'Wir prüfen, wie Ihre Seite heute dasteht: Technik, Inhalte, Ladezeit, Darstellung am Handy.'],
        ['Technik in Ordnung bringen', 'Seitentitel, Beschreibungen, Überschriften, Struktur, Sitemap — die Grundlagen, die oft fehlen.'],
        ['Inhalte, die gesucht werden', 'Seiten und Texte zu genau den Fragen, die Ihre Kundschaft bei Google eintippt.'],
        ['Lokal sichtbar', 'Google-Unternehmensprofil und Einträge in Verzeichnissen, damit man Sie auch auf der Karte findet.'],
      ],
      flow: [
        ['Schreiben', 'Sie nennen uns Ihre Website und Ihr Ziel.'],
        ['Analyse', 'Sie bekommen eine verständliche Liste, was fehlt.'],
        ['Umsetzung', 'Wir setzen um und zeigen Ihnen, was sich verändert.'],
      ],
      faq: [
        ['Können Sie Platz 1 bei Google garantieren?', 'Nein — und das kann niemand seriös. Wir können dafür sorgen, dass alles stimmt, was in Ihrer Hand liegt.'],
        ['Wie schnell sieht man Ergebnisse?', 'SEO braucht Geduld: meist Wochen bis Monate. Wenn es schneller gehen soll, hilft Werbung.'],
      ],
    },
    en: {
      slug: 'seo-vienna', nav: 'SEO',
      title: 'SEO Vienna — get found on Google | namax',
      desc: 'SEO for businesses in Vienna: technology, content and local listings so people find you on Google. Honest, without empty promises.',
      h1: 'SEO in Vienna: so people find you on Google.',
      lede: 'When someone in Vienna searches for what you offer, they should find you. For that, Google has to understand your site — and so do your customers.',
      gets: [
        ['Where you stand', 'We check how your site is doing today: technology, content, loading time, how it looks on a phone.'],
        ['Fixing the basics', 'Page titles, descriptions, headings, structure, sitemap — the foundations that are often missing.'],
        ['Content people search for', 'Pages and texts on exactly the questions your customers type into Google.'],
        ['Visible locally', 'Google Business Profile and directory listings, so people also find you on the map.'],
      ],
      flow: [
        ['Message us', 'You give us your website and your goal.'],
        ['Analysis', 'You get a clear list of what is missing.'],
        ['Doing it', 'We do the work and show you what changes.'],
      ],
      faq: [
        ['Can you guarantee first place on Google?', 'No — and nobody honestly can. We can make sure everything in your hands is right.'],
        ['How fast will I see results?', 'SEO takes patience: usually weeks to months. If it has to be faster, ads help.'],
      ],
    },
  },
  {
    theme: 't-white',
    de: {
      slug: 'online-werbung-wien', nav: 'Werbung',
      title: 'Online-Werbung Wien: Google, Instagram, Facebook | namax',
      desc: 'Online-Werbung für Betriebe in Wien: Anzeigen auf Google, Instagram und Facebook — bei den Leuten, die Sie brauchen.',
      h1: 'Online-Werbung in Wien: Google, Instagram, Facebook.',
      lede: 'Werbung bringt Sie sofort vor die richtigen Leute — in Ihrer Gegend, mit Ihrem Angebot. Wir richten sie ein und behalten sie im Auge.',
      gets: [
        ['Google Ads', 'Ihre Anzeige erscheint, wenn jemand genau nach Ihrem Angebot sucht.'],
        ['Instagram & Facebook', 'Anzeigen im Feed und in Stories — für Menschen in Ihrer Umgebung.'],
        ['Anzeigen, die passen', 'Text, Bild oder Video gestalten wir so, dass sie zu Ihrem Auftritt passen.'],
        ['Im Blick behalten', 'Wir schauen regelmäßig, was funktioniert, und passen an.'],
      ],
      flow: [
        ['Schreiben', 'Sie sagen uns, was Sie bewerben wollen.'],
        ['Einrichten', 'Wir schlagen Kanal, Zielgruppe und Anzeigen vor.'],
        ['Laufen lassen', 'Die Kampagne startet — Sie sehen, was sie bringt.'],
      ],
      faq: [
        ['Google oder Instagram — was ist besser?', 'Google erreicht Menschen, die gerade suchen. Instagram und Facebook erreichen Menschen, die noch nicht suchen. Oft ergänzt sich beides.'],
        ['Brauche ich dafür eine Website?', 'Sie hilft sehr: Wer auf die Anzeige tippt, soll auf einer Seite landen, die überzeugt.'],
      ],
      priceQ: 'Wie viel Budget brauche ich?',
      priceA: 'Das hängt von Ziel und Branche ab. Wir besprechen vorab, was sinnvoll ist — Sie entscheiden.',
    },
    en: {
      slug: 'online-ads-vienna', nav: 'Ads',
      title: 'Online ads Vienna: Google, Instagram, Facebook | namax',
      desc: 'Online advertising for businesses in Vienna: ads on Google, Instagram and Facebook — shown to the people you need.',
      h1: 'Online ads in Vienna: Google, Instagram, Facebook.',
      lede: 'Ads put you in front of the right people straight away — in your area, with your offer. We set them up and keep an eye on them.',
      gets: [
        ['Google Ads', 'Your ad appears when someone searches for exactly what you offer.'],
        ['Instagram & Facebook', 'Ads in the feed and in stories — for people near you.'],
        ['Ads that fit', 'We design text, image or video so that they match the rest of your presence.'],
        ['Keeping watch', 'We check regularly what works and adjust.'],
      ],
      flow: [
        ['Message us', 'You tell us what you want to advertise.'],
        ['Set-up', 'We propose channel, audience and ads.'],
        ['Run', 'The campaign starts — you see what it brings.'],
      ],
      faq: [
        ['Google or Instagram — which is better?', 'Google reaches people who are searching right now. Instagram and Facebook reach people who are not searching yet. Often the two work together.'],
        ['Do I need a website for this?', 'It helps a lot: whoever taps the ad should land on a page that convinces.'],
      ],
      priceQ: 'How much budget do I need?',
      priceA: 'That depends on your goal and your trade. We discuss beforehand what makes sense — you decide.',
    },
  },
];

// One plain paragraph per page: who this is for and why it matters. Keyed by slug.
const ABOUT = {
  'webdesign-wien': ['Für wen ist das?', 'Für Lokale, Geschäfte, Handwerksbetriebe, Studios und Praxen in Wien, die noch keine Website haben oder mit ihrer alten nicht mehr zufrieden sind. Eine gute Seite beantwortet drei Fragen sofort: Was bieten Sie an? Wo sind Sie? Wie erreicht man Sie? Alles andere kommt danach. Wir halten die Seite bewusst einfach, damit Ihre Kundschaft nicht suchen muss.'],
  'web-design-vienna': ['Who is this for?', 'For restaurants, shops, trades, studios and practices in Vienna that have no website yet or are no longer happy with their old one. A good site answers three questions at once: what do you offer, where are you, and how can people reach you? Everything else comes after that. We keep the site deliberately simple so your customers do not have to search.'],
  'social-media-wien': ['Für wen ist das?', 'Für Betriebe in Wien, die wissen, dass ihre Kundschaft auf Instagram und Facebook unterwegs ist, aber im Alltag keine Zeit dafür haben. Regelmäßige Beiträge zeigen, dass bei Ihnen etwas los ist: neue Angebote, ein Blick hinter die Kulissen, Öffnungszeiten vor Feiertagen. Wir übernehmen die Arbeit, Sie behalten die Kontrolle — nichts geht ohne Ihre Freigabe online.'],
  'social-media-vienna': ['Who is this for?', 'For businesses in Vienna who know their customers are on Instagram and Facebook but have no time for it in day-to-day work. Regular posts show that something is happening: new offers, a look behind the scenes, opening hours before public holidays. We take on the work and you keep control — nothing goes online without your approval.'],
  'content-reels-wien': ['Für wen ist das?', 'Für alle, die auf Social Media sichtbar sein wollen, aber keine Lust auf langweilige Standardbilder haben. Ein Friseur zeigt eine Verwandlung, ein Lokal das Tagesgericht, eine Werkstatt, wie eine Reparatur abläuft. Solche Inhalte brauchen kein großes Budget, sondern eine gute Idee und sauberes Handwerk beim Schnitt und bei der Gestaltung. Genau das liefern wir.'],
  'content-reels-vienna': ['Who is this for?', 'For anyone who wants to be visible on social media but has no taste for dull stock pictures. A hairdresser shows a transformation, a restaurant the dish of the day, a workshop how a repair is done. Content like this does not need a big budget; it needs a good idea and clean craft in the edit and the design. That is exactly what we deliver.'],
  'seo-wien': ['Für wen ist das?', 'Für Betriebe in Wien, die eine Website haben, aber bei Google kaum auftauchen. Suchmaschinenoptimierung heißt nicht Tricks, sondern Ordnung: Die Seite muss technisch sauber sein, klar sagen, worum es geht, und zu dem passen, was Menschen wirklich suchen — zum Beispiel „Friseur 1120 Wien“ oder „Installateur Notdienst Wien“. Dazu kommt der Eintrag bei Google Maps, der für lokale Betriebe oft am meisten bringt.'],
  'seo-vienna': ['Who is this for?', 'For businesses in Vienna that have a website but hardly show up on Google. Search engine optimisation is not about tricks, it is about order: the site has to be technically clean, say clearly what it is about, and match what people really search for — for example “hairdresser 1120 Vienna” or “emergency plumber Vienna”. Add to that the Google Maps listing, which often does the most for local businesses.'],
  'online-werbung-wien': ['Für wen ist das?', 'Für Betriebe in Wien, die nicht monatelang warten wollen, bis man sie von selbst findet. Mit Anzeigen entscheiden Sie, wer Ihr Angebot sieht: Menschen in Ihrem Bezirk, in einem bestimmten Alter oder genau die, die gerade nach Ihrer Leistung suchen. Sie legen fest, wie viel Sie ausgeben wollen. Wir kümmern uns um Einrichtung, Gestaltung und darum, dass das Budget sinnvoll eingesetzt wird.'],
  'online-ads-vienna': ['Who is this for?', 'For businesses in Vienna that do not want to wait months to be found on their own. With ads you decide who sees your offer: people in your district, of a certain age, or exactly those who are searching for your service right now. You set how much you want to spend. We take care of the set-up, the design and making sure the budget is used sensibly.'],
};

const esc = s => s.replace(/&(?!amp;|#)/g, '&amp;');
const url = (ui, slug) => (ui.lang === 'de' ? `/${slug}` : `/en/${slug}`);

export function footLine(lang) {
  const ui = UI[lang];
  return SERVICES.map(s => `<a href="${url(ui, s[lang].slug)}">${esc(s[lang].nav)}</a>`).join(' · ');
}

function page(service, lang) {
  const ui = UI[lang];
  const other = lang === 'de' ? 'en' : 'de';
  const c = service[lang];
  const here = url(ui, c.slug);
  const there = url(UI[other], service[other].slug);
  const deUrl = SITE + url(UI.de, service.de.slug);
  const enUrl = SITE + url(UI.en, service.en.slug);
  const faq = [...c.faq, [c.priceQ || ui.priceQ, c.priceA || ui.priceA]];
  const langLink = lang === 'de'
    ? `<a class="lang" href="${there}" hreflang="en"><b>DE</b> / EN</a>`
    : `<a class="lang" href="${there}" hreflang="de">DE / <b>EN</b></a>`;
  const waBtn = (cls, label) => `<a class="btn btn-wa ${cls}" href="${ui.wa}" target="_blank" rel="noopener">${WA_ICON}${label}</a>`;

  return `<!doctype html>
<!-- Generated by tools/build-pages.mjs — edit the texts there, not here. -->
<html lang="${ui.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(c.title)}</title>
<meta name="description" content="${esc(c.desc)}">
<link rel="canonical" href="${SITE}${here}">
<link rel="alternate" hreflang="de" href="${deUrl}">
<link rel="alternate" hreflang="en" href="${enUrl}">
<link rel="alternate" hreflang="x-default" href="${deUrl}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="namax">
<meta property="og:locale" content="${ui.ogLocale}">
<meta property="og:url" content="${SITE}${here}">
<meta property="og:title" content="${esc(c.title)}">
<meta property="og:description" content="${esc(c.desc)}">
<meta property="og:image" content="${SITE}/${ui.og}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#FFF8E7">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="preload" href="/fonts/inter-tight-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/css/site.css?v=${V}">
<script src="/js/motion.js?v=${V}" defer></script>
</head>
<body id="top">

<header class="site-header">
  <div class="wrap">
    <a class="logo" href="${ui.home}" aria-label="${ui.homeLabel}"><span class="logo-n">n</span>amax</a>
    <nav class="site-nav" aria-label="${ui.navLabel}">
      ${langLink}
      ${waBtn('btn-sm', 'WhatsApp')}
    </nav>
  </div>
</header>

<main>

<section id="hero" class="page-hero ${service.theme}">
  <div class="wrap">
    <p class="crumb"><a href="${ui.home}">${ui.crumbHome}</a> / ${esc(c.nav)}</p>
    <h1>${esc(c.h1)}</h1>
    <p class="lede">${esc(c.lede)}</p>
    ${waBtn('btn-lg', ui.cta)}
  </div>
</section>

<section class="page-sec alt">
  <div class="wrap">
    <h2>${esc(ABOUT[c.slug][0])}</h2>
    <p class="prose">${esc(ABOUT[c.slug][1])}</p>
  </div>
</section>

<section class="page-sec">
  <div class="wrap">
    <h2>${ui.gets}</h2>
    <ul class="gets">
${c.gets.map(([t, d]) => `      <li><b>${esc(t)}</b>${esc(d)}</li>`).join('\n')}
    </ul>
  </div>
</section>

<section class="page-sec alt">
  <div class="wrap">
    <h2>${ui.flow}</h2>
    <ol class="flow">
${c.flow.map(([t, d]) => `      <li><b>${esc(t)}</b>${esc(d)}</li>`).join('\n')}
    </ol>
  </div>
</section>

<section class="page-sec">
  <div class="wrap">
    <h2>${ui.faq}</h2>
    <div class="faq">
${faq.map(([q, a]) => `      <details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('\n')}
    </div>
  </div>
</section>

<section class="page-sec alt">
  <div class="wrap">
    <h2>${ui.more}</h2>
    <nav class="more" aria-label="${ui.more}">
${SERVICES.filter(s => s !== service).map(s => `      <a class="${s.theme}" href="${url(ui, s[lang].slug)}">${esc(s[lang].nav)}</a>`).join('\n')}
    </nav>
  </div>
</section>

<section id="contact" data-scene="enter" data-steps="2">
  <div class="wrap contact-in">
    <h2>${ui.final}</h2>
    <p>${ui.finalSub}</p>
    ${waBtn('btn-xl', ui.cta)}
  </div>
</section>

</main>

<footer class="site-footer">
  <div class="wrap">
    <a class="logo" href="${ui.home}" aria-label="${ui.homeLabel}"><span class="logo-n">n</span>amax</a>
    <p class="foot-line">${footLine(lang)}</p>
    <nav class="foot-nav" aria-label="${ui.legalLabel}">
      <a href="${ui.imprint[0]}">${ui.imprint[1]}</a>
      <a href="${ui.privacy[0]}">${ui.privacy[1]}</a>
    </nav>
    <p class="foot-copy">${ui.copy}</p>
  </div>
</footer>

${waBtn('dock', ui.cta)}

</body>
</html>
`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  mkdirSync(join(root, 'en'), { recursive: true });
  for (const service of SERVICES) {
    for (const lang of ['de', 'en']) {
      const file = lang === 'de' ? `${service[lang].slug}.html` : `en/${service[lang].slug}.html`;
      writeFileSync(join(root, file), page(service, lang));
      console.log('wrote ' + file);
    }
  }
}
