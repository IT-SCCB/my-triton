import { AlertOctagon, AlertTriangle, ArrowRight, Bell, X } from 'lucide-react';
import type { MaintenanceAlertItem } from '../types/maintenance';
import { formatKm } from '../utils/maintenance';
import { formatAlertSummaryText } from '../utils/notifications';

interface MaintenanceAlertToastProps {
  alerts: MaintenanceAlertItem[];
  thresholdKm: number;
  onJumpToSchedule: () => void;
  onDismissAlert: (alertId: string) => void;
  onDismissAll: () => void;
}

export function MaintenanceAlertToast({
  alerts,
  thresholdKm,
  onJumpToSchedule,
  onDismissAlert,
  onDismissAll,
}: MaintenanceAlertToastProps) {
  if (alerts.length === 0) return null;

  const primary = alerts[0];
  const isOverdue = primary.severity === 'overdue';
  const Icon = isOverdue ? AlertOctagon : AlertTriangle;

  return (
    <aside
      role="alert"
      aria-live="assertive"
      data-testid="maintenance-alert-toast"
      className={`fixed bottom-4 right-4 left-4 sm:left-auto sm:w-[420px] z-40 rounded-xl bg-white dark:bg-slate-900 shadow-lg border ${
        isOverdue
          ? 'border-red-300 dark:border-red-800'
          : 'border-amber-300 dark:border-amber-800'
      } p-4 space-y-3`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <div
            className={`mt-0.5 p-2 rounded-lg shrink-0 ${
              isOverdue
                ? 'bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-400'
                : 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400'
            }`}
          >
            <Icon className="w-4 h-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
              <span
                className={`font-semibold ${
                  isOverdue
                    ? 'text-red-700 dark:text-red-400'
                    : 'text-amber-800 dark:text-amber-300'
                }`}
              >
                {isOverdue
                  ? 'ถึงกำหนดซ่อมบำรุงแล้ว'
                  : `ใกล้ถึงรอบซ่อมบำรุง (≤ ${formatKm(thresholdKm)} กม.)`}
              </span>
              {alerts.length > 1 && (
                <>
                  <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
                    ·
                  </span>
                  <span className="text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                    รวม {alerts.length} รายการ
                  </span>
                </>
              )}
            </div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
              {primary.title}
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 font-mono tabular-nums">
              {formatAlertSummaryText(primary)}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onDismissAlert(primary.id)}
          aria-label="ปิดการแจ้งเตือนนี้"
          data-testid="dismiss-alert-toast-btn"
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:text-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      {alerts.length > 1 && (
        <ul className="border-t border-slate-100 dark:border-slate-800 pt-2 space-y-1">
          {alerts.slice(1, 3).map((extra) => (
            <li
              key={extra.id}
              className="flex items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400"
            >
              <span className="truncate flex items-center gap-1.5">
                <Bell className="w-3 h-3 text-slate-400 dark:text-slate-500 shrink-0" aria-hidden="true" />
                <span className="truncate">{extra.title}</span>
              </span>
              <span
                className={`font-mono tabular-nums shrink-0 font-medium ${
                  extra.severity === 'overdue'
                    ? 'text-red-700 dark:text-red-400'
                    : 'text-amber-700 dark:text-amber-400'
                }`}
              >
                {extra.remainingKm <= 0
                  ? `เกิน ${formatKm(Math.abs(extra.remainingKm))} กม.`
                  : `อีก ${formatKm(extra.remainingKm)} กม.`}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onDismissAll}
          className="min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 dark:text-slate-300 dark:hover:text-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
        >
          รับทราบทั้งหมด
        </button>
        <button
          type="button"
          onClick={onJumpToSchedule}
          className="inline-flex items-center gap-1.5 min-h-[36px] px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white dark:text-slate-900 text-white text-xs font-medium transition-colors cursor-pointer"
        >
          <span>ดูตารางซ่อม</span>
          <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}
