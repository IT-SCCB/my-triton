import { AlertTriangle, CheckCircle2, Clock, RefreshCw } from 'lucide-react';
import type { MaintenanceScheduleItem, ScheduleStatus } from '../types/maintenance';
import { formatKm, formatThaiDate } from '../utils/maintenance';

interface ScheduleSectionProps {
  schedules: MaintenanceScheduleItem[];
  currentOdometer: number;
  alertThresholdKm?: number;
  onUpdateInterval: (key: string, intervalKm: number) => Promise<void>;
  onResetCycle: (serviceId: string) => Promise<void>;
}

const STATUS_META: Record<
  ScheduleStatus,
  { label: string; textClass: string; barClass: string; Icon: typeof CheckCircle2 }
> = {
  nominal: {
    label: 'สถานะปกติ',
    textClass: 'text-emerald-700',
    barClass: 'bg-emerald-600',
    Icon: CheckCircle2,
  },
  warning: {
    label: 'ใกล้ถึงระยะ',
    textClass: 'text-amber-700',
    barClass: 'bg-amber-500',
    Icon: Clock,
  },
  overdue: {
    label: 'ถึงกำหนดเปลี่ยนแล้ว',
    textClass: 'text-red-700',
    barClass: 'bg-red-600',
    Icon: AlertTriangle,
  },
};

export function ScheduleSection({
  schedules,
  currentOdometer,
  alertThresholdKm = 500,
  onUpdateInterval,
  onResetCycle,
}: ScheduleSectionProps) {
  return (
    <section aria-labelledby="schedule-heading" className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
        <div>
          <h2
            id="schedule-heading"
            className="font-display text-xl sm:text-2xl font-semibold text-slate-900 text-balance"
          >
            ตารางการบำรุงรักษาและอายุอะไหล่
          </h2>
          <p className="text-sm text-slate-600 mt-0.5">
            ติดตามระยะเปลี่ยนถ่ายอะไหล่สำคัญเทียบกับเลขไมล์ปัจจุบัน{' '}
            <span className="font-mono tabular-nums font-medium text-slate-800">
              {formatKm(currentOdometer)} กม.
            </span>{' '}
            · แจ้งเตือนล่วงหน้าภายใน{' '}
            <span className="font-mono tabular-nums font-medium text-slate-800">
              {formatKm(alertThresholdKm)} กม.
            </span>
          </p>
        </div>
      </div>

      {schedules.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
          <p className="text-sm text-slate-600">
            ยังไม่มีรายการที่ตั้งรอบกำหนดการเซอร์วิสไว้
          </p>
        </div>
      ) : (
        <div
          data-testid="schedule-list"
          className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-200"
        >
          {schedules.map((item) => {
            const meta = STATUS_META[item.status];
            const StatusIcon = meta.Icon;

            return (
              <article
                key={item.key}
                data-testid={`schedule-item-${item.key}`}
                data-status={item.status}
                className={`p-4 sm:p-5 flex flex-col gap-3 transition-colors ${
                  item.status === 'overdue'
                    ? 'bg-red-50/45'
                    : item.status === 'warning'
                      ? 'bg-amber-50/55'
                      : ''
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      <h3 className="text-base font-semibold text-slate-900">
                        {item.label}
                      </h3>
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-medium ${meta.textClass}`}
                      >
                        <StatusIcon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        <span>{meta.label}</span>
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm text-slate-500">
                      {item.subtitle} · ทำล่าสุด {formatThaiDate(item.lastServiceDate, 'short')} ที่{' '}
                      <span className="font-mono tabular-nums text-slate-700">
                        {formatKm(item.lastServiceOdometer)} กม.
                      </span>
                    </p>
                  </div>

                  <div className="flex flex-wrap items-baseline md:text-right gap-x-6 gap-y-1 shrink-0">
                    <div>
                      <p className="text-xs text-slate-500">รอบถัดไป</p>
                      <p className="font-mono text-base sm:text-lg font-semibold text-slate-900 tabular-nums">
                        {formatKm(item.nextDueKm)} กม.
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">ระยะคงเหลือ</p>
                      <p
                        className={`font-mono text-base sm:text-lg font-semibold tabular-nums ${
                          item.remainingKm <= 0
                            ? 'text-red-700'
                            : item.status === 'warning'
                              ? 'text-amber-700'
                              : 'text-emerald-700'
                        }`}
                      >
                        {item.remainingKm <= 0
                          ? `เกิน ${formatKm(Math.abs(item.remainingKm))} กม.`
                          : `เหลืออีก ${formatKm(item.remainingKm)} กม.`}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div
                    className="w-full h-2 bg-slate-100 rounded-full overflow-hidden"
                    role="progressbar"
                    aria-label={`ความคืบหน้าระยะทาง ${item.label}`}
                    aria-valuenow={Math.round(item.progressPercent)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div
                      className={`h-full transition-all duration-200 ${meta.barClass}`}
                      style={{ width: `${Math.max(2, item.progressPercent)}%` }}
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="font-mono tabular-nums">
                        ใช้งานไปแล้ว {formatKm(item.usedKm)} / {formatKm(item.intervalKm)} กม. ({item.progressPercent}%)
                      </span>
                      {item.earlyCheckKm !== null &&
                        item.earlyCheckKm !== undefined &&
                        item.earlyRemainingKm !== null &&
                        item.earlyRemainingKm !== undefined && (
                          <span className="text-slate-600">
                            · จุดเช็ก 5,000 กม. ที่{' '}
                            <span className="font-mono tabular-nums">
                              {formatKm(item.earlyCheckKm)} กม.
                            </span>{' '}
                            ({item.earlyRemainingKm > 0
                              ? `เหลือ ${formatKm(item.earlyRemainingKm)} กม.`
                              : 'ถึงจุดตรวจเช็กแล้ว'})
                          </span>
                        )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {item.key === 'engine_oil' && (
                        <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-md">
                          {[5000, 7500, 10000].map((preset) => (
                            <button
                              key={preset}
                              type="button"
                              onClick={() => onUpdateInterval(item.key, preset)}
                              className={`px-2 py-1 rounded text-xs font-mono tabular-nums transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                                item.intervalKm === preset
                                  ? 'bg-white text-slate-900 font-medium shadow-xs'
                                  : 'text-slate-600 hover:text-slate-900'
                              }`}
                            >
                              {formatKm(preset)} กม.
                            </button>
                          ))}
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => onResetCycle(item.lastServiceId)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>รีเซ็ตรอบใหม่</span>
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
