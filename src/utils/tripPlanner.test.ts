import test from 'node:test';
import assert from 'node:assert/strict';
import { SEED_VEHICLE_STATE } from '../data/seedData';
import { buildMaintenanceSchedules } from './maintenance';
import {
  calculateTripEstimate,
  evaluateTripMaintenanceImpacts,
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
