'use strict';

// Ships in lockstep with the plugin, so this is what the user is running.
const APP_VERSION = '1.6.0';
const RELEASES_URL = 'https://github.com/DogeCPP/DogeTracker/releases';

let PORT     = parseInt(localStorage.getItem('dt-port') || '4000', 10);
const HOST   = window.location.hostname || '127.0.0.1';
const POLL   = 1000;
const FPS    = 60;
const RING_C = 326.7;

let cur = null, fromState = null, toState = null;
let frame = 0, raf = null;
let trailPts = [], trailMax = 300, trailLine = null;
let acMark = null, todMark = null;
let routeLayer = null, navLayer = null, airwayLayer = null;
let sbRoute = null;

let followAc = true, showTrail = true, smoothMove = true;
let showTodMark = true, todAngle = 3;
let showVOR = true, showNDB = true, showFix = true;
let showNavaids = false, showAirways = false;

let armed = false, fired = false;
let deadline = null, leadMs = 5 * 60000;
let alarmVol = 0.8, alarmSnd = 'beep';
let audioCtx = null, soundNodes = null;
let alarmTick = null;

const lerp  = (a,b,t) => a + (b-a)*t;
const clamp = (v,lo,hi) => Math.max(lo, Math.min(hi,v));
const rad   = d => d * Math.PI/180;
const deg   = r => r * 180/Math.PI;

function lerpHdg(a,b,t) { return (a + (((b-a)+540)%360-180)*t + 360)%360; }

function lerpFull(a,b,t) {
  return {
    lat:a.lat+(b.lat-a.lat)*t, lon:a.lon+(b.lon-a.lon)*t,
    heading:lerpHdg(a.heading,b.heading,t),
    pitch:lerp(a.pitch,b.pitch,t), roll:lerp(a.roll,b.roll,t),
    altitude_ft:lerp(a.altitude_ft,b.altitude_ft,t),
    agl_ft:lerp(a.agl_ft,b.agl_ft,t),
    groundspeed_kts:lerp(a.groundspeed_kts,b.groundspeed_kts,t),
    airspeed_kts:lerp(a.airspeed_kts,b.airspeed_kts,t),
    vspeed_fpm:lerp(a.vspeed_fpm,b.vspeed_fpm,t),
    wind_dir:lerp(a.wind_dir,b.wind_dir,t),
    wind_spd_kts:lerp(a.wind_spd_kts,b.wind_spd_kts,t),
  };
}

