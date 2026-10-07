import {
  APP_VERSION, clamp, safeNum, analyzeOvationForObserver, scoreAuroraActivity, scoreVisibility,
  combinedNicoleIndex, eyeCameraAssessment, kpLabel, solarElevationDeg, moonIlluminationFraction,
  getCameraRecommendation, formatDirection, escapeHtml, toRad, toDeg
} from './core.js';
import {
  fetchOvation, fetchSpaceWeather, fetchWeather, fetchWeatherMulti, geocodePlaces, fetchDonki,
  summarizeWeatherNow, weatherAtNearestHour, bestNightWindow
} from './data.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const LS = {
  settings:'nicole3.settings.v02', location:'nicole3.location.v02', favorites:'nicole3.favorites.v02',
  cacheSpace:'nicole3.cache.space.v02', cacheWeather:'nicole3.cache.weather.v02', nasa:'nicole3.nasa.v02'
};
const defaults = {altitude:250,ovationThreshold:1,notifyThreshold:65,refreshMinutes:10,bortle:4,horizon:0,nasaKey:''};

const state = {
  settings:{...defaults,...readJSON(LS.settings,{})},
  location:readJSON(LS.location,null), favorites:readJSON(LS.favorites,[]),
  space:null, ovation:null, weather:null, donki:null, analysis:null,
  hemisphere:'north', orientation:null, autoTimer:null, history:[], historyTimer:null,
  displayOvation:null, lastRefresh:null, refreshing:false
};

function readJSON(k,fallback){try{const v=localStorage.getItem(k);return v?JSON.parse(v):fallback}catch{return fallback}}
function saveJSON(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch{}}
function fmt(v,d=1){return Number.isFinite(Number(v))?Number(v).toFixed(d):'—'}
function fmtInt(v){return Number.isFinite(Number(v))?Math.round(Number(v)).toString():'—'}
function fmtTime(v){if(!v)return'—';let raw=v;if(typeof raw==='string'&&raw.includes(' ')&&!/Z$|[+-]\d\d:?\d\d$/.test(raw))raw=raw.trim().replace(' ','T')+'Z';const d=new Date(raw);return Number.isFinite(d.getTime())?d.toLocaleString('ja-JP',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):String(v)}
function setText(sel,text){const e=$(sel);if(e)e.textContent=text}
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');clearTimeout(t._timer);t._timer=setTimeout(()=>t.classList.remove('show'),2800)}
function setStatus(text){setText('#dataStatus',text)}

function init(){
  bindTabs(); bindActions(); renderSettings(); renderLocation(); renderFavorites(); renderGuide(); renderEducation(0); updateNetwork();
  window.addEventListener('online',()=>{updateNetwork();refreshAll()}); window.addEventListener('offline',updateNetwork);
  // Offline cache for the installed PWA (not while developing on this machine).
  const local=/^(127\.0\.0\.1|localhost|\[::1\])$/.test(location.hostname);
  if('serviceWorker' in navigator && !local) navigator.serviceWorker.register('./sw.js').catch(()=>{});
  loadHistory().then(()=>renderHistoryControls());
  refreshAll();
  configureAutoRefresh();
  renderCamera();
}

function bindTabs(){
  $$('.tabs button, .header-actions [data-tab]').forEach(b=>b.addEventListener('click',()=>openTab(lastInGroup[b.dataset.group]||b.dataset.tab)));
  $('#btnGpsHero')?.addEventListener('click',()=>$('#btnGps').click());
  $$('[data-open-tab]').forEach(e=>e.addEventListener('click',ev=>{if(ev.target.closest('button')||e.dataset.openTab)openTab(e.dataset.openTab)}));
}
// Navigation: five sections; sections with several views show sub-tabs (the last view is remembered).
const TAB_GROUPS={home:['home'],aurora:['earth','forecast','solar'],sites:['sites','sky'],camera:['camera'],learn:['learn','guide'],settings:['settings']};
const TAB_LABELS={earth:'🌍 地球オーロラ',forecast:'📈 予測',solar:'☀️ 太陽イベント',sites:'📍 観測地',sky:'🧭 空で見る',learn:'🎓 しくみ',guide:'📖 使い方・解説'};
const lastInGroup={};
function groupOf(name){return Object.keys(TAB_GROUPS).find(g=>TAB_GROUPS[g].includes(name))||'home'}
function renderSubtabs(name){
  const g=groupOf(name),members=TAB_GROUPS[g],box=$('#subtabs');
  if(!box)return;
  if(members.length<2){box.hidden=true;box.innerHTML='';return}
  box.hidden=false;
  box.innerHTML=members.map(m=>`<button data-sub="${m}" class="${m===name?'active':''}">${TAB_LABELS[m]||m}</button>`).join('');
  box.querySelectorAll('[data-sub]').forEach(b=>b.addEventListener('click',()=>openTab(b.dataset.sub)));
}
function openTab(name){
  const group=groupOf(name);lastInGroup[group]=name;
  $$('.tabs button, .header-actions [data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.group===group));
  renderSubtabs(name);
  $$('.tab-panel').forEach(p=>p.classList.toggle('active',p.id===`tab-${name}`));
  if(name==='earth') drawAuroraMaps(); if(name==='forecast') renderForecast(); if(name==='sky') drawSky(); if(name==='sites')renderFavorites();
  window.scrollTo({top:0,behavior:'smooth'});
}

function bindActions(){
  $('#btnGps').addEventListener('click',getGps);
  $('#btnRefresh').addEventListener('click',refreshAll);
  $('#btnSolarRefresh').addEventListener('click',fetchSolarEvents);
  $('#btnSetCoords').addEventListener('click',()=>setLocationFromInputs());
  $('#btnFavoriteCurrent').addEventListener('click',favoriteCurrent);
  $('#btnPlaceSearch').addEventListener('click',searchPlaces);
  $('#placeQuery').addEventListener('keydown',e=>{if(e.key==='Enter')searchPlaces()});
  $('#btnCompareFavorites').addEventListener('click',compareFavorites);
  $('#btnFindSites').addEventListener('click',findCandidateSites);
  $('#btnNotification').addEventListener('click',requestNotifications);
  $('#btnCameraCalc').addEventListener('click',renderCamera);
  $('#cameraAperture').addEventListener('input',renderCamera); $('#cameraFocal').addEventListener('input',renderCamera); $('#cameraStyle').addEventListener('change',renderCamera);
  $('#btnGyro').addEventListener('click',enableOrientation);
  $('#btnEduPlay').addEventListener('click',playEducation);
  $$('#eduSteps button').forEach(b=>b.addEventListener('click',()=>renderEducation(Number(b.dataset.step))));
  $$('.info').forEach(b=>b.addEventListener('click',()=>showInfo(b.dataset.info)));
  $('#infoClose').addEventListener('click',()=>$('#infoDialog').close());
  $('#hemisphereToggle').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;state.hemisphere=b.dataset.hemi;$$('#hemisphereToggle button').forEach(x=>x.classList.toggle('active',x===b));drawAuroraMaps()});
  $('#historySlider').addEventListener('input',renderHistorySelection); $('#btnHistoryPlay').addEventListener('click',toggleHistoryPlay);
  bindSettings();
  $('#btnExportSettings').addEventListener('click',exportSettings); $('#btnClearHistory').addEventListener('click',clearHistory);
}

