import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStationIndex,
  dedupeStations,
  filterAlongRouteStations,
  filterNearbyStations,
  mapStaticStationToItem,
  parseLatLngText,
  sampleRoutePoints,
} from './clientOsm';
import type { StaticStation } from './clientOsm';
import type { GasStationApiItem } from './tripPlanner';

test('mapStaticStationToItem maps a static station with name and brand fallback', () => {
  const station = mapStaticStationToItem({
    n: 'ปตท. สาขาสยาม',
    b: 'PTT',
    lat: 13.7563,
    lon: 100.5018,
  });
  assert.deepEqual(station, {
    id: 'static-13.75630-100.50180',
    name: 'ปตท. สาขาสยาม',
    address: '',
    location: { lat: 13.7563, lng: 100.5018 },
    rating: null,
    userRatingCount: null,
    openNow: null,
    googleMapsUri:
      'https://www.google.com/maps/search/?api=1&query=13.7563,100.5018',
    directionsUri:
      'https://www.google.com/maps/dir/?api=1&destination=13.7563,100.5018',
    routingDistanceMeters: null,
    routingDurationSeconds: null,
  });

  const brandOnly = mapStaticStationToItem({
    n: '',
    b: 'บางจาก',
    lat: 13.8,
    lon: 100.6,
  });
  assert.equal(brandOnly.name, 'บางจาก');

  const unnamed = mapStaticStationToItem({
    n: '',
    b: '',
    lat: 13.9,
    lon: 100.7,
  });
  assert.equal(unnamed.name, 'ปั๊มน้ำมัน');
});

test('dedupeStations drops a station mapped as both node and way', () => {
  const a: GasStationApiItem = {
    id: 'static-13.75631-100.50181',
    name: 'ปตท.',
    address: '',
    location: { lat: 13.75631, lng: 100.50181 },
    rating: null,
    userRatingCount: null,
    openNow: null,
    googleMapsUri: null,
    directionsUri: null,
    routingDistanceMeters: null,
    routingDurationSeconds: null,
  };
  const b: GasStationApiItem = {
    ...a,
    id: 'static-13.75633-100.50183',
    location: { lat: 13.75633, lng: 100.50183 },
  };
  const c: GasStationApiItem = {
    ...a,
    id: 'static-13.80000-100.60000',
    location: { lat: 13.8, lng: 100.6 },
  };
  assert.deepEqual(dedupeStations([a, b, c]).map((s) => s.id), [
    'static-13.75631-100.50181',
    'static-13.80000-100.60000',
  ]);
});

const MOCK_STATIONS: StaticStation[] = [
  { n: 'ปั๊มใกล้สุด', b: 'PTT', lat: 13.7563, lon: 100.5018 },
  { n: 'ปั๊ม 2 กม.', b: 'บางจาก', lat: 13.7743, lon: 100.5018 },
  { n: 'ปั๊ม 5 กม.', b: 'Shell', lat: 13.8003, lon: 100.5018 },
  { n: 'ปั๊มไกล', b: 'PTT', lat: 13.95, lon: 100.5018 },
  { n: 'ปั๊มข้างทาง', b: 'Caltex', lat: 13.7563, lon: 100.55 },
];

test('buildStationIndex groups stations by grid cell', () => {
  const index = buildStationIndex(MOCK_STATIONS);
  assert.ok(index.size > 0);
  const total = [...index.values()].reduce((sum, bucket) => sum + bucket.length, 0);
  assert.equal(total, MOCK_STATIONS.length);
});

test('filterNearbyStations keeps only stations within radius, nearest first', () => {
  const found = filterNearbyStations(
    MOCK_STATIONS,
    { lat: 13.7563, lng: 100.5018 },
    5000,
    40
  );
  assert.deepEqual(
    found.map((s) => s.name),
    ['ปั๊มใกล้สุด', 'ปั๊ม 2 กม.', 'ปั๊ม 5 กม.']
  );

  const limited = filterNearbyStations(
    MOCK_STATIONS,
    { lat: 13.7563, lng: 100.5018 },
    5000,
    2
  );
  assert.equal(limited.length, 2);
  assert.equal(limited[0].name, 'ปั๊มใกล้สุด');
});

test('filterAlongRouteStations finds stations near the polyline, in route order', () => {
  // เส้นทางตรงเหนือ-ใต้ ~15 กม. (จุดทุก ~1 กม.)
  const route = Array.from({ length: 16 }, (_, i) => ({
    lat: 13.7563 + i * 0.009,
    lng: 100.5018,
  }));
  const found = filterAlongRouteStations(MOCK_STATIONS, route, 2000, 60);
  assert.deepEqual(
    found.map((s) => s.name),
    ['ปั๊มใกล้สุด', 'ปั๊ม 2 กม.', 'ปั๊ม 5 กม.']
  );
  // ปั๊มข้างทาง (ห่างเส้น ~5 กม. ตะวันออก) กับปั๊มไกล (เลยปลายทาง ~6 กม.) ต้องไม่ติด
  assert.ok(!found.some((s) => s.name === 'ปั๊มข้างทาง'));
  assert.ok(!found.some((s) => s.name === 'ปั๊มไกล'));
});

test('sampleRoutePoints covers the whole route with ~2 km spacing', () => {
  // เส้นทางตรง ~100 กม. (จุดทุก ~2 กม.)
  const points = Array.from({ length: 51 }, (_, i) => ({
    lat: 13.7 + i * 0.018,
    lng: 100.5,
  }));
  const samples = sampleRoutePoints(points);
  // เดิม cap 8 จุดครอบคลุมแค่ ~70 กม.แรก — ตอนนี้ต้องครอบคลุมเกือบทั้งเส้นทาง
  assert.ok(samples.length > 8);
  assert.ok(samples.length <= 120);
  assert.deepEqual(samples[0], points[0]);
  assert.deepEqual(samples[samples.length - 1], points[points.length - 1]);
  // จุดติดกันห่างกัน ~2 กม. (0.018 องศาละติจูด ≈ 2 กม.) ยกเว้นคู่สุดท้ายที่อาจสั้นกว่า
  for (let i = 1; i < samples.length - 1; i += 1) {
    assert.ok(samples[i].lat - samples[i - 1].lat >= 0.017);
  }
});

test('sampleRoutePoints returns the single point for a trivial route', () => {
  assert.deepEqual(sampleRoutePoints([{ lat: 13.7, lng: 100.5 }]), [
    { lat: 13.7, lng: 100.5 },
  ]);
  assert.deepEqual(sampleRoutePoints([]), []);
});

test('parseLatLngText parses valid coordinate strings and rejects invalid input', () => {
  assert.deepEqual(parseLatLngText('12.7550739, 101.8605464'), {
    lat: 12.7550739,
    lng: 101.8605464,
  });
  assert.deepEqual(parseLatLngText('13.6143643,100.7913915'), {
    lat: 13.6143643,
    lng: 100.7913915,
  });
  assert.equal(parseLatLngText('ช้างข้าม นายายอาม จันทบุรี'), null);
  assert.equal(parseLatLngText('95.0, 101.0'), null);
});

