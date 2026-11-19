/**
 * ค้นหาปั๊มน้ำมัน + เส้นทางแบบ client-side ล้วนๆ ด้วย OpenStreetMap
 *
 * - แผนที่: Leaflet + กระเบื้อง OSM
 * - ปั๊ม: ไฟล์ static JSON ปั๊มทั่วไทย (public/data/thailand-fuel-stations.json
 *   สกัดจาก Geofabrik Thailand extract วันที่ 19 พ.ย. 2569) กรองในเครื่อง
 *   ด้วย Haversine — ไม่ยิง Overpass API อีกต่อไป เพราะ Overpass สาธารณะ
 *   ตอบช้า/โดน 406/429/504 บ่อย (เทส 19 พ.ย. 2569: รอ ~90 วิแล้วได้ 0 แห่ง
 *   ทั้งพรีวิวและเว็บจริง) แถมโค้ดเดิมกลืนสาเหตุจริงทิ้งหมด
 * - ปลายทาง: Nominatim / เส้นทาง: OSRM
 *
 * ไม่ต้องใช้ API key, ไม่ต้องผูกบัตร, ไม่ต้องมีเซิร์ฟเวอร์หลังบ้าน —
 * จึงทำงานได้บน GitHub Pages (STATIC_MODE) ที่ apiFetch โยน ServerUnavailableError
 * ทันที ดู src/utils/serverApi.ts
 *
 * ข้อจำกัดที่ต้องรู้:
 * - ข้อมูลปั๊มเป็น snapshot วันที่สกัด (19 พ.ย. 2569) ปั๊มใหม่/ปั๊มที่ปิดไปแล้ว
 *   หลังวันนั้นอาจไม่ตรง — ต้องสกัดไฟล์ใหม่เป็นระยะ
 * - ปั๊มเล็กบางแห่งอาจไม่มีในข้อมูล OSM และไม่มีราคาน้ำมัน
 * - Nominatim/OSRM เป็นบริการสาธารณะฟรี — ยิงเบาๆ ครั้งละ 1 คำขอต่อการค้นหา 1 ครั้ง
 */

import type { GasStationApiItem, LatLngPoint } from './tripPlanner';
import {
  buildRouteCumulativeDistances,
  decodeEncodedPolyline,
  haversineDistanceKm,
} from './tripPlanner';

export interface RouteStationsApiResponse {
  origin: LatLngPoint;
  route: {
    distanceMeters: number;
    durationSeconds: number;
    encodedPolyline: string;
    startLocation: LatLngPoint | null;
    endLocation: LatLngPoint | null;
  } | null;
  alongRouteStations: GasStationApiItem[];
  nearbyStations: GasStationApiItem[];
  routeNotice: string | null;
}

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const OSRM_URL = 'https://router.project-osrm.org/route/v1/driving';

/** ไฟล์ข้อมูลปั๊ม static — อยู่ใน public/data/ จึงเสิร์ฟใต้ base path ของแอป
 *  (fallback '/' ไว้ให้ node:test ใต้ tsx ที่ไม่มี import.meta.env) */
const STATIONS_JSON_URL = `${import.meta.env?.BASE_URL ?? '/'}data/thailand-fuel-stations.json`;

const NEARBY_RADIUS_METERS = 5000;
const ROUTE_RADIUS_METERS = 2000;
const NEARBY_LIMIT = 40;
const ALONG_ROUTE_LIMIT = 60;
/** เก็บจุดตัวอย่างตามเส้นทางทุก ~2 กม. (เดิม 8 จุดห่างกัน 10 กม. ครอบคลุมแค่ ~70 กม.แรก) */
const ROUTE_SAMPLE_SPACING_KM = 2;
const MAX_ROUTE_SAMPLES = 120;

export interface StaticStation {
  n: string;
  b: string;
  lat: number;
  lon: number;
}

interface NominatimItem {
  lat: string;
  lon: string;
}

interface OsrmRoute {
  distance: number;
  duration: number;
  geometry: string;
}

interface OsrmResponse {
  routes?: OsrmRoute[];
}

function googleMapsSearchUri(location: LatLngPoint): string {
  return `https://www.google.com/maps/search/?api=1&query=${location.lat},${location.lng}`;
}

