/* ===== Poll-A-Gen ===== load data, aggregate, render tracker + map ===== */

const DATA_CSV    = 'data/specimens.csv';
const DATA_GEO    = 'data/uk-counties.json';     // county / unitary authority TopoJSON (WGS84)
const GEO_OBJECT  = 'counties';                  // object name inside the TopoJSON
const NAME_PROP   = 'name';                      // county name field
const RAMP = ['--c0','--c1','--c2','--c3','--c4','--c5','--c6']
  .map(v => getComputedStyle(document.documentElement).getPropertyValue(v).trim());

/* Canonical species list, grouped (Issues 1 & 3). Species with no specimens
   still appear, shown as 0. Any species found in the data but not listed here is
   added to the matching genus group, or to "Other species". */
const SPECIES_GROUPS = [
  ['Bumblebees',   ['Bombus terrestris','Bombus hortorum','Bombus pascuorum','Bombus lapidarius','Bombus jonellus','Bombus humilis','Bombus ruderatus']],
  ['Solitary bees',['Osmia bicornis','Andrena flavipes']],
  ['Wasps',        ['Vespula vulgaris','Dolichovespula sylvestris']],
  ['Hoverflies',   ['Episyrphus balteatus','Syritta pipiens','Myathropa florea','Baccha elongata','Leucozona laternaria']],
];

/* ---------- geometry helpers ---------- */
function pipRing(pt, ring){
  let [x,y]=pt, inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const xi=ring[i][0],yi=ring[i][1],xj=ring[j][0],yj=ring[j][1];
    if(((yi>y)!==(yj>y)) && (x<(xj-xi)*(y-yi)/(yj-yi)+xi)) inside=!inside;
  }
  return inside;
}
const pipPoly = (pt,poly)=> pipRing(pt,poly[0]) && !poly.slice(1).some(h=>pipRing(pt,h));
function pointInFeature(pt,g){
  if(g.type==='Polygon')      return pipPoly(pt,g.coordinates);
  if(g.type==='MultiPolygon') return g.coordinates.some(p=>pipPoly(pt,p));
  return false;
}
function centroid(g){               // rough centroid for nearest-county fallback
  let sx=0,sy=0,n=0;
  const polys = g.type==='Polygon'?[g.coordinates]:g.coordinates;
  polys.forEach(p=>p[0].forEach(c=>{sx+=c[0];sy+=c[1];n++;}));
  return [sx/n,sy/n];
}

/* ---------- state ---------- */
let COUNTY_GEO;                            // county features (choropleth + point-in-polygon)
let COUNTS={}, GLOBAL={total:0,species:{}}, SPECIES=[], SPECIMENS=[], CURRENT='__all__';
let map, geoLayer, markerLayer;

/* ---------- load ---------- */
async function init(){
  try{
    const [csvText, topo] = await Promise.all([
      fetch(DATA_CSV).then(r=>r.text()),
      fetch(DATA_GEO).then(r=>r.json())
    ]);

    COUNTY_GEO = topojson.feature(topo, topo.objects[GEO_OBJECT]);
    COUNTY_GEO.features.forEach(f=> f._c = centroid(f.geometry));

    const rows = Papa.parse(csvText.trim(), {header:true, skipEmptyLines:true}).data
      .map(r=>({
        sp:  (r['Scientific Name']||'').trim(),
        lat: parseFloat(r['Lat']),
        lng: parseFloat(r['Long'])
      }))
      .filter(r=>r.sp && isFinite(r.lat) && isFinite(r.lng));

    aggregate(rows);
    jitterSpecimens();
    renderTracker();
    buildFilter();
    initMap();
  }catch(e){
    console.error(e);
    document.querySelectorAll('.loading').forEach(el=>{
      el.textContent='Could not load data. Check that data/specimens.csv and data/uk-counties.json are present.';
    });
  }
}