function gcNM(la1,lo1,la2,lo2) {
  const R=3440.065,dL=rad(la2-la1),dG=rad(lo2-lo1);
  const a=Math.sin(dL/2)**2+Math.cos(rad(la1))*Math.cos(rad(la2))*Math.sin(dG/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}
function brg(la1,lo1,la2,lo2) {
  const dG=rad(lo2-lo1),y=Math.sin(dG)*Math.cos(rad(la2));
  const x=Math.cos(rad(la1))*Math.sin(rad(la2))-Math.sin(rad(la1))*Math.cos(rad(la2))*Math.cos(dG);
  return (deg(Math.atan2(y,x))+360)%360;
}
function dest(lat,lon,nm,b) {
  const d=nm/3440.065,bR=rad(b),pR=rad(lat);
  const nL=Math.asin(Math.sin(pR)*Math.cos(d)+Math.cos(pR)*Math.sin(d)*Math.cos(bR));
  const nG=rad(lon)+Math.atan2(Math.sin(bR)*Math.sin(d)*Math.cos(pR),Math.cos(d)-Math.sin(pR)*Math.sin(nL));
  return [deg(nL),deg(nG)];
}
function todNM(alt,angle) { return alt/(Math.tan(rad(angle))*6076.12); }

const $ = id => document.getElementById(id);

// Simplified top-down widebody silhouette: straight tapered fuselage, swept
// wings, a tailplane, and a single fin. Drawn from scratch to keep a clean
// silhouette at small map sizes rather than a highly detailed trace.
function jetPath() {
  return `M32 3
    C33.6 3 34.6 6.7 34.8 13.5
    L35 21 60 33.5 60 38 35 30.5
    35.3 45.5 45 51.5 45 55 35.6 51.8
    34.6 58.4 32 61 29.4 58.4 28.4 51.8
    19 55 19 51.5 28.7 45.5
    29 30.5 4 38 4 33.5 29 21
    29.2 13.5 C29.4 6.7 30.4 3 32 3 Z`;
}

function planeIcon(hdg, opts) {
  opts = opts || {};
  const dk = document.documentElement.dataset.theme === 'dark';
  const fill = opts.fill || (dk ? '#3b9ae8' : '#1f6fc4');
  const stroke = opts.stroke || (dk ? '#0a1a1a' : '#0a2422');
  const size = opts.size || 44;
  const opacity = opts.opacity != null ? opts.opacity : 1;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}" opacity="${opacity}">
  <g transform="rotate(${hdg},32,32)">
    <path fill="${fill}" stroke="${stroke}" stroke-width="1.4" stroke-linejoin="round" d="${jetPath()}"/>
  </g>
</svg>`;
  const half = size/2;
  return L.divIcon({
    html: `<div style="filter:drop-shadow(0 2px 4px rgba(0,0,0,.5))">${svg}</div>`,
    className:'', iconSize:[size,size], iconAnchor:[half,half], popupAnchor:[0,-half+2]
  });
}

// Aeronautical-chart style navaid symbols: hexagon = VOR, dotted circle = NDB,
// triangle = intersection/fix. Each carries its identifier underneath.
const NAV_SVG = {
  vor: c => `<path d="M11 1.5l8.2 4.75v9.5L11 20.5l-8.2-4.75v-9.5z" fill="none" stroke="${c}" stroke-width="1.8"/><circle cx="11" cy="11" r="2" fill="${c}"/>`,
  ndb: c => `<circle cx="11" cy="11" r="8.4" fill="none" stroke="${c}" stroke-width="1.7" stroke-dasharray="1.6 2.4"/><circle cx="11" cy="11" r="2.2" fill="${c}"/>`,
  fix: c => `<path d="M11 3l8 15H3z" fill="none" stroke="${c}" stroke-width="1.8" stroke-linejoin="round"/>`,
};
const NAV_COL = { vor:'#6fc6c1', ndb:'#d98c2b', fix:'#8c887f' };

function navSymbol(kind, ident) {
  const col = NAV_COL[kind] || NAV_COL.fix;
  const sym = (NAV_SVG[kind] || NAV_SVG.fix)(col);
  const html =
    `<div class="nav-mark">` +
    `<svg viewBox="0 0 22 22" width="22" height="22">${sym}</svg>` +
    (ident ? `<span class="nav-id" style="color:${col}">${ident}</span>` : '') +
    `</div>`;
  return L.divIcon({ html, className:'', iconSize:[22,34], iconAnchor:[11,11], popupAnchor:[0,-11] });
}

// Zoom control lives bottom-left so the floating flight card doesn't cover it.
const map = L.map('map', { center:[51.5,-0.1], zoom:12, zoomControl:false });
L.control.zoom({ position:'bottomleft' }).addTo(map);

// The raw OpenStreetMap tile servers block app/embedded use (they return a
// "Referer is required" tile), so we use CARTO's basemaps instead: still
// free, OSM based, and they ship a proper dark style so no CSS invert hack.
const CARTO_ATTR = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/attributions">CARTO</a>';
const tiles = {
  dark: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    { subdomains:'abcd', attribution:CARTO_ATTR, maxZoom:20 }),
  light: L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    { subdomains:'abcd', attribution:CARTO_ATTR, maxZoom:20 }),
  sat: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    { attribution:'© Esri', maxZoom:19 })
};

let satOn = false, baseLayer = null;
function setBaseTiles() {
  const want = satOn ? tiles.sat
    : (document.documentElement.dataset.theme === 'dark' ? tiles.dark : tiles.light);
  if (baseLayer === want) return;
  if (baseLayer) map.removeLayer(baseLayer);
  baseLayer = want;
  baseLayer.addTo(map);
  if (baseLayer.bringToBack) baseLayer.bringToBack();
}
setBaseTiles();

function apply(s) {
  
  if (!acMark) {
    acMark = L.marker([s.lat,s.lon],{icon:planeIcon(s.heading),zIndexOffset:1000}).addTo(map)
              .bindPopup('<b>DogeTracker</b><br>Your aircraft');
  } else {
    acMark.setLatLng([s.lat,s.lon]);
    acMark.setIcon(planeIcon(s.heading));
  }

  
  if (showTrail) {
    trailPts.push([s.lat,s.lon]);
    if (trailPts.length > trailMax) trailPts.shift();
    const col = document.documentElement.dataset.theme==='dark'?'#3b9ae8':'#1f6fc4';
    if (!trailLine) trailLine = L.polyline(trailPts,{color:col,weight:2,opacity:.55}).addTo(map);
    else { trailLine.setLatLngs(trailPts); trailLine.setStyle({color:col}); }
  }

  if (followAc) map.setView([s.lat,s.lon],map.getZoom(),{animate:false});

  
  updateTodMark(s);

  
  $('v-lat').textContent = s.lat.toFixed(5)+'°';
  $('v-lon').textContent = s.lon.toFixed(5)+'°';
  $('v-hdg').textContent = Math.round(s.heading)+'°';
  $('v-alt').textContent = Math.round(s.altitude_ft).toLocaleString()+' ft';
  $('v-agl').textContent = Math.round(s.agl_ft).toLocaleString()+' ft';
  $('v-ias').textContent = Math.round(s.airspeed_kts)+' kts';
  $('v-gs').textContent  = Math.round(s.groundspeed_kts)+' kts';

  const vs = Math.round(s.vspeed_fpm);
  $('v-vs').textContent  = (vs>=0?'+':'')+vs.toLocaleString()+' fpm';
  $('v-vs').className = 'ro-val '+(vs>100?'climb':vs<-100?'descend':'level');

  $('v-wdir').textContent = Math.round(s.wind_dir)+'°';
  $('v-wspd').textContent = Math.round(s.wind_spd_kts)+' kts';

  drawADI(s.pitch, s.roll);
  drawWind(s.wind_dir, s.wind_spd_kts);
  drawProfile(s);
}

function updateTodMark(s) {
  if (todMark) { map.removeLayer(todMark); todMark=null; }
  if (!showTodMark || !s || s.altitude_ft<100) return;
  const nm = todNM(s.altitude_ft, todAngle);
  let b = s.heading;
  if (sbRoute?.dest) b = brg(s.lat,s.lon,sbRoute.dest.lat,sbRoute.dest.lon);
  const [tLat,tLon] = dest(s.lat,s.lon,nm,b);
  todMark = L.marker([tLat,tLon],{
    icon:L.divIcon({html:`<div class="tod-pill">T/D ${nm.toFixed(1)} NM</div>`,className:'',iconAnchor:[0,10]}),
    zIndexOffset:900
  }).addTo(map);
  $('tod-dist').textContent = nm.toFixed(1)+' NM';
  $('tod-brg').textContent  = Math.round(b)+'°';
}

const adiCtx = $('adi').getContext('2d');
const R=80, CX=100, CY=100;

function drawADI(pitch,roll) {
  adiCtx.clearRect(0,0,200,200);
  adiCtx.save();
  adiCtx.beginPath(); adiCtx.arc(CX,CY,R,0,Math.PI*2); adiCtx.clip();
  adiCtx.save();
  adiCtx.translate(CX,CY); adiCtx.rotate(rad(-roll));
  const pp = clamp(pitch*2.5,-R,R);
  adiCtx.fillStyle='#1a6ca8'; adiCtx.fillRect(-R,-R*2,R*2,R*2+pp);
  adiCtx.fillStyle='#7a5232'; adiCtx.fillRect(-R,pp,R*2,R*2);
  adiCtx.strokeStyle='#fff'; adiCtx.lineWidth=2;
  adiCtx.beginPath(); adiCtx.moveTo(-R,pp); adiCtx.lineTo(R,pp); adiCtx.stroke();
  
  adiCtx.font='9px monospace'; adiCtx.textAlign='right'; adiCtx.fillStyle='rgba(255,255,255,.65)';
  adiCtx.strokeStyle='rgba(255,255,255,.55)'; adiCtx.lineWidth=1;
  for (let p=-20;p<=20;p+=5) {
    if (!p) continue;
    const py=pp-p*2.5, w=p%10===0?26:15;
    adiCtx.beginPath(); adiCtx.moveTo(-w,py); adiCtx.lineTo(w,py); adiCtx.stroke();
    if (p%10===0) adiCtx.fillText(Math.abs(p),-w-3,py+3);
  }
  adiCtx.restore();
  
  adiCtx.strokeStyle='#ffd700'; adiCtx.lineWidth=2.5;
  adiCtx.beginPath();
  adiCtx.moveTo(CX-38,CY); adiCtx.lineTo(CX-15,CY); adiCtx.lineTo(CX-15,CY+6);
  adiCtx.moveTo(CX+38,CY); adiCtx.lineTo(CX+15,CY); adiCtx.lineTo(CX+15,CY+6);
  adiCtx.arc(CX,CY,3,0,Math.PI*2); adiCtx.stroke();
  
  adiCtx.strokeStyle='rgba(255,255,255,.35)'; adiCtx.lineWidth=1;
  for (const a of [-60,-45,-30,-20,-10,0,10,20,30,45,60]) {
    const ar=rad(a-90),r1=R-5,r2=R-(a%30===0?13:8);
    adiCtx.beginPath();
    adiCtx.moveTo(CX+r1*Math.cos(ar),CY+r1*Math.sin(ar));
    adiCtx.lineTo(CX+r2*Math.cos(ar),CY+r2*Math.sin(ar)); adiCtx.stroke();
  }
  
  adiCtx.save(); adiCtx.translate(CX,CY); adiCtx.rotate(rad(-roll));
  adiCtx.fillStyle='#ffd700'; adiCtx.beginPath();
  adiCtx.moveTo(0,-(R-15)); adiCtx.lineTo(-5,-(R-8)); adiCtx.lineTo(5,-(R-8));
  adiCtx.closePath(); adiCtx.fill(); adiCtx.restore();
  
  adiCtx.beginPath(); adiCtx.arc(CX,CY,R,0,Math.PI*2);
  adiCtx.strokeStyle='rgba(255,255,255,.2)'; adiCtx.lineWidth=1.5; adiCtx.stroke();
  adiCtx.restore();
  $('adi-p').textContent='Pitch '+pitch.toFixed(1)+'°';
  $('adi-r').textContent='Roll '+roll.toFixed(1)+'°';
}

const wCtx = $('wind-rose').getContext('2d');
function drawWind(wDir, wSpd) {
  const W=72,H=72,cx=36,cy=36,Rr=28;
  wCtx.clearRect(0,0,W,H);
  const dk = document.documentElement.dataset.theme==='dark';
  const fg=dk?'#8c887f':'#6b6656', ac=dk?'#3b9ae8':'#1f6fc4';
  wCtx.beginPath(); wCtx.arc(cx,cy,Rr,0,Math.PI*2);
  wCtx.strokeStyle=fg; wCtx.lineWidth=1; wCtx.stroke();
  wCtx.fillStyle=fg; wCtx.font='bold 7px sans-serif';
  wCtx.textAlign='center'; wCtx.textBaseline='middle';
  wCtx.fillText('N',cx,cy-Rr+5); wCtx.fillText('S',cx,cy+Rr-5);
  wCtx.fillText('W',cx-Rr+5,cy); wCtx.fillText('E',cx+Rr-5,cy);
  const wr=rad(wDir-90), len=clamp(wSpd/3,7,Rr-4);
  const tx=cx+Math.cos(wr)*len, ty=cy+Math.sin(wr)*len;
  wCtx.strokeStyle=ac; wCtx.lineWidth=2;
  wCtx.beginPath(); wCtx.moveTo(cx,cy); wCtx.lineTo(tx,ty); wCtx.stroke();
  const ah=Math.atan2(ty-cy,tx-cx);
  wCtx.fillStyle=ac; wCtx.beginPath();
  wCtx.moveTo(tx,ty);
  wCtx.lineTo(tx-6*Math.cos(ah-.4),ty-6*Math.sin(ah-.4));
  wCtx.lineTo(tx-6*Math.cos(ah+.4),ty-6*Math.sin(ah+.4));
  wCtx.closePath(); wCtx.fill();
  wCtx.fillStyle=fg; wCtx.font='7px sans-serif';
  wCtx.textBaseline='bottom'; wCtx.fillText(Math.round(wSpd)+'kt',cx,H-1);
}

const vpCtx = $('vprofile').getContext('2d');
function drawProfile(s) {
  const W=$('vprofile').width, H=$('vprofile').height;
  const alt = s.altitude_ft;
  if (alt < 50) { vpCtx.clearRect(0,0,W,H); return; }

  const todNm  = todNM(alt, todAngle);
  const maxDist = Math.max(todNm * 1.4, 10);
  const maxAlt  = alt * 1.15;
  const dk = document.documentElement.dataset.theme==='dark';
  const bg = dk?'#1a2030':'#f8f9fb';
  const fg = dk?'#6b7a96':'#6b7a96';
  const ac = dk?'#3b9ae8':'#1f6fc4';
  const tod_col = '#e09b3d';

  vpCtx.clearRect(0,0,W,H);
  vpCtx.fillStyle=bg; vpCtx.fillRect(0,0,W,H);

  
  const PAD = { l:32, r:10, t:10, b:22 };
  const cw = W-PAD.l-PAD.r, ch = H-PAD.t-PAD.b;

  function tx(nm)  { return PAD.l + (nm/maxDist)*cw; }
  function ty(ft)  { return PAD.t + ch - (ft/maxAlt)*ch; }

  
  vpCtx.strokeStyle=dk?'rgba(255,255,255,.06)':'rgba(0,0,0,.06)';
  vpCtx.lineWidth=1;
  for (let a=0; a<=maxAlt; a+=5000) {
    const y=ty(a); vpCtx.beginPath(); vpCtx.moveTo(PAD.l,y); vpCtx.lineTo(PAD.l+cw,y); vpCtx.stroke();
  }

  
  vpCtx.fillStyle=fg; vpCtx.font='8px sans-serif'; vpCtx.textAlign='right';
  for (let a=0; a<=maxAlt; a+=10000) {
    vpCtx.fillText((a/1000).toFixed(0)+'k', PAD.l-3, ty(a)+3);
  }
  vpCtx.textAlign='center';
  for (let d=0; d<=maxDist; d+=Math.ceil(maxDist/4/10)*10) {
    if (d===0) continue;
    vpCtx.fillText(d, tx(d), H-PAD.b+12);
  }
  vpCtx.fillText('NM', PAD.l+cw/2, H-2);

  
  vpCtx.strokeStyle=dk?'rgba(59,154,232,.28)':'rgba(31,111,196,.22)';
  vpCtx.lineWidth=1.5; vpCtx.setLineDash([4,3]);
  vpCtx.beginPath(); vpCtx.moveTo(tx(0),ty(alt)); vpCtx.lineTo(tx(todNm),ty(0)); vpCtx.stroke();
  vpCtx.setLineDash([]);

  
  vpCtx.beginPath();
  vpCtx.moveTo(tx(0), ty(0));
  vpCtx.lineTo(tx(0), ty(alt));
  vpCtx.lineTo(tx(todNm), ty(0));
  vpCtx.closePath();
  const grad = vpCtx.createLinearGradient(0, PAD.t, 0, PAD.t+ch);
  grad.addColorStop(0, dk?'rgba(59,154,232,.18)':'rgba(31,111,196,.12)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  vpCtx.fillStyle=grad; vpCtx.fill();

  
  vpCtx.strokeStyle=tod_col; vpCtx.lineWidth=1.5; vpCtx.setLineDash([3,3]);
  vpCtx.beginPath(); vpCtx.moveTo(tx(todNm),ty(0)); vpCtx.lineTo(tx(todNm),ty(alt)); vpCtx.stroke();
  vpCtx.setLineDash([]);
  vpCtx.fillStyle=tod_col; vpCtx.font='bold 8px sans-serif'; vpCtx.textAlign='center';
  vpCtx.fillText('T/D', tx(todNm), ty(alt*1.05)+6);

  
  vpCtx.fillStyle=ac; vpCtx.beginPath(); vpCtx.arc(tx(0),ty(alt),5,0,Math.PI*2); vpCtx.fill();
  vpCtx.fillStyle=fg; vpCtx.font='8px sans-serif'; vpCtx.textAlign='left';
  vpCtx.fillText(Math.round(alt/100)*100+' ft', tx(0)+8, ty(alt)+3);

  
  if (sbRoute?.dest && cur) {
    const distToDest = gcNM(cur.lat,cur.lon,sbRoute.dest.lat,sbRoute.dest.lon);
    if (distToDest <= maxDist) {
      vpCtx.fillStyle='#e05c5c';
      vpCtx.beginPath(); vpCtx.arc(tx(distToDest),ty(0),4,0,Math.PI*2); vpCtx.fill();
    }
  }
}

function startLerp(from, to) {
  if (raf) cancelAnimationFrame(raf);
  fromState=from; toState=to; frame=0;
  function tick() {
    frame++;
    const t=Math.min(frame/FPS,1);
    apply(lerpFull(fromState,toState,t));
    if (t<1) raf=requestAnimationFrame(tick); else cur=to;
  }
  raf=requestAnimationFrame(tick);
}

function setConn(ok) {
  $('conn-dot').className='dot '+(ok?'dot-ok':'dot-bad');
  $('conn-lbl').textContent=ok?'Connected':'Disconnected';
}

async function poll() {
  try {
    const r = await fetch(`http://${HOST}:${PORT}/api/position`, {cache:'no-store'});
    if (!r.ok) throw 0;
    const d = await r.json();
    setConn(true);
    $('last-upd').textContent = new Date().toLocaleTimeString();
    if (!cur) { cur=d; apply(d); map.setView([d.lat,d.lon],map.getZoom()); }
    else if (smoothMove) startLerp(cur, d);
    else { cur=d; apply(d); }
  } catch { setConn(false); }
  setTimeout(poll, POLL);
}