function googleMapsDirectionsUri(location: LatLngPoint): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${location.lat},${location.lng}`;
}

async function fetchJsonWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  errorMessage: string
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) {
      // แสดงสาเหตุจริง (status + URL) แทนข้อความตายตัว — เดิมกลืนทิ้งหมด
      throw new Error(`${errorMessage} (HTTP ${res.status} · ${url})`);
    }
    return (await res.json()) as unknown;
  } catch (err) {
    if (err instanceof Error && err.message.startsWith(errorMessage)) throw err;
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`${errorMessage} (หมดเวลา ${timeoutMs / 1000} วินาที · ${url})`);
    }
    throw new Error(`${errorMessage} (${err instanceof Error ? err.message : 'ไม่ทราบสาเหตุ'} · ${url})`);
  } finally {
    clearTimeout(timer);
  }
}

/* ---------------- static station data ---------------- */

let stationsPromise: Promise<StaticStation[]> | null = null;

/** โหลดไฟล์ปั๊ม static ครั้งเดียวแล้ว cache ไว้ (ล้มเหลวจะโยน error ที่บอกสาเหตุจริง) */
export function loadThailandStations(): Promise<StaticStation[]> {
  if (!stationsPromise) {
    stationsPromise = (async () => {
      const data = (await fetchJsonWithTimeout(
        STATIONS_JSON_URL,
        {},
        15000,
        'โหลดข้อมูลปั๊มน้ำมันไม่สำเร็จ'
      )) as StaticStation[];
      if (!Array.isArray(data)) {
        throw new Error(`โหลดข้อมูลปั๊มน้ำมันไม่สำเร็จ (ไฟล์ไม่ใช่รายการปั๊ม · ${STATIONS_JSON_URL})`);
      }
      return data;
    })().catch((err) => {
      // โหลดรอบหน้าจะได้ลองใหม่แทนที่จะจำ error เดิมไว้ตลอด
      stationsPromise = null;
      throw err;
    });
  }
  return stationsPromise;
}

/** ดัชนีตารางกริด (ช่อง ~2.2 กม.) ไว้ค้นปั๊มรอบจุดโดยไม่ต้องสแกนทั้งไฟล์ทุกครั้ง */
const GRID_CELL_DEG = 0.02;

export function buildStationIndex(stations: StaticStation[]): Map<string, StaticStation[]> {
  const index = new Map<string, StaticStation[]>();
  for (const station of stations) {
    const key = `${Math.floor(station.lon / GRID_CELL_DEG)},${Math.floor(station.lat / GRID_CELL_DEG)}`;
    const bucket = index.get(key);
    if (bucket) bucket.push(station);
    else index.set(key, [station]);
  }
  return index;
}

function stationsNearPoint(
  index: Map<string, StaticStation[]>,
  point: LatLngPoint,
  radiusMeters: number
): { station: StaticStation; distanceKm: number }[] {
  const radiusKm = radiusMeters / 1000;
  const latSpan = radiusKm / 111;
  const lonSpan = radiusKm / (111 * Math.max(0.2, Math.cos((point.lat * Math.PI) / 180)));
  const minCx = Math.floor((point.lng - lonSpan) / GRID_CELL_DEG);
  const maxCx = Math.floor((point.lng + lonSpan) / GRID_CELL_DEG);
  const minCy = Math.floor((point.lat - latSpan) / GRID_CELL_DEG);
  const maxCy = Math.floor((point.lat + latSpan) / GRID_CELL_DEG);
  const out: { station: StaticStation; distanceKm: number }[] = [];
  for (let cx = minCx; cx <= maxCx; cx += 1) {
    for (let cy = minCy; cy <= maxCy; cy += 1) {
      const bucket = index.get(`${cx},${cy}`);
      if (!bucket) continue;
      for (const station of bucket) {
        const distanceKm = haversineDistanceKm(point, { lat: station.lat, lng: station.lon });
        if (distanceKm * 1000 <= radiusMeters) {
          out.push({ station, distanceKm });
        }
      }
    }
  }
  return out;
}

export function mapStaticStationToItem(station: StaticStation): GasStationApiItem {
  const location: LatLngPoint = { lat: station.lat, lng: station.lon };
  const name = station.n?.trim() || station.b?.trim() || 'ปั๊มน้ำมัน';
  return {
    id: `static-${station.lat.toFixed(5)}-${station.lon.toFixed(5)}`,
    name,
    address: '',
    location,
    rating: null,
    userRatingCount: null,
    openNow: null,
    googleMapsUri: googleMapsSearchUri(location),
    directionsUri: googleMapsDirectionsUri(location),
    routingDistanceMeters: null,
    routingDurationSeconds: null,
  };
}

export function dedupeStations(stations: GasStationApiItem[]): GasStationApiItem[] {
  const seen = new Set<string>();
  const out: GasStationApiItem[] = [];
  for (const station of stations) {
    // ปั๊มเดียวกันอาจถูกวาดทั้ง node และ way — กันซ้ำด้วยพิกัดปัดเศษ (~11 ม.)
    const key = `${station.location.lat.toFixed(4)},${station.location.lng.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(station);
  }
  return out;
}

