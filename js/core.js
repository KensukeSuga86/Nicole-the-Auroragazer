export const APP_VERSION = '0.3.0';
export const EARTH_RADIUS_KM = 6371.0088;
export const DEFAULT_AURORA_ALTITUDE_KM = 250;

export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
export const toRad = d => d * Math.PI / 180;
export const toDeg = r => r * 180 / Math.PI;

export function safeNum(v, fallback = null) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function normalizeNoaaRows(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) {
    if (!payload.length) return [];
    if (Array.isArray(payload[0])) {
      const header = payload[0];
      if (header.every(x => typeof x === 'string')) {
        return payload.slice(1).map(row => Object.fromEntries(header.map((k, i) => [k, row[i]])));
      }
      return payload.map((row, i) => ({ index: i, values: row }));
    }
    if (typeof payload[0] === 'object') return payload;
    return payload.map((v, i) => ({ index: i, value: v }));
  }
  if (typeof payload === 'object') {
    if (Array.isArray(payload.data)) return normalizeNoaaRows(payload.data);
    if (Array.isArray(payload.results)) return normalizeNoaaRows(payload.results);
    const vals = Object.values(payload);
    if (vals.length && vals.every(v => v && typeof v === 'object' && !Array.isArray(v))) return vals;
    return [payload];
  }
  return [];
}

export function getCaseInsensitive(obj, candidates = []) {
  if (!obj || typeof obj !== 'object') return undefined;
  const entries = Object.entries(obj);
  for (const c of candidates) {
    if (Object.prototype.hasOwnProperty.call(obj, c)) return obj[c];
    const found = entries.find(([k]) => k.toLowerCase() === String(c).toLowerCase());
    if (found) return found[1];
  }
  return undefined;
}

export function extractTime(row) {
  return getCaseInsensitive(row, [
    'time_tag','TimeStamp','timestamp','time','date','datetime','observation_time','forecast_time','issue_time'
  ]);
}

export function latestRow(rows) {
  const usable = (rows || []).map(r => ({ r, t: Date.parse(extractTime(r) || '') }))
    .filter(x => Number.isFinite(x.t));
  if (!usable.length) return rows?.at?.(-1) || rows?.[rows.length - 1] || null;
  usable.sort((a,b) => a.t - b.t);
  return usable.at(-1).r;
}

export function extractKp(row) {
  const direct = getCaseInsensitive(row, ['Kp','kp','kp_index','predicted_kp','value']);
  if (direct != null) return safeNum(direct);
  const whole = safeNum(getCaseInsensitive(row, ['Kp_integer','kp_integer']));
  const frac = safeNum(getCaseInsensitive(row, ['Kp_fraction','kp_fraction']), 0);
  return whole == null ? null : whole + frac;
}

export function extractDst(row) {
  return safeNum(getCaseInsensitive(row, ['Dst','dst','dst_index','value']));
}

export function extractWindSpeed(row) {
  return safeNum(getCaseInsensitive(row, ['proton_speed','WindSpeed','wind_speed','speed','solar_wind_speed','value']));
}

export function extractBt(row) {
  return safeNum(getCaseInsensitive(row, ['Bt','bt','total_field','bt_gsm','field_total']));
}

export function extractBz(row) {
  return safeNum(getCaseInsensitive(row, ['Bz','bz','bz_gsm','gsm_bz','field_z']));
}

export function parseOvation(payload) {
  const coords = payload?.coordinates;
  if (!Array.isArray(coords)) return { observationTime: null, forecastTime: null, points: [] };
  const points = coords.map(v => {
    if (!Array.isArray(v) || v.length < 3) return null;
    const lon = safeNum(v[0]);
    const lat = safeNum(v[1]);
    const intensity = safeNum(v[2]);
    return [lon,lat,intensity].every(Number.isFinite) ? { lon, lat, intensity } : null;
  }).filter(Boolean);
  return {
    observationTime: payload['Observation Time'] || payload.observation_time || null,
    forecastTime: payload['Forecast Time'] || payload.forecast_time || null,
    points
  };
}

export function greatCircleDistanceKm(lat1, lon1, lat2, lon2) {
  const p1 = toRad(lat1), p2 = toRad(lat2);
  const dphi = toRad(lat2-lat1), dlambda = toRad(lon2-lon1);
  const a = Math.sin(dphi/2)**2 + Math.cos(p1)*Math.cos(p2)*Math.sin(dlambda/2)**2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

export function initialBearingDeg(lat1, lon1, lat2, lon2) {
  const p1 = toRad(lat1), p2 = toRad(lat2), dl = toRad(lon2-lon1);
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1)*Math.sin(p2) - Math.sin(p1)*Math.cos(p2)*Math.cos(dl);
  return (toDeg(Math.atan2(y,x)) + 360) % 360;
}

