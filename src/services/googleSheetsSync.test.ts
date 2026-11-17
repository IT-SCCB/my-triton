import test from 'node:test';
import assert from 'node:assert/strict';
import { SEED_VEHICLE_STATE } from '../data/seedData';
import {
  mergeSheetsPayloadIntoState,
  normalizeLegacyGasPayload,
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


test('hasImportableSheetsPayload recognizes the legacy GAS array-row payload', () => {
  assert.equal(
    hasImportableSheetsPayload({
      status: 'success',
      fuelLogs: [
        ['2026-11-09T08:00:00.000Z', 233850, 189, 0, 33.55, 35.768, 5.28, 0, '', '', 'บางจาก กม.22 (ดีเซล B20)'],
      ],
      maintenanceLogs: [],
    }),
    true
  );
  assert.equal(
    hasImportableSheetsPayload({ status: 'success', fuelLogs: [], maintenanceLogs: [] }),
    false
  );
  // fuelLogs แบบ object (full-state push) ไม่ใช่ legacy — ไม่โดนแปลง
  assert.equal(
    normalizeLegacyGasPayload({
      odometer: 233850,
      fuelLogs: SEED_VEHICLE_STATE.fuelLogs,
    }),
    null
  );
});

test('normalizeLegacyGasPayload maps GAS array rows to sheet objects', () => {
  const normalized = normalizeLegacyGasPayload({
    status: 'success',
    fuelLogs: [
      ['2026-11-09T08:00:00.000Z', 233850, 189, 0, 33.55, 35.768, 5.28, 0, '', '', 'บางจาก กม.22 (ดีเซล B20)'],
    ],
    maintenanceLogs: [
      ['2026-09-14T07:00:00.000Z', 'เปลี่ยนชุดสายพานไทม์มิ่ง (สายพานราวลิ้น + สายพานปั๊ม) พร้อมค่าแรง', 233589, 100000, 3550, 333589, 99739, 'ปกติ', 'อะไหล่ 2,850 + ค่าแรง 700'],
    ],
  });
  assert.ok(normalized);
  assert.equal(normalized.sheetFuelLogs.length, 1);
  assert.deepEqual(normalized.sheetFuelLogs[0], {
    isoDate: '2026-11-09T08:00:00.000Z',
    odometer: 233850,
    distance: 189,
    pricePerLiter: 33.55,
    liters: 35.768,
    kml: 5.28,
    note: 'บางจาก กม.22 (ดีเซล B20)',
  });
  assert.deepEqual(normalized.sheetMaintenanceLogs[0], {
    isoDate: '2026-09-14T07:00:00.000Z',
    title: 'เปลี่ยนชุดสายพานไทม์มิ่ง (สายพานราวลิ้น + สายพานปั๊ม) พร้อมค่าแรง',
    odometer: 233589,
    intervalKm: 100000,
    totalCost: 3550,
    notes: 'อะไหล่ 2,850 + ค่าแรง 700',
  });
});

test('mergeSheetsPayloadIntoState imports real legacy GAS rows, deduplicates, and keeps existing data', () => {
  // แถวจริงจากชีต (ดึงสด 17 พ.ย. 2569): แถวน้ำมันล่าสุดซ้ำกับ fuel-3 ใน seed,
  // แถวซ่อมทั้ง 5 แถวมีใน seed แล้ว (2 แถวชื่อต่างเล็กน้อย — ต้องไม่ซ้ำ)
  const payload = {
    status: 'success',
    fuelLogs: [
      ['2026-11-09T08:00:00.000Z', 233850, 189, 0, 33.55, 35.768, 5.28, 0, '', '', 'บางจาก กม.22 (ดีเซล B20)'],
      ['2026-11-18T07:00:00.000Z', 234320, 470, 0, 33.55, 32.787, 14.33, 0, '', '', 'PTT บางพลี'],
    ],
    maintenanceLogs: [
      ['2026-09-14T07:00:00.000Z', 'เปลี่ยนชุดสายพานไทม์มิ่ง (สายพานราวลิ้น + สายพานปั๊ม) พร้อมค่าแรง', 233589, 100000, 3550, 333589, 99739, 'ปกติ', 'อะไหล่ 2,850 + ค่าแรง 700'],
      ['2026-09-14T07:00:00.000Z', 'เปลี่ยนถ่ายน้ำมันเครื่อง', 233589, 10000, 1250, 243589, 9739, 'ปกติ', 'เช็กทุก 10,000 km'],
      ['2026-09-14T07:00:00.000Z', 'เปลี่ยนกรองอากาศเครื่องยนต์และกรองแอร์', 233589, 10000, 0, 243589, 9739, 'ปกติ', 'รวมในรอบเซอร์วิส'],
      ['2026-09-29T07:00:00.000Z', 'เปลี่ยนถ่ายน้ำยาหล่อเย็น (Coolant) สีฟ้า', 231895, 40000, 0, 271895, 38045, 'ปกติ', 'น้ำยาหล่อเย็น Coolant แท้ศูนย์'],
      ['2026-11-09T08:00:00.000Z', 'ระบบแอร์ (ตรวจเช็กและเติมน้ำยาแอร์เพิ่ม)', 233850, '', 400, '', '', 'ปกติ', 'เย็นปกติ ตัดต่อดี เติมน้ำยาแอร์เพิ่ม'],
    ],
  };

  const result = mergeSheetsPayloadIntoState(SEED_VEHICLE_STATE, payload);
  assert.equal(result.addedFuelCount, 1);
  assert.equal(result.addedServiceCount, 0);
  assert.equal(result.updatedOdometer, true);
  assert.equal(result.state.fuelLogs.length, 4);
  assert.equal(result.state.services.length, 5);
  assert.equal(result.state.vehicle.currentOdometer, 234320);

  const addedFuel = result.state.fuelLogs.find((f) => f.odometer === 234320);
  assert.ok(addedFuel, 'added legacy fuel log should exist');
  assert.equal(addedFuel.distance, 470);
  assert.equal(addedFuel.liters, 32.787);
  assert.equal(addedFuel.amount, 1100); // 32.787 × 33.55 (ยอดเงินไม่อยู่ใน array)
  assert.equal(addedFuel.kml, 14.33);
  assert.equal(addedFuel.note, 'PTT บางพลี');

  // ดึงซ้ำต้องไม่ซ้ำ
  const secondPull = mergeSheetsPayloadIntoState(result.state, payload);
  assert.equal(secondPull.addedFuelCount, 0);
  assert.equal(secondPull.addedServiceCount, 0);
  assert.equal(secondPull.state.fuelLogs.length, 4);
  assert.equal(secondPull.state.services.length, 5);
});

test('mergeSheetsPayloadIntoState adds a genuinely new legacy maintenance row with correct mapping', () => {
  const result = mergeSheetsPayloadIntoState(SEED_VEHICLE_STATE, {
    status: 'success',
    fuelLogs: [],
    maintenanceLogs: [
      ['2026-11-20T07:00:00.000Z', 'เปลี่ยนผ้าเบรกหน้า', 234500, 40000, 2800, 274500, '', 'ปกติ', 'B-Quik'],
    ],
  });
  assert.equal(result.addedFuelCount, 0);
  assert.equal(result.addedServiceCount, 1);
  assert.equal(result.state.vehicle.currentOdometer, 234500);

  const added = result.state.services.find((s) => s.title === 'เปลี่ยนผ้าเบรกหน้า');
  assert.ok(added, 'added legacy service should exist');
  assert.equal(added.date, '2026-11-20');
  assert.equal(added.partsCost, 2800); // totalCost ตกเป็นค่าอะไหล่เมื่อไม่มีแยกค่าแรง
  assert.equal(added.totalCost, 2800);
  assert.equal(added.intervalKm, 40000);
  assert.equal(added.category, 'brakes_tires');
});
