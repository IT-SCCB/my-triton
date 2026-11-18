import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  CheckCircle2,
  Fuel,
  Gauge,
  MapPin,
  RotateCcw,
  Route,
  Sparkles,
  Wrench,
} from 'lucide-react';
import type {
  FuelAnalyticsSummary,
  MaintenanceScheduleItem,
} from '../types/maintenance';
import { formatBaht, formatKm } from '../utils/maintenance';
import {
  calculateTripEstimate,
  DRIVING_CONDITION_CONFIG,
  evaluateTripMaintenanceImpacts,
  TRIP_PRESET_ROUTES,
  type DrivingCondition,
  type TripPlanEstimate,
} from '../utils/tripPlanner';

interface TripPlannerSectionProps {
  currentOdometer: number;
  fuelPercent: number;
  tankCapacityLiters: number;
  fuelStats: FuelAnalyticsSummary;
  schedules: MaintenanceScheduleItem[];
  alertThresholdKm: number;
  onTripEstimateChange?: (estimate: TripPlanEstimate) => void;
  onAskAiAboutTrip?: (estimate: TripPlanEstimate) => void;
}

const BUFFER_OPTIONS = [0, 10, 15, 20] as const;

export function TripPlannerSection({
  currentOdometer,
  fuelPercent,
  tankCapacityLiters,
  fuelStats,
  schedules,
  alertThresholdKm,
  onTripEstimateChange,
  onAskAiAboutTrip,
}: TripPlannerSectionProps) {
  const defaultKml = fuelStats.avgKml > 0 ? fuelStats.avgKml : 12.67;
  const defaultPrice = fuelStats.lastPricePerLiter > 0 ? fuelStats.lastPricePerLiter : 33.55;

  const [selectedPresetId, setSelectedPresetId] = useState<string>(TRIP_PRESET_ROUTES[0].id);
  const [routeName, setRouteName] = useState<string>(TRIP_PRESET_ROUTES[0].label);
  const [oneWayKmInput, setOneWayKmInput] = useState<string>(String(TRIP_PRESET_ROUTES[0].oneWayKm));
  const [roundTrip, setRoundTrip] = useState<boolean>(true);
  const [drivingCondition, setDrivingCondition] = useState<DrivingCondition>('mixed');
  const [kmlInput, setKmlInput] = useState<string>(defaultKml.toFixed(2));
  const [kmlDirty, setKmlDirty] = useState<boolean>(false);
  const [priceInput, setPriceInput] = useState<string>(defaultPrice.toFixed(2));
  const [priceDirty, setPriceDirty] = useState<boolean>(false);
  const [bufferPercent, setBufferPercent] = useState<number>(10);
  const [extraCostInput, setExtraCostInput] = useState<string>('0');

  useEffect(() => {
    if (!kmlDirty && fuelStats.avgKml > 0) {
      setKmlInput(fuelStats.avgKml.toFixed(2));
    }
  }, [fuelStats.avgKml, kmlDirty]);

  useEffect(() => {
    if (!priceDirty && fuelStats.lastPricePerLiter > 0) {
      setPriceInput(fuelStats.lastPricePerLiter.toFixed(2));
    }
  }, [fuelStats.lastPricePerLiter, priceDirty]);

  const parsedOneWay = Math.max(0, Number(oneWayKmInput) || 0);
  const parsedBaseKml = Math.max(1, Number(kmlInput) || defaultKml);
  const parsedPrice = Math.max(0, Number(priceInput) || 0);
  const parsedExtraCost = Math.max(0, Number(extraCostInput) || 0);

  const estimate = useMemo(
    () =>
      calculateTripEstimate({
        routeName,
        oneWayDistanceKm: parsedOneWay,
        roundTrip,
        baseKml: parsedBaseKml,
        drivingCondition,
        fuelPricePerLiter: parsedPrice,
        bufferPercent,
        extraCostBaht: parsedExtraCost,
        currentOdometer,
        tankCapacityLiters,
        fuelPercent,
      }),
    [
      routeName,
      parsedOneWay,
      roundTrip,
      parsedBaseKml,
      drivingCondition,
      parsedPrice,
      bufferPercent,
      parsedExtraCost,
      currentOdometer,
      tankCapacityLiters,
      fuelPercent,
    ]
  );

  useEffect(() => {
    onTripEstimateChange?.(estimate);
  }, [estimate, onTripEstimateChange]);

  const maintenanceImpacts = useMemo(
    () => evaluateTripMaintenanceImpacts(schedules, estimate.totalDistanceKm, alertThresholdKm),
    [schedules, estimate.totalDistanceKm, alertThresholdKm]
  );

  const tankCoverageRatio =
    estimate.totalDistanceKm > 0
      ? Math.min(100, Math.round((estimate.estimatedCurrentRangeKm / estimate.totalDistanceKm) * 100))
      : 100;

  function handleSelectPreset(presetId: string) {
    const preset = TRIP_PRESET_ROUTES.find((p) => p.id === presetId);
    if (!preset) return;
    setSelectedPresetId(preset.id);
    setRouteName(preset.label);
    setOneWayKmInput(String(preset.oneWayKm));
  }

  return (
    <section aria-labelledby="trip-planner-heading" className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h2
            id="trip-planner-heading"
            className="font-display text-xl sm:text-2xl font-semibold text-slate-900 flex items-center gap-2"
          >
            <Route className="w-5 h-5 text-blue-700 shrink-0" aria-hidden="true" />
            <span>คำนวณค่าน้ำมัน & วางแผนเดินทาง</span>
          </h2>
          <p className="text-sm text-slate-600 mt-0.5">
            ประเมินค่าน้ำมัน จำนวนลิตร จุดแวะเติม และเช็กผลกระทบต่อรอบซ่อมบำรุงล่วงหน้า จากค่าเฉลี่ย{' '}
            <span className="font-mono tabular-nums font-medium text-slate-800">
              {defaultKml.toFixed(2)} กม./ลิตร
            </span>{' '}
            · ราคาล่าสุด{' '}
            <span className="font-mono tabular-nums font-medium text-slate-800">
              {defaultPrice.toFixed(2)} บ./ลิตร
            </span>
          </p>
        </div>

        {onAskAiAboutTrip && (
          <button
            type="button"
            onClick={() => onAskAiAboutTrip(estimate)}
            data-testid="trip-ask-ai-btn"
            className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-4 py-2 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-900 text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer self-start sm:self-auto"
          >
            <Sparkles className="w-4 h-4 text-blue-700 shrink-0" aria-hidden="true" />
            <span>ปรึกษา AI เรื่องทริปนี้</span>
          </button>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {/* Preset Routes Strip */}
        <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-600 mr-1 flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
            เส้นทางยอดนิยม:
          </span>
          {TRIP_PRESET_ROUTES.map((preset) => {
            const active = selectedPresetId === preset.id && routeName === preset.label;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleSelectPreset(preset.id)}
                data-testid={`trip-preset-${preset.id}`}
                className={`px-3 py-1.5 min-h-[34px] rounded-lg border text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  active
                    ? 'border-blue-700 bg-blue-700 text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                }`}
              >
                {preset.label}{' '}
                <span className={`font-mono tabular-nums ${active ? 'text-blue-100' : 'text-slate-400'}`}>
                  ({preset.oneWayKm} กม.)
                </span>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
          {/* Left: Inputs */}
          <div className="lg:col-span-6 p-5 sm:p-6 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label
                  htmlFor="trip-route-name"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  ชื่อทริป / เส้นทาง
                </label>
                <input
                  id="trip-route-name"
                  type="text"
                  value={routeName}
                  onChange={(e) => {
                    setRouteName(e.target.value);
                    setSelectedPresetId('');
                  }}
                  placeholder="เช่น กรุงเทพฯ – เชียงใหม่"
                  className="w-full min-h-[40px] px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div>
                <label
                  htmlFor="trip-oneway-km"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  ระยะทางขาเดียว (กม.)
                </label>
                <input
                  id="trip-oneway-km"
                  type="number"
                  min="1"
                  max="10000"
                  step="1"
                  value={oneWayKmInput}
                  onChange={(e) => {
                    setOneWayKmInput(e.target.value);
                    setSelectedPresetId('');
                  }}
                  data-testid="trip-distance-input"
                  className="w-full min-h-[40px] px-3 py-2 rounded-lg border border-slate-300 font-mono text-sm tabular-nums text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div>
                <span className="block text-xs font-medium text-slate-700 mb-1.5">
                  รูปแบบการเดินทาง
                </span>
                <div
                  role="group"
                  aria-label="รูปแบบการเดินทาง"
                  className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-lg"
                >
                  <button
                    type="button"
                    onClick={() => setRoundTrip(false)}
                    data-testid="trip-mode-oneway"
                    className={`min-h-[34px] px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                      !roundTrip
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    เที่ยวเดียว
                  </button>
                  <button
                    type="button"
                    onClick={() => setRoundTrip(true)}
                    data-testid="trip-mode-roundtrip"
                    className={`inline-flex items-center justify-center gap-1 min-h-[34px] px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                      roundTrip
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <ArrowLeftRight className="w-3.5 h-3.5 text-blue-700" aria-hidden="true" />
                    <span>ไป-กลับ (×2)</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Driving Conditions */}
            <div className="space-y-2">
              <span className="block text-xs font-medium text-slate-700">
                สภาพเส้นทางและการขับขี่
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {(Object.keys(DRIVING_CONDITION_CONFIG) as DrivingCondition[]).map((key) => {
                  const cfg = DRIVING_CONDITION_CONFIG[key];
                  const active = drivingCondition === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setDrivingCondition(key)}
                      data-testid={`trip-condition-${key}`}
                      className={`text-left p-3 rounded-lg border transition-colors cursor-pointer ${
                        active
                          ? 'border-blue-700 bg-blue-50/70'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <p className={`text-xs font-semibold ${active ? 'text-blue-900' : 'text-slate-800'}`}>
                        {cfg.label}
                      </p>
                      <p className={`font-mono text-[11px] tabular-nums mt-0.5 ${active ? 'text-blue-700 font-medium' : 'text-slate-500'}`}>
                        {cfg.adjustmentLabel}
                      </p>
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-slate-500">
                {DRIVING_CONDITION_CONFIG[drivingCondition].description}
              </p>
            </div>

            {/* KML & Fuel Price */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <label
                    htmlFor="trip-base-kml"
                    className="text-xs font-medium text-slate-700"
                  >
                    อัตราสิ้นเปลืองตั้งต้น (กม./ลิตร)
                  </label>
                  {kmlDirty && (
                    <button
                      type="button"
                      onClick={() => {
                        setKmlDirty(false);
                        setKmlInput(defaultKml.toFixed(2));
                      }}
                      className="inline-flex items-center gap-1 text-[11px] text-blue-700 hover:text-blue-800 font-medium cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" aria-hidden="true" />
                      <span>ค่าเฉลี่ย ({defaultKml.toFixed(2)})</span>
                    </button>
                  )}
                </div>
                <input
                  id="trip-base-kml"
                  type="number"
                  min="4"
                  max="30"
                  step="0.01"
                  value={kmlInput}
                  onChange={(e) => {
                    setKmlDirty(true);
                    setKmlInput(e.target.value);
                  }}
                  data-testid="trip-kml-input"
                  className="w-full min-h-[40px] px-3 py-2 rounded-lg border border-slate-300 font-mono text-sm tabular-nums text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
                {fuelStats.lastKml > 0 && (
                  <div className="flex items-center gap-2 mt-1.5 text-[11px] text-slate-500">
                    <button
                      type="button"
                      onClick={() => {
                        setKmlDirty(true);
                        setKmlInput(defaultKml.toFixed(2));
                      }}
                      className="text-blue-700 hover:underline cursor-pointer font-mono tabular-nums"
                    >
                      เฉลี่ย {defaultKml.toFixed(2)}
                    </button>
                    <span aria-hidden="true">·</span>
                    <button
                      type="button"
                      onClick={() => {
                        setKmlDirty(true);
                        setKmlInput(fuelStats.lastKml.toFixed(2));
                      }}
                      className="text-slate-600 hover:text-slate-900 hover:underline cursor-pointer font-mono tabular-nums"
                    >
                      รอบล่าสุด {fuelStats.lastKml.toFixed(2)}
                    </button>
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <label
                    htmlFor="trip-fuel-price"
                    className="text-xs font-medium text-slate-700"
                  >
                    ราคาน้ำมันดีเซล (บาท/ลิตร)
                  </label>
                  {priceDirty && (
                    <button
                      type="button"
                      onClick={() => {
                        setPriceDirty(false);
                        setPriceInput(defaultPrice.toFixed(2));
                      }}
                      className="inline-flex items-center gap-1 text-[11px] text-blue-700 hover:text-blue-800 font-medium cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" aria-hidden="true" />
                      <span>ราคาล่าสุด ({defaultPrice.toFixed(2)})</span>
                    </button>
                  )}
                </div>
                <input
                  id="trip-fuel-price"
                  type="number"
                  min="1"
                  max="100"
                  step="0.01"
                  value={priceInput}
                  onChange={(e) => {
                    setPriceDirty(true);
                    setPriceInput(e.target.value);
                  }}
                  data-testid="trip-price-input"
                  className="w-full min-h-[40px] px-3 py-2 rounded-lg border border-slate-300 font-mono text-sm tabular-nums text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
                <p className="text-[11px] text-slate-500 mt-1.5">
                  อิงราคาเติมล่าสุด {defaultPrice.toFixed(2)} บ./ลิตร
                </p>
              </div>
            </div>

            {/* Buffer & Tolls */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
              <div>
                <span className="block text-xs font-medium text-slate-700 mb-1.5">
                  เผื่อน้ำมันสำรอง / รถติด
                </span>
                <div className="grid grid-cols-4 gap-1.5">
                  {BUFFER_OPTIONS.map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setBufferPercent(pct)}
                      className={`min-h-[38px] rounded-lg border font-mono text-xs tabular-nums transition-colors cursor-pointer ${
                        bufferPercent === pct
                          ? 'border-slate-900 bg-slate-900 text-white font-semibold'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      +{pct}%
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label
                  htmlFor="trip-extra-cost"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  ค่าทางด่วน / ค่าจอดรถเพิ่มเติม (บาท)
                </label>
                <input
                  id="trip-extra-cost"
                  type="number"
                  min="0"
                  step="10"
                  value={extraCostInput}
                  onChange={(e) => setExtraCostInput(e.target.value)}
                  className="w-full min-h-[38px] px-3 py-2 rounded-lg border border-slate-300 font-mono text-sm tabular-nums text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
            </div>
          </div>

          {/* Right: Live Estimate Results */}
          <div className="lg:col-span-6 p-5 sm:p-6 bg-slate-50/50 flex flex-col justify-between gap-4">
            {/* Dark Hero Cost Summary */}
            <div className="rounded-xl bg-slate-900 text-white p-5 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-slate-300">
                    {estimate.routeLabel} · {roundTrip ? 'ไป-กลับ' : 'เที่ยวเดียว'}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5 font-mono tabular-nums">
                    ระยะทางรวม {formatKm(estimate.totalDistanceKm)} กม.
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-300">ค่าน้ำมันโดยประมาณ</p>
                  <p
                    data-testid="trip-estimated-fuel-cost"
                    className="font-mono text-3xl font-bold tabular-nums text-emerald-400 mt-0.5"
                  >
                    {formatBaht(estimate.estimatedFuelCostBaht)}{' '}
                    <span className="text-sm font-sans font-normal text-slate-300">บาท</span>
                  </p>
                  {estimate.extraCostBaht > 0 && (
                    <p className="text-xs text-slate-300 font-mono tabular-nums mt-0.5">
                      รวมค่าทางด่วน/อื่นๆ: {formatBaht(estimate.totalTripCostBaht)} บาท
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 pt-3 border-t border-slate-800 text-xs">
                <div>
                  <p className="text-slate-400">ใช้น้ำมันรวม</p>
                  <p
                    data-testid="trip-estimated-liters"
                    className="font-mono text-base font-semibold tabular-nums text-white mt-0.5"
                  >
                    {estimate.bufferedLitersNeeded.toFixed(1)} ลิตร
                  </p>
                </div>
                <div>
                  <p className="text-slate-400">อัตราที่ใช้คิด</p>
                  <p className="font-mono text-base font-semibold tabular-nums text-white mt-0.5">
                    {estimate.effectiveKml.toFixed(2)} กม./ล.
                  </p>
                </div>
                <div>
                  <p className="text-slate-400">ต้นทุนต่อ กม.</p>
                  <p className="font-mono text-base font-semibold tabular-nums text-white mt-0.5">
                    {estimate.costPerKm.toFixed(2)} บ./กม.
                  </p>
                </div>
              </div>
            </div>

            {/* Current Tank & Refill Readiness */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Fuel className="w-4 h-4 text-amber-600 shrink-0" aria-hidden="true" />
                  <h3 className="text-sm font-semibold text-slate-900">
                    ความพร้อมของน้ำมันในถังปัจจุบัน
                  </h3>
                </div>
                <span className="font-mono text-xs tabular-nums text-slate-600">
                  {fuelPercent}% (~{estimate.currentTankLiters.toFixed(1)} / {tankCapacityLiters} ล.)
                </span>
              </div>

              <div className="space-y-1">
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-200 ${
                      estimate.canCompleteWithCurrentFuel ? 'bg-emerald-600' : 'bg-amber-500'
                    }`}
                    style={{ width: `${tankCoverageRatio}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono tabular-nums">
                  <span>วิ่งได้ก่อนถึงขีดสำรอง ~{formatKm(estimate.estimatedCurrentRangeKm)} กม.</span>
                  <span>ทริป {formatKm(estimate.totalDistanceKm)} กม.</span>
                </div>
              </div>

              {estimate.canCompleteWithCurrentFuel ? (
                <div className="flex items-start gap-2 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>
                    น้ำมันในถังปัจจุบันเพียงพอสำหรับทริปนี้โดยเหลือน้ำมันสำรองในถังอย่างน้อย ~10 ลิตร
                  </span>
                </div>
              ) : (
                <div className="flex items-start gap-2 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>
                    ต้องเติมเพิ่มระหว่างทางอย่างน้อย{' '}
                    <strong className="font-mono tabular-nums">
                      {estimate.additionalLitersToBuy.toFixed(1)} ลิตร
                    </strong>{' '}
                    (~{formatBaht(estimate.additionalRefuelCostBaht)} บาท · แวะเติมประมาณ{' '}
                    <strong className="font-mono tabular-nums">
                      {estimate.refuelStopsNeeded} ครั้ง
                    </strong>
                    )
                  </span>
                </div>
              )}
            </div>

            {/* Maintenance Milestone Impact */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-slate-700 shrink-0" aria-hidden="true" />
                  <h3 className="text-sm font-semibold text-slate-900">
                    เช็กกำหนดซ่อมบำรุงตลอดทริป
                  </h3>
                </div>
                <span className="inline-flex items-center gap-1 font-mono text-xs tabular-nums text-slate-600">
                  <Gauge className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                  ไมล์หลังจบทริป ~{formatKm(estimate.projectedEndOdometer)} กม.
                </span>
              </div>

              {maintenanceImpacts.length === 0 ? (
                <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" aria-hidden="true" />
                  <span>ทุกรายการซ่อมบำรุงยังมีระยะคงเหลือเพียงพอสำหรับทริปนี้</span>
                </p>
              ) : (
                <div className="space-y-1.5">
                  {maintenanceImpacts.map((impact) => (
                    <div
                      key={impact.key}
                      className={`text-xs rounded-lg px-3 py-2 border flex items-center justify-between gap-2 ${
                        impact.becomesOverdueDuringTrip
                          ? 'bg-red-50 border-red-200 text-red-900'
                          : 'bg-amber-50 border-amber-200 text-amber-900'
                      }`}
                    >
                      <span className="font-medium">{impact.label}</span>
                      <span className="font-mono tabular-nums shrink-0">
                        {impact.becomesOverdueDuringTrip
                          ? `จะเกินกำหนด ${formatKm(Math.abs(impact.remainingAfterTripKm))} กม.`
                          : `จะเหลืออีก ${formatKm(impact.remainingAfterTripKm)} กม.`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
