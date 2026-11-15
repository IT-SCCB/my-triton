import test from 'node:test';
import assert from 'node:assert/strict';
import { SEED_VEHICLE_STATE } from '../data/seedData';
import { mergeImportedPatch, parseDriveTextDeterministic } from './driveParser';

test('parseDriveTextDeterministic parses prototype JSON payload cleanly', () => {
  const raw = JSON.stringify({
    odometer: 234120,
    fuelPercent: 72,
    fuelLogs: [
      {
        isoDate: '2026-11-15',
        odometer: 234120,
        distance: 270,
        amount: 900,
        liters: 26.826,
        pricePerLiter: 33.55,
        kml: 10.06,
        note: 'PTT ดีเซล',
      },
    ],
    maintenanceItems: [],
  });

  const patch = parseDriveTextDeterministic(raw, 'triton-backup.json');
  assert.ok(patch, 'patch should be parsed');
  assert.equal(patch.updatedOdometer, 234120);
  assert.equal(patch.updatedFuelPercent, 72);
  assert.equal(patch.newFuelLogs.length, 1);
});

test('mergeImportedPatch deduplicates existing entries and appends new readings', () => {
  const merged = mergeImportedPatch(SEED_VEHICLE_STATE, {
    summary: 'อัปเดตจาก Drive 15.24 น.',
    updatedOdometer: 234150,
    updatedFuelPercent: 80,
    updatedDate: '2026-11-15',
    sourceLabel: 'Google Drive (note-1524.txt)',
    newFuelLogs: [
      // Duplicate of existing fuel-3 -> should not duplicate
      {
        date: '2026-11-09',
        odometer: 233850,
        distance: 189,
        amount: 1200,
        liters: 35.768,
        pricePerLiter: 33.55,
        kml: 16.27,
        note: 'บางจาก กม.22 (ดีเซล B20)',
      },
      // Brand new refill -> should append
      {
        date: '2026-11-15',
        odometer: 234150,
        distance: 300,
        amount: 1000,
        liters: 29.806,
        pricePerLiter: 33.55,
        kml: 10.07,
        note: 'Shell V-Power Diesel',
      },
    ],
    newServices: [
      {
        date: '2026-11-15',
        title: 'เปลี่ยนใบปัดน้ำฝนหน้า',
        category: 'other',
        odometer: 234150,
        partsCost: 350,
        laborCost: 0,
        intervalKm: null,
        notes: 'Bosch AeroTwin',
      },
    ],
  });

  assert.equal(merged.vehicle.currentOdometer, 234150);
  assert.equal(merged.vehicle.fuelPercent, 80);
  assert.equal(merged.fuelLogs.length, 4);
  assert.equal(merged.services.length, 6);
  assert.equal(merged.services[0].totalCost, 350);
  assert.equal(merged.odometerLogs[0].odometer, 234150);
});
