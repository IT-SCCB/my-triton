import test from 'node:test';
import assert from 'node:assert/strict';
import { SEED_VEHICLE_STATE } from '../data/seedData';
import {
  buildMaintenanceSchedules,
  calculateFuelRefillPreview,
  computeCostSummary,
  computeFleetHealthBanner,
  computeFuelAnalytics,
  computeMaintenanceCostTrend,
  computeMonthlyPartsVsLabor,
  filterServiceRecords,
  formatThaiDate,
  validateFuelInput,
  validateOdometerInput,
  validateServiceInput,
} from './maintenance';

test('seed schedules match corrected 15 Nov 2569 milestones exactly', () => {
  const schedules = buildMaintenanceSchedules(
    SEED_VEHICLE_STATE.services,
    SEED_VEHICLE_STATE.vehicle.currentOdometer,
    SEED_VEHICLE_STATE.scheduleIntervals
  );

  const engineOil = schedules.find((s) => s.key === 'engine_oil');
  const filters = schedules.find((s) => s.key === 'air_cabin_filter');
  const timingBelt = schedules.find((s) => s.key === 'timing_belt');

  assert.ok(engineOil, 'engine_oil schedule should exist');
  assert.equal(engineOil.nextDueKm, 243589);
  assert.equal(engineOil.remainingKm, 9739);
  assert.equal(engineOil.earlyCheckKm, 238589);
  assert.equal(engineOil.earlyRemainingKm, 4739);

  assert.ok(filters, 'air_cabin_filter schedule should exist');
  assert.equal(filters.nextDueKm, 243589);
  assert.equal(filters.remainingKm, 9739);

  assert.ok(timingBelt, 'timing_belt schedule should exist');
  assert.equal(timingBelt.nextDueKm, 333589);
  assert.equal(timingBelt.remainingKm, 99739);
  assert.equal(timingBelt.status, 'nominal');

  const banner = computeFleetHealthBanner(
    schedules,
    SEED_VEHICLE_STATE.services,
    SEED_VEHICLE_STATE.vehicle.currentOdometer,
    SEED_VEHICLE_STATE.scheduleIntervals
  );
  assert.equal(banner.level, 'nominal');
});

test('fuel analytics and combined expense breakdown match prototype figures', () => {
  const fuelStats = computeFuelAnalytics(
    SEED_VEHICLE_STATE.fuelLogs,
    SEED_VEHICLE_STATE.vehicle.fuelPercent,
    SEED_VEHICLE_STATE.vehicle.tankCapacityLiters
  );

  assert.equal(fuelStats.totalFuelCost, 2700);
  assert.equal(fuelStats.avgKml, 12.67);
  assert.equal(fuelStats.lastKml, 16.27);
  assert.equal(fuelStats.costPerKm, 2.65);
  assert.equal(fuelStats.approxTankLiters, 41.3);

  const summary = computeCostSummary(
    SEED_VEHICLE_STATE.services,
    SEED_VEHICLE_STATE.fuelLogs
  );
  assert.equal(summary.totalFuelCost, 2700);
  assert.equal(summary.totalMaintenanceCost, 5200);
  assert.equal(summary.totalCost, 7900);
  assert.equal(summary.fuelPercentShare, 34.2);
  assert.equal(summary.maintenancePercentShare, 65.8);
  assert.equal(summary.partsCost, 4500);
  assert.equal(summary.laborCost, 700);
});

test('monthly parts vs labor comparison groups services chronologically', () => {
  const monthly = computeMonthlyPartsVsLabor(SEED_VEHICLE_STATE.services);
  assert.equal(monthly.length, 2);

  assert.equal(monthly[0].monthKey, '2026-09');
  assert.equal(monthly[0].monthLabel, 'ก.ย. 2569');
  assert.equal(monthly[0].partsCost, 4100);
  assert.equal(monthly[0].laborCost, 700);
  assert.equal(monthly[0].totalCost, 4800);
  assert.equal(monthly[0].recordCount, 4);

  assert.equal(monthly[1].monthKey, '2026-11');
  assert.equal(monthly[1].monthLabel, 'พ.ย. 2569');
  assert.equal(monthly[1].partsCost, 400);
  assert.equal(monthly[1].laborCost, 0);
  assert.equal(monthly[1].totalCost, 400);
  assert.equal(monthly[1].partsPercent, 100);
  assert.equal(monthly[1].laborPercent, 0);
});