function bindSettings(){
  const map={settingAltitude:'altitude',settingOvationThreshold:'ovationThreshold',settingNotifyThreshold:'notifyThreshold',settingRefresh:'refreshMinutes',settingBortle:'bortle',settingHorizon:'horizon',settingNasaKey:'nasaKey'};
  Object.entries(map).forEach(([id,key])=>$('#'+id).addEventListener('change',e=>{
    let v=e.target.value; if(key!=='nasaKey')v=Number(v); state.settings[key]=v; saveJSON(LS.settings,state.settings); renderSettings();
    if(key==='refreshMinutes')configureAutoRefresh(); if(['altitude','ovationThreshold','bortle','horizon'].includes(key)) recompute();
  }));
  $('#settingBortle').addEventListener('input',e=>setText('#bortleOutput',e.target.value));
  $('#settingHorizon').addEventListener('input',e=>setText('#horizonOutput',`${e.target.value}°`));
}
function renderSettings(){
  $('#settingAltitude').value=state.settings.altitude; $('#settingOvationThreshold').value=state.settings.ovationThreshold; $('#settingNotifyThreshold').value=state.settings.notifyThreshold;
  $('#settingRefresh').value=String(state.settings.refreshMinutes); $('#settingBortle').value=state.settings.bortle; $('#settingHorizon').value=state.settings.horizon; $('#settingNasaKey').value=state.settings.nasaKey||'';
  setText('#bortleOutput',state.settings.bortle); setText('#horizonOutput',`${state.settings.horizon}°`); setText('#altitudeLabel',`${state.settings.altitude} km`);
  updateStorageInfo();
}
function configureAutoRefresh(){clearInterval(state.autoTimer);const m=Number(state.settings.refreshMinutes);if(m>0)state.autoTimer=setInterval(refreshAll,m*60000)}
function updateNetwork(){const on=navigator.onLine;setText('#networkStatus',on?'ONLINE':'OFFLINE');$('#networkStatus').style.borderColor=on?'#2b7065':'#765057';$('#networkStatus').style.color=on?'var(--aqua)':'#ffb4b4'}

async function refreshAll(){if(state.refreshing)return;state.refreshing=true;$('#btnRefresh').disabled=true;setStatus('更新中…');try{await refreshGlobal();if(state.location)await refreshLocationData();await fetchSolarEvents(false);state.lastRefresh=new Date();setText('#lastUpdated',`更新 ${state.lastRefresh.toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'})}`);setStatus('最新データ');}finally{state.refreshing=false;$('#btnRefresh').disabled=false}}

async function refreshGlobal(){
  const [sw,ov]=await Promise.allSettled([fetchSpaceWeather(),fetchOvation()]);
  if(sw.status==='fulfilled'){state.space=sw.value;saveJSON(LS.cacheSpace,{savedAt:Date.now(),data:reduceSpace(sw.value)})} else {const c=readJSON(LS.cacheSpace,null);if(!state.space&&c)state.space=c.data}
  if(ov.status==='fulfilled'){state.ovation=ov.value;state.displayOvation=ov.value;await saveOvationSnapshot(ov.value)} else if(!state.ovation){const h=await latestHistorySnapshot();if(h){state.ovation=snapshotToOvation(h);state.displayOvation=state.ovation}}
  renderGlobal();recompute();
}
function reduceSpace(s){return {kp:s.kp,dst:s.dst,wind:s.wind,bt:s.bt,bz:s.bz,kpForecast:s.kpForecast,alerts:(s.alerts||[]).slice(0,10),scales:s.scales,timestamps:s.timestamps}}

async function refreshLocationData(){
  if(!state.location)return;
  try{state.weather=await fetchWeather(state.location.lat,state.location.lon);saveJSON(LS.cacheWeather,{savedAt:Date.now(),loc:state.location,data:state.weather})}
  catch{const c=readJSON(LS.cacheWeather,null);if(c&&Math.abs(c.loc.lat-state.location.lat)<.01&&Math.abs(c.loc.lon-state.location.lon)<.01)state.weather=c.data;else state.weather=null}
  renderLocation();recompute();
}

function renderGlobal(){
  const s=state.space||{}; setText('#mKp',fmt(s.kp,1));setText('#mKpLabel',kpLabel(s.kp));setText('#mBz',fmt(s.bz,1));setText('#mBt',fmt(s.bt,1));setText('#mWind',fmtInt(s.wind));setText('#mDst',fmtInt(s.dst));
  decorateMetrics(s);
  if(state.ovation){setText('#ovationTimes',`観測 ${fmtTime(state.ovation.observationTime)} → 予測 ${fmtTime(state.ovation.forecastTime)}`);setText('#earthValid',fmtTime(state.ovation.forecastTime));setText('#homeMapCaption',`OVATION 予測時刻 ${fmtTime(state.ovation.forecastTime)}`)}
  drawHomeMap();drawAuroraMaps();renderForecast();
}

function parseApiLocalTime(str, offset=0){if(!str)return null;const ms=Date.parse(str+'Z');return Number.isFinite(ms)?new Date(ms-offset*1000):null}
function weatherLunarInfo(){
  const w=state.weather,daily=w?.daily;if(!daily?.time?.length)return {illum:moonIlluminationFraction(new Date()),moonUp:true,phase:null,moonrise:null,moonset:null};
  const off=Number(w.utc_offset_seconds||0);const localDate=new Date(Date.now()+off*1000).toISOString().slice(0,10);let i=daily.time.indexOf(localDate);if(i<0)i=0;
  const phase=safeNum(daily.moon_phase?.[i]);const illum=phase==null?moonIlluminationFraction(new Date()):(1-Math.cos(2*Math.PI*phase))/2;
  const rise=parseApiLocalTime(daily.moonrise?.[i],off),set=parseApiLocalTime(daily.moonset?.[i],off);let moonUp=true;
  if(rise&&set){if(set>rise)moonUp=Date.now()>=rise.getTime()&&Date.now()<=set.getTime();else moonUp=Date.now()>=rise.getTime()||Date.now()<=set.getTime()}
  return {illum,moonUp,phase,moonrise:rise,moonset:set};
}

function recompute(){
  if(!state.space&&!state.ovation)return;
  const loc=state.location;const s=state.space||{};let ova={localIntensity:0,bestVisible:null};
  if(loc&&state.ovation)ova=analyzeOvationForObserver(state.ovation,loc.lat,loc.lon,{threshold:state.settings.ovationThreshold,altitudeKm:state.settings.altitude});
  const activity=scoreAuroraActivity({kp:s.kp,bz:s.bz,bt:s.bt,wind:s.wind,dst:s.dst,localOvation:ova.localIntensity,visibleElevation:ova.bestVisible?.elevationDeg});
  const nowW=summarizeWeatherNow(state.weather);const solar=loc?solarElevationDeg(new Date(),loc.lat,loc.lon):-30;const lunar=weatherLunarInfo();
  const visibility=scoreVisibility({cloud:nowW.cloud??(loc?50:0),sunElevation:solar,moonIllumination:lunar.illum,moonUp:lunar.moonUp,bortle:state.settings.bortle,horizonObstruction:state.settings.horizon,precipitation:nowW.precipitation});
  if(!loc)visibility.score=50;
  const idx=combinedNicoleIndex(activity.score,visibility.score);const assess=eyeCameraAssessment({activityScore:activity.score,visibilityScore:visibility.score,elevationDeg:ova.bestVisible?.elevationDeg,localOvation:ova.localIntensity});
  state.analysis={ova,activity,visibility,idx,assess,weather:nowW,solar,lunar};renderAnalysis();drawSky();renderCamera();maybeNotify();
}

