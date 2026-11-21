// The owner chat panel, added to the page only when the request carries the owner's key.
// ownerPanel({ venue }) → { html, css, script }. The key is read by the browser from the address bar;
// it is never written into the HTML.
import { PHRASES, LANGS, RTL } from './phrases.mjs';
import { esc } from './template.mjs';

const UI_KEYS = ['bar', 'ui_chat', 'ui_send', 'ui_placeholder', 'ui_close', 'ui_photo', 'f_closed', 'f_save', 'f_from', 'f_to',
  'c_delete', 'error', 'limitDay', 'days'];
const UI = Object.fromEntries(LANGS.map((l) => [l, Object.fromEntries(UI_KEYS.map((k) => [k, PHRASES[l][k]]))]));
const safeJson = (x) => JSON.stringify(x).replace(/</g, '\\u003c').replace(/[\u2028\u2029]/g, '');

const CSS = `body.has-owner{padding-bottom:120px}
.ob{position:fixed;left:0;right:0;bottom:0;z-index:20;background:#111;color:#fff;padding:12px 16px calc(12px + env(safe-area-inset-bottom));box-shadow:0 -6px 24px rgba(0,0,0,.25);font:16px/1.4 system-ui,sans-serif}
.ob p{margin:0 0 10px;font-size:15px;opacity:.9}
.ob button{width:100%;min-height:56px;border:0;border-radius:6px;background:#ffc93c;color:#111;font:800 20px/1 system-ui,sans-serif;cursor:pointer}
.oc{position:fixed;inset:auto 0 0 0;z-index:30;height:min(88vh,720px);display:flex;flex-direction:column;background:#fff;color:#111;border-radius:14px 14px 0 0;box-shadow:0 -10px 40px rgba(0,0,0,.35);font:17px/1.45 system-ui,sans-serif}
.oc[hidden]{display:none}
@media(min-width:720px){.oc{left:auto;right:24px;bottom:24px;width:420px;border-radius:14px}}
.oc header{display:flex;align-items:center;justify-content:space-between;padding:8px 8px 8px 16px;border-bottom:1px solid #e6e4de}
.oc header strong{font-size:17px}
.oc .x{min-width:44px;min-height:44px;border:0;background:none;font-size:26px;line-height:1;cursor:pointer;color:#111}
.ol{flex:1;overflow-y:auto;padding:12px 14px;display:flex;flex-direction:column;gap:8px;overscroll-behavior:contain}
.m{max-width:88%;padding:10px 12px;border-radius:12px;white-space:pre-line;overflow-wrap:anywhere}
.m.b{align-self:flex-start;background:#f1f0ec}
.m.o{align-self:flex-end;background:#111;color:#fff}
.chips{display:flex;flex-wrap:wrap;gap:8px;padding:4px 0}
.chips button,.chips a{min-height:44px;padding:0 14px;border:1.5px solid #111;border-radius:22px;background:#fff;color:#111;font:600 16px/1 system-ui,sans-serif;display:inline-flex;align-items:center;text-decoration:none;cursor:pointer}
.chips a{background:#25d366;border-color:#25d366;color:#fff}
.of{display:grid;gap:8px;padding:10px;border:1px solid #e6e4de;border-radius:12px}
.of .d{display:grid;grid-template-columns:7.5em 1fr 1fr;gap:6px;align-items:center}
.of label{font-size:15px}
.of input[type=time],.of input[type=tel]{min-height:44px;font:16px system-ui,sans-serif;padding:0 6px;border:1px solid #bbb;border-radius:6px;min-width:0}
.of .cl{grid-column:2/4;display:flex;align-items:center;gap:6px;min-height:32px}
.of .cl input{width:22px;height:22px}
.of .s{min-height:48px;border:0;border-radius:8px;background:#111;color:#fff;font:700 17px system-ui,sans-serif;cursor:pointer}
.of input[type=file]{min-height:44px;font-size:16px}
.ow{display:flex;gap:8px;padding:10px 12px calc(10px + env(safe-area-inset-bottom));border-top:1px solid #e6e4de}
.ow input{flex:1;min-width:0;min-height:48px;padding:0 12px;border:1px solid #bbb;border-radius:24px;font:16px system-ui,sans-serif}
.ow button{min-width:48px;min-height:48px;border:0;border-radius:24px;background:#111;color:#fff;font:700 16px system-ui,sans-serif;padding:0 14px;cursor:pointer}
.od{padding:0 14px 8px;text-align:center}
.od button{min-height:44px;border:0;background:none;color:#8a1c1c;text-decoration:underline;font:15px system-ui,sans-serif;cursor:pointer}
.busy{opacity:.6;pointer-events:none}`;

