'use strict';

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
let ngKey = localStorage.getItem('dt-ngkey') || '';

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

function planeIcon(hdg) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 80" width="48" height="60">
  <g transform="rotate(${hdg},32,40)">
    <path fill="#4d9fff" stroke="#1a4fa8" stroke-width=".8" stroke-linejoin="round" d="
      M32,5 C34,5 36,14 36,25
      L61,47 57,52 36,38
      C36,46 35,55 33.5,58
      L47,69 45,72 33.5,66
      L32,77 30,77
      L28.5,66 19,72 17,69
      L30.5,58
      C29,55 28,46 28,38
      L7,52 3,47 28,25
      C28,14 30,5 32,5Z
    "/>
    <ellipse cx="32" cy="13" rx="2" ry="3.5" fill="rgba(255,255,255,.3)"/>
  </g>
</svg>`;
  return L.divIcon({
    html: `<div style="filter:drop-shadow(0 2px 5px rgba(0,0,0,.55))">${svg}</div>`,
    className:'', iconSize:[48,60], iconAnchor:[24,30], popupAnchor:[0,-32]
  });
}

const map = L.map('map', { center:[51.5,-0.1], zoom:12, zoomControl:true });
const tiles = {
  osm: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom:19 }),
  sat: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    { attribution:'© Esri', maxZoom:19 })
};
tiles.osm.addTo(map);

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
    const col = document.documentElement.dataset.theme==='dark'?'#4d9fff':'#1d5bbf';
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
  $('v-vs').className = 'stat-val '+(vs>100?'climb':vs<-100?'descend':'level');

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
  const fg=dk?'#6b7a96':'#6b7a96', ac='#4d9fff';
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
  const ac = dk?'#4d9fff':'#1d5bbf';
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

  
  vpCtx.strokeStyle=dk?'rgba(77,159,255,.2)':'rgba(29,91,191,.2)';
  vpCtx.lineWidth=1.5; vpCtx.setLineDash([4,3]);
  vpCtx.beginPath(); vpCtx.moveTo(tx(0),ty(alt)); vpCtx.lineTo(tx(todNm),ty(0)); vpCtx.stroke();
  vpCtx.setLineDash([]);

  
  vpCtx.beginPath();
  vpCtx.moveTo(tx(0), ty(0));
  vpCtx.lineTo(tx(0), ty(alt));
  vpCtx.lineTo(tx(todNm), ty(0));
  vpCtx.closePath();
  const grad = vpCtx.createLinearGradient(0, PAD.t, 0, PAD.t+ch);
  grad.addColorStop(0, dk?'rgba(77,159,255,.18)':'rgba(29,91,191,.12)');
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

async function loadSimbrief(id) {
  const msg=$('sb-msg');
  msg.className='msg-line'; msg.textContent='Loading...';
  clearRoute();
  try {
    const url=`https://www.simbrief.com/api/xml.fetcher.php?username=${encodeURIComponent(id)}&json=1`;
    const r=await fetch(url); if(!r.ok) throw new Error('HTTP '+r.status);
    const d=await r.json();
    if (d.fetch?.status==='Error') throw new Error(d.fetch.message||'SimBrief error');

    const fixes=(d.navlog?.fix??[]).filter(f=>f.pos_lat!=null&&f.pos_long!=null)
      .map(f=>({ident:f.ident||'?',lat:+f.pos_lat,lon:+f.pos_long,altFt:+(f.altitude_feet||0)}));
    if (fixes.length<2) throw new Error('No waypoints found in plan');

    const orig=d.origin?.icao_code||'----', dst=d.destination?.icao_code||'----';
    sbRoute = {
      waypoints:fixes,
      dest:{ lat:+d.destination.pos_lat, lon:+d.destination.pos_long, icao:dst }
    };
    drawRoute(fixes);

    $('rb-od').textContent      = orig+' to '+dst;
    $('fs-ac').textContent      = d.aircraft?.icaocode||d.aircraft?.name||'--';
    $('fs-fl').textContent      = 'FL'+(d.general?.cruise_altitude||'--');
    $('fs-dist').textContent    = (d.general?.route_distance||'--')+' NM';
    const fuel = d.fuel?.plan_ramp;
    $('fs-fuel').textContent    = fuel ? (+fuel).toLocaleString()+' kg' : '--';
    $('fs-fixes').textContent   = fixes.length;
    $('fs-rte').textContent     = d.general?.route_ifps||'DCT';
    $('sb-data').hidden=false;

    msg.className='msg-line ok';
    msg.textContent=fixes.length+' fixes loaded';
  } catch(e) {
    msg.className='msg-line err'; msg.textContent=e.message;
  }
}

function drawRoute(fixes) {
  if (routeLayer) { map.removeLayer(routeLayer); routeLayer=null; }
  routeLayer = L.layerGroup();
  L.polyline(fixes.map(f=>[f.lat,f.lon]),{color:'#e09b3d',weight:2.5,opacity:.85,dashArray:'6 4'}).addTo(routeLayer);
  const step=Math.max(1,Math.floor(fixes.length/16));
  fixes.forEach((f,i)=>{
    const end=i===0||i===fixes.length-1, col=end?'#e05c5c':'#e09b3d', r=end?6:3;
    L.circleMarker([f.lat,f.lon],{radius:r,color:col,fillColor:col,fillOpacity:.95,weight:1.2})
     .bindPopup(`<b>${f.ident}</b><br>${f.lat.toFixed(4)}, ${f.lon.toFixed(4)}`+(f.altFt?`<br>${f.altFt.toLocaleString()} ft`:'')).addTo(routeLayer);
    if (end||i%step===0)
      L.marker([f.lat,f.lon],{
        icon:L.divIcon({html:`<div class="wp-tag">${f.ident}</div>`,className:'',iconAnchor:[-3,8]}),
        interactive:false,zIndexOffset:500
      }).addTo(routeLayer);
  });
  routeLayer.addTo(map);
  map.fitBounds(L.latLngBounds(fixes.map(f=>[f.lat,f.lon])),{padding:[40,40]});
}

