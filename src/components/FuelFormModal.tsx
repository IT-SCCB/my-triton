import { useEffect, useState, type FormEvent } from 'react';
import { Calculator, X } from 'lucide-react';
import type { FuelLogEntry, OcrExtractedFuelData } from '../types/maintenance';
import {
  calculateFuelRefillPreview,
  computeFuelKmlFromFormula,
  findPreviousFuelLog,
  formatKm,
  formatThaiDate,
  getTodayIsoDate,
  isFuelKmlOutOfRange,
  MAX_REALISTIC_KML,
  MIN_REALISTIC_KML,
  sortFuelLogsChronological,
  validateFuelInput,
} from '../utils/maintenance';

interface FuelFormModalProps {
  isOpen: boolean;
  defaultOdometer: number;
  tankCapacityLiters?: number;
  fuelLogs: FuelLogEntry[];
  editingFuelLog?: FuelLogEntry | null;
  prefillFromOcr: OcrExtractedFuelData | null;
  onClose: () => void;
  onSubmit: (payload: {
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
  }) => Promise<void>;
}

export function FuelFormModal({
  isOpen,
  defaultOdometer,
  tankCapacityLiters = 75,
  fuelLogs,
  editingFuelLog,
  prefillFromOcr,
  onClose,
  onSubmit,
}: FuelFormModalProps) {
  const [date, setDate] = useState(() => getTodayIsoDate());
  const [odometer, setOdometer] = useState(String(defaultOdometer));
  const [amount, setAmount] = useState('');
  const [pricePerLiter, setPricePerLiter] = useState('33.55');
  const [liters, setLiters] = useState('');
  const [distanceOverride, setDistanceOverride] = useState('');
  const [kmlOverride, setKmlOverride] = useState('');
  const [autoCalcKml, setAutoCalcKml] = useState(true);
  const [fuelPercent, setFuelPercent] = useState('');
  const [note, setNote] = useState('');
  const [litersEditedManually, setLitersEditedManually] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isEditing = Boolean(editingFuelLog);

  const sortedFuel = sortFuelLogsChronological(fuelLogs);
  const latestFuelOdometer =
    sortedFuel.length > 0
      ? sortedFuel[sortedFuel.length - 1].odometer
      : defaultOdometer;

  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg(null);

    if (editingFuelLog) {
      const recordedKml = Number(
        editingFuelLog.kml > 0 ? editingFuelLog.kml : editingFuelLog.kmPerLiter ?? 0
      );
      const rawFormula = computeFuelKmlFromFormula(
        editingFuelLog.distance,
        editingFuelLog.liters
      );
      const matchesFormula =
        recordedKml > 0 && rawFormula > 0 && Math.abs(recordedKml - rawFormula) < 0.05;
      setDate(editingFuelLog.date);
      setOdometer(String(editingFuelLog.odometer));
      setAmount(String(editingFuelLog.amount));
      setPricePerLiter(String(editingFuelLog.pricePerLiter));
      setLiters(String(editingFuelLog.liters));
      setDistanceOverride(String(editingFuelLog.distance));
      setKmlOverride(String(recordedKml));
      setAutoCalcKml(matchesFormula);
      setNote(editingFuelLog.note);
      setFuelPercent('');
      setLitersEditedManually(true);
      return;
    }

    setDate(getTodayIsoDate());
    setLitersEditedManually(false);
    setDistanceOverride('');
    setKmlOverride('');
    setAutoCalcKml(true);

    if (prefillFromOcr) {
      setOdometer(
        prefillFromOcr.odometer ? String(prefillFromOcr.odometer) : String(defaultOdometer)
      );
      setAmount(prefillFromOcr.amount ? String(prefillFromOcr.amount) : '');
      setPricePerLiter(
        prefillFromOcr.pricePerLiter ? String(prefillFromOcr.pricePerLiter) : '33.55'
      );
      if (prefillFromOcr.liters) {
        setLiters(String(prefillFromOcr.liters));
        setLitersEditedManually(true);
      } else if (prefillFromOcr.amount && prefillFromOcr.pricePerLiter) {
        setLiters(
          (prefillFromOcr.amount / prefillFromOcr.pricePerLiter).toFixed(3)
        );
      } else {
        setLiters('');
      }
      setNote(prefillFromOcr.stationOrFuel ?? '');
      setFuelPercent('');
    } else {
      setOdometer(String(defaultOdometer));
      setAmount('');
      setPricePerLiter('33.55');
      setLiters('');
      setNote('');
      setFuelPercent('');
    }
  }, [isOpen, defaultOdometer, prefillFromOcr, editingFuelLog]);

  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const numOdo = Number(odometer.replace(/,/g, '')) || 0;
  const numAmount = Number(amount) || 0;
  const numPrice = Number(pricePerLiter) || 0;
  const numLiters = Number(liters) || 0;

  const previousFuelLog = isEditing
    ? findPreviousFuelLog(fuelLogs, {
        id: editingFuelLog?.id,
        date,
        odometer: numOdo || (editingFuelLog?.odometer ?? 0),
      })
    : null;

  const prevDeltaDistance =
    previousFuelLog && numOdo > previousFuelLog.odometer
      ? numOdo - previousFuelLog.odometer
      : 0;

  const preview = calculateFuelRefillPreview({
    newOdometer: numOdo,
    previousOdometer: latestFuelOdometer,
    amount: numAmount,
    pricePerLiter: numPrice,
    litersOverride: litersEditedManually ? numLiters : null,
  });

  const parsedEditDistance = Number(distanceOverride);
  const parsedEditKml = Number(kmlOverride);
  const effectiveDistance = isEditing
    ? Number.isFinite(parsedEditDistance) && parsedEditDistance >= 0
      ? parsedEditDistance
      : editingFuelLog?.distance ?? 0
    : preview.distance;
  const formulaKml = computeFuelKmlFromFormula(effectiveDistance, numLiters);
  const effectiveKml = isEditing
    ? Number.isFinite(parsedEditKml) && parsedEditKml >= 0
      ? parsedEditKml
      : editingFuelLog?.kml ?? 0
    : preview.kml;

  function syncEditFormula(nextDist: number, nextLiters: number, forceRecalc = false) {
    if (!isEditing) return;
    if (!autoCalcKml && !forceRecalc) return;
    if (nextDist > 0 && nextLiters > 0) {
      setKmlOverride(String(computeFuelKmlFromFormula(nextDist, nextLiters)));
    }
  }

  function handleOdometerChange(rawVal: string) {
    setOdometer(rawVal);
    if (!isEditing || !previousFuelLog) return;
    const nextOdo = Number(rawVal.replace(/,/g, ''));
    if (Number.isFinite(nextOdo) && nextOdo > 0) {
      const nextDist = Math.max(0, nextOdo - previousFuelLog.odometer);
      setDistanceOverride(String(nextDist));
      syncEditFormula(nextDist, numLiters, true);
      setAutoCalcKml(true);
    }
  }

  function handleAmountOrPriceChange(nextAmount: string, nextPrice: string) {
    setAmount(nextAmount);
    setPricePerLiter(nextPrice);
    setLitersEditedManually(false);
    const a = Number(nextAmount);
    const p = Number(nextPrice);
    if (a > 0 && p > 0) {
      const nextLitersStr = (a / p).toFixed(3);
      setLiters(nextLitersStr);
      syncEditFormula(effectiveDistance, Number(nextLitersStr));
    }
  }

  function handleLitersChange(rawVal: string) {
    setLitersEditedManually(true);
    setLiters(rawVal);
    const nextLiters = Number(rawVal);
    if (Number.isFinite(nextLiters) && nextLiters > 0) {
      syncEditFormula(effectiveDistance, nextLiters);
    }
  }

  function handleDistanceChange(rawVal: string) {
    setDistanceOverride(rawVal);
    const nextDist = Number(rawVal);
    if (Number.isFinite(nextDist) && nextDist >= 0) {
      setAutoCalcKml(true);
      if (nextDist > 0 && numLiters > 0) {
        setKmlOverride(String(computeFuelKmlFromFormula(nextDist, numLiters)));
      }
    }
  }

  async function handleFormSubmit(e: FormEvent) {
    e.preventDefault();
    const check = validateFuelInput({
      date,
      odometer,
      amount,
      pricePerLiter,
      liters,
      note,
      fuelPercent,
      maxTankLiters: tankCapacityLiters,
    });
    if (!check.valid) {
      setErrorMsg(check.error ?? 'กรุณาตรวจสอบข้อมูลการเติมน้ำมัน');
      return;
    }

    if (
      isEditing &&
      (!Number.isFinite(parsedEditKml) || parsedEditKml < 0 || parsedEditKml > 500)
    ) {
      setErrorMsg('กรุณาระบุอัตราสิ้นเปลือง (กม./ลิตร) ระหว่าง 0 ถึง 500');
      return;
    }

    setErrorMsg(null);
    setSubmitting(true);
    try {
      await onSubmit({
        id: editingFuelLog?.id,
        date,
        odometer: Number(odometer.replace(/,/g, '').trim()),
        amount: Number(amount),
        pricePerLiter: Number(pricePerLiter),
        liters: Number(liters),
        distance: effectiveDistance,
        kml: isEditing ? Number(effectiveKml.toFixed(2)) : undefined,
        note: note.trim(),
        newFuelPercent:
          !isEditing && fuelPercent.trim() !== ''
            ? Number(fuelPercent.trim())
            : undefined,
      });
      onClose();
    } catch {
      setErrorMsg('ไม่สามารถบันทึกการเติมน้ำมันได้');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-[1px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="fuel-modal-title"
        className="w-full max-w-lg bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden max-h-[90vh] flex flex-col"
      >
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 id="fuel-modal-title" className="font-display text-lg font-semibold text-slate-900">
            {isEditing ? 'แก้ไขรายการเติมน้ำมัน' : 'บันทึกการเติมน้ำมันใหม่'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดหน้าต่างเติมน้ำมัน"
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleFormSubmit} noValidate className="p-5 space-y-4 overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="fuel-date" className="block text-xs font-medium text-slate-700">
                วันที่เติมน้ำมัน *
              </label>
              <input
                id="fuel-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="fuel-odo" className="block text-xs font-medium text-slate-700">
                เลขไมล์หน้าปัด (กม.) *
              </label>
              <input
                id="fuel-odo"
                type="text"
                inputMode="numeric"
                value={odometer}
                onChange={(e) => handleOdometerChange(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-slate-300 bg-white font-mono text-sm tabular-nums text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="fuel-amount" className="block text-xs font-medium text-slate-700">
                ยอดเงิน (บาท) *
              </label>
              <input
                id="fuel-amount"
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => handleAmountOrPriceChange(e.target.value, pricePerLiter)}
                placeholder="1000"
                className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-slate-300 bg-white font-mono text-sm tabular-nums text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="fuel-price" className="block text-xs font-medium text-slate-700">
                ราคา/ลิตร (บาท) *
              </label>
              <input
                id="fuel-price"
                type="number"
                step="0.01"
                value={pricePerLiter}
                onChange={(e) => handleAmountOrPriceChange(amount, e.target.value)}
                placeholder="33.55"
                className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-slate-300 bg-white font-mono text-sm tabular-nums text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="fuel-liters"
                className="block text-xs font-medium text-slate-700 whitespace-nowrap"
              >
                ปริมาณ (ลิตร ≤ {tankCapacityLiters}) *
              </label>
              <input
                id="fuel-liters"
                type="number"
                step="0.001"
                max={tankCapacityLiters}
                value={liters}
                onChange={(e) => handleLitersChange(e.target.value)}
                placeholder="29.806"
                className={`w-full min-h-[42px] px-3 py-2 rounded-lg border font-mono text-sm tabular-nums focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 ${
                  numLiters > tankCapacityLiters
                    ? 'border-red-400 bg-red-50 text-red-900'
                    : 'border-slate-300 bg-slate-50 text-slate-900'
                }`}
              />
            </div>
          </div>

          {numLiters > tankCapacityLiters && (
            <p className="text-xs text-red-600 font-medium">
              ปริมาณน้ำมัน ({numLiters.toFixed(2)} ลิตร) เกินความจุถัง {tankCapacityLiters} ลิตร (กรณีเติมเต็มถังจากไฟเตือนปกติจะอยู่ราว 60–68 ลิตร)
            </p>
          )}

          {isEditing ? (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label htmlFor="fuel-edit-distance" className="block text-xs font-medium text-slate-700">
                    ระยะทางวิ่งรอบนี้ (กม.)
                  </label>
                  <input
                    id="fuel-edit-distance"
                    type="number"
                    min="0"
                    step="1"
                    value={distanceOverride}
                    onChange={(e) => handleDistanceChange(e.target.value)}
                    className="w-full min-h-[40px] px-3 py-2 rounded-lg border border-slate-300 bg-white font-mono text-sm tabular-nums text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="fuel-edit-kml" className="block text-xs font-medium text-slate-700">
                    อัตราสิ้นเปลือง (กม./ลิตร)
                  </label>
                  <input
                    id="fuel-edit-kml"
                    type="number"
                    min="0"
                    max="500"
                    step="0.01"
                    value={kmlOverride}
                    onChange={(e) => {
                      setAutoCalcKml(false);
                      setKmlOverride(e.target.value);
                    }}
                    className={`w-full min-h-[40px] px-3 py-2 rounded-lg border font-mono text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-600 ${
                      isFuelKmlOutOfRange(parsedEditKml)
                        ? 'border-slate-300 bg-slate-100 text-slate-700'
                        : 'border-slate-300 bg-white text-slate-900'
                    }`}
                  />
                  {isFuelKmlOutOfRange(parsedEditKml) && (
                    <p className="text-[11px] text-slate-500">
                      นอกช่วง {MIN_REALISTIC_KML}–{MAX_REALISTIC_KML} กม./ล. · ตารางจะแสดงเป็นค่าเฉลี่ยแทน และไม่นำไปคิดค่าเฉลี่ยรวม
                    </p>
                  )}
                </div>
              </div>

              <div
                data-testid="fuel-formula-box"
                className="pt-2 border-t border-slate-200 space-y-1.5 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-slate-700">
                  <span className="inline-flex items-center gap-1.5 font-medium">
                    <Calculator className="w-3.5 h-3.5 text-emerald-700 shrink-0" aria-hidden="true" />
                    <span>สูตร: ระยะทาง ÷ ปริมาณ (ลิตร)</span>
                  </span>
                  <span className="font-mono font-semibold text-emerald-700 tabular-nums">
                    {formatKm(effectiveDistance)} ÷ {numLiters.toFixed(3)} = {formulaKml.toFixed(2)} กม./ล.
                  </span>
                </div>

                {previousFuelLog && (
                  <div className="flex flex-wrap items-center justify-between gap-2 text-slate-500">
                    <span>
                      รอบก่อนหน้า ({formatThaiDate(previousFuelLog.date, 'short')}):{' '}
                      <strong className="font-mono text-slate-700 tabular-nums">
                        {formatKm(previousFuelLog.odometer)} กม.
                      </strong>
                    </span>
                    {prevDeltaDistance > 0 && effectiveDistance !== prevDeltaDistance && (
                      <button
                        type="button"
                        data-testid="apply-prev-odo-distance-btn"
                        onClick={() => {
                          setDistanceOverride(String(prevDeltaDistance));
                          setAutoCalcKml(true);
                          if (numLiters > 0) {
                            setKmlOverride(
                              String(computeFuelKmlFromFormula(prevDeltaDistance, numLiters))
                            );
                          }
                        }}
                        className="font-medium text-blue-700 hover:text-blue-900 cursor-pointer"
                      >
                        ใช้ระยะ +{formatKm(prevDeltaDistance)} กม. คำนวณใหม่
                      </button>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-end gap-3 pt-0.5">
                  {effectiveDistance > 0 && numLiters > 0 && (
                    <button
                      type="button"
                      data-testid="recalc-formula-btn"
                      onClick={() => {
                        setAutoCalcKml(true);
                        setKmlOverride(String(formulaKml));
                      }}
                      className="font-medium text-emerald-700 hover:text-emerald-900 cursor-pointer"
                    >
                      ใช้ค่าตามสูตร ({formulaKml.toFixed(2)} กม./ล.)
                    </button>
                  )}
                  <button
                    type="button"
                    data-testid="zero-kml-btn"
                    onClick={() => {
                      setAutoCalcKml(false);
                      setKmlOverride('0');
                    }}
                    className="font-medium text-amber-700 hover:text-amber-900 cursor-pointer"
                  >
                    ตั้ง กม./ลิตร = 0 (ไม่เต็มถัง)
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3.5 space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-emerald-800 block">
                    ระยะทางวิ่งจากรอบก่อน ({formatKm(latestFuelOdometer)} กม.)
                  </span>
                  <strong className="font-mono text-sm text-emerald-950 tabular-nums">
                    +{formatKm(preview.distance)} กม.
                  </strong>
                </div>
                <div className="text-right">
                  <span className="text-emerald-800 block">อัตราสิ้นเปลืองรอบนี้</span>
                  <strong className="font-mono text-sm text-emerald-700 tabular-nums">
                    {preview.kml.toFixed(2)} กม./ลิตร
                  </strong>
                </div>
              </div>
              <p className="text-[11px] text-emerald-800 font-mono tabular-nums border-t border-emerald-200/80 pt-1.5">
                สูตร: {formatKm(preview.distance)} กม. ÷ {preview.liters.toFixed(3)} ลิตร = {preview.kml.toFixed(2)} กม./ล.
              </p>
            </div>
          )}

          <div className={`grid grid-cols-1 ${isEditing ? '' : 'sm:grid-cols-2'} gap-3`}>
            {!isEditing && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="fuel-percent" className="block text-xs font-medium text-slate-700">
                    ระดับน้ำมันหลังเติม (%)
                  </label>
                  <button
                    type="button"
                    onClick={() => setFuelPercent('100')}
                    className="text-[11px] font-medium text-emerald-700 hover:text-emerald-900 cursor-pointer"
                  >
                    เติมเต็มถัง (100%)
                  </button>
                </div>
                <input
                  id="fuel-percent"
                  type="number"
                  min="0"
                  max="100"
                  value={fuelPercent}
                  onChange={(e) => setFuelPercent(e.target.value)}
                  placeholder="เช่น 100 (ความจุถัง 75 ล.)"
                  className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-slate-300 bg-white font-mono text-sm tabular-nums text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="fuel-note" className="block text-xs font-medium text-slate-700">
                ปั๊ม / ประเภทน้ำมัน *
              </label>
              <input
                id="fuel-note"
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="เช่น บางจาก (ดีเซล B20)"
                className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>

          {errorMsg && (
            <p role="alert" className="text-xs text-red-600 font-medium">
              {errorMsg}
            </p>
          )}

          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] px-4 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium cursor-pointer"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="min-h-[40px] px-5 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-sm font-medium cursor-pointer"
            >
              {submitting
                ? 'กำลังบันทึก...'
                : isEditing
                  ? 'บันทึกการแก้ไข'
                  : 'บันทึกการเติมน้ำมัน'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
