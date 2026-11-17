import type {
  FuelLogEntry,
  OdometerLogEntry,
  ScheduleKey,
  ServiceCategory,
  ServiceRecord,
  VehicleMaintenanceState,
} from '../types/maintenance.ts';
import {
  getTodayIsoDate,
  reconcileFuelLogsWithOdometer,
} from './maintenance.ts';

const THAI_MONTH_MAP: Record<string, number> = {
  'ม.ค.': 1,
  มกราคม: 1,
  'ก.พ.': 2,
  กุมภาพันธ์: 2,
  'มี.ค.': 3,
  มีนาคม: 3,
  'เม.ย.': 4,
  เมษายน: 4,
  'พ.ค.': 5,
  พฤษภาคม: 5,
  'มิ.ย.': 6,
  มิถุนายน: 6,
  'ก.ค.': 7,
  กรกฎาคม: 7,
  'ส.ค.': 8,
  สิงหาคม: 8,
  'ก.ย.': 9,
  กันยายน: 9,
  'ต.ค.': 10,
  ตุลาคม: 10,
  'พ.ย.': 11,
  พฤศจิกายน: 11,
  'ธ.ค.': 12,
  ธันวาคม: 12,
};

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function toGregorianYear(year: number): number {
  return year >= 2400 ? year - 543 : year;
}

export function normalizeSheetDateToIso(raw: unknown): string {
  if (typeof raw !== 'string') return getTodayIsoDate();
  const trimmed = raw.trim();
  if (!trimmed) return getTodayIsoDate();

  // YYYY-MM-DD (or YYYY-MM-DDTHH:mm:ss...) with Gregorian or Buddhist year
  const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(trimmed);
  if (isoMatch) {
    const year = toGregorianYear(Number(isoMatch[1]));
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${String(year).padStart(4, '0')}-${pad2(month)}-${pad2(day)}`;
    }
  }

  // DD/MM/YYYY or D/M/YYYY (Gregorian or Buddhist year)
  const slashMatch = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(trimmed);
  if (slashMatch) {
    const day = Number(slashMatch[1]);
    const month = Number(slashMatch[2]);
    const year = toGregorianYear(Number(slashMatch[3]));
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${String(year).padStart(4, '0')}-${pad2(month)}-${pad2(day)}`;
    }
  }

  // Thai format e.g. "9 พ.ย. 2569" or "18 พฤศจิกายน 2569"
  const thaiMatch = /^(\d{1,2})\s+([^\s\d]+)\s+(\d{4})$/.exec(trimmed);
  if (thaiMatch) {
    const day = Number(thaiMatch[1]);
    const month = THAI_MONTH_MAP[thaiMatch[2]];
    const year = toGregorianYear(Number(thaiMatch[3]));
    if (month && day >= 1 && day <= 31) {
      return `${String(year).padStart(4, '0')}-${pad2(month)}-${pad2(day)}`;
    }
  }

  return getTodayIsoDate();
}

function parseFlexibleNumber(raw: unknown): number {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : 0;
  }
  if (typeof raw === 'string') {
    const cleaned = raw.replace(/,/g, '').replace(/[^\d.-]/g, '').trim();
    if (!cleaned) return 0;
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : 0;
  }
  return 0;
}

function normalizeServiceCategory(raw: unknown, title = ''): ServiceCategory {
  if (
    raw === 'engine_belt' ||
    raw === 'fluids' ||
    raw === 'filters' ||
    raw === 'brakes_tires' ||
    raw === 'ac_electrical' ||
    raw === 'other'
  ) {
    return raw;
  }
  const lower = title.toLowerCase();
  if (lower.includes('สายพาน') || lower.includes('เครื่องยนต์')) return 'engine_belt';
  if (lower.includes('น้ำมันเครื่อง') || lower.includes('เกียร์') || lower.includes('หล่อเย็น') || lower.includes('เฟืองท้าย')) return 'fluids';
  if (lower.includes('กรอง')) return 'filters';
  if (lower.includes('เบรก') || lower.includes('ยาง') || lower.includes('ช่วงล่าง') || lower.includes('โช้ค')) return 'brakes_tires';
  if (lower.includes('แอร์') || lower.includes('แบต') || lower.includes('ไฟ')) return 'ac_electrical';
  return 'other';
}

