import type {
  FuelLogEntry,
  OdometerLogEntry,
  ServiceCategory,
  ServiceRecord,
  VehicleMaintenanceState,
} from '../types/maintenance';

export interface ImportedVehiclePatch {
  summary: string;
  replaceFullState?: VehicleMaintenanceState;
  updatedOdometer?: number | null;
  updatedFuelPercent?: number | null;
  updatedDate?: string | null;
  sourceLabel?: string;
  newFuelLogs: Array<Omit<FuelLogEntry, 'id'>>;
  newServices: Array<Omit<ServiceRecord, 'id' | 'totalCost'>>;
}

function normalizeCategory(raw?: string): ServiceCategory {
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
  return 'other';
}

export function parseDriveTextDeterministic(
  text: string,
  fileName: string
): ImportedVehiclePatch | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;

    // 1. Full VehicleMaintenanceState JSON
    if (
      parsed.vehicle &&
      typeof parsed.vehicle === 'object' &&
      Array.isArray(parsed.services) &&
      Array.isArray(parsed.fuelLogs)
    ) {
      const fullState = parsed as unknown as VehicleMaintenanceState;
      return {
        summary: `พบข้อมูลฉบับเต็มจากไฟล์ ${fileName} (เลขไมล์ ${fullState.vehicle.currentOdometer.toLocaleString('th-TH')} กม., เติมน้ำมัน ${fullState.fuelLogs.length} รอบ, ซ่อมบำรุง ${fullState.services.length} รายการ)`,
        replaceFullState: fullState,
        updatedOdometer: fullState.vehicle.currentOdometer,
        updatedFuelPercent: fullState.vehicle.fuelPercent,
        newFuelLogs: [],
        newServices: [],
      };
    }

    // 2. Prototype INITIAL_STATE / Google Sheets AppState JSON
    if (
      typeof parsed.odometer === 'number' &&
      (Array.isArray(parsed.fuelLogs) || Array.isArray(parsed.maintenanceItems))
    ) {
      const fuelLogsRaw = Array.isArray(parsed.fuelLogs)
        ? (parsed.fuelLogs as Array<Record<string, unknown>>)
        : [];
      const maintRaw = Array.isArray(parsed.maintenanceItems)
        ? (parsed.maintenanceItems as Array<Record<string, unknown>>)
        : [];

      const newFuelLogs = fuelLogsRaw
        .filter((f) => typeof f.odometer === 'number' && typeof f.amount === 'number')
        .map((f) => ({
          date:
            typeof f.isoDate === 'string'
              ? f.isoDate
              : typeof f.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f.date)
                ? f.date
                : new Date().toISOString().slice(0, 10),
          odometer: Number(f.odometer),
          distance: Number(f.distance ?? 0),
          amount: Number(f.amount),
          liters: Number(f.liters ?? 0),
          pricePerLiter: Number(f.pricePerLiter ?? 0),
          kml: Number(f.kml ?? 0),
          note: String(f.note ?? 'นำเข้าจาก Google Drive'),
        }));

      const newServices = maintRaw
        .filter((m) => typeof m.title === 'string')
        .map((m) => {
          const parts = Number(m.partsCost ?? m.cost ?? 0);
          const labor = Number(m.laborCost ?? 0);
          return {
            date:
              typeof m.isoDate === 'string'
                ? m.isoDate
                : typeof m.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(m.date)
                  ? m.date
                  : new Date().toISOString().slice(0, 10),
            title: String(m.title),
            category: normalizeCategory(
              typeof m.category === 'string' ? m.category : undefined
            ),
            odometer: Number(m.doneOdo ?? m.odometer ?? parsed.odometer),
            partsCost: parts,
            laborCost: labor,
            intervalKm: m.interval ? Number(m.interval) : null,
            notes: String(m.notes ?? `นำเข้าจากไฟล์ ${fileName}`),
          };
        });

      return {
        summary: `พบข้อมูล JSON จากไฟล์ ${fileName}: เลขไมล์ ${Number(parsed.odometer).toLocaleString('th-TH')} กม., เติมน้ำมัน ${newFuelLogs.length} รายการ, ซ่อมบำรุง ${newServices.length} รายการ`,
        updatedOdometer: Number(parsed.odometer),
        updatedFuelPercent:
          typeof parsed.fuelPercent === 'number' ? parsed.fuelPercent : null,
        sourceLabel: `Google Drive (${fileName})`,
        newFuelLogs,
        newServices,
      };
    }

    // 3. Direct patch object
    if (
      typeof parsed.updatedOdometer === 'number' ||
      Array.isArray(parsed.newFuelLogs) ||
      Array.isArray(parsed.newServices)
    ) {
      return {
        summary:
          typeof parsed.summary === 'string'
            ? parsed.summary
            : `พบข้อมูลอัปเดตจากไฟล์ ${fileName}`,
        updatedOdometer:
          typeof parsed.updatedOdometer === 'number' ? parsed.updatedOdometer : null,
        updatedFuelPercent:
          typeof parsed.updatedFuelPercent === 'number'
            ? parsed.updatedFuelPercent
            : null,
        sourceLabel: `Google Drive (${fileName})`,
        newFuelLogs: Array.isArray(parsed.newFuelLogs)
          ? (parsed.newFuelLogs as Array<Omit<FuelLogEntry, 'id'>>)
          : [],
        newServices: Array.isArray(parsed.newServices)
          ? (parsed.newServices as Array<Omit<ServiceRecord, 'id' | 'totalCost'>>)
          : [],
      };
    }
  } catch {
    return null;
  }

  return null;
}