export function apparentElevationDeg(surfaceDistanceKm, altitudeKm = DEFAULT_AURORA_ALTITUDE_KM) {
  const theta = surfaceDistanceKm / EARTH_RADIUS_KM;
  const R = EARTH_RADIUS_KM, r = R + altitudeKm;
  const dx = r*Math.cos(theta) - R;
  const dy = r*Math.sin(theta);
  const dist = Math.hypot(dx,dy);
  if (!dist) return 90;
  return toDeg(Math.asin(clamp(dx/dist,-1,1)));
}

export function analyzeOvationForObserver(ovation, lat, lon, options = {}) {
  const threshold = options.threshold ?? 1;
  const altitudeKm = options.altitudeKm ?? DEFAULT_AURORA_ALTITUDE_KM;
  const hemisphereSign = lat >= 0 ? 1 : -1;
  let nearestLocal = null;
  let bestVisible = null;
  let strongest = null;

  for (const p of ovation?.points || []) {
    if (Math.sign(p.lat || hemisphereSign) !== hemisphereSign && Math.abs(p.lat) > 1) continue;
    const distance = greatCircleDistanceKm(lat, lon, p.lat, p.lon);
    if (!nearestLocal || distance < nearestLocal.distanceKm) nearestLocal = { ...p, distanceKm: distance };
    if (!strongest || p.intensity > strongest.intensity) strongest = { ...p, distanceKm: distance };
    if (p.intensity < threshold) continue;
    const elevation = apparentElevationDeg(distance, altitudeKm);
    const bearing = initialBearingDeg(lat, lon, p.lat, p.lon);
    const candidate = { ...p, distanceKm: distance, elevationDeg: elevation, bearingDeg: bearing };
    if (elevation > -1 && (!bestVisible || elevation > bestVisible.elevationDeg ||
        (Math.abs(elevation-bestVisible.elevationDeg) < 0.1 && p.intensity > bestVisible.intensity))) {
      bestVisible = candidate;
    }
  }
  return {
    localIntensity: nearestLocal?.intensity ?? 0,
    localDistanceKm: nearestLocal?.distanceKm ?? null,
    bestVisible,
    strongest
  };
}

export function kpLabel(kp) {
  if (kp == null) return '不明';
  if (kp < 4) return '静穏〜やや活発';
  if (kp < 5) return '活発';
  if (kp < 6) return 'G1 小規模磁気嵐';
  if (kp < 7) return 'G2 中規模磁気嵐';
  if (kp < 8) return 'G3 強い磁気嵐';
  if (kp < 9) return 'G4 非常に強い磁気嵐';
  return 'G5 極端な磁気嵐';
}

export function scoreAuroraActivity({kp,bz,bt,wind,dst,localOvation,visibleElevation}) {
  // 0-100, not a probability. Intentionally transparent weighted condition index.
  const parts = [];
  const kpS = kp == null ? null : clamp((kp/9)*34,0,34);
  const bzS = bz == null ? null : clamp((Math.max(0,-bz)/20)*20,0,20);
  const btS = bt == null ? null : clamp((Math.max(0,bt-4)/20)*8,0,8);
  const windS = wind == null ? null : clamp(((wind-300)/700)*14,0,14);
  const dstS = dst == null ? null : clamp((Math.max(0,-dst)/250)*12,0,12);
  const ovaS = localOvation == null ? null : clamp((localOvation/100)*12,0,12);
  const elevBonus = visibleElevation == null ? 0 : clamp((visibleElevation+2)/22*8,0,8);
  for (const [key,val,max] of [['Kp',kpS,34],['Bz',bzS,20],['Bt',btS,8],['太陽風',windS,14],['Dst',dstS,12],['OVATION',ovaS,12]]) {
    if (val != null) parts.push({key,score:val,max});
  }
  const baseMax = parts.reduce((s,p)=>s+p.max,0);
  const baseScore = parts.reduce((s,p)=>s+p.score,0);
  const normalized = baseMax ? baseScore/baseMax*92 : 0;
  return { score: Math.round(clamp(normalized+elevBonus,0,100)), parts, elevationBonus: Math.round(elevBonus) };
}

export function scoreVisibility({cloud, sunElevation, moonIllumination, moonUp, bortle=4, horizonObstruction=0, precipitation=0}) {
  let score = 100;
  const reasons = [];
  const c = safeNum(cloud,50);
  score -= clamp(c,0,100)*0.62;
  reasons.push({label:'雲量', value:`${Math.round(c)}%`, impact:c > 65 ? '大きな減点' : c > 35 ? '減点' : '良好'});
  if (safeNum(precipitation,0) > 0.1) { score -= 18; reasons.push({label:'降水',value:`${precipitation} mm`,impact:'減点'}); }
  const se = safeNum(sunElevation,-20);
  if (se > 0) score -= 100;
  else if (se > -6) score -= 65;
  else if (se > -12) score -= 35;
  else if (se > -18) score -= 15;
  reasons.push({label:'太陽高度',value:`${se.toFixed(1)}°`,impact:se <= -18 ? '暗夜' : '薄明の影響'});
  if (moonUp) {
    const illum = clamp(safeNum(moonIllumination,0),0,1);
    score -= illum*16;
    reasons.push({label:'月明かり',value:`${Math.round(illum*100)}%`,impact:illum>0.65?'やや減点':'軽微'});
  }
  const b = clamp(safeNum(bortle,4),1,9);
  score -= (b-1)*2.4;
  reasons.push({label:'光害（Bortle）',value:String(b),impact:b>=7?'減点':b<=3?'良好':'中程度'});
  const h = clamp(safeNum(horizonObstruction,0),0,45);
  score -= h*0.6;
  return { score: Math.round(clamp(score,0,100)), reasons };
}

