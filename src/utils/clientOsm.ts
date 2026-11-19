/**
 * ค้นหาปั๊มน้ำมัน + เส้นทางแบบ client-side ล้วนๆ ด้วย OpenStreetMap
 * (Leaflet แสดงแผนที่ / Overpass API ค้นหาปั๊ม / Nominatim หาพิกัดปลายทาง / OSRM คำนวณเส้นทาง)
 *
 * ไม่ต้องใช้ API key, ไม่ต้องผูกบัตร, ไม่ต้องมีเซิร์ฟเวอร์หลังบ้าน —
 * จึงทำงานได้บน GitHub Pages (STATIC_MODE) ที่ apiFetch โยน ServerUnavailableError
 * ทันที ดู src/utils/serverApi.ts
 *
 * ข้อจำกัดที่ต้องรู้:
 * - ปั๊มเล็ก/ปั๊มใหม่บางแห่งอาจไม่มีในข้อมูล OSM และไม่มีราคาน้ำมัน
 * - Overpass/Nominatim/OSRM เป็นบริการสาธารณะฟรี — ยิงเบาๆ ครั้งละ 1 คำขอ
 *   ต่อการค้นหา 1 ครั้ง (along-route รวมหลายจุดเป็นคำขอเดียว) และตั้ง timeout ไว้ทุกคำขอ
 * - Overpass คืนเฉพาะปั๊มที่มีพิกัด (node มี lat/lon, way/relation ใช้ center)
 */

import type { GasStationApiItem, LatLngPoint } from './tripPlanner';
import { decodeEncodedPolyline, haversineDistanceKm } from './tripPlanner';

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

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const OSRM_URL = 'https://router.project-osrm.org/route/v1/driving';

const NEARBY_RADIUS_METERS = 5000;
const ROUTE_RADIUS_METERS = 2000;
const NEARBY_LIMIT = 40;
const ALONG_ROUTE_LIMIT = 60;
const MAX_ROUTE_SAMPLES = 8;
const ROUTE_SAMPLE_SPACING_KM = 10;

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements?: OverpassElement[];
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
      throw new Error(errorMessage);
    }
    return (await res.json()) as unknown;
  } catch (err) {
    if (err instanceof Error && err.message === errorMessage) throw err;
    throw new Error(errorMessage);
  } finally {
    clearTimeout(timer);
  }
}

async function queryOverpass(ql: string): Promise<OverpassElement[]> {
  let lastError: Error | null = null;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const data = (await fetchJsonWithTimeout(
        endpoint,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `data=${encodeURIComponent(ql)}`,
        },
        20000,
        'ค้นหาปั๊มน้ำมันไม่สำเร็จ (เซิร์ฟเวอร์ Overpass ไม่ตอบสนอง) กรุณาลองใหม่อีกครั้ง'
      )) as OverpassResponse;
      return Array.isArray(data.elements) ? data.elements : [];
    } catch (err) {
      lastError = err instanceof Error ? err : new Error('Overpass error');
    }
  }
  throw lastError ?? new Error('ค้นหาปั๊มน้ำมันไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
}