/* ---------- aggregation (browser-side, every load) ---------- */
function aggregate(rows){
  COUNTS={}; GLOBAL={total:0,species:{}}; SPECIMENS=[];
  const FEATURES = COUNTY_GEO.features;
  for(const r of rows){
    const pt=[r.lng,r.lat];
    let f = FEATURES.find(f=>pointInFeature(pt,f.geometry));
    if(!f){                                   // fallback: nearest county centroid
      let best=Infinity;
      for(const cand of FEATURES){
        const dx=cand._c[0]-pt[0], dy=cand._c[1]-pt[1], d=dx*dx+dy*dy;
        if(d<best){best=d;f=cand;}
      }
    }
    const id=f.properties[NAME_PROP];
    (COUNTS[id] ??= {total:0,species:{}});
    COUNTS[id].total++; COUNTS[id].species[r.sp]=(COUNTS[id].species[r.sp]||0)+1;
    GLOBAL.total++; GLOBAL.species[r.sp]=(GLOBAL.species[r.sp]||0)+1;
    SPECIMENS.push({lat:r.lat, lng:r.lng, sp:r.sp, county:id});
  }
  SPECIES = Object.keys(GLOBAL.species).sort((a,b)=>GLOBAL.species[b]-GLOBAL.species[a]);
}

/* spread specimens that share identical coordinates so dots don't overlap (Issue 1).
   Singletons keep their exact position; duplicates are fanned around a small circle.
   Jitter is computed once so dots stay put when the species filter changes. */
function jitterSpecimens(){
  const groups={};
  for(const s of SPECIMENS){ (groups[s.lat+','+s.lng] ??= []).push(s); }
  for(const k in groups){
    const arr=groups[k];
    if(arr.length<2){ arr[0].dlat=arr[0].lat; arr[0].dlng=arr[0].lng; continue; }
    const r = 0.004 + 0.0012*Math.min(6, arr.length);      // grows a little when crowded
    const lngScale = 1/Math.cos(arr[0].lat*Math.PI/180);   // keep the ring visually round
    arr.forEach((s,i)=>{
      const a = 2*Math.PI*i/arr.length;
      s.dlat = s.lat + r*Math.sin(a);
      s.dlng = s.lng + r*Math.cos(a)*lngScale;
    });
  }
}

/* ---------- home: grouped species tracker (Issues 1 & 3) ---------- */
function groupedSpecies(){
  const listed = new Set(SPECIES_GROUPS.flatMap(g=>g[1]));
  const groups = SPECIES_GROUPS.map(([name,species])=>([name, species.slice()]));
  // place any data species not in the canonical list into the right group
  for(const sp of SPECIES){
    if(listed.has(sp)) continue;
    const genus = sp.split(' ')[0];
    let g = groups.find(([,sps])=>sps.some(s=>s.split(' ')[0]===genus));
    if(!g){ g=['Other species',[]]; groups.push(g); }
    g[1].push(sp);
  }
  return groups;
}
/* Which groups share a column on the homepage, so the three columns balance:
   Bumblebees | Solitary bees + Wasps | Hoverflies */
const COLUMN_LAYOUT = [
  ['Bumblebees'],
  ['Solitary bees','Wasps'],
  ['Hoverflies'],
];
function renderGroup(groupName, species, max){
  const wrap = document.createElement('div');
  wrap.className='sp-group';
  const got = species.reduce((a,s)=>a+(GLOBAL.species[s]||0),0);
  wrap.innerHTML = `<h3 class="sp-group-h">${groupName}
    <span class="sp-group-n">${got}</span></h3>`;
  for(const s of species){
    const n = GLOBAL.species[s]||0;
    const row=document.createElement('div');
    row.className = 'sp-row' + (n===0 ? ' zero' : '');
    row.innerHTML=`<span class="sp-name">${s}</span>
      <span class="sp-bar" style="width:${n===0?0:28+(n/max)*120}px"></span>
      <span class="sp-count">${n}</span>`;
    wrap.appendChild(row);
  }
  return wrap;
}
function renderTracker(){
  countUp(document.getElementById('total-count'), GLOBAL.total);
  document.getElementById('species-n').textContent  = SPECIES.length;            // species with specimens
  document.getElementById('counties-n').textContent = Object.keys(COUNTS).length;

  const max = Math.max(1, ...SPECIES.map(s=>GLOBAL.species[s]));
  const groups = groupedSpecies();
  const byName = new Map(groups);
  const list = document.getElementById('sp-list');
  list.innerHTML='';

  const placed = new Set();
  const columns = COLUMN_LAYOUT.map(names=>{
    const col=document.createElement('div'); col.className='sp-col';
    for(const name of names){
      if(!byName.has(name)) continue;
      col.appendChild(renderGroup(name, byName.get(name), max));
      placed.add(name);
    }
    return col;
  });
  // any group not in the layout (e.g. "Other species") -> shortest column
  for(const [name,species] of groups){
    if(placed.has(name)) continue;
    const target = columns.reduce((a,b)=> a.childElementCount<=b.childElementCount ? a : b);
    target.appendChild(renderGroup(name, species, max));
  }
  columns.forEach(c=>list.appendChild(c));
}
function countUp(el,to){
  if(matchMedia('(prefers-reduced-motion:reduce)').matches){el.textContent=to;return;}
  const dur=900, t0=performance.now();
  (function step(t){
    const p=Math.min(1,(t-t0)/dur), e=1-Math.pow(1-p,3);
    el.textContent=Math.round(e*to);
    if(p<1) requestAnimationFrame(step);
  })(t0);
}

