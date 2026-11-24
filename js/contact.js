// Request form of Nasim's sites, served from www.namax.at and loaded by namax.at, akiwi.at and fightfolio.de.
// Every [data-contact="<place>"] button opens it; data-role / data-wish skip a step that the button already answers,
// data-topic names what it is about (a venue, a fighter). Step 1 who you are, step 2 what you need, step 3 how to reach you.
// The steps are counted per page and day without anything typed; the request lands in the /liste "Anfragen" on namax.
// On namax.at the dialog wears site.css; on the other sites it brings its own small style in the site's colours.
(function () {
  if (window.__namaxForm) return;
  window.__namaxForm = 1;
  var host = location.hostname;
  var project = /(^|\.)akiwi\.at$/.test(host) ? 'akiwi' : /(^|\.)fightfolio\.de$/.test(host) ? 'fightfolio' : 'namax';
  var api = project === 'namax' ? '/api/venue/contact' : 'https://www.namax.at/api/venue/contact';
  var lang = (document.documentElement.lang || 'de').slice(0, 2);
  var path = location.pathname;
  var page = project !== 'namax' ? ((path.split('/').filter(Boolean)[0] || 'home').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 30) || 'home')
    : /web-?design/.test(path) ? 'webdesign' : /social-media/.test(path) ? 'social' : /content-reels/.test(path) ? 'content'
    : /seo-/.test(path) ? 'seo' : /online-(werbung|ads)/.test(path) ? 'ads' : /kostenlos|free-page/.test(path) ? 'free' : 'home';
  var pagePreset = project === 'namax' ? ({ webdesign: 'website', social: 'social', content: 'content', seo: 'seo', ads: 'ads' }[page] || '') : '';

  // Shared words per language; each project adds its own roles and wishes (and "du" on FightFolio).
  var BASE = {
    de: { s3: 'Letzter Schritt', of: ' von ', step: 'Schritt ', call: 'Anruf', wa: 'WhatsApp', back: '← Zurück', close: 'Schließen', privacy: 'Datenschutz' },
    en: { s3: 'Last step', of: ' of ', step: 'Step ', call: 'Call', wa: 'WhatsApp', back: '← Back', close: 'Close', privacy: 'Privacy' },
    tr: { s3: 'Son adım', of: ' / ', step: 'Adım ', call: 'Arama', wa: 'WhatsApp', back: '← Geri', close: 'Kapat', privacy: 'Gizlilik' }
  };
  var SIE = {
    de: { who: 'Wer sind Sie?', what: 'Was brauchen Sie?', reach: 'Wie erreichen wir Sie?', phone: 'Ihre Telefonnummer', phoneOpt: 'Ihre Telefonnummer (optional)', name: 'Ihr Name (optional)',
      msg: 'Ein paar Worte (optional)', msgReq: 'Was sollen wir wissen?', how: 'Anruf oder WhatsApp?', send: 'Anfrage senden',
      fine: 'Mit dem Absenden sind Sie einverstanden, dass wir Sie zu Ihrer Anfrage kontaktieren.', err: 'Das hat nicht geklappt. Bitte prüfen Sie die Angaben oder versuchen Sie es später.',
      thanks: 'Danke! Wir melden uns, meist innerhalb eines Tages.', thanksNo: 'Danke für den Hinweis! Wir sehen ihn uns an.' },
    en: { who: 'Who are you?', what: 'What do you need?', reach: 'How can we reach you?', phone: 'Your phone number', phoneOpt: 'Your phone number (optional)', name: 'Your name (optional)',
      msg: 'A few words (optional)', msgReq: 'What should we know?', how: 'Call or WhatsApp?', send: 'Send request',
      fine: 'By sending, you agree that we contact you about your request.', err: 'That did not work. Please check your details or try again later.',
      thanks: 'Thank you! We will get back to you, usually within a day.', thanksNo: 'Thanks for letting us know! We will look into it.' },
    tr: { who: 'Siz kimsiniz?', what: 'Ne için yazıyorsunuz?', reach: 'Size nasıl ulaşalım?', phone: 'Telefon numaranız', phoneOpt: 'Telefon numaranız (isteğe bağlı)', name: 'Adınız (isteğe bağlı)',
      msg: 'Birkaç kelime (isteğe bağlı)', msgReq: 'Bilmemiz gereken nedir?', how: 'Arama mı, WhatsApp mı?', send: 'Gönder',
      fine: 'Göndererek, talebiniz için sizinle iletişime geçmemizi kabul edersiniz.', err: 'Gönderilemedi. Lütfen bilgileri kontrol edin veya daha sonra tekrar deneyin.',
      thanks: 'Teşekkürler! Genellikle bir gün içinde size dönüyoruz.', thanksNo: 'Bildiriminiz için teşekkürler! İnceleyeceğiz.' }
  };
  var DU = {
    de: { who: 'Wer bist du?', what: 'Worum geht’s?', reach: 'Wie erreichen wir dich?', phone: 'Deine Telefonnummer', phoneOpt: 'Deine Telefonnummer (optional)', name: 'Dein Name (optional)',
      msg: 'Ein paar Worte (optional)', msgReq: 'Was sollen wir wissen?', how: 'Anruf oder WhatsApp?', send: 'Anfrage senden',
      fine: 'Mit dem Absenden bist du einverstanden, dass wir dich zu deiner Anfrage kontaktieren.', err: 'Das hat nicht geklappt. Bitte prüf deine Angaben oder versuch es später.',
      thanks: 'Danke! Wir melden uns, meist innerhalb eines Tages.', thanksNo: 'Danke für den Hinweis! Wir sehen ihn uns an.' },
    en: SIE.en
  };
  var P = {
    namax: {
      langs: ['de', 'en'], words: SIE, privacy: { de: '/datenschutz#kontakt', en: '/en/datenschutz#kontakt' },
      roles: {
        de: { nosite: 'Mein Geschäft hat noch keine Website', hassite: 'Ich habe eine Website und will sie besser', misc: 'Etwas anderes' },
        en: { nosite: 'My business has no website yet', hassite: 'I have a website and want it better', misc: 'Something else' } },
      wishes: {
        de: { website: 'Website', social: 'Social Media', content: 'Content & Reels', seo: 'SEO (Google)', ads: 'Online-Werbung', advice: 'Weiß ich noch nicht, beraten Sie mich' },
        en: { website: 'Website', social: 'Social media', content: 'Content & reels', seo: 'SEO (Google)', ads: 'Online ads', advice: 'Not sure yet, advise me' } }
    },
    akiwi: {
      langs: ['de', 'en', 'tr'], words: SIE, privacy: { de: 'https://www.akiwi.at/datenschutz', en: 'https://www.akiwi.at/datenschutz', tr: 'https://www.akiwi.at/datenschutz' },
      noPhone: { guest: 1 },
      roles: {
        de: { owner: 'Ich habe ein Lokal', staff: 'Ich arbeite in einem Lokal', guest: 'Ich bin Gast' },
        en: { owner: 'I run a restaurant', staff: 'I work at a restaurant', guest: 'I am a guest' },
        tr: { owner: 'Bir işletmem var', staff: 'Bir işletmede çalışıyorum', guest: 'Misafirim' } },
      wishes: {
        de: { add: 'Lokal eintragen', fix: 'Angaben ändern', certificate: 'Halal-Zertifikat schicken', photos: 'Fotos schicken', report: 'Fehler melden', remove: 'Lokal entfernen', other: 'Etwas anderes' },
        en: { add: 'Add a restaurant', fix: 'Change details', certificate: 'Send a halal certificate', photos: 'Send photos', report: 'Report a mistake', remove: 'Remove a restaurant', other: 'Something else' },
        tr: { add: 'İşletme ekle', fix: 'Bilgileri değiştir', certificate: 'Helal sertifikası gönder', photos: 'Fotoğraf gönder', report: 'Hata bildir', remove: 'İşletmeyi kaldır', other: 'Başka bir konu' } },
      wishesFor: { guest: ['report', 'add', 'other'], owner: ['add', 'fix', 'certificate', 'photos', 'remove', 'other'], staff: ['add', 'fix', 'certificate', 'photos', 'remove', 'other'] }
    },
    fightfolio: {
      langs: ['de', 'en'], words: DU, privacy: { de: '/datenschutz', en: '/datenschutz' },
      roles: {
        de: { fighter: 'Ich bin Kämpfer/in', coach: 'Ich bin Trainer/in', gym: 'Wir sind ein Club / Gym', other: 'Etwas anderes (Veranstalter, Presse, Sponsor)' },
        en: { fighter: 'I’m a fighter', coach: 'I’m a coach', gym: 'We’re a club / gym', other: 'Something else (promoter, press, sponsor)' } },
      wishes: {
        de: { profile: 'Profil anlegen', fix: 'Angaben korrigieren', remove: 'Profil entfernen', collab: 'Zusammenarbeit', other: 'Etwas anderes' },
        en: { profile: 'Create a profile', fix: 'Correct details', remove: 'Remove a profile', collab: 'Work together', other: 'Something else' } }
    }
  }[project];
  // The language of the button's surroundings when it is clicked (Akiwi's /lokale switches DE/EN/TR on its main block).
  var W, ROLES, WISHES, built = '';

  // Class names: namax uses its own site.css, the other sites get prefixed names and the style below.
  var own = project === 'namax';
  var C = own
    ? { dlg: 'free-dlg cdlg', box: 'free-form', x: 'x', no: 'cstep', picks: 'cpicks', pick: 'cpick', link: 'linkish', form: 'cform', fld: 'fld', pills: 'pills', pill: 'pill', hp: 'hp', fine: 'fine', err: 'err', btn: 'btn btn-wa btn-lg', thanks: 'free-thanks', btn2: 'btn btn-wa' }
    : { dlg: 'nxf', box: 'nxf-box', x: 'nxf-x', no: 'nxf-no', picks: 'nxf-picks', pick: 'nxf-pick', link: 'nxf-link', form: 'nxf-form', fld: 'nxf-fld', pills: 'nxf-pills', pill: 'nxf-pill', hp: 'nxf-hp', fine: 'nxf-fine', err: 'nxf-err', btn: 'nxf-btn', thanks: 'nxf-thanks', btn2: 'nxf-btn' };
  if (!own) {
    var T = project === 'fightfolio'
      ? { bg: '#13131A', ink: '#F4F4F6', mute: '#A9A9B6', line: '#34343F', field: '#191921', acc: '#ED681F', accInk: '#0B0B10', pickBg: '#191921', r: '6px' }
      : { bg: '#FFFFFF', ink: '#141414', mute: '#55544F', line: '#141414', field: '#FFFFFF', acc: '#1F9D55', accInk: '#FFFFFF', pickBg: '#FFFFFF', r: '14px' };
    var st = document.createElement('style');
    st.textContent = 'dialog.nxf{width:min(520px,calc(100vw - 24px));max-height:calc(100dvh - 24px);padding:0;border:2px solid ' + T.line + ';border-radius:' + T.r + ';background:' + T.bg + ';color:' + T.ink + ';font-size:16px;line-height:1.45;font-family:inherit;box-shadow:0 20px 60px rgba(0,0,0,.35)}'
      + 'dialog.nxf::backdrop{background:rgba(0,0,0,.6)}.nxf-box{position:relative;display:grid;gap:16px;padding:clamp(20px,4vw,28px)}.nxf [hidden]{display:none!important}'
      + '.nxf-x{position:absolute;top:12px;right:12px;width:44px;height:44px;border:0;border-radius:50%;background:transparent;color:inherit;font-family:inherit;font-size:30px;line-height:1;cursor:pointer}'
      + '.nxf-no{margin:0 0 -10px;font-size:13px;font-weight:700;color:' + T.mute + '}.nxf h2{margin:0;padding-right:44px;font-size:clamp(24px,5vw,30px);line-height:1.15}'
      + '.nxf-picks{display:grid;gap:10px}.nxf-pick{display:block;width:100%;min-height:54px;padding:12px 16px;border:2px solid ' + T.line + ';border-radius:' + T.r + ';background:' + T.pickBg + ';color:inherit;font:inherit;font-weight:700;text-align:left;cursor:pointer}'
      + '.nxf-pick:hover,.nxf-pick:focus-visible{border-color:' + T.acc + ';outline:none;box-shadow:inset 4px 0 0 ' + T.acc + '}'
      + '.nxf-form,[data-cs="2"]{display:grid;gap:14px}.nxf-fld span{display:block;font-weight:700;font-size:15px;margin-bottom:6px}'
      + '.nxf-fld input,.nxf-fld textarea{display:block;width:100%;box-sizing:border-box;min-height:48px;padding:12px 14px;border:2px solid ' + T.line + ';border-radius:' + T.r + ';background:' + T.field + ';color:' + T.ink + ';font:inherit;font-size:17px}'
      + '.nxf-fld input:focus,.nxf-fld textarea:focus{outline:2px solid ' + T.acc + ';outline-offset:1px}'
      + '.nxf fieldset{border:0;margin:0;padding:0}.nxf legend{font-weight:700;font-size:15px;margin-bottom:6px}.nxf-pills{display:flex;gap:8px;flex-wrap:wrap}'
      + '.nxf-pill input{position:absolute;opacity:0;pointer-events:none}.nxf-pill span{display:inline-flex;align-items:center;min-height:44px;padding:0 16px;border:2px solid ' + T.line + ';border-radius:999px;font-weight:700;cursor:pointer}'
      + '.nxf-pill input:checked+span{background:' + T.acc + ';border-color:' + T.acc + ';color:' + T.accInk + '}.nxf-pill input:focus-visible+span{outline:2px solid ' + T.acc + ';outline-offset:2px}'
      + '.nxf-hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}.nxf-fine{margin:0;font-size:13px;color:' + T.mute + '}.nxf-fine a{color:inherit}'
      + '.nxf-err{margin:0;color:#E5484D;font-weight:700}.nxf-btn{justify-self:start;min-height:52px;padding:0 24px;border:0;border-radius:' + (project === 'fightfolio' ? '6px' : '999px') + ';background:' + T.acc + ';color:' + T.accInk + ';font:inherit;font-weight:800;font-size:17px;cursor:pointer}'
      + '.nxf-btn:disabled{opacity:.6}.nxf-link{justify-self:start;min-height:44px;padding:0;border:0;background:none;color:inherit;font:inherit;font-weight:700;text-decoration:underline;cursor:pointer}'
      + '.nxf-thanks{display:grid;gap:16px}.nxf-thanks p{margin:0;font-size:22px;font-weight:800;line-height:1.25}';
    document.head.appendChild(st);
  }

  // A visit on akiwi.at / fightfolio.de, counted like the venue pages on namax: only for a person (not a program-driven
  // browser, page visible, touched or scrolled after 3 s or read for 15 s), once per page load, with the entry page and
  // where the visitor came from as one word. Moving on inside the site is not a new visit. No cookie, nothing stored.
  if (!own) (function () {
    try {
      if (navigator.webdriver) return;
      var base = project === 'akiwi' ? 'akiwi.at' : 'fightfolio.de', rh = '';
      try { rh = document.referrer ? new URL(document.referrer).hostname.toLowerCase() : ''; } catch (e) { rh = '?'; }
      if (rh === base || rh.slice(-(base.length + 1)) === '.' + base) return;
      var is = function (d) { return rh === d || rh.slice(-(d.length + 1)) === '.' + d; };
      var src = !rh ? 'direct' : rh === '?' ? 'other' : /(^|\.)google\.[a-z.]+$/.test(rh) ? 'google'
        : is('bing.com') || is('duckduckgo.com') || is('ecosia.org') || /(^|\.)yahoo\.[a-z.]+$/.test(rh) ? 'bing'
        : is('facebook.com') || is('instagram.com') || is('whatsapp.com') || is('t.co') || is('tiktok.com') || is('x.com') || is('linkedin.com') ? 'social'
        : is('namax.at') ? 'namax' : 'other';
      var seen = 0, done = 0, acted = 0, path = location.pathname;
      var send = function () { if (done) return; done = 1; try { navigator.sendBeacon(api, JSON.stringify({ hit: src, path: path })); } catch (e) {} };
      ['scroll', 'pointerdown', 'keydown', 'touchstart'].forEach(function (n) { addEventListener(n, function () { acted = 1; if (seen >= 3) send(); }, { passive: true, once: true }); });
      var iv = setInterval(function () { if (done) { clearInterval(iv); return; } if (document.visibilityState === 'visible') seen += 1; if ((acted && seen >= 3) || seen >= 15) send(); }, 1000);
    } catch (e) {}
  })();

  var esc = function (t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var picks = function (k, map) {
    return '<div class="' + C.picks + '">' + Object.keys(map).map(function (v) { return '<button type="button" class="' + C.pick + '" data-k="' + k + '" data-v="' + v + '">' + esc(map[v]) + '</button>'; }).join('') + '</div>';
  };
  var dlg = document.createElement('dialog');
  dlg.className = C.dlg;
  dlg.setAttribute('aria-labelledby', 'nxf-t');
  document.body.appendChild(dlg);
  function build(l) {
  if (P.langs.indexOf(l) < 0) l = 'de';
  if (l === built) return;
  built = lang = l;
  W = Object.assign({}, BASE[l], P.words[l] || P.words.de);
  ROLES = P.roles[l] || P.roles.de; WISHES = P.wishes[l] || P.wishes.de;
  dlg.setAttribute('lang', l);
  dlg.innerHTML = '<div class="' + C.box + '"><button type="button" class="' + C.x + '" data-cclose aria-label="' + W.close + '">×</button>'
    + '<p class="' + C.no + '" data-cno></p><h2 id="nxf-t" data-ch></h2>'
    + '<div data-cs="1">' + picks('role', ROLES) + '</div>'
    + '<div data-cs="2" hidden>' + picks('wish', WISHES) + '<button type="button" class="' + C.link + '" data-cback="1">' + W.back + '</button></div>'
    + '<form data-cs="3" class="' + C.form + '" hidden novalidate>'
    + '<label class="' + C.fld + '"><span data-phl>' + W.phone + '</span><input name="phone" type="tel" inputmode="tel" autocomplete="tel" minlength="6" maxlength="20"></label>'
    + '<fieldset data-chs><legend>' + W.how + '</legend><div class="' + C.pills + '"><label class="' + C.pill + '"><input type="radio" name="channel" value="call" checked><span>' + W.call + '</span></label>'
    + '<label class="' + C.pill + '"><input type="radio" name="channel" value="whatsapp"><span>' + W.wa + '</span></label></div></fieldset>'
    + '<label class="' + C.fld + '"><span>' + W.name + '</span><input name="who" autocomplete="name" maxlength="80"></label>'
    + '<label class="' + C.fld + '"><span data-msl>' + W.msg + '</span><textarea name="text" rows="3" maxlength="500"></textarea></label>'
    + '<label class="' + C.hp + '" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label>'
    + '<p class="' + C.fine + '">' + W.fine + ' <a href="' + ((P.privacy[lang] || P.privacy.de)) + '">' + W.privacy + '</a></p>'
    + '<p class="' + C.err + '" role="alert" hidden>' + W.err + '</p>'
    + '<button type="submit" class="' + C.btn + '">' + W.send + '</button><button type="button" class="' + C.link + '" data-cback="back">' + W.back + '</button></form>'
    + '<div data-cs="4" class="' + C.thanks + '" hidden><p data-thx></p><button type="button" class="' + C.btn2 + '" data-cclose>' + W.close + '</button></div></div>';
  }
  build(lang);

  var A = {}, preset = {}, cur = 0, sent = 0, E = {}, total = 3;
  function post(body, beacon) {
    body.page = page;
    var s = JSON.stringify(body);
    // text/plain needs no permission question first; the server reads the body as JSON either way.
    if (beacon && navigator.sendBeacon) { try { navigator.sendBeacon(api, s); } catch (e) {} return null; }
    return fetch(api, { method: 'POST', headers: { 'content-type': 'text/plain;charset=UTF-8' }, body: s, mode: own ? 'same-origin' : 'cors', credentials: own ? 'same-origin' : 'omit' });
  }
  function ev(w) { if (E[w]) return; E[w] = 1; post({ ev: w }, true); }
  var noPhone = function () { return Boolean(P.noPhone && P.noPhone[A.role]); };
  function showWishes() {
    var allow = P.wishesFor && P.wishesFor[A.role];
    var bs = dlg.querySelectorAll('[data-k=wish]');
    for (var i = 0; i < bs.length; i++) bs[i].hidden = Boolean(allow) && allow.indexOf(bs[i].getAttribute('data-v')) < 0;
  }
  function step(n) {
    cur = n;
    if (n === 2 || n === 3) ev('step:' + n);
    if (n === 2) showWishes();
    if (n === 3) {
      var opt = noPhone(), f = dlg.querySelector('form');
      f.querySelector('[data-phl]').textContent = opt ? W.phoneOpt : W.phone;
      f.querySelector('[data-msl]').textContent = opt ? W.msgReq : W.msg;
      f.querySelector('[data-chs]').hidden = opt;
    }
    var all = dlg.querySelectorAll('[data-cs]');
    for (var i = 0; i < all.length; i++) all[i].hidden = all[i].getAttribute('data-cs') !== String(n);
    var idx = n === 1 ? 1 : n === 2 ? (preset.role ? 1 : 2) : 0;
    dlg.querySelector('[data-cno]').textContent = n === 3 ? W.s3 : n === 4 ? '' : W.step + idx + W.of + total;
    dlg.querySelector('[data-ch]').textContent = n === 1 ? W.who : n === 2 ? W.what : n === 3 ? W.reach : '';
    if (n === 4) dlg.querySelector('[data-thx]').textContent = noPhone() && !dlg.querySelector('[name=phone]').value ? W.thanksNo : W.thanks;
    var ph = n === 3 ? dlg.querySelector('[name=phone]') : null;
    if (ph) setTimeout(function () { ph.focus(); }, 30);
  }
  function next() { step(!A.role ? 1 : !A.wish ? 2 : 3); }
  function closed() { if (!sent && cur >= 1 && cur <= 3) ev('close:' + cur); }
  dlg.addEventListener('close', closed);
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-contact],[data-cclose],[data-k],[data-cback]');
    if (!t) return;
    if (t.hasAttribute('data-contact')) {
      e.preventDefault();
      var near = t.closest('[lang]');
      build(((t.getAttribute('data-lang') || (near && near.getAttribute('lang')) || lang) + '').slice(0, 2).toLowerCase());
      var r = t.getAttribute('data-role'), w = t.getAttribute('data-wish') || pagePreset;
      preset = { role: r && ROLES[r] ? r : '', wish: w && WISHES[w] ? w : '' };
      // data-text: ready text from the page itself (Akiwi's entry form sends its list of corrections this way).
      A = { role: preset.role, wish: preset.wish, topic: t.getAttribute('data-topic') || '', extra: (t.getAttribute('data-text') || '').slice(0, 1200) };
      sent = 0;
      total = 3 - (preset.role ? 1 : 0) - (preset.wish ? 1 : 0);
      dlg.querySelector('[data-cs="3"] [role=alert]').hidden = true;
      ev('open:' + ((t.getAttribute('data-contact') || 'hero').replace(/[^a-z]/g, '').slice(0, 12) || 'hero'));
      next();
      if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
      return;
    }
    if (t.hasAttribute('data-cclose')) { if (dlg.close) dlg.close(); else { dlg.removeAttribute('open'); closed(); } return; }
    if (t.hasAttribute('data-cback')) {
      var b = t.getAttribute('data-cback');
      if (b === 'back') { if (!preset.wish) { A.wish = ''; step(2); } else if (!preset.role) { A.role = ''; step(1); } return; }
      A.role = preset.role; step(1); return;
    }
    var k = t.getAttribute('data-k');
    A[k] = t.getAttribute('data-v');
    // A wish preset from the button may not fit the role picked (a guest cannot remove a restaurant): ask again then.
    if (k === 'role' && A.wish && P.wishesFor && P.wishesFor[A.role] && P.wishesFor[A.role].indexOf(A.wish) < 0) A.wish = '';
    ev(k + ':' + A[k]);
    next();
  });
  dlg.addEventListener('submit', function (e) {
    e.preventDefault();
    var form = e.target;
    var btn = form.querySelector('[type=submit]'), err = form.querySelector('[role=alert]'), q = function (n) { return form.querySelector('[name=' + n + ']').value; };
    var ch = form.querySelector('[name=channel]:checked'), digits = q('phone').replace(/\D/g, '').length;
    var text = (q('text').trim() + (A.extra ? '\n\n' + A.extra : '')).trim();
    var ok = noPhone() ? (digits === 0 || digits >= 6) && (digits >= 6 || text.length >= 3) : digits >= 6;
    if (!ok) { err.hidden = false; form.querySelector(digits || !noPhone() ? '[name=phone]' : '[name=text]').focus(); return; }
    btn.disabled = true; err.hidden = true;
    post({ role: A.role, wish: A.wish, channel: ch ? ch.value : 'call', name: q('who'), phone: q('phone'), text: text, topic: A.topic, website: q('website') })
      .then(function (r) { if (!r.ok) throw new Error(String(r.status)); sent = 1; btn.disabled = false; step(4); form.reset(); })
      .catch(function () { btn.disabled = false; err.hidden = false; ev('fail'); });
  });
})();
