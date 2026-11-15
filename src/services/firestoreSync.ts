import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type FieldValue,
} from 'firebase/firestore';
import type {
  FuelLogEntry,
  OdometerLogEntry,
  ScheduleKey,
  ServiceCategory,
  ServiceRecord,
  VehicleMaintenanceState,
  VehicleProfile,
} from '../types/maintenance';
import { auth, db } from './googleAuth';

export const DEFAULT_VEHICLE_ID = 'ouanpee-triton-2012';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: Array<{
      providerId?: string | null;
      email?: string | null;
    }>;
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

function sanitizeId(raw: string, fallbackPrefix: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_\-]/g, '-').slice(0, 128);
  return cleaned.length > 0 ? cleaned : `${fallbackPrefix}-${Date.now()}`;
}

function clampStr(raw: string | undefined | null, maxLen: number, fallback = ''): string {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return fallback.slice(0, maxLen);
  return trimmed.slice(0, maxLen);
}

function sanitizeDateStr(raw: string | undefined | null): string {
  const val = (raw ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
  return new Date().toISOString().slice(0, 10);
}

function sanitizeScheduleIntervals(
  raw: Record<string, number> | undefined
): Record<string, number> {
  const allowed: ScheduleKey[] = [
    'engine_oil',
    'air_cabin_filter',
    'coolant',
    'timing_belt',
    'custom',
  ];
  const out: Record<string, number> = {};
  if (!raw) return out;
  for (const key of allowed) {
    const val = raw[key];
    if (typeof val === 'number' && Number.isFinite(val) && val > 0) {
      out[key] = Math.min(1_000_000, Math.round(val));
    }
  }
  return out;
}

function buildVehicleDocPayload(
  userId: string,
  vehicle: VehicleProfile,
  scheduleIntervals: Record<string, number>,
  timestamps: { createdAt: FieldValue | unknown; updatedAt: FieldValue }
) {
  return {
    id: DEFAULT_VEHICLE_ID,
    ownerId: userId,
    nickname: clampStr(vehicle.nickname, 80, 'อ้วนพี'),
    make: clampStr(vehicle.make, 80, 'Mitsubishi'),
    model: clampStr(vehicle.model, 80, 'Triton 2012'),
    engineSpec: clampStr(vehicle.engineSpec, 80, '2.5 DI-D'),
    year: Math.max(1950, Math.min(2100, Math.round(vehicle.year || 2012))),
    tankCapacityLiters: Math.max(1, Math.min(500, Number(vehicle.tankCapacityLiters || 75))),
    fuelPercent: Math.max(0, Math.min(100, Math.round(vehicle.fuelPercent ?? 55))),
    currentOdometer: Math.max(1, Math.min(2_000_000, Math.round(vehicle.currentOdometer || 1))),
    lastUpdatedDate: sanitizeDateStr(vehicle.lastUpdatedDate),
    lastUpdatedSource: clampStr(vehicle.lastUpdatedSource, 200, 'อัปเดตผ่านหน้าเว็บ'),
    imageUrl: clampStr(
      vehicle.imageUrl,
      500,
      '/src/assets/images/triton_2012_pickup_1794729642461.jpg'
    ),
    scheduleIntervals: sanitizeScheduleIntervals(scheduleIntervals),
    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
  };
}

function buildServiceDocPayload(
  userId: string,
  record: ServiceRecord,
  timestamps: { createdAt: FieldValue | unknown; updatedAt: FieldValue }
) {
  const id = sanitizeId(record.id, 'srv');
  const partsCost = Math.max(0, Math.min(10_000_000, Number(record.partsCost || 0)));
  const laborCost = Math.max(0, Math.min(10_000_000, Number(record.laborCost || 0)));
  const totalCost = Math.max(0, Math.min(20_000_000, partsCost + laborCost));

  const payload: Record<string, unknown> = {
    id,
    ownerId: userId,
    vehicleId: DEFAULT_VEHICLE_ID,
    date: sanitizeDateStr(record.date),
    title: clampStr(record.title, 200, 'รายการซ่อมบำรุง'),
    category: record.category,
    odometer: Math.max(1, Math.min(2_000_000, Math.round(record.odometer || 1))),
    partsCost,
    laborCost,
    totalCost,
    notes: clampStr(record.notes, 1000, ''),
    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
  };

  if (typeof record.intervalKm === 'number' && record.intervalKm > 0) {
    payload.intervalKm = Math.min(1_000_000, Math.round(record.intervalKm));
  } else {
    payload.intervalKm = null;
  }

  if (typeof record.intervalMonths === 'number' && record.intervalMonths > 0) {
    payload.intervalMonths = Math.min(600, Math.round(record.intervalMonths));
  } else {
    payload.intervalMonths = null;
  }

  if (record.scheduleKey) {
    payload.scheduleKey = record.scheduleKey;
  } else {
    payload.scheduleKey = null;
  }

  if (record.revisionNote?.trim()) {
    payload.revisionNote = clampStr(record.revisionNote, 500);
  } else {
    payload.revisionNote = null;
  }

  return { id, payload };
}

function buildFuelDocPayload(
  userId: string,
  entry: FuelLogEntry,
  timestamps: { createdAt: FieldValue | unknown; updatedAt: FieldValue }
) {
  const id = sanitizeId(entry.id, 'fuel');
  const payload = {
    id,
    ownerId: userId,
    vehicleId: DEFAULT_VEHICLE_ID,
    date: sanitizeDateStr(entry.date),
    odometer: Math.max(1, Math.min(2_000_000, Math.round(entry.odometer || 1))),
    distance: Math.max(0, Math.min(500_000, Number(entry.distance || 0))),
    amount: Math.max(0.01, Math.min(1_000_000, Number(entry.amount || 1))),
    liters: Math.max(0.001, Math.min(10_000, Number(entry.liters || 1))),
    pricePerLiter: Math.max(0, Math.min(10_000, Number(entry.pricePerLiter || 0))),
    kml: Math.max(0, Math.min(500, Number(entry.kml || 0))),
    note: clampStr(entry.note, 300, 'เติมน้ำมันดีเซล'),
    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
  };
  return { id, payload };
}

function buildOdoDocPayload(
  userId: string,
  entry: OdometerLogEntry,
  timestamps: { createdAt: FieldValue | unknown; updatedAt: FieldValue }
) {
  const id = sanitizeId(entry.id, 'odo');
  const payload: Record<string, unknown> = {
    id,
    ownerId: userId,
    vehicleId: DEFAULT_VEHICLE_ID,
    date: sanitizeDateStr(entry.date),
    odometer: Math.max(1, Math.min(2_000_000, Math.round(entry.odometer || 1))),
    source: clampStr(entry.source, 200, 'อัปเดตผ่านหน้าเว็บ'),
    note: entry.note?.trim() ? clampStr(entry.note, 500) : null,
    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
  };
  return { id, payload };
}

export async function seedVehicleToFirestore(
  userId: string,
  initialState: VehicleMaintenanceState
): Promise<void> {
  const vehiclePath = `users/${userId}/vehicles/${DEFAULT_VEHICLE_ID}`;
  const batch = writeBatch(db);
  const now = serverTimestamp();

  const vehicleRef = doc(db, 'users', userId, 'vehicles', DEFAULT_VEHICLE_ID);
  batch.set(
    vehicleRef,
    buildVehicleDocPayload(userId, initialState.vehicle, initialState.scheduleIntervals, {
      createdAt: now,
      updatedAt: now,
    })
  );

  for (const s of initialState.services) {
    const { id, payload } = buildServiceDocPayload(userId, s, {
      createdAt: now,
      updatedAt: now,
    });
    batch.set(
      doc(db, 'users', userId, 'vehicles', DEFAULT_VEHICLE_ID, 'services', id),
      payload
    );
  }

  for (const f of initialState.fuelLogs) {
    const { id, payload } = buildFuelDocPayload(userId, f, {
      createdAt: now,
      updatedAt: now,
    });
    batch.set(
      doc(db, 'users', userId, 'vehicles', DEFAULT_VEHICLE_ID, 'fuelLogs', id),
      payload
    );
  }

  for (const o of initialState.odometerLogs) {
    const { id, payload } = buildOdoDocPayload(userId, o, {
      createdAt: now,
      updatedAt: now,
    });
    batch.set(
      doc(db, 'users', userId, 'vehicles', DEFAULT_VEHICLE_ID, 'odometerLogs', id),
      payload
    );
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, vehiclePath);
  }
}

