import { useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { RotateCcw } from 'lucide-react';
import { AnalyticsSection } from './components/AnalyticsSection';
import { FuelFormModal } from './components/FuelFormModal';
import { FuelHistorySection } from './components/FuelHistorySection';
import { GoogleDriveModal } from './components/GoogleDriveModal';
import { GoogleSheetsSyncModal } from './components/GoogleSheetsSyncModal';
import { MaintenanceAlertToast } from './components/MaintenanceAlertToast';
import { MonthlyMaintenanceChart } from './components/MonthlyMaintenanceChart';
import { OcrScannerModal } from './components/OcrScannerModal';
import { OdometerLogView } from './components/OdometerLogView';
import { ScheduleSection } from './components/ScheduleSection';
import { ServiceFormModal } from './components/ServiceFormModal';
import { ServiceHistoryTable } from './components/ServiceHistoryTable';
import { SheetsSyncStatusBadge } from './components/SheetsSyncStatusBadge';
import { StatusBanner } from './components/StatusBanner';
import { TopBar, type ActiveTab } from './components/TopBar';
import { VehicleHero } from './components/VehicleHero';
import { normalizeVehicleImageUrl, SEED_VEHICLE_STATE } from './data/seedData';
import firebaseConfig from '../firebase-applet-config.json';
import {
  ensureSeededAndSubscribeToVehicle,
  fsAddFuelLog,
  fsBatchUpdateFuelLogs,
  fsCreateOrResetVehicleWithBatch,
  fsDeleteFuelLog,
  fsDeleteService,
  fsResetServiceCycle,
  fsSaveService,
  fsUpdateFuelGauge,
  fsUpdateFuelLog,
  fsUpdateOdometer,
  fsUpdateScheduleIntervals,
} from './services/firestoreSync';
import {
  googleSignIn,
  logoutGoogle,
  subscribeAuthUser,
  testFirestoreConnection,
} from './services/googleAuth';
import {
  isValidGasWebhookUrl,
  loadGasAutoSyncEnabled,
  loadGasLastSyncAt,
  loadSavedGasWebhookUrl,
  pullFromGoogleSheets,
  pushToGoogleSheets,
  saveGasAutoSyncEnabled,
  saveGasLastSyncAt,
  saveGasWebhookUrl,
  type GasSyncStatus,
} from './services/googleSheetsSync';
import type {
  FuelLogEntry,
  NotificationPreferences,
  OcrExtractedFuelData,
  ScheduleKey,
  ServiceCategory,
  ServiceRecord,
  VehicleMaintenanceState,
} from './types/maintenance';
import {
  mergeImportedPatch,
  type ImportedVehiclePatch,
} from './utils/driveParser';
import {
  buildMaintenanceSchedules,
  computeCostSummary,
  computeFleetHealthBanner,
  computeFuelAnalytics,
  evaluateMaintenanceAlerts,
  formatThaiDate,
  getTodayIsoDate,
  reconcileFuelLogsWithOdometer,
} from './utils/maintenance';
import {
  dispatchBrowserMaintenanceNotifications,
  getBrowserNotificationPermission,
  loadNotificationPreferences,
  requestBrowserNotificationPermission,
  saveNotificationPreferences,
  sendTestBrowserNotification,
  type BrowserPermissionState,
} from './utils/notifications';
import { apiFetch, ServerUnavailableError } from './utils/serverApi';
import { mergeSheetsPayloadIntoState } from './utils/sheetsMerge';

const STORAGE_KEY = 'ouanpee_triton_dashboard_v3';

function readCachedLocalState(): VehicleMaintenanceState | null {
  try {
    const cached = window.localStorage.getItem(STORAGE_KEY);
    if (!cached) return null;
    const parsed = JSON.parse(cached) as VehicleMaintenanceState;
    if (
      parsed?.vehicle &&
      Array.isArray(parsed.services) &&
      Array.isArray(parsed.fuelLogs)
    ) {
      return {
        ...parsed,
        vehicle: {
          ...parsed.vehicle,
          imageUrl: normalizeVehicleImageUrl(parsed.vehicle.imageUrl),
        },
      };
    }
  } catch {
    // Ignore storage errors
  }
  return null;
}

function isIdenticalToSeed(candidate: VehicleMaintenanceState): boolean {
  return (
    candidate.vehicle.currentOdometer === SEED_VEHICLE_STATE.vehicle.currentOdometer &&
    candidate.vehicle.fuelPercent === SEED_VEHICLE_STATE.vehicle.fuelPercent &&
    candidate.services.length === SEED_VEHICLE_STATE.services.length &&
    candidate.fuelLogs.length === SEED_VEHICLE_STATE.fuelLogs.length &&
    candidate.odometerLogs.length === SEED_VEHICLE_STATE.odometerLogs.length
  );
}

function formatCloudErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.includes('Quota exceeded')) {
    const upgradeUrl = `https://console.firebase.google.com/project/${firebaseConfig.projectId}/firestore/databases/${firebaseConfig.firestoreDatabaseId}/data?openUpgradeDialog=true`;
    return `โควต้าการใช้งาน Firestore ฟรีรายวันเต็มแล้ว (จะรีเซ็ตในวันถัดไป) สามารถอัปเกรดได้ที่ ${upgradeUrl}`;
  }
  if (raw.includes('Missing or insufficient permissions')) {
    return 'ไม่มีสิทธิ์เข้าถึงข้อมูล Firestore กรุณาตรวจสอบว่าบัญชี Google ของคุณยืนยันอีเมลแล้วและลองเข้าสู่ระบบใหม่';
  }
  return 'ไม่สามารถเชื่อมต่อ Firestore ได้ในขณะนี้ (ระบบยังคงบันทึกข้อมูลในเครื่องให้ตามปกติ)';
}