function renderAnalysis(){
  const a=state.analysis;if(!a)return;const hasLoc=!!state.location;setText('#indexScore',hasLoc?a.idx.score:'—');setText('#indexLevel',hasLoc?`${a.idx.level} · ${a.idx.ja}`:'地点を設定してください');
  setIndexGauge(hasLoc?a.idx.score:null);setText('#eyeAssess',hasLoc?a.assess.eye:'—');setText('#cameraAssess',hasLoc?a.assess.camera:'—');setText('#mOvation',hasLoc?fmtInt(a.ova.localIntensity):'—');
  setText('#activityBadge',`活動 ${a.activity.score}/100`);setText('#visibilityBadge',`視認性 ${a.visibility.score}/100`);
  const s=state.space||{};const rows=[
    ['Kp',fmt(s.kp,1),kpLabel(s.kp)],['IMF Bz',`${fmt(s.bz,1)} nT`,s.bz<=-10?'強い南向き':s.bz<0?'南向き':'北向き/中立'],['太陽風',`${fmtInt(s.wind)} km/s`,s.wind>=700?'非常に高速':s.wind>=500?'高速':'通常域'],['Dst',`${fmtInt(s.dst)} nT`,s.dst<=-100?'強い磁気嵐':s.dst<=-50?'磁気嵐傾向':'弱い/平常'],['OVATION',fmtInt(a.ova.localIntensity),a.ova.bestVisible?`候補 ${fmt(a.ova.bestVisible.elevationDeg,1)}° ${formatDirection(a.ova.bestVisible.bearingDeg)}`:'可視候補なし']
  ];
  $('#whyList').classList.remove('empty');$('#whyList').innerHTML=rows.map(r=>`<div class="reason"><span>${escapeHtml(r[0])}</span><span class="value">${escapeHtml(r[1])}</span><span class="impact">${escapeHtml(r[2])}</span></div>`).join('');
  const vw=[['雲量',a.weather.cloud==null?'—':`${Math.round(a.weather.cloud)}%`,a.weather.cloud<=30?'良好':a.weather.cloud<=65?'注意':'厳しい'],['太陽高度',`${a.solar.toFixed(1)}°`,a.solar<=-18?'天文薄明終了':a.solar<0?'薄明':'昼間'],['月明かり',`${Math.round(a.lunar.illum*100)}%`,a.lunar.moonUp?'月が上空にある時間帯':'月は地平線下'],['Bortle',String(state.settings.bortle),state.settings.bortle<=3?'暗い空':state.settings.bortle<=6?'中程度':'光害が強い']];
  $('#weatherSummary').classList.remove('empty');$('#weatherSummary').innerHTML=vw.map(r=>`<div class="reason"><span>${r[0]}</span><span class="value">${r[1]}</span><span class="impact">${r[2]}</span></div>`).join('');
  setText('#earthLocal',`${fmtInt(a.ova.localIntensity)}`);if(a.ova.bestVisible){setText('#earthElevation',`${fmt(a.ova.bestVisible.elevationDeg,1)}°`);setText('#earthBearing',`${formatDirection(a.ova.bestVisible.bearingDeg)} ${fmtInt(a.ova.bestVisible.bearingDeg)}° / 約${fmtInt(a.ova.bestVisible.distanceKm)} km`)}else{setText('#earthElevation','—');setText('#earthBearing','有効な可視候補なし')}
  renderTonight();
}

function renderTonight(){
  const s=state.space||{};const best=bestNightWindow(state.weather,18);const now=Date.now(),future=(s.kpForecast||[]).filter(x=>{const t=Date.parse(x.time);return t>=now&&t<=now+18*3600000});const peak=future.reduce((m,x)=>Math.max(m,x.kp),s.kp||0);
  let text=`Kpピーク候補 ${fmt(peak,1)}`;if(best)text+=` / 雲が少ない候補 ${fmtTime(best.ms||best.time)}（雲量 ${Math.round(best.cloud)}%）`;setText('#tonightSummary',text);
  $('#forecastMini').innerHTML=future.slice(0,8).map(x=>`<div class="slot"><small>${fmtTime(x.time).split(' ').at(-1)}</small><b>Kp ${fmt(x.kp,1)}</b><small>${kpLabel(x.kp).split(' ')[0]}</small></div>`).join('')||'<span class="micro">Kp予報なし</span>';
  if(best)setText('#bestWindow',`${fmtTime(best.ms||best.time)}ごろ：雲量 ${Math.round(best.cloud)}%、降水 ${best.precip} mm。宇宙天気側のピークとは一致しない場合があります。`);else setText('#bestWindow','夜間の気象予報を取得できていません。');
}

function renderLocation(){const l=state.location;if(!l){setText('#locationName','地点未設定');setText('#locationCoords','GPSまたは緯度経度を設定');return}setText('#locationName',l.name||'観測地点');setText('#locationCoords',`${l.lat.toFixed(4)}, ${l.lon.toFixed(4)}`);$('#latInput').value=l.lat;$('#lonInput').value=l.lon;$('#locationLabelInput').value=l.name||''}
async function getGps(){if(!navigator.geolocation){toast('このブラウザは位置情報に対応していません');return}setStatus('現在地を取得中…');navigator.geolocation.getCurrentPosition(async p=>{setLocation({lat:p.coords.latitude,lon:p.coords.longitude,name:'現在地'});await refreshLocationData();toast('現在地を設定しました')},e=>{toast(`位置情報を取得できません: ${e.message}`);setStatus('位置情報エラー')},{enableHighAccuracy:true,timeout:12000,maximumAge:300000})}
function setLocation(loc){state.location={lat:Number(loc.lat),lon:Number(loc.lon),name:loc.name||'観測地点'};saveJSON(LS.location,state.location);renderLocation();recompute()}
function setLocationFromInputs(){const lat=Number($('#latInput').value),lon=Number($('#lonInput').value);if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180){toast('緯度・経度を確認してください');return}setLocation({lat,lon,name:$('#locationLabelInput').value.trim()||'手動地点'});refreshLocationData()}

