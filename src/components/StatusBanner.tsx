import { AlertOctagon, AlertTriangle, ArrowRight, CheckCircle2 } from 'lucide-react';
import type { FleetHealthBanner } from '../types/maintenance';

interface StatusBannerProps {
  banner: FleetHealthBanner;
  onViewSchedule?: () => void;
}

export function StatusBanner({ banner, onViewSchedule }: StatusBannerProps) {
  const styles =
    banner.level === 'overdue'
      ? {
          bg: 'bg-red-700 text-white',
          btn: 'bg-white/15 hover:bg-white/25 text-white',
          Icon: AlertOctagon,
        }
      : banner.level === 'warning'
        ? {
            bg: 'bg-amber-400 text-slate-950',
            btn: 'bg-slate-950/10 hover:bg-slate-950/20 text-slate-950',
            Icon: AlertTriangle,
          }
        : {
            bg: 'bg-emerald-700 text-white',
            btn: '',
            Icon: CheckCircle2,
          };

  const BannerIcon = styles.Icon;

  return (
    <div
      role="status"
      data-testid="fleet-status-banner"
      className={`${styles.bg} px-4 py-2 text-xs sm:text-sm font-medium transition-colors duration-200`}
    >
      <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-2 sm:gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <BannerIcon className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{banner.message}</span>
        </div>

        {banner.level !== 'nominal' && onViewSchedule && (
          <button
            type="button"
            onClick={onViewSchedule}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${styles.btn}`}
          >
            <span>ตรวจสอบระยะซ่อม</span>
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}
