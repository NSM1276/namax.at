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

const KIND_RU = { friseur: 'Парикмахерская', cafe: 'Кафе', restaurant: 'Ресторан', imbiss: 'Закусочная', handy: 'Ремонт телефонов',
  kosmetik: 'Косметика', nails: 'Ногти', schneider: 'Портной' };
const kindRu = (k) => KIND_RU[k] || k;

/** rows: [{ slug, name, kind, street, district, status, confirmed, ownerUrl|null }] → HTML (Russian, phone first). */
export function renderAdmin(rows) {
  const kinds = [...new Set(rows.map((r) => r.kind))].sort((a, b) => kindRu(a).localeCompare(kindRu(b), 'ru'));
  const districts = [...new Set(rows.map((r) => r.district).filter(Boolean))].sort((a, b) => a - b);
  const items = rows.map((r) => {
    const page = `https://${r.slug}.namax.at/`;
    const badges = (r.status === 'hidden' ? '<span class="b">скрыта</span>' : '') + (r.confirmed ? '<span class="b ok">подтверждена</span>' : '');
    const owner = r.ownerUrl
      ? `<button type="button" data-copy="${esc(r.ownerUrl)}">Ссылка владельца</button><a href="https://wa.me/?text=${encodeURIComponent(r.ownerUrl)}" rel="noopener">WhatsApp</a>`
      : '<span class="no">нет ссылки владельца</span>';
    const q = `${r.name} ${r.street} ${r.slug}`.toLowerCase();
    return `<li data-q="${esc(q)}" data-kind="${esc(r.kind)}" data-d="${esc(r.district || '')}"><b>${esc(r.name)}</b>${badges}
<small>${esc(kindRu(r.kind))} · ${esc(r.street)}${r.district ? ` · ${esc(r.district)}. Bezirk` : ''}</small>
<div class="a"><a href="${esc(page)}" target="_blank" rel="noopener">Страница</a>${owner}</div></li>`;
  }).join('\n');
  const chips = ['<button type="button" class="on" data-k="">Все</button>', ...kinds.map((k) => `<button type="button" data-k="${esc(k)}">${esc(kindRu(k))}</button>`)].join('');
  const dsel = districts.length > 1
    ? `<select data-dsel aria-label="Район"><option value="">Все районы</option>${districts.map((d) => `<option value="${d}">${d}. Bezirk</option>`).join('')}</select>` : '';
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>namax · список</title><meta name="theme-color" content="#111">
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
.a a:first-child{background:#111;color:#fff}.no{font-size:13px;color:#888;align-self:center}
.empty{text-align:center;color:#666;padding:30px}</style></head><body>
<header><h1>namax · список <span data-count>${rows.length}</span></h1>
<input type="search" placeholder="Название или улица" aria-label="Поиск" autocomplete="off">
<div class="f" role="group" aria-label="Вид">${chips}</div>${dsel}</header>
<ul>${items}</ul><p class="empty" hidden>Ничего не найдено</p>
<script>(function(){var q='',k='',d='',lis=[].slice.call(document.querySelectorAll('li')),cnt=document.querySelector('[data-count]'),empty=document.querySelector('.empty');
function run(){var n=0;for(var i=0;i<lis.length;i++){var l=lis[i],ok=(!q||l.dataset.q.indexOf(q)>=0)&&(!k||l.dataset.kind===k)&&(!d||l.dataset.d===d);l.hidden=!ok;if(ok)n++}cnt.textContent=n;empty.hidden=n>0}
document.querySelector('input[type=search]').addEventListener('input',function(e){q=e.target.value.trim().toLowerCase();run()});
var sel=document.querySelector('[data-dsel]');if(sel)sel.addEventListener('change',function(){d=sel.value;run()});
document.addEventListener('click',function(e){var c=e.target.closest('[data-k]');if(c){k=c.dataset.k;[].forEach.call(document.querySelectorAll('[data-k]'),function(b){b.className=b===c?'on':''});run();return}
var b=e.target.closest('[data-copy]');if(b){var t=b.dataset.copy,done=function(){var o=b.textContent;b.textContent='Скопировано ✓';setTimeout(function(){b.textContent=o},1500)};
if(navigator.clipboard)navigator.clipboard.writeText(t).then(done,function(){prompt('Скопируй:',t)});else prompt('Скопируй:',t)}});})();</script>
</body></html>`;
}
