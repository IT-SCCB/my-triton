import { useState, type FormEvent } from 'react';
import { Check, Gauge } from 'lucide-react';
import type { OdometerLogEntry } from '../types/maintenance';
import {
  formatKm,
  formatThaiDate,
  sortOdometerLogs,
  validateOdometerInput,
} from '../utils/maintenance';

interface OdometerLogViewProps {
  currentOdometer: number;
  odometerLogs: OdometerLogEntry[];
  onAddOdometerLog: (payload: {
    odometer: number;
    date: string;
    source: string;
    note?: string;
  }) => Promise<void>;
}

const SOURCE_OPTIONS = [
  'อัปเดตจากหน้าปัด',
  'อัปเดตผ่านเว็บลิงก์',
  'บันทึกจากอู่/ศูนย์บริการ',
];

export function OdometerLogView({
  currentOdometer,
  odometerLogs,
  onAddOdometerLog,
}: OdometerLogViewProps) {
  const [odometer, setOdometer] = useState(String(currentOdometer));
  const [date, setDate] = useState('2026-11-15');
  const [source, setSource] = useState(SOURCE_OPTIONS[0]);
  const [note, setNote] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const sortedLogs = sortOdometerLogs(odometerLogs);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const check = validateOdometerInput(odometer);
    if (!check.valid) {
      setErrorMsg(check.error ?? 'กรุณาระบุเลขไมล์ให้ถูกต้อง');
      return;
    }
    const parsedOdo = Number(odometer.replace(/,/g, '').trim());
    setErrorMsg(null);
    setSubmitting(true);
    try {
      await onAddOdometerLog({
        odometer: parsedOdo,
        date,
        source,
        note: note.trim() || undefined,
      });
      setNote('');
      setSavedMsg(true);
      setTimeout(() => setSavedMsg(false), 2500);
    } catch {
      setErrorMsg('ไม่สามารถบันทึกเลขไมล์ได้');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section aria-labelledby="odometer-view-heading" className="space-y-6">
      <div>
        <h2
          id="odometer-view-heading"
          className="font-display text-xl sm:text-2xl font-semibold text-slate-900"
        >
          บันทึกและประวัติเลขไมล์หน้าปัด
        </h2>
        <p className="text-sm text-slate-600 mt-0.5">
          เลขไมล์ล่าสุด <span className="font-mono tabular-nums font-semibold text-slate-900">{formatKm(currentOdometer)} กม.</span> · ใช้สำหรับคำนวณระยะคงเหลือของทุกรายการเซอร์วิส
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <form
          onSubmit={handleSubmit}
          noValidate
          className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-4"
        >
          <div className="flex items-center gap-2 text-slate-900">
            <Gauge className="w-5 h-5 text-blue-700" aria-hidden="true" />
            <h3 className="text-base font-semibold">บันทึกเลขไมล์ใหม่</h3>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="odo-log-value" className="block text-xs font-medium text-slate-700">
              เลขไมล์หน้าปัด (กม.)
            </label>
            <input
              id="odo-log-value"
              type="text"
              inputMode="numeric"
              value={odometer}
              onChange={(e) => {
                setOdometer(e.target.value);
                if (errorMsg) setErrorMsg(null);
              }}
              className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-slate-300 bg-white font-mono text-sm tabular-nums text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="odo-log-date" className="block text-xs font-medium text-slate-700">
                วันที่บันทึก
              </label>
              <input
                id="odo-log-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="odo-log-source" className="block text-xs font-medium text-slate-700">
                แหล่งข้อมูล
              </label>
              <select
                id="odo-log-source"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                {SOURCE_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="odo-log-note" className="block text-xs font-medium text-slate-700">
              หมายเหตุเพิ่มเติม (ถ้ามี)
            </label>
            <input
              id="odo-log-note"
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="เช่น เดินทางกลับต่างจังหวัด / เช็กระยะ"
              className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          {errorMsg && (
            <p role="alert" className="text-xs text-red-600 font-medium">
              {errorMsg}
            </p>
          )}
          {savedMsg && !errorMsg && (
            <p className="inline-flex items-center gap-1.5 text-xs text-emerald-700 font-medium">
              <Check className="w-4 h-4" aria-hidden="true" />
              <span>บันทึกประวัติเลขไมล์เรียบร้อยแล้ว</span>
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full min-h-[42px] px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-sm font-medium transition-colors cursor-pointer"
          >
            {submitting ? 'กำลังบันทึก...' : 'บันทึกเลขไมล์'}
          </button>
        </form>

        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900">ประวัติการอัปเดตเลขไมล์</h3>
            <span className="text-xs text-slate-500 font-mono tabular-nums">
              {sortedLogs.length} รายการ
            </span>
          </div>

          <div className="divide-y divide-slate-100">
            {sortedLogs.map((entry, idx) => (
              <div
                key={entry.id}
                className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
              >
                <div className="space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-mono tabular-nums text-slate-500">
                      {formatThaiDate(entry.date, 'short')}
                    </span>
                    <span className="text-slate-300" aria-hidden="true">·</span>
                    <span className="text-sm font-medium text-slate-900">{entry.source}</span>
                    {idx === 0 && (
                      <span className="text-xs font-medium text-blue-700">· ล่าสุด</span>
                    )}
                  </div>
                  {entry.note && <p className="text-xs text-slate-600">{entry.note}</p>}
                </div>

                <div className="font-mono text-base font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                  {formatKm(entry.odometer)} กม.
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