function normalizeScheduleKey(raw: unknown): ScheduleKey | undefined {
  if (
    raw === 'engine_oil' ||
    raw === 'air_cabin_filter' ||
    raw === 'coolant' ||
    raw === 'timing_belt' ||
    raw === 'custom'
  ) {
    return raw;
  }
  return undefined;
}

export interface CloudSheetsPayload {
  odometer?: unknown;
  fuelPercent?: unknown;
  fuelLogs?: unknown;
  maintenanceItems?: unknown;
  fullState?: VehicleMaintenanceState;
  sheetFuelLogs?: unknown;
  sheetMaintenanceLogs?: unknown;
  vehicle?: VehicleMaintenanceState['vehicle'];
  services?: VehicleMaintenanceState['services'];
}

export function hasImportableSheetsPayload(cloudData: unknown): boolean {
  if (!cloudData || typeof cloudData !== 'object') return false;
  const candidate = cloudData as CloudSheetsPayload;
  if (
    candidate.fullState &&
    candidate.fullState.vehicle &&
    Array.isArray(candidate.fullState.services)
  ) {
    return true;
  }
  if (
    candidate.vehicle &&
    Array.isArray(candidate.services) &&
    Array.isArray(candidate.fuelLogs)
  ) {
    return true;
  }
  if (typeof candidate.odometer === 'number' && Array.isArray(candidate.fuelLogs)) {
    return true;
  }
  if (Array.isArray(candidate.sheetFuelLogs) && candidate.sheetFuelLogs.length > 0) {
    return true;
  }
  if (
    Array.isArray(candidate.sheetMaintenanceLogs) &&
    candidate.sheetMaintenanceLogs.length > 0
  ) {
    return true;
  }
  return false;
}

export interface MergeSheetsResult {
  state: VehicleMaintenanceState;
  addedFuelCount: number;
  addedServiceCount: number;
  updatedOdometer: boolean;
}

