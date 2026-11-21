import test from 'node:test';
import assert from 'node:assert/strict';
import { SEED_VEHICLE_STATE } from '../data/seedData';
import { buildMaintenanceSchedules } from './maintenance';
import {
  analyzeFuelPriceTrend,
  buildRouteCumulativeDistances,
  calculateTripEstimate,
  computeAnnualFuelCostForecast,
  computeTankRefuelMilestones,
  decodeEncodedPolyline,
  enrichGasStationsForTank,
  evaluateTripMaintenanceImpacts,
  extractDestinationFromRouteName,
  interpolatePointAtDistanceKm,
  TRIP_PRESET_ROUTES,
} from './tripPlanner';

test('calculateTripEstimate computes round-trip fuel liters, cost, and refill stops accurately', () => {
  const result = calculateTripEstimate({
    routeName: 'กรุงเทพฯ – เชียงใหม่',
    oneWayDistanceKm: 700,
    roundTrip: true,
    baseKml: 12.67,
    drivingCondition: 'mixed',
    fuelPricePerLiter: 33.55,
    bufferPercent: 10,
    extraCostBaht: 350,
    currentOdometer: 233850,
    tankCapacityLiters: 75,
    fuelPercent: 55,
  });

  assert.equal(result.totalDistanceKm, 1400);
  assert.equal(result.effectiveKml, 12.67);
  // 1400 / 12.67 = 110.497 -> 110.5L raw; * 1.1 = 121.5L buffered
  assert.equal(result.rawLitersNeeded, 110.5);
  assert.equal(result.bufferedLitersNeeded, 121.5);
  assert.equal(result.estimatedFuelCostBaht, Math.round((1400 / 12.67) * 1.1 * 33.55));
  assert.equal(result.totalTripCostBaht, result.estimatedFuelCostBaht + 350);
  assert.equal(result.currentTankLiters, 41.3);
  assert.equal(result.usableTankLiters, 31.3);
  assert.equal(result.canCompleteWithCurrentFuel, false);
  assert.equal(result.additionalLitersToBuy, 90.2);
  // usable full tank = 75 - 10 = 65L -> 90.2 / 65 -> 2 stops
  assert.equal(result.refuelStopsNeeded, 2);
  assert.equal(result.projectedEndOdometer, 235250);
});

test('calculateTripEstimate confirms short trips fit within current tank fuel', () => {
  const result = calculateTripEstimate({
    routeName: 'กรุงเทพฯ – พัทยา',
    oneWayDistanceKm: 150,
    roundTrip: false,
    baseKml: 12.5,
    drivingCondition: 'highway', // 12.5 * 1.08 = 13.5
    fuelPricePerLiter: 33.5,
    bufferPercent: 0,
    currentOdometer: 233850,
    tankCapacityLiters: 75,
    fuelPercent: 60, // 45L -> 35L usable -> 472 km range
  });

  assert.equal(result.effectiveKml, 13.5);
  assert.equal(result.rawLitersNeeded, 11.1);
  assert.equal(result.canCompleteWithCurrentFuel, true);
  assert.equal(result.refuelStopsNeeded, 0);
  assert.equal(result.additionalLitersToBuy, 0);
});

test('evaluateTripMaintenanceImpacts detects schedules that cross due threshold during trip', () => {
  const schedules = buildMaintenanceSchedules(
    SEED_VEHICLE_STATE.services,
    SEED_VEHICLE_STATE.vehicle.currentOdometer,
    SEED_VEHICLE_STATE.scheduleIntervals
  );

  // Engine oil remaining is 9,739 km in seed state. A 9,500 km expedition triggers warning (<500km remaining), 9,800 km triggers overdue.
  const impactsWarning = evaluateTripMaintenanceImpacts(schedules, 9500, 500);
  assert.ok(impactsWarning.some((i) => i.key === 'engine_oil' && i.becomesWarningDuringTrip));

  const impactsOverdue = evaluateTripMaintenanceImpacts(schedules, 9800, 500);
  assert.ok(impactsOverdue.some((i) => i.key === 'engine_oil' && i.becomesOverdueDuringTrip));
});

