// Contact form on namax.at's own pages: every [data-contact] button opens it (without JS the button is a mailto link).
// Step 1 who you are, step 2 what you need (skipped on a service page, which already says it), step 3 how to reach you.
// The steps are counted per page and day without anything typed (api/venue/contact, { ev, page }); the request itself
// goes to the same list as the owner requests of the venue pages.
(function () {
  var en = document.documentElement.lang === 'en';
  var path = location.pathname;
  var page = /web-?design/.test(path) ? 'webdesign' : /social-media/.test(path) ? 'social' : /content-reels/.test(path) ? 'content'
    : /seo-/.test(path) ? 'seo' : /online-(werbung|ads)/.test(path) ? 'ads' : /kostenlos|free-page/.test(path) ? 'free' : 'home';
  var preset = { webdesign: 'website', social: 'social', content: 'content', seo: 'seo', ads: 'ads' }[page] || '';
  var L = en ? {
    title: 'Send a request', s1: 'Step 1 of 3', s1of2: 'Step 1 of 2', s2: 'Step 2 of 3', s3: 'Last step', who: 'Who are you?', what: 'What do you need?', reach: 'How can we reach you?',
    role: { nosite: 'My business has no website yet', hassite: 'I have a website and want it better', misc: 'Something else' },
    wish: { website: 'Website', social: 'Social media', content: 'Content & reels', seo: 'SEO (Google)', ads: 'Online ads', advice: 'Not sure yet, advise me' },
    phone: 'Your phone number', name: 'Your name (optional)', msg: 'A few words (optional)', how: 'Call or WhatsApp?', call: 'Call me', wa: 'WhatsApp',
    fine: 'By sending, you agree that we contact you about your request.', privacy: 'Privacy', back: '← Back', send: 'Send request',
    err: 'That did not work. Please check the number or try again later.', thanks: 'Thank you! We will get back to you, usually within a day.', close: 'Close'
  } : {
    title: 'Anfrage senden', s1: 'Schritt 1 von 3', s1of2: 'Schritt 1 von 2', s2: 'Schritt 2 von 3', s3: 'Letzter Schritt', who: 'Wer sind Sie?', what: 'Was brauchen Sie?', reach: 'Wie erreichen wir Sie?',
    role: { nosite: 'Mein Geschäft hat noch keine Website', hassite: 'Ich habe eine Website und will sie besser', misc: 'Etwas anderes' },
    wish: { website: 'Website', social: 'Social Media', content: 'Content & Reels', seo: 'SEO (Google)', ads: 'Online-Werbung', advice: 'Weiß ich noch nicht, beraten Sie mich' },
    phone: 'Ihre Telefonnummer', name: 'Ihr Name (optional)', msg: 'Ein paar Worte (optional)', how: 'Anruf oder WhatsApp?', call: 'Anruf', wa: 'WhatsApp',
    fine: 'Mit dem Absenden sind Sie einverstanden, dass wir Sie zu Ihrer Anfrage kontaktieren.', privacy: 'Datenschutz', back: '← Zurück', send: 'Anfrage senden',
    err: 'Das hat nicht geklappt. Bitte prüfen Sie die Nummer oder versuchen Sie es später.', thanks: 'Danke! Wir melden uns, meist innerhalb eines Tages.', close: 'Schließen'
  };
  var picks = function (k, list) {
    return '<div class="cpicks">' + list.map(function (v) { return '<button type="button" class="cpick" data-k="' + k + '" data-v="' + v + '">' + L[k][v] + '</button>'; }).join('') + '</div>';
  };
  var dlg = document.createElement('dialog');
  dlg.className = 'free-dlg cdlg';
  dlg.setAttribute('aria-labelledby', 'cdlg-t');
  dlg.innerHTML = '<div class="free-form"><button type="button" class="x" data-cclose aria-label="' + L.close + '">×</button>'
    + '<p class="cstep" data-cno></p><h2 id="cdlg-t" data-ch></h2>'
    + '<div data-cs="1">' + picks('role', ['nosite', 'hassite', 'misc']) + '</div>'
    + '<div data-cs="2" hidden>' + picks('wish', ['website', 'social', 'content', 'seo', 'ads', 'advice']) + '<button type="button" class="linkish" data-cback="1">' + L.back + '</button></div>'
    + '<form data-cs="3" class="cform" hidden novalidate>'
    + '<label class="fld"><span>' + L.phone + '</span><input name="phone" type="tel" inputmode="tel" autocomplete="tel" required minlength="6" maxlength="20"></label>'
    + '<fieldset><legend>' + L.how + '</legend><div class="pills"><label class="pill"><input type="radio" name="channel" value="call" checked><span>' + L.call + '</span></label>'
    + '<label class="pill"><input type="radio" name="channel" value="whatsapp"><span>' + L.wa + '</span></label></div></fieldset>'
    + '<label class="fld"><span>' + L.name + '</span><input name="who" autocomplete="name" maxlength="80"></label>'
    + '<label class="fld"><span>' + L.msg + '</span><textarea name="text" rows="3" maxlength="500"></textarea></label>'
    + '<label class="hp" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label>'
    + '<p class="fine">' + L.fine + ' <a href="' + (en ? '/en/datenschutz' : '/datenschutz') + '#kontakt">' + L.privacy + '</a></p>'
    + '<p class="err" role="alert" hidden>' + L.err + '</p>'
    + '<button type="submit" class="btn btn-wa btn-lg">' + L.send + '</button><button type="button" class="linkish" data-cback="back">' + L.back + '</button></form>'
    + '<div data-cs="4" class="free-thanks" hidden><p>' + L.thanks + '</p><button type="button" class="btn btn-wa" data-cclose>' + L.close + '</button></div></div>';
  document.body.appendChild(dlg);

  var A = {}, cur = 0, sent = 0, E = {};
  function post(body, beacon) {
    body.page = page;
    var s = JSON.stringify(body);
    if (beacon && navigator.sendBeacon) { try { navigator.sendBeacon('/api/venue/contact', s); } catch (e) {} return null; }
    return fetch('/api/venue/contact', { method: 'POST', headers: { 'content-type': 'application/json' }, body: s });
  }
  function ev(w) { if (E[w]) return; E[w] = 1; post({ ev: w }, true); }
  function step(n) {
    cur = n;
    if (n === 2 || n === 3) ev('step:' + n);
    var all = dlg.querySelectorAll('[data-cs]');
    for (var i = 0; i < all.length; i++) all[i].hidden = all[i].getAttribute('data-cs') !== String(n);
    dlg.querySelector('[data-cno]').textContent = n === 1 ? (preset ? L.s1of2 : L.s1) : n === 2 ? L.s2 : n === 3 ? L.s3 : '';
    dlg.querySelector('[data-ch]').textContent = n === 1 ? L.who : n === 2 ? L.what : n === 3 ? L.reach : L.title;
    var f = n === 3 ? dlg.querySelector('[name=phone]') : null;
    if (f) setTimeout(function () { f.focus(); }, 30);
  }
  function closed() { if (!sent && cur >= 1 && cur <= 3) ev('close:' + cur); }
  dlg.addEventListener('close', closed);
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-contact],[data-cclose],[data-k],[data-cback]');
    if (!t) return;
    if (t.hasAttribute('data-contact')) {
      e.preventDefault();
      A = { wish: preset }; sent = 0;
      dlg.querySelector('.err').hidden = true;
      ev('open:' + (t.getAttribute('data-contact') || 'hero'));
      step(1);
      if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
      return;
    }
    if (t.hasAttribute('data-cclose')) { if (dlg.close) dlg.close(); else { dlg.removeAttribute('open'); closed(); } return; }
    if (t.hasAttribute('data-cback')) { var b = t.getAttribute('data-cback'); step(b === 'back' ? (preset ? 1 : 2) : Number(b)); return; }
    var k = t.getAttribute('data-k');
    A[k] = t.getAttribute('data-v');
    ev(k + ':' + A[k]);
    step(k === 'role' && !preset ? 2 : 3);
  });
  var form = dlg.querySelector('form');
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = form.querySelector('[type=submit]'), err = form.querySelector('.err'), q = function (n) { return form.querySelector('[name=' + n + ']').value; };
    var ch = form.querySelector('[name=channel]:checked');
    if (q('phone').replace(/\D/g, '').length < 6) { err.hidden = false; form.querySelector('[name=phone]').focus(); return; }
    btn.disabled = true; err.hidden = true;
    post({ role: A.role, wish: A.wish || 'advice', channel: ch ? ch.value : 'call', name: q('who'), phone: q('phone'), text: q('text'), website: q('website') })
      .then(function (r) { if (!r.ok) throw new Error(String(r.status)); sent = 1; btn.disabled = false; form.reset(); step(4); })
      .catch(function () { btn.disabled = false; err.hidden = false; ev('fail'); });
  });
})();