function setRouteMsg(cls, txt) {
  const m=$('sb-msg');
  m.className='msg-line'+(cls?' '+cls:'');
  m.textContent=txt;
}

// Sum the great-circle legs and pull a cruise level out of the waypoint list,
// used for plans that don't come with their own summary (FMS and files).
function routeStats(fixes) {
  let dist=0;
  for (let i=1;i<fixes.length;i++) dist+=gcNM(fixes[i-1].lat,fixes[i-1].lon,fixes[i].lat,fixes[i].lon);
  const maxAlt=fixes.reduce((m,f)=>Math.max(m,f.altFt||0),0);
  return {
    distanceNM: Math.round(dist),
    cruiseFL: maxAlt>=1000 ? 'FL'+Math.round(maxAlt/100) : (maxAlt?maxAlt+' ft':'--')
  };
}

// Waypoint timeline in the Route panel. Clicking an entry pans the map to it.
function buildWpList(fixes) {
  const wl=$('wp-list'); if(!wl) return;
  wl.innerHTML='';
  fixes.forEach((f,i)=>{
    const li=document.createElement('li');
    li.className='wp-item'+(i===0||i===fixes.length-1?' end':'');
    const sub=f.altFt>=1000?'FL'+Math.round(f.altFt/100):(f.altFt?f.altFt+' ft':'');
    li.innerHTML=`<span class="wp-dot"></span><span class="wp-ident">${f.ident}</span><span class="wp-sub">${sub}</span>`;
    li.addEventListener('click',()=>map.setView([f.lat,f.lon],Math.max(map.getZoom(),9)));
    wl.appendChild(li);
  });
}