/** ปั๊มรอบจุดจากรายการ static ที่โหลดมาแล้ว (เรียงตามระยะใกล้ไปไกล) — pure, เทสได้โดยไม่ต้อง fetch */
export function filterNearbyStations(
  stations: StaticStation[],
  center: LatLngPoint,
  radiusMeters: number = NEARBY_RADIUS_METERS,
  limit: number = NEARBY_LIMIT
): GasStationApiItem[] {
  const index = buildStationIndex(stations);
  return dedupeStations(
    stationsNearPoint(index, center, radiusMeters)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, limit)
      .map((f) => mapStaticStationToItem(f.station))
  );
}

/** ปั๊มรอบจุดเริ่มต้นจากไฟล์ static (เรียงตามระยะใกล้ไปไกล) */
export async function searchNearbyFuelStations(
  center: LatLngPoint,
  radiusMeters: number = NEARBY_RADIUS_METERS,
  limit: number = NEARBY_LIMIT
): Promise<GasStationApiItem[]> {
  return filterNearbyStations(await loadThailandStations(), center, radiusMeters, limit);
}

/** เก็บจุดตัวอย่างตามเส้นทางทุก ~2 กม. ครอบคลุมทั้งเส้นทาง + ปิดท้ายด้วยปลายทางเสมอ */
export function sampleRoutePoints(
  points: LatLngPoint[],
  maxSamples: number = MAX_ROUTE_SAMPLES,
  minSpacingKm: number = ROUTE_SAMPLE_SPACING_KM
): LatLngPoint[] {
  if (points.length === 0) return [];
  const samples: LatLngPoint[] = [points[0]];
  let lastPicked = points[0];
  for (let i = 1; i < points.length && samples.length < maxSamples; i += 1) {
    if (haversineDistanceKm(lastPicked, points[i]) >= minSpacingKm) {
      samples.push(points[i]);
      lastPicked = points[i];
    }
  }
  const last = points[points.length - 1];
  if (haversineDistanceKm(lastPicked, last) > 0.5) {
    if (samples.length < maxSamples) {
      samples.push(last);
    } else {
      samples[samples.length - 1] = last;
    }
  }
  return samples;
}

/**
 * ปั๊มตามเส้นทางจากรายการ static ที่โหลดมาแล้ว — ปั๊มที่อยู่ห่างจากจุดตัวอย่างใดๆ
 * ไม่เกิน radiusMeters ถือว่าอยู่ตามเส้นทาง เรียงตาม กม. ที่ปั๊มอยู่บนเส้นทาง
 * (pure, เทสได้โดยไม่ต้อง fetch)
 */
export function filterAlongRouteStations(
  stations: StaticStation[],
  routePoints: LatLngPoint[],
  radiusMeters: number = ROUTE_RADIUS_METERS,
  limit: number = ALONG_ROUTE_LIMIT
): GasStationApiItem[] {
  const samples = sampleRoutePoints(routePoints);
  if (samples.length === 0) return [];
  const index = buildStationIndex(stations);
  const cumKm = buildRouteCumulativeDistances(samples);
  const best = new Map<string, { item: GasStationApiItem; routeKm: number }>();
  samples.forEach((sample, sampleIdx) => {
    for (const { station } of stationsNearPoint(index, sample, radiusMeters)) {
      const item = mapStaticStationToItem(station);
      const prev = best.get(item.id);
      if (!prev || cumKm[sampleIdx] < prev.routeKm) {
        best.set(item.id, { item, routeKm: cumKm[sampleIdx] });
      }
    }
  });
  return dedupeStations(
    [...best.values()]
      .sort((a, b) => a.routeKm - b.routeKm)
      .slice(0, limit)
      .map((entry) => entry.item)
  );
}

/** ปั๊มตามเส้นทางจากไฟล์ static */
export async function searchFuelAlongRoute(
  routePoints: LatLngPoint[],
  radiusMeters: number = ROUTE_RADIUS_METERS,
  limit: number = ALONG_ROUTE_LIMIT
): Promise<GasStationApiItem[]> {
  return filterAlongRouteStations(
    await loadThailandStations(),
    routePoints,
    radiusMeters,
    limit
  );
}

