// Nasim's statistics page, www.namax.at/liste/statistik (behind the admin cookie, like /liste).
// The server sends only counts (visitor views per venue, day and source; owner-form events per venue, day and event)
// and the browser draws everything from them, so the city filter, the period switch and a venue's own chart need no reload.
import { KIND_DE, SRC_DE, TABS_CSS, TABS_JS, tabsNav } from './admin.mjs';

// Fixed source order and colours (categorical slots 1-6, checked for colour blindness on white); a source keeps its colour.
export const SRC_ORDER = ['google', 'direct', 'namax', 'social', 'bing', 'other'];
const SRC_COLOR = { google: '#2a78d6', direct: '#eb6834', namax: '#1baf7a', social: '#eda100', bing: '#e87ba4', other: '#008300' };
const SRC_NAME = { ...SRC_DE, direct: 'Direkt' };

const CSS = `*{box-sizing:border-box}body{margin:0;font:16px/1.4 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;background:#f4f3ef;color:#111}
header{background:#111;color:#fff;padding:14px}h1{margin:0;font-size:18px}
${TABS_CSS}
main{max-width:860px;margin:0 auto;padding:12px}
.flt{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 12px}.flt button,.seg button{font:inherit;font-size:15px;font-weight:600;min-height:44px;padding:8px 14px;border-radius:999px;border:1px solid #ccc;background:#fff;color:#111;cursor:pointer}
.flt button[aria-pressed=true],.seg button[aria-pressed=true]{background:#111;color:#fff;border-color:#111}
.card{background:#fff;border-radius:12px;padding:14px;margin:0 0 12px;box-shadow:0 1px 2px rgba(0,0,0,.08)}
.card h2{margin:0 0 10px;font-size:17px}.card h2 small{font-weight:400;color:#666}
.kpi{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.kpi div{background:#fff;border-radius:12px;padding:12px;box-shadow:0 1px 2px rgba(0,0,0,.08)}
.kpi span{display:block;font-size:13px;color:#555}.kpi b{display:block;font-size:32px;line-height:1.15;font-variant-numeric:tabular-nums}
.kpi i{font-style:normal;font-size:13px;color:#555}.kpi i.up{color:#0a7a2f}.kpi i.dn{color:#b3261e}
.leg{display:flex;flex-wrap:wrap;gap:4px 14px;margin:0 0 8px;font-size:14px;color:#333}.sw{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px;vertical-align:0}
svg{display:block;width:100%;height:auto;overflow:visible}svg text{font:11px system-ui,sans-serif;fill:#666}
.bars{list-style:none;margin:0;padding:0}.bars li{display:grid;grid-template-columns:minmax(90px,34%) 1fr auto;align-items:center;gap:10px;min-height:32px}
.bars .t{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.bars .bar{height:10px;border-radius:0 4px 4px 0;background:#2a78d6;min-width:2px}.bars .n{font-variant-numeric:tabular-nums;color:#333;font-size:14px;text-align:right;white-space:nowrap}
.seg{display:flex;gap:6px;margin:0 0 10px}
.top{list-style:none;margin:0;padding:0}.top li{border-top:1px solid #eee}.top button{display:grid;grid-template-columns:28px 1fr auto;gap:8px;align-items:center;width:100%;min-height:48px;padding:6px 2px;font:inherit;text-align:left;background:none;border:0;color:#111;cursor:pointer}
.top li[aria-current] button{background:#fff6d6}.top .r{color:#888;font-variant-numeric:tabular-nums}.top .nm{overflow:hidden}.top .nm b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}.top .nm small{color:#666}
.top .c{font-weight:700;font-variant-numeric:tabular-nums}.up{color:#0a7a2f;font-weight:700;font-size:13px;margin-left:6px}
.ven{margin:10px 0 0;padding:12px;border-radius:10px;background:#f7f6f2}.ven a{color:#111;font-weight:700}.ven p{margin:4px 0 8px;color:#555;font-size:14px}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}.none{color:#666;margin:0}
.fun li{grid-template-columns:minmax(120px,40%) 1fr auto}.fun .bar{background:#6250d6}.sub{margin:12px 0 4px;font-size:14px;font-weight:700;color:#333}
#tip{position:fixed;pointer-events:none;z-index:5;background:#111;color:#fff;border-radius:8px;padding:8px 10px;font-size:13px;line-height:1.35;max-width:240px;display:none}
#tip b{display:block;margin-bottom:2px}
@media (max-width:620px){.kpi b{font-size:24px}.grid2{grid-template-columns:1fr}svg text{font-size:20px}}`;

