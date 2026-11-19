import { useState } from 'react';
import { BarChart3 } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { MonthlyCostComparisonPoint, ServiceRecord } from '../types/maintenance';
import { computeMonthlyPartsVsLabor, formatBaht } from '../utils/maintenance';

interface MonthlyMaintenanceChartProps {
  services: ServiceRecord[];
  isDark?: boolean;
}

type ChartMode = 'grouped' | 'stacked';

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    payload: MonthlyCostComparisonPoint;
  }>;
}

function CustomMonthlyTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const item = payload[0].payload;

  return (
    <div className="bg-slate-900 text-white rounded-lg px-3.5 py-2.5 shadow-lg border border-slate-800 text-xs space-y-1.5 min-w-[190px]">
      <div className="flex items-center justify-between gap-4 border-b border-slate-700 pb-1">
        <span className="font-semibold text-white">{item.monthLabel}</span>
        <span className="text-slate-300">{item.recordCount} รายการ</span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-slate-300">ค่าอะไหล่ ({item.partsPercent}%)</span>
        <span className="font-mono font-semibold text-blue-300 tabular-nums">
          {formatBaht(item.partsCost)} บาท
        </span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-slate-300">ค่าแรง ({item.laborPercent}%)</span>
        <span className="font-mono font-semibold text-amber-300 tabular-nums">
          {formatBaht(item.laborCost)} บาท
        </span>
      </div>
      <div className="flex items-center justify-between gap-4 border-t border-slate-700 pt-1">
        <span className="text-slate-200 font-medium">รวมสุทธิ</span>
        <span className="font-mono font-bold text-white tabular-nums">
          {formatBaht(item.totalCost)} บาท
        </span>
      </div>
    </div>
  );
}

export function MonthlyMaintenanceChart({
  services,
  isDark = false,
}: MonthlyMaintenanceChartProps) {
  const [chartMode, setChartMode] = useState<ChartMode>('grouped');
  const monthlyData = computeMonthlyPartsVsLabor(services);

  const totalParts = monthlyData.reduce((sum, m) => sum + m.partsCost, 0);
  const totalLabor = monthlyData.reduce((sum, m) => sum + m.laborCost, 0);
  const grandTotal = totalParts + totalLabor;
  const partsShare = grandTotal > 0 ? Number(((totalParts / grandTotal) * 100).toFixed(1)) : 0;
  const laborShare = grandTotal > 0 ? Number((100 - partsShare).toFixed(1)) : 0;

  return (
    <section
      aria-labelledby="monthly-parts-labor-heading"
      data-testid="monthly-maintenance-chart"
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-5 transition-colors"
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2
            id="monthly-parts-labor-heading"
            className="font-display text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2"
          >
            <BarChart3 className="w-5 h-5 text-blue-700 dark:text-blue-400 shrink-0" aria-hidden="true" />
            <span>เปรียบเทียบค่าใช้จ่ายรายเดือน: ค่าอะไหล่ vs ค่าแรง</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            ค่าอะไหล่สะสม{' '}
            <strong className="font-mono tabular-nums text-slate-800 dark:text-slate-200">
              {formatBaht(totalParts)} บาท ({partsShare}%)
            </strong>{' '}
            · ค่าแรงสะสม{' '}
            <strong className="font-mono tabular-nums text-slate-800 dark:text-slate-200">
              {formatBaht(totalLabor)} บาท ({laborShare}%)
            </strong>
          </p>
        </div>

        <div
          role="group"
          aria-label="รูปแบบการแสดงแผนภูมิ"
          className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg self-start lg:self-auto"
        >
          <button
            type="button"
            onClick={() => setChartMode('grouped')}
            aria-pressed={chartMode === 'grouped'}
            className={`px-3 py-1.5 min-h-[34px] rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              chartMode === 'grouped'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            แท่งคู่เปรียบเทียบ
          </button>
          <button
            type="button"
            onClick={() => setChartMode('stacked')}
            aria-pressed={chartMode === 'stacked'}
            className={`px-3 py-1.5 min-h-[34px] rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              chartMode === 'stacked'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            แท่งซ้อนสัดส่วน
          </button>
        </div>
      </div>

      {monthlyData.length === 0 || grandTotal === 0 ? (
        <div className="h-56 flex items-center justify-center border border-dashed border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-500 dark:text-slate-400">
          ยังไม่มีรายการซ่อมบำรุงที่มีค่าอะไหล่หรือค่าแรงสำหรับเปรียบเทียบรายเดือน
        </div>
      ) : (
        <div className="space-y-4">
          <div className="w-full h-64 sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={monthlyData}
                margin={{ top: 12, right: 16, left: 4, bottom: 8 }}
                barGap={6}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke={isDark ? '#1e293b' : '#e2e8f0'}
                />
                <XAxis
                  dataKey="monthLabel"
                  tick={{ fill: isDark ? '#94a3b8' : '#475569', fontSize: 12 }}
                  axisLine={{ stroke: isDark ? '#334155' : '#cbd5e1' }}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(val: number) => formatBaht(val)}
                  tick={{ fill: isDark ? '#94a3b8' : '#64748b', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={56}
                />
                <Tooltip
                  content={<CustomMonthlyTooltip />}
                  cursor={{ fill: isDark ? 'rgba(148, 163, 184, 0.08)' : 'rgba(148, 163, 184, 0.12)' }}
                />
                <Legend
                  wrapperStyle={{
                    fontSize: '12px',
                    paddingTop: '8px',
                    color: isDark ? '#cbd5e1' : '#334155',
                  }}
                  iconType="square"
                />
                <Bar
                  dataKey="partsCost"
                  name="ค่าอะไหล่ (บาท)"
                  fill={isDark ? '#3b82f6' : '#1d4ed8'}
                  stackId={chartMode === 'stacked' ? 'cost' : undefined}
                  radius={chartMode === 'stacked' ? [0, 0, 0, 0] : [4, 4, 0, 0]}
                  maxBarSize={48}
                />
                <Bar
                  dataKey="laborCost"
                  name="ค่าแรง (บาท)"
                  fill={isDark ? '#f59e0b' : '#d97706'}
                  stackId={chartMode === 'stacked' ? 'cost' : undefined}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={48}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="overflow-x-auto border-t border-slate-100 dark:border-slate-800 pt-3">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="text-xs font-medium text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <th className="py-2 pr-4">เดือน</th>
                  <th className="py-2 px-3 text-right">จำนวนรายการ</th>
                  <th className="py-2 px-3 text-right">ค่าอะไหล่ (บาท)</th>
                  <th className="py-2 px-3 text-right">ค่าแรง (บาท)</th>
                  <th className="py-2 pl-3 text-right">รวม (บาท)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {monthlyData.map((row) => (
                  <tr key={row.monthKey} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/60">
                    <td className="py-2.5 pr-4 font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">
                      {row.monthLabel}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                      {row.recordCount}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-blue-700 dark:text-blue-400 font-medium">
                      {formatBaht(row.partsCost)} ({row.partsPercent}%)
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-amber-700 dark:text-amber-400 font-medium">
                      {formatBaht(row.laborCost)} ({row.laborPercent}%)
                    </td>
                    <td className="py-2.5 pl-3 text-right font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                      {formatBaht(row.totalCost)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
