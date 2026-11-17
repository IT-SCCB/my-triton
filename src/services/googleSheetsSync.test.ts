import test from 'node:test';
import assert from 'node:assert/strict';
import { SEED_VEHICLE_STATE } from '../data/seedData';
import {
  mergeSheetsPayloadIntoState,
  normalizeSheetDateToIso,
} from '../utils/sheetsMerge';
import {
  formatLastSyncBadgeTime,
  hasImportableSheetsPayload,
  isValidGasWebhookUrl,
} from './googleSheetsSync';

test('isValidGasWebhookUrl validates http/https GAS URLs and rejects invalid values', () => {
  assert.equal(
    isValidGasWebhookUrl('https://script.google.com/macros/s/AKfycbx123/exec'),
    true
  );
  assert.equal(isValidGasWebhookUrl('   '), false);
  assert.equal(isValidGasWebhookUrl('not-a-url'), false);
  assert.equal(isValidGasWebhookUrl('javascript:alert(1)'), false);
});

test('hasImportableSheetsPayload distinguishes full/sheet payloads from empty initial sheets', () => {
  assert.equal(hasImportableSheetsPayload(null), false);
  assert.equal(hasImportableSheetsPayload({}), false);
  assert.equal(hasImportableSheetsPayload({ initialServiceOdo: 233589 }), false);
  assert.equal(
    hasImportableSheetsPayload({ sheetFuelLogs: [], sheetMaintenanceLogs: [] }),
    false
  );
  assert.equal(
    hasImportableSheetsPayload({ fullState: SEED_VEHICLE_STATE }),
    true
  );
  assert.equal(
    hasImportableSheetsPayload({
      odometer: 234000,
      fuelLogs: SEED_VEHICLE_STATE.fuelLogs,
    }),
    true
  );
  assert.equal(
    hasImportableSheetsPayload({
      sheetFuelLogs: [{ date: '2026-11-18', odometer: 234300, amount: 1000 }],
    }),
    true
  );
  assert.equal(
    hasImportableSheetsPayload({
      sheetMaintenanceLogs: [{ date: '2026-11-18', odometer: 234300, title: 'สลับยาง' }],
    }),
    true
  );
});

test('formatLastSyncBadgeTime formats valid ISO timestamp in Bangkok time', () => {
  const formatted = formatLastSyncBadgeTime('2026-11-16T05:30:00.000Z');
  assert.match(formatted, /\d{2}:\d{2}\s*น\./);
  assert.equal(formatLastSyncBadgeTime('invalid-date'), '');
});

test('normalizeSheetDateToIso parses ISO, slash, and Thai Buddhist dates cleanly', () => {
  assert.equal(normalizeSheetDateToIso('2026-11-18'), '2026-11-18');
  assert.equal(normalizeSheetDateToIso('2569-11-18'), '2026-11-18');
  assert.equal(normalizeSheetDateToIso('18/11/2569'), '2026-11-18');
  assert.equal(normalizeSheetDateToIso('9 พ.ย. 2569'), '2026-11-09');
});

test('mergeSheetsPayloadIntoState merges new sheetFuelLogs and sheetMaintenanceLogs, deduplicates existing rows, and updates odometer', () => {
  const payload = {
    fullState: SEED_VEHICLE_STATE,
    sheetFuelLogs: [
      // Duplicate of fuel-3 (Thai date string matching 2026-11-09 + 233850) -> skipped
      {
        date: '9 พ.ย. 2569',
        odometer: '233,850',
        amount: 1200,
        liters: 35.768,
        pricePerLiter: 33.55,
        kml: 16.27,
        note: 'บางจาก กม.22 (ดีเซล B20)',
      },
      // New entry appended via Gemini Chat into Google Sheets -> merged!
      {
        date: '2026-11-18',
        odometer: '234,320',
        amount: '1,100',
        pricePerLiter: 33.55,
        note: 'PTT บางพลี (เพิ่มจาก Gemini)',
      },
    ],
    sheetMaintenanceLogs: [
      // Duplicate of existing service -> skipped
      {
        date: '2026-11-09',
        odometer: 233850,
        title: 'ระบบแอร์: ตรวจเช็กและเติมน้ำยาแอร์เพิ่ม',
        cost: 400,
      },
      // New service appended via Gemini Chat -> merged!
      {
        date: '18/11/2569',
        odometer: 234350,
        title: 'สลับยางและตั้งศูนย์ล้อ',
        cost: '650 บาท',
        notes: 'B-Quik (เพิ่มจาก Gemini)',
      },
    ],
  };

  const result = mergeSheetsPayloadIntoState(SEED_VEHICLE_STATE, payload);
  assert.equal(result.addedFuelCount, 1);
  assert.equal(result.addedServiceCount, 1);
  assert.equal(result.updatedOdometer, true);
  assert.equal(result.state.fuelLogs.length, 4);
  assert.equal(result.state.services.length, 6);
  assert.equal(result.state.vehicle.currentOdometer, 234350);

  const addedFuel = result.state.fuelLogs.find((f) => f.odometer === 234320);
  assert.ok(addedFuel, 'added sheet fuel log should exist');
  assert.equal(addedFuel.distance, 470); // 234320 - 233850
  assert.equal(addedFuel.liters, 32.787); // 1100 / 33.55
  assert.equal(addedFuel.kml, 14.33); // 470 / 32.787

  const addedService = result.state.services.find(
    (s) => s.title === 'สลับยางและตั้งศูนย์ล้อ'
  );
  assert.ok(addedService, 'added sheet service should exist');
  assert.equal(addedService.date, '2026-11-18');
  assert.equal(addedService.totalCost, 650);
  assert.equal(addedService.category, 'brakes_tires');

  // Re-pulling the exact same standalone sheetFuelLogs/sheetMaintenanceLogs must NOT duplicate
  const secondPull = mergeSheetsPayloadIntoState(result.state, {
    sheetFuelLogs: payload.sheetFuelLogs,
    sheetMaintenanceLogs: payload.sheetMaintenanceLogs,
  });
  assert.equal(secondPull.addedFuelCount, 0);
  assert.equal(secondPull.addedServiceCount, 0);
  assert.equal(secondPull.state.fuelLogs.length, 4);
  assert.equal(secondPull.state.services.length, 6);
});