export function mergeSheetsPayloadIntoState(
  currentState: VehicleMaintenanceState,
  cloudPayload: unknown
): MergeSheetsResult {
  if (!cloudPayload || typeof cloudPayload !== 'object') {
    throw new Error('ไม่พบโครงสร้างข้อมูลที่รองรับจาก Google Sheets');
  }

  const cloudData = cloudPayload as CloudSheetsPayload;
  let next: VehicleMaintenanceState;
  let recognizedBase = false;

  if (
    cloudData.fullState &&
    cloudData.fullState.vehicle &&
    Array.isArray(cloudData.fullState.services)
  ) {
    next = structuredClone(cloudData.fullState);
    recognizedBase = true;
  } else if (
    cloudData.vehicle &&
    Array.isArray(cloudData.services) &&
    Array.isArray(cloudData.fuelLogs)
  ) {
    next = structuredClone(cloudData as unknown as VehicleMaintenanceState);
    recognizedBase = true;
  } else if (
    typeof cloudData.odometer === 'number' &&
    Array.isArray(cloudData.fuelLogs)
  ) {
    next = structuredClone(currentState);
    next.vehicle.currentOdometer = cloudData.odometer;
    if (typeof cloudData.fuelPercent === 'number' && Number.isFinite(cloudData.fuelPercent)) {
      next.vehicle.fuelPercent = cloudData.fuelPercent;
    }
    next.fuelLogs = structuredClone(cloudData.fuelLogs as FuelLogEntry[]);
    recognizedBase = true;
  } else if (
    Array.isArray(cloudData.sheetFuelLogs) ||
    Array.isArray(cloudData.sheetMaintenanceLogs)
  ) {
    next = structuredClone(currentState);
    recognizedBase = true;
  } else {
    throw new Error('ไม่พบโครงสร้างข้อมูลที่รองรับจาก Google Sheets');
  }

  if (!recognizedBase) {
    throw new Error('ไม่พบโครงสร้างข้อมูลที่รองรับจาก Google Sheets');
  }

  next.fuelLogs = Array.isArray(next.fuelLogs) ? next.fuelLogs : [];
  next.services = Array.isArray(next.services) ? next.services : [];
  next.odometerLogs = Array.isArray(next.odometerLogs) ? next.odometerLogs : [];
  next.scheduleIntervals = next.scheduleIntervals ?? { ...currentState.scheduleIntervals };

  const previousOdometer = next.vehicle.currentOdometer;
  let highestOdometer = previousOdometer;
  let highestOdoDate = next.vehicle.lastUpdatedDate;
  let highestOdoSource = next.vehicle.lastUpdatedSource;
  let addedFuelCount = 0;
  let addedServiceCount = 0;
  const nowStamp = Date.now();

  // 1. Merge external sheetFuelLogs (e.g. appended directly in Google Sheets via Gemini Chat)
  if (Array.isArray(cloudData.sheetFuelLogs)) {
    for (let i = 0; i < cloudData.sheetFuelLogs.length; i++) {
      const raw = cloudData.sheetFuelLogs[i];
      if (!raw || typeof raw !== 'object') continue;
      const item = raw as Record<string, unknown>;

      const odometer = Math.round(
        parseFlexibleNumber(item.odometer ?? item.odo ?? item.mileage ?? item['เลขไมล์'])
      );
      if (odometer <= 0) continue;

      const date = normalizeSheetDateToIso(
        item.isoDate ?? item.date ?? item['วันที่']
      );

      let amount = parseFlexibleNumber(
        item.amount ?? item.cost ?? item.total ?? item['ยอดเงิน']
      );
      let pricePerLiter = parseFlexibleNumber(
        item.pricePerLiter ?? item.price ?? item['ราคาต่อลิตร']
      );
      let liters = parseFlexibleNumber(
        item.liters ?? item.volume ?? item['ปริมาณ'] ?? item['ลิตร']
      );

      if (liters <= 0 && amount > 0 && pricePerLiter > 0) {
        liters = Number((amount / pricePerLiter).toFixed(3));
      } else if (pricePerLiter <= 0 && amount > 0 && liters > 0) {
        pricePerLiter = Number((amount / liters).toFixed(2));
      } else if (amount <= 0 && liters > 0 && pricePerLiter > 0) {
        amount = Number((liters * pricePerLiter).toFixed(2));
      }

      if (amount <= 0 && liters <= 0) continue;

      const distance = Math.max(
        0,
        Math.round(parseFlexibleNumber(item.distance ?? item['ระยะทาง']))
      );
      const kml = Math.max(
        0,
        Number(
          parseFlexibleNumber(
            item.kml ?? item.kmPerLiter ?? item['อัตราสิ้นเปลือง']
          ).toFixed(2)
        )
      );
      const note =
        String(
          item.note ??
            item.station ??
            item.fuelType ??
            item.notes ??
            item['ปั๊ม'] ??
            item['หมายเหตุ'] ??
            'เพิ่มจาก Google Sheets'
        ).trim() || 'เพิ่มจาก Google Sheets';
      const incomingId = typeof item.id === 'string' && item.id.trim() ? item.id.trim() : '';

      const isDuplicate = next.fuelLogs.some(
        (existing) =>
          (incomingId && existing.id === incomingId) ||
          (existing.date === date && existing.odometer === odometer)
      );
      if (isDuplicate) continue;

      next.fuelLogs.push({
        id: incomingId || `fuel-sheet-${nowStamp}-${i}`,
        date,
        odometer,
        distance,
        amount: Number(amount.toFixed(2)),
        liters: Number(liters.toFixed(3)),
        pricePerLiter: Number(pricePerLiter.toFixed(2)),
        kml,
        note,
      });
      addedFuelCount += 1;

      if (odometer > highestOdometer) {
        highestOdometer = odometer;
        highestOdoDate = date;
        highestOdoSource = `เติมน้ำมันจาก Google Sheets (${note})`;
      }
    }
  }

  // 2. Merge external sheetMaintenanceLogs (e.g. appended directly in Google Sheets via Gemini Chat)
  if (Array.isArray(cloudData.sheetMaintenanceLogs)) {
    for (let i = 0; i < cloudData.sheetMaintenanceLogs.length; i++) {
      const raw = cloudData.sheetMaintenanceLogs[i];
      if (!raw || typeof raw !== 'object') continue;
      const item = raw as Record<string, unknown>;

      const title = String(
        item.title ?? item.item ?? item.name ?? item.service ?? item['รายการ'] ?? ''
      ).trim();
      if (!title) continue;

      const date = normalizeSheetDateToIso(
        item.isoDate ?? item.date ?? item['วันที่']
      );
      const rawOdo = Math.round(
        parseFlexibleNumber(
          item.odometer ?? item.doneOdo ?? item.odo ?? item.mileage ?? item['เลขไมล์']
        )
      );
      const odometer = rawOdo > 0 ? rawOdo : highestOdometer;

      let partsCost = Math.max(
        0,
        parseFlexibleNumber(item.partsCost ?? item.parts ?? item['ค่าอะไหล่'])
      );
      const laborCost = Math.max(
        0,
        parseFlexibleNumber(item.laborCost ?? item.labor ?? item['ค่าแรง'])
      );
      const totalFallback = Math.max(
        0,
        parseFlexibleNumber(
          item.totalCost ?? item.cost ?? item.amount ?? item['ค่าใช้จ่าย'] ?? item['ราคา']
        )
      );
      if (partsCost === 0 && laborCost === 0 && totalFallback > 0) {
        partsCost = totalFallback;
      }

      const intervalRaw = Math.round(
        parseFlexibleNumber(item.intervalKm ?? item.interval ?? item['รอบระยะ'])
      );
      const intervalKm = intervalRaw > 0 ? intervalRaw : null;
      const intervalMonthsRaw = Math.round(parseFlexibleNumber(item.intervalMonths));
      const intervalMonths = intervalMonthsRaw > 0 ? intervalMonthsRaw : null;
      const category = normalizeServiceCategory(
        item.category ?? item['หมวดหมู่'],
        title
      );
      const scheduleKey = normalizeScheduleKey(item.scheduleKey);
      const notes =
        String(
          item.notes ?? item.note ?? item['รายละเอียด'] ?? item['หมายเหตุ'] ?? 'นำเข้าจาก Google Sheets'
        ).trim() || 'นำเข้าจาก Google Sheets';
      const incomingId = typeof item.id === 'string' && item.id.trim() ? item.id.trim() : '';

      const normalizedTitle = title.toLowerCase();
      const isDuplicate = next.services.some(
        (existing) =>
          (incomingId && existing.id === incomingId) ||
          (existing.date === date &&
            existing.odometer === odometer &&
            existing.title.trim().toLowerCase() === normalizedTitle)
      );
      if (isDuplicate) continue;

      next.services.unshift({
        id: incomingId || `srv-sheet-${nowStamp}-${i}`,
        date,
        title,
        category,
        odometer,
        partsCost,
        laborCost,
        totalCost: partsCost + laborCost,
        intervalKm,
        intervalMonths,
        scheduleKey,
        notes,
        revisionNote: 'นำเข้าจาก Google Sheets',
      });
      addedServiceCount += 1;

      if (odometer > highestOdometer) {
        highestOdometer = odometer;
        highestOdoDate = date;
        highestOdoSource = `ซ่อมบำรุงจาก Google Sheets (${title})`;
      }
    }
  }

  if (typeof cloudData.odometer === 'number' && cloudData.odometer > highestOdometer) {
    highestOdometer = cloudData.odometer;
  }

  let updatedOdometer = false;
  if (highestOdometer > previousOdometer) {
    updatedOdometer = true;
    next.vehicle.currentOdometer = highestOdometer;
    next.vehicle.lastUpdatedDate = highestOdoDate || getTodayIsoDate();
    next.vehicle.lastUpdatedSource = highestOdoSource || 'ซิงค์จาก Google Sheets';

    const hasOdoLog = next.odometerLogs.some(
      (o) => o.date === next.vehicle.lastUpdatedDate && o.odometer === highestOdometer
    );
    if (!hasOdoLog) {
      const odoEntry: OdometerLogEntry = {
        id: `odo-sheet-${nowStamp}`,
        date: next.vehicle.lastUpdatedDate,
        odometer: highestOdometer,
        source: next.vehicle.lastUpdatedSource,
        note: 'อัปเดตอัตโนมัติจากการซิงค์ Google Sheets',
      };
      next.odometerLogs = [odoEntry, ...next.odometerLogs];
    }
  }

  const reconciled = reconcileFuelLogsWithOdometer(next.fuelLogs, {
    odometerLogs: next.odometerLogs,
  });
  if (reconciled.changedLogs.length > 0) {
    next.fuelLogs = reconciled.logs;
  }

  return {
    state: next,
    addedFuelCount,
    addedServiceCount,
    updatedOdometer,
  };
}