test('decodeEncodedPolyline decodes Google standard polyline coordinates accurately', () => {
  // Google documented example: "_p~iF~ps|U_ulLnnqC_mqNvxq`@" -> (38.5, -120.2), (40.7, -120.95), (43.252, -126.453)
  const decoded = decodeEncodedPolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
  assert.equal(decoded.length, 3);
  assert.ok(Math.abs(decoded[0].lat - 38.5) < 0.001);
  assert.ok(Math.abs(decoded[0].lng - -120.2) < 0.001);
  assert.ok(Math.abs(decoded[1].lat - 40.7) < 0.001);
  assert.ok(Math.abs(decoded[1].lng - -120.95) < 0.001);
  assert.ok(Math.abs(decoded[2].lat - 43.252) < 0.001);
  assert.ok(Math.abs(decoded[2].lng - -126.453) < 0.001);
});

test('computeTankRefuelMilestones and enrichGasStationsForTank classify stations by tank range', () => {
  const points = [
    { lat: 13.75, lng: 100.5 },
    { lat: 16.0, lng: 100.5 }, // ~250 km north
    { lat: 18.78, lng: 98.98 }, // ~600+ km north-west
  ];
  const cumKm = buildRouteCumulativeDistances(points);
  const totalDist = cumKm[cumKm.length - 1];
  assert.ok(totalDist > 550);

  const mid = interpolatePointAtDistanceKm(points, cumKm, 125);
  assert.ok(mid && mid.lat > 14.5 && mid.lat < 15.5);

  const estimate = calculateTripEstimate({
    routeName: 'กรุงเทพฯ – เชียงใหม่',
    oneWayDistanceKm: 650,
    roundTrip: false,
    baseKml: 12.0,
    drivingCondition: 'mixed',
    fuelPricePerLiter: 33.5,
    bufferPercent: 0,
    currentOdometer: 233850,
    tankCapacityLiters: 75,
    fuelPercent: 40, // 30L total -> 20L usable -> ~240km before reserve
  });

  const milestones = computeTankRefuelMilestones({
    points,
    cumKm,
    routeDistanceKm: totalDist,
    estimatedCurrentRangeKm: estimate.estimatedCurrentRangeKm,
    fullTankRangeKm: estimate.fullTankRangeKm,
  });

  assert.equal(milestones.length, 1);
  assert.equal(milestones[0].isFirstStop, true);
  assert.equal(milestones[0].kmFromOrigin, 240);

  const enriched = enrichGasStationsForTank({
    stations: [
      {
        id: 'st-early',
        name: 'PTT Near Start',
        address: 'Bangkok',
        location: { lat: 14.0, lng: 100.5 },
        rating: 4.5,
        userRatingCount: 100,
        openNow: true,
        googleMapsUri: 'https://maps.google.com/?q=1',
        directionsUri: null,
        routingDistanceMeters: 30000,
        routingDurationSeconds: 1800,
      },
      {
        id: 'st-rec',
        name: 'Bangchak Refuel Zone',
        address: 'Nakhon Sawan',
        location: { lat: 15.7, lng: 100.5 },
        rating: 4.3,
        userRatingCount: 80,
        openNow: true,
        googleMapsUri: 'https://maps.google.com/?q=2',
        directionsUri: null,
        routingDistanceMeters: 215000,
        routingDurationSeconds: 9000,
      },
      {
        id: 'st-far',
        name: 'Shell Beyond Range',
        address: 'Lampang',
        location: { lat: 18.2, lng: 99.4 },
        rating: 4.4,
        userRatingCount: 50,
        openNow: true,
        googleMapsUri: 'https://maps.google.com/?q=3',
        directionsUri: null,
        routingDistanceMeters: 520000,
        routingDurationSeconds: 21000,
      },
    ],
    origin: points[0],
    points,
    cumKm,
    estimate,
    tankCapacityLiters: 75,
    isAlongRoute: true,
  });

  assert.equal(enriched.find((s) => s.id === 'st-early')?.fuelStatus, 'within_tank');
  assert.equal(enriched.find((s) => s.id === 'st-rec')?.fuelStatus, 'recommended_stop');
  assert.equal(enriched.find((s) => s.id === 'st-far')?.fuelStatus, 'after_refuel');
});

