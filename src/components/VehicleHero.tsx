import { useState, type FormEvent } from 'react';
import {
  Check,
  Cloud,
  CloudCog,
  CloudOff,
  Droplets,
  Fuel,
  Gauge,
  HardDrive,
  Leaf,
  Pencil,
  ScanLine,
  Truck,
  Wallet,
  Wrench,
} from 'lucide-react';
import type {
  CostSummary,
  FuelAnalyticsSummary,
  MaintenanceScheduleItem,
  VehicleProfile,
} from '../types/maintenance';
import { normalizeVehicleImageUrl } from '../data/seedData';
import {
  formatBaht,
  formatKm,
  formatThaiDate,
  validateOdometerInput,
} from '../utils/maintenance';

interface VehicleHeroProps {
  vehicle: VehicleProfile;
  fuelStats: FuelAnalyticsSummary;
  costSummary: CostSummary;
  schedules: MaintenanceScheduleItem[];
  onQuickUpdateOdometer: (odometer: number) => Promise<void>;
  onUpdateFuelGauge: (fuelPercent: number) => Promise<void>;
  onOpenOcrModal: () => void;
  onOpenFuelModal: () => void;
  onOpenServiceModal: () => void;
  onOpenSyncModal: () => void;
  onOpenDriveModal: () => void;
  cloudUserEmail?: string | null;
  cloudSyncStatus: 'local' | 'connecting' | 'synced' | 'error';
  cloudSyncError?: string | null;
  onConnectCloud: () => Promise<void>;
  onDisconnectCloud: () => Promise<void>;
}

