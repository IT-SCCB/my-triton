import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dedupeStations,
  mapOverpassElementToStation,
  sampleRoutePoints,
} from './clientOsm';
import type { GasStationApiItem } from './tripPlanner';

test('mapOverpassElementToStation maps a fuel node with tags', () => {
  const station = mapOverpassElementToStation({
    type: 'node',
    id: 123,
    lat: 13.7563,
    lon: 100.5018,
    tags: {
      name: 'ปตท. สาขาสยาม',
      brand: 'PTT',
      'addr:street': 'ถนนพระราม 1',
      'addr:province': 'กรุงเทพมหานคร',
    },
  });
  assert.deepEqual(station, {
    id: 'osm-node-123',
    name: 'ปตท. สาขาสยาม',
    address: 'ถนนพระราม 1 กรุงเทพมหานคร',
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
});

test('mapOverpassElementToStation uses way center and brand as name fallback', () => {
  const station = mapOverpassElementToStation({
    type: 'way',
    id: 456,
    center: { lat: 13.8, lon: 100.6 },
    tags: { brand: 'บางจาก' },
  });
  assert.equal(station?.id, 'osm-way-456');
  assert.equal(station?.name, 'บางจาก');
  assert.deepEqual(station?.location, { lat: 13.8, lng: 100.6 });
});

test('mapOverpassElementToStation falls back to generic name and null for no location', () => {
  const unnamed = mapOverpassElementToStation({
    type: 'node',
    id: 789,
    lat: 13.9,
    lon: 100.7,
    tags: {},
  });
  assert.equal(unnamed?.name, 'ปั๊มน้ำมัน');

  const noLocation = mapOverpassElementToStation({
    type: 'relation',
    id: 999,
    tags: { name: 'ปั๊มไร้พิกัด' },
  });
  assert.equal(noLocation, null);
});

test('dedupeStations drops a station mapped as both node and way', () => {
  const a: GasStationApiItem = {
    id: 'osm-node-1',
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
    id: 'osm-way-2',
    location: { lat: 13.75633, lng: 100.50183 },
  };
  const c: GasStationApiItem = {
    ...a,
    id: 'osm-node-3',
    location: { lat: 13.8, lng: 100.6 },
  };
  assert.deepEqual(dedupeStations([a, b, c]).map((s) => s.id), [
    'osm-node-1',
    'osm-node-3',
  ]);
});

test('sampleRoutePoints spaces samples and always ends at the destination', () => {
  // เส้นทางตรง ~100 กม. (จุดทุก ~2 กม.)
  const points = Array.from({ length: 51 }, (_, i) => ({
    lat: 13.7 + i * 0.018,
    lng: 100.5,
  }));
  const samples = sampleRoutePoints(points);
  assert.ok(samples.length <= 8);
  assert.deepEqual(samples[0], points[0]);
  assert.deepEqual(samples[samples.length - 1], points[points.length - 1]);
  // จุดติดกันต้องห่างกันอย่างน้อย ~10 กม. (0.09 องศาละติจูด ≈ 10 กม.)
  // ยกเว้นคู่สุดท้ายที่อาจถูกแทนด้วยจุดปลายทาง
  for (let i = 1; i < samples.length - 1; i += 1) {
    assert.ok(samples[i].lat - samples[i - 1].lat >= 0.089);
  }
});

test('sampleRoutePoints returns the single point for a trivial route', () => {
  assert.deepEqual(sampleRoutePoints([{ lat: 13.7, lng: 100.5 }]), [
    { lat: 13.7, lng: 100.5 },
  ]);
  assert.deepEqual(sampleRoutePoints([]), []);
});