/* ---------- map ---------- */
function buildFilter(){
  const sel=document.getElementById('species-filter');
  sel.innerHTML='<option value="__all__">All species</option>'+
    SPECIES.map(s=>`<option value="${s}">${s} (${GLOBAL.species[s]})</option>`).join('');
  sel.addEventListener('change',e=>{CURRENT=e.target.value;styleLayer();drawMarkers();});
}
function valueFor(name){
  const c=COUNTS[name]; if(!c) return 0;
  return CURRENT==='__all__' ? c.total : (c.species[CURRENT]||0);
}
function maxValue(){
  return Math.max(1,...Object.keys(COUNTS).map(valueFor));
}
function colour(v,mx){
  if(v<=0) return '#eef0e8';
  const idx=Math.min(RAMP.length-1, Math.floor((v/mx)*(RAMP.length-1)+0.0001));
  return RAMP[Math.max(0,idx)];
}
function initMap(){
  document.getElementById('map-loading')?.remove();
  map=L.map('map',{scrollWheelZoom:false}).setView([54.6,-3.2],5.4);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png',{
    attribution:'&copy; OpenStreetMap &copy; CARTO', subdomains:'abcd', maxZoom:12
  }).addTo(map);
  geoLayer=L.geoJSON(COUNTY_GEO,{style:featStyle, onEachFeature:bindFeat}).addTo(map);
  markerLayer=L.layerGroup().addTo(map);
  styleLayer(); drawMarkers(); drawLegend();
  enableCtrlZoom();        // Issue 8: ctrl+scroll on desktop, pinch on mobile
}
function featStyle(f){
  const name=f.properties.name;
  return {fillColor:colour(valueFor(name),maxValue()),fillOpacity:.82,
    color:'#fff',weight:.6};
}
function styleLayer(){ if(geoLayer){geoLayer.setStyle(featStyle); drawLegend();} }

/* dot for every specimen (Issue 6) */
function drawMarkers(){
  if(!markerLayer) return;
  markerLayer.clearLayers();
  const pts = CURRENT==='__all__' ? SPECIMENS : SPECIMENS.filter(s=>s.sp===CURRENT);
  for(const s of pts){
    L.circleMarker([s.dlat ?? s.lat, s.dlng ?? s.lng],{
      radius:4, color:'#1c2620', weight:1, opacity:.9,
      fillColor:'#d98a2b', fillOpacity:.9
    }).bindPopup(`<div class="pop-name"><i>${s.sp}</i></div>
      <div class="pop-total">${s.county}</div>`).addTo(markerLayer);
  }
}
function bindFeat(f,layer){
  const name=f.properties.name;
  layer.on({
    mouseover:e=>e.target.setStyle({weight:2,color:'#1c2620'}),
    mouseout: e=>geoLayer.resetStyle(e.target),
    click:    ()=>layer.bindPopup(popupHtml(name),{maxWidth:300}).openPopup()
  });
}
function popupHtml(name){
  const c=COUNTS[name];
  if(!c) return `<div class="pop-name">${name}</div>
    <div class="pop-total">no records</div>`;
  const list=Object.entries(c.species).sort((a,b)=>b[1]-a[1])
    .map(([s,n])=>`<div class="pop-sp"><span>${s}</span><span>${n}</span></div>`).join('');
  return `<div class="pop-name">${name}</div>
    <div class="pop-total">${c.total} specimen${c.total>1?'s':''} · ${Object.keys(c.species).length} species</div>${list}`;
}
function drawLegend(){
  const mx=maxValue(), el=document.getElementById('legend-swatches');
  el.innerHTML=RAMP.map(c=>`<i style="background:${c}"></i>`).join('');
  document.getElementById('legend-max').textContent=mx;
  document.getElementById('legend-label').textContent =
    CURRENT==='__all__' ? 'specimens per county' : `${CURRENT} per county`;
}

