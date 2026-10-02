import {
  normalizeNoaaRows, latestRow, extractKp, extractDst, extractWindSpeed, extractBt, extractBz, parseOvation,
  getCaseInsensitive, safeNum
} from './core.js';

const NOAA = 'https://services.swpc.noaa.gov';
const OPEN_METEO = 'https://api.open-meteo.com/v1';
const GEO = 'https://geocoding-api.open-meteo.com/v1';
const NASA = 'https://api.nasa.gov/DONKI';

async function fetchJson(url, {timeout=15000, signal}={}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort('timeout'), timeout);
  if (signal) signal.addEventListener('abort', () => ctrl.abort(signal.reason), {once:true});
  try {
    const r = await fetch(url, {cache:'no-store', credentials:'omit', signal:ctrl.signal});
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return await r.json();
  } finally { clearTimeout(timer); }
}

export async function fetchOvation() {
  const raw = await fetchJson(`${NOAA}/json/ovation_aurora_latest.json`, {timeout:20000});
  return { raw, ...parseOvation(raw) };
}

export async function fetchSpaceWeather() {
  const urls = {
    kp: `${NOAA}/products/noaa-planetary-k-index.json`,
    kpForecast: `${NOAA}/products/noaa-planetary-k-index-forecast.json`,
    dst: `${NOAA}/products/kyoto-dst.json`,
    wind: `${NOAA}/products/summary/solar-wind-speed.json`,
    mag: `${NOAA}/products/summary/solar-wind-mag-field.json`,
    scales: `${NOAA}/products/noaa-scales.json`,
    alerts: `${NOAA}/products/alerts.json`
  };
  const entries = await Promise.allSettled(Object.entries(urls).map(async ([k,u]) => [k, await fetchJson(u)]));
  const raw = {};
  for (const e of entries) if (e.status === 'fulfilled') raw[e.value[0]] = e.value[1];

  const kpRows = normalizeNoaaRows(raw.kp);
  const kpForecastRows = normalizeNoaaRows(raw.kpForecast);
  const dstRows = normalizeNoaaRows(raw.dst);
  const windRows = normalizeNoaaRows(raw.wind);
  const magRows = normalizeNoaaRows(raw.mag);

  const kpRow = latestRow(kpRows);
  const dstRow = latestRow(dstRows);
  const windRow = latestRow(windRows);
  const magRow = latestRow(magRows);
  const kp = extractKp(kpRow);
  const dst = extractDst(dstRow);
  const wind = extractWindSpeed(windRow);
  const bt = extractBt(magRow);
  const bz = extractBz(magRow);

  const kpForecast = kpForecastRows.map(r => ({
    time: getCaseInsensitive(r,['time_tag','time','timestamp']),
    kp: extractKp(r),
    observed: getCaseInsensitive(r,['observed','status','source'])
  })).filter(x => x.time && Number.isFinite(x.kp));

  const alerts = normalizeNoaaRows(raw.alerts).slice(-30).reverse();
  return {kp,dst,wind,bt,bz,kpForecast,alerts,scales:raw.scales || null,raw,
    timestamps:{kp:getCaseInsensitive(kpRow||{},['time_tag','TimeStamp']),dst:getCaseInsensitive(dstRow||{},['time_tag','TimeStamp']),wind:getCaseInsensitive(windRow||{},['time_tag','TimeStamp']),mag:getCaseInsensitive(magRow||{},['time_tag','TimeStamp'])}};
}