export function combinedNicoleIndex(activityScore, visibilityScore) {
  const a = clamp(activityScore ?? 0,0,100), v = clamp(visibilityScore ?? 0,0,100);
  const score = Math.round(a*0.67 + v*0.33);
  let level = 'LOW', ja='低い';
  if (score >= 85) [level,ja]=['EXTREME','非常に高い'];
  else if (score >= 70) [level,ja]=['VERY HIGH','かなり高い'];
  else if (score >= 55) [level,ja]=['HIGH','高い'];
  else if (score >= 40) [level,ja]=['MODERATE','中程度'];
  else if (score >= 25) [level,ja]=['LOW','低い'];
  else [level,ja]=['VERY LOW','かなり低い'];
  return {score,level,ja};
}

export function eyeCameraAssessment({activityScore, visibilityScore, elevationDeg, localOvation=0}) {
  const elev = safeNum(elevationDeg,-90);
  const base = (activityScore ?? 0)*0.65 + (visibilityScore ?? 0)*0.35;
  const direct = localOvation >= 4;
  const camera = direct || (elev > -0.2 && base >= 38) || base >= 62;
  const eye = direct ? base >= 45 : (elev >= 2 && base >= 62);
  return {
    eye: eye ? '可能性あり' : base >= 45 ? '条件次第' : '難しい',
    camera: camera ? '期待できる' : base >= 30 ? '試す価値あり' : '難しい'
  };
}

export function solarElevationDeg(date, lat, lon) {
  const d = date instanceof Date ? date : new Date(date);
  const jd = d.getTime()/86400000 + 2440587.5;
  const n = jd - 2451545.0;
  const L = (280.460 + 0.9856474*n) % 360;
  const g = toRad((357.528 + 0.9856003*n) % 360);
  const lambda = toRad((L + 1.915*Math.sin(g) + 0.020*Math.sin(2*g)) % 360);
  const eps = toRad(23.439 - 0.0000004*n);
  const ra = Math.atan2(Math.cos(eps)*Math.sin(lambda), Math.cos(lambda));
  const dec = Math.asin(Math.sin(eps)*Math.sin(lambda));
  const GMST = (280.46061837 + 360.98564736629*(jd-2451545.0)) % 360;
  const LST = toRad((GMST + lon + 360) % 360);
  let H = LST - ra;
  while (H > Math.PI) H -= 2*Math.PI;
  while (H < -Math.PI) H += 2*Math.PI;
  const phi = toRad(lat);
  return toDeg(Math.asin(Math.sin(phi)*Math.sin(dec) + Math.cos(phi)*Math.cos(dec)*Math.cos(H)));
}

export function moonPhaseFraction(date = new Date()) {
  // 0=new, 0.5=full. Epoch: 2000-01-06 18:14 UTC new moon.
  const synodic = 29.530588853;
  const epoch = Date.UTC(2000,0,6,18,14,0);
  const days = (date.getTime()-epoch)/86400000;
  return ((days/synodic)%1+1)%1;
}

export function moonIlluminationFraction(date = new Date()) {
  return (1 - Math.cos(2*Math.PI*moonPhaseFraction(date)))/2;
}

export function formatDirection(deg) {
  if (deg == null || !Number.isFinite(deg)) return '—';
  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  return dirs[Math.round(((deg%360)+360)%360/22.5)%16];
}

export function getCameraRecommendation(activityScore, aperture = 2.0, focalLength = 20) {
  const s = clamp(activityScore ?? 40,0,100);
  let shutter=6, iso=3200;
  if (s >= 80) { shutter=1.3; iso=1600; }
  else if (s >= 65) { shutter=2.5; iso=2000; }
  else if (s >= 50) { shutter=4; iso=3200; }
  else if (s >= 35) { shutter=6; iso=4000; }
  else { shutter=10; iso=6400; }
  const aperturePenalty = Math.max(0, Math.log2((aperture*aperture)/(2*2)));
  iso = Math.round(iso * Math.pow(2, aperturePenalty));
  const starLimit = 500/Math.max(1,focalLength);
  shutter = Math.min(shutter, starLimit);
  return {shutter: Math.round(shutter*10)/10, iso: Math.min(12800, Math.max(400, Math.round(iso/100)*100)), aperture};
}

export function escapeHtml(s='') {
  return String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}