function drawHomeMap(){const c=$('#homeAuroraCanvas');if(!c||!state.displayOvation)return;const hemi=state.location?(state.location.lat>=0?'north':'south'):'north';drawPolar(c,state.displayOvation,hemi,true)}
function drawAuroraMaps(){const c=$('#auroraCanvas');if(!c||!state.displayOvation)return;const ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);if(state.hemisphere==='dual'){drawPolarInto(ctx,state.displayOvation,'north',{x:0,y:0,w:c.width/2,h:c.height});drawPolarInto(ctx,state.displayOvation,'south',{x:c.width/2,y:0,w:c.width/2,h:c.height})}else drawPolarInto(ctx,state.displayOvation,state.hemisphere,{x:0,y:0,w:c.width,h:c.height});drawHomeMap()}
function drawPolar(canvas,ov,hemi,compact=false){const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);drawPolarInto(ctx,ov,hemi,{x:0,y:0,w:canvas.width,h:canvas.height},compact)}
function drawPolarInto(ctx,ov,hemi,rect,compact=false){
  const {x,y,w,h}=rect;ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();ctx.fillStyle='#03090d';ctx.fillRect(x,y,w,h);const cx=x+w/2,cy=y+h/2,R=Math.min(w,h)*.43;const sign=hemi==='north'?1:-1;
  ctx.strokeStyle='#1b4555';ctx.lineWidth=1;ctx.fillStyle='#8ba6b1';ctx.font=`${compact?10:12}px system-ui`;
  [30,45,60,75].forEach(lat=>{const rr=(90-lat)/60*R;ctx.beginPath();ctx.arc(cx,cy,rr,0,Math.PI*2);ctx.stroke();if(!compact)ctx.fillText(`${sign*lat}°`,cx+4,cy-rr+13)});
  for(let lon=0;lon<360;lon+=30){const th=toRad(lon);ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+R*Math.sin(th),cy-R*Math.cos(th));ctx.stroke()}
  for(const p of ov.points||[]){if(Math.sign(p.lat||sign)!==sign&&Math.abs(p.lat)>1)continue;if(p.intensity<=0)continue;const abs=Math.abs(p.lat);if(abs<30)continue;const rr=(90-abs)/60*R;const th=toRad(p.lon);const px=cx+rr*Math.sin(th),py=cy-rr*Math.cos(th);ctx.fillStyle=intensityColor(p.intensity);const s=compact?1.3:1.8;ctx.fillRect(px-s/2,py-s/2,s,s)}
  ctx.strokeStyle='#6f9aac';ctx.lineWidth=2;ctx.beginPath();ctx.arc(cx,cy,R,0,Math.PI*2);ctx.stroke();ctx.fillStyle='#b9ced7';ctx.textAlign='center';ctx.fillText(hemi==='north'?'NORTH':'SOUTH',cx,cy-R-8);
  if(state.location&&Math.sign(state.location.lat||sign)===sign){const abs=Math.abs(state.location.lat);if(abs>=30){const rr=(90-abs)/60*R,th=toRad(state.location.lon);const px=cx+rr*Math.sin(th),py=cy-rr*Math.cos(th);ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(px,py,compact?3:5,0,Math.PI*2);ctx.fill();const b=state.analysis?.ova?.bestVisible;if(b&&Math.sign(b.lat||sign)===sign){const br=(90-Math.abs(b.lat))/60*R,bt=toRad(b.lon);ctx.strokeStyle='#fff';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(cx+br*Math.sin(bt),cy-br*Math.cos(bt),compact?5:8,0,Math.PI*2);ctx.stroke()}}}
  ctx.restore();
}
function intensityColor(v){const t=clamp(v/30,0,1);if(t<.25)return`rgba(62,129,180,${.18+t})`;if(t<.5)return`rgba(75,215,163,${.3+t*.7})`;if(t<.75)return`rgba(248,224,96,${.5+t*.5})`;return`rgba(255,101,77,${.65+t*.35})`}