export function mergeImportedPatch(
  current: VehicleMaintenanceState,
  patch: ImportedVehiclePatch
): VehicleMaintenanceState {
  if (patch.replaceFullState) {
    return patch.replaceFullState;
  }

  const next = structuredClone(current);
  const nowStamp = Date.now();
  const patchDate =
    patch.updatedDate && /^\d{4}-\d{2}-\d{2}$/.test(patch.updatedDate)
      ? patch.updatedDate
      : new Date().toISOString().slice(0, 10);
  const sourceLabel = patch.sourceLabel ?? 'นำเข้าจาก Google Drive';

  let highestOdometer = next.vehicle.currentOdometer;

  // Merge fuel logs with deduplication by (date + odometer + amount)
  for (let i = 0; i < patch.newFuelLogs.length; i++) {
    const incoming = patch.newFuelLogs[i];
    const duplicate = next.fuelLogs.some(
      (existing) =>
        existing.date === incoming.date &&
        existing.odometer === incoming.odometer &&
        Math.abs(existing.amount - incoming.amount) < 0.01
    );
    if (!duplicate) {
      const lastFuel = [...next.fuelLogs].sort((a, b) => a.odometer - b.odometer).pop();
      const distance =
        incoming.distance > 0
          ? incoming.distance
          : lastFuel
            ? Math.max(0, incoming.odometer - lastFuel.odometer)
            : 0;
      const rawKml =
        incoming.kml > 0
          ? incoming.kml
          : distance > 0 && incoming.liters > 0
            ? Number((distance / incoming.liters).toFixed(2))
            : 0;
      const kml = rawKml > 30 ? 0 : rawKml;

      next.fuelLogs.push({
        id: `fuel-drive-${nowStamp}-${i}`,
        date: incoming.date,
        odometer: incoming.odometer,
        distance,
        amount: incoming.amount,
        liters: incoming.liters,
        pricePerLiter: incoming.pricePerLiter,
        kml,
        note: incoming.note,
      });
    }
    if (incoming.odometer > highestOdometer) {
      highestOdometer = incoming.odometer;
    }
  }

  // Merge services with deduplication by (date + odometer + title)
  for (let i = 0; i < patch.newServices.length; i++) {
    const incoming = patch.newServices[i];
    const normalizedTitle = incoming.title.trim().toLowerCase();
    const duplicate = next.services.some(
      (existing) =>
        existing.date === incoming.date &&
        existing.odometer === incoming.odometer &&
        existing.title.trim().toLowerCase() === normalizedTitle
    );
    if (!duplicate) {
      const partsCost = Math.max(0, Number(incoming.partsCost || 0));
      const laborCost = Math.max(0, Number(incoming.laborCost || 0));
      next.services.unshift({
        id: `srv-drive-${nowStamp}-${i}`,
        date: incoming.date,
        title: incoming.title.trim(),
        category: normalizeCategory(incoming.category),
        odometer: incoming.odometer,
        partsCost,
        laborCost,
        totalCost: partsCost + laborCost,
        intervalKm: incoming.intervalKm ?? null,
        intervalMonths: incoming.intervalMonths ?? null,
        scheduleKey: incoming.scheduleKey,
        notes: incoming.notes ?? '',
        revisionNote: `นำเข้าจาก ${sourceLabel}`,
      });
    }
    if (incoming.odometer > highestOdometer) {
      highestOdometer = incoming.odometer;
    }
  }

  const targetOdo =
    typeof patch.updatedOdometer === 'number' && patch.updatedOdometer > 0
      ? Math.max(highestOdometer, patch.updatedOdometer)
      : highestOdometer;

  if (targetOdo !== next.vehicle.currentOdometer) {
    next.vehicle.currentOdometer = targetOdo;
    next.vehicle.lastUpdatedDate = patchDate;
    next.vehicle.lastUpdatedSource = sourceLabel;
    const newOdoLog: OdometerLogEntry = {
      id: `odo-drive-${nowStamp}`,
      date: patchDate,
      odometer: targetOdo,
      source: sourceLabel,
      note: patch.summary,
    };
    next.odometerLogs = [newOdoLog, ...next.odometerLogs];
  }

  if (
    typeof patch.updatedFuelPercent === 'number' &&
    Number.isFinite(patch.updatedFuelPercent)
  ) {
    next.vehicle.fuelPercent = Math.max(
      0,
      Math.min(100, Math.round(patch.updatedFuelPercent))
    );
  }

  return next;
}
