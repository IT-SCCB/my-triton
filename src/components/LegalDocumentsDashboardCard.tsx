import {
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  FileText,
  Phone,
  Plus,
  ShieldCheck,
} from 'lucide-react';
import type { LegalDocuments } from '../types/maintenance';
import {
  evaluateLegalDocumentAlerts,
  evaluateLegalDocumentItem,
  formatLegalExpiryCountdown,
  LEGAL_DOC_TYPE_LABELS,
  sortLegalDocuments,
} from '../utils/legalDocuments';
import { formatThaiDate } from '../utils/maintenance';

interface LegalDocumentsDashboardCardProps {
  documents: LegalDocuments[];
  onOpenModal: (docId?: string | null) => void;
}

export function LegalDocumentsDashboardCard({
  documents,
  onOpenModal,
}: LegalDocumentsDashboardCardProps) {
  const alerts = evaluateLegalDocumentAlerts(documents);
  const sortedDocs = sortLegalDocuments(documents);
  const hasExpired = alerts.some((a) => a.status === 'expired');
  const hasExpiringSoon = alerts.some((a) => a.status === 'expiring_soon');

  return (
    <section
      aria-labelledby="legal-docs-dashboard-heading"
      data-testid="legal-documents-dashboard-card"
      className={`rounded-xl border p-4 sm:p-5 space-y-3 transition-colors duration-200 ${
        hasExpired
          ? 'bg-red-50/70 dark:bg-red-950/25 border-red-200 dark:border-red-900/70'
          : hasExpiringSoon
            ? 'bg-amber-50/70 dark:bg-amber-950/25 border-amber-200 dark:border-amber-800/70'
            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className={`p-2 rounded-lg shrink-0 ${
              hasExpired
                ? 'bg-red-100 dark:bg-red-950/70 text-red-700 dark:text-red-300'
                : hasExpiringSoon
                  ? 'bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300'
                  : 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400'
            }`}
          >
            {hasExpired ? (
              <AlertOctagon className="w-5 h-5" aria-hidden="true" />
            ) : hasExpiringSoon ? (
              <AlertTriangle className="w-5 h-5" aria-hidden="true" />
            ) : (
              <ShieldCheck className="w-5 h-5" aria-hidden="true" />
            )}
          </div>

          <div className="min-w-0">
            <h2
              id="legal-docs-dashboard-heading"
              className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100"
            >
              พ.ร.บ. / ประกันภัย &amp; ทะเบียนรถยนต์
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              {alerts.length > 0
                ? hasExpired
                  ? `มีเอกสารหมดอายุหรือใกล้หมดอายุ ${alerts.length} รายการ (รีบตรวจสอบต่ออายุ)`
                  : `แจ้งเตือนใกล้ครบกำหนดต่ออายุ ${alerts.length} รายการ`
                : sortedDocs.length > 0
                  ? `บันทึกไว้ ${sortedDocs.length} รายการ · สถานะปกติทั้งหมด`
                  : 'เก็บข้อมูล พ.ร.บ. ประกันรถยนต์ ป้ายภาษี พร้อมถ่ายรูปและตั้งแจ้งเตือนวันหมดอายุ'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onOpenModal(null)}
          data-testid="open-legal-docs-card-btn"
          className="inline-flex items-center gap-1.5 min-h-[38px] px-3.5 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-white text-white dark:text-slate-900 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer"
        >
          {sortedDocs.length === 0 ? (
            <>
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>เพิ่ม พ.ร.บ. / ประกัน / ทะเบียน</span>
            </>
          ) : (
            <>
              <span>จัดการเอกสาร ({sortedDocs.length})</span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </>
          )}
        </button>
      </div>

      {sortedDocs.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
          {sortedDocs.slice(0, 3).map((docItem) => {
            const evaluated = evaluateLegalDocumentItem(docItem);
            const isExpired = evaluated?.status === 'expired';
            const isSoon = evaluated?.status === 'expiring_soon';

            return (
              <div
                key={docItem.id}
                className="rounded-lg border border-slate-200/90 dark:border-slate-800 bg-white/95 dark:bg-slate-950/60 p-3 flex items-start gap-3 justify-between"
              >
                <div className="flex items-start gap-2.5 min-w-0">
                  {docItem.imageDataUrl ? (
                    <img
                      src={docItem.imageDataUrl}
                      alt={docItem.title}
                      className="w-11 h-11 rounded object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                    />
                  ) : (
                    <div className="w-11 h-11 rounded bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400 shrink-0">
                      <FileText className="w-4 h-4" aria-hidden="true" />
                    </div>
                  )}

                  <div className="min-w-0 space-y-0.5">
                    <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate">
                      {LEGAL_DOC_TYPE_LABELS[docItem.docType]}
                    </p>
                    <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                      {docItem.title}
                    </p>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 flex items-center gap-1">
                      <CalendarClock className="w-3 h-3 shrink-0" aria-hidden="true" />
                      <span>หมดอายุ {formatThaiDate(docItem.expiryDate, 'short')}</span>
                    </p>
                    {evaluated && (
                      <p
                        className={`text-[11px] font-semibold inline-flex items-center gap-1 ${
                          isExpired
                            ? 'text-red-700 dark:text-red-400'
                            : isSoon
                              ? 'text-amber-700 dark:text-amber-400'
                              : 'text-emerald-700 dark:text-emerald-400'
                        }`}
                      >
                        {!isExpired && !isSoon && (
                          <CheckCircle2 className="w-3 h-3 shrink-0" aria-hidden="true" />
                        )}
                        <span>{formatLegalExpiryCountdown(evaluated.daysRemaining)}</span>
                      </p>
                    )}
                    {docItem.emergencyPhone && (
                      <p className="text-[11px] text-blue-700 dark:text-blue-400 flex items-center gap-1">
                        <Phone className="w-3 h-3 shrink-0" aria-hidden="true" />
                        <a href={`tel:${docItem.emergencyPhone}`} className="hover:underline">
                          {docItem.emergencyPhone}
                        </a>
                      </p>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onOpenModal(docItem.id)}
                  className="text-[11px] font-medium text-blue-700 dark:text-blue-400 hover:underline shrink-0 cursor-pointer"
                >
                  ดู/แก้ไข
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
