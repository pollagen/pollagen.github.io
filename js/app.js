/* ===== Poll-A-Gen ===== load data, aggregate, render tracker + map ===== */

const DATA_CSV   = 'data/specimens.csv';
const DATA_GEO   = 'data/uk-districts.json';
const NAME_PROP  = 'LAD13NM';          // district name field in the TopoJSON
const RAMP = ['--c0','--c1','--c2','--c3','--c4','--c5','--c6']
  .map(v => getComputedStyle(document.documentElement).getPropertyValue(v).trim());

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
function centroid(g){               // rough centroid for nearest-district fallback
  let sx=0,sy=0,n=0;
  const polys = g.type==='Polygon'?[g.coordinates]:g.coordinates;
  polys.forEach(p=>p[0].forEach(c=>{sx+=c[0];sy+=c[1];n++;}));
  return [sx/n,sy/n];
}

/* ---------- state ---------- */
let GEO, FEATURES, COUNTS={}, GLOBAL={total:0,species:{}}, SPECIES=[], CURRENT='__all__';
let map, geoLayer;

/* ---------- load ---------- */
async function init(){
  try{
    const [csvText, topo] = await Promise.all([
      fetch(DATA_CSV).then(r=>r.text()),
      fetch(DATA_GEO).then(r=>r.json())
    ]);
    GEO = topojson.feature(topo, topo.objects.lad);
    FEATURES = GEO.features;
    FEATURES.forEach(f=> f._c = centroid(f.geometry));

    const rows = Papa.parse(csvText.trim(), {header:true, skipEmptyLines:true}).data
      .map(r=>({
        sp:  (r['Scientific Name']||'').trim(),
        lat: parseFloat(r['Lat']),
        lng: parseFloat(r['Long'])
      }))
      .filter(r=>r.sp && isFinite(r.lat) && isFinite(r.lng));

    aggregate(rows);
    renderTracker();
    buildFilter();
    initMap();
  }catch(e){
    console.error(e);
    document.querySelectorAll('.loading').forEach(el=>{
      el.textContent='Could not load data. Check that data/specimens.csv and data/uk-districts.json are present.';
    });
  }
}

/* ---------- aggregation (browser-side, every load) ---------- */
function aggregate(rows){
  COUNTS={}; GLOBAL={total:0,species:{}};
  for(const r of rows){
    const pt=[r.lng,r.lat];
    let f = FEATURES.find(f=>pointInFeature(pt,f.geometry));
    if(!f){                                   // fallback: nearest district centroid
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
  }
  SPECIES = Object.keys(GLOBAL.species).sort((a,b)=>GLOBAL.species[b]-GLOBAL.species[a]);
}

/* ---------- home: tracker ---------- */
function renderTracker(){
  const totalEl=document.getElementById('total-count');
  countUp(totalEl, GLOBAL.total);
  document.getElementById('species-n').textContent = SPECIES.length;
  document.getElementById('districts-n').textContent = Object.keys(COUNTS).length;

  const max=Math.max(...SPECIES.map(s=>GLOBAL.species[s]));
  const list=document.getElementById('sp-list');
  list.innerHTML='';
  SPECIES.forEach(s=>{
    const row=document.createElement('div'); row.className='sp-row';
    row.innerHTML=`<span class="sp-name">${s}</span>
      <span class="sp-bar" style="width:${28+ (GLOBAL.species[s]/max)*120}px"></span>
      <span class="sp-count">${GLOBAL.species[s]}</span>`;
    list.appendChild(row);
  });
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
  sel.addEventListener('change',e=>{CURRENT=e.target.value;styleLayer();});
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
  geoLayer=L.geoJSON(GEO,{style:featStyle, onEachFeature:bindFeat}).addTo(map);
  styleLayer(); drawLegend();
}
function featStyle(f){
  const name=f.properties[NAME_PROP];
  return {fillColor:colour(valueFor(name),maxValue()),fillOpacity:.82,
    color:'#fff',weight:.6};
}
function styleLayer(){ if(geoLayer){geoLayer.setStyle(featStyle); drawLegend();} }
function bindFeat(f,layer){
  const name=f.properties[NAME_PROP];
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
    CURRENT==='__all__' ? 'specimens per district' : `${CURRENT} per district`;
}

/* ---------- tabs ---------- */
document.querySelectorAll('.tab').forEach(btn=>{
  btn.addEventListener('click',()=>{
    document.querySelectorAll('.tab').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.target).classList.add('active');
    if(btn.dataset.target==='panel-map' && map) setTimeout(()=>map.invalidateSize(),50);
  });
});

init();
