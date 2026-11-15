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

test('fuel analytics and chart helper filter out extreme km/L spikes (>30 km/L) by default', async () => {
  const { getFuelChartLogs } = await import('./maintenance');
  const logsWithSpike = [
    ...SEED_VEHICLE_STATE.fuelLogs,
    {
      id: 'fuel-spike',
      date: '2025-03-04',
      odometer: 206945,
      distance: 0,
      amount: 500,
      liters: 15.156,
      pricePerLiter: 32.99,
      kml: 656.25,
      note: 'บางจาก กม22',
    },
  ];

  const stats = computeFuelAnalytics(logsWithSpike, 55, 75);
  assert.equal(stats.avgKml, 12.67);

  const cleanChart = getFuelChartLogs(logsWithSpike);
  assert.equal(cleanChart.length, 3);
  assert.equal(cleanChart.some((l) => l.id === 'fuel-spike'), false);

  const allChart = getFuelChartLogs(logsWithSpike, { includeOutliers: true });
  assert.equal(allChart.length, 4);
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