export default function App() {
  const [state, setState] = useState<VehicleMaintenanceState>(() => {
    return readCachedLocalState() ?? SEED_VEHICLE_STATE;
  });

  const latestStateRef = useRef(state);
  latestStateRef.current = state;
  const autoReconciledSigRef = useRef<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [cloudSyncStatus, setCloudSyncStatus] = useState<
    'local' | 'connecting' | 'synced' | 'error'
  >('local');
  const [cloudSyncError, setCloudSyncError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const [serviceModalOpen, setServiceModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<ServiceRecord | null>(null);
  const [fuelModalOpen, setFuelModalOpen] = useState(false);
  const [editingFuelLog, setEditingFuelLog] = useState<FuelLogEntry | null>(null);
  const [ocrPrefill, setOcrPrefill] = useState<OcrExtractedFuelData | null>(null);
  const [ocrModalOpen, setOcrModalOpen] = useState(false);
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [driveModalOpen, setDriveModalOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPreferences>(
    () => loadNotificationPreferences()
  );
  const [browserPermission, setBrowserPermission] = useState<BrowserPermissionState>(
    () => getBrowserNotificationPermission()
  );

  const [gasUrl, setGasUrl] = useState<string>(() => loadSavedGasWebhookUrl());
  const [gasAutoSyncEnabled, setGasAutoSyncEnabled] = useState<boolean>(() =>
    loadGasAutoSyncEnabled()
  );
  const [gasLastSyncAt, setGasLastSyncAt] = useState<string | null>(() =>
    loadGasLastSyncAt()
  );
  const [gasLastDirection, setGasLastDirection] = useState<'pull' | 'push' | null>(null);
  const [gasSyncStatus, setGasSyncStatus] = useState<GasSyncStatus>(() =>
    loadSavedGasWebhookUrl() ? (loadGasLastSyncAt() ? 'synced' : 'idle') : 'unconfigured'
  );
  const [gasSyncError, setGasSyncError] = useState<string | null>(null);

  const gasUrlRef = useRef(gasUrl);
  gasUrlRef.current = gasUrl;
  const gasAutoSyncRef = useRef(gasAutoSyncEnabled);
  gasAutoSyncRef.current = gasAutoSyncEnabled;
  const gasPushInFlightRef = useRef(false);
  const gasQueuedPushStateRef = useRef<VehicleMaintenanceState | null>(null);
  const startupGasPullKeyRef = useRef<string | null>(null);
  const pendingFirestorePushRef = useRef(false);

  function updateNotificationPrefs(
    updater:
      | NotificationPreferences
      | ((prev: NotificationPreferences) => NotificationPreferences)
  ) {
    setNotificationPrefs((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      saveNotificationPreferences(next);
      return next;
    });
  }

  async function triggerBackgroundGasPush(
    nextState: VehicleMaintenanceState,
    options?: { forceManual?: boolean; urlOverride?: string }
  ): Promise<{ ok: boolean; message: string }> {
    const targetUrl = (options?.urlOverride ?? gasUrlRef.current).trim();
    if (!options?.forceManual && (!gasAutoSyncRef.current || !isValidGasWebhookUrl(targetUrl))) {
      return { ok: false, message: 'ยังไม่ได้เปิดใช้งานหรือไม่ได้ระบุ URL ของ Google Sheets' };
    }
    if (!isValidGasWebhookUrl(targetUrl)) {
      const msg = 'URL ของ Google Apps Script Web App ไม่ถูกต้อง';
      setGasSyncStatus('error');
      setGasSyncError(msg);
      return { ok: false, message: msg };
    }

    if (gasPushInFlightRef.current && !options?.forceManual) {
      gasQueuedPushStateRef.current = nextState;
      return { ok: true, message: 'กำลังรอซิงค์รายการล่าสุดขึ้น Google Sheets...' };
    }

    gasPushInFlightRef.current = true;
    setGasSyncStatus('syncing');
    setGasSyncError(null);

    try {
      await pushToGoogleSheets(targetUrl, nextState);
      const nowIso = new Date().toISOString();
      setGasSyncStatus('synced');
      setGasSyncError(null);
      setGasLastDirection('push');
      setGasLastSyncAt(nowIso);
      saveGasLastSyncAt(nowIso);
      return { ok: true, message: 'ส่งข้อมูลขึ้น Google Sheets สำเร็จเรียบร้อยแล้ว' };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'เชื่อมต่อไม่สำเร็จ';
      setGasSyncStatus('error');
      setGasSyncError(msg);
      return { ok: false, message: `เชื่อมต่อไม่สำเร็จ: ${msg}` };
    } finally {
      gasPushInFlightRef.current = false;
      const queued = gasQueuedPushStateRef.current;
      if (queued) {
        gasQueuedPushStateRef.current = null;
        void triggerBackgroundGasPush(queued);
      }
    }
  }

  function commitState(
    next: VehicleMaintenanceState,
    options?: { autoPush?: boolean }
  ) {
    setState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore storage errors
    }
    if (options?.autoPush) {
      void triggerBackgroundGasPush(next);
    }
  }

  useEffect(() => {
    void testFirestoreConnection();
    const unsubAuth = subscribeAuthUser((user) => {
      setAuthUser(user);
      setAuthReady(true);
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!authReady) return;
    let active = true;

    if (!authUser) {
      setCloudSyncStatus('local');
      setCloudSyncError(null);
      apiFetch('/api/maintenance')
        .then((res) => {
          if (!res.ok) throw new Error('Network error');
          return res.json() as Promise<VehicleMaintenanceState>;
        })
        .then((remoteState) => {
          if (!active) return;
          const localCached = readCachedLocalState();
          // Protect local edits if the ephemeral server container reset back to seed data
          const baseState =
            localCached && isIdenticalToSeed(remoteState) && !isIdenticalToSeed(localCached)
              ? localCached
              : remoteState;
          const reconciled = reconcileFuelLogsWithOdometer(baseState.fuelLogs, {
            odometerLogs: baseState.odometerLogs,
          });
          const nextState =
            reconciled.changedLogs.length > 0
              ? { ...baseState, fuelLogs: reconciled.logs }
              : baseState;
          commitState(nextState);
          if (baseState === localCached || reconciled.changedLogs.length > 0) {
            void apiFetch('/api/sync-import', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ fullState: nextState }),
            }).catch(() => {});
          }
        })
        .catch(() => {
          // Fallback already initialized from localStorage or SEED_VEHICLE_STATE
        })
        .finally(() => {
          if (active) setLoading(false);
        });

      return () => {
        active = false;
      };
    }

    let unsubscribeFirestore: (() => void) | null = null;
    setCloudSyncStatus('connecting');
    setCloudSyncError(null);

    async function startFirestoreSync() {
      let initialFallback = latestStateRef.current;
      if (isIdenticalToSeed(initialFallback)) {
        try {
          const res = await apiFetch('/api/maintenance');
          if (res.ok) {
            const serverState = (await res.json()) as VehicleMaintenanceState;
            if (!isIdenticalToSeed(serverState)) {
              initialFallback = serverState;
            }
          }
        } catch {
          // Ignore server fallback errors and proceed with local state
        }
      }
      if (!active || !authUser) return;

      unsubscribeFirestore = ensureSeededAndSubscribeToVehicle(
        authUser.uid,
        initialFallback,
        (remoteState) => {
          if (!active) return;
          const reconciled = reconcileFuelLogsWithOdometer(remoteState.fuelLogs, {
            odometerLogs: remoteState.odometerLogs,
          });
          const effectiveRemote: VehicleMaintenanceState =
            reconciled.changedLogs.length > 0
              ? { ...remoteState, fuelLogs: reconciled.logs }
              : remoteState;

          commitState(effectiveRemote);
          setCloudSyncStatus('synced');
          setCloudSyncError(null);
          setLoading(false);

          if (pendingFirestorePushRef.current) {
            pendingFirestorePushRef.current = false;
            void triggerBackgroundGasPush(effectiveRemote);
          }

          const sig = remoteState.fuelLogs.map((l) => `${l.id}:${l.odometer}:${l.distance}`).join('|');
          if (
            reconciled.changedLogs.length > 0 &&
            autoReconciledSigRef.current !== sig &&
            authUser
          ) {
            autoReconciledSigRef.current = sig;
            void fsBatchUpdateFuelLogs(authUser.uid, reconciled.changedLogs).catch(() => {});
          }

          void apiFetch('/api/sync-import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fullState: effectiveRemote }),
          }).catch(() => {});
        },
        (err) => {
          if (!active) return;
          setCloudSyncStatus('error');
          setCloudSyncError(formatCloudErrorMessage(err));
          setLoading(false);
        }
      );
    }

    void startFirestoreSync();

    return () => {
      active = false;
      unsubscribeFirestore?.();
    };
  }, [authReady, authUser]);

  // Auto-pull latest state from Google Sheets on page startup
  useEffect(() => {
    if (!authReady || loading || syncModalOpen) return;
    const trimmedUrl = gasUrl.trim();
    if (!gasAutoSyncEnabled || !isValidGasWebhookUrl(trimmedUrl)) return;

    const pullKey = `${trimmedUrl}:${authUser?.uid ?? 'local'}`;
    if (startupGasPullKeyRef.current === pullKey) return;
    startupGasPullKeyRef.current = pullKey;

    let cancelled = false;
    let completed = false;
    setGasSyncStatus('syncing');
    setGasSyncError(null);

    pullFromGoogleSheets(trimmedUrl)
      .then(async ({ hasData, data }) => {
        if (cancelled) return;
        if (hasData) {
          await handleImportCloudState(data);
        }
        if (cancelled) return;
        completed = true;
        const nowIso = new Date().toISOString();
        setGasSyncStatus('synced');
        setGasSyncError(null);
        setGasLastDirection('pull');
        setGasLastSyncAt(nowIso);
        saveGasLastSyncAt(nowIso);
      })
      .catch((err) => {
        if (cancelled) return;
        completed = true;
        setGasSyncStatus('error');
        setGasSyncError(
          err instanceof Error ? err.message : 'ดึงข้อมูลจาก Google Sheets ไม่สำเร็จ'
        );
      });

    return () => {
      cancelled = true;
      if (!completed && startupGasPullKeyRef.current === pullKey) {
        startupGasPullKeyRef.current = null;
      }
    };
  }, [authReady, loading, syncModalOpen, gasUrl, gasAutoSyncEnabled, authUser?.uid]);

  async function handleConnectCloud() {
    setCloudSyncError(null);
    setCloudSyncStatus('connecting');
    try {
      await googleSignIn();
    } catch (err) {
      setCloudSyncStatus('local');
      setCloudSyncError(
        err instanceof Error ? err.message : 'ไม่สามารถเข้าสู่ระบบด้วย Google ได้'
      );
    }
  }

  async function handleDisconnectCloud() {
    await logoutGoogle();
    setCloudSyncStatus('local');
    setCloudSyncError(null);
  }

  async function handleQuickUpdateOdometer(odometer: number) {
    await handleAddOdometerLog({
      odometer,
      date: getTodayIsoDate(),
      source: 'อัปเดตผ่านหน้าเว็บ',
    });
  }

  async function handleUpdateFuelGauge(fuelPercent: number) {
    if (authUser) {
      pendingFirestorePushRef.current = true;
      try {
        await fsUpdateFuelGauge(authUser.uid, fuelPercent);
        return;
      } catch (err) {
        pendingFirestorePushRef.current = false;
        setCloudSyncError(formatCloudErrorMessage(err));
      }
    }
    try {
      const res = await apiFetch('/api/fuel-gauge', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fuelPercent }),
      });
      if (!res.ok) throw new Error('Failed to update gauge');
      const next = (await res.json()) as VehicleMaintenanceState;
      commitState(next, { autoPush: true });
    } catch {
      commitState(
        {
          ...state,
          vehicle: { ...state.vehicle, fuelPercent },
        },
        { autoPush: true }
      );
    }
  }

  async function handleAddOdometerLog(payload: {
    odometer: number;
    date: string;
    source: string;
    note?: string;
  }) {
    if (authUser) {
      pendingFirestorePushRef.current = true;
      try {
        await fsUpdateOdometer(authUser.uid, payload);
        return;
      } catch (err) {
        pendingFirestorePushRef.current = false;
        setCloudSyncError(formatCloudErrorMessage(err));
      }
    }
    try {
      const res = await apiFetch('/api/odometer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to save');
      const next = (await res.json()) as VehicleMaintenanceState;
      commitState(next, { autoPush: true });
    } catch {
      commitState(
        {
          ...state,
          vehicle: {
            ...state.vehicle,
            currentOdometer: payload.odometer,
            lastUpdatedDate: payload.date,
            lastUpdatedSource: payload.source,
          },
          odometerLogs: [
            {
              id: `odo-${Date.now()}`,
              date: payload.date,
              odometer: payload.odometer,
              source: payload.source,
              note: payload.note,
            },
            ...state.odometerLogs,
          ],
        },
        { autoPush: true }
      );
    }
  }

  async function handleSaveFuelLog(payload: {
    id?: string;
    date: string;
    odometer: number;
    amount: number;
    pricePerLiter: number;
    liters: number;
    distance: number;
    kml?: number;
    note: string;
    newFuelPercent?: number;
  }) {
    if (payload.id) {
      const existing = state.fuelLogs.find((l) => l.id === payload.id);
      const updatedEntry: FuelLogEntry = {
        id: payload.id,
        date: payload.date,
        odometer: payload.odometer,
        distance: payload.distance,
        amount: payload.amount,
        liters: Number(payload.liters.toFixed(3)),
        pricePerLiter: Number(payload.pricePerLiter.toFixed(2)),
        kml:
          typeof payload.kml === 'number'
            ? Number(payload.kml.toFixed(2))
            : payload.distance > 0 && payload.liters > 0
              ? Number((payload.distance / payload.liters).toFixed(2))
              : existing?.kml ?? 0,
        note: payload.note,
      };

      if (authUser) {
        pendingFirestorePushRef.current = true;
        try {
          await fsUpdateFuelLog(authUser.uid, updatedEntry);
          return;
        } catch (err) {
          pendingFirestorePushRef.current = false;
          setCloudSyncError(formatCloudErrorMessage(err));
        }
      }

      try {
        const res = await apiFetch(`/api/fuel-logs/${payload.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedEntry),
        });
        if (!res.ok) throw new Error('Failed to update fuel log');
        const next = (await res.json()) as VehicleMaintenanceState;
        commitState(next, { autoPush: true });
      } catch {
        commitState(
          {
            ...state,
            fuelLogs: state.fuelLogs.map((l) =>
              l.id === payload.id ? updatedEntry : l
            ),
          },
          { autoPush: true }
        );
      }
      return;
    }

    const kml =
      payload.distance > 0 && payload.liters > 0
        ? Number((payload.distance / payload.liters).toFixed(2))
        : 0;
    const newEntry: FuelLogEntry = {
      id: `fuel-${Date.now()}`,
      date: payload.date,
      odometer: payload.odometer,
      distance: payload.distance,
      amount: payload.amount,
      liters: payload.liters,
      pricePerLiter: payload.pricePerLiter,
      kml,
      note: payload.note,
    };

    if (authUser) {
      pendingFirestorePushRef.current = true;
      try {
        await fsAddFuelLog(authUser.uid, newEntry, {
          updateVehicleOdo: payload.odometer > state.vehicle.currentOdometer,
          newFuelPercent: payload.newFuelPercent,
        });
        return;
      } catch (err) {
        pendingFirestorePushRef.current = false;
        setCloudSyncError(formatCloudErrorMessage(err));
      }
    }

    try {
      const res = await apiFetch('/api/fuel-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to add fuel log');
      const next = (await res.json()) as VehicleMaintenanceState;
      commitState(next, { autoPush: true });
    } catch {
      commitState(
        {
          ...state,
          vehicle: {
            ...state.vehicle,
            currentOdometer: Math.max(state.vehicle.currentOdometer, payload.odometer),
            fuelPercent:
              payload.newFuelPercent !== undefined
                ? payload.newFuelPercent
                : state.vehicle.fuelPercent,
          },
          fuelLogs: [...state.fuelLogs, newEntry],
        },
        { autoPush: true }
      );
    }
  }

  async function handleDeleteFuelLog(id: string) {
    if (authUser) {
      pendingFirestorePushRef.current = true;
      try {
        await fsDeleteFuelLog(authUser.uid, id);
        return;
      } catch (err) {
        pendingFirestorePushRef.current = false;
        setCloudSyncError(formatCloudErrorMessage(err));
      }
    }
    try {
      const res = await apiFetch(`/api/fuel-logs/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete fuel log');
      const next = (await res.json()) as VehicleMaintenanceState;
      commitState(next, { autoPush: true });
    } catch {
      commitState(
        {
          ...state,
          fuelLogs: state.fuelLogs.filter((l) => l.id !== id),
        },
        { autoPush: true }
      );
    }
  }

  async function handleRecalculateAllFuelLogs() {
    const result = reconcileFuelLogsWithOdometer(state.fuelLogs, {
      odometerLogs: state.odometerLogs,
      forceRecalculateAllKml: true,
    });
    if (result.changedLogs.length === 0) return;

    if (authUser) {
      try {
        await fsBatchUpdateFuelLogs(authUser.uid, result.changedLogs);
      } catch (err) {
        setCloudSyncError(formatCloudErrorMessage(err));
      }
    }

    const nextState: VehicleMaintenanceState = {
      ...state,
      fuelLogs: result.logs,
    };
    commitState(nextState, { autoPush: true });
    void apiFetch('/api/sync-import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullState: nextState }),
    }).catch(() => {});
  }

  async function handleSaveService(payload: {
    id?: string;
    date: string;
    title: string;
    category: ServiceCategory;
    scheduleKey?: ScheduleKey;
    odometer: number;
    partsCost: number;
    laborCost: number;
    intervalKm: number | null;
    notes: string;
    revisionNote?: string;
  }) {
    const isEdit = Boolean(payload.id);
    const record: ServiceRecord = {
      id: payload.id ?? `srv-${Date.now()}`,
      date: payload.date,
      title: payload.title,
      category: payload.category,
      scheduleKey: payload.scheduleKey,
      odometer: payload.odometer,
      partsCost: payload.partsCost,
      laborCost: payload.laborCost,
      totalCost: payload.partsCost + payload.laborCost,
      intervalKm: payload.intervalKm,
      notes: payload.notes,
      revisionNote: payload.revisionNote,
    };

    if (authUser) {
      pendingFirestorePushRef.current = true;
      try {
        await fsSaveService(
          authUser.uid,
          record,
          isEdit,
          !isEdit && record.odometer > state.vehicle.currentOdometer
        );
        return;
      } catch (err) {
        pendingFirestorePushRef.current = false;
        setCloudSyncError(formatCloudErrorMessage(err));
      }
    }

    if (payload.id) {
      try {
        const res = await apiFetch(`/api/services/${payload.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('Failed to update');
        const next = (await res.json()) as VehicleMaintenanceState;
        commitState(next, { autoPush: true });
      } catch {
        commitState(
          {
            ...state,
            services: state.services.map((s) =>
              s.id === payload.id
                ? {
                    ...s,
                    ...payload,
                    id: s.id,
                    totalCost: payload.partsCost + payload.laborCost,
                  }
                : s
            ),
          },
          { autoPush: true }
        );
      }
      return;
    }

    try {
      const res = await apiFetch('/api/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to create');
      const next = (await res.json()) as VehicleMaintenanceState;
      commitState(next, { autoPush: true });
    } catch {
      commitState(
        {
          ...state,
          services: [record, ...state.services],
        },
        { autoPush: true }
      );
    }
  }

  async function handleResetCycle(serviceId: string) {
    const todayIso = getTodayIsoDate();
    const revisionNote = `รีเซ็ตรอบใหม่ที่เลขไมล์ ${state.vehicle.currentOdometer.toLocaleString('th-TH')} กม.`;
    if (authUser) {
      pendingFirestorePushRef.current = true;
      try {
        await fsResetServiceCycle(
          authUser.uid,
          serviceId,
          todayIso,
          state.vehicle.currentOdometer,
          revisionNote
        );
        return;
      } catch (err) {
        pendingFirestorePushRef.current = false;
        setCloudSyncError(formatCloudErrorMessage(err));
      }
    }
    try {
      const res = await apiFetch(`/api/services/${serviceId}/reset-cycle`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to reset cycle');
      const next = (await res.json()) as VehicleMaintenanceState;
      commitState(next, { autoPush: true });
    } catch {
      commitState(
        {
          ...state,
          services: state.services.map((s) =>
            s.id === serviceId
              ? {
                  ...s,
                  date: todayIso,
                  odometer: state.vehicle.currentOdometer,
                  revisionNote,
                }
              : s
          ),
        },
        { autoPush: true }
      );
    }
  }

  async function handleDeleteService(id: string) {
    if (authUser) {
      pendingFirestorePushRef.current = true;
      try {
        await fsDeleteService(authUser.uid, id);
        return;
      } catch (err) {
        pendingFirestorePushRef.current = false;
        setCloudSyncError(formatCloudErrorMessage(err));
      }
    }
    try {
      const res = await apiFetch(`/api/services/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      const next = (await res.json()) as VehicleMaintenanceState;
      commitState(next, { autoPush: true });
    } catch {
      commitState(
        {
          ...state,
          services: state.services.filter((s) => s.id !== id),
        },
        { autoPush: true }
      );
    }
  }

  async function handleUpdateScheduleInterval(key: string, intervalKm: number) {
    const nextIntervals = {
      ...state.scheduleIntervals,
      [key]: intervalKm,
    };
    if (authUser) {
      pendingFirestorePushRef.current = true;
      try {
        await fsUpdateScheduleIntervals(authUser.uid, nextIntervals);
        return;
      } catch (err) {
        pendingFirestorePushRef.current = false;
        setCloudSyncError(formatCloudErrorMessage(err));
      }
    }
    try {
      const res = await apiFetch(`/api/schedules/${key}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intervalKm }),
      });
      if (!res.ok) throw new Error('Failed to update interval');
      const next = (await res.json()) as VehicleMaintenanceState;
      commitState(next, { autoPush: true });
    } catch {
      commitState(
        {
          ...state,
          scheduleIntervals: nextIntervals,
        },
        { autoPush: true }
      );
    }
  }

  async function handleImportCloudState(cloudPayload: unknown): Promise<{
    addedFuelCount: number;
    addedServiceCount: number;
    updatedOdometer: boolean;
  }> {
    const currentBaseline = latestStateRef.current;
    const localMerge = mergeSheetsPayloadIntoState(currentBaseline, cloudPayload);

    let next: VehicleMaintenanceState;
    try {
      const res = await apiFetch('/api/sync-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cloudPayload),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? 'นำเข้าข้อมูลไม่สำเร็จ');
      }
      next = (await res.json()) as VehicleMaintenanceState;
    } catch (err) {
      if (!(err instanceof ServerUnavailableError)) {
        throw err;
      }
      next = localMerge.state;
    }

    const reconciled = reconcileFuelLogsWithOdometer(next.fuelLogs, {
      odometerLogs: next.odometerLogs,
    });
    const normalizedNext: VehicleMaintenanceState = {
      ...next,
      vehicle: {
        ...next.vehicle,
        imageUrl: normalizeVehicleImageUrl(next.vehicle.imageUrl),
      },
      fuelLogs: reconciled.changedLogs.length > 0 ? reconciled.logs : next.fuelLogs,
    };

    if (authUser) {
      try {
        await fsCreateOrResetVehicleWithBatch(authUser.uid, currentBaseline, normalizedNext);
      } catch (err) {
        setCloudSyncError(formatCloudErrorMessage(err));
      }
    }
    commitState(normalizedNext);
    return {
      addedFuelCount: localMerge.addedFuelCount,
      addedServiceCount: localMerge.addedServiceCount,
      updatedOdometer: localMerge.updatedOdometer,
    };
  }

  async function handleApplyDrivePatch(patch: ImportedVehiclePatch) {
    const next = mergeImportedPatch(state, patch);
    if (authUser) {
      pendingFirestorePushRef.current = true;
      try {
        await fsCreateOrResetVehicleWithBatch(authUser.uid, state, next);
        commitState(next);
        void apiFetch('/api/sync-import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fullState: next }),
        }).catch(() => {});
        return;
      } catch (err) {
        pendingFirestorePushRef.current = false;
        setCloudSyncError(formatCloudErrorMessage(err));
      }
    }

    try {
      const res = await apiFetch('/api/drive-apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patch }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'อัปเดตข้อมูลไม่สำเร็จ');
      }
      const serverNext = (await res.json()) as VehicleMaintenanceState;
      commitState(serverNext, { autoPush: true });
    } catch {
      commitState(next, { autoPush: true });
    }
  }

  async function handleResetSeed() {
    let firestoreSucceeded = false;
    if (authUser) {
      pendingFirestorePushRef.current = true;
      try {
        await fsCreateOrResetVehicleWithBatch(authUser.uid, state, SEED_VEHICLE_STATE);
        firestoreSucceeded = true;
      } catch (err) {
        pendingFirestorePushRef.current = false;
        setCloudSyncError(formatCloudErrorMessage(err));
      }
    }
    try {
      const res = await apiFetch('/api/reset', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to reset');
      const next = (await res.json()) as VehicleMaintenanceState;
      commitState(next, { autoPush: !firestoreSucceeded });
    } catch {
      commitState(SEED_VEHICLE_STATE, { autoPush: !firestoreSucceeded });
    } finally {
      setConfirmReset(false);
    }
  }

  function handleChangeGasUrl(nextRawUrl: string) {
    const saved = saveGasWebhookUrl(nextRawUrl);
    setGasUrl(saved);
    setGasSyncError(null);
    if (!saved) {
      setGasSyncStatus('unconfigured');
    } else if (gasSyncStatus === 'unconfigured' || gasSyncStatus === 'error') {
      setGasSyncStatus(gasLastSyncAt ? 'synced' : 'idle');
    }
  }

  function handleToggleGasAutoSync(enabled: boolean) {
    saveGasAutoSyncEnabled(enabled);
    setGasAutoSyncEnabled(enabled);
  }

  async function handleManualGasSync(
    direction: 'push' | 'pull',
    urlOverride?: string
  ): Promise<{ ok: boolean; message: string }> {
    const targetUrl = (urlOverride ?? gasUrl).trim();
    if (!targetUrl) {
      return { ok: false, message: 'กรุณาวาง URL ของ Google Apps Script Web App ก่อน' };
    }

    if (direction === 'push') {
      return triggerBackgroundGasPush(latestStateRef.current, {
        forceManual: true,
        urlOverride: targetUrl,
      });
    }

    setGasSyncStatus('syncing');
    setGasSyncError(null);
    try {
      const { hasData, data } = await pullFromGoogleSheets(targetUrl);
      let importSummary = {
        addedFuelCount: 0,
        addedServiceCount: 0,
        updatedOdometer: false,
      };
      if (hasData) {
        importSummary = await handleImportCloudState(data);
      }
      const nowIso = new Date().toISOString();
      setGasSyncStatus('synced');
      setGasSyncError(null);
      setGasLastDirection('pull');
      setGasLastSyncAt(nowIso);
      saveGasLastSyncAt(nowIso);

      let successMessage = hasData
        ? 'ดึงข้อมูลจาก Google Sheets ลงแดชบอร์ดสำเร็จแล้ว'
        : 'เชื่อมต่อ Google Sheets สำเร็จ (ยังไม่มีข้อมูลใหม่ในชีต)';
      if (importSummary.addedFuelCount > 0 || importSummary.addedServiceCount > 0) {
        const parts: string[] = [];
        if (importSummary.addedFuelCount > 0) {
          parts.push(`เติมน้ำมัน +${importSummary.addedFuelCount} รอบ`);
        }
        if (importSummary.addedServiceCount > 0) {
          parts.push(`ซ่อมบำรุง +${importSummary.addedServiceCount} รายการ`);
        }
        successMessage = `ดึงข้อมูลจาก Google Sheets สำเร็จ (เพิ่มรายการใหม่: ${parts.join(', ')}${
          importSummary.updatedOdometer ? ' และอัปเดตเลขไมล์ล่าสุดแล้ว' : ''
        })`;
      }

      return {
        ok: true,
        message: successMessage,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'เชื่อมต่อไม่สำเร็จ';
      setGasSyncStatus('error');
      setGasSyncError(msg);
      return { ok: false, message: `เชื่อมต่อไม่สำเร็จ: ${msg}` };
    }
  }

  const schedules = buildMaintenanceSchedules(
    state.services,
    state.vehicle.currentOdometer,
    state.scheduleIntervals,
    notificationPrefs.thresholdKm
  );
  const maintenanceAlerts = evaluateMaintenanceAlerts(
    state.services,
    state.vehicle.currentOdometer,
    state.scheduleIntervals,
    notificationPrefs.thresholdKm
  );
  const unacknowledgedAlerts = maintenanceAlerts.filter(
    (a) => !notificationPrefs.dismissedAlertIds.includes(a.id)
  );
  const fuelStats = computeFuelAnalytics(
    state.fuelLogs,
    state.vehicle.fuelPercent,
    state.vehicle.tankCapacityLiters
  );
  const costSummary = computeCostSummary(state.services, state.fuelLogs);
  const fleetBanner = computeFleetHealthBanner(
    schedules,
    state.services,
    state.vehicle.currentOdometer,
    state.scheduleIntervals,
    notificationPrefs.thresholdKm
  );

  useEffect(() => {
    if (
      loading ||
      !notificationPrefs.browserEnabled ||
      browserPermission !== 'granted' ||
      maintenanceAlerts.length === 0
    ) {
      return;
    }
    const updatedSent = dispatchBrowserMaintenanceNotifications(
      maintenanceAlerts,
      notificationPrefs.sentBrowserKeys
    );
    if (updatedSent !== notificationPrefs.sentBrowserKeys) {
      updateNotificationPrefs((prev) => ({
        ...prev,
        sentBrowserKeys: updatedSent,
      }));
    }
  }, [
    loading,
    maintenanceAlerts,
    notificationPrefs.browserEnabled,
    notificationPrefs.sentBrowserKeys,
    browserPermission,
  ]);

  function handleJumpToSchedule() {
    if (activeTab !== 'overview' && activeTab !== 'maintenance') {
      setActiveTab('maintenance');
    }
    window.setTimeout(() => {
      document
        .getElementById('schedule-heading')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  }

  async function handleRequestBrowserPermission() {
    const nextPerm = await requestBrowserNotificationPermission();
    setBrowserPermission(nextPerm);
    if (nextPerm === 'granted') {
      updateNotificationPrefs((prev) => {
        const updatedSent =
          maintenanceAlerts.length > 0
            ? dispatchBrowserMaintenanceNotifications(
                maintenanceAlerts,
                prev.sentBrowserKeys
              )
            : prev.sentBrowserKeys;
        return {
          ...prev,
          browserEnabled: true,
          sentBrowserKeys: updatedSent,
        };
      });
    }
  }

  function handleDismissAlert(alertId: string) {
    updateNotificationPrefs((prev) => ({
      ...prev,
      dismissedAlertIds: prev.dismissedAlertIds.includes(alertId)
        ? prev.dismissedAlertIds
        : [...prev.dismissedAlertIds, alertId],
    }));
  }

  function handleDismissAllAlerts() {
    updateNotificationPrefs((prev) => ({
      ...prev,
      dismissedAlertIds: Array.from(
        new Set([
          ...prev.dismissedAlertIds,
          ...maintenanceAlerts.map((a) => a.id),
        ])
      ),
    }));
  }

  function handleRestoreDismissedAlerts() {
    updateNotificationPrefs((prev) => ({
      ...prev,
      dismissedAlertIds: [],
    }));
  }

  return (
    <div id="top" className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <StatusBanner banner={fleetBanner} onViewSchedule={handleJumpToSchedule} />

      <TopBar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onOpenAddFuel={() => {
          setOcrPrefill(null);
          setFuelModalOpen(true);
        }}
        alerts={maintenanceAlerts}
        unacknowledgedCount={unacknowledgedAlerts.length}
        dismissedAlertIds={notificationPrefs.dismissedAlertIds}
        thresholdKm={notificationPrefs.thresholdKm}
        browserEnabled={notificationPrefs.browserEnabled}
        browserPermission={browserPermission}
        onChangeThresholdKm={(km) =>
          updateNotificationPrefs((prev) => ({
            ...prev,
            thresholdKm: km,
          }))
        }
        onRequestBrowserPermission={handleRequestBrowserPermission}
        onToggleBrowserEnabled={(enabled) =>
          updateNotificationPrefs((prev) => ({
            ...prev,
            browserEnabled: enabled,
          }))
        }
        onTestBrowserNotification={() =>
          sendTestBrowserNotification(
            maintenanceAlerts,
            notificationPrefs.thresholdKm
          )
        }
        onDismissAlert={handleDismissAlert}
        onRestoreDismissedAlerts={handleRestoreDismissedAlerts}
        onJumpToSchedule={handleJumpToSchedule}
      />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-8">
        {loading ? (
          <div className="space-y-4" aria-busy="true" aria-label="กำลังโหลดข้อมูล">
            <div className="h-72 bg-white border border-slate-200 rounded-xl animate-pulse" />
            <div className="h-24 bg-white border border-slate-200 rounded-xl animate-pulse" />
          </div>
        ) : (
          <>
            {activeTab === 'overview' && (
              <>
                <VehicleHero
                  vehicle={state.vehicle}
                  fuelStats={fuelStats}
                  costSummary={costSummary}
                  schedules={schedules}
                  onQuickUpdateOdometer={handleQuickUpdateOdometer}
                  onUpdateFuelGauge={handleUpdateFuelGauge}
                  onOpenOcrModal={() => setOcrModalOpen(true)}
                  onOpenFuelModal={() => {
                    setOcrPrefill(null);
                    setFuelModalOpen(true);
                  }}
                  onOpenServiceModal={() => {
                    setEditingService(null);
                    setServiceModalOpen(true);
                  }}
                  onOpenSyncModal={() => setSyncModalOpen(true)}
                  onOpenDriveModal={() => setDriveModalOpen(true)}
                  cloudUserEmail={authUser?.email ?? authUser?.displayName ?? null}
                  cloudSyncStatus={cloudSyncStatus}
                  cloudSyncError={cloudSyncError}
                  onConnectCloud={handleConnectCloud}
                  onDisconnectCloud={handleDisconnectCloud}
                />

                <AnalyticsSection
                  fuelLogs={state.fuelLogs}
                  costSummary={costSummary}
                  services={state.services}
                  odometerLogs={state.odometerLogs}
                  onEditFuelLog={(log) => {
                    setOcrPrefill(null);
                    setEditingFuelLog(log);
                    setFuelModalOpen(true);
                  }}
                />

                <MonthlyMaintenanceChart services={state.services} />

                <ScheduleSection
                  schedules={schedules}
                  currentOdometer={state.vehicle.currentOdometer}
                  alertThresholdKm={notificationPrefs.thresholdKm}
                  onUpdateInterval={handleUpdateScheduleInterval}
                  onResetCycle={handleResetCycle}
                />

                <FuelHistorySection
                  fuelLogs={state.fuelLogs}
                  odometerLogs={state.odometerLogs}
                  tankCapacityLiters={state.vehicle.tankCapacityLiters}
                  onOpenAddFuel={() => {
                    setOcrPrefill(null);
                    setEditingFuelLog(null);
                    setFuelModalOpen(true);
                  }}
                  onEditFuelLog={(log) => {
                    setOcrPrefill(null);
                    setEditingFuelLog(log);
                    setFuelModalOpen(true);
                  }}
                  onDeleteFuelLog={handleDeleteFuelLog}
                  onRecalculateAllFuelLogs={handleRecalculateAllFuelLogs}
                />

                <ServiceHistoryTable
                  services={state.services}
                  onEditService={(srv) => {
                    setEditingService(srv);
                    setServiceModalOpen(true);
                  }}
                  onDeleteService={handleDeleteService}
                  onOpenAddService={() => {
                    setEditingService(null);
                    setServiceModalOpen(true);
                  }}
                />
              </>
            )}

            {activeTab === 'fuel' && (
              <>
                <AnalyticsSection
                  fuelLogs={state.fuelLogs}
                  costSummary={costSummary}
                  services={state.services}
                  odometerLogs={state.odometerLogs}
                  onEditFuelLog={(log) => {
                    setOcrPrefill(null);
                    setEditingFuelLog(log);
                    setFuelModalOpen(true);
                  }}
                />
                <FuelHistorySection
                  fuelLogs={state.fuelLogs}
                  odometerLogs={state.odometerLogs}
                  tankCapacityLiters={state.vehicle.tankCapacityLiters}
                  onOpenAddFuel={() => {
                    setOcrPrefill(null);
                    setEditingFuelLog(null);
                    setFuelModalOpen(true);
                  }}
                  onEditFuelLog={(log) => {
                    setOcrPrefill(null);
                    setEditingFuelLog(log);
                    setFuelModalOpen(true);
                  }}
                  onDeleteFuelLog={handleDeleteFuelLog}
                  onRecalculateAllFuelLogs={handleRecalculateAllFuelLogs}
                />
              </>
            )}

            {activeTab === 'maintenance' && (
              <>
                <MonthlyMaintenanceChart services={state.services} />
                <ScheduleSection
                  schedules={schedules}
                  currentOdometer={state.vehicle.currentOdometer}
                  alertThresholdKm={notificationPrefs.thresholdKm}
                  onUpdateInterval={handleUpdateScheduleInterval}
                  onResetCycle={handleResetCycle}
                />
                <ServiceHistoryTable
                  services={state.services}
                  onEditService={(srv) => {
                    setEditingService(srv);
                    setServiceModalOpen(true);
                  }}
                  onDeleteService={handleDeleteService}
                  onOpenAddService={() => {
                    setEditingService(null);
                    setServiceModalOpen(true);
                  }}
                />
              </>
            )}

            {activeTab === 'odometer' && (
              <OdometerLogView
                currentOdometer={state.vehicle.currentOdometer}
                odometerLogs={state.odometerLogs}
                onAddOdometerLog={handleAddOdometerLog}
              />
            )}
          </>
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white mt-12">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-slate-500">
          <p>
            สมุดบันทึกอ้วนพี ({state.vehicle.make} {state.vehicle.model} {state.vehicle.engineSpec}) · อัปเดตล่าสุด {formatThaiDate(state.vehicle.lastUpdatedDate, 'full')}
          </p>

          <div>
            {confirmReset ? (
              <div className="inline-flex items-center gap-2">
                <span className="text-slate-700 font-medium">คืนค่าข้อมูลต้นฉบับ?</span>
                <button
                  type="button"
                  onClick={handleResetSeed}
                  className="px-2.5 py-1 rounded bg-slate-900 text-white font-medium hover:bg-slate-800 cursor-pointer"
                >
                  ยืนยัน
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmReset(false)}
                  className="px-2.5 py-1 rounded border border-slate-300 text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  ยกเลิก
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>คืนค่าข้อมูลเริ่มต้น</span>
              </button>
            )}
          </div>
        </div>
      </footer>

      <FuelFormModal
        isOpen={fuelModalOpen}
        defaultOdometer={state.vehicle.currentOdometer}
        tankCapacityLiters={state.vehicle.tankCapacityLiters}
        fuelLogs={state.fuelLogs}
        editingFuelLog={editingFuelLog}
        prefillFromOcr={ocrPrefill}
        onClose={() => {
          setFuelModalOpen(false);
          setEditingFuelLog(null);
          setOcrPrefill(null);
        }}
        onSubmit={handleSaveFuelLog}
      />

      <ServiceFormModal
        isOpen={serviceModalOpen}
        editingService={editingService}
        defaultOdometer={state.vehicle.currentOdometer}
        onClose={() => {
          setServiceModalOpen(false);
          setEditingService(null);
        }}
        onSubmit={handleSaveService}
      />

      <OcrScannerModal
        isOpen={ocrModalOpen}
        onClose={() => setOcrModalOpen(false)}
        onExtracted={(extracted) => {
          setOcrModalOpen(false);
          setOcrPrefill(extracted);
          setFuelModalOpen(true);
        }}
      />

      <GoogleSheetsSyncModal
        isOpen={syncModalOpen}
        gasUrl={gasUrl}
        autoSyncEnabled={gasAutoSyncEnabled}
        syncStatus={gasSyncStatus}
        lastSyncAt={gasLastSyncAt}
        lastDirection={gasLastDirection}
        onClose={() => setSyncModalOpen(false)}
        onChangeGasUrl={handleChangeGasUrl}
        onToggleAutoSync={handleToggleGasAutoSync}
        onManualSync={handleManualGasSync}
      />

      <GoogleDriveModal
        isOpen={driveModalOpen}
        currentState={state}
        onClose={() => setDriveModalOpen(false)}
        onApplyPatch={handleApplyDrivePatch}
      />

      {!loading && (
        <SheetsSyncStatusBadge
          gasUrl={gasUrl}
          autoSyncEnabled={gasAutoSyncEnabled}
          status={gasSyncStatus}
          lastSyncAt={gasLastSyncAt}
          lastDirection={gasLastDirection}
          errorMessage={gasSyncError}
          onOpenSyncModal={() => setSyncModalOpen(true)}
        />
      )}

      {!loading && (
        <MaintenanceAlertToast
          alerts={unacknowledgedAlerts}
          thresholdKm={notificationPrefs.thresholdKm}
          onJumpToSchedule={handleJumpToSchedule}
          onDismissAlert={handleDismissAlert}
          onDismissAll={handleDismissAllAlerts}
        />
      )}
    </div>
  );
}
