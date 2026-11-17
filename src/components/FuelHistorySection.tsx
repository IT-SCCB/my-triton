import { useState } from 'react';
import { AlertTriangle, Calculator, Fuel, Pencil, Plus, Trash2 } from 'lucide-react';
import type { FuelLogEntry, OdometerLogEntry } from '../types/maintenance';
import {
  buildFuelPrevOdometerMap,
  computeFuelKmlFromFormula,
  formatBaht,
  formatKm,
  formatThaiDate,
  getRecordedFuelKml,
  isFuelKmlOutOfRange,
  isFuelLitersOverTank,
  MAX_REALISTIC_KML,
  MIN_REALISTIC_KML,
  reconcileFuelLogsWithOdometer,
  sortFuelLogsNewestFirst,
} from '../utils/maintenance';

interface FuelHistorySectionProps {
  fuelLogs: FuelLogEntry[];
  odometerLogs?: OdometerLogEntry[];
  tankCapacityLiters?: number;
  averageKml?: number;
  onOpenAddFuel: () => void;
  onEditFuelLog: (log: FuelLogEntry) => void;
  onDeleteFuelLog: (id: string) => Promise<void>;
  onRecalculateAllFuelLogs?: () => Promise<void>;
}

export function FuelHistorySection({
  fuelLogs,
  odometerLogs = [],
  tankCapacityLiters = 75,
  averageKml = 0,
  onOpenAddFuel,
  onEditFuelLog,
  onDeleteFuelLog,
  onRecalculateAllFuelLogs,
}: FuelHistorySectionProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [onlyOutliers, setOnlyOutliers] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [reconciledBanner, setReconciledBanner] = useState<string | null>(null);

  const prevOdoById = buildFuelPrevOdometerMap(fuelLogs, odometerLogs);
  const reconcileSummary = reconcileFuelLogsWithOdometer(fuelLogs, {
    odometerLogs,
    forceRecalculateAllKml: true,
  });

  const sortedLogs = sortFuelLogsNewestFirst(fuelLogs);
  const getRowEffectiveKml = (log: FuelLogEntry) => {
    const recordedKml = getRecordedFuelKml(log);
    if (recordedKml > 0) return recordedKml;
    const prevOdo = prevOdoById.get(log.id);
    const derivedDistance =
      prevOdo !== undefined && log.odometer > prevOdo ? log.odometer - prevOdo : 0;
    const displayDistance = derivedDistance > 0 ? derivedDistance : log.distance;
    return computeFuelKmlFromFormula(displayDistance, log.liters);
  };
  const isRowSkippedOrPartial = (log: FuelLogEntry) => {
    const kml = getRowEffectiveKml(log);
    return (
      kml === 0 ||
      isFuelKmlOutOfRange(kml) ||
      isFuelLitersOverTank(log.liters, tankCapacityLiters)
    );
  };
  const skippedOrPartialCount = sortedLogs.filter(isRowSkippedOrPartial).length;
  const visibleLogs =
    onlyOutliers && skippedOrPartialCount > 0
      ? sortedLogs.filter(isRowSkippedOrPartial)
      : sortedLogs;

  const totalEffectiveDistance = sortedLogs.reduce((sum, log) => {
    const prevOdo = prevOdoById.get(log.id);
    const derived =
      prevOdo !== undefined && log.odometer > prevOdo ? log.odometer - prevOdo : 0;
    return sum + (derived > 0 ? derived : log.distance);
  }, 0);

  async function handleRecalculateAll() {
    if (!onRecalculateAllFuelLogs || reconciling) return;
    setReconciling(true);
    try {
      await onRecalculateAllFuelLogs();
      setReconciledBanner('อัปเดตระยะทางและ กม./ลิตร จากเลขไมล์จริงครบทุกรายการแล้ว');
      window.setTimeout(() => setReconciledBanner(null), 4000);
    } finally {
      setReconciling(false);
    }
  }

  return (
    <section aria-labelledby="fuel-history-heading" className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h2
            id="fuel-history-heading"
            className="font-display text-xl sm:text-2xl font-semibold text-slate-900 flex items-center gap-2"
          >
            <Fuel className="w-5 h-5 text-emerald-700 shrink-0" aria-hidden="true" />
            <span>ประวัติการเติมน้ำมันเชื้อเพลิง</span>
          </h2>
          <p className="text-sm text-slate-600 mt-0.5">
            รอบปกติ ({MIN_REALISTIC_KML}–{MAX_REALISTIC_KML} กม./ลิตร) นำมาคิดค่าเฉลี่ย · รอบไม่เต็มถัง / ข้ามรอบ แสดงเป็นค่าเฉลี่ยรวมแทนตัวเลขที่เพี้ยน โดยยังนับระยะทางและยอดเงินจริงครบ ·{' '}
            <span className="font-mono tabular-nums text-slate-800">
              {sortedLogs.length} รอบ · รวม {formatKm(totalEffectiveDistance)} กม.
            </span>
          </p>
          {reconciledBanner && (
            <p
              role="status"
              className="text-xs font-medium text-emerald-700 mt-1"
            >
              {reconciledBanner}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          {onRecalculateAllFuelLogs && reconcileSummary.mismatchedCount > 0 && (
            <button
              type="button"
              onClick={handleRecalculateAll}
              disabled={reconciling}
              data-testid="reconcile-fuel-logs-btn"
              className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 rounded-lg border border-blue-300 bg-blue-50 hover:bg-blue-100 disabled:opacity-60 text-blue-900 text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Calculator className="w-4 h-4 text-blue-700 shrink-0" aria-hidden="true" />
              <span>
                {reconciling
                  ? 'กำลังคำนวณ...'
                  : `เติมระยะทาง & กม./ลิตร ที่ขาด (${reconcileSummary.mismatchedCount})`}
              </span>
            </button>
          )}

          {skippedOrPartialCount > 0 && (
            <button
              type="button"
              onClick={() => setOnlyOutliers((prev) => !prev)}
              aria-pressed={onlyOutliers}
              className={`inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 rounded-lg border text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                onlyOutliers
                  ? 'border-slate-600 bg-slate-100 text-slate-900'
                  : 'border-slate-300 bg-white hover:bg-slate-50 text-slate-700'
              }`}
            >
              <AlertTriangle className="w-4 h-4 text-slate-500 shrink-0" aria-hidden="true" />
              <span>
                {onlyOutliers
                  ? 'แสดงทั้งหมด'
                  : `เฉพาะไม่เต็มถัง / ข้ามรอบ (${skippedOrPartialCount})`}
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={onOpenAddFuel}
            className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>บันทึกเติมน้ำมัน</span>
          </button>
        </div>
      </div>

      {visibleLogs.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-3">
          <p className="text-sm text-slate-600">ยังไม่มีประวัติการเติมน้ำมันเชื้อเพลิง</p>
          <button
            type="button"
            onClick={onOpenAddFuel}
            className="px-4 py-2 min-h-[40px] rounded-lg bg-emerald-700 text-white text-sm font-medium hover:bg-emerald-800 cursor-pointer"
          >
            บันทึกการเติมครั้งแรก
          </button>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                  <th className="py-3 px-4 whitespace-nowrap">วันที่</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">เลขไมล์ (กม.)</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">ระยะทาง (กม.)</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">ยอดเงิน (บาท)</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">ปริมาณ (ลิตร)</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">ราคา/ลิตร</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">อัตราสิ้นเปลือง</th>
                  <th className="py-3 px-4">ปั๊ม / เชื้อเพลิง</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {visibleLogs.map((log) => {
                  const isConfirming = confirmDeleteId === log.id;
                  const recordedKml = getRecordedFuelKml(log);
                  const isOverTank = isFuelLitersOverTank(log.liters, tankCapacityLiters);
                  const prevOdo = prevOdoById.get(log.id);
                  const derivedDistance =
                    prevOdo !== undefined && log.odometer > prevOdo
                      ? log.odometer - prevOdo
                      : 0;
                  const displayDistance =
                    derivedDistance > 0 ? derivedDistance : log.distance;
                  const formulaKml = computeFuelKmlFromFormula(
                    displayDistance,
                    log.liters
                  );
                  const hasRecordedActualKml = recordedKml > 0;
                  const effectiveDisplayKml = hasRecordedActualKml ? recordedKml : formulaKml;
                  const isPartialOrSkipped =
                    effectiveDisplayKml === 0 || isFuelKmlOutOfRange(effectiveDisplayKml);
                  const kmlClass = isPartialOrSkipped
                    ? 'text-slate-500'
                    : effectiveDisplayKml >= 14
                      ? 'text-emerald-700'
                      : effectiveDisplayKml >= 11
                        ? 'text-blue-700'
                        : 'text-amber-700';

                  return (
                    <tr
                      key={log.id}
                      data-testid={`fuel-row-${log.id}`}
                      className={`transition-colors ${
                        isOverTank
                          ? 'bg-amber-50/50 hover:bg-amber-50'
                          : 'hover:bg-slate-50/80'
                      }`}
                    >
                      <td className="py-3.5 px-4 whitespace-nowrap text-slate-700 font-mono text-xs sm:text-sm tabular-nums">
                        {formatThaiDate(log.date, 'short')}
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap font-mono tabular-nums text-slate-900">
                        {formatKm(log.odometer)}
                      </td>
                      <td
                        data-testid={`fuel-distance-${log.id}`}
                        className="py-3.5 px-4 text-right whitespace-nowrap font-mono tabular-nums text-slate-800 font-medium"
                      >
                        +{formatKm(displayDistance)}
                        {prevOdo !== undefined && (
                          <span className="block text-[11px] font-normal text-slate-400">
                            {log.distance === 0 && derivedDistance > 0
                              ? `จากไมล์ ${formatKm(prevOdo)}`
                              : log.distance !== derivedDistance && derivedDistance > 0
                                ? `เดิม +${formatKm(log.distance)}`
                                : `ไมล์ก่อน ${formatKm(prevOdo)}`}
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap font-mono tabular-nums font-semibold text-slate-900">
                        {formatBaht(log.amount, 2)}
                      </td>
                      <td
                        className={`py-3.5 px-4 text-right whitespace-nowrap font-mono tabular-nums ${
                          isOverTank ? 'text-red-700 font-semibold' : 'text-slate-600'
                        }`}
                      >
                        {log.liters.toFixed(3)}
                        {isOverTank && (
                          <span className="block font-sans text-[11px] font-medium text-amber-700">
                            เกิน {tankCapacityLiters} ล.
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap font-mono tabular-nums text-slate-600">
                        {log.pricePerLiter.toFixed(2)}
                      </td>
                      <td
                        data-testid={`fuel-kml-${log.id}`}
                        className={`py-3.5 px-4 text-right whitespace-nowrap font-mono tabular-nums font-semibold ${kmlClass}`}
                      >
                        {isPartialOrSkipped ? (
                          <span
                            data-testid={`fuel-kml-skipped-${log.id}`}
                            title={
                              effectiveDisplayKml > 0
                                ? `คำนวณเบื้องต้นได้ ${effectiveDisplayKml.toFixed(2)} กม./ล. (อยู่นอกช่วงปกติ ${MIN_REALISTIC_KML}–${MAX_REALISTIC_KML} กม./ล.) · แสดงเป็นค่าเฉลี่ยรวมแทน`
                                : 'ไม่ได้ระบุอัตราสิ้นเปลืองหรือไม่ได้เติมเต็มถัง · แสดงเป็นค่าเฉลี่ยรวมแทน'
                            }
                            className="font-sans text-xs sm:text-sm font-medium text-slate-500"
                          >
                            {averageKml > 0 ? (
                              <>
                                <span className="font-mono tabular-nums font-semibold text-slate-700">
                                  ≈{averageKml.toFixed(2)} กม./ล.
                                </span>
                                <span className="block font-sans text-[11px] font-normal text-slate-500">
                                  ไม่เต็มถัง / ข้ามรอบ · ใช้ค่าเฉลี่ย
                                </span>
                              </>
                            ) : (
                              'ไม่เต็มถัง / ข้ามรอบ'
                            )}
                          </span>
                        ) : (
                          <>
                            {effectiveDisplayKml.toFixed(2)} กม./ล.
                            {!hasRecordedActualKml && displayDistance > 0 && log.liters > 0 && (
                              <span className="block font-mono text-[11px] font-normal text-slate-500">
                                คำนวณ {formatKm(displayDistance)} ÷ {log.liters.toFixed(2)}
                              </span>
                            )}
                          </>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-xs sm:text-sm text-slate-700 min-w-[160px]">
                        {log.note}
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        {isConfirming ? (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={async () => {
                                await onDeleteFuelLog(log.id);
                                setConfirmDeleteId(null);
                              }}
                              className="px-2.5 py-1.5 rounded bg-red-600 hover:bg-red-700 text-white text-xs font-medium cursor-pointer"
                            >
                              ยืนยันลบ
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-2.5 py-1.5 rounded border border-slate-300 bg-white text-slate-700 text-xs font-medium cursor-pointer"
                            >
                              ยกเลิก
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => onEditFuelLog(log)}
                              aria-label={`แก้ไขรายการเติมน้ำมันวันที่ ${formatThaiDate(log.date, 'short')}`}
                              className="p-2 rounded-md text-slate-500 hover:text-blue-700 hover:bg-blue-50 transition-colors cursor-pointer"
                            >
                              <Pencil className="w-4 h-4" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(log.id)}
                              aria-label={`ลบรายการเติมน้ำมันวันที่ ${formatThaiDate(log.date, 'short')}`}
                              className="p-2 rounded-md text-slate-500 hover:text-red-700 hover:bg-red-50 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" aria-hidden="true" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