export function mapOverpassElementToStation(
  el: OverpassElement
): GasStationApiItem | null {
  const location: LatLngPoint | null =
    typeof el.lat === 'number' && typeof el.lon === 'number'
      ? { lat: el.lat, lng: el.lon }
      : el.center
        ? { lat: el.center.lat, lng: el.center.lon }
        : null;
  if (!location) return null;

  const tags = el.tags ?? {};
  const name =
    tags.name?.trim() ||
    tags.brand?.trim() ||
    tags['brand:en']?.trim() ||
    'ปั๊มน้ำมัน';
  const addressParts = [
    tags['addr:housenumber'],
    tags['addr:street'],
    tags['addr:subdistrict'] ?? tags['addr:district'],
    tags['addr:province'],
  ]
    .map((part) => (part ?? '').trim())
    .filter((part) => part.length > 0);
  const address = tags['addr:full']?.trim() || addressParts.join(' ');

  return {
    id: `osm-${el.type}-${el.id}`,
    name,
    address,
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

export async function searchNearbyFuelStations(
  center: LatLngPoint,
  radiusMeters: number = NEARBY_RADIUS_METERS,
  limit: number = NEARBY_LIMIT
): Promise<GasStationApiItem[]> {
  const ql =
    `[out:json][timeout:20];` +
    `nwr["amenity"="fuel"](around:${Math.round(radiusMeters)},${center.lat},${center.lng});` +
    `out center ${limit};`;
  const elements = await queryOverpass(ql);
  return dedupeStations(
    elements
      .map(mapOverpassElementToStation)
      .filter((station): station is GasStationApiItem => station !== null)
  );
}

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
  // ปิดท้ายด้วยจุดปลายทางเสมอ (ถ้ายังไม่เกินโควตาให้เพิ่ม ถ้าเต็มแล้วให้แทนที่จุดสุดท้าย
  // เพื่อให้ปั๊มแถวปลายทางไม่หลุดจากการค้นหา)
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

export async function searchFuelAlongRoute(
  routePoints: LatLngPoint[],
  radiusMeters: number = ROUTE_RADIUS_METERS,
  limit: number = ALONG_ROUTE_LIMIT
): Promise<GasStationApiItem[]> {
  const samples = sampleRoutePoints(routePoints);
  if (samples.length === 0) return [];
  const clauses = samples
    .map(
      (point) =>
        `nwr["amenity"="fuel"](around:${Math.round(radiusMeters)},${point.lat},${point.lng});`
    )
    .join('');
  const ql = `[out:json][timeout:20];(${clauses});out center ${limit};`;
  const elements = await queryOverpass(ql);
  return dedupeStations(
    elements
      .map(mapOverpassElementToStation)
      .filter((station): station is GasStationApiItem => station !== null)
  );
}

export async function geocodePlace(
  query: string
): Promise<LatLngPoint | null> {
  const url =
    `${NOMINATIM_URL}?format=json&limit=1&countrycodes=th` +
    `&q=${encodeURIComponent(query.trim())}`;
  const data = (await fetchJsonWithTimeout(
    url,
    { headers: { 'Accept-Language': 'th' } },
    10000,
    'ค้นหาตำแหน่งปลายทางไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'
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
    'คำนวณเส้นทางไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'
  )) as OsrmResponse;
  const route = data.routes?.[0];
  if (!route || !route.geometry) {
    throw new Error('คำนวณเส้นทางไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
  }
  return {
    distanceMeters: route.distance,
    durationSeconds: route.duration,
    encodedPolyline: route.geometry,
    points: decodeEncodedPolyline(route.geometry),
  };
}

/**
 * ค้นหาปั๊มรอบจุดเริ่มต้น + ปั๊มตามเส้นทางไปปลายทาง แล้วคืนข้อมูลในรูปเดียวกับ
 * ที่เซิร์ฟเวอร์ /api/maps/route-stations เคยคืน (ดู RouteStationsApiResponse)
 * เพื่อให้ TripStationsMapPanel ใช้ต่อได้โดยไม่ต้องแก้
 */
export async function fetchRouteStationsOsm(params: {
  origin: LatLngPoint;
  destinationQuery?: string;
}): Promise<RouteStationsApiResponse> {
  const { origin } = params;
  const destinationQuery = (params.destinationQuery ?? '').trim();

  let nearbyStations: GasStationApiItem[] = [];
  let nearbyFailed = false;
  try {
    nearbyStations = await searchNearbyFuelStations(origin);
  } catch {
    nearbyFailed = true;
  }

  let route: RouteStationsApiResponse['route'] = null;
  let alongRouteStations: GasStationApiItem[] = [];
  let routeNotice: string | null = null;

  if (destinationQuery) {
    const destination = await geocodePlace(destinationQuery).catch(() => null);
    if (!destination) {
      routeNotice = 'หาตำแหน่งปลายทางไม่เจอ แสดงปั๊มใกล้จุดเริ่มต้นแทน';
    } else {
      try {
        const osrm = await fetchOsrmRoute(origin, destination);
        route = {
          distanceMeters: osrm.distanceMeters,
          durationSeconds: osrm.durationSeconds,
          encodedPolyline: osrm.encodedPolyline,
          startLocation: origin,
          endLocation: destination,
        };
        alongRouteStations = await searchFuelAlongRoute(osrm.points).catch(() => []);
      } catch {
        routeNotice = 'คำนวณเส้นทางไม่สำเร็จ แสดงปั๊มใกล้จุดเริ่มต้นแทน';
      }
    }
  }

  if (nearbyFailed && alongRouteStations.length > 0 && !routeNotice) {
    routeNotice = 'ค้นหาปั๊มใกล้จุดเริ่มต้นไม่สำเร็จ แสดงปั๊มตามเส้นทางแทน';
  }

  if (nearbyStations.length === 0 && alongRouteStations.length === 0) {
    throw new Error(
      'ค้นหาปั๊มน้ำมันไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ตแล้วลองใหม่อีกครั้ง'
    );
  }

  return { origin, route, alongRouteStations, nearbyStations, routeNotice };
}