// Single entry point for every source: draw the line, fill the info panel.
function showRoute(route) {
  clearRoute();
  const fixes=route.waypoints;
  sbRoute={ waypoints:fixes, dest:route.dest };
  drawRoute(fixes);

  const m=route.meta||{};
  $('rb-od').textContent    = (route.originIcao||'----')+' to '+(route.destIcao||'----');
  $('rb-src').textContent   = route.source||'';
  $('fs-ac').textContent    = m.aircraft||'--';
  $('fs-fl').textContent    = m.cruiseFL||'--';
  $('fs-dist').textContent  = (m.distanceNM!=null?m.distanceNM:'--')+' NM';
  $('fs-fuel').textContent  = m.fuelKg||'--';
  $('fs-fixes').textContent = fixes.length;
  $('fs-rte').textContent   = m.routeStr||fixes.map(f=>f.ident).join(' ');
  buildWpList(fixes);
  $('sb-data').hidden=false;

  setRouteMsg('ok', fixes.length+' waypoints loaded from '+(route.source||'plan').toLowerCase());
}

// FMS and file plans share the same computed-summary path.
function showGenericRoute(fixes, source) {
  const st=routeStats(fixes);
  const first=fixes[0], last=fixes[fixes.length-1];
  showRoute({
    source, waypoints:fixes,
    originIcao:first.ident, destIcao:last.ident,
    dest:{ lat:last.lat, lon:last.lon, icao:last.ident },
    meta:{ aircraft:'--', cruiseFL:st.cruiseFL, distanceNM:st.distanceNM, fuelKg:'--',
           routeStr:fixes.map(f=>f.ident).join(' ') }
  });
}

async function loadSimbrief(id) {
  setRouteMsg('', 'Loading from SimBrief...');
  try {
    const url=`https://www.simbrief.com/api/xml.fetcher.php?username=${encodeURIComponent(id)}&json=1`;
    const r=await fetch(url); if(!r.ok) throw new Error('HTTP '+r.status);
    const d=await r.json();
    if (d.fetch?.status==='Error') throw new Error(d.fetch.message||'SimBrief error');

    const fixes=(d.navlog?.fix??[]).filter(f=>f.pos_lat!=null&&f.pos_long!=null)
      .map(f=>({ident:f.ident||'?',lat:+f.pos_lat,lon:+f.pos_long,altFt:+(f.altitude_feet||0)}));
    if (fixes.length<2) throw new Error('No waypoints found in plan');

    const fuel=d.fuel?.plan_ramp;
    showRoute({
      source:'SimBrief', waypoints:fixes,
      originIcao:d.origin?.icao_code||'----', destIcao:d.destination?.icao_code||'----',
      dest:{ lat:+d.destination.pos_lat, lon:+d.destination.pos_long, icao:d.destination?.icao_code||'----' },
      meta:{
        aircraft:d.aircraft?.icaocode||d.aircraft?.name||'--',
        cruiseFL:'FL'+(d.general?.cruise_altitude||'--'),
        distanceNM:d.general?.route_distance!=null?+d.general.route_distance:null,
        fuelKg:fuel?(+fuel).toLocaleString()+' kg':'--',
        routeStr:d.general?.route_ifps||'DCT'
      }
    });
  } catch(e) {
    setRouteMsg('err', e.message);
  }
}

async function loadFMS() {
  setRouteMsg('', 'Reading the active FMS plan from the sim...');
  try {
    const r=await fetch(`http://${HOST}:${PORT}/api/flightplan`,{cache:'no-store'});
    if(!r.ok) throw new Error('Plugin not reachable (HTTP '+r.status+')');
    const d=await r.json();
    const fixes=(d.waypoints||[])
      .filter(w=>Number.isFinite(w.lat)&&Number.isFinite(w.lon))
      .map(w=>({ident:(w.ident||w.type||'WPT').trim()||'WPT',lat:w.lat,lon:w.lon,altFt:w.altFt||0}));
    if(fixes.length<2) throw new Error('No active flight plan in the sim FMS');
    showGenericRoute(fixes, 'Sim FMS');
  } catch(e) {
    setRouteMsg('err', e.message);
  }
}

// X-Plane .fms, both the old v3 and the current v11 layout. Every real
// waypoint row ends in lat/lon and starts with a numeric type code, so we
// key off that rather than tracking the header line by line.
function parseXplaneFms(text) {
  const fixes=[];
  for (const raw of text.split(/\r?\n/)) {
    const line=raw.trim();
    if(!line) continue;
    const t=line.split(/\s+/);
    if(t.length<3 || !/^\d+$/.test(t[0])) continue;
    const lat=parseFloat(t[t.length-2]), lon=parseFloat(t[t.length-1]);
    if(!Number.isFinite(lat)||!Number.isFinite(lon)) continue;
    if(Math.abs(lat)>90||Math.abs(lon)>180||(lat===0&&lon===0)) continue;
    let alt=t.length>=4?parseFloat(t[t.length-3]):0;
    if(!Number.isFinite(alt)) alt=0;
    let ident=t[1];
    if(!ident||/^-?\d/.test(ident)) ident=(t[0]==='28')?'LATLON':'WPT';
    fixes.push({ident,lat,lon,altFt:Math.round(alt)});
  }
  return fixes;
}

// Little Navmap .lnmpln is XML with a Waypoints list of Pos elements.
function parseLnmpln(text) {
  const doc=new DOMParser().parseFromString(text,'application/xml');
  if(doc.querySelector('parsererror')) throw new Error('That file is not valid XML');
  const fixes=[];
  doc.querySelectorAll('Waypoint').forEach(w=>{
    const pos=w.querySelector('Pos'); if(!pos) return;
    const lat=parseFloat(pos.getAttribute('Lat')), lon=parseFloat(pos.getAttribute('Lon'));
    if(!Number.isFinite(lat)||!Number.isFinite(lon)) return;
    const ident=(w.querySelector('Ident')?.textContent||w.querySelector('Name')?.textContent||'WPT').trim();
    let alt=parseFloat(pos.getAttribute('Alt'));
    fixes.push({ident,lat,lon,altFt:Number.isFinite(alt)?Math.round(alt):0});
  });
  return fixes;
}

async function loadPlanFile(file) {
  if(!file) return;
  setRouteMsg('', 'Reading '+file.name+'...');
  try {
    const text=await file.text();
    const isLnm=/\.lnmpln$/i.test(file.name)||/<LittleNavmap/i.test(text);
    const fixes=isLnm?parseLnmpln(text):parseXplaneFms(text);
    if(!fixes||fixes.length<2) throw new Error('No usable waypoints in that file');
    showGenericRoute(fixes, 'File');
  } catch(e) {
    setRouteMsg('err', e.message);
  }
}

// Compact oceanic-style position label for a lat/lon, e.g. "S05 E087",
// the same convention used for random-routing position reports.
function gridLabel(lat,lon) {
  const la=Math.abs(lat).toFixed(0).padStart(2,'0')+(lat<0?'S':'N');
  const lo=Math.abs(lon).toFixed(0).padStart(3,'0')+(lon<0?'W':'E');
  return la+' '+lo;
}

// Small filled triangle pointing along the route's local bearing, used for
// every waypoint that isn't an endpoint.
function routeTriangle(col,bearingDeg) {
  const html=`<svg viewBox="0 0 14 14" width="14" height="14" style="transform:rotate(${bearingDeg}deg)">
    <path d="M7 1.5 12 11 2 11z" fill="${col}" stroke="rgba(0,0,0,.5)" stroke-width="1"/>
  </svg>`;
  return L.divIcon({ html, className:'', iconSize:[14,14], iconAnchor:[7,7] });
}