function clearRoute() {
  if (routeLayer) { map.removeLayer(routeLayer); routeLayer=null; }
  sbRoute=null;
  $('sb-data').hidden=true;
  $('sb-msg').className='msg-line';
  $('sb-msg').textContent='';
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
    const r=await fetch('https://overpass-api.de/api/interpreter?data='+encodeURIComponent(q));
    if(!r.ok) throw new Error('Overpass HTTP '+r.status);
    const d=await r.json();
    navLayer=L.layerGroup();
    let cnt=0;
    d.elements.forEach(el=>{
      if (!el.lat) return;
      const t=el.tags||{};
      const type=(t['navaid:type']||t.type||'').toUpperCase();
      const name=t.name||t.ref||t['icao:name']||'';
      let cls='nav-fix', show=showFix;
      if (type.includes('VOR')||type.includes('DME')) { cls='nav-vor'; show=showVOR; }
      else if (type.includes('NDB'))                  { cls='nav-ndb'; show=showNDB; }
      if (!show) return;
      const lbl = name ? name.substring(0,5) : type.substring(0,3);
      const mk=L.marker([el.lat,el.lon],{
        icon:L.divIcon({html:`<div class="nav-tag ${cls}">${lbl}</div>`,className:'',iconAnchor:[0,8]}),
        interactive:true, zIndexOffset:200
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
    const r=await fetch('https://overpass-api.de/api/interpreter?data='+encodeURIComponent(q));
    if(!r.ok) throw new Error('Overpass HTTP '+r.status);
    const d=await r.json();
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
  $('alarm-banner').className='alarm-'+cls;
  $('alarm-ico').textContent=ico; $('alarm-txt').textContent=txt;
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
  $('theme-btn').textContent=t==='dark'?'☀':'☾';
  localStorage.setItem('dt-theme',t);
  if(trailLine) trailLine.setStyle({color:t==='dark'?'#4d9fff':'#1d5bbf'});
  if(cur) drawWind(cur.wind_dir, cur.wind_spd_kts);
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
$('opt-sat').addEventListener('change',e=>{if(e.target.checked){map.removeLayer(tiles.osm);tiles.sat.addTo(map);}else{map.removeLayer(tiles.sat);tiles.osm.addTo(map);}});
$('opt-smooth').addEventListener('change',e=>smoothMove=e.target.checked);

$('zoom-sl').addEventListener('input',e=>{const z=+e.target.value;$('zoom-val').textContent=z;map.setZoom(z);});
map.on('zoom',()=>{const z=map.getZoom();$('zoom-sl').value=z;$('zoom-val').textContent=z;});
$('trail-sl').addEventListener('input',e=>{trailMax=+e.target.value;$('trail-val').textContent=trailMax+' pts';while(trailPts.length>trailMax)trailPts.shift();if(trailLine)trailLine.setLatLngs(trailPts);});
$('btn-centre').addEventListener('click',()=>{if(cur){followAc=true;$('opt-follow').checked=true;map.setView([cur.lat,cur.lon],map.getZoom(),{animate:true});}});
$('btn-clear-trail').addEventListener('click',()=>{trailPts=[];if(trailLine){map.removeLayer(trailLine);trailLine=null;}});
map.on('dragstart',()=>{followAc=false;$('opt-follow').checked=false;});

$('btn-load').addEventListener('click',()=>{const id=$('sb-id').value.trim();if(!id){$('sb-msg').className='msg-line err';$('sb-msg').textContent='Enter your SimBrief Pilot ID or username';return;}loadSimbrief(id);});
$('sb-id').addEventListener('keydown',e=>{if(e.key==='Enter')$('btn-load').click();});
$('btn-clr-route').addEventListener('click',clearRoute);
$('sb-id').addEventListener('input',e=>localStorage.setItem('dt-sbid',e.target.value.trim()));

$('opt-navaids').addEventListener('change',e=>{showNavaids=e.target.checked;if(showNavaids)loadNavaids();else if(navLayer){map.removeLayer(navLayer);navLayer=null;}});
$('opt-vor').addEventListener('change',e=>{showVOR=e.target.checked;if(showNavaids)loadNavaids();});
$('opt-ndb').addEventListener('change',e=>{showNDB=e.target.checked;if(showNavaids)loadNavaids();});
$('opt-fixes').addEventListener('change',e=>{showFix=e.target.checked;if(showNavaids)loadNavaids();});
$('btn-load-navaids').addEventListener('click',loadNavaids);
$('btn-load-airways').addEventListener('click',()=>{showAirways=true;$('opt-airways').checked=true;loadAirways();});
$('opt-airways').addEventListener('change',e=>{showAirways=e.target.checked;if(!showAirways&&airwayLayer){map.removeLayer(airwayLayer);airwayLayer=null;}});
$('btn-ng-save').addEventListener('click',()=>{ngKey=$('ng-key').value.trim();localStorage.setItem('dt-ngkey',ngKey);$('ng-key').value=ngKey?'*'.repeat(8):'';const m=$('nav-msg');m.className='msg-line '+(ngKey?'ok':'');m.textContent=ngKey?'Navigraph key saved.':'Key cleared.';});

let navReloadTimer=null;
map.on('moveend',()=>{
  if (!showNavaids) return;
  clearTimeout(navReloadTimer);
  navReloadTimer=setTimeout(loadNavaids, 600);
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
  if(ngKey) $('ng-key').value='*'.repeat(8);

  
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
})();
