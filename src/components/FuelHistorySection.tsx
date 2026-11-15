import { useState } from 'react';
import { AlertTriangle, Fuel, Pencil, Plus, Trash2 } from 'lucide-react';
import type { FuelLogEntry } from '../types/maintenance';
import {
  computeFuelKmlFromFormula,
  formatBaht,
  formatKm,
  formatThaiDate,
  isFuelKmlSpike,
  isFuelLitersOverTank,
  sortFuelLogsChronological,
  sortFuelLogsNewestFirst,
} from '../utils/maintenance';

interface FuelHistorySectionProps {
  fuelLogs: FuelLogEntry[];
  tankCapacityLiters?: number;
  onOpenAddFuel: () => void;
  onEditFuelLog: (log: FuelLogEntry) => void;
  onDeleteFuelLog: (id: string) => Promise<void>;
}

export function FuelHistorySection({
  fuelLogs,
  tankCapacityLiters = 75,
  onOpenAddFuel,
  onEditFuelLog,
  onDeleteFuelLog,
}: FuelHistorySectionProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [onlyOutliers, setOnlyOutliers] = useState(false);

  const chronological = sortFuelLogsChronological(fuelLogs);
  const prevOdoById = new Map<string, number>();
  for (let i = 1; i < chronological.length; i++) {
    prevOdoById.set(chronological[i].id, chronological[i - 1].odometer);
  }

  const sortedLogs = sortFuelLogsNewestFirst(fuelLogs);
  const isRowAnomaly = (log: FuelLogEntry) =>
    isFuelKmlSpike(log.kml) || isFuelLitersOverTank(log.liters, tankCapacityLiters);
  const outlierCount = sortedLogs.filter(isRowAnomaly).length;
  const visibleLogs =
    onlyOutliers && outlierCount > 0
      ? sortedLogs.filter(isRowAnomaly)
      : sortedLogs;

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
            สูตรคำนวณ: ระยะทางวิ่ง (ไมล์รอบนี้ − ไมล์รอบก่อน) ÷ ปริมาณ (ลิตร) = กม./ลิตร ({sortedLogs.length} รอบ)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          {outlierCount > 0 && (
            <button
              type="button"
              onClick={() => setOnlyOutliers((prev) => !prev)}
              aria-pressed={onlyOutliers}
              className={`inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 rounded-lg border text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                onlyOutliers
                  ? 'border-amber-500 bg-amber-50 text-amber-900'
                  : 'border-amber-300 bg-white hover:bg-amber-50 text-amber-800'
              }`}
            >
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" aria-hidden="true" />
              <span>
                {onlyOutliers ? 'แสดงทั้งหมด' : `กรองค่าผิดปกติ (${outlierCount})`}
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
                  <th className="py-3 px-4 text-right whitespace-nowrap">ระยะทาง</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">ยอดเงิน (บาท)</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">ปริมาณ (ลิตร)</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">ราคา/ลิตร</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">อัตราสิ้นเปลือง (ระยะ ÷ ลิตร)</th>
                  <th className="py-3 px-4">ปั๊ม / เชื้อเพลิง</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {visibleLogs.map((log) => {
                  const isConfirming = confirmDeleteId === log.id;
                  const isSpike = isFuelKmlSpike(log.kml);
                  const isOverTank = isFuelLitersOverTank(log.liters, tankCapacityLiters);
                  const prevOdo = prevOdoById.get(log.id);
                  const inferredDistance =
                    log.distance > 0
                      ? log.distance
                      : prevOdo !== undefined && log.odometer > prevOdo
                        ? log.odometer - prevOdo
                        : 0;
                  const formulaKml = computeFuelKmlFromFormula(
                    inferredDistance,
                    log.liters
                  );
                  const kmlClass = isSpike
                    ? 'text-red-700'
                    : log.kml >= 14
                      ? 'text-emerald-700'
                      : log.kml >= 11
                        ? 'text-blue-700'
                        : 'text-amber-700';

                  return (
                    <tr
                      key={log.id}
                      className={`transition-colors ${
                        isSpike || isOverTank
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
                      <td className="py-3.5 px-4 text-right whitespace-nowrap font-mono tabular-nums text-slate-600">
                        +{formatKm(log.distance)}
                        {log.distance === 0 && inferredDistance > 0 && (
                          <span className="block text-[11px] text-slate-400">
                            จากไมล์ +{formatKm(inferredDistance)}
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
                        className={`py-3.5 px-4 text-right whitespace-nowrap font-mono tabular-nums font-semibold ${kmlClass}`}
                      >
                        {log.kml.toFixed(2)} กม./ล.
                        {inferredDistance > 0 && log.liters > 0 && (
                          <span className="block font-mono text-[11px] font-normal text-slate-500">
                            {formatKm(inferredDistance)} ÷ {log.liters.toFixed(2)} = {formulaKml.toFixed(2)}
                          </span>
                        )}
                        {isSpike && (
                          <span className="block font-sans text-[11px] font-medium text-amber-700">
                            ค่าผิดปกติ
                          </span>
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