// Legs longer than this with no intermediate fix (typical over open ocean)
// get synthetic position labels every ~150 NM, the same idea VATSIM Radar
// uses for its enroute grid references.
const LONG_LEG_NM = 150;

function drawRoute(fixes) {
  if (routeLayer) { map.removeLayer(routeLayer); routeLayer=null; }
  routeLayer = L.layerGroup();

  const latlngs=fixes.map(f=>[f.lat,f.lon]);
  const dk=document.documentElement.dataset.theme==='dark';
  const line   = dk ? '#e0a13a' : '#a8621a';
  const casing = dk ? 'rgba(0,0,0,.6)' : 'rgba(255,255,255,.75)';
  const endFill= dk ? '#0c0c0b' : '#ffffff';

  L.polyline(latlngs,{color:casing,weight:5,opacity:.9,lineJoin:'round',lineCap:'round'}).addTo(routeLayer);
  L.polyline(latlngs,{color:line,weight:2.2,opacity:.95,lineJoin:'round',lineCap:'round'}).addTo(routeLayer);

  const step=Math.max(1,Math.round(fixes.length/14));
  fixes.forEach((f,i)=>{
    const end=i===0||i===fixes.length-1;
    const popup=`<b>${f.ident}</b><br>${f.lat.toFixed(4)}, ${f.lon.toFixed(4)}`
      +(f.altFt?`<br>${f.altFt.toLocaleString()} ft`:'');

    if (end) {
      L.circleMarker([f.lat,f.lon],{radius:5,color:line,weight:2,fillColor:endFill,fillOpacity:1})
       .bindPopup(popup).addTo(routeLayer);
    } else {
      const b = brg(fixes[i-1].lat,fixes[i-1].lon,f.lat,f.lon);
      L.marker([f.lat,f.lon],{icon:routeTriangle(line,b),zIndexOffset:400})
       .bindPopup(popup).addTo(routeLayer);
    }

    if (end||i%step===0) {
      const fl=f.altFt>=1000?`<span class="wp-fl">FL${Math.round(f.altFt/100)}</span>`:'';
      L.marker([f.lat,f.lon],{
        icon:L.divIcon({html:`<div class="wp-tag"><span class="wp-id">${f.ident}</span>${fl}</div>`,className:'',iconAnchor:[-5,9]}),
        interactive:false, zIndexOffset:500
      }).addTo(routeLayer);
    }

    // Synthetic grid labels for long legs with nothing named in between.
    if (i>0) {
      const prev=fixes[i-1];
      const legNM=gcNM(prev.lat,prev.lon,f.lat,f.lon);
      if (legNM > LONG_LEG_NM) {
        const b=brg(prev.lat,prev.lon,f.lat,f.lon);
        const nPts=Math.floor(legNM/LONG_LEG_NM);
        for (let k=1;k<=nPts;k++) {
          const [glat,glon]=dest(prev.lat,prev.lon,LONG_LEG_NM*k,b);
          L.marker([glat,glon],{
            icon:L.divIcon({html:`<div class="grid-label">${gridLabel(glat,glon)}</div>`,className:'',iconAnchor:[-4,4]}),
            interactive:false, zIndexOffset:350
          }).addTo(routeLayer);
        }
      }
    }
  });

  routeLayer.addTo(map);
  if(latlngs.length) map.fitBounds(L.latLngBounds(latlngs),{padding:[45,45]});
}

function clearRoute() {
  if (routeLayer) { map.removeLayer(routeLayer); routeLayer=null; }
  sbRoute=null;
  $('sb-data').hidden=true;
  $('rb-src').textContent='';
  const wl=$('wp-list'); if(wl) wl.innerHTML='';
  setRouteMsg('', '');
}

// Overpass has several independent mirrors; the main one times out under
// load (504). Rotate through mirrors and retry once before giving up, so a
// single busy server doesn't just fail the request outright.
const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.osm.ch/api/interpreter',
];
async function fetchOverpass(query, timeoutMs) {
  let lastErr;
  for (let attempt=0; attempt<2; attempt++) {
    for (const base of OVERPASS_MIRRORS) {
      const ctrl=new AbortController();
      const to=setTimeout(()=>ctrl.abort(),timeoutMs);
      try {
        const r=await fetch(base+'?data='+encodeURIComponent(query),{signal:ctrl.signal});
        clearTimeout(to);
        if (r.status===504||r.status===429) { lastErr=new Error('Overpass HTTP '+r.status); continue; }
        if (!r.ok) throw new Error('Overpass HTTP '+r.status);
        return await r.json();
      } catch(e) {
        clearTimeout(to);
        lastErr = e.name==='AbortError' ? new Error('Overpass timed out') : e;
      }
    }
  }
  throw new Error((lastErr&&lastErr.message||'Overpass request failed')+'. The servers are busy, try again in a minute.');
}

async function loadNavaids() {
  if (!showNavaids) return;
  if (navLayer) { map.removeLayer(navLayer); navLayer=null; }
  const msg=$('nav-msg');
  msg.className='msg-line'; msg.textContent='Fetching navaids...';

  const b=map.getBounds();
  const bbox=`${b.getSouth()},${b.getWest()},${b.getNorth()},${b.getEast()}`;
  const q=`[out:json][timeout:20];(node["aeroway"="navaid"](${bbox});node["aeroway"="waypoint"](${bbox}););out body;`;

  try {
    const d=await fetchOverpass(q, 20000);
    navLayer=L.layerGroup();
    let cnt=0;
    d.elements.forEach(el=>{
      if (!el.lat) return;
      const t=el.tags||{};
      const type=(t['navaid:type']||t.type||'').toUpperCase();
      const name=t.name||t.ref||t['icao:name']||'';
      let kind='fix', show=showFix;
      if (type.includes('VOR')||type.includes('DME')) { kind='vor'; show=showVOR; }
      else if (type.includes('NDB'))                  { kind='ndb'; show=showNDB; }
      if (!show) return;
      const lbl = (t.ref||name||type).substring(0,5).toUpperCase();
      const mk=L.marker([el.lat,el.lon],{
        icon:navSymbol(kind,lbl), interactive:true, zIndexOffset:200
      }).bindPopup(`<b>${name||lbl}</b><br>Type: ${type||'FIX'}`+(t.frequency?`<br>Freq: ${t.frequency}`:''));
      mk.addTo(navLayer);
      cnt++;
    });
    navLayer.addTo(map);
    msg.className='msg-line ok'; msg.textContent=cnt+' navaids loaded';
  } catch(e) {
    msg.className='msg-line err'; msg.textContent=e.message;
  }
}

async function loadAirways() {
  if (airwayLayer) { map.removeLayer(airwayLayer); airwayLayer=null; }
  const msg=$('awy-msg');
  msg.className='msg-line'; msg.textContent='Fetching airways...';

  const b=map.getBounds();
  const bbox=`${b.getSouth()},${b.getWest()},${b.getNorth()},${b.getEast()}`;
  const q=`[out:json][timeout:25];relation["route"="airway"](${bbox});out geom;`;

  try {
    const d=await fetchOverpass(q, 25000);
    airwayLayer=L.layerGroup();
    let cnt=0;
    d.elements.forEach(rel=>{
      if (!rel.members) return;
      const name=rel.tags?.name||rel.tags?.ref||'';
      rel.members.forEach(m=>{
        if (m.type==='way'&&m.geometry) {
          const coords=m.geometry.map(p=>[p.lat,p.lon]);
          L.polyline(coords,{color:'#6b7a96',weight:1,opacity:.6,dashArray:'2 5'})
           .bindPopup(`<b>Airway:</b> ${name}`).addTo(airwayLayer);
        }
      });
      cnt++;
    });
    airwayLayer.addTo(map);
    msg.className='msg-line ok'; msg.textContent=cnt+' airways loaded';
  } catch(e) {
    msg.className='msg-line err'; msg.textContent=e.message;
  }
}

