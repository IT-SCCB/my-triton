import { useEffect, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  Calculator,
  CheckCircle2,
  Fuel,
  Gauge,
  RotateCcw,
  Route,
  X,
} from 'lucide-react';
import type { FuelAnalyticsSummary } from '../types/maintenance';
import {
  computeFuelTripCostEstimate,
  FUEL_CALCULATOR_BUFFER_OPTIONS,
  FUEL_CALCULATOR_DISTANCE_PRESETS,
} from '../utils/fuelCalculator';
import { formatBaht, formatKm } from '../utils/maintenance';

interface FuelCalculatorProps {
  isOpen: boolean;
  fuelStats: FuelAnalyticsSummary;
  tankCapacityLiters: number;
  fuelPercent: number;
  onClose: () => void;
}

export function FuelCalculator({
  isOpen,
  fuelStats,
  tankCapacityLiters,
  fuelPercent,
  onClose,
}: FuelCalculatorProps) {
  const defaultKml = fuelStats.avgKml > 0 ? fuelStats.avgKml : 12.67;
  const defaultPrice = fuelStats.lastPricePerLiter > 0 ? fuelStats.lastPricePerLiter : 33.55;

  const [plannedDistance, setPlannedDistance] = useState('150');
  const [expectedFuelPrice, setExpectedFuelPrice] = useState(defaultPrice.toFixed(2));
  const [kmlSource, setKmlSource] = useState<'historical_avg' | 'latest' | 'custom'>(
    'historical_avg'
  );
  const [customKml, setCustomKml] = useState(defaultKml.toFixed(2));
  const [roundTrip, setRoundTrip] = useState(false);
  const [bufferPercent, setBufferPercent] = useState<number>(0);

  useEffect(() => {
    if (!isOpen) return;
    setExpectedFuelPrice(defaultPrice.toFixed(2));
    setCustomKml(defaultKml.toFixed(2));
  }, [isOpen, defaultPrice, defaultKml]);

  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const selectedKml =
    kmlSource === 'historical_avg'
      ? defaultKml
      : kmlSource === 'latest'
        ? fuelStats.lastKml > 0
          ? fuelStats.lastKml
          : defaultKml
        : Number(customKml.replace(/,/g, '')) || 0;

  const numDistance = Number(plannedDistance.replace(/,/g, '')) || 0;
  const numPrice = Number(expectedFuelPrice.replace(/,/g, '')) || 0;

  const estimate = computeFuelTripCostEstimate({
    plannedDistanceKm: numDistance,
    expectedFuelPrice: numPrice,
    historicalAvgKml: selectedKml,
    roundTrip,
    bufferPercent,
    currentTankLiters: fuelStats.approxTankLiters,
  });

  function handleReset() {
    setPlannedDistance('150');
    setExpectedFuelPrice(defaultPrice.toFixed(2));
    setKmlSource('historical_avg');
    setCustomKml(defaultKml.toFixed(2));
    setRoundTrip(false);
    setBufferPercent(0);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="fuel-calculator-modal-title"
      data-testid="fuel-calculator-modal"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400 shrink-0">
              <Calculator className="w-5 h-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2
                id="fuel-calculator-modal-title"
                className="font-display text-lg font-bold text-slate-900 dark:text-slate-100 truncate"
              >
                คำนวณค่าน้ำมันทริป (Fuel Calculator)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                ประมาณการค่าใช้จ่ายจากการเดินทางจริงด้วยอัตราสิ้นเปลืองเฉลี่ยสะสม
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดหน้าต่างคำนวณค่าน้ำมัน"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:text-slate-200 dark:hover:bg-slate-800 cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="overflow-y-auto p-5 space-y-5" noValidate>
          {/* Historical KML Baseline Banner */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-3.5 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Gauge className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" aria-hidden="true" />
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  ฐานอัตราสิ้นเปลืองที่ใช้คำนวณ
                </span>
              </div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                ถังปัจจุบัน {fuelPercent}% (~{fuelStats.approxTankLiters.toFixed(1)} / {tankCapacityLiters} ล.)
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setKmlSource('historical_avg')}
                data-testid="fuel-calc-kml-avg-btn"
                className={`px-3 py-2 rounded-lg border text-left transition-colors cursor-pointer ${
                  kmlSource === 'historical_avg'
                    ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-900 dark:text-emerald-200'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300'
                }`}
              >
                <span className="block text-[11px] opacity-80">ค่าเฉลี่ยสะสมจริง</span>
                <span className="font-mono text-sm font-bold tabular-nums">
                  {defaultKml.toFixed(2)} กม./ล.
                </span>
              </button>

              <button
                type="button"
                onClick={() => setKmlSource('latest')}
                data-testid="fuel-calc-kml-latest-btn"
                className={`px-3 py-2 rounded-lg border text-left transition-colors cursor-pointer ${
                  kmlSource === 'latest'
                    ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/50 text-blue-900 dark:text-blue-200'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300'
                }`}
              >
                <span className="block text-[11px] opacity-80">รอบเติมล่าสุด</span>
                <span className="font-mono text-sm font-bold tabular-nums">
                  {(fuelStats.lastKml > 0 ? fuelStats.lastKml : defaultKml).toFixed(2)} กม./ล.
                </span>
              </button>

              <button
                type="button"
                onClick={() => setKmlSource('custom')}
                data-testid="fuel-calc-kml-custom-btn"
                className={`px-3 py-2 rounded-lg border text-left transition-colors cursor-pointer ${
                  kmlSource === 'custom'
                    ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/50 text-blue-900 dark:text-blue-200'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300'
                }`}
              >
                <span className="block text-[11px] opacity-80">กำหนดเอง</span>
                <span className="font-mono text-sm font-bold tabular-nums">
                  {kmlSource === 'custom' ? `${customKml || '0'} กม./ล.` : 'ปรับค่าเอง'}
                </span>
              </button>
            </div>

            {kmlSource === 'custom' && (
              <div>
                <label
                  htmlFor="fuel-calc-custom-kml"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  อัตราสิ้นเปลืองที่ต้องการทดลองคำนวณ (กม./ลิตร)
                </label>
                <input
                  id="fuel-calc-custom-kml"
                  type="number"
                  min="1"
                  max="50"
                  step="0.01"
                  value={customKml}
                  onChange={(e) => setCustomKml(e.target.value)}
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
            )}
          </div>

          {/* Distance & Fuel Price Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label
                htmlFor="fuel-calc-distance"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                ระยะทางที่วางแผน (กม.) <span className="text-red-600">*</span>
              </label>
              <div className="relative">
                <Route
                  className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  id="fuel-calc-distance"
                  type="number"
                  min="1"
                  step="any"
                  value={plannedDistance}
                  onChange={(e) => setPlannedDistance(e.target.value)}
                  data-testid="fuel-calc-distance-input"
                  placeholder="เช่น 150"
                  className="w-full min-h-[42px] pl-9 pr-12 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
                <span className="text-xs text-slate-500 dark:text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                  กม.
                </span>
              </div>

              <div className="flex flex-wrap gap-1.5 pt-1">
                {FUEL_CALCULATOR_DISTANCE_PRESETS.map((presetKm) => (
                  <button
                    key={presetKm}
                    type="button"
                    onClick={() => setPlannedDistance(String(presetKm))}
                    className={`px-2 py-1 rounded text-[11px] font-mono tabular-nums transition-colors cursor-pointer ${
                      numDistance === presetKm
                        ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-semibold'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    {presetKm}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="fuel-calc-price"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                ราคาน้ำมันที่คาดการณ์ (บาท/ลิตร) <span className="text-red-600">*</span>
              </label>
              <div className="relative">
                <Fuel
                  className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  id="fuel-calc-price"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={expectedFuelPrice}
                  onChange={(e) => setExpectedFuelPrice(e.target.value)}
                  data-testid="fuel-calc-price-input"
                  placeholder="33.55"
                  className="w-full min-h-[42px] pl-9 pr-14 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
                <span className="text-xs text-slate-500 dark:text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                  บ./ล.
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                อ้างอิงราคาล่าสุดจากประวัติ: {defaultPrice.toFixed(2)} บาท/ลิตร
              </p>
            </div>
          </div>

          {/* Round-trip & Reserve Options */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={roundTrip}
                onChange={(e) => setRoundTrip(e.target.checked)}
                data-testid="fuel-calc-roundtrip-checkbox"
                className="rounded border-slate-300 dark:border-slate-600 text-blue-700 focus:ring-blue-600"
              />
              <span>คำนวณไป-กลับ (×2 ระยะทาง)</span>
            </label>

            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-600 dark:text-slate-400">เผื่อสำรอง:</span>
              {FUEL_CALCULATOR_BUFFER_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setBufferPercent(opt)}
                  className={`px-2.5 py-1 rounded-md text-xs font-mono tabular-nums transition-colors cursor-pointer ${
                    bufferPercent === opt
                      ? 'bg-blue-700 dark:bg-blue-600 text-white font-semibold'
                      : 'border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  +{opt}%
                </button>
              ))}
            </div>
          </div>

          {/* Result Card */}
          {!estimate.valid ? (
            <div
              role="alert"
              className="rounded-xl border border-amber-200 dark:border-amber-800/70 bg-amber-50 dark:bg-amber-950/40 px-4 py-3 text-xs text-amber-900 dark:text-amber-200"
            >
              {estimate.error}
            </div>
          ) : (
            <div
              data-testid="fuel-calc-result-card"
              className="rounded-xl bg-slate-900 dark:bg-slate-950 border border-slate-800 text-white p-4 sm:p-5 space-y-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-slate-400">
                    ประมาณการค่าน้ำมันทริป ({formatKm(estimate.effectiveDistanceKm)} กม.
                    {roundTrip ? ' · ไป-กลับ' : ''}
                    {bufferPercent > 0 ? ` · เผื่อ +${bufferPercent}%` : ''})
                  </p>
                  <p
                    data-testid="fuel-calc-total-cost"
                    className="font-mono text-3xl sm:text-4xl font-bold text-emerald-400 tabular-nums mt-1"
                  >
                    {formatBaht(estimate.estimatedTotalCostBaht)}{' '}
                    <span className="text-sm font-sans font-normal text-slate-300">บาท</span>
                  </p>
                </div>

                <div className="text-left sm:text-right">
                  <p className="text-xs text-slate-400">ปริมาณน้ำมันที่ใช้</p>
                  <p
                    data-testid="fuel-calc-liters-needed"
                    className="font-mono text-xl font-semibold text-white tabular-nums mt-0.5"
                  >
                    {estimate.bufferedLitersNeeded.toFixed(2)}{' '}
                    <span className="text-xs font-sans font-normal text-slate-300">ลิตร</span>
                  </p>
                  <p className="text-[11px] font-mono tabular-nums text-slate-400">
                    เฉลี่ย {estimate.costPerKm.toFixed(2)} บ./กม. · {estimate.effectiveKml.toFixed(2)} กม./ล.
                  </p>
                </div>
              </div>

              <div
                className={`rounded-lg px-3 py-2.5 text-xs flex items-start gap-2 ${
                  estimate.canCompleteWithCurrentFuel
                    ? 'bg-emerald-950/60 border border-emerald-800/70 text-emerald-200'
                    : 'bg-amber-950/60 border border-amber-800/70 text-amber-200'
                }`}
              >
                {estimate.canCompleteWithCurrentFuel ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />
                    <span>
                      น้ำมันในถังตอนนี้ (~{estimate.currentTankLiters.toFixed(1)} ลิตร) เพียงพอสำหรับทริปนี้
                      (เหลือสำรองหลังจบทริปประมาณ{' '}
                      <strong className="font-mono tabular-nums">
                        {(estimate.currentTankLiters - estimate.bufferedLitersNeeded).toFixed(1)} ลิตร
                      </strong>
                      )
                    </span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
                    <span>
                      ต้องเติมน้ำมันเพิ่มอีกอย่างน้อย{' '}
                      <strong className="font-mono tabular-nums">
                        {estimate.additionalLitersNeeded.toFixed(1)} ลิตร
                      </strong>{' '}
                      (ประมาณ{' '}
                      <strong className="font-mono tabular-nums">
                        {formatBaht(estimate.additionalRefuelCostBaht)} บาท
                      </strong>
                      ) จากที่มีอยู่ในถัง ~{estimate.currentTankLiters.toFixed(1)} ลิตร
                    </span>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Footer actions */}
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>รีเซ็ตค่า</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="min-h-[38px] px-4 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-white text-white dark:text-slate-900 text-xs sm:text-sm font-medium cursor-pointer"
            >
              ปิดหน้าต่าง
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export const FuelCalculatorModal = FuelCalculator;
