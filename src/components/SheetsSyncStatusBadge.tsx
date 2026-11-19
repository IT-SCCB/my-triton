import { AlertTriangle, CheckCircle2, CloudCog, CloudOff, Loader2 } from 'lucide-react';
import {
  formatLastSyncBadgeTime,
  type GasSyncStatus,
} from '../services/googleSheetsSync';

interface SheetsSyncStatusBadgeProps {
  gasUrl: string;
  autoSyncEnabled: boolean;
  status: GasSyncStatus;
  lastSyncAt: string | null;
  lastDirection: 'pull' | 'push' | null;
  errorMessage: string | null;
  onOpenSyncModal: () => void;
}

export function SheetsSyncStatusBadge({
  gasUrl,
  autoSyncEnabled,
  status,
  lastSyncAt,
  lastDirection,
  errorMessage,
  onOpenSyncModal,
}: SheetsSyncStatusBadgeProps) {
  const hasUrl = Boolean(gasUrl.trim());
  const formattedTime = lastSyncAt ? formatLastSyncBadgeTime(lastSyncAt) : '';

  let label = 'ตั้งค่าซิงค์ Sheets';
  let styleClass =
    'border-slate-200 bg-white/95 text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white';

  if (!hasUrl) {
    label = 'ตั้งค่า Auto Sync Sheets';
  } else if (status === 'syncing') {
    label = 'กำลังซิงค์ Google Sheets...';
    styleClass =
      'border-blue-200 bg-blue-50/95 text-blue-800 hover:bg-blue-100/90 dark:border-blue-800 dark:bg-blue-950/90 dark:text-blue-200 dark:hover:bg-blue-900/90';
  } else if (status === 'error') {
    label = 'ซิงค์ Sheets ไม่สำเร็จ';
    styleClass =
      'border-red-200 bg-red-50/95 text-red-700 hover:bg-red-100/90 dark:border-red-800 dark:bg-red-950/90 dark:text-red-300 dark:hover:bg-red-900/90';
  } else if (!autoSyncEnabled) {
    label = formattedTime
      ? `Auto Sync ปิด · ล่าสุด ${formattedTime}`
      : 'Auto Sync ปิดอยู่';
    styleClass =
      'border-slate-200 bg-white/95 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-400 dark:hover:bg-slate-800';
  } else if (formattedTime) {
    const dirLabel = lastDirection === 'pull' ? 'ดึงเข้า' : lastDirection === 'push' ? 'ส่งขึ้น' : '';
    label = dirLabel
      ? `ซิงค์ล่าสุดเมื่อ ${formattedTime} (${dirLabel})`
      : `ซิงค์ล่าสุดเมื่อ ${formattedTime}`;
    styleClass =
      'border-emerald-200 bg-white/95 text-slate-700 hover:bg-emerald-50/60 dark:border-emerald-800 dark:bg-slate-900/95 dark:text-slate-200 dark:hover:bg-emerald-950/60';
  } else {
    label = 'Sheets Auto Sync พร้อมทำงาน';
    styleClass =
      'border-emerald-200 bg-white/95 text-emerald-800 hover:bg-emerald-50/60 dark:border-emerald-800 dark:bg-slate-900/95 dark:text-emerald-300 dark:hover:bg-emerald-950/60';
  }

  return (
    <button
      type="button"
      onClick={onOpenSyncModal}
      data-testid="sheets-sync-status-badge"
      title={errorMessage ?? 'คลิกเพื่อเปิดตั้งค่าหรือซิงค์ข้อมูลกับ Google Sheets'}
      className={`fixed bottom-3 left-3 sm:bottom-4 sm:left-4 z-30 inline-flex items-center gap-1.5 max-w-[calc(100vw-24px)] px-2.5 py-1.5 rounded-lg border backdrop-blur-sm shadow-sm text-[11px] font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${styleClass}`}
    >
      {!hasUrl ? (
        <CloudOff className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" aria-hidden="true" />
      ) : status === 'syncing' ? (
        <Loader2 className="w-3.5 h-3.5 text-blue-700 dark:text-blue-400 animate-spin shrink-0" aria-hidden="true" />
      ) : status === 'error' ? (
        <AlertTriangle className="w-3.5 h-3.5 text-red-600 dark:text-red-400 shrink-0" aria-hidden="true" />
      ) : autoSyncEnabled ? (
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
      ) : (
        <CloudCog className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" aria-hidden="true" />
      )}
      <span className="truncate font-sans tabular-nums">{label}</span>
    </button>
  );
}