// ---- Live VATSIM / IVAO traffic ----------------------------------------
// Both feeds are public JSON with permissive CORS, so this runs entirely in
// the browser: no plugin/server changes needed. Raw pilot lists are kept in
// memory and re-filtered to the current map view on every pan/zoom, so
// panning never triggers a new network request, only the periodic refresh
// timer does.

let showVatsim=false, showIvao=false;
let vatsimPilots=[], ivaoPilots=[];
let vatsimLayer=null, ivaoLayer=null, trafficTimer=null;
const TRAFFIC_MIN_ZOOM = 4;   // below this the feed would be thousands of markers
const TRAFFIC_REFRESH_MS = 15000; // matches VATSIM's own feed update cadence

function trafficIcon(hdg, network) {
  const col = network==='ivao' ? getComputedStyle(document.documentElement).getPropertyValue('--ivao').trim()
                                : getComputedStyle(document.documentElement).getPropertyValue('--vatsim').trim();
  return planeIcon(hdg, { fill:col, stroke:'rgba(0,0,0,.55)', size:22, opacity:.9 });
}

function trafficPopupHtml(p) {
  const net = p.network==='ivao' ? 'IVAO' : 'VATSIM';
  const dep = p.dep || '----', arr = p.arr || '----';
  return `<div class="traffic-pop">
    <div class="traffic-pop-head">
      <span class="traffic-pop-cs">${p.callsign}</span>
      <span class="traffic-pop-net ${p.network}">${net}</span>
    </div>
    <div class="traffic-pop-row"><span>Altitude</span><span>${Math.round(p.alt).toLocaleString()} ft</span></div>
    <div class="traffic-pop-row"><span>Speed</span><span>${Math.round(p.gs)} kts</span></div>
    <div class="traffic-pop-route">${dep} &rarr; ${arr}</div>
  </div>`;
}

async function fetchVatsimTraffic() {
  try {
    const r=await fetch('https://data.vatsim.net/v3/vatsim-data.json',{cache:'no-store'});
    if(!r.ok) throw new Error('HTTP '+r.status);
    const d=await r.json();
    vatsimPilots=(d.pilots||[]).filter(p=>p.latitude!=null&&p.longitude!=null).map(p=>({
      network:'vatsim', callsign:p.callsign, lat:p.latitude, lon:p.longitude,
      hdg:p.heading||0, alt:p.altitude||0, gs:p.groundspeed||0,
      dep:p.flight_plan?.departure||'', arr:p.flight_plan?.arrival||''
    }));
  } catch(e) {
    vatsimPilots=[];
    setTrafficMsg('err','VATSIM feed unreachable: '+e.message);
  }
}

async function fetchIvaoTraffic() {
  try {
    const r=await fetch('https://api.ivao.aero/v2/tracker/whazzup',{cache:'no-store'});
    if(!r.ok) throw new Error('HTTP '+r.status);
    const d=await r.json();
    ivaoPilots=(d.clients?.pilots||[]).filter(p=>p.lastTrack).map(p=>({
      network:'ivao', callsign:p.callsign, lat:p.lastTrack.latitude, lon:p.lastTrack.longitude,
      hdg:p.lastTrack.heading||0, alt:p.lastTrack.altitude||0, gs:p.lastTrack.groundSpeed||0,
      dep:p.flightPlan?.departureId||'', arr:p.flightPlan?.arrivalId||''
    }));
  } catch(e) {
    ivaoPilots=[];
    setTrafficMsg('err','IVAO feed unreachable: '+e.message);
  }
}

function setTrafficMsg(cls, txt) {
  const m=$('traffic-msg'); if(!m) return;
  m.className='msg-line'+(cls?' '+cls:''); m.textContent=txt;
}

function renderTraffic() {
  if (vatsimLayer) { map.removeLayer(vatsimLayer); vatsimLayer=null; }
  if (ivaoLayer)   { map.removeLayer(ivaoLayer);   ivaoLayer=null;   }
  if (!showVatsim && !showIvao) { setTrafficMsg('',''); return; }
  if (map.getZoom() < TRAFFIC_MIN_ZOOM) { setTrafficMsg('','Zoom in to see traffic'); return; }

  const b=map.getBounds();
  let shown=0;

  if (showVatsim) {
    vatsimLayer=L.layerGroup();
    vatsimPilots.filter(p=>b.contains([p.lat,p.lon])).forEach(p=>{
      L.marker([p.lat,p.lon],{icon:trafficIcon(p.hdg,'vatsim'),zIndexOffset:300})
       .bindPopup(trafficPopupHtml(p)).addTo(vatsimLayer);
      shown++;
    });
    vatsimLayer.addTo(map);
  }
  if (showIvao) {
    ivaoLayer=L.layerGroup();
    ivaoPilots.filter(p=>b.contains([p.lat,p.lon])).forEach(p=>{
      L.marker([p.lat,p.lon],{icon:trafficIcon(p.hdg,'ivao'),zIndexOffset:300})
       .bindPopup(trafficPopupHtml(p)).addTo(ivaoLayer);
      shown++;
    });
    ivaoLayer.addTo(map);
  }
  setTrafficMsg('ok', shown+' aircraft in view');
}

async function refreshTrafficData() {
  const jobs=[];
  if (showVatsim) jobs.push(fetchVatsimTraffic());
  if (showIvao)   jobs.push(fetchIvaoTraffic());
  if (jobs.length) { setTrafficMsg('','Loading traffic...'); await Promise.all(jobs); }
  renderTraffic();
}

function ensureTrafficTimer() {
  if (trafficTimer) return;
  trafficTimer=setInterval(refreshTrafficData, TRAFFIC_REFRESH_MS);
}
function stopTrafficTimerIfIdle() {
  if (showVatsim || showIvao) return;
  clearInterval(trafficTimer); trafficTimer=null;
}

function getACtx() {
  if (!audioCtx) audioCtx=new(window.AudioContext||window.webkitAudioContext)();
  return audioCtx;
}
function stopSound() {
  if (!soundNodes) return;
  soundNodes.forEach(n=>{ try{n.stop&&n.stop();n.disconnect&&n.disconnect();}catch(_){} });
  soundNodes=null;
}

function playBeep(vol) {
  const ctx=getACtx(), ns=[];
  let t=ctx.currentTime;
  for(let i=0;i<8;i++){
    const o=ctx.createOscillator(), g=ctx.createGain();
    o.type='sine'; o.frequency.value=880;
    g.gain.setValueAtTime(0,t+i*.25);
    g.gain.linearRampToValueAtTime(vol,t+i*.25+.01);
    g.gain.linearRampToValueAtTime(0,t+i*.25+.18);
    o.connect(g); g.connect(ctx.destination);
    o.start(t+i*.25); o.stop(t+i*.25+.2);
    ns.push(o,g);
  }
  soundNodes=ns; setTimeout(stopSound,2500);
}
function playChime(vol) {
  const ctx=getACtx(), ns=[], notes=[523.25,659.25,783.99,1046.5];
  notes.forEach((f,i)=>{
    const o=ctx.createOscillator(), g=ctx.createGain();
    o.type='triangle'; o.frequency.value=f;
    const t=ctx.currentTime+i*.22;
    g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(vol,t+.02);
    g.gain.exponentialRampToValueAtTime(.001,t+1.2);
    o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t+1.3);
    ns.push(o,g);
  });
  soundNodes=ns;
  setTimeout(()=>playChime(vol*.85),1400);
}
function playSiren(vol) {
  const ctx=getACtx(), o=ctx.createOscillator(), g=ctx.createGain();
  o.type='sawtooth'; g.gain.value=vol*.5;
  const sweep=()=>{
    o.frequency.cancelScheduledValues(ctx.currentTime);
    o.frequency.setValueAtTime(400,ctx.currentTime);
    o.frequency.linearRampToValueAtTime(1200,ctx.currentTime+.5);
    o.frequency.linearRampToValueAtTime(400,ctx.currentTime+1.0);
  };
  sweep(); const ti=setInterval(sweep,1000);
  o.connect(g); g.connect(ctx.destination); o.start();
  soundNodes=[o,g]; setTimeout(()=>{clearInterval(ti);stopSound();},5000);
}
function playAlarm() {
  stopSound();
  if(alarmSnd==='chime') playChime(alarmVol);
  else if(alarmSnd==='siren') playSiren(alarmVol);
  else playBeep(alarmVol);
}