export function ensureSeededAndSubscribeToVehicle(
  userId: string,
  fallbackLocalState: VehicleMaintenanceState,
  onStateUpdate: (nextState: VehicleMaintenanceState) => void,
  onError: (err: Error) => void
): () => void {
  let cancelled = false;
  const unsubscribers: Array<() => void> = [];

  const vehiclePath = `users/${userId}/vehicles/${DEFAULT_VEHICLE_ID}`;
  const servicesPath = `${vehiclePath}/services`;
  const fuelPath = `${vehiclePath}/fuelLogs`;
  const odoPath = `${vehiclePath}/odometerLogs`;

  let latestVehicle: { profile: VehicleProfile; scheduleIntervals: Record<string, number> } | null =
    null;
  let latestServices: ServiceRecord[] | null = null;
  let latestFuelLogs: FuelLogEntry[] | null = null;
  let latestOdoLogs: OdometerLogEntry[] | null = null;

  function emitIfReady() {
    if (
      cancelled ||
      !latestVehicle ||
      latestServices === null ||
      latestFuelLogs === null ||
      latestOdoLogs === null
    ) {
      return;
    }

    onStateUpdate({
      vehicle: latestVehicle.profile,
      scheduleIntervals: latestVehicle.scheduleIntervals,
      services: [...latestServices].sort((a, b) =>
        b.date !== a.date ? b.date.localeCompare(a.date) : b.odometer - a.odometer
      ),
      fuelLogs: [...latestFuelLogs].sort((a, b) =>
        a.date !== b.date ? a.date.localeCompare(b.date) : a.odometer - b.odometer
      ),
      odometerLogs: [...latestOdoLogs].sort((a, b) =>
        b.date !== a.date ? b.date.localeCompare(a.date) : b.odometer - a.odometer
      ),
    });
  }

  async function start() {
    const vehicleRef = doc(db, 'users', userId, 'vehicles', DEFAULT_VEHICLE_ID);
    try {
      const snap = await getDoc(vehicleRef);
      if (cancelled) return;
      if (!snap.exists()) {
        await seedVehicleToFirestore(userId, fallbackLocalState);
        if (cancelled) return;
      }
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.GET, vehiclePath);
      } catch (wrapped) {
        if (!cancelled) onError(wrapped as Error);
      }
      return;
    }

    unsubscribers.push(
      onSnapshot(
        vehicleRef,
        (snap) => {
          if (!snap.exists()) return;
          const d = snap.data();
          latestVehicle = {
            profile: {
              id: String(d.id ?? DEFAULT_VEHICLE_ID),
              nickname: String(d.nickname ?? 'อ้วนพี'),
              make: String(d.make ?? 'Mitsubishi'),
              model: String(d.model ?? 'Triton 2012'),
              engineSpec: String(d.engineSpec ?? '2.5 DI-D'),
              year: Number(d.year ?? 2012),
              tankCapacityLiters: Number(d.tankCapacityLiters ?? 75),
              fuelPercent: Number(d.fuelPercent ?? 55),
              currentOdometer: Number(d.currentOdometer ?? 233850),
              lastUpdatedDate: String(d.lastUpdatedDate ?? '2026-11-15'),
              lastUpdatedSource: String(d.lastUpdatedSource ?? 'Firestore Cloud'),
              imageUrl: String(
                d.imageUrl ?? '/src/assets/images/triton_2012_pickup_1794729642461.jpg'
              ),
            },
            scheduleIntervals: (d.scheduleIntervals ?? {}) as Record<string, number>,
          };
          emitIfReady();
        },
        (error) => {
          try {
            handleFirestoreError(error, OperationType.GET, vehiclePath);
          } catch (wrapped) {
            if (!cancelled) onError(wrapped as Error);
          }
        }
      )
    );

    unsubscribers.push(
      onSnapshot(
        query(collection(db, servicesPath), where('ownerId', '==', userId)),
        (snap) => {
          latestServices = snap.docs.map((docSnap) => {
            const d = docSnap.data();
            return {
              id: String(d.id ?? docSnap.id),
              date: String(d.date),
              title: String(d.title),
              category: d.category as ServiceCategory,
              odometer: Number(d.odometer),
              partsCost: Number(d.partsCost ?? 0),
              laborCost: Number(d.laborCost ?? 0),
              totalCost: Number(d.totalCost ?? 0),
              intervalKm: typeof d.intervalKm === 'number' ? d.intervalKm : null,
              intervalMonths: typeof d.intervalMonths === 'number' ? d.intervalMonths : null,
              scheduleKey: (d.scheduleKey ?? undefined) as ScheduleKey | undefined,
              notes: String(d.notes ?? ''),
              revisionNote: d.revisionNote ? String(d.revisionNote) : undefined,
            };
          });
          emitIfReady();
        },
        (error) => {
          try {
            handleFirestoreError(error, OperationType.LIST, servicesPath);
          } catch (wrapped) {
            if (!cancelled) onError(wrapped as Error);
          }
        }
      )
    );

    unsubscribers.push(
      onSnapshot(
        query(collection(db, fuelPath), where('ownerId', '==', userId)),
        (snap) => {
          latestFuelLogs = snap.docs.map((docSnap) => {
            const d = docSnap.data();
            return {
              id: String(d.id ?? docSnap.id),
              date: String(d.date),
              odometer: Number(d.odometer),
              distance: Number(d.distance ?? 0),
              amount: Number(d.amount ?? 0),
              liters: Number(d.liters ?? 0),
              pricePerLiter: Number(d.pricePerLiter ?? 0),
              kml: Number(d.kml ?? 0),
              note: String(d.note ?? ''),
            };
          });
          emitIfReady();
        },
        (error) => {
          try {
            handleFirestoreError(error, OperationType.LIST, fuelPath);
          } catch (wrapped) {
            if (!cancelled) onError(wrapped as Error);
          }
        }
      )
    );

    unsubscribers.push(
      onSnapshot(
        query(collection(db, odoPath), where('ownerId', '==', userId)),
        (snap) => {
          latestOdoLogs = snap.docs.map((docSnap) => {
            const d = docSnap.data();
            return {
              id: String(d.id ?? docSnap.id),
              date: String(d.date),
              odometer: Number(d.odometer),
              source: String(d.source ?? ''),
              note: d.note ? String(d.note) : undefined,
            };
          });
          emitIfReady();
        },
        (error) => {
          try {
            handleFirestoreError(error, OperationType.LIST, odoPath);
          } catch (wrapped) {
            if (!cancelled) onError(wrapped as Error);
          }
        }
      )
    );
  }

  void start();

  return () => {
    cancelled = true;
    for (const unsub of unsubscribers) {
      unsub();
    }
  };
}

