import test from 'node:test';
import assert from 'node:assert/strict';
import { computeFuelTripCostEstimate } from './fuelCalculator.ts';

test('computeFuelTripCostEstimate calculates one-way trip cost accurately from historical average KML', () => {
  const result = computeFuelTripCostEstimate({
    plannedDistanceKm: 253.4,
    expectedFuelPrice: 33.55,
    historicalAvgKml: 12.67,
    roundTrip: false,
    bufferPercent: 0,
    currentTankLiters: 41.3,
  });

  assert.equal(result.valid, true);
  assert.equal(result.effectiveDistanceKm, 253.4);
  assert.equal(result.baseLitersNeeded, 20);
  assert.equal(result.bufferedLitersNeeded, 20);
  assert.equal(result.estimatedTotalCostBaht, 671);
  assert.equal(result.costPerKm, 2.65);
  assert.equal(result.canCompleteWithCurrentFuel, true);
  assert.equal(result.additionalLitersNeeded, 0);
});

test('computeFuelTripCostEstimate supports round-trip doubling, safety buffer, and extra refuel estimate', () => {
  const result = computeFuelTripCostEstimate({
    plannedDistanceKm: 400,
    expectedFuelPrice: 34,
    historicalAvgKml: 12.5,
    roundTrip: true,
    bufferPercent: 10,
    currentTankLiters: 30,
  });

  // Effective distance: 800 km / 12.5 km/L = 64 L base; +10% buffer = 70.4 L
  // Cost: 70.4 * 34 = 2393.6 -> 2394 baht
  // Additional needed: 70.4 - 30 = 40.4 L -> 40.4 * 34 = 1373.6 -> 1374 baht
  assert.equal(result.valid, true);
  assert.equal(result.effectiveDistanceKm, 800);
  assert.equal(result.baseLitersNeeded, 64);
  assert.equal(result.bufferedLitersNeeded, 70.4);
  assert.equal(result.baseCostBaht, 2176);
  assert.equal(result.estimatedTotalCostBaht, 2394);
  assert.equal(result.canCompleteWithCurrentFuel, false);
  assert.equal(result.additionalLitersNeeded, 40.4);
  assert.equal(result.additionalRefuelCostBaht, 1374);
});

test('computeFuelTripCostEstimate rejects non-positive distance, price, or KML gracefully', () => {
  assert.equal(
    computeFuelTripCostEstimate({
      plannedDistanceKm: 0,
      expectedFuelPrice: 33.55,
      historicalAvgKml: 12.67,
    }).valid,
    false
  );

  assert.equal(
    computeFuelTripCostEstimate({
      plannedDistanceKm: 150,
      expectedFuelPrice: 0,
      historicalAvgKml: 12.67,
    }).valid,
    false
  );

  assert.equal(
    computeFuelTripCostEstimate({
      plannedDistanceKm: 150,
      expectedFuelPrice: 33.55,
      historicalAvgKml: 0,
    }).valid,
    false
  );
});