test('month-over-month maintenance cost trend builds 12-month window and flags spikes', () => {
  const trend = computeMaintenanceCostTrend(SEED_VEHICLE_STATE.services, '2026-11', 12);
  assert.equal(trend.points.length, 12);
  assert.equal(trend.points[0].monthKey, '2025-12');
  assert.equal(trend.points[11].monthKey, '2026-11');
  assert.equal(trend.totalPeriodCost, 5200);
  assert.equal(trend.activeMonthCount, 2);
  assert.equal(trend.monthlyAverage, 433);
  assert.equal(trend.peakMonth?.monthKey, '2026-09');
  assert.equal(trend.peakMonth?.totalCost, 4800);

  const sep = trend.points.find((p) => p.monthKey === '2026-09');
  const oct = trend.points.find((p) => p.monthKey === '2026-10');
  const nov = trend.points.find((p) => p.monthKey === '2026-11');

  assert.ok(sep && oct && nov);
  assert.equal(sep.isSpike, true);
  assert.equal(sep.momDelta, 4800);
  assert.equal(oct.totalCost, 0);
  assert.equal(oct.momDelta, -4800);
  assert.equal(oct.momPercent, -100);
  assert.equal(nov.isSpike, false);
  assert.equal(nov.momDelta, 400);
});

test('fuel refill preview computes distance, liters, and km/L', () => {
  const preview = calculateFuelRefillPreview({
    newOdometer: 234250,
    previousOdometer: 233850,
    amount: 1000,
    pricePerLiter: 33.55,
  });

  assert.equal(preview.distance, 400);
  assert.equal(preview.liters, 29.806);
  assert.equal(preview.kml, 13.42);
});

test('Thai Buddhist Era date formatting converts Gregorian dates cleanly', () => {
  assert.equal(formatThaiDate('2026-09-14', 'full'), '14 กันยายน 2569');
  assert.equal(formatThaiDate('2026-11-09', 'short'), '9 พ.ย. 2569');
});

test('filtering supports Thai keywords and category selection', () => {
  const allBelt = filterServiceRecords(SEED_VEHICLE_STATE.services, '', 'engine_belt');
  assert.equal(allBelt.length, 1);
  assert.equal(allBelt[0].totalCost, 3550);

  const acMatches = filterServiceRecords(SEED_VEHICLE_STATE.services, 'น้ำยาแอร์', 'all');
  assert.equal(acMatches.length, 1);
  assert.equal(acMatches[0].totalCost, 400);
});

test('input validation rejects invalid odometer, fuel, and empty service fields', () => {
  assert.equal(validateOdometerInput('').valid, false);
  assert.equal(validateOdometerInput('-500').valid, false);
  assert.equal(validateOdometerInput('233,850').valid, true);

  assert.equal(
    validateFuelInput({
      date: '2026-11-15',
      odometer: '234000',
      amount: '0',
      pricePerLiter: '33.55',
      liters: '0',
      note: 'บางจาก',
    }).valid,
    false
  );

  assert.equal(
    validateFuelInput({
      date: '2026-11-15',
      odometer: '234000',
      amount: '1000',
      pricePerLiter: '33.55',
      liters: '29.806',
      note: 'บางจาก',
      fuelPercent: '85',
    }).valid,
    true
  );

  assert.equal(
    validateServiceInput({
      date: '2026-11-15',
      title: '',
      odometer: '233850',
      partsCost: '0',
      laborCost: '0',
      intervalKm: '10000',
    }).valid,
    false
  );
});