/* ---------- map zoom: Ctrl + scroll on desktop (Issue 8) ---------- */
function enableCtrlZoom(){
  const hint = document.getElementById('zoom-hint');
  const container = map.getContainer();
  let hintTimer;
  const showHint=()=>{
    if(!hint) return;
    hint.classList.add('show');
    clearTimeout(hintTimer);
    hintTimer=setTimeout(()=>hint.classList.remove('show'),1100);
  };
  const hideHint=()=>{ if(hint){ hint.classList.remove('show'); clearTimeout(hintTimer);} };
  container.addEventListener('wheel',(e)=>{
    if(e.ctrlKey || e.metaKey){            // intentional zoom gesture
      e.preventDefault();                  // stop the browser page-zoom
      const delta  = e.deltaY < 0 ? 1 : -1;
      const latlng = map.containerPointToLatLng(map.mouseEventToContainerPoint(e));
      map.setZoomAround(latlng, map.getZoom()+delta);
      hideHint();
    }else{                                 // plain scroll → let the page scroll, nudge user
      showHint();
    }
  },{passive:false});
}

/* ---------- tabs ---------- */
document.querySelectorAll('.tab[data-target], .brand-link[data-target]').forEach(btn=>{
  btn.addEventListener('click',(e)=>{
    e.preventDefault();
    const target=btn.dataset.target;
    document.querySelectorAll('.tab').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
    document.querySelector(`.tab[data-target="${target}"]`)?.classList.add('active');
    document.getElementById(target).classList.add('active');
    if(target==='panel-map' && map) setTimeout(()=>map.invalidateSize(),50);
  });
});

/* ---------- contact modal (Issue 5) ---------- */
(function contactModal(){
  const modal = document.getElementById('contact-modal');
  const form  = document.getElementById('contact-form');
  if(!modal || !form) return;
  const open  = ()=> (typeof modal.showModal==='function') ? modal.showModal() : modal.setAttribute('open','');
  const close = ()=> (typeof modal.close==='function') ? modal.close() : modal.removeAttribute('open');

  ['open-contact','open-contact-hero','open-contact-about'].forEach(id=>{
    document.getElementById(id)?.addEventListener('click',e=>{e.preventDefault();open();});
  });
  document.getElementById('close-contact')?.addEventListener('click',close);
  document.getElementById('cancel-contact')?.addEventListener('click',close);
  modal.addEventListener('click',e=>{ if(e.target===modal) close(); });   // backdrop click

  form.addEventListener('submit',e=>{
    if(!form.reportValidity()){ e.preventDefault(); return; }
    e.preventDefault();
    const f = new FormData(form);
    const name=(f.get('name')||'').trim();
    const body =
      `Name: ${name}\n`+
      `Email: ${(f.get('email')||'').trim()}\n`+
      `Location: ${(f.get('location')||'').trim()}\n`+
      `Species of interest: ${(f.get('species')||'').trim()}\n`+
      `Society affiliation: ${(f.get('society')||'').trim()}\n\n`+
      `I'd like to collect pollinator specimens for Poll-A-Gen.`;
    const href = `mailto:pollagen@nhm.ac.uk`+
      `?subject=${encodeURIComponent('Poll-A-Gen — collecting enquiry'+(name?` from ${name}`:''))}`+
      `&body=${encodeURIComponent(body)}`;
    window.location.href = href;
    close();
  });
})();

init();
