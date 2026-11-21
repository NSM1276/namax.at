// Nasim's private list of all venue pages: www.namax.at/liste?k=<admin key>.
// The admin key itself is never stored: the code keeps its SHA-256, the key lives in Nasim's bookmark and in .env.local.
// Owner keys are sealed with AES-256-GCM under a key derived from the admin key, bound to the venue slug,
// so the database alone does not reveal any owner link.
import { createHash, createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';
import { esc } from './template.mjs';

export const ADMIN_KEY_HASH = 'a28eb7d5cdee0e94cd6f950753cbd6614a7ef3425cd1e825708706bc072cc6e9';

const sha256 = (s) => createHash('sha256').update(String(s)).digest();
const sealKey = (adminKey) => sha256('namax owner keys v1:' + adminKey);

export function isAdmin(key, hashHex = ADMIN_KEY_HASH) {
  if (typeof key !== 'string' || !/^[0-9a-f]{32}$/.test(key) || !/^[0-9a-f]{64}$/.test(hashHex)) return false;
  return timingSafeEqual(sha256(key), Buffer.from(hashHex, 'hex'));
}

/** → base64url(iv | tag | ciphertext); the slug is authenticated, so a sealed key cannot be moved to another venue. */
export function sealOwnerKey(adminKey, slug, ownerKey) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', sealKey(adminKey), iv);
  c.setAAD(Buffer.from(slug));
  const ct = Buffer.concat([c.update(ownerKey, 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64url');
}

/** → owner key, or null when the admin key, the slug or the data do not match. */
export function openOwnerKey(adminKey, slug, enc) {
  try {
    const b = Buffer.from(String(enc), 'base64url');
    if (b.length < 29) return null;
    const d = createDecipheriv('aes-256-gcm', sealKey(adminKey), b.subarray(0, 12));
    d.setAAD(Buffer.from(slug));
    d.setAuthTag(b.subarray(12, 28));
    return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
  } catch { return null; }
}

const KIND_DE = { friseur: 'Friseur', cafe: 'Café', restaurant: 'Restaurant', imbiss: 'Imbiss', handy: 'Handyreparatur',
  kosmetik: 'Kosmetik', nails: 'Nagelstudio', schneider: 'Schneiderei' };
const kindDe = (k) => KIND_DE[k] || k;

/** rows: [{ slug, name, kind, street, district, status, confirmed, ownerUrl|null }] → HTML (German, phone first). */
export function renderAdmin(rows) {
  const kinds = [...new Set(rows.map((r) => r.kind))].sort((a, b) => kindDe(a).localeCompare(kindDe(b), 'de'));
  const districts = [...new Set(rows.map((r) => r.district).filter(Boolean))].sort((a, b) => a - b);
  const items = rows.map((r) => {
    const page = `https://${r.slug}.namax.at/`;
    const badges = (r.status === 'hidden' ? '<span class="b">versteckt</span>' : '') + (r.confirmed ? '<span class="b ok">bestätigt</span>' : '');
    const o = r.ownerUrl || '';
    const owner = `<div class="a o" data-orow${o ? '' : ' data-none'}><span class="lab">Für den Inhaber</span>`
      + `<span class="no">kein Link</span>`
      + `<button type="button" class="has" data-copy="${esc(o)}">Link</button>`
      + `<button type="button" class="has" data-qr="${esc(o)}" data-owner>QR</button>`
      + `<a class="has" href="${o ? 'https://wa.me/?text=' + encodeURIComponent(o) : '#'}" data-wa rel="noopener">WhatsApp</a>`
      + `<button type="button" class="rot" data-rotate="${esc(r.slug)}">Neuer Link</button></div>`;
    const q = `${r.name} ${r.street} ${r.slug}`.toLowerCase();
    return `<li data-q="${esc(q)}" data-kind="${esc(r.kind)}" data-d="${esc(r.district || '')}" data-name="${esc(r.name)}"><b>${esc(r.name)}</b>${badges}
<small>${esc(kindDe(r.kind))} · ${esc(r.street)}${r.district ? ` · ${esc(r.district)}. Bezirk` : ''}</small>
<div class="a"><a class="pg" href="${esc(page)}" target="_blank" rel="noopener">Seite</a><button type="button" data-qr="${esc(page)}">QR</button><button type="button" data-share="${esc(page)}">Teilen</button></div>
${owner}</li>`;
  }).join('\n');
  const chips = ['<button type="button" class="on" data-k="">Alle</button>', ...kinds.map((k) => `<button type="button" data-k="${esc(k)}">${esc(kindDe(k))}</button>`)].join('');
  const dsel = districts.length > 1
    ? `<select data-dsel aria-label="Bezirk"><option value="">Alle Bezirke</option>${districts.map((d) => `<option value="${d}">${d}. Bezirk</option>`).join('')}</select>` : '';
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>namax · Liste</title><meta name="theme-color" content="#111">
<style>*{box-sizing:border-box}body{margin:0;font:16px/1.4 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;background:#f4f3ef;color:#111}
header{position:sticky;top:0;z-index:2;background:#111;color:#fff;padding:12px 14px 10px}
h1{margin:0 0 8px;font-size:18px}h1 span{opacity:.7;font-weight:400}
input[type=search]{width:100%;font:inherit;font-size:17px;padding:12px;border:0;border-radius:8px}
.f{display:flex;gap:6px;overflow-x:auto;padding:8px 0 2px;-webkit-overflow-scrolling:touch}
.f button,select{flex:none;font:inherit;font-size:14px;padding:7px 12px;border-radius:999px;border:1px solid #555;background:#222;color:#fff}
.f button.on{background:#ffc93c;color:#111;border-color:#ffc93c}select{margin-top:8px;width:100%;border-radius:8px}
ul{list-style:none;margin:0;padding:8px 10px 40px;max-width:760px;margin:0 auto}
li{background:#fff;border-radius:10px;padding:12px;margin:8px 0;box-shadow:0 1px 2px rgba(0,0,0,.08)}
li b{font-size:17px}li small{display:block;color:#555;margin-top:2px}
.b{display:inline-block;margin-left:8px;font-size:12px;padding:2px 8px;border-radius:999px;background:#eee;vertical-align:2px}.b.ok{background:#d8f3dc}
.a{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.a a,.a button{font:inherit;font-size:15px;font-weight:600;min-height:42px;padding:9px 14px;border-radius:8px;border:1px solid #111;background:#fff;color:#111;text-decoration:none}
.a a.pg{background:#111;color:#fff}.no{font-size:13px;color:#888;align-self:center}
.o{margin-top:8px;padding-top:8px;border-top:1px dashed #ccc;align-items:center}.lab{font-size:13px;color:#555;width:100%}
.o[data-none] .has{display:none}.o:not([data-none]) .no{display:none}.a .rot{border-color:#bbb;color:#555;font-weight:500}
.empty{text-align:center;color:#666;padding:30px}
#qr{position:fixed;inset:0;z-index:9;background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;text-align:center}
#qr[hidden]{display:none}#qr svg{width:min(86vw,62vh);height:auto}#qr b{font-size:20px;margin:14px 0 4px}#qr p{margin:2px 0;color:#555}
#qr .warn{color:#b00020;font-weight:700}#qr small{margin-top:18px;color:#888}</style></head><body>
<header><h1>namax · Liste <span data-count>${rows.length}</span></h1>
<input type="search" placeholder="Name oder Straße" aria-label="Suche" autocomplete="off">
<div class="f" role="group" aria-label="Art">${chips}</div>${dsel}</header>
<ul>${items}</ul><p class="empty" hidden>Nichts gefunden</p>
<div id="qr" hidden role="dialog" aria-label="QR-Code"></div>
<script src="/js/qrcode.js"></script>
<script>(function(){var ov=document.getElementById('qr');
function svg(t){var q=qrcode(0,'M');q.addData(t);q.make();var n=q.getModuleCount(),m=4,p='';for(var r=0;r<n;r++)for(var c=0;c<n;c++)if(q.isDark(r,c))p+='M'+(c+m)+' '+(r+m)+'h1v1h-1z';
return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+(n+2*m)+' '+(n+2*m)+'" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="'+p+'" fill="#000"/></svg>'}
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function showQr(url,name,owner){ov.innerHTML=svg(url)+'<b>'+esc(name)+'</b>'+(owner?'<p class="warn">Nur für den Inhaber. Nicht aufhängen.</p><p>Öffnet die Verwaltung der Seite.</p>':'<p>Mit der Handykamera scannen</p>')+'<small>Tippen zum Schließen</small>';ov.hidden=false}
ov.addEventListener('click',function(){ov.hidden=true;ov.innerHTML=''});
function copy(b,t){var done=function(){var o=b.textContent;b.textContent='Kopiert ✓';setTimeout(function(){b.textContent=o},1500)};
if(navigator.clipboard)navigator.clipboard.writeText(t).then(done,function(){prompt('Kopieren:',t)});else prompt('Kopieren:',t)}
function setOwner(row,url){row.removeAttribute('data-none');row.querySelector('[data-copy]').dataset.copy=url;row.querySelector('[data-qr]').dataset.qr=url;row.querySelector('[data-wa]').href='https://wa.me/?text='+encodeURIComponent(url)}
document.addEventListener('click',function(e){var li=e.target.closest('li'),name=li?li.dataset.name:'';
var x=e.target.closest('[data-qr]');if(x){showQr(x.dataset.qr,name,x.hasAttribute('data-owner'));return}
x=e.target.closest('[data-share]');if(x){var u=x.dataset.share;if(navigator.share)navigator.share({title:name,url:u}).catch(function(){});else copy(x,u);return}
x=e.target.closest('[data-copy]');if(x){copy(x,x.dataset.copy);return}
x=e.target.closest('[data-rotate]');if(x){if(!confirm('Neuen Link für „'+name+'“ erstellen? Der alte Inhaber-Link funktioniert dann nicht mehr.'))return;
var k=new URLSearchParams(location.search).get('k'),o=x.textContent;x.disabled=true;x.textContent='…';
fetch(location.pathname,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({k:k,slug:x.dataset.rotate})})
.then(function(r){if(!r.ok)throw 0;return r.json()}).then(function(j){setOwner(x.closest('[data-orow]'),j.ownerUrl);x.textContent='Fertig ✓';setTimeout(function(){x.textContent=o;x.disabled=false},2000)},
function(){x.textContent=o;x.disabled=false;alert('Hat nicht geklappt. Bitte nochmal versuchen.')})}});})();</script>
<script>(function(){var q='',k='',d='',lis=[].slice.call(document.querySelectorAll('li')),cnt=document.querySelector('[data-count]'),empty=document.querySelector('.empty');
function run(){var n=0;for(var i=0;i<lis.length;i++){var l=lis[i],ok=(!q||l.dataset.q.indexOf(q)>=0)&&(!k||l.dataset.kind===k)&&(!d||l.dataset.d===d);l.hidden=!ok;if(ok)n++}cnt.textContent=n;empty.hidden=n>0}
document.querySelector('input[type=search]').addEventListener('input',function(e){q=e.target.value.trim().toLowerCase();run()});
var sel=document.querySelector('[data-dsel]');if(sel)sel.addEventListener('change',function(){d=sel.value;run()});
document.addEventListener('click',function(e){var c=e.target.closest('[data-k]');if(c){k=c.dataset.k;[].forEach.call(document.querySelectorAll('[data-k]'),function(b){b.className=b===c?'on':''});run()}});})();</script>
</body></html>`;
}