function client(ui, rtl, hours, phone) {
  return `(function(){
var K=new URLSearchParams(location.search).get('k')||'';
var U=${safeJson(ui)},RTL=${safeJson(rtl)},H=${safeJson(hours)},P=${safeJson(phone)};
var lang='de',started=false,changed=false;
var bar=document.querySelector('[data-ob]'),box=document.querySelector('[data-oc]'),list=box.querySelector('.ol'),
  inp=box.querySelector('.ow input'),sendB=box.querySelector('.ow button'),closeB=box.querySelector('.x'),delB=box.querySelector('.od button');
function t(k){return (U[lang]||U.de)[k]}
function labels(){box.setAttribute('dir',RTL.indexOf(lang)>=0?'rtl':'ltr');box.setAttribute('lang',lang);
  inp.placeholder=t('ui_placeholder');sendB.textContent=t('ui_send');closeB.setAttribute('aria-label',t('ui_close'));delB.textContent=t('c_delete');
  box.querySelector('header strong').textContent=t('ui_chat')}
function el(tag,cls,text){var e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e}
function bubble(text,who){var m=el('div','m '+who,text);m.setAttribute('dir','auto');list.appendChild(m);list.scrollTop=list.scrollHeight;return m}
function clearInteractive(){var x=list.querySelectorAll('.chips,.of');for(var i=0;i<x.length;i++)x[i].remove()}
function mm(v){if(!v)return null;var p=v.split(':');return Number(p[0])*60+Number(p[1])}
function hh(m){if(m==null)return '';m=m%1440;return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0')}
function hoursForm(){var f=el('form','of'),order=[1,2,3,4,5,6,0],days=t('days');
  order.forEach(function(d){var row=el('div','d'),h=H&&H[d];
    var lab=el('label',null,days[d]);var o=el('input');o.type='time';o.value=h?hh(h[0]):'';o.setAttribute('aria-label',days[d]+' '+t('f_from'));
    var c=el('input');c.type='time';c.value=h?hh(h[1]):'';c.setAttribute('aria-label',days[d]+' '+t('f_to'));
    var cl=el('label','cl');var cb=el('input');cb.type='checkbox';cb.checked=!h;cl.appendChild(cb);cl.appendChild(document.createTextNode(t('f_closed')));
    cb.onchange=function(){o.disabled=c.disabled=cb.checked};o.disabled=c.disabled=cb.checked;
    row.dataset.day=d;row.appendChild(lab);row.appendChild(o);row.appendChild(c);row.appendChild(cl);f.appendChild(row)});
  var s=el('button','s',t('f_save'));s.type='submit';f.appendChild(s);
  f.onsubmit=function(e){e.preventDefault();var v=[null,null,null,null,null,null,null];
    f.querySelectorAll('.d').forEach(function(r){var d=Number(r.dataset.day),i=r.querySelectorAll('input');
      if(i[2].checked||!i[0].value||!i[1].value)return;var a=mm(i[0].value),b=mm(i[1].value);if(b===0)b=1440;v[d]=[a,b]});
    H=v;send({form:'hours',values:v},t('f_save'))};
  return f}
function phoneForm(){var f=el('form','of');var i=el('input');i.type='tel';i.autocomplete='tel';i.value=P||'';i.setAttribute('aria-label','Tel.');
  var s=el('button','s',t('f_save'));s.type='submit';f.appendChild(i);f.appendChild(s);
  f.onsubmit=function(e){e.preventDefault();P=i.value;send({form:'phone',values:{phone:i.value}},i.value)};return f}
function scaled(file){return createImageBitmap(file).then(function(img){var s=Math.min(1,1600/Math.max(img.width,img.height)),
  c=document.createElement('canvas');c.width=Math.round(img.width*s);c.height=Math.round(img.height*s);c.getContext('2d').drawImage(img,0,0,c.width,c.height);
  return new Promise(function(res,rej){c.toBlob(function(b){b?res(b):rej(new Error('blob'))},'image/jpeg',0.82)})})}
function photoForm(){var f=el('form','of');var i=el('input');i.type='file';i.accept='image/*';i.setAttribute('aria-label',t('ui_photo'));f.appendChild(i);
  i.onchange=function(){var file=i.files&&i.files[0];if(!file)return;box.classList.add('busy');bubble(t('ui_photo'),'o');
    scaled(file).catch(function(){return file}).then(function(b){var fd=new FormData();fd.append('k',K);fd.append('photo',b,'photo.jpg');
      return fetch('/api/venue/photo',{method:'POST',body:fd})}).then(function(r){if(!r.ok)throw new Error(r.status===429?'limit':'up');return r.json()})
    .then(function(j){box.classList.remove('busy');send({photo:{id:j.id}},null)})
    .catch(function(e){box.classList.remove('busy');bubble(e.message==='limit'?t('limitDay'):t('error'),'b')})};
  return f}
function render(j){(j.say||[]).forEach(function(s){if(s)bubble(s,'b')});
  if(j.chips&&j.chips.length){var c=el('div','chips');j.chips.forEach(function(ch){var b;
    if(ch.href){b=el('a',null,ch.label);b.href=ch.href;b.target='_blank';b.rel='noopener'}
    else{b=el('button',null,ch.label);b.type='button';b.onclick=function(){send({chip:ch.id},ch.label)}}
    c.appendChild(b)});list.appendChild(c)}
  if(j.form==='hours')list.appendChild(hoursForm());
  if(j.form==='phone')list.appendChild(phoneForm());
  if(j.form==='photo')list.appendChild(photoForm());
  list.scrollTop=list.scrollHeight}
function refresh(){fetch(location.href,{cache:'no-store'}).then(function(r){return r.status===200?r.text():null})
  .then(function(h){if(!h)return;var d=new DOMParser().parseFromString(h,'text/html'),a=d.querySelector('main'),b=document.querySelector('main');
    if(a&&b)b.innerHTML=a.innerHTML}).catch(function(){})}
function send(input,shown){clearInteractive();if(shown)bubble(shown,'o');box.classList.add('busy');
  return fetch('/api/venue/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({k:K,input:input})})
  .then(function(r){if(!r.ok)throw new Error(String(r.status));return r.json()})
  .then(function(j){box.classList.remove('busy');if(j.lang){lang=j.lang;labels()}render(j);if(j.changed){changed=true;refresh()}})
  .catch(function(){box.classList.remove('busy');bubble(t('error'),'b')})}
function open(){box.hidden=false;bar.hidden=true;labels();if(!started){started=true;send({start:true},null)}inp.focus()}
function close(){box.hidden=true;bar.hidden=false;bar.querySelector('button').focus();if(changed)location.reload()}
bar.querySelector('button').onclick=open;closeB.onclick=close;
box.addEventListener('keydown',function(e){if(e.key==='Escape')close()});
box.querySelector('.ow').onsubmit=function(e){e.preventDefault();var v=inp.value.trim();if(!v)return;inp.value='';send({text:v},v)};
delB.onclick=function(){send({chip:'delete'},t('c_delete'))};
try{fetch('/api/venue/hit',{method:'POST',body:JSON.stringify({k:K}),keepalive:true})}catch(e){}
})();`;
}

export function ownerPanel({ venue }) {
  const de = UI.de;
  const html = `<section class="ob" data-ob data-owner><p dir="auto">${esc(de.bar)}</p><button type="button">${esc(de.ui_chat)}</button></section>
<div class="oc" data-oc role="dialog" aria-modal="true" aria-labelledby="oc-title" hidden>
<header><strong id="oc-title">${esc(de.ui_chat)}</strong><button type="button" class="x" aria-label="${esc(de.ui_close)}">×</button></header>
<div class="ol" aria-live="polite"></div>
<div class="od"><button type="button">${esc(de.c_delete)}</button></div>
<form class="ow"><input type="text" maxlength="2000" enterkeyhint="send" aria-label="${esc(de.ui_placeholder)}" placeholder="${esc(de.ui_placeholder)}"><button type="submit">${esc(de.ui_send)}</button></form>
</div>`;
  return { html, css: CSS, script: client(UI, RTL, venue.hours || null, venue.phone || '') };
}