test('extractDestinationFromRouteName parses Thai route titles cleanly', () => {
  assert.equal(extractDestinationFromRouteName('กรุงเทพฯ – พัทยา'), 'พัทยา ประเทศไทย');
  assert.equal(extractDestinationFromRouteName('กรุงเทพ ไป ระยอง'), 'ระยอง ประเทศไทย');
});

test('analyzeFuelPriceTrend and computeAnnualFuelCostForecast project 12 months from mileage and price trends', () => {
  const seedForecast = computeAnnualFuelCostForecast({
    odometerLogs: SEED_VEHICLE_STATE.odometerLogs,
    fuelLogs: SEED_VEHICLE_STATE.fuelLogs,
    baseKml: 14.83,
    currentFuelPricePerLiter: 33.55,
    trendMode: 'auto',
    startMonthKey: '2026-12',
  });

  assert.equal(seedForecast.points.length, 12);
  assert.equal(seedForecast.points[0].monthKey, '2026-12');
  assert.equal(seedForecast.points[11].monthKey, '2027-11');
  assert.equal(seedForecast.mileageSource, 'odometer_history');
  assert.equal(seedForecast.historicalMonthlyKm, 960);
  assert.equal(seedForecast.totalAnnualKm, 960 * 12);
  assert.equal(seedForecast.priceTrendDirection, 'down');
  assert.ok(seedForecast.points[11].projectedPricePerLiter < 33.55);
  assert.ok(seedForecast.points[11].projectedPricePerLiter >= 26.84); // bounded against unrealistic runaway
  assert.equal(
    seedForecast.totalAnnualCostBaht,
    seedForecast.points[11].cumulativeCostBaht
  );

  // Rising price history triggers positive monthly drift
  const risingTrend = analyzeFuelPriceTrend([
    {
      id: 'r1',
      date: '2026-09-01',
      odometer: 230000,
      distance: 400,
      amount: 1000,
      liters: 31.25,
      pricePerLiter: 32.0,
      kml: 12.8,
      note: 'PTT',
    },
    {
      id: 'r2',
      date: '2026-11-01',
      odometer: 231000,
      distance: 500,
      amount: 1400,
      liters: 40.0,
      pricePerLiter: 35.0,
      kml: 12.5,
      note: 'Bangchak',
    },
  ]);
  assert.equal(risingTrend.direction, 'up');
  assert.ok(risingTrend.observedMonthlyDeltaBaht > 0);

  // Steady mode holds price constant across all 12 months
  const steadyForecast = computeAnnualFuelCostForecast({
    odometerLogs: SEED_VEHICLE_STATE.odometerLogs,
    fuelLogs: SEED_VEHICLE_STATE.fuelLogs,
    baseKml: 12.0,
    currentFuelPricePerLiter: 34.0,
    trendMode: 'steady',
    startMonthKey: '2026-12',
  });
  assert.equal(steadyForecast.priceTrendDirection, 'steady');
  assert.equal(steadyForecast.points[0].projectedPricePerLiter, 34.0);
  assert.equal(steadyForecast.points[11].projectedPricePerLiter, 34.0);
  assert.equal(steadyForecast.points[0].estimatedCostBaht, 960 / 12 * 34);

  // Empty logs cleanly fall back to default estimate
  const fallbackForecast = computeAnnualFuelCostForecast({
    odometerLogs: [],
    fuelLogs: [],
    baseKml: 12.5,
    currentFuelPricePerLiter: 33.55,
    startMonthKey: '2026-12',
  });
  assert.equal(fallbackForecast.mileageSource, 'default_estimate');
  assert.equal(fallbackForecast.historicalMonthlyKm, 900);
  assert.equal(fallbackForecast.points.length, 12);
});