export async function fsUpdateOdometer(
  userId: string,
  payload: { odometer: number; date: string; source: string; note?: string }
): Promise<void> {
  const vehiclePath = `users/${userId}/vehicles/${DEFAULT_VEHICLE_ID}`;
  const now = serverTimestamp();
  const odoInt = Math.max(1, Math.min(2_000_000, Math.round(payload.odometer)));
  const entryDate = sanitizeDateStr(payload.date);
  const entrySource = clampStr(payload.source, 200, 'อัปเดตผ่านหน้าเว็บ');
  const logId = `odo-${Date.now()}`;

  const batch = writeBatch(db);
  batch.update(doc(db, vehiclePath), {
    currentOdometer: odoInt,
    lastUpdatedDate: entryDate,
    lastUpdatedSource: entrySource,
    updatedAt: now,
  });

  const { payload: odoDoc } = buildOdoDocPayload(
    userId,
    {
      id: logId,
      date: entryDate,
      odometer: odoInt,
      source: entrySource,
      note: payload.note,
    },
    { createdAt: now, updatedAt: now }
  );
  batch.set(doc(db, `${vehiclePath}/odometerLogs/${logId}`), odoDoc);

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, vehiclePath);
  }
}

export async function fsUpdateFuelGauge(
  userId: string,
  fuelPercent: number
): Promise<void> {
  const vehiclePath = `users/${userId}/vehicles/${DEFAULT_VEHICLE_ID}`;
  try {
    await updateDoc(doc(db, vehiclePath), {
      fuelPercent: Math.max(0, Math.min(100, Math.round(fuelPercent))),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, vehiclePath);
  }
}

export async function fsAddFuelLog(
  userId: string,
  entry: FuelLogEntry,
  options: { updateVehicleOdo: boolean; newFuelPercent?: number }
): Promise<void> {
  const vehiclePath = `users/${userId}/vehicles/${DEFAULT_VEHICLE_ID}`;
  const now = serverTimestamp();
  const batch = writeBatch(db);

  const { id, payload: fuelDoc } = buildFuelDocPayload(userId, entry, {
    createdAt: now,
    updatedAt: now,
  });
  batch.set(doc(db, `${vehiclePath}/fuelLogs/${id}`), fuelDoc);

  const vehiclePatch: Record<string, unknown> = {};
  if (options.updateVehicleOdo) {
    vehiclePatch.currentOdometer = Math.round(entry.odometer);
    vehiclePatch.lastUpdatedDate = sanitizeDateStr(entry.date);
    vehiclePatch.lastUpdatedSource = clampStr(`เติมน้ำมัน: ${entry.note}`, 200);

    const odoId = `odo-${Date.now()}`;
    const { payload: odoDoc } = buildOdoDocPayload(
      userId,
      {
        id: odoId,
        date: entry.date,
        odometer: entry.odometer,
        source: `เติมน้ำมัน (${entry.note})`,
        note: `เติม ${entry.amount} บาท (${entry.liters} ลิตร)`,
      },
      { createdAt: now, updatedAt: now }
    );
    batch.set(doc(db, `${vehiclePath}/odometerLogs/${odoId}`), odoDoc);
  }

  if (
    typeof options.newFuelPercent === 'number' &&
    Number.isFinite(options.newFuelPercent)
  ) {
    vehiclePatch.fuelPercent = Math.max(
      0,
      Math.min(100, Math.round(options.newFuelPercent))
    );
  }

  if (Object.keys(vehiclePatch).length > 0) {
    vehiclePatch.updatedAt = now;
    batch.update(doc(db, vehiclePath), vehiclePatch);
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${vehiclePath}/fuelLogs/${id}`);
  }
}

export async function fsUpdateFuelLog(
  userId: string,
  entry: FuelLogEntry
): Promise<void> {
  const id = sanitizeId(entry.id, 'fuel');
  const path = `users/${userId}/vehicles/${DEFAULT_VEHICLE_ID}/fuelLogs/${id}`;
  try {
    await updateDoc(doc(db, path), {
      date: sanitizeDateStr(entry.date),
      odometer: Math.max(1, Math.min(2_000_000, Math.round(entry.odometer || 1))),
      distance: Math.max(0, Math.min(500_000, Number(entry.distance || 0))),
      amount: Math.max(0.01, Math.min(1_000_000, Number(entry.amount || 1))),
      liters: Math.max(0.001, Math.min(10_000, Number(entry.liters || 1))),
      pricePerLiter: Math.max(0, Math.min(10_000, Number(entry.pricePerLiter || 0))),
      kml: Math.max(0, Math.min(500, Number(entry.kml || 0))),
      note: clampStr(entry.note, 300, 'เติมน้ำมันดีเซล'),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function fsDeleteFuelLog(
  userId: string,
  fuelLogId: string
): Promise<void> {
  const path = `users/${userId}/vehicles/${DEFAULT_VEHICLE_ID}/fuelLogs/${fuelLogId}`;
  try {
    await deleteDoc(doc(db, path));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function fsSaveService(
  userId: string,
  record: ServiceRecord,
  isEdit: boolean,
  updateVehicleOdo: boolean
): Promise<void> {
  const vehiclePath = `users/${userId}/vehicles/${DEFAULT_VEHICLE_ID}`;
  const now = serverTimestamp();

  if (isEdit) {
    const servicePath = `${vehiclePath}/services/${record.id}`;
    const partsCost = Math.max(0, Math.min(10_000_000, Number(record.partsCost || 0)));
    const laborCost = Math.max(0, Math.min(10_000_000, Number(record.laborCost || 0)));
    try {
      await updateDoc(doc(db, servicePath), {
        date: sanitizeDateStr(record.date),
        title: clampStr(record.title, 200, 'รายการซ่อมบำรุง'),
        category: record.category,
        odometer: Math.max(1, Math.min(2_000_000, Math.round(record.odometer))),
        partsCost,
        laborCost,
        totalCost: partsCost + laborCost,
        intervalKm:
          typeof record.intervalKm === 'number' && record.intervalKm > 0
            ? Math.min(1_000_000, Math.round(record.intervalKm))
            : null,
        intervalMonths:
          typeof record.intervalMonths === 'number' && record.intervalMonths > 0
            ? Math.min(600, Math.round(record.intervalMonths))
            : null,
        scheduleKey: record.scheduleKey ?? null,
        notes: clampStr(record.notes, 1000, ''),
        revisionNote: record.revisionNote?.trim()
          ? clampStr(record.revisionNote, 500)
          : null,
        updatedAt: now,
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, servicePath);
    }
    return;
  }

  const batch = writeBatch(db);
  const { id, payload: srvDoc } = buildServiceDocPayload(userId, record, {
    createdAt: now,
    updatedAt: now,
  });
  batch.set(doc(db, `${vehiclePath}/services/${id}`), srvDoc);

  if (updateVehicleOdo) {
    batch.update(doc(db, vehiclePath), {
      currentOdometer: Math.round(record.odometer),
      lastUpdatedDate: sanitizeDateStr(record.date),
      lastUpdatedSource: clampStr(`บันทึกเซอร์วิส: ${record.title}`, 200),
      updatedAt: now,
    });
    const odoId = `odo-${Date.now()}`;
    const { payload: odoDoc } = buildOdoDocPayload(
      userId,
      {
        id: odoId,
        date: record.date,
        odometer: record.odometer,
        source: 'บันทึกเซอร์วิสใหม่',
        note: record.title,
      },
      { createdAt: now, updatedAt: now }
    );
    batch.set(doc(db, `${vehiclePath}/odometerLogs/${odoId}`), odoDoc);
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${vehiclePath}/services/${id}`);
  }
}