test('fuel analytics and chart helper include only 4-22 km/L cycles in avgKml while keeping total distance and cost', async () => {
  const { getFuelChartLogs, isFuelKmlOutOfRange } = await import('./maintenance');
  const logsWithSkippedAndPartial = [
    ...SEED_VEHICLE_STATE.fuelLogs,
    {
      id: 'fuel-skipped-high',
      date: '2025-03-04',
      odometer: 206945,
      distance: 650,
      amount: 500,
      liters: 15.156,
      pricePerLiter: 32.99,
      kml: 42.89,
      note: 'บางจาก กม22 (จดข้ามรอบ)',
    },
    {
      id: 'fuel-partial-low',
      date: '2025-03-10',
      odometer: 207015,
      distance: 70,
      amount: 800,
      liters: 24.25,
      pricePerLiter: 32.99,
      kml: 2.89,
      note: 'Esso (เติมเต็มถังชดเชย)',
    },
  ];

  assert.equal(isFuelKmlOutOfRange(42.89), true);
  assert.equal(isFuelKmlOutOfRange(2.89), true);
  assert.equal(isFuelKmlOutOfRange(22.01), true);
  assert.equal(isFuelKmlOutOfRange(3.99), true);
  assert.equal(isFuelKmlOutOfRange(4), false);
  assert.equal(isFuelKmlOutOfRange(22), false);
  assert.equal(isFuelKmlOutOfRange(16.27), false);

  const stats = computeFuelAnalytics(logsWithSkippedAndPartial, 55, 75);
  // avgKml excludes >22 and <4 -> matches seed average (12.67 km/L)
  assert.equal(stats.avgKml, 12.67);
  // totalFuelCost & totalDistance STILL preserve all entries (2700 + 500 + 800 = 4000, 851 + 650 + 70 = 1571)
  assert.equal(stats.totalFuelCost, 4000);
  assert.equal(stats.totalDistance, 1571);

  const cleanChart = getFuelChartLogs(logsWithSkippedAndPartial);
  assert.equal(cleanChart.length, 3);
  assert.equal(cleanChart.some((l) => l.id === 'fuel-skipped-high' || l.id === 'fuel-partial-low'), false);

  const allChart = getFuelChartLogs(logsWithSkippedAndPartial, { includeOutliers: true });
  assert.equal(allChart.length, 5);
});

test('validateFuelInput enforces 75L tank capacity guard for full-tank refills', () => {
  assert.equal(
    validateFuelInput({
      date: '2026-11-15',
      odometer: '234200',
      amount: '2200',
      pricePerLiter: '33.55',
      liters: '65.57',
      note: 'บางจาก เต็มถังจากไฟเตือน',
      maxTankLiters: 75,
    }).valid,
    true
  );

  const overTank = validateFuelInput({
    date: '2026-11-15',
    odometer: '234200',
    amount: '3000',
    pricePerLiter: '33.55',
    liters: '89.42',
    note: 'บางจาก',
    maxTankLiters: 75,
  });
  assert.equal(overTank.valid, false);
  assert.ok(overTank.error?.includes('75'));
});

test('computeOdometerTrend computes mileage span, monthly average, and chronological points', async () => {
  const { computeOdometerTrend } = await import('./maintenance');
  const summary = computeOdometerTrend(SEED_VEHICLE_STATE.odometerLogs);

  assert.equal(summary.points.length, 6);
  assert.equal(summary.points[0].date, '2026-09-14');
  assert.equal(summary.points[summary.points.length - 1].date, '2026-11-15');
  assert.equal(summary.minOdometer, 231895);
  assert.equal(summary.maxOdometer, 233850);
  assert.equal(summary.totalTrackedKm, 1955);
  assert.equal(summary.spanDays, 62);
  assert.ok(summary.averageDailyKm > 30);
  assert.ok(summary.averageMonthlyKm > 900);
  assert.ok(summary.monthlyUsage.length >= 3);
});

test('computeFuelKmlFromFormula and findPreviousFuelLog compute accurate edit-mode formula values', async () => {
  const { computeFuelKmlFromFormula, findPreviousFuelLog } = await import('./maintenance');

  assert.equal(computeFuelKmlFromFormula(189, 35.768), 5.28);
  assert.equal(computeFuelKmlFromFormula(400, 29.806), 13.42);
  assert.equal(computeFuelKmlFromFormula(0, 20), 0);

  const prev = findPreviousFuelLog(SEED_VEHICLE_STATE.fuelLogs, {
    id: 'fuel-3',
    date: '2026-11-09',
    odometer: 233850,
  });
  assert.equal(prev?.id, 'fuel-2');
  assert.equal(prev?.odometer, 233661);
});