function tickCountdown() {
  if (!armed||!deadline) return;
  const now=Date.now(), toTod=deadline-now, toFire=deadline-leadMs-now;

  if (!fired && toFire<=0 && toTod>0) {
    fired=true; fireAlarm();
  }

  const rfill=$('ring-fg');
  if (toTod<=0) {
    setBanner('idle','🔕','T/D time passed');
    $('ring-time').textContent='00:00'; $('ring-sub').textContent='Done';
    rfill.style.strokeDashoffset=RING_C; return;
  }

  const s=Math.ceil(toTod/1000), hh=Math.floor(s/3600), mm=Math.floor(s%3600/60), ss=s%60;
  $('ring-time').textContent = hh>0
    ? hh+':'+String(mm).padStart(2,'0')+':'+String(ss).padStart(2,'0')
    : String(mm).padStart(2,'0')+':'+String(ss).padStart(2,'0');
  $('ring-sub').textContent = 'to T/D';

  rfill.classList.remove('urgent','critical');
  if (toFire>0) {
    setBanner('armed','🔔','Alarm set - '+(leadMs/60000).toFixed(0)+'m before T/D');
    rfill.style.strokeDashoffset = RING_C*(toFire/leadMs);
  } else {
    setBanner('firing','🚨','DESCEND NOW');
    rfill.style.strokeDashoffset=0; rfill.classList.add('critical');
  }
}

function setBanner(cls, ico, txt) {
  // `cls` drives both the banner state and the colour of the CSS status dot.
  $('alarm-banner').className='alarm-'+cls;
  $('alarm-txt').textContent=txt;
}

function fireAlarm() {
  $('alarm-overlay').hidden=false;
  $('alarm-dest-txt').textContent = sbRoute?.dest?.icao
    ? 'Time to descend for '+sbRoute.dest.icao+'.' : 'Time to start your descent.';
  playAlarm();
  const rep=setInterval(()=>{
    if($('alarm-overlay').hidden){clearInterval(rep);return;}
    playAlarm();
  },3000);
  navigator.vibrate&&navigator.vibrate([500,200,500,200,500]);
}

function armAlarm() {
  const h=parseInt($('tod-h').value)||0, m=parseInt($('tod-m').value)||0;
  const totalMs=(h*3600+m*60)*1000;
  if(totalMs<=0){alert('Enter a time greater than 0.');return;}
  deadline=Date.now()+totalMs; armed=true; fired=false;
  $('countdown-box').hidden=false;
  $('btn-disarm').hidden=false;
  $('btn-arm').textContent='Update alarm';
  setBanner('armed','🔔','Armed - '+(leadMs/60000).toFixed(0)+'m warning');
  clearInterval(alarmTick); alarmTick=setInterval(tickCountdown,500); tickCountdown();
}

function disarm() {
  armed=false; fired=false; deadline=null; clearInterval(alarmTick); stopSound();
  $('alarm-overlay').hidden=true; $('countdown-box').hidden=true;
  $('btn-disarm').hidden=true; $('btn-arm').textContent='Set alarm';
  setBanner('idle','🔕','Not armed');
  $('ring-fg').style.strokeDashoffset=RING_C;
  $('ring-fg').classList.remove('urgent','critical');
}

function setTheme(t) {
  document.documentElement.dataset.theme=t;
  localStorage.setItem('dt-theme',t);
  if(typeof setBaseTiles==='function') setBaseTiles();
  if(trailLine) trailLine.setStyle({color:t==='dark'?'#3b9ae8':'#1f6fc4'});
  if(cur) drawWind(cur.wind_dir, cur.wind_spd_kts);
  if(acMark) acMark.setIcon(planeIcon(cur?cur.heading:0));
  if(typeof renderTraffic==='function' && (showVatsim||showIvao)) renderTraffic();
}

document.querySelectorAll('.tab').forEach(btn=>{
  btn.addEventListener('click',()=>{
    const id=btn.dataset.tab;
    document.querySelectorAll('.tab').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
    btn.classList.add('active');
    $('panel-'+id).classList.add('active');
  });
});

function savePort(val) {
  const p=parseInt(val,10);
  if(isNaN(p)||p<1024||p>65535){return false;}
  PORT=p; localStorage.setItem('dt-port',p);
  $('port-display').textContent=p;
  $('host-display').textContent=HOST;
  $('port-input').value=p;
  return true;
}

$('theme-btn').addEventListener('click',()=>setTheme(document.documentElement.dataset.theme==='dark'?'light':'dark'));

$('opt-follow').addEventListener('change',e=>{followAc=e.target.checked;if(followAc&&cur)map.setView([cur.lat,cur.lon],map.getZoom());});
$('opt-trail').addEventListener('change',e=>{showTrail=e.target.checked;if(!showTrail&&trailLine){map.removeLayer(trailLine);trailLine=null;trailPts=[];}});
$('opt-sat').addEventListener('change',e=>{satOn=e.target.checked;setBaseTiles();});
$('opt-smooth').addEventListener('change',e=>smoothMove=e.target.checked);

$('zoom-sl').addEventListener('input',e=>{const z=+e.target.value;$('zoom-val').textContent=z;map.setZoom(z);});
map.on('zoom',()=>{const z=map.getZoom();$('zoom-sl').value=z;$('zoom-val').textContent=z;});
$('trail-sl').addEventListener('input',e=>{trailMax=+e.target.value;$('trail-val').textContent=trailMax+' pts';while(trailPts.length>trailMax)trailPts.shift();if(trailLine)trailLine.setLatLngs(trailPts);});
$('btn-centre').addEventListener('click',()=>{if(cur){followAc=true;$('opt-follow').checked=true;map.setView([cur.lat,cur.lon],map.getZoom(),{animate:true});}});
$('btn-clear-trail').addEventListener('click',()=>{trailPts=[];if(trailLine){map.removeLayer(trailLine);trailLine=null;}});
map.on('dragstart',()=>{followAc=false;$('opt-follow').checked=false;});

// Filled SimBrief box loads SimBrief; empty box falls back to the sim FMS.
$('btn-load').addEventListener('click',()=>{const id=$('sb-id').value.trim();if(id)loadSimbrief(id);else loadFMS();});
$('sb-id').addEventListener('keydown',e=>{if(e.key==='Enter')$('btn-load').click();});
$('btn-clr-route').addEventListener('click',clearRoute);
$('sb-id').addEventListener('input',e=>localStorage.setItem('dt-sbid',e.target.value.trim()));
$('btn-fms').addEventListener('click',loadFMS);
$('fp-file').addEventListener('change',e=>{loadPlanFile(e.target.files[0]);e.target.value='';});
(function(){
  const drop=$('fp-drop'); if(!drop) return;
  ['dragover','dragenter'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.add('drag');}));
  ['dragleave','dragend'].forEach(ev=>drop.addEventListener(ev,()=>drop.classList.remove('drag')));
  drop.addEventListener('drop',e=>{e.preventDefault();drop.classList.remove('drag');if(e.dataTransfer.files[0])loadPlanFile(e.dataTransfer.files[0]);});
})();