export async function fsResetServiceCycle(
  userId: string,
  serviceId: string,
  date: string,
  odometer: number,
  revisionNote: string
): Promise<void> {
  const servicePath = `users/${userId}/vehicles/${DEFAULT_VEHICLE_ID}/services/${serviceId}`;
  try {
    await updateDoc(doc(db, servicePath), {
      date: sanitizeDateStr(date),
      odometer: Math.max(1, Math.min(2_000_000, Math.round(odometer))),
      revisionNote: clampStr(revisionNote, 500),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, servicePath);
  }
}

export async function fsDeleteService(
  userId: string,
  serviceId: string
): Promise<void> {
  const path = `users/${userId}/vehicles/${DEFAULT_VEHICLE_ID}/services/${serviceId}`;
  try {
    await deleteDoc(doc(db, path));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function fsUpdateScheduleIntervals(
  userId: string,
  scheduleIntervals: Record<string, number>
): Promise<void> {
  const vehiclePath = `users/${userId}/vehicles/${DEFAULT_VEHICLE_ID}`;
  try {
    await updateDoc(doc(db, vehiclePath), {
      scheduleIntervals: sanitizeScheduleIntervals(scheduleIntervals),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, vehiclePath);
  }
}

export async function fsSyncFullState(
  userId: string,
  previousState: VehicleMaintenanceState,
  nextState: VehicleMaintenanceState
): Promise<void> {
  const vehiclePath = `users/${userId}/vehicles/${DEFAULT_VEHICLE_ID}`;
  const now = serverTimestamp();

  const ops: Array<(batch: ReturnType<typeof writeBatch>) => void> = [];

  ops.push((batch) => {
    batch.update(doc(db, vehiclePath), {
      currentOdometer: Math.max(1, Math.round(nextState.vehicle.currentOdometer)),
      lastUpdatedDate: sanitizeDateStr(nextState.vehicle.lastUpdatedDate),
      lastUpdatedSource: clampStr(nextState.vehicle.lastUpdatedSource, 200, 'ซิงค์ข้อมูล'),
      fuelPercent: Math.max(0, Math.min(100, Math.round(nextState.vehicle.fuelPercent))),
      scheduleIntervals: sanitizeScheduleIntervals(nextState.scheduleIntervals),
      nickname: clampStr(nextState.vehicle.nickname, 80, 'อ้วนพี'),
      make: clampStr(nextState.vehicle.make, 80, 'Mitsubishi'),
      model: clampStr(nextState.vehicle.model, 80, 'Triton 2012'),
      engineSpec: clampStr(nextState.vehicle.engineSpec, 80, '2.5 DI-D'),
      year: Math.max(1950, Math.min(2100, Math.round(nextState.vehicle.year || 2012))),
      tankCapacityLiters: Math.max(1, Math.min(500, Number(nextState.vehicle.tankCapacityLiters || 75))),
      imageUrl: clampStr(
        nextState.vehicle.imageUrl,
        500,
        '/src/assets/images/triton_2012_pickup_1794729642461.jpg'
      ),
      updatedAt: now,
    });
  });

  const nextServiceIds = new Set(nextState.services.map((s) => sanitizeId(s.id, 'srv')));
  const prevServiceIds = new Set(previousState.services.map((s) => sanitizeId(s.id, 'srv')));
  for (const prevId of prevServiceIds) {
    if (!nextServiceIds.has(prevId)) {
      ops.push((batch) => batch.delete(doc(db, `${vehiclePath}/services/${prevId}`)));
    }
  }
  for (const s of nextState.services) {
    const id = sanitizeId(s.id, 'srv');
    if (prevServiceIds.has(id)) {
      const partsCost = Math.max(0, Number(s.partsCost || 0));
      const laborCost = Math.max(0, Number(s.laborCost || 0));
      ops.push((batch) =>
        batch.update(doc(db, `${vehiclePath}/services/${id}`), {
          date: sanitizeDateStr(s.date),
          title: clampStr(s.title, 200, 'รายการซ่อมบำรุง'),
          category: s.category,
          odometer: Math.max(1, Math.round(s.odometer)),
          partsCost,
          laborCost,
          totalCost: partsCost + laborCost,
          intervalKm: typeof s.intervalKm === 'number' && s.intervalKm > 0 ? Math.round(s.intervalKm) : null,
          intervalMonths:
            typeof s.intervalMonths === 'number' && s.intervalMonths > 0
              ? Math.round(s.intervalMonths)
              : null,
          scheduleKey: s.scheduleKey ?? null,
          notes: clampStr(s.notes, 1000, ''),
          revisionNote: s.revisionNote?.trim() ? clampStr(s.revisionNote, 500) : null,
          updatedAt: now,
        })
      );
    } else {
      const { payload } = buildServiceDocPayload(userId, s, { createdAt: now, updatedAt: now });
      ops.push((batch) => batch.set(doc(db, `${vehiclePath}/services/${id}`), payload));
    }
  }

  const nextFuelIds = new Set(nextState.fuelLogs.map((f) => sanitizeId(f.id, 'fuel')));
  const prevFuelIds = new Set(previousState.fuelLogs.map((f) => sanitizeId(f.id, 'fuel')));
  for (const prevId of prevFuelIds) {
    if (!nextFuelIds.has(prevId)) {
      ops.push((batch) => batch.delete(doc(db, `${vehiclePath}/fuelLogs/${prevId}`)));
    }
  }
  for (const f of nextState.fuelLogs) {
    const id = sanitizeId(f.id, 'fuel');
    if (prevFuelIds.has(id)) {
      ops.push((batch) =>
        batch.update(doc(db, `${vehiclePath}/fuelLogs/${id}`), {
          date: sanitizeDateStr(f.date),
          odometer: Math.max(1, Math.round(f.odometer)),
          distance: Math.max(0, Number(f.distance || 0)),
          amount: Math.max(0.01, Number(f.amount || 1)),
          liters: Math.max(0.001, Number(f.liters || 1)),
          pricePerLiter: Math.max(0, Number(f.pricePerLiter || 0)),
          kml: Math.max(0, Number(f.kml || 0)),
          note: clampStr(f.note, 300, 'เติมน้ำมันดีเซล'),
          updatedAt: now,
        })
      );
    } else {
      const { payload } = buildFuelDocPayload(userId, f, { createdAt: now, updatedAt: now });
      ops.push((batch) => batch.set(doc(db, `${vehiclePath}/fuelLogs/${id}`), payload));
    }
  }

  const nextOdoIds = new Set(nextState.odometerLogs.map((o) => sanitizeId(o.id, 'odo')));
  const prevOdoIds = new Set(previousState.odometerLogs.map((o) => sanitizeId(o.id, 'odo')));
  for (const prevId of prevOdoIds) {
    if (!nextOdoIds.has(prevId)) {
      ops.push((batch) => batch.delete(doc(db, `${vehiclePath}/odometerLogs/${prevId}`)));
    }
  }
  for (const o of nextState.odometerLogs) {
    const id = sanitizeId(o.id, 'odo');
    if (prevOdoIds.has(id)) {
      ops.push((batch) =>
        batch.update(doc(db, `${vehiclePath}/odometerLogs/${id}`), {
          date: sanitizeDateStr(o.date),
          odometer: Math.max(1, Math.round(o.odometer)),
          source: clampStr(o.source, 200, 'ซิงค์ข้อมูล'),
          note: o.note?.trim() ? clampStr(o.note, 500) : null,
          updatedAt: now,
        })
      );
    } else {
      const { payload } = buildOdoDocPayload(userId, o, { createdAt: now, updatedAt: now });
      ops.push((batch) => batch.set(doc(db, `${vehiclePath}/odometerLogs/${id}`), payload));
    }
  }

  try {
    const CHUNK = 400;
    for (let i = 0; i < ops.length; i += CHUNK) {
      const batch = writeBatch(db);
      for (const fn of ops.slice(i, i + CHUNK)) {
        fn(batch);
      }
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, vehiclePath);
  }
}

export async function fsCreateOrResetVehicleWithBatch(
  userId: string,
  previousState: VehicleMaintenanceState,
  targetState: VehicleMaintenanceState
): Promise<void> {
  // Ensure parent vehicle exists first via setDoc if needed, then diff-sync
  const vehicleRef = doc(db, 'users', userId, 'vehicles', DEFAULT_VEHICLE_ID);
  const snap = await getDoc(vehicleRef);
  if (!snap.exists()) {
    await seedVehicleToFirestore(userId, targetState);
    return;
  }
  await fsSyncFullState(userId, previousState, targetState);
}

// Re-export setDoc cleanly in case future callers need single-doc upsert
export { setDoc };