test('TRIP_PRESET_ROUTES includes Siam CC Bang Na to Na Yai Am Chanthaburi route with exact coordinates', () => {
  const preset = TRIP_PRESET_ROUTES.find((r) => r.id === 'siamcc-nayaiam');
  assert.ok(preset, 'Expected siamcc-nayaiam preset to exist');
  assert.equal(preset.oneWayKm, 174);
  assert.deepEqual(preset.originCoords, { lat: 13.6143643, lng: 100.7913915 });
  assert.deepEqual(preset.destinationCoords, { lat: 12.7550739, lng: 101.8605464 });
});

test('TRIP_PRESET_ROUTES includes Siam CC Bang Na to Siam Country Club Old Course Pattaya route with exact coordinates', () => {
  const preset = TRIP_PRESET_ROUTES.find((r) => r.id === 'siamcc-oldcourse');
  assert.ok(preset, 'Expected siamcc-oldcourse preset to exist');
  assert.equal(preset.oneWayKm, 104);
  assert.deepEqual(preset.originCoords, { lat: 13.6143643, lng: 100.7913915 });
  assert.deepEqual(preset.destinationCoords, { lat: 12.9179814, lng: 100.9877539 });
});

test('formatTripEstimateAsText and buildTripExportFilename produce shareable plain-text trip summary', async () => {
  const { buildTripExportFilename, formatTripEstimateAsText } = await import('./tripPlanner');

  assert.equal(
    buildTripExportFilename('Siam CC บางนา – Old Course พัทยา', '2026-11-20'),
    'trip-estimate-siam-cc-old-course-2026-11-20.txt'
  );
  assert.equal(
    buildTripExportFilename('กรุงเทพฯ – พัทยา', '2026-11-20'),
    'trip-estimate-2026-11-20.txt'
  );

  const estimate = calculateTripEstimate({
    routeName: 'กรุงเทพฯ – เชียงใหม่',
    oneWayDistanceKm: 695,
    roundTrip: true,
    baseKml: 12.67,
    drivingCondition: 'highway',
    fuelPricePerLiter: 33.55,
    bufferPercent: 10,
    extraCostBaht: 250,
    currentOdometer: 233850,
    tankCapacityLiters: 75,
    fuelPercent: 55,
  });

  const text = formatTripEstimateAsText({
    estimate,
    roundTrip: true,
    drivingCondition: 'highway',
    fuelPricePerLiter: 33.55,
    bufferPercent: 10,
    tankCapacityLiters: 75,
    fuelPercent: 55,
    currentOdometer: 233850,
    maintenanceImpacts: [
      {
        key: 'engine_oil',
        label: 'น้ำมันเครื่อง',
        nextDueKm: 243589,
        currentRemainingKm: 9739,
        remainingAfterTripKm: 8349,
        becomesOverdueDuringTrip: false,
        becomesWarningDuringTrip: true,
      },
    ],
    exportedAtIso: '2026-11-20',
  });

  assert.ok(text.includes('เส้นทาง: กรุงเทพฯ – เชียงใหม่'));
  assert.ok(text.includes('ไป-กลับ (×2)'));
  assert.ok(text.includes('1,390 กม.'));
  assert.ok(text.includes('ค่าทางด่วน/ค่าจอดรถเพิ่มเติม: 250 บาท'));
  assert.ok(text.includes('ต้องเติมเพิ่มอย่างน้อย'));
  assert.ok(text.includes('น้ำมันเครื่อง: จะเหลืออีก 8,349 กม.'));
});