// Everything below runs in the browser on window.D (see renderStats).
const JS = `
var D=window.D,N=D.days,T0=Date.parse(D.since+'T12:00:00Z'),city='all',per='w',sel=null;
var SRC=${JSON.stringify(SRC_ORDER)},COL=${JSON.stringify(SRC_COLOR)},SN=${JSON.stringify(SRC_NAME)},KN=${JSON.stringify(KIND_DE)};
function idx(day){return Math.round((Date.parse(day+'T12:00:00Z')-T0)/864e5)}
var H=D.hits.map(function(r){return{s:r[0],i:idx(r[1]),src:r[2],n:r[3]}}),C=D.claims.map(function(r){return{s:r[0],i:idx(r[1]),e:r[2],n:r[3]}});
function V(s){return D.venues[s]||['('+s+')','','','']}
function inCity(r){return city==='all'||V(r.s)[1]===city}
function esc(t){return String(t).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function fmt(n){return String(n).replace(/\\B(?=(\\d{3})+(?!\\d))/g,'.')}
function dd(i){var d=new Date(T0+i*864e5);return ('0'+d.getUTCDate()).slice(-2)+'.'+('0'+(d.getUTCMonth()+1)).slice(-2)}
function sum(rows,a,b){var t=0;for(var k=0;k<rows.length;k++)if(rows[k].i>=a&&rows[k].i<=b)t+=rows[k].n;return t}
function trend(cur,prev,label){if(!prev)return cur?'<i class="up">neu</i>':'<i>–</i>';var p=Math.round((cur-prev)/prev*100);
return '<i class="'+(p>0?'up':p<0?'dn':'')+'">'+(p>0?'▲ +':p<0?'▼ ':'± ')+p+' % '+label+'</i>'}
function kpis(rows){var L=N-1,a=[['Heute',L,L,1,'zu gestern'],['7 Tage',L-6,L,7,'zur Woche davor'],['30 Tage',L-29,L,30,'zu den 30 davor']];
return a.map(function(x){var c=sum(rows,x[1],x[2]),p=sum(rows,x[1]-x[3],x[2]-x[3]);return '<div><span>'+x[0]+'</span><b>'+fmt(c)+'</b>'+trend(c,p,x[4])+'</div>'}).join('')}
function legend(){return '<div class="leg">'+SRC.map(function(s){return '<span><span class="sw" style="background:'+COL[s]+'"></span>'+esc(SN[s])+'</span>'}).join('')+'</div>'}
// 30 days, one stacked column per day, coloured by source; a wide invisible column per day carries the hover.
function chart(rows,id){var days=30,a=N-days,W=700,Ht=180,pad=24,by=[],mx=0;
for(var d=0;d<days;d++)by.push({});rows.forEach(function(r){if(r.i>=a){var o=by[r.i-a];o[r.src]=(o[r.src]||0)+r.n}});
by.forEach(function(o){var t=0;for(var k in o)t+=o[k];o._t=t;if(t>mx)mx=t});
if(!mx)return '<p class="none">Noch keine Besuche in diesen 30 Tagen.</p>';
var step=Math.pow(10,Math.floor(Math.log10(mx))),top=Math.ceil(mx/step)*step;if(top/step<3)step/=2;
var bw=W/days,g='',y,gl='';for(y=step;y<=top+1e-9;y+=step){var yy=Ht-y/top*Ht;gl+='<line x1="0" x2="'+W+'" y1="'+yy+'" y2="'+yy+'" stroke="#eee"/><text x="'+(W+4)+'" y="'+(yy+4)+'">'+fmt(Math.round(y))+'</text>'}
by.forEach(function(o,d){var x=d*bw+1,h0=Ht,parts=SRC.filter(function(s){return o[s]});
parts.forEach(function(s,j){var h=o[s]/top*Ht,yt=h0-h,last=j===parts.length-1,w=bw-2;
g+=last?'<path d="M'+x+' '+h0+'V'+(yt+Math.min(4,h))+'q0 -'+Math.min(4,h)+' '+Math.min(4,h)+' -'+Math.min(4,h)+'H'+(x+w-Math.min(4,h))+'q'+Math.min(4,h)+' 0 '+Math.min(4,h)+' '+Math.min(4,h)+'V'+h0+'Z" fill="'+COL[s]+'"/>'
:'<rect x="'+x+'" y="'+yt+'" width="'+w+'" height="'+Math.max(0,h-2)+'" fill="'+COL[s]+'"/>';h0=yt});
if(d%5===4||d===days-1)g+='<text x="'+(x+bw/2-1)+'" y="'+(Ht+16)+'" text-anchor="middle">'+dd(a+d)+'</text>';
g+='<rect class="hit" data-c="'+id+'" data-d="'+d+'" x="'+(d*bw)+'" y="0" width="'+bw+'" height="'+Ht+'" fill="transparent"/>'});
CH[id]={by:by,a:a};
return legend()+'<svg viewBox="0 0 '+(W+pad)+' '+(Ht+22)+'" role="img" aria-label="Besuche pro Tag, 30 Tage">'+gl+'<line x1="0" x2="'+W+'" y1="'+Ht+'" y2="'+Ht+'" stroke="#bbb"/>'+g+'</svg>'}
var CH={};
function bars(list,total,cls){if(!list.length)return '<p class="none">Noch nichts.</p>';var mx=list[0][1]||1;
return '<ul class="bars '+(cls||'')+'">'+list.map(function(x){return '<li><span class="t">'+(x[2]?'<span class="sw" style="background:'+x[2]+'"></span>':'')+esc(x[0])+'</span><span><span class="bar" style="display:block;width:'+(x[1]/mx*100)+'%'+(x[2]?';background:'+x[2]:'')+'"></span></span><span class="n">'+fmt(x[1])+(total?' · '+Math.round(x[1]/total*100)+' %':'')+'</span></li>'}).join('')+'</ul>'}
function group(rows,key,a){var m={},t=0;rows.forEach(function(r){if(r.i>=a){var k=key(r);m[k]=(m[k]||0)+r.n;t+=r.n}});
var l=Object.keys(m).map(function(k){return[k,m[k]]}).sort(function(x,y){return y[1]-x[1]||(x[0]<y[0]?-1:1)});return{l:l,t:t}}
function fold(l,max){if(l.length<=max)return l;var rest=l.slice(max-1).reduce(function(a,x){return a+x[1]},0);return l.slice(0,max-1).concat([['andere',rest]])}
function shares(rows){var a=N-30,s=group(rows,function(r){return r.src},a);
var src=SRC.map(function(k){var f=s.l.filter(function(x){return x[0]===k})[0];return[SN[k],f?f[1]:0,COL[k]]}).filter(function(x){return x[1]}).sort(function(x,y){return y[1]-x[1]});
var out='<div class="card"><h2>Woher <small>· 30 Tage</small></h2>'+bars(src,s.t)+'</div>';
var cityL=group(rows,function(r){return V(r.s)[1]||'?'},a),cn={};D.cities.forEach(function(c){cn[c[0]]=c[1]});
var dist=group(rows,function(r){var v=V(r.s);return (city==='all'?(cn[v[1]]||'?')+' ':'')+(v[2]||'ohne Bezirk')},a);
var kind=group(rows,function(r){var k=V(r.s)[3];return KN[k]||k||'?'},a);
out+='<div class="grid2">'+(city==='all'?'<div class="card"><h2>Städte <small>· 30 Tage</small></h2>'+bars(cityL.l.map(function(x){return[cn[x[0]]||x[0],x[1]]}),cityL.t)+'</div>':'')
+'<div class="card"><h2>Bezirke <small>· 30 Tage</small></h2>'+bars(fold(dist.l,12),dist.t)+'</div>'
+'<div class="card"><h2>Branchen <small>· 30 Tage</small></h2>'+bars(fold(kind.l,10),kind.t)+'</div></div>';return out}
// Top pages for the chosen period; "steigt" when this period has at least 3 views and twice the usual (the period before,
// or for "Heute" the daily average of the 7 days before).
function topPages(rows){var L=N-1,len=per==='d'?1:per==='w'?7:30,a=L-len+1,m={};
rows.forEach(function(r){var x=m[r.s]||(m[r.s]={c:0,p:0,src:{}});if(r.i>=a){x.c+=r.n;x.src[r.src]=(x.src[r.src]||0)+r.n}
else if(per==='d'?r.i>=L-7:r.i>=a-len)x.p+=r.n});
var l=Object.keys(m).filter(function(s){return m[s].c}).sort(function(x,y){return m[y].c-m[x].c||(x<y?-1:1)}).slice(0,25);
var seg='<div class="seg" role="group" aria-label="Zeitraum">'+[['d','Heute'],['w','7 Tage'],['m','30 Tage']].map(function(x){return '<button type="button" data-per="'+x[0]+'" aria-pressed="'+(per===x[0])+'">'+x[1]+'</button>'}).join('')+'</div>';
if(!l.length)return seg+'<p class="none">Noch keine Besuche in diesem Zeitraum.</p>';
return seg+'<ol class="top">'+l.map(function(s,i){var x=m[s],v=V(s),usual=per==='d'?x.p/7:x.p,up=x.c>=3&&x.c>=2*usual;
var from=SRC.filter(function(k){return x.src[k]}).map(function(k){return SN[k]+' '+x.src[k]}).join(' · ');
return '<li'+(sel===s?' aria-current="true"':'')+'><button type="button" data-ven="'+esc(s)+'"><span class="r">'+(i+1)+'</span><span class="nm"><b>'+esc(v[0])+'</b><small>'+esc([v[2],KN[v[3]]||v[3]].filter(Boolean).join(' · '))+' · '+esc(from)+'</small></span><span class="c">'+fmt(x.c)+(up?'<span class="up" title="doppelt so viel wie sonst">▲ steigt</span>':'')+'</span></button>'
+(sel===s?venue(s):'')+'</li>'}).join('')+'</ol>'}
function venue(s){var rows=H.filter(function(r){return r.s===s}),v=V(s),cs=C.filter(function(r){return r.s===s&&r.i>=N-30}),op=0,sent=0;
cs.forEach(function(r){if(r.e.indexOf('open:')===0)op+=r.n;if(r.e==='sent')sent+=r.n});
return '<div class="ven"><a href="https://'+esc(s)+'.namax.at/" target="_blank" rel="noopener">'+esc(v[0])+' ↗</a><p>30 Tage: '+fmt(sum(rows,N-30,N-1))+' Besuche'+(op||sent?' · Formular '+op+'× geöffnet, '+sent+'× gesendet':'')+'</p>'+chart(rows,'v')+'</div>'}
// The owner form, 30 days: how many opened it, how far they got, what they picked, where they gave up.
var EV={'open:niche':'Bild „+ Eigene Fotos“','open:nophoto':'„Fotos hinzufügen“ (ohne Bild)','open:link':'Link unten „Inhaber?“','open:report':'„Angaben falsch?“',
'role:owner':'Inhaber','role:staff':'Familie/Mitarbeiter','role:other':'Anderes','wish:fix':'Angaben korrigieren','wish:photos':'Fotos','wish:website':'Eigene Website','wish:remove':'Seite entfernen',
'close:1':'bei Schritt 1 (Wer?)','close:2':'bei Schritt 2 (Was?)','close:3':'im Formular'};
function funnel(){var a=N-30,m={};C.forEach(function(r){if(r.i>=a&&inCity(r))m[r.e]=(m[r.e]||0)+r.n});
var g=function(p){return Object.keys(EV).filter(function(k){return k.indexOf(p)===0&&m[k]}).map(function(k){return[EV[k],m[k]]}).sort(function(x,y){return y[1]-x[1]})};
var sumP=function(p){return Object.keys(m).filter(function(k){return k.indexOf(p)===0}).reduce(function(t,k){return t+m[k]},0)};
var op=sumP('open:');if(!op&&!m.sent)return '<p class="none">Noch niemand hat das Formular geöffnet. Gezählt wird ab jetzt, ohne Namen, Nummern oder Text.</p>';
var steps=[['Geöffnet',op],['Rolle gewählt',sumP('role:')],['Formular erreicht',m['step:3']||0],['Gesendet',m.sent||0]];
return bars(steps.map(function(x){return[x[0],x[1]]}),op,'fun')
+'<p class="sub">Geöffnet über</p>'+bars(g('open:'),op)+'<div class="grid2"><div><p class="sub">Wer</p>'+bars(g('role:'),0)+'</div><div><p class="sub">Was</p>'+bars(g('wish:'),0)+'</div></div>'
+'<p class="sub">Geschlossen ohne Senden</p>'+bars(g('close:'),op)+(m.fail?'<p class="sub">Fehler beim Senden: '+m.fail+'</p>':'')}
function cityBtns(){var have={};H.forEach(function(r){have[V(r.s)[1]]=1});C.forEach(function(r){have[V(r.s)[1]]=1});
return '<div class="flt" role="group" aria-label="Stadt"><button type="button" data-city="all" aria-pressed="'+(city==='all')+'">Alle Städte</button>'
+D.cities.filter(function(c){return have[c[0]]}).map(function(c){return '<button type="button" data-city="'+c[0]+'" aria-pressed="'+(city===c[0])+'">'+esc(c[1])+'</button>'}).join('')+'</div>'}
function draw(){var rows=H.filter(inCity);CH={};
document.getElementById('app').innerHTML=cityBtns()+'<div class="kpi">'+kpis(rows)+'</div>'
+'<div class="card" style="margin-top:12px"><h2>Besuche pro Tag <small>· 30 Tage</small></h2>'+chart(rows,'all')+'</div>'+shares(rows)
+'<div class="card"><h2>Meistbesuchte Seiten</h2>'+topPages(rows)+'</div>'
+'<div class="card"><h2>Formular „Sind Sie der Inhaber?“ <small>· 30 Tage</small></h2>'+funnel()+'</div>'}
var tip=document.getElementById('tip');
function showTip(t,e){var c=CH[t.getAttribute('data-c')];if(!c)return;var o=c.by[+t.getAttribute('data-d')],i=c.a+(+t.getAttribute('data-d'));
tip.innerHTML='<b>'+dd(i)+' · '+fmt(o._t)+' Besuche</b>'+SRC.filter(function(s){return o[s]}).map(function(s){return '<span class="sw" style="background:'+COL[s]+'"></span>'+esc(SN[s])+' '+o[s]}).join('<br>');
tip.style.display='block';var x=Math.min(e.clientX+12,innerWidth-tip.offsetWidth-8),y=e.clientY-tip.offsetHeight-12;tip.style.left=x+'px';tip.style.top=(y<8?e.clientY+16:y)+'px'}
document.addEventListener('pointermove',function(e){var t=e.target.closest&&e.target.closest('.hit');if(t)showTip(t,e);else tip.style.display='none'});
document.addEventListener('click',function(e){var b=e.target.closest&&e.target.closest('[data-city],[data-per],[data-ven]');if(!b)return;
if(b.hasAttribute('data-city')){city=b.getAttribute('data-city');sel=null}else if(b.hasAttribute('data-per'))per=b.getAttribute('data-per');
else{var s=b.getAttribute('data-ven');sel=sel===s?null:s}draw()});
draw();`;