test('evaluateMaintenanceAlerts triggers approaching (<=500km) and overdue alerts accurately', async () => {
  const { evaluateMaintenanceAlerts } = await import('./maintenance');

  // Seed oil/filter nextDueKm = 243,589. At 243,100 -> remaining = 489 km (approaching <= 500)
  const approachingAlerts = evaluateMaintenanceAlerts(
    SEED_VEHICLE_STATE.services,
    243100,
    SEED_VEHICLE_STATE.scheduleIntervals,
    500
  );
  assert.equal(approachingAlerts.length, 2);
  assert.equal(approachingAlerts[0].severity, 'approaching');
  assert.equal(approachingAlerts[0].remainingKm, 489);

  // At 242,789 -> remaining = 800 km -> 0 alerts for 500km threshold, 2 alerts for 1000km threshold
  const noneAt500 = evaluateMaintenanceAlerts(
    SEED_VEHICLE_STATE.services,
    242789,
    SEED_VEHICLE_STATE.scheduleIntervals,
    500
  );
  assert.equal(noneAt500.length, 0);

  const twoAt1000 = evaluateMaintenanceAlerts(
    SEED_VEHICLE_STATE.services,
    242789,
    SEED_VEHICLE_STATE.scheduleIntervals,
    1000
  );
  assert.equal(twoAt1000.length, 2);
  assert.equal(twoAt1000[0].remainingKm, 800);

  // At 243,650 -> remaining = -61 km -> overdue
  const overdueAlerts = evaluateMaintenanceAlerts(
    SEED_VEHICLE_STATE.services,
    243650,
    SEED_VEHICLE_STATE.scheduleIntervals,
    500
  );
  assert.equal(overdueAlerts.length, 2);
  assert.equal(overdueAlerts[0].severity, 'overdue');
  assert.equal(overdueAlerts[0].remainingKm, -61);
});

test('reconcileFuelLogsWithOdometer backfills missing distances and recalculates km/L accurately', async () => {
  const { getTodayIsoDate, reconcileFuelLogsWithOdometer } = await import('./maintenance');

  assert.match(getTodayIsoDate(), /^\d{4}-\d{2}-\d{2}$/);

  const importedFuelLogs = [
    {
      id: 'f-1',
      date: '2026-09-30',
      odometer: 232400,
      distance: 0,
      amount: 1000,
      liters: 30,
      pricePerLiter: 33.33,
      kml: 0,
      note: 'บางจาก',
    },
    {
      id: 'f-2',
      date: '2026-10-10',
      odometer: 232850,
      distance: 0,
      amount: 1200,
      liters: 36,
      pricePerLiter: 33.33,
      kml: 656.25,
      note: 'PTT',
    },
    {
      id: 'f-3',
      date: '2026-10-20',
      odometer: 233350,
      distance: 0,
      amount: 1300,
      liters: 40,
      pricePerLiter: 32.5,
      kml: 0,
      note: 'Esso',
    },
  ];

  const odoBaseline = [
    {
      id: 'odo-base',
      date: '2026-09-29',
      odometer: 231895,
      source: 'บันทึกเซอร์วิส',
    },
  ];

  const autoResult = reconcileFuelLogsWithOdometer(importedFuelLogs, {
    odometerLogs: odoBaseline,
  });

  assert.equal(autoResult.missingDistanceCount, 3);
  assert.equal(autoResult.logs[0].distance, 505); // 232400 - 231895
  assert.equal(autoResult.logs[0].kml, 16.83); // 505 / 30
  assert.equal(autoResult.logs[1].distance, 450); // 232850 - 232400
  assert.equal(autoResult.logs[1].kml, 12.5); // 450 / 36 (spike 656.25 fixed)
  assert.equal(autoResult.logs[2].distance, 500); // 233350 - 232850
  assert.equal(autoResult.logs[2].kml, 12.5); // 500 / 40
});

