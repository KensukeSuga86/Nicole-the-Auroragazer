(() => {
'use strict';
const $=id=>document.getElementById(id);
const ENDPOINTS={
 ovation:'https://services.swpc.noaa.gov/json/ovation_aurora_latest.json',
 kpForecast:'https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json',
 kpNow:'https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json',
 dst:'https://services.swpc.noaa.gov/products/kyoto-dst.json',
 speed:'https://services.swpc.noaa.gov/products/summary/solar-wind-speed.json',
 mag:'https://services.swpc.noaa.gov/products/summary/solar-wind-mag-field.json'
};
const state={lat:43,lon:143,data:{},ovation:null,lastUpdated:null};
const log=(s)=>{const e=$('log');e.textContent=`[${new Date().toLocaleTimeString()}] ${s}\n`+e.textContent.slice(0,3000)};
const n=v=>{const x=Number(v);return Number.isFinite(x)?x:null};
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function fmtLat(v){return `${Math.abs(v).toFixed(4)}° ${v<0?'S':'N'}`}
function fmtLon(v){return `${Math.abs(v).toFixed(4)}° ${v<0?'W':'E'}`}
function syncLoc(){ $('lat').value=state.lat.toFixed(4);$('lon').value=state.lon.toFixed(4);$('locText').textContent=`${fmtLat(state.lat)} / ${fmtLon(state.lon)} · ${state.lat<0?'南半球':'北半球'}`;$('hemiLabel').textContent=state.lat<0?'SOUTH HORIZON':'NORTH HORIZON'; evaluate(); }
function parseScalar(obj,keys){
 const wanted=keys.map(x=>x.toLowerCase());
 const walk=v=>{if(v==null)return null;if(typeof v==='number')return v;if(typeof v==='string'){const m=v.match(/-?\d+(?:\.\d+)?/);return m?+m[0]:null}if(Array.isArray(v)){for(let i=v.length-1;i>=0;i--){const z=walk(v[i]);if(z!=null)return z}}if(typeof v==='object'){for(const [k,val] of Object.entries(v)){if(wanted.some(w=>k.toLowerCase().includes(w))){const z=walk(val);if(z!=null)return z}}for(const val of Object.values(v)){const z=walk(val);if(z!=null)return z}}return null};return walk(obj)
}
function rowsFromTable(data){if(!Array.isArray(data)||!Array.isArray(data[0]))return[];const h=data[0].map(String);return data.slice(1).map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]])))}
function lastNumeric(data,fieldHints){
 const rows=rowsFromTable(data); if(rows.length){for(let i=rows.length-1;i>=0;i--){for(const [k,v] of Object.entries(rows[i]))if(fieldHints.some(h=>k.toLowerCase().includes(h))&&n(v)!=null)return n(v)}}
 if(Array.isArray(data)){for(let i=data.length-1;i>=0;i--){const v=parseScalar(data[i],fieldHints);if(v!=null)return v}}
 return parseScalar(data,fieldHints);
}
function parseOvation(data){
 let coords=[];let forecast=null,obs=null;
 if(data&&typeof data==='object'&&!Array.isArray(data)){coords=data.coordinates||data.Coordinates||data.points||[];forecast=data['Forecast Time']||data.forecastTime||null;obs=data['Observation Time']||data.observationTime||null}
 if(!Array.isArray(coords))coords=[];
 coords=coords.map(p=>Array.isArray(p)?{lon:n(p[0]),lat:n(p[1]),v:n(p[2])}:{lon:n(p.lon??p.longitude),lat:n(p.lat??p.latitude),v:n(p.v??p.value??p.probability??p.aurora)}).filter(p=>p.lon!=null&&p.lat!=null&&p.v!=null);
 return {coords,forecast,obs};
}
async function fetchJSON(url){const c=new AbortController();const t=setTimeout(()=>c.abort(),9000);try{const r=await fetch(url,{cache:'no-store',signal:c.signal});if(!r.ok)throw new Error(`${r.status}`);return await r.json()}finally{clearTimeout(t)}}
function persist(){try{localStorage.setItem('auroragazer.snapshot',JSON.stringify({ts:Date.now(),data:state.data,ovation:state.ovation,lat:state.lat,lon:state.lon}))}catch(e){}}
function restore(){try{const s=JSON.parse(localStorage.getItem('auroragazer.snapshot')||'null');if(s){state.data=s.data||{};state.ovation=s.ovation||null;state.lat=n(s.lat)??state.lat;state.lon=n(s.lon)??state.lon;state.lastUpdated=s.ts||null;log('前回の取得データを復元しました')}}catch(e){}}
async function refresh(){
 $('refreshBtn').disabled=true; $('netStatus').textContent='更新中';
 const jobs=Object.entries(ENDPOINTS).map(async([k,u])=>{try{return [k,await fetchJSON(u),null]}catch(e){return[k,null,String(e.message||e)]}});
 const res=await Promise.all(jobs); let ok=0;
 for(const [k,v,err] of res){if(v!=null){ok++;if(k==='ovation')state.ovation=parseOvation(v);else state.data[k]=v;log(`${k}: OK`)}else log(`${k}: ${err}`)}
 state.lastUpdated=Date.now(); persist(); renderData(); evaluate();
 $('netStatus').textContent=ok?`ONLINE ${ok}/${res.length}`:'OFFLINE / CACHE';$('netStatus').className='status '+(ok?'online':'offline');$('refreshBtn').disabled=false;
}
function currentMetrics(){
 const kp=lastNumeric(state.data.kpNow,['kp','k_index'])??lastNumeric(state.data.kpForecast,['kp']);
 const dst=lastNumeric(state.data.dst,['dst']);
 const speed=lastNumeric(state.data.speed,['speed','wind']);
 const bz=lastNumeric(state.data.mag,['bz']);
 return {kp,dst,speed,bz};
}
function nearestOvationIntensity(lat,lon){if(!state.ovation?.coords?.length)return null;let best=null,bd=1e9;for(const p of state.ovation.coords){const dlat=p.lat-lat;let dlon=Math.abs(p.lon-lon);dlon=Math.min(dlon,360-dlon);const d=dlat*dlat+dlon*dlon*Math.cos(lat*Math.PI/180)**2;if(d<bd){bd=d;best=p}}return best?.v??null}
function lowLatitudeGeometry(){
 if(!state.ovation?.coords?.length)return null;
 const hemi=state.lat>=0?1:-1, R=6371, h=250; let best=null;
 for(const p of state.ovation.coords){if(Math.sign(p.lat||hemi)!==hemi)continue;if(Math.abs(p.lat)<=Math.abs(state.lat)+1)continue;if(p.v<5)continue;let dlon=Math.abs(p.lon-state.lon);dlon=Math.min(dlon,360-dlon);if(dlon>15)continue;
   const central=Math.abs(p.lat-state.lat)*Math.PI/180;
   const elev=Math.atan2((R+h)*Math.cos(central)-R,(R+h)*Math.sin(central))*180/Math.PI;
   if(elev>-3){const value=p.v*Math.max(0,Math.cos(dlon*Math.PI/30));if(!best||value>best.value)best={...p,elev,value}}
 }
 return best;
}
function solarScore(m){let s=0;if(m.kp!=null)s+=clamp((m.kp-2)*9,0,45);if(m.dst!=null)s+=clamp((-m.dst-30)/4,0,25);if(m.speed!=null)s+=clamp((m.speed-350)/18,0,16);if(m.bz!=null&&m.bz<0)s+=clamp(-m.bz*1.4,0,14);return clamp(s,0,100)}
function evaluate(){
 const m=currentMetrics(), local=nearestOvationIntensity(state.lat,state.lon), geom=lowLatitudeGeometry(); let s=solarScore(m);let mode='宇宙天気ベース';let elev=null;
 if(local!=null){s=clamp(s*.55+clamp(local,0,100)*.45,0,100);if(local>=10)mode='オーロラ域付近'}
 if(geom&&geom.elev>0){s=clamp(s+Math.min(22,geom.value*.35),0,100);mode='低緯度オーロラ候補';elev=geom.elev}
 const level=s>=70?'高い':s>=48?'高まりつつある':s>=28?'可能性あり':s>=13?'低い':'非常に低い';
 $('score').textContent=Math.round(s);$('gauge').style.setProperty('--score',s.toFixed(0));$('level').textContent=level;$('level').className='level '+(s>=60?'high':s>=28?'mid':'low');
 const rs=[];if(m.kp!=null)rs.push(`Kp ${m.kp.toFixed(1)}`);if(m.dst!=null)rs.push(`Dst ${Math.round(m.dst)} nT`);if(m.speed!=null)rs.push(`太陽風 ${Math.round(m.speed)} km/s`);if(m.bz!=null)rs.push(`Bz ${m.bz.toFixed(1)} nT`);if(geom)rs.push(`極側のOVATION強度 ${geom.v.toFixed(0)}`);
 $('reason').textContent=rs.length?`${rs.join(' / ')} を総合した試験評価。${geom&&geom.elev>0?'極側の発光域を地平線越しに見通せる可能性があります。':''}`:'宇宙天気データが不足しています。';
 $('modeChip').textContent=mode;$('directionChip').textContent=`方向 ${state.lat<0?'南':'北'}`;$('elevChip').textContent=elev!=null?`予測高度 約${elev.toFixed(1)}°`:'予測高度 —';$('auroraBand').style.setProperty('--alt',`${clamp(22+(elev??12)*2,25,75)}%`);
 $('geomText').textContent=geom?`OVATION上の候補地点：緯度 ${geom.lat.toFixed(1)}° / 経度 ${geom.lon.toFixed(1)}°。発光高度250 km仮定で、地平線から約 ${geom.elev.toFixed(1)}°。`:'現在のOVATIONデータから、観測地点より極側に明確な候補域を検出できていません。';
 $('eye').textContent=s>=75?'○':s>=50?'△':'—';$('cam').textContent=s>=50?'◎':s>=25?'△':'—';renderTimeline(s);
}
function renderData(){const m=currentMetrics();$('kp').textContent=m.kp!=null?m.kp.toFixed(1):'—';$('dst').textContent=m.dst!=null?Math.round(m.dst):'—';$('speed').textContent=m.speed!=null?Math.round(m.speed):'—';$('bz').textContent=m.bz!=null?m.bz.toFixed(1):'—';$('updated').textContent=state.lastUpdated?`更新 ${new Date(state.lastUpdated).toLocaleString()}`:'未取得'}
function forecastKps(){const d=state.data.kpForecast;const rows=rowsFromTable(d);const out=[];if(rows.length){for(const r of rows){const kp=parseScalar(r,['kp']);const time=Object.values(r).find(v=>typeof v==='string'&&/\d{4}|\d{2}:\d{2}/.test(v));if(kp!=null)out.push({kp,time:String(time||'')})}} else if(Array.isArray(d)){for(const r of d){const kp=parseScalar(r,['kp']);if(kp!=null)out.push({kp,time:''})}}return out.slice(0,12)}
function renderTimeline(base){const arr=forecastKps();const now=new Date();const items=(arr.length?arr:Array.from({length:6},(_,i)=>({kp:null,time:new Date(now.getTime()+i*3*3600e3).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}))).slice(0,6);$('timeline').innerHTML=items.map((x,i)=>{const val=x.kp!=null?clamp((x.kp/9)*100,2,100):clamp(base+(i-2)*-2,4,100);const label=x.time?String(x.time).replace('T',' ').slice(-8,-3):`+${i*3}h`;return `<div class="slot"><b>${label}</b><div class="bar"><i style="--v:${val}%"></i></div><small>${x.kp!=null?'Kp '+Number(x.kp).toFixed(1):'目安'}</small></div>`}).join('')}
$('applyLoc').onclick=()=>{const lat=n($('lat').value),lon=n($('lon').value);if(lat==null||lon==null||lat<-90||lat>90||lon<-180||lon>180){alert('緯度・経度を確認してください');return}state.lat=lat;state.lon=lon;syncLoc();persist()};
$('gpsBtn').onclick=()=>navigator.geolocation?navigator.geolocation.getCurrentPosition(p=>{state.lat=p.coords.latitude;state.lon=p.coords.longitude;syncLoc();persist()},e=>alert('現在地を取得できませんでした: '+e.message),{enableHighAccuracy:true,timeout:10000}):alert('この環境では位置情報を利用できません');
$('sampleJP').onclick=()=>{state.lat=43.0;state.lon=143.0;syncLoc()};$('sampleAU').onclick=()=>{state.lat=-42.9;state.lon=147.3;syncLoc()};$('refreshBtn').onclick=refresh;
restore();syncLoc();renderData();if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});refresh();
})();