export function VehicleHero({
  vehicle,
  fuelStats,
  costSummary,
  schedules,
  onQuickUpdateOdometer,
  onUpdateFuelGauge,
  onOpenOcrModal,
  onOpenFuelModal,
  onOpenServiceModal,
  onOpenSyncModal,
  onOpenDriveModal,
  cloudUserEmail,
  cloudSyncStatus,
  cloudSyncError,
  onConnectCloud,
  onDisconnectCloud,
}: VehicleHeroProps) {
  const [imageError, setImageError] = useState(false);
  const [editingOdo, setEditingOdo] = useState(false);
  const [odoInput, setOdoInput] = useState(String(vehicle.currentOdometer));
  const [odoError, setOdoError] = useState<string | null>(null);
  const [editingGauge, setEditingGauge] = useState(false);
  const [gaugeValue, setGaugeValue] = useState(vehicle.fuelPercent);
  const [savedToast, setSavedToast] = useState<string | null>(null);

  const nearestSchedule = schedules[0] ?? null;

  async function handleOdoSubmit(e: FormEvent) {
    e.preventDefault();
    const check = validateOdometerInput(odoInput);
    if (!check.valid) {
      setOdoError(check.error ?? 'เลขไมล์ไม่ถูกต้อง');
      return;
    }
    const parsed = Number(odoInput.replace(/,/g, '').trim());
    setOdoError(null);
    await onQuickUpdateOdometer(parsed);
    setEditingOdo(false);
    setSavedToast('อัปเดตเลขไมล์แล้ว');
    setTimeout(() => setSavedToast(null), 2500);
  }

  async function handleGaugeSave(e: FormEvent) {
    e.preventDefault();
    await onUpdateFuelGauge(gaugeValue);
    setEditingGauge(false);
    setSavedToast('ปรับระดับน้ำมันแล้ว');
    setTimeout(() => setSavedToast(null), 2500);
  }

  return (
    <section aria-labelledby="vehicle-heading" className="space-y-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden grid grid-cols-1 lg:grid-cols-12 items-stretch transition-colors duration-200">
        <div className="lg:col-span-5 relative min-h-[210px] lg:min-h-[260px] bg-slate-100 dark:bg-slate-800">
          {!imageError ? (
            <img
              src={normalizeVehicleImageUrl(vehicle.imageUrl)}
              alt={`${vehicle.nickname} (${vehicle.make} ${vehicle.model} ${vehicle.engineSpec})`}
              referrerPolicy="no-referrer"
              onError={() => setImageError(true)}
              className="w-full h-full lg:h-full object-cover object-center"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900 text-slate-200 p-6">
              <Truck className="w-12 h-12 mb-3 text-slate-400" aria-hidden="true" />
              <p className="font-display text-lg font-semibold">
                {vehicle.nickname} · {vehicle.make} {vehicle.model}
              </p>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/25 to-transparent pointer-events-none" />
          <div className="absolute bottom-4 left-4 right-4 text-white">
            <p className="text-xs text-slate-200">
              {vehicle.make} {vehicle.model} ({vehicle.engineSpec}) · ถัง {vehicle.tankCapacityLiters} ลิตร
            </p>
            <h1
              id="vehicle-heading"
              className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-balance mt-0.5"
            >
              อ้วนพี · สมุดบันทึกการใช้รถ
            </h1>
          </div>
        </div>

        <div className="lg:col-span-7 p-5 sm:p-6 flex flex-col justify-between gap-5">
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              {cloudSyncStatus === 'synced' && cloudUserEmail ? (
                <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-medium min-w-0">
                  <Cloud className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate" data-testid="cloud-sync-status">
                    ซิงค์ Firestore · {cloudUserEmail}
                  </span>
                  <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
                    ·
                  </span>
                  <button
                    type="button"
                    onClick={onDisconnectCloud}
                    className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 font-normal whitespace-nowrap cursor-pointer"
                  >
                    ออกจากระบบ
                  </button>
                </div>
              ) : cloudSyncStatus === 'connecting' ? (
                <div className="flex items-center gap-1.5 text-blue-700 dark:text-blue-400 font-medium">
                  <Cloud className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span data-testid="cloud-sync-status">กำลังซิงค์ฐานข้อมูล Firestore...</span>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2 text-slate-500 dark:text-slate-400">
                  <CloudOff className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" aria-hidden="true" />
                  <span data-testid="cloud-sync-status">บันทึกเฉพาะในเครื่อง</span>
                  <span aria-hidden="true">·</span>
                  <button
                    type="button"
                    onClick={onConnectCloud}
                    data-testid="connect-firestore-btn"
                    className="text-blue-700 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium whitespace-nowrap cursor-pointer"
                  >
                    เชื่อมต่อ Firestore ถาวร
                  </button>
                </div>
              )}

              {savedToast && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                  <Check className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{savedToast}</span>
                </span>
              )}
            </div>

            {cloudSyncError && (
              <p
                role="alert"
                className="text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/70 rounded-lg px-3 py-2"
              >
                {cloudSyncError}
              </p>
            )}

            <div
              data-testid="hero-odometer-card"
              className={`rounded-lg px-4 py-3.5 flex flex-wrap items-center justify-between gap-3 transition-colors ${
                nearestSchedule?.status === 'overdue'
                  ? 'bg-red-950 text-white border border-red-800'
                  : nearestSchedule?.status === 'warning'
                    ? 'bg-amber-950 text-white border border-amber-700'
                    : 'bg-slate-900 dark:bg-slate-950 text-white border border-transparent dark:border-slate-800'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Gauge
                  className={`w-5 h-5 shrink-0 ${
                    nearestSchedule?.status === 'overdue'
                      ? 'text-red-300'
                      : nearestSchedule?.status === 'warning'
                        ? 'text-amber-300'
                        : 'text-slate-400'
                  }`}
                  aria-hidden="true"
                />
                <div>
                  <p
                    className={`text-xs ${
                      nearestSchedule?.status === 'overdue'
                        ? 'text-red-200 font-medium'
                        : nearestSchedule?.status === 'warning'
                          ? 'text-amber-200 font-medium'
                          : 'text-slate-400'
                    }`}
                  >
                    {nearestSchedule
                      ? nearestSchedule.status === 'overdue'
                        ? `เกินกำหนดแล้ว: ${nearestSchedule.label}`
                        : nearestSchedule.status === 'warning'
                          ? `ใกล้ครบกำหนด: ${nearestSchedule.label}`
                          : `เซอร์วิสถัดไป: ${nearestSchedule.label}`
                      : 'เลขไมล์หน้าปัดปัจจุบัน'}
                  </p>
                  <p className="text-xs text-slate-200 font-mono tabular-nums">
                    {nearestSchedule
                      ? nearestSchedule.remainingKm <= 0
                        ? `ครบกำหนด ${formatKm(nearestSchedule.nextDueKm)} กม. (เกิน ${formatKm(Math.abs(nearestSchedule.remainingKm))} กม.)`
                        : `ครบกำหนด ${formatKm(nearestSchedule.nextDueKm)} กม. (เหลืออีก ${formatKm(nearestSchedule.remainingKm)} กม.)`
                      : `อัปเดต ${formatThaiDate(vehicle.lastUpdatedDate, 'short')} · ${vehicle.lastUpdatedSource}`}
                  </p>
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span
                  data-testid="current-odometer-value"
                  className="font-mono text-2xl sm:text-3xl font-semibold tracking-tight tabular-nums"
                >
                  {formatKm(vehicle.currentOdometer)}
                </span>
                <span className="text-sm text-slate-300">กม.</span>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">เครื่องมือบันทึกข้อมูลด่วน</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onOpenFuelModal}
                className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3.5 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 text-white text-xs sm:text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Fuel className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>เติมน้ำมัน</span>
              </button>

              <button
                type="button"
                onClick={onOpenOcrModal}
                className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <ScanLine className="w-4 h-4 text-blue-700 dark:text-blue-400 shrink-0" aria-hidden="true" />
                <span>สแกน AI OCR</span>
              </button>

              <button
                type="button"
                onClick={onOpenServiceModal}
                className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Wrench className="w-4 h-4 text-slate-700 dark:text-slate-300 shrink-0" aria-hidden="true" />
                <span>เพิ่มซ่อมบำรุง</span>
              </button>

              <button
                type="button"
                onClick={onOpenDriveModal}
                data-testid="open-drive-modal-btn"
                className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <HardDrive className="w-4 h-4 text-blue-700 dark:text-blue-400 shrink-0" aria-hidden="true" />
                <span>Google Drive</span>
              </button>

              <button
                type="button"
                onClick={onOpenSyncModal}
                className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <CloudCog className="w-4 h-4 text-slate-700 dark:text-slate-300 shrink-0" aria-hidden="true" />
                <span>Google Sheets</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 4-Column KPI Strip */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 dark:divide-slate-800 transition-colors duration-200">
        {/* KPI 1: Odometer */}
        <div className="p-4 sm:p-5 flex flex-col justify-between gap-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">เลขไมล์ปัจจุบัน</p>
              <p className="font-mono text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums mt-1">
                {formatKm(vehicle.currentOdometer)}{' '}
                <span className="text-xs font-sans font-normal text-slate-500 dark:text-slate-400">กม.</span>
              </p>
            </div>
            <Gauge className="w-5 h-5 text-blue-700 dark:text-blue-400 shrink-0" aria-hidden="true" />
          </div>

          {editingOdo ? (
            <form onSubmit={handleOdoSubmit} className="space-y-1.5" noValidate>
              <div className="flex gap-1.5">
                <label htmlFor="kpi-odo-input" className="sr-only">
                  ระบุเลขไมล์ใหม่
                </label>
                <input
                  id="kpi-odo-input"
                  type="text"
                  inputMode="numeric"
                  value={odoInput}
                  onChange={(e) => setOdoInput(e.target.value)}
                  className="w-full min-h-[34px] px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-mono text-xs tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
                <button
                  type="submit"
                  className="px-2.5 py-1 rounded bg-blue-700 dark:bg-blue-600 text-white text-xs font-medium whitespace-nowrap cursor-pointer"
                >
                  บันทึก
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingOdo(false);
                    setOdoError(null);
                  }}
                  className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 cursor-pointer"
                >
                  ยกเลิก
                </button>
              </div>
              {odoError && <p className="text-[11px] text-red-600 dark:text-red-400">{odoError}</p>}
            </form>
          ) : (
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>อัปเดต {formatThaiDate(vehicle.lastUpdatedDate, 'short')}</span>
              <button
                type="button"
                onClick={() => {
                  setOdoInput(String(vehicle.currentOdometer));
                  setEditingOdo(true);
                }}
                className="inline-flex items-center gap-1 text-blue-700 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium cursor-pointer"
              >
                <Pencil className="w-3 h-3" aria-hidden="true" />
                <span>แก้ไขไมล์</span>
              </button>
            </div>
          )}
        </div>

        {/* KPI 2: Fuel Tank Level */}
        <div className="p-4 sm:p-5 flex flex-col justify-between gap-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                น้ำมันคงเหลือ ({vehicle.tankCapacityLiters} ลิตร)
              </p>
              <div className="flex items-baseline gap-2 mt-1">
                <p
                  data-testid="kpi-fuel-percent"
                  className="font-mono text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums"
                >
                  {vehicle.fuelPercent}%
                </p>
                <span className="text-xs font-mono tabular-nums text-amber-800 dark:text-amber-400">
                  ~{fuelStats.approxTankLiters} ลิตร
                </span>
              </div>
            </div>
            <Droplets className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" aria-hidden="true" />
          </div>

          {editingGauge ? (
            <form onSubmit={handleGaugeSave} className="space-y-1.5">
              <div className="flex items-center gap-2">
                <label htmlFor="gauge-slider" className="sr-only">
                  ปรับระดับน้ำมันในถัง
                </label>
                <input
                  id="gauge-slider"
                  type="range"
                  min="0"
                  max="100"
                  value={gaugeValue}
                  onChange={(e) => setGaugeValue(Number(e.target.value))}
                  className="flex-1 accent-blue-700 dark:accent-blue-500"
                />
                <span className="font-mono text-xs tabular-nums w-9 text-right text-slate-900 dark:text-slate-100">
                  {gaugeValue}%
                </span>
              </div>
              <div className="flex justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => setEditingGauge(false)}
                  className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="px-2.5 py-1 rounded bg-blue-700 dark:bg-blue-600 text-white text-xs font-medium cursor-pointer"
                >
                  บันทึก
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-1.5">
              <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-500 transition-all duration-200"
                  style={{ width: `${vehicle.fuelPercent}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                <span>E (0%)</span>
                <button
                  type="button"
                  onClick={() => {
                    setGaugeValue(vehicle.fuelPercent);
                    setEditingGauge(true);
                  }}
                  className="text-blue-700 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium cursor-pointer"
                >
                  ปรับระดับเกจ
                </button>
                <span>F (100%)</span>
              </div>
            </div>
          )}
        </div>

        {/* KPI 3: Average Fuel Consumption */}
        <div className="p-4 sm:p-5 flex flex-col justify-between gap-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">อัตราสิ้นเปลืองเฉลี่ย</p>
              <p
                data-testid="kpi-avg-kml"
                className="font-mono text-2xl font-bold text-emerald-700 dark:text-emerald-400 tabular-nums mt-1"
              >
                {fuelStats.avgKml.toFixed(2)}{' '}
                <span className="text-xs font-sans font-normal text-slate-500 dark:text-slate-400">กม./ลิตร</span>
              </p>
            </div>
            <Leaf className="w-5 h-5 text-emerald-700 dark:text-emerald-400 shrink-0" aria-hidden="true" />
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>
              ล่าสุด <strong className="font-mono text-slate-800 dark:text-slate-200 tabular-nums">{fuelStats.lastKml.toFixed(2)}</strong> กม./ล.
            </span>
            <span className="font-mono text-emerald-700 dark:text-emerald-400 font-medium tabular-nums">
              ~{fuelStats.costPerKm.toFixed(2)} บ./กม.
            </span>
          </div>
        </div>

        {/* KPI 4: Total Combined Expenses */}
        <div className="p-4 sm:p-5 flex flex-col justify-between gap-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">ค่าใช้จ่ายสะสมทั้งหมด</p>
              <p
                data-testid="kpi-total-cost"
                className="font-mono text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums mt-1"
              >
                {formatBaht(costSummary.totalCost)}{' '}
                <span className="text-xs font-sans font-normal text-slate-500 dark:text-slate-400">บาท</span>
              </p>
            </div>
            <Wallet className="w-5 h-5 text-slate-700 dark:text-slate-300 shrink-0" aria-hidden="true" />
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>
              น้ำมัน <strong className="font-mono text-slate-800 dark:text-slate-200 tabular-nums">{formatBaht(costSummary.totalFuelCost)}</strong> บ.
            </span>
            <span>
              ซ่อมบำรุง <strong className="font-mono text-slate-800 dark:text-slate-200 tabular-nums">{formatBaht(costSummary.totalMaintenanceCost)}</strong> บ.
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