$('opt-navaids').addEventListener('change',e=>{showNavaids=e.target.checked;if(showNavaids)loadNavaids();else if(navLayer){map.removeLayer(navLayer);navLayer=null;}});
$('opt-vor').addEventListener('change',e=>{showVOR=e.target.checked;if(showNavaids)loadNavaids();});
$('opt-ndb').addEventListener('change',e=>{showNDB=e.target.checked;if(showNavaids)loadNavaids();});
$('opt-fixes').addEventListener('change',e=>{showFix=e.target.checked;if(showNavaids)loadNavaids();});
$('btn-load-navaids').addEventListener('click',loadNavaids);
$('btn-load-airways').addEventListener('click',()=>{showAirways=true;$('opt-airways').checked=true;loadAirways();});
$('opt-airways').addEventListener('change',e=>{showAirways=e.target.checked;if(!showAirways&&airwayLayer){map.removeLayer(airwayLayer);airwayLayer=null;}});

let navReloadTimer=null;
map.on('moveend',()=>{
  if (!showNavaids) return;
  clearTimeout(navReloadTimer);
  navReloadTimer=setTimeout(loadNavaids, 600);
});

$('opt-vatsim').addEventListener('change',e=>{
  showVatsim=e.target.checked;
  if(showVatsim){ ensureTrafficTimer(); refreshTrafficData(); }
  else { renderTraffic(); stopTrafficTimerIfIdle(); }
});
$('opt-ivao').addEventListener('change',e=>{
  showIvao=e.target.checked;
  if(showIvao){ ensureTrafficTimer(); refreshTrafficData(); }
  else { renderTraffic(); stopTrafficTimerIfIdle(); }
});
// Panning only re-filters the already-fetched pilot lists to the new view,
// it never triggers a network request.
let trafficRedrawTimer=null;
map.on('moveend',()=>{
  if (!showVatsim && !showIvao) return;
  clearTimeout(trafficRedrawTimer);
  trafficRedrawTimer=setTimeout(renderTraffic, 200);
});

$('opt-tod-marker').addEventListener('change',e=>{showTodMark=e.target.checked;if(!showTodMark&&todMark){map.removeLayer(todMark);todMark=null;}if(showTodMark&&cur)updateTodMark(cur);});
$('tod-angle').addEventListener('input',e=>{todAngle=+e.target.value;$('tod-angle-val').textContent=todAngle+'°';if(cur){updateTodMark(cur);drawProfile(cur);}});
$('btn-arm').addEventListener('click',armAlarm);
$('btn-disarm').addEventListener('click',disarm);
$('btn-test-snd').addEventListener('click',()=>getACtx().resume().then(()=>playAlarm()));
$('btn-dismiss').addEventListener('click',()=>{$('alarm-overlay').hidden=true;stopSound();});
$('alarm-lead').addEventListener('input',e=>{leadMs=+e.target.value*60000;$('lead-val').textContent=e.target.value;});
$('alarm-vol').addEventListener('input',e=>{alarmVol=+e.target.value/100;$('vol-val').textContent=e.target.value+'%';});
document.querySelectorAll('input[name="snd"]').forEach(r=>r.addEventListener('change',e=>alarmSnd=e.target.value));

$('btn-save-port').addEventListener('click',()=>{
  if(savePort($('port-input').value)){$('conn-msg').className='msg-line ok';$('conn-msg').textContent='Port updated to '+PORT+'. Reconnecting...';}
  else{$('conn-msg').className='msg-line err';$('conn-msg').textContent='Invalid port (1024-65535)';}
});
$('port-input').addEventListener('keydown',e=>{if(e.key==='Enter')$('btn-save-port').click();});
$('btn-test-conn').addEventListener('click',async()=>{
  const m=$('conn-msg');
  m.className='msg-line'; m.textContent='Testing...';
  try {
    const r=await fetch(`http://${HOST}:${PORT}/api/health`,{cache:'no-store'});
    const d=await r.json();
    m.className='msg-line ok'; m.textContent='Connected! Plugin: '+d.plugin+' v'+d.version;
  } catch {
    m.className='msg-line err'; m.textContent='Could not reach '+HOST+':'+PORT+' -- check the address and firewall';
  }
});

(function init() {
  const theme=localStorage.getItem('dt-theme')||'dark';
  setTheme(theme);

  const sid=localStorage.getItem('dt-sbid'); if(sid) $('sb-id').value=sid;
  const prt=localStorage.getItem('dt-port'); if(prt) { $('port-input').value=prt; $('port-display').textContent=prt; }

  
  (function updateLanUrl() {
    const el = $('lan-url');
    if (!el) return;
    const h = window.location.hostname;
    const p = PORT;
    if (!h || h === '127.0.0.1' || h === 'localhost') {
      el.textContent = 'Open from the X-Plane PC first to find your network IP';
      el.style.color = 'var(--muted)';
    } else {
      el.textContent = 'http://' + h + ':' + p;
    }
    const fw = $('fw-port'); if (fw) fw.textContent = p;
    const hd = $('host-display'); if (hd) hd.textContent = h || '127.0.0.1';
  })();

  drawADI(0,0); drawWind(0,0);
  setConn(false);
  poll();
  checkForUpdate();
})();

// ---- update check against the latest GitHub release ----

// Returns 1 if a > b, -1 if a < b, 0 if equal. Plain numeric semver, enough
// for this project's x.y.z tags.
function cmpSemver(a, b) {
  const pa=a.split('.').map(Number), pb=b.split('.').map(Number);
  for (let i=0;i<3;i++){ const x=pa[i]||0, y=pb[i]||0; if(x>y) return 1; if(x<y) return -1; }
  return 0;
}

async function checkForUpdate() {
  try {
    const r=await fetch('https://api.github.com/repos/DogeCPP/DogeTracker/releases/latest',{cache:'no-store'});
    if(!r.ok) return;
    const d=await r.json();
    const latest=(d.tag_name||'').replace(/^v/,'').trim();
    if(!/^\d+\.\d+\.\d+$/.test(latest)) return;
    // Only prompt when the release is actually newer than what's running, and
    // the user hasn't already dismissed this exact version.
    if(cmpSemver(latest, APP_VERSION) <= 0) return;
    if(localStorage.getItem('dt-skip-ver')===latest) return;
    $('update-txt').textContent='DogeTracker '+latest+' is out. You have '+APP_VERSION+'.';
    $('update-btn').href=d.html_url||RELEASES_URL;
    $('update-banner').hidden=false;
    $('update-close').onclick=()=>{ localStorage.setItem('dt-skip-ver',latest); $('update-banner').hidden=true; };
  } catch(_){ /* offline or rate-limited: silently skip */ }
}

// ---- top bar clock, flight card collapse, map layers drawer ----

(function zuluClock() {
  const el=$('z-clock'); if(!el) return;
  const tick=()=>{
    const d=new Date();
    el.textContent=String(d.getUTCHours()).padStart(2,'0')+':'+String(d.getUTCMinutes()).padStart(2,'0')+'Z';
  };
  tick(); setInterval(tick,1000);
})();

(function panelCollapse() {
  const btn=$('fp-collapse'), fp=document.getElementById('float-panel');
  if(!btn||!fp) return;
  btn.addEventListener('click',()=>fp.classList.toggle('collapsed'));
  // Card title follows the active tab, and switching tabs reopens the card.
  const titles={flight:'Your aircraft',route:'Flight plan',tod:'Descent',settings:'Setup'};
  document.querySelectorAll('.tab').forEach(t=>t.addEventListener('click',()=>{
    fp.classList.remove('collapsed');
    const ti=$('fp-title'); if(ti&&titles[t.dataset.tab]) ti.textContent=titles[t.dataset.tab];
  }));
})();

(function layersDrawer() {
  const tab=$('drawer-tab'), drawer=document.getElementById('map-drawer');
  if(!tab||!drawer) return;
  tab.addEventListener('click',()=>drawer.classList.toggle('open'));
})();