function renderForecast(){
  const rows=state.space?.kpForecast||[];const c=$('#kpChart'),ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);ctx.fillStyle='#07131a';ctx.fillRect(0,0,c.width,c.height);const pad={l:48,r:20,t:20,b:42},W=c.width-pad.l-pad.r,H=c.height-pad.t-pad.b;
  ctx.strokeStyle='#244653';ctx.fillStyle='#8fa8b2';ctx.font='12px system-ui';for(let k=0;k<=9;k++){const y=pad.t+H-(k/9)*H;ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(pad.l+W,y);ctx.stroke();if(k%2===0)ctx.fillText(String(k),18,y+4)}
  if(rows.length>1){const times=rows.map(r=>Date.parse(r.time)),min=Math.min(...times),max=Math.max(...times);ctx.strokeStyle='#63e6cf';ctx.lineWidth=3;ctx.beginPath();rows.forEach((r,i)=>{const x=pad.l+(times[i]-min)/(max-min||1)*W,y=pad.t+H-(clamp(r.kp,0,9)/9)*H;i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.stroke();ctx.fillStyle='#b6ccd5';for(let i=0;i<rows.length;i+=Math.max(1,Math.ceil(rows.length/8))){const x=pad.l+(times[i]-min)/(max-min||1)*W;ctx.fillText(new Date(times[i]).toLocaleString('ja-JP',{month:'numeric',day:'numeric',hour:'2-digit'}),x-20,c.height-14)}}
  $('#kpForecastTable').innerHTML=rows.length?`<table><thead><tr><th>時刻</th><th>Kp</th><th>状態</th></tr></thead><tbody>${rows.slice(0,30).map(r=>`<tr><td>${escapeHtml(fmtTime(r.time))}</td><td>${fmt(r.kp,1)}</td><td>${escapeHtml(kpLabel(r.kp))}</td></tr>`).join('')}</tbody></table>`:'<p class="micro">Kp予報を取得できていません。</p>';
}

async function fetchSolarEvents(showToast=true){try{const d=await fetchDonki(state.settings.nasaKey||'DEMO_KEY',7);state.donki=d;renderSolarEvents();if(showToast)toast('NASA DONKIを更新しました')}catch(e){if(showToast)toast(`DONKI取得失敗: ${e.message}`)}}
function renderSolarEvents(){
  const box=$('#solarEvents');const d=state.donki;if(!d){box.innerHTML='<article class="panel empty">NASA DONKIを取得中…</article>';return}const events=[];
  for(const x of d.cme||[]){const analyses=(x.cmeAnalyses||[]).filter(Boolean);const best=analyses.find(a=>a.isMostAccurate)||analyses.at(-1)||{};const enlil=(best.enlilList||[]).find(e=>e.isEarthGB)||(best.enlilList||[]).at(-1);events.push({type:'CME',time:x.startTime||x.activityID,title:'コロナ質量放出（CME）',body:x.note||x.sourceLocation||'',meta:[best.speed&&`速度 ${best.speed} km/s`,best.halfAngle&&`半角 ${best.halfAngle}°`,enlil?.estimatedShockArrivalTime&&`推定到達 ${fmtTime(enlil.estimatedShockArrivalTime)}`].filter(Boolean)})}
  for(const x of d.gst||[]){const peak=(x.allKpIndex||[]).reduce((m,k)=>Math.max(m,safeNum(k.kpIndex,0)),0);events.push({type:'GST',time:x.startTime||x.gstID,title:'地磁気嵐',body:x.linkedEvents?.map(e=>e.activityID).join(' / ')||'',meta:[`最大Kp ${peak}`]})}
  for(const x of d.ips||[]){events.push({type:'IPS',time:x.eventTime||x.activityID,title:'惑星間衝撃波',body:x.location||'',meta:[]})}
  events.sort((a,b)=>Date.parse(b.time)-Date.parse(a.time));
  // NOAA notices from the same 7 days only; everything newest first.
  const since=Date.now()-7*86400000;
  const noaa=(state.space?.alerts||[]).map(a=>({type:'NOAA',time:a.issue_datetime||a.issue_time||a.time_tag||'',title:a.product_id?`NOAA ${a.product_id}`:'NOAA Alert',body:(a.message||a.text||'').split('\n').slice(0,3).join(' '),meta:[]})).filter(e=>{const t=Date.parse(String(e.time).replace(' ','T')+(/Z|[+-]\d\d:?\d\d$/.test(e.time)?'':'Z'));return Number.isFinite(t)&&t>=since});
  const tOf=e=>{const t=Date.parse(String(e.time).replace(' ','T')+(/Z|[+-]\d\d:?\d\d$/.test(e.time)?'':'Z'));return Number.isFinite(t)?t:0};
  const all=[...noaa,...events].sort((a,b)=>tOf(b)-tOf(a)).slice(0,30);box.innerHTML=all.length?all.map(e=>`<article class="panel event-chain" data-type="${escapeHtml(e.type)}"><div class="event-time">${escapeHtml(fmtTime(e.time))}<br><b>${escapeHtml(e.type)}</b></div><div class="event-body"><strong>${escapeHtml(e.title)}</strong><p class="clamp" onclick="this.classList.toggle('clamp')" title="クリックで全文">${escapeHtml(e.body||'')}</p><div class="event-meta">${(e.meta||[]).map(m=>`<span>${escapeHtml(m)}</span>`).join('')}</div></div></article>`).join(''):'<article class="panel empty">直近7日間に表示できるイベントがありません。</article>';
}

async function searchPlaces(){const q=$('#placeQuery').value.trim();if(!q)return;$('#placeResults').innerHTML='<span class="micro">検索中…</span>';try{const rows=await geocodePlaces(q);$('#placeResults').innerHTML=rows.map((r,i)=>`<div class="search-result"><div><b>${escapeHtml(r.name)}</b><small>${escapeHtml([r.admin1,r.country].filter(Boolean).join(' / '))}<br>${r.lat.toFixed(4)}, ${r.lon.toFixed(4)}</small></div><div><button class="btn" data-set-place="${i}">設定</button><button class="btn" data-fav-place="${i}">☆</button></div></div>`).join('')||'<span class="micro">見つかりませんでした。</span>';$$('[data-set-place]').forEach(b=>b.onclick=()=>{const r=rows[Number(b.dataset.setPlace)];setLocation({lat:r.lat,lon:r.lon,name:r.name});refreshLocationData();openTab('home')});$$('[data-fav-place]').forEach(b=>b.onclick=()=>addFavorite(rows[Number(b.dataset.favPlace)]));}catch(e){$('#placeResults').innerHTML=`<span class="micro">検索失敗: ${escapeHtml(e.message)}</span>`}}
function favoriteCurrent(){if(!state.location){toast('先に地点を設定してください');return}addFavorite({...state.location,name:$('#locationLabelInput').value.trim()||state.location.name})}
function addFavorite(r){if(state.favorites.some(x=>Math.abs(x.lat-r.lat)<.001&&Math.abs(x.lon-r.lon)<.001)){toast('すでに保存されています');return}state.favorites.push({name:r.name||'お気に入り',lat:Number(r.lat),lon:Number(r.lon),bortle:state.settings.bortle,horizon:state.settings.horizon});saveJSON(LS.favorites,state.favorites);renderFavorites();toast('お気に入りに保存しました')}
function removeFavorite(i){state.favorites.splice(i,1);saveJSON(LS.favorites,state.favorites);renderFavorites()}
function renderFavorites(){const box=$('#favoritesTable');if(!state.favorites.length){box.innerHTML='<p class="micro">お気に入り地点はまだありません。</p>';return}box.innerHTML=`<table><thead><tr><th>地点</th><th>緯度</th><th>経度</th><th>Bortle</th><th>北遮蔽</th><th></th></tr></thead><tbody>${state.favorites.map((f,i)=>`<tr><td>${escapeHtml(f.name)}</td><td>${f.lat.toFixed(3)}</td><td>${f.lon.toFixed(3)}</td><td><input data-fav-bortle="${i}" type="number" min="1" max="9" value="${f.bortle??4}" style="width:68px"></td><td><input data-fav-horizon="${i}" type="number" min="0" max="45" value="${f.horizon??0}" style="width:68px">°</td><td><button class="linkbtn" data-use-fav="${i}">使用</button> <button class="linkbtn" data-del-fav="${i}">削除</button></td></tr>`).join('')}</tbody></table>`;$$('[data-use-fav]').forEach(b=>b.onclick=()=>{const f=state.favorites[Number(b.dataset.useFav)];setLocation(f);state.settings.bortle=f.bortle??state.settings.bortle;state.settings.horizon=f.horizon??state.settings.horizon;saveJSON(LS.settings,state.settings);renderSettings();refreshLocationData();openTab('home')});$$('[data-del-fav]').forEach(b=>b.onclick=()=>removeFavorite(Number(b.dataset.delFav)));$$('[data-fav-bortle]').forEach(e=>e.onchange=()=>{const i=Number(e.dataset.favBortle);state.favorites[i].bortle=clamp(Number(e.value)||4,1,9);saveJSON(LS.favorites,state.favorites)});$$('[data-fav-horizon]').forEach(e=>e.onchange=()=>{const i=Number(e.dataset.favHorizon);state.favorites[i].horizon=clamp(Number(e.value)||0,0,45);saveJSON(LS.favorites,state.favorites)})}
async function compareFavorites(){if(!state.favorites.length)return;const box=$('#favoritesTable');box.innerHTML='<p class="micro">気象データを比較中…</p>';try{const wx=await fetchWeatherMulti(state.favorites);const rows=state.favorites.map((f,i)=>evaluateSite(f,wx[i]));rows.sort((a,b)=>b.index-a.index);box.innerHTML=siteTable(rows,true)}catch(e){box.innerHTML=`<p class="micro">比較に失敗しました: ${escapeHtml(e.message)}</p>`}}
function evaluateSite(site,wx){const ova=state.ovation?analyzeOvationForObserver(state.ovation,site.lat,site.lon,{threshold:state.settings.ovationThreshold,altitudeKm:state.settings.altitude}):{localIntensity:0,bestVisible:null};const s=state.space||{};const act=scoreAuroraActivity({kp:s.kp,bz:s.bz,bt:s.bt,wind:s.wind,dst:s.dst,localOvation:ova.localIntensity,visibleElevation:ova.bestVisible?.elevationDeg});const best=bestNightWindow(wx,18);const vis=scoreVisibility({cloud:best?.cloud??wx?.current?.cloud_cover??60,sunElevation:-20,moonIllumination:state.analysis?.lunar?.illum??.5,moonUp:state.analysis?.lunar?.moonUp??true,bortle:site.bortle??state.settings.bortle,horizonObstruction:site.horizon??state.settings.horizon,precipitation:best?.precip??0});const idx=combinedNicoleIndex(act.score,vis.score);return {...site,index:idx.score,activity:act.score,visibility:vis.score,cloud:best?.cloud??wx?.current?.cloud_cover??null,time:best?.time||null,timeMs:best?.ms||null,elev:ova.bestVisible?.elevationDeg,bearing:ova.bestVisible?.bearingDeg}}
function siteTable(rows,withName=false){return `<table><thead><tr><th>${withName?'地点':'候補'}</th><th>INDEX</th><th>活動</th><th>視認性</th><th>雲</th><th>推定高度</th><th>方位</th><th>候補時刻</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${escapeHtml(r.name||`${r.lat.toFixed(2)}, ${r.lon.toFixed(2)}`)}</td><td><b>${r.index}</b></td><td>${r.activity}</td><td>${r.visibility}</td><td>${r.cloud==null?'—':Math.round(r.cloud)+'%'}</td><td>${r.elev==null?'—':r.elev.toFixed(1)+'°'}</td><td>${r.bearing==null?'—':formatDirection(r.bearing)}</td><td>${r.timeMs?fmtTime(r.timeMs):(r.time?fmtTime(r.time):'—')}</td></tr>`).join('')}</tbody></table>`}
function destination(lat,lon,bearing,distanceKm){const dr=distanceKm/6371.0088,br=toRad(bearing),p1=toRad(lat),l1=toRad(lon);const p2=Math.asin(Math.sin(p1)*Math.cos(dr)+Math.cos(p1)*Math.sin(dr)*Math.cos(br));const l2=l1+Math.atan2(Math.sin(br)*Math.sin(dr)*Math.cos(p1),Math.cos(dr)-Math.sin(p1)*Math.sin(p2));return {lat:toDeg(p2),lon:((toDeg(l2)+540)%360)-180}}
async function findCandidateSites(){if(!state.location){toast('現在地点を設定してください');return}const r=Number($('#siteRadius').value);const pts=[0,45,90,135,180,225,270,315].map((b,i)=>({...destination(state.location.lat,state.location.lon,b,r*(i%2?1:.75)),name:`${formatDirection(b)} 約${Math.round(r*(i%2?1:.75))}km`,bortle:state.settings.bortle,horizon:state.settings.horizon}));pts.unshift({...state.location,name:'現在地点',bortle:state.settings.bortle,horizon:state.settings.horizon});$('#siteCandidates').innerHTML='<p class="micro">9地点の予報を評価中…</p>';try{const wx=await fetchWeatherMulti(pts);const rows=pts.map((p,i)=>evaluateSite(p,wx[i])).sort((a,b)=>b.index-a.index);$('#siteCandidates').innerHTML=siteTable(rows,false)}catch(e){$('#siteCandidates').innerHTML=`<p class="micro">取得失敗: ${escapeHtml(e.message)}</p>`}}

function drawSky(){const c=$('#skyCanvas');if(!c)return;const ctx=c.getContext('2d'),w=c.width,h=c.height;ctx.clearRect(0,0,w,h);const grad=ctx.createLinearGradient(0,0,0,h);grad.addColorStop(0,'#02050a');grad.addColorStop(.72,'#102838');grad.addColorStop(1,'#071015');ctx.fillStyle=grad;ctx.fillRect(0,0,w,h);const horizon=h*.75;ctx.strokeStyle='#73909c';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,horizon);ctx.lineTo(w,horizon);ctx.stroke();ctx.fillStyle='#b8ced7';ctx.font='16px system-ui';ctx.textAlign='center';for(let a=-180;a<=180;a+=45){const x=w/2+(a/180)*(w/2);const deg=(a+360)%360;ctx.fillText(formatDirection(deg),x,horizon+28)}for(const alt of[5,10,20,30]){const y=horizon-alt/45*(horizon-50);ctx.strokeStyle='rgba(90,130,145,.22)';ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();ctx.fillText(`${alt}°`,28,y-4)}const b=state.analysis?.ova?.bestVisible;if(b){let rel=((b.bearingDeg+180)%360)-180;const x=w/2+(rel/180)*(w/2);const y=horizon-clamp(b.elevationDeg,0,45)/45*(horizon-50);ctx.fillStyle='rgba(89,242,193,.22)';ctx.beginPath();ctx.ellipse(x,y,110,35,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#65f2c3';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x-75,y);ctx.quadraticCurveTo(x,y-28,x+75,y);ctx.stroke();ctx.fillStyle='#eaf6fb';ctx.fillText(`推定 ${b.elevationDeg.toFixed(1)}° / ${formatDirection(b.bearingDeg)} ${Math.round(b.bearingDeg)}°`,x,Math.max(30,y-48));const heading=state.orientation;if(Number.isFinite(heading)){const hr=((heading+180)%360)-180,hx=w/2+(hr/180)*(w/2);ctx.strokeStyle='#ffd166';ctx.beginPath();ctx.moveTo(hx,40);ctx.lineTo(hx,horizon);ctx.stroke();ctx.fillStyle='#ffd166';ctx.fillText(`端末 ${Math.round(heading)}°`,hx,30)}setText('#skyReadout',`候補領域まで約 ${Math.round(b.distanceKm)} km。発光高度 ${state.settings.altitude} km 仮定。地平線遮蔽 ${state.settings.horizon}°。`)}else setText('#skyReadout','現在のOVATIONデータから、設定閾値以上で地平線上に見える候補を算出できませんでした。')}
async function enableOrientation(){try{if(typeof DeviceOrientationEvent!=='undefined'&&typeof DeviceOrientationEvent.requestPermission==='function'){const p=await DeviceOrientationEvent.requestPermission();if(p!=='granted')throw new Error('permission denied')}window.addEventListener('deviceorientationabsolute',orientationHandler,true);window.addEventListener('deviceorientation',orientationHandler,true);toast('方位センサーを有効にしました')}catch{toast('方位センサーを使用できません')}}
function orientationHandler(e){let h=e.webkitCompassHeading;if(!Number.isFinite(h)&&Number.isFinite(e.alpha))h=(360-e.alpha)%360;if(Number.isFinite(h)){state.orientation=h;drawSky()}}

function renderCamera(){const aperture=Number($('#cameraAperture').value||2),focal=Number($('#cameraFocal').value||20),style=$('#cameraStyle').value;let rec=getCameraRecommendation(state.analysis?.activity?.score??40,aperture,focal);if(style==='timelapse')rec={...rec,shutter:Math.min(rec.shutter,4),iso:Math.min(12800,Math.round(rec.iso*1.25/100)*100)};if(style==='stars')rec={...rec,iso:Math.max(1600,Math.round(rec.iso*.8/100)*100)};setText('#recShutter',`${rec.shutter} s`);setText('#recIso',`ISO ${rec.iso}`);setText('#recAperture',`f/${aperture.toFixed(1)}`);setText('#cameraNote',`RAW推奨。WB 3500–4500Kを出発点に、オーロラが速く動くほどシャッターを短くします。${focal}mmでは星像流れも確認してください。`) }

const edu=[
  ['太陽活動','太陽は常にプラズマを太陽風として放出しています。フレアやコロナ質量放出（CME）が起きると、通常より強い擾乱が地球方向へ伝わることがあります。'],
  ['太陽風・CME','太陽風には速度・密度だけでなく磁場（IMF）が含まれます。CMEが地球方向へ進むと、数日後に太陽風の急変や衝撃波として観測されることがあります。'],
  ['IMFと磁気圏','IMFのBzが南向き（負）になると、地球磁場との磁気リコネクションが起こりやすくなり、太陽風のエネルギーが磁気圏へ入りやすくなります。'],
  ['粒子加速','磁気圏へ蓄えられたエネルギーによって電子などの荷電粒子が加速され、地球の磁力線に沿って極域の上層大気へ降り込みます。'],
  ['大気発光','高エネルギー粒子が酸素・窒素と衝突すると原子・分子が励起され、元の状態へ戻るときに光を放ちます。酸素の557.7 nmは代表的な緑、630.0 nmは高高度で見られる赤色発光です。']
];
function renderEducation(i){i=clamp(i,0,4);$$('#eduSteps button').forEach((b,j)=>b.classList.toggle('active',j===i));const scene=$('#eduScene');scene.className=`edu-scene step-${i}`;$('#eduText').innerHTML=`<h3>${edu[i][0]}</h3><p>${edu[i][1]}</p>`;scene.dataset.step=i}
function playEducation(){clearInterval($('#btnEduPlay')._timer);let i=Number($('#eduScene').dataset.step||0);$('#btnEduPlay').textContent='■ 停止';$('#btnEduPlay')._timer=setInterval(()=>{i++;if(i>4){clearInterval($('#btnEduPlay')._timer);$('#btnEduPlay').textContent='▶ 再生';return}renderEducation(i)},1700)}

const info={
  kp:['Kp指数','地球規模の地磁気活動を0〜9で表す指数です。高いほどオーロラ帯が低緯度側へ広がりやすくなります。ただしKpだけで特定地点の可視性は決まりません。'],
  bz:['IMF Bz','太陽風中の惑星間磁場の南北成分です。負（南向き）の状態が続くと、地球磁気圏へエネルギーが入りやすくなり、オーロラ活動が活発化しやすくなります。'],
  bt:['IMF Bt','太陽風磁場の全強度です。Bzの向きと組み合わせて、磁気圏への結合の強さを見る材料にします。'],
  wind:['太陽風速度','L1付近で観測される太陽風の速度です。高速な太陽風は擾乱を強める一要素ですが、磁場方向など他の条件も重要です。'],
  dst:['Dst指数','主に環電流の強さを反映する地磁気指数で、強い磁気嵐では大きな負値になります。'],
  ovation:['OVATION','NOAAのOVATION Primeは、L1の太陽風・IMFなどから短時間先のオーロラ粒子降下と可視オーロラ分布を推定するモデルです。Nicoleでは現在地近傍と遠方の可視候補の両方に使います。']
};
function showInfo(k){const v=info[k]||['情報',''];setText('#infoTitle',v[0]);setText('#infoBody',v[1]);$('#infoDialog').showModal()}

function renderGuide(){const sections=[
  ['クイックスタート',`<ol><li>「現在地」でGPSを許可するか、観測地タブで緯度・経度を設定します。</li><li>ホームのNicole INDEXと「肉眼／カメラ」を確認します。</li><li>「なぜこの判定？」でKp・Bz・太陽風・Dst・OVATIONの内訳を確認します。</li><li>地球オーロラで全球分布、空で見るで方位・高さを確認します。</li></ol>`],
  ['Nicole INDEXとは',`<p>Nicole INDEXは<strong>出現確率ではありません</strong>。宇宙天気活動度と観測環境を透明な重みで合成した0〜100の条件指数です。</p><p>活動側はKp、Bz、Bt、太陽風速度、Dst、OVATION、遠方オーロラの見かけ高度を利用します。観測環境側は雲量、降水、太陽高度、月明かり、Bortleクラス、地平線遮蔽を使います。</p>`],
  ['地球オーロラマップ',`<p>NOAA SWPCの<code>ovation_aurora_latest.json</code>を読み、北半球・南半球を極投影します。OVATIONは現在の太陽風を用いた<strong>おおむね30分先までの短時間予測</strong>です。数時間後や翌日の地理的なオーロラ形状を保証するデータではありません。</p>`],
  ['低緯度オーロラの見え方',`<p>観測地点の真上にオーロラ帯がなくても、極側の高高度発光を地平線近くに見ることがあります。Nicoleは地球半径と設定した発光高度（初期値250 km）から、OVATION候補点の見かけ高度と方位を幾何計算します。</p><p>実際の発光高度は色・粒子エネルギー・現象により変わるため、表示高度は目安です。</p>`],
  ['オーロラのメカニズム',`<p>太陽風とIMFが地球磁気圏へ作用し、特に南向きBzが続くと磁気リコネクションを通じてエネルギーが入りやすくなります。加速された電子などが磁力線に沿って上層大気へ降り込み、酸素や窒素と衝突して発光します。</p><p><strong>代表的な色：</strong>酸素557.7 nmの緑、酸素630.0 nmの赤、窒素由来の青〜紫など。低緯度では高高度の赤色発光が目立つことがあります。</p>`],
  ['参照データと役割',`<table><thead><tr><th>データ</th><th>提供元</th><th>Nicoleでの用途</th></tr></thead><tbody><tr><td>OVATION</td><td>NOAA SWPC</td><td>全球オーロラ分布・短時間予測</td></tr><tr><td>Kp 実測/予報</td><td>NOAA SWPC</td><td>地球規模の地磁気活動</td></tr><tr><td>Solar Wind / IMF</td><td>NOAA SWPC</td><td>速度、Bt、Bz</td></tr><tr><td>Dst</td><td>NOAA配信 / Kyoto Dst</td><td>磁気嵐強度の補助</td></tr><tr><td>CME / GST / IPS</td><td>NASA DONKI</td><td>太陽〜地球のイベントチェーン</td></tr><tr><td>雲・降水・視程・日月</td><td>Open-Meteo</td><td>地上からの視認性</td></tr></tbody></table>`],
  ['Kpの読み方',`<p>Kpは0〜9です。5以上はNOAA G-scaleの磁気嵐に対応します。ただし同じKpでもオーロラの位置や明るさは異なり、地点ごとの天候・暗さも別問題です。</p>`],
  ['Bzが重要な理由',`<p>地球の昼側磁場は概ね北向きです。太陽風のBzが南向きになると磁場同士が反平行になり、磁気リコネクションを通じて太陽風のエネルギーが磁気圏へ入りやすくなります。「負のBzが強く、長く続く」ことをNicoleは重視します。</p>`],
  ['肉眼とカメラ',`<p>カメラは数秒間の光を蓄積できるため、肉眼では色が分かりにくい弱い赤色オーロラを記録できる場合があります。Nicoleではカメラ判定を肉眼判定より緩くしています。</p>`],
  ['撮影の基本',`<p>RAW、広角・明るいレンズ、三脚を基本とします。初期値は数秒・ISO 1600〜6400程度から、オーロラが速く動く場合は露光を短くします。撮影アシスタントは開始点であり、適正露出の保証値ではありません。</p>`],
  ['通知について',`<p>ブラウザ通知を許可すると、データ更新時にNicole INDEXが設定閾値以上の場合に通知します。Safari/iOSを含め、PWAが完全に停止している状態での定期バックグラウンド取得はOS・ブラウザ制約を受けます。</p>`],
  ['予報の限界',`<p>オーロラは変動が速く、CME到達時刻やIMF Bzの向きは直前まで不確実です。OVATION、Kp予報、Nicole INDEXはいずれも観測を保証するものではありません。現地の雲・安全・道路状況も別途確認してください。</p>`]
  ];$('#guideContent').innerHTML=sections.map((s,i)=>`<details ${i<2?'open':''}><summary>${s[0]}</summary><div class="guide-body">${s[1]}</div></details>`).join('')}

async function requestNotifications(){if(!('Notification'in window)){setText('#notificationState','このブラウザは通知に対応していません。');return}const p=await Notification.requestPermission();setText('#notificationState',p==='granted'?`有効：INDEX ${state.settings.notifyThreshold}以上で更新時に通知`:`通知権限: ${p}`)}
function maybeNotify(){if(!state.location||!state.analysis||!('Notification'in window)||Notification.permission!=='granted')return;const score=state.analysis.idx.score,threshold=state.settings.notifyThreshold;if(score<threshold)return;const last=Number(localStorage.getItem('nicole3.lastNotify')||0);if(Date.now()-last<2*3600000)return;const opts={body:`Nicole INDEX ${score}。${state.analysis.assess.camera}（カメラ） / ${state.analysis.assess.eye}（肉眼）`,icon:'./assets/icon-192.png',badge:'./assets/icon-192.png'};if(navigator.serviceWorker){navigator.serviceWorker.ready.then(reg=>reg.showNotification('Nicole the Auroragazer',opts)).catch(()=>new Notification('Nicole the Auroragazer',opts));}else new Notification('Nicole the Auroragazer',opts);localStorage.setItem('nicole3.lastNotify',String(Date.now()))}

function exportSettings(){const payload={version:APP_VERSION,exportedAt:new Date().toISOString(),settings:state.settings,location:state.location,favorites:state.favorites};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`Nicole-Auroragazer-settings-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function updateStorageInfo(){const approx=new Blob(Object.values(localStorage)).size;setText('#storageInfo',`localStorage 約 ${(approx/1024).toFixed(1)} KB / OVATION履歴 ${state.history.length}件`) }