/**
 * data: { today, days, hits: [{ slug, day, source, n }], claims: [{ slug, day, event, n }],
 *   venues: { slug: [name, city, district label, kind] }, cities: [[key, name]], openRequests }
 */
export function renderStats({ today, days, hits, claims, venues, cities, openRequests = 0 }) {
  const start = new Date(today + 'T12:00:00Z');
  start.setUTCDate(start.getUTCDate() - (days - 1));
  const D = { since: start.toISOString().slice(0, 10), days, venues, cities,
    hits: hits.map((r) => [r.slug, r.day, r.source, r.n]), claims: claims.map((r) => [r.slug, r.day, r.event, r.n]) };
  const data = JSON.stringify(D).replace(/</g, '\\u003c');
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>namax · Statistik</title><meta name="theme-color" content="#111">
<style>${CSS}</style></head><body>
<header><h1>namax · Statistik</h1>${tabsNav('statistik', openRequests)}</header>
<main id="app"><p class="none">Lädt…</p></main><div id="tip" role="tooltip"></div>
<noscript><p style="padding:12px">Die Statistik braucht JavaScript.</p></noscript>
<script>window.D=${data};</script>
<script>(function(){${TABS_JS}})();</script>
<script>(function(){${JS}})();</script>
</body></html>`;
}