test('reconcileFuelLogsWithOdometer preserves recorded kmPerLiter/kml even under forceRecalculateAllKml and keeps seed rows untouched', async () => {
  const { getRecordedFuelKml, reconcileFuelLogsWithOdometer } = await import('./maintenance');

  const seedCheck = reconcileFuelLogsWithOdometer(SEED_VEHICLE_STATE.fuelLogs, {
    odometerLogs: SEED_VEHICLE_STATE.odometerLogs,
    forceRecalculateAllKml: true,
  });

  assert.equal(seedCheck.mismatchedCount, 0);
  assert.equal(seedCheck.changedLogs.length, 0);

  const byId = new Map(seedCheck.logs.map((l) => [l.id, l]));
  assert.equal(byId.get('fuel-3')?.odometer, 233850);
  assert.equal(byId.get('fuel-3')?.distance, 189);
  assert.equal(byId.get('fuel-3')?.kml, 16.27);
  assert.equal(byId.get('fuel-2')?.odometer, 233661);
  assert.equal(byId.get('fuel-2')?.distance, 72);
  assert.equal(byId.get('fuel-2')?.kml, 13.39);
  assert.equal(byId.get('fuel-1')?.odometer, 233589);
  assert.equal(byId.get('fuel-1')?.distance, 590);
  assert.equal(byId.get('fuel-1')?.kml, 8.34);

  // Partial tank with explicit kmPerLiter must NOT be overwritten when distance is backfilled
  const partialRefillResult = reconcileFuelLogsWithOdometer(
    [
      {
        id: 'p-1',
        date: '2026-10-30',
        odometer: 233589,
        distance: 590,
        amount: 500,
        liters: 11.74,
        pricePerLiter: 42.59,
        kml: 8.34,
        note: 'ดีเซล',
      },
      {
        id: 'p-2',
        date: '2026-11-01',
        odometer: 233661,
        distance: 0, // missing distance -> should backfill +72
        amount: 1000,
        liters: 29.806,
        pricePerLiter: 33.55,
        kml: 0,
        kmPerLiter: 13.39, // recorded via kmPerLiter alias -> must be kept!
        note: 'Esso',
      },
    ],
    { forceRecalculateAllKml: true }
  );

  assert.equal(getRecordedFuelKml(partialRefillResult.logs[1]), 13.39);
  assert.equal(partialRefillResult.logs[1].distance, 72);
  assert.equal(partialRefillResult.logs[1].kml, 13.39);

  // Corrupted canonical seed entries self-heal back to actual values
  const corrupted = SEED_VEHICLE_STATE.fuelLogs.map((l) => {
    if (l.id === 'fuel-3') return { ...l, kml: 5.28 };
    if (l.id === 'fuel-2') return { ...l, kml: 2.42 };
    if (l.id === 'fuel-1') return { ...l, kml: 50.26 };
    return l;
  });
  const healed = reconcileFuelLogsWithOdometer(corrupted, {
    odometerLogs: SEED_VEHICLE_STATE.odometerLogs,
    forceRecalculateAllKml: true,
  });
  const healedById = new Map(healed.logs.map((l) => [l.id, l]));
  assert.equal(healedById.get('fuel-3')?.kml, 16.27);
  assert.equal(healedById.get('fuel-2')?.kml, 13.39);
  assert.equal(healedById.get('fuel-1')?.kml, 8.34);

  // Skipped-cycle rows already having distance & kml (>22 or <4) do NOT trigger mismatchedCount
  const skippedCycles = [
    ...SEED_VEHICLE_STATE.fuelLogs,
    {
      id: 'old-skip-1',
      date: '2026-10-15',
      odometer: 232939,
      distance: 620,
      amount: 500,
      liters: 15.15,
      pricePerLiter: 33,
      kml: 40.92,
      note: 'PTT',
    },
    {
      id: 'old-partial-2',
      date: '2026-10-20',
      odometer: 232999,
      distance: 60,
      amount: 1000,
      liters: 30.3,
      pricePerLiter: 33,
      kml: 1.98,
      note: 'บางจาก',
    },
  ];
  const skippedCheck = reconcileFuelLogsWithOdometer(skippedCycles, {
    forceRecalculateAllKml: true,
  });
  assert.equal(skippedCheck.mismatchedCount, 0);
});