function qs(params) {
  const p = new URLSearchParams();
  for (const [k,v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') p.set(k,String(v));
  return p.toString();
}

export async function fetchWeather(lat, lon) {
  const baseParams = {
    latitude:lat, longitude:lon,
    current:'cloud_cover,precipitation,rain,weather_code,visibility,wind_speed_10m',
    hourly:'cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,visibility,precipitation_probability,precipitation,is_day',
    daily:'sunrise,sunset,moonrise,moonset,moon_phase',
    timezone:'auto', forecast_days:4
  };
  try {
    return await fetchJson(`${OPEN_METEO}/forecast?${qs(baseParams)}`);
  } catch (e) {
    const fallback = {...baseParams, daily:'sunrise,sunset'};
    const data = await fetchJson(`${OPEN_METEO}/forecast?${qs(fallback)}`);
    data._lunarFallback = true;
    return data;
  }
}

export async function fetchWeatherMulti(points) {
  if (!points.length) return [];
  const latitude = points.map(p=>p.lat).join(',');
  const longitude = points.map(p=>p.lon).join(',');
  const url = `${OPEN_METEO}/forecast?${qs({
    latitude,longitude,
    hourly:'cloud_cover,precipitation,is_day',
    current:'cloud_cover,precipitation',
    timezone:'GMT', forecast_days:2
  })}`;
  const out = await fetchJson(url, {timeout:20000});
  return Array.isArray(out) ? out : [out];
}

export async function geocodePlaces(name, count=8) {
  const data = await fetchJson(`${GEO}/search?${qs({name,count,language:'ja',format:'json'})}`);
  return (data.results || []).map(r => ({
    name:r.name, admin1:r.admin1||'', country:r.country||'', lat:r.latitude, lon:r.longitude, timezone:r.timezone||''
  }));
}

function utcDateString(d) { return d.toISOString().slice(0,10); }

export async function fetchDonki(apiKey='DEMO_KEY', days=7) {
  const end = new Date();
  const start = new Date(end.getTime()-days*86400000);
  const common = `startDate=${utcDateString(start)}&endDate=${utcDateString(end)}&api_key=${encodeURIComponent(apiKey||'DEMO_KEY')}`;
  const [cme,gst,ips] = await Promise.allSettled([
    fetchJson(`${NASA}/CME?${common}`,{timeout:20000}),
    fetchJson(`${NASA}/GST?${common}`,{timeout:20000}),
    fetchJson(`${NASA}/IPS?${common}`,{timeout:20000})
  ]);
  return {
    cme:cme.status==='fulfilled'?cme.value:[],
    gst:gst.status==='fulfilled'?gst.value:[],
    ips:ips.status==='fulfilled'?ips.value:[],
    errors:[cme,gst,ips].filter(x=>x.status==='rejected').map(x=>String(x.reason?.message||x.reason))
  };
}

export function summarizeWeatherNow(weather) {
  const c = weather?.current || {};
  return {
    cloud:safeNum(c.cloud_cover), precipitation:safeNum(c.precipitation,0),
    visibility:safeNum(c.visibility), windSpeed:safeNum(c.wind_speed_10m), weatherCode:safeNum(c.weather_code)
  };
}

function parseWeatherTime(weather, t) {
  if (!t) return NaN;
  if (/Z$|[+-]\d\d:?\d\d$/.test(t)) return Date.parse(t);
  const off = Number(weather?.utc_offset_seconds || 0);
  const ms = Date.parse(String(t) + 'Z');
  return Number.isFinite(ms) ? ms - off*1000 : NaN;
}

export function weatherAtNearestHour(weather, target = new Date()) {
  const h = weather?.hourly;
  if (!h?.time?.length) return null;
  let best=0, bestDiff=Infinity;
  h.time.forEach((t,i)=>{ const diff=Math.abs(parseWeatherTime(weather,t)-target.getTime()); if(diff<bestDiff){bestDiff=diff;best=i;} });
  const get = k => Array.isArray(h[k]) ? h[k][best] : null;
  return {time:h.time[best],cloud:safeNum(get('cloud_cover')),low:safeNum(get('cloud_cover_low')),mid:safeNum(get('cloud_cover_mid')),high:safeNum(get('cloud_cover_high')),visibility:safeNum(get('visibility')),precipProbability:safeNum(get('precipitation_probability')),precipitation:safeNum(get('precipitation')),isDay:safeNum(get('is_day'))};
}

export function bestNightWindow(weather, hours=18) {
  const h = weather?.hourly;
  if (!h?.time?.length) return null;
  const now = Date.now();
  const rows = h.time.map((t,i)=>({
    time:t, ms:parseWeatherTime(weather,t), cloud:safeNum(h.cloud_cover?.[i],100), precip:safeNum(h.precipitation?.[i],0), isDay:safeNum(h.is_day?.[i],1)
  })).filter(r=>Number.isFinite(r.ms) && r.ms>=now-3600000 && r.ms<=now+hours*3600000 && r.isDay===0);
  rows.forEach(r=>r.score=100-r.cloud-Math.min(30,r.precip*20));
  rows.sort((a,b)=>b.score-a.score);
  return rows[0] || null;
}
