import { useState } from 'react';
import { Pencil, Search, Trash2 } from 'lucide-react';
import type { ServiceCategory, ServiceRecord } from '../types/maintenance';
import {
  CATEGORY_LABELS,
  filterServiceRecords,
  formatBaht,
  formatKm,
  formatThaiDate,
} from '../utils/maintenance';

interface ServiceHistoryTableProps {
  services: ServiceRecord[];
  onEditService: (service: ServiceRecord) => void;
  onDeleteService: (id: string) => Promise<void>;
  onOpenAddService: () => void;
}

const FILTER_OPTIONS: Array<{ id: ServiceCategory | 'all'; label: string }> = [
  { id: 'all', label: 'ทั้งหมด' },
  { id: 'engine_belt', label: CATEGORY_LABELS.engine_belt },
  { id: 'fluids', label: CATEGORY_LABELS.fluids },
  { id: 'filters', label: CATEGORY_LABELS.filters },
  { id: 'ac_electrical', label: CATEGORY_LABELS.ac_electrical },
  { id: 'brakes_tires', label: CATEGORY_LABELS.brakes_tires },
  { id: 'other', label: CATEGORY_LABELS.other },
];

export function ServiceHistoryTable({
  services,
  onEditService,
  onDeleteService,
  onOpenAddService,
}: ServiceHistoryTableProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<ServiceCategory | 'all'>('all');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const filtered = filterServiceRecords(services, searchQuery, selectedCategory);

  return (
    <section aria-labelledby="history-heading" className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h2
            id="history-heading"
            className="font-display text-xl sm:text-2xl font-semibold text-slate-900 text-balance"
          >
            ประวัติการเซอร์วิสและบำรุงรักษา
          </h2>
          <p className="text-sm text-slate-600 mt-0.5">
            แสดง {filtered.length} จากทั้งหมด {services.length} รายการ
          </p>
        </div>

        <div className="relative w-full sm:w-72">
          <label htmlFor="service-search" className="sr-only">
            ค้นหารายการเซอร์วิส
          </label>
          <Search
            className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <input
            id="service-search"
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ค้นหารายการ, เลขไมล์, หมายเหตุ..."
            className="w-full min-h-[40px] pl-9 pr-3 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
          />
        </div>
      </div>

      <div
        role="group"
        aria-label="กรองตามหมวดหมู่"
        className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto"
      >
        {FILTER_OPTIONS.map((opt) => {
          const active = selectedCategory === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => setSelectedCategory(opt.id)}
              className={`px-3 py-1.5 min-h-[36px] text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                active
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-3">
          <p className="text-sm font-medium text-slate-700">
            {services.length === 0
              ? 'ยังไม่มีประวัติการเซอร์วิส'
              : 'ไม่พบรายการเซอร์วิสที่ตรงกับคำค้นหาหรือหมวดหมู่ที่เลือก'}
          </p>
          {services.length === 0 ? (
            <button
              type="button"
              onClick={onOpenAddService}
              className="px-4 py-2 min-h-[40px] rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 cursor-pointer"
            >
              บันทึกรายการแรก
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('all');
              }}
              className="px-4 py-2 min-h-[40px] rounded-lg border border-slate-300 bg-white text-slate-700 text-sm font-medium hover:bg-slate-50 cursor-pointer"
            >
              ล้างตัวกรอง
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                  <th className="py-3 px-4 whitespace-nowrap">วันที่</th>
                  <th className="py-3 px-4">รายการและรายละเอียด</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">เลขไมล์ (กม.)</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">ค่าอะไหล่</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">ค่าแรง</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">รวม (บาท)</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filtered.map((record) => {
                  const isConfirming = confirmDeleteId === record.id;
                  return (
                    <tr
                      key={record.id}
                      className="hover:bg-slate-50/80 transition-colors align-top"
                    >
                      <td className="py-3.5 px-4 whitespace-nowrap text-slate-600 font-mono text-xs sm:text-sm tabular-nums">
                        {formatThaiDate(record.date, 'short')}
                      </td>
                      <td className="py-3.5 px-4 min-w-[240px]">
                        <p className="font-medium text-slate-900">{record.title}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {CATEGORY_LABELS[record.category]}
                          {record.intervalKm
                            ? ` · รอบถัดไป +${formatKm(record.intervalKm)} กม. (${formatKm(
                                record.odometer + record.intervalKm
                              )} กม.)`
                            : ''}
                        </p>
                        {record.notes && (
                          <p className="text-xs text-slate-600 mt-1">{record.notes}</p>
                        )}
                        {record.revisionNote && (
                          <p className="text-xs text-blue-700 mt-1">
                            {record.revisionNote}
                          </p>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap font-mono tabular-nums text-slate-900">
                        {formatKm(record.odometer)}
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap font-mono tabular-nums text-slate-600">
                        {record.partsCost > 0 ? formatBaht(record.partsCost) : '—'}
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap font-mono tabular-nums text-slate-600">
                        {record.laborCost > 0 ? formatBaht(record.laborCost) : '—'}
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap font-mono tabular-nums font-semibold text-slate-900">
                        {record.totalCost > 0 ? formatBaht(record.totalCost) : '—'}
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        {isConfirming ? (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={async () => {
                                await onDeleteService(record.id);
                                setConfirmDeleteId(null);
                              }}
                              className="px-2.5 py-1.5 rounded bg-red-600 hover:bg-red-700 text-white text-xs font-medium cursor-pointer"
                            >
                              ยืนยันลบ
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-2.5 py-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium cursor-pointer"
                            >
                              ยกเลิก
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => onEditService(record)}
                              aria-label={`แก้ไข ${record.title}`}
                              className="p-2 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                            >
                              <Pencil className="w-4 h-4" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(record.id)}
                              aria-label={`ลบ ${record.title}`}
                              className="p-2 rounded-md text-slate-500 hover:text-red-700 hover:bg-red-50 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                            >
                              <Trash2 className="w-4 h-4" aria-hidden="true" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