export async function geocodePlace(query: string): Promise<LatLngPoint | null> {
  const url =
    `${NOMINATIM_URL}?format=json&limit=1&countrycodes=th` +
    `&q=${encodeURIComponent(query.trim())}`;
  const data = (await fetchJsonWithTimeout(
    url,
    { headers: { 'Accept-Language': 'th' } },
    10000,
    'ค้นหาตำแหน่งปลายทางไม่สำเร็จ'
  )) as NominatimItem[];
  if (!Array.isArray(data) || data.length === 0) return null;
  const lat = Number(data[0].lat);
  const lng = Number(data[0].lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

export async function fetchOsrmRoute(
  origin: LatLngPoint,
  destination: LatLngPoint
): Promise<{
  distanceMeters: number;
  durationSeconds: number;
  encodedPolyline: string;
  points: LatLngPoint[];
}> {
  const url =
    `${OSRM_URL}/${origin.lng},${origin.lat};${destination.lng},${destination.lat}` +
    `?overview=full&geometries=polyline`;
  const data = (await fetchJsonWithTimeout(
    url,
    {},
    15000,
    'คำนวณเส้นทางไม่สำเร็จ'
  )) as OsrmResponse;
  const route = data.routes?.[0];
  if (!route || !route.geometry) {
    throw new Error(`คำนวณเส้นทางไม่สำเร็จ (OSRM ไม่คืนเส้นทาง · ${url})`);
  }
  return {
    distanceMeters: route.distance,
    durationSeconds: route.duration,
    encodedPolyline: route.geometry,
    points: decodeEncodedPolyline(route.geometry),
  };
}

/**
 * ค้นหาปั๊มรอบจุดเริ่มต้น + ปั๊มตามเส้นทางไปปลายทาง จากไฟล์ static ในเครื่อง
 * คืนข้อมูลในรูปเดียวกับที่เซิร์ฟเวอร์ /api/maps/route-stations เคยคืน
 * (ดู RouteStationsApiResponse) เพื่อให้ TripStationsMapPanel ใช้ต่อได้โดยไม่ต้องแก้
 *
 * ไม่โยน error เมื่อหาปั๊มไม่เจอ — คืนรายการว่าง + routeNotice ให้แผงแสดงแผนที่
 * กับป้ายเตือนแทนการซ่อนทั้งแผง (แผนที่กับเส้นทางไม่พึ่งข้อมูลปั๊ม)
 * โยน error ก็ต่อเมื่อโหลดไฟล์ปั๊มไม่ได้เลย โดยบอกสาเหตุจริง (HTTP status + URL)
 */
export async function fetchRouteStations(params: {
  origin: LatLngPoint;
  destinationQuery?: string;
}): Promise<RouteStationsApiResponse> {
  const { origin } = params;
  const destinationQuery = (params.destinationQuery ?? '').trim();

  // โหลดไฟล์ปั๊มก่อน — ถ้าไฟล์โหลดไม่ได้ ให้ error นี้เด้งขึ้นไปบอกผู้ใช้ตรงๆ
  const stations = await loadThailandStations();

  const nearbyStations = filterNearbyStations(stations, origin);

  let route: RouteStationsApiResponse['route'] = null;
  let alongRouteStations: GasStationApiItem[] = [];
  let routeNotice: string | null = null;

  if (destinationQuery) {
    let destination: LatLngPoint | null = null;
    try {
      destination = await geocodePlace(destinationQuery);
    } catch (err) {
      routeNotice = `หาตำแหน่งปลายทางไม่เจอ (${err instanceof Error ? err.message : 'ไม่ทราบสาเหตุ'}) แสดงปั๊มใกล้จุดเริ่มต้นแทน`;
    }
    if (destination) {
      try {
        const osrm = await fetchOsrmRoute(origin, destination);
        route = {
          distanceMeters: osrm.distanceMeters,
          durationSeconds: osrm.durationSeconds,
          encodedPolyline: osrm.encodedPolyline,
          startLocation: origin,
          endLocation: destination,
        };
        alongRouteStations = filterAlongRouteStations(stations, osrm.points);
      } catch (err) {
        routeNotice = `คำนวณเส้นทางไม่สำเร็จ (${err instanceof Error ? err.message : 'ไม่ทราบสาเหตุ'}) แสดงปั๊มใกล้จุดเริ่มต้นแทน`;
      }
    } else if (!routeNotice) {
      routeNotice = 'หาตำแหน่งปลายทางไม่เจอ แสดงปั๊มใกล้จุดเริ่มต้นแทน';
    }
  }

  if (nearbyStations.length === 0 && alongRouteStations.length === 0 && !routeNotice) {
    routeNotice = 'ไม่พบปั๊มน้ำมันในบริเวณที่ค้นหา (ข้อมูลปั๊มในไฟล์ static วันที่ 19 พ.ย. 2569)';
  }

  return { origin, route, alongRouteStations, nearbyStations, routeNotice };
}