test('computeMonthlyOdometerSummary aggregates monthly readings, peak driving month, MoM delta, and window slicing', async () => {
  const { computeMonthlyOdometerSummary } = await import('./maintenance');

  const seedSummary = computeMonthlyOdometerSummary(SEED_VEHICLE_STATE.odometerLogs);
  assert.equal(seedSummary.monthCount, 3);
  assert.equal(seedSummary.points[0].monthKey, '2026-09');
  assert.equal(seedSummary.points[0].endOdometer, 231895);
  assert.equal(seedSummary.points[0].readingsCount, 2);
  assert.equal(seedSummary.points[1].monthKey, '2026-10');
  assert.equal(seedSummary.points[1].endOdometer, 233589);
  assert.equal(seedSummary.points[1].distanceKm, 1694);
  assert.equal(seedSummary.points[2].monthKey, '2026-11');
  assert.equal(seedSummary.points[2].endOdometer, 233850);
  assert.equal(seedSummary.points[2].distanceKm, 261);
  assert.equal(seedSummary.points[2].readingsCount, 3);
  assert.equal(seedSummary.points[2].momDistanceDelta, 261 - 1694);
  assert.equal(seedSummary.peakDistanceMonth?.monthKey, '2026-10');
  assert.equal(seedSummary.points[1].isPeakMonth, true);
  assert.equal(seedSummary.totalTrackedKm, 1955);
  assert.equal(seedSummary.averageMonthlyDistanceKm, 978);
  assert.equal(seedSummary.latestOdometer, 233850);

  // Window slicing retains accurate startOdometer from prior month
  const sliced = computeMonthlyOdometerSummary(SEED_VEHICLE_STATE.odometerLogs, 2);
  assert.equal(sliced.monthCount, 2);
  assert.equal(sliced.points[0].monthKey, '2026-10');
  assert.equal(sliced.points[0].startOdometer, 231895);
  assert.equal(sliced.points[0].distanceKm, 1694);

  // Empty logs return clean zeroed summary
  const empty = computeMonthlyOdometerSummary([]);
  assert.equal(empty.monthCount, 0);
  assert.equal(empty.points.length, 0);
  assert.equal(empty.peakDistanceMonth, null);
  assert.equal(empty.averageMonthlyDistanceKm, 0);
});

test('computeFuelCostTrend aggregates monthly fuel spending, liters, MoM changes, and peak month', async () => {
  const { computeFuelCostTrend } = await import('./maintenance');

  const trend = computeFuelCostTrend(SEED_VEHICLE_STATE.fuelLogs, '2026-11', 6);
  assert.equal(trend.points.length, 6);
  assert.equal(trend.points[0].monthKey, '2026-06');
  assert.equal(trend.points[5].monthKey, '2026-11');
  assert.equal(trend.totalPeriodCost, 2700);
  assert.equal(trend.totalPeriodLiters, 77.31);
  assert.equal(trend.activeMonthCount, 2);
  assert.equal(trend.monthlyAverage, 450);
  assert.equal(trend.activeMonthlyAverage, 1350);
  assert.equal(trend.peakMonth?.monthKey, '2026-11');
  assert.equal(trend.peakMonth?.totalCost, 2200);

  const oct = trend.points.find((p) => p.monthKey === '2026-10');
  const nov = trend.points.find((p) => p.monthKey === '2026-11');
  assert.ok(oct && nov);
  assert.equal(oct.totalCost, 500);
  assert.equal(oct.refillCount, 1);
  assert.equal(oct.isPeakMonth, false);
  assert.equal(nov.totalCost, 2200);
  assert.equal(nov.refillCount, 2);
  assert.equal(nov.momDelta, 1700);
  assert.equal(nov.momPercent, 340);
  assert.equal(nov.isPeakMonth, true);

  const emptyTrend = computeFuelCostTrend([], '2026-11', 6);
  assert.equal(emptyTrend.points.length, 6);
  assert.equal(emptyTrend.totalPeriodCost, 0);
  assert.equal(emptyTrend.activeMonthCount, 0);
  assert.equal(emptyTrend.peakMonth, null);
});