// IndexedDB OVATION local replay
function openDb(){return new Promise((res,rej)=>{const r=indexedDB.open('nicole-auroragazer',1);r.onupgradeneeded=()=>{const db=r.result;if(!db.objectStoreNames.contains('ovation'))db.createObjectStore('ovation',{keyPath:'id'})};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
async function saveOvationSnapshot(ov){try{const db=await openDb();const id=ov.forecastTime||new Date().toISOString();const tx=db.transaction('ovation','readwrite');tx.objectStore('ovation').put({id,observationTime:ov.observationTime,forecastTime:ov.forecastTime,savedAt:Date.now(),points:(ov.points||[]).filter(p=>p.intensity>0).map(p=>[p.lon,p.lat,p.intensity])});await txDone(tx);db.close();await trimHistory();await loadHistory()}catch{}}
function txDone(tx){return new Promise((res,rej)=>{tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);tx.onabort=()=>rej(tx.error)})}
async function loadHistory(){try{const db=await openDb();const tx=db.transaction('ovation','readonly'),req=tx.objectStore('ovation').getAll();state.history=await new Promise((res,rej)=>{req.onsuccess=()=>res(req.result||[]);req.onerror=()=>rej(req.error)});state.history.sort((a,b)=>(a.savedAt||0)-(b.savedAt||0));db.close();renderHistoryControls();updateStorageInfo();return state.history}catch{return[]}}
async function trimHistory(){const all=await loadHistory();if(all.length<=72)return;const db=await openDb();const tx=db.transaction('ovation','readwrite');for(const x of all.slice(0,all.length-72))tx.objectStore('ovation').delete(x.id);await txDone(tx);db.close()}
async function latestHistorySnapshot(){const h=await loadHistory();return h.at(-1)||null}
function snapshotToOvation(s){return {observationTime:s.observationTime,forecastTime:s.forecastTime,points:(s.points||[]).map(v=>({lon:v[0],lat:v[1],intensity:v[2]}))}}
function renderHistoryControls(){const sl=$('#historySlider');sl.max=Math.max(0,state.history.length-1);sl.value=Math.max(0,state.history.length-1);setText('#historyLabel',state.history.length?fmtTime(state.history.at(-1).forecastTime):'履歴なし')}
function renderHistorySelection(){const i=Number($('#historySlider').value);const s=state.history[i];if(!s)return;state.displayOvation=snapshotToOvation(s);setText('#historyLabel',fmtTime(s.forecastTime));drawAuroraMaps()}
function toggleHistoryPlay(){if(state.historyTimer){clearInterval(state.historyTimer);state.historyTimer=null;$('#btnHistoryPlay').textContent='▶ ローカル履歴';state.displayOvation=state.ovation;drawAuroraMaps();return}if(state.history.length<2){toast('再生できる履歴がまだありません');return}let i=0;$('#historySlider').value=0;renderHistorySelection();$('#btnHistoryPlay').textContent='■ 停止';state.historyTimer=setInterval(()=>{i++;if(i>=state.history.length){clearInterval(state.historyTimer);state.historyTimer=null;$('#btnHistoryPlay').textContent='▶ ローカル履歴';state.displayOvation=state.ovation;drawAuroraMaps();return}$('#historySlider').value=i;renderHistorySelection()},700)}
async function clearHistory(){try{const db=await openDb();const tx=db.transaction('ovation','readwrite');tx.objectStore('ovation').clear();await txDone(tx);db.close();state.history=[];renderHistoryControls();updateStorageInfo();toast('ローカル履歴を消去しました')}catch{}}

init();

// Home gauge (0–100) and the empty state before a place is set.
function setIndexGauge(score){
  const card=$('#indexCard'),ring=$('#indexRing');
  if(card)card.classList.toggle('no-loc',score==null);
  $('.hero-grid')?.classList.toggle('no-loc',score==null);
  if(!ring)return;
  const c=2*Math.PI*52,v=score==null?0:clamp(score,0,100);
  ring.style.strokeDasharray=`${c*v/100} ${c}`;
  ring.style.stroke=v>=70?'var(--green)':v>=45?'var(--aqua)':v>=25?'var(--amber)':'#5c7a88';
}
// Space-weather cards: a colour cue for how favourable each value is for aurora.
function decorateMetrics(s){
  const lv=(id,level)=>{const el=$(id)?.closest('.metric');if(el)el.dataset.level=level};
  const kp=s.kp,bz=s.bz,bt=s.bt,w=s.wind,d=s.dst;
  lv('#mKp',kp==null?'':kp>=6?'high':kp>=4?'watch':'calm');
  lv('#mBz',bz==null?'':bz<=-10?'high':bz<=-3?'watch':'calm');
  lv('#mBt',bt==null?'':bt>=20?'high':bt>=10?'watch':'calm');
  lv('#mWind',w==null?'':w>=650?'high':w>=500?'watch':'calm');
  lv('#mDst',d==null?'':d<=-100?'high':d<=-50?'watch':'calm');
}
// Keep the sticky navigation right under the header (its height depends on the screen width).
function syncHeaderHeight(){const h=$('.app-header');if(h)document.documentElement.style.setProperty('--header-h',h.offsetHeight+'px')}
window.addEventListener('resize',syncHeaderHeight);syncHeaderHeight();setTimeout(syncHeaderHeight,300);
