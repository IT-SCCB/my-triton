import { useEffect, useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import type {
  ScheduleKey,
  ServiceCategory,
  ServiceRecord,
} from '../types/maintenance';
import { CATEGORY_LABELS, validateServiceInput } from '../utils/maintenance';

interface ServiceFormModalProps {
  isOpen: boolean;
  editingService: ServiceRecord | null;
  defaultOdometer: number;
  onClose: () => void;
  onSubmit: (payload: {
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
  }) => Promise<void>;
}

const SCHEDULE_KEY_OPTIONS: Array<{ value: ScheduleKey | ''; label: string }> = [
  { value: '', label: 'ไม่ผูกกับรอบกำหนดการหลัก' },
  { value: 'engine_oil', label: 'น้ำมันเครื่อง (อัพเดตรอบน้ำมันเครื่อง)' },
  { value: 'air_cabin_filter', label: 'กรองอากาศและกรองแอร์' },
  { value: 'coolant', label: 'น้ำยาหล่อเย็น (Coolant)' },
  { value: 'timing_belt', label: 'ชุดสายพานไทม์มิ่ง' },
];

export function ServiceFormModal({
  isOpen,
  editingService,
  defaultOdometer,
  onClose,
  onSubmit,
}: ServiceFormModalProps) {
  const [date, setDate] = useState('2026-11-15');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<ServiceCategory>('fluids');
  const [scheduleKey, setScheduleKey] = useState<ScheduleKey | ''>('');
  const [odometer, setOdometer] = useState(String(defaultOdometer));
  const [partsCost, setPartsCost] = useState('0');
  const [laborCost, setLaborCost] = useState('0');
  const [intervalKm, setIntervalKm] = useState('');
  const [notes, setNotes] = useState('');
  const [revisionNote, setRevisionNote] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (editingService) {
      setDate(editingService.date);
      setTitle(editingService.title);
      setCategory(editingService.category);
      setScheduleKey(editingService.scheduleKey ?? '');
      setOdometer(String(editingService.odometer));
      setPartsCost(String(editingService.partsCost));
      setLaborCost(String(editingService.laborCost));
      setIntervalKm(editingService.intervalKm ? String(editingService.intervalKm) : '');
      setNotes(editingService.notes);
      setRevisionNote(editingService.revisionNote ?? '');
    } else {
      setDate('2026-11-15');
      setTitle('');
      setCategory('fluids');
      setScheduleKey('');
      setOdometer(String(defaultOdometer));
      setPartsCost('0');
      setLaborCost('0');
      setIntervalKm('');
      setNotes('');
      setRevisionNote('');
    }
    setErrorMsg(null);
  }, [isOpen, editingService, defaultOdometer]);

  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  async function handleFormSubmit(e: FormEvent) {
    e.preventDefault();
    const validation = validateServiceInput({
      date,
      title,
      odometer,
      partsCost,
      laborCost,
      intervalKm,
    });

    if (!validation.valid) {
      setErrorMsg(validation.error ?? 'กรุณาตรวจสอบข้อมูลที่กรอก');
      return;
    }

    const parsedOdo = Number(odometer.replace(/,/g, '').trim());
    const parsedParts = partsCost.trim() === '' ? 0 : Number(partsCost.replace(/,/g, ''));
    const parsedLabor = laborCost.trim() === '' ? 0 : Number(laborCost.replace(/,/g, ''));
    const parsedInterval =
      intervalKm.trim() === '' ? null : Number(intervalKm.replace(/,/g, ''));

    setErrorMsg(null);
    setSubmitting(true);
    try {
      await onSubmit({
        id: editingService?.id,
        date,
        title: title.trim(),
        category,
        scheduleKey: scheduleKey || undefined,
        odometer: parsedOdo,
        partsCost: parsedParts,
        laborCost: parsedLabor,
        intervalKm: parsedInterval,
        notes: notes.trim(),
        revisionNote: revisionNote.trim() || undefined,
      });
      onClose();
    } catch {
      setErrorMsg('ไม่สามารถบันทึกข้อมูลได้ กรุณาลองใหม่อีกครั้ง');
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
        aria-labelledby="service-modal-title"
        className="w-full max-w-xl bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden max-h-[90vh] flex flex-col"
      >
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <h2 id="service-modal-title" className="font-display text-lg font-semibold text-slate-900">
            {editingService ? 'แก้ไขรายการเซอร์วิส' : 'บันทึกรายการเซอร์วิสใหม่'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดหน้าต่าง"
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleFormSubmit} noValidate className="p-5 space-y-4 overflow-y-auto">
          <div className="space-y-1.5">
            <label htmlFor="srv-title" className="block text-xs font-medium text-slate-700">
              รายการเซอร์วิส / อะไหล่ที่เปลี่ยน *
            </label>
            <input
              id="srv-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="เช่น เปลี่ยนถ่ายน้ำมันเครื่อง / ผ้าเบรกหน้า"
              className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="srv-date" className="block text-xs font-medium text-slate-700">
                วันที่ทำเซอร์วิส *
              </label>
              <input
                id="srv-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="srv-odometer" className="block text-xs font-medium text-slate-700">
                เลขไมล์ตอนทำเซอร์วิส (กม.) *
              </label>
              <input
                id="srv-odometer"
                type="text"
                inputMode="numeric"
                value={odometer}
                onChange={(e) => setOdometer(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-slate-300 bg-white font-mono text-sm tabular-nums text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="srv-category" className="block text-xs font-medium text-slate-700">
                หมวดหมู่
              </label>
              <select
                id="srv-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as ServiceCategory)}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                {(Object.keys(CATEGORY_LABELS) as ServiceCategory[]).map((cat) => (
                  <option key={cat} value={cat}>
                    {CATEGORY_LABELS[cat]}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="srv-schedule-key" className="block text-xs font-medium text-slate-700">
                อัปเดตกำหนดการรอบถัดไป
              </label>
              <select
                id="srv-schedule-key"
                value={scheduleKey}
                onChange={(e) => setScheduleKey(e.target.value as ScheduleKey | '')}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                {SCHEDULE_KEY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="srv-parts" className="block text-xs font-medium text-slate-700">
                ค่าอะไหล่ (บาท)
              </label>
              <input
                id="srv-parts"
                type="number"
                min="0"
                value={partsCost}
                onChange={(e) => setPartsCost(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-slate-300 bg-white font-mono text-sm tabular-nums text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="srv-labor" className="block text-xs font-medium text-slate-700">
                ค่าแรง (บาท)
              </label>
              <input
                id="srv-labor"
                type="number"
                min="0"
                value={laborCost}
                onChange={(e) => setLaborCost(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-slate-300 bg-white font-mono text-sm tabular-nums text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="srv-interval" className="block text-xs font-medium text-slate-700">
                ระยะรอบถัดไป (กม.)
              </label>
              <input
                id="srv-interval"
                type="number"
                min="1"
                value={intervalKm}
                onChange={(e) => setIntervalKm(e.target.value)}
                placeholder="เช่น 10000"
                className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-slate-300 bg-white font-mono text-sm tabular-nums text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="srv-notes" className="block text-xs font-medium text-slate-700">
              รายละเอียด / หมายเหตุ
            </label>
            <textarea
              id="srv-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="เช่น เบอร์น้ำมันเครื่อง อู่ที่ทำ หรือรายการตรวจเช็กเพิ่มเติม"
              className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          {editingService && (
            <div className="space-y-1.5">
              <label htmlFor="srv-revision" className="block text-xs font-medium text-slate-700">
                บันทึกประวัติการแก้ไขตัวเลข (ถ้ามี)
              </label>
              <input
                id="srv-revision"
                type="text"
                value={revisionNote}
                onChange={(e) => setRevisionNote(e.target.value)}
                placeholder="เช่น แก้ไขเลขไมล์จาก ..."
                className="w-full min-h-[40px] px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          )}

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
              className="min-h-[40px] px-5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-sm font-medium cursor-pointer"
            >
              {submitting ? 'กำลังบันทึก...' : editingService ? 'บันทึกการแก้ไข' : 'บันทึกรายการ'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
