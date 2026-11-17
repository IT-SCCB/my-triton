import { useState } from 'react';
import { Activity, AlertTriangle, Gauge, PieChart, TrendingUp } from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {
  CostSummary,
  FuelLogEntry,
  MonthlyMaintenanceTrendPoint,
  OdometerLogEntry,
  OdometerTrendPoint,
  ServiceRecord,
} from '../types/maintenance';
import {
  computeFuelKmlFromFormula,
  computeMaintenanceCostTrend,
  computeOdometerTrend,
  formatBaht,
  formatKm,
  formatThaiDate,
  getFuelChartLogs,
  getRecordedFuelKml,
  isFuelKmlOutOfRange,
  isRealisticFuelKml,
  MAX_REALISTIC_KML,
  MIN_REALISTIC_KML,
  sortFuelLogsChronological,
} from '../utils/maintenance';

interface AnalyticsSectionProps {
  fuelLogs: FuelLogEntry[];
  costSummary: CostSummary;
  services: ServiceRecord[];
  odometerLogs: OdometerLogEntry[];
  onEditFuelLog?: (log: FuelLogEntry) => void;
}

interface FuelChartPoint extends FuelLogEntry {
  shortDate: string;
  isAnomaly: boolean;
}

interface FuelTooltipProps {
  active?: boolean;
  payload?: Array<{
    payload: FuelChartPoint;
  }>;
}

function CustomFuelTooltip({ active, payload }: FuelTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const item = payload[0].payload;

  return (
    <div className="bg-slate-900 text-white rounded-lg px-3.5 py-2.5 shadow-lg border border-slate-800 text-xs space-y-1.5 min-w-[220px]">
      <div className="flex items-center justify-between gap-4 border-b border-slate-700 pb-1">
        <span className="font-semibold text-white">
          {formatThaiDate(item.date, 'short')}
        </span>
        <span className="font-mono text-slate-300 tabular-nums">
          ไมล์ {formatKm(item.odometer)} กม.
        </span>
      </div>

      <div className="flex items-center justify-between gap-4">
        <span className="text-slate-300">อัตราสิ้นเปลือง</span>
        <span
          className={`font-mono font-bold tabular-nums ${
            item.isAnomaly ? 'text-amber-300' : 'text-emerald-300'
          }`}
        >
          {item.kml.toFixed(2)} กม./ลิตร
        </span>
      </div>

      <div className="flex items-center justify-between gap-4">
        <span className="text-slate-300">ยอดเติม / ปริมาณ</span>
        <span className="font-mono text-slate-100 tabular-nums">
          {formatBaht(item.amount, 0)} บ. ({item.liters.toFixed(2)} ล.)
        </span>
      </div>

      {item.distance > 0 && (
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-300">ระยะทางวิ่งรอบนี้</span>
          <span className="font-mono text-slate-100 tabular-nums">
            +{formatKm(item.distance)} กม.
          </span>
        </div>
      )}

      <p className="text-[11px] text-slate-300 border-t border-slate-700 pt-1 truncate max-w-[240px]">
        {item.note || 'เติมน้ำมันดีเซล'}
      </p>

      {item.isAnomaly && (
        <p className="text-[11px] font-medium text-slate-300">
          ไม่เต็มถัง / ข้ามรอบ (นอกช่วง {MIN_REALISTIC_KML}–{MAX_REALISTIC_KML} กม./ล. · ไม่นำมาคิดค่าเฉลี่ย)
        </p>
      )}
    </div>
  );
}

interface CustomFuelDotProps {
  cx?: number;
  cy?: number;
  index?: number;
  payload?: FuelChartPoint;
  totalCount: number;
  selectedId?: string | null;
}

function CustomFuelDot({
  cx,
  cy,
  index,
  payload,
  totalCount,
  selectedId,
}: CustomFuelDotProps) {
  if (typeof cx !== 'number' || typeof cy !== 'number' || !payload) {
    return <g key={`fuel-empty-${index ?? 0}`} />;
  }

  const isSelected = selectedId === payload.id;
  if (payload.isAnomaly) {
    return (
      <circle
        key={`fuel-dot-${payload.id}`}
        cx={cx}
        cy={cy}
        r={5.5}
        fill="#d97706"
        stroke="#ffffff"
        strokeWidth={2}
      />
    );
  }

  if (totalCount <= 28 || isSelected) {
    return (
      <circle
        key={`fuel-dot-${payload.id}`}
        cx={cx}
        cy={cy}
        r={isSelected ? 5.5 : 3.5}
        fill="#ffffff"
        stroke="#059669"
        strokeWidth={isSelected ? 3 : 2}
      />
    );
  }

  return <g key={`fuel-dot-${payload.id}`} />;
}

interface TrendTooltipProps {
  active?: boolean;
  payload?: Array<{
    payload: MonthlyMaintenanceTrendPoint;
  }>;
}

function CustomTrendTooltip({ active, payload }: TrendTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const item = payload[0].payload;

  const deltaText =
    item.momDelta === null
      ? 'เดือนแรกของช่วง'
      : item.momDelta === 0
        ? 'เท่ากับเดือนก่อน'
        : `${item.momDelta > 0 ? '+' : ''}${formatBaht(item.momDelta)} บาท${
            item.momPercent !== null
              ? ` (${item.momPercent > 0 ? '+' : ''}${item.momPercent}%)`
              : ''
          }`;

  return (
    <div className="bg-slate-900 text-white rounded-lg px-3.5 py-2.5 shadow-lg border border-slate-800 text-xs space-y-1.5 min-w-[220px]">
      <div className="flex items-center justify-between gap-4 border-b border-slate-700 pb-1">
        <span className="font-semibold text-white">{item.monthLabel}</span>
        <span className="text-slate-300 font-mono tabular-nums">
          {item.recordCount} รายการ
        </span>
      </div>

      <div className="flex items-center justify-between gap-4">
        <span className="text-slate-300">ค่าใช้จ่ายรวม</span>
        <span className="font-mono font-bold text-white tabular-nums">
          {formatBaht(item.totalCost)} บาท
        </span>
      </div>

      <div className="flex items-center justify-between gap-4">
        <span className="text-slate-300">เทียบเดือนก่อน (MoM)</span>
        <span
          className={`font-mono font-semibold tabular-nums ${
            item.momDelta !== null && item.momDelta > 0
              ? 'text-amber-300'
              : item.momDelta !== null && item.momDelta < 0
                ? 'text-emerald-300'
                : 'text-slate-300'
          }`}
        >
          {deltaText}
        </span>
      </div>

      {item.topServiceTitle && (
        <p className="text-[11px] text-slate-300 border-t border-slate-700 pt-1 truncate max-w-[240px]">
          รายการหลัก: {item.topServiceTitle}
        </p>
      )}

      {item.isSpike && (
        <p className="text-[11px] font-medium text-amber-300">
          จุดพีคค่าใช้จ่ายสูงกว่าค่าเฉลี่ยรายเดือน
        </p>
      )}
    </div>
  );
}

interface CustomTrendDotProps {
  cx?: number;
  cy?: number;
  index?: number;
  payload?: MonthlyMaintenanceTrendPoint;
}

function CustomTrendDot({ cx, cy, index, payload }: CustomTrendDotProps) {
  if (typeof cx !== 'number' || typeof cy !== 'number' || !payload) {
    return <g key={`empty-${index ?? 0}`} />;
  }

  if (payload.isSpike) {
    return (
      <circle
        key={`dot-${payload.monthKey}`}
        cx={cx}
        cy={cy}
        r={5.5}
        fill="#d97706"
        stroke="#ffffff"
        strokeWidth={2}
      />
    );
  }

  if (payload.totalCost > 0) {
    return (
      <circle
        key={`dot-${payload.monthKey}`}
        cx={cx}
        cy={cy}
        r={4}
        fill="#1d4ed8"
        stroke="#ffffff"
        strokeWidth={2}
      />
    );
  }

  return (
    <circle
      key={`dot-${payload.monthKey}`}
      cx={cx}
      cy={cy}
      r={2.5}
      fill="#cbd5e1"
      stroke="#ffffff"
      strokeWidth={1}
    />
  );
}

interface OdometerTooltipProps {
  active?: boolean;
  payload?: Array<{
    payload: OdometerTrendPoint;
  }>;
}

function CustomOdometerTooltip({ active, payload }: OdometerTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const item = payload[0].payload;

  return (
    <div className="bg-slate-900 text-white rounded-lg px-3.5 py-2.5 shadow-lg border border-slate-800 text-xs space-y-1.5 min-w-[230px]">
      <div className="flex items-center justify-between gap-4 border-b border-slate-700 pb-1">
        <span className="font-semibold text-white">{item.fullDate}</span>
        <span className="font-mono font-bold text-indigo-300 tabular-nums">
          {formatKm(item.odometer)} กม.
        </span>
      </div>

      {item.deltaKm !== 0 && (
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-300">เปลี่ยนแปลงจากจุดก่อน</span>
          <span
            className={`font-mono font-semibold tabular-nums ${
              item.deltaKm > 0 ? 'text-emerald-300' : 'text-amber-300'
            }`}
          >
            {item.deltaKm > 0 ? '+' : ''}
            {formatKm(item.deltaKm)} กม.
            {item.daysSincePrev > 0 ? ` (${item.daysSincePrev} วัน)` : ''}
          </span>
        </div>
      )}

      {item.dailyRateKm !== null && (
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-300">เฉลี่ยใช้งานช่วงนี้</span>
          <span className="font-mono text-slate-100 tabular-nums">
            ~{item.dailyRateKm.toFixed(1)} กม./วัน
          </span>
        </div>
      )}

      <p className="text-[11px] text-slate-300 border-t border-slate-700 pt-1 truncate max-w-[250px]">
        แหล่งที่มา: {item.source}
      </p>
      {item.note && (
        <p className="text-[11px] text-slate-400 truncate max-w-[250px]">
          {item.note}
        </p>
      )}
    </div>
  );
}

export function AnalyticsSection({
  fuelLogs,
  costSummary,
  services,
  odometerLogs,
  onEditFuelLog,
}: AnalyticsSectionProps) {
  const [showOutliers, setShowOutliers] = useState(false);
  const [fuelRange, setFuelRange] = useState<'recent' | 'all'>('recent');
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const [trendRange, setTrendRange] = useState<'12m' | '6m'>('12m');
  const [odometerRange, setOdometerRange] = useState<'all' | '90d' | '30d'>('all');

  const chronologicalAll = sortFuelLogsChronological(fuelLogs);
  const outlierLogs = chronologicalAll.filter((l) => {
    const kml = getRecordedFuelKml(l) || computeFuelKmlFromFormula(l.distance, l.liters);
    return isFuelKmlOutOfRange(kml);
  });
  const totalPositiveCount = chronologicalAll.filter(
    (l) => (getRecordedFuelKml(l) || computeFuelKmlFromFormula(l.distance, l.liters)) > 0
  ).length;

  const chartLogs = getFuelChartLogs(fuelLogs, {
    includeOutliers: showOutliers,
    limit: fuelRange === 'recent' ? 20 : null,
  });

  const fuelChartData: FuelChartPoint[] = chartLogs.map((l) => ({
    ...l,
    shortDate: formatThaiDate(l.date, 'short'),
    isAnomaly: isFuelKmlOutOfRange(l.kml),
  }));

  const selectedLog =
    fuelChartData.find((l) => l.id === selectedLogId) ??
    fuelChartData[fuelChartData.length - 1] ??
    null;

  const realisticChartLogs = chartLogs.filter((l) => isRealisticFuelKml(l.kml));
  const chartAvgKml =
    realisticChartLogs.length > 0
      ? Number(
          (
            realisticChartLogs.reduce((sum, l) => sum + l.kml, 0) /
            realisticChartLogs.length
          ).toFixed(2)
        )
      : 0;

  const kmlValues = fuelChartData.map((d) => d.kml);
  const yDomainMin =
    kmlValues.length > 0 ? Math.max(0, Math.floor(Math.min(...kmlValues) - 1)) : 0;
  const yDomainMax =
    kmlValues.length > 0 ? Math.ceil(Math.max(...kmlValues) + 2) : 20;

  const trend = computeMaintenanceCostTrend(
    services,
    undefined,
    trendRange === '12m' ? 12 : 6
  );

  const odometerTrend = computeOdometerTrend(
    odometerLogs,
    odometerRange === '90d' ? 90 : odometerRange === '30d' ? 30 : null
  );
  const odoSpan = Math.max(200, odometerTrend.maxOdometer - odometerTrend.minOdometer);
  const odoPad = Math.max(100, Math.round(odoSpan * 0.15));
  const odoYMin = Math.max(0, Math.floor((odometerTrend.minOdometer - odoPad) / 100) * 100);
  const odoYMax = Math.ceil((odometerTrend.maxOdometer + odoPad) / 100) * 100;

  // SVG Donut math
  const radius = 56;
  const circumference = 2 * Math.PI * radius;
  const fuelDash = (costSummary.fuelPercentShare / 100) * circumference;
  const maintDash = circumference - fuelDash;

  return (
    <section aria-label="กราฟและสถิติวิเคราะห์" className="space-y-4 sm:space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
        {/* Fuel Efficiency Trend (Recharts with outlier guard) */}
        <div
          data-testid="fuel-efficiency-chart"
          className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-5 sm:p-6 flex flex-col justify-between gap-4"
        >
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-base sm:text-lg font-semibold text-slate-900 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-emerald-700 shrink-0" aria-hidden="true" />
                <span>กราฟแนวโน้มอัตราสิ้นเปลือง (กม./ลิตร)</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {selectedLog ? (
                  <>
                    ล่าสุดที่เลือก:{' '}
                    <strong className="font-mono text-emerald-700 tabular-nums">
                      {selectedLog.kml.toFixed(2)} กม./ลิตร
                    </strong>{' '}
                    ({formatThaiDate(selectedLog.date, 'short')} · {selectedLog.note || 'ดีเซล'})
                  </>
                ) : (
                  'เปรียบเทียบประสิทธิภาพการใช้น้ำมันแต่ละรอบการเติม'
                )}
              </p>
            </div>

            {totalPositiveCount > 20 && (
              <div
                role="group"
                aria-label="ช่วงจำนวนรอบการเติมน้ำมัน"
                className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start shrink-0"
              >
                <button
                  type="button"
                  onClick={() => setFuelRange('recent')}
                  aria-pressed={fuelRange === 'recent'}
                  className={`px-2.5 py-1 min-h-[30px] rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    fuelRange === 'recent'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  20 รอบล่าสุด
                </button>
                <button
                  type="button"
                  onClick={() => setFuelRange('all')}
                  aria-pressed={fuelRange === 'all'}
                  className={`px-2.5 py-1 min-h-[30px] rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    fuelRange === 'all'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  ทั้งหมด ({showOutliers ? totalPositiveCount : totalPositiveCount - outlierLogs.length})
                </button>
              </div>
            )}
          </div>

          {fuelChartData.length === 0 ? (
            <div className="h-52 flex items-center justify-center text-sm text-slate-500">
              ยังไม่มีข้อมูลอัตราสิ้นเปลืองสำหรับแสดงกราฟ
            </div>
          ) : (
            <div className="w-full h-56 sm:h-60">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={fuelChartData}
                  margin={{ top: 14, right: 20, left: 0, bottom: 4 }}
                  onClick={(chartState) => {
                    const idx = chartState?.activeTooltipIndex;
                    if (typeof idx === 'number' && fuelChartData[idx]) {
                      setSelectedLogId(fuelChartData[idx].id);
                    }
                  }}
                >
                  <defs>
                    <linearGradient id="fuelAreaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#059669" stopOpacity={0.22} />
                      <stop offset="100%" stopColor="#059669" stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis
                    dataKey="shortDate"
                    tick={{ fill: '#64748b', fontSize: 11 }}
                    axisLine={{ stroke: '#cbd5e1' }}
                    tickLine={false}
                    minTickGap={34}
                  />
                  <YAxis
                    domain={[yDomainMin, yDomainMax]}
                    tickFormatter={(v: number) => `${v}`}
                    tick={{ fill: '#64748b', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={36}
                  />
                  <Tooltip
                    content={<CustomFuelTooltip />}
                    cursor={{ stroke: '#94a3b8', strokeDasharray: '3 3' }}
                  />
                  {chartAvgKml > 0 && !showOutliers && (
                    <ReferenceLine
                      y={chartAvgKml}
                      stroke="#64748b"
                      strokeDasharray="4 4"
                      label={{
                        value: `เฉลี่ย ${chartAvgKml.toFixed(2)} กม./ล.`,
                        position: 'insideTopRight',
                        fill: '#475569',
                        fontSize: 11,
                      }}
                    />
                  )}
                  <Area
                    type="monotone"
                    dataKey="kml"
                    name="อัตราสิ้นเปลือง (กม./ลิตร)"
                    stroke="#059669"
                    strokeWidth={2.25}
                    fill="url(#fuelAreaGrad)"
                    animationDuration={200}
                    dot={(dotProps) => (
                      <CustomFuelDot
                        key={dotProps.index}
                        cx={dotProps.cx}
                        cy={dotProps.cy}
                        index={dotProps.index}
                        payload={dotProps.payload as FuelChartPoint}
                        totalCount={fuelChartData.length}
                        selectedId={selectedLog?.id}
                      />
                    )}
                    activeDot={{
                      r: 6,
                      fill: '#059669',
                      stroke: '#ffffff',
                      strokeWidth: 2,
                    }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {outlierLogs.length > 0 && (
            <div
              data-testid="fuel-outlier-banner"
              className="pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs"
            >
              <div className="flex items-center gap-1.5 text-slate-600">
                <AlertTriangle className="w-3.5 h-3.5 text-slate-500 shrink-0" aria-hidden="true" />
                <span>
                  {showOutliers
                    ? `กำลังแสดงรวมรอบไม่เต็มถัง / ข้ามรอบ ${outlierLogs.length} รายการ (นอกช่วง ${MIN_REALISTIC_KML}–${MAX_REALISTIC_KML} กม./ล.)`
                    : `ซ่อนรอบไม่เต็มถัง / ข้ามรอบ ${outlierLogs.length} รายการ (นอกช่วง ${MIN_REALISTIC_KML}–${MAX_REALISTIC_KML} กม./ล.) เพื่อให้กราฟและค่าเฉลี่ยตรงสมรรถนะจริง`}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  data-testid="toggle-fuel-outliers-btn"
                  onClick={() => setShowOutliers((prev) => !prev)}
                  className="font-medium text-slate-700 hover:text-slate-900 underline underline-offset-2 cursor-pointer"
                >
                  {showOutliers
                    ? `แสดงเฉพาะรอบปกติ (${MIN_REALISTIC_KML}–${MAX_REALISTIC_KML} กม./ล.)`
                    : 'ดูกราฟแบบรวมรอบข้าม'}
                </button>
                {onEditFuelLog && (
                  <button
                    type="button"
                    data-testid="fix-outlier-fuel-btn"
                    onClick={() => onEditFuelLog(outlierLogs[0])}
                    className="font-medium text-blue-700 hover:text-blue-900 cursor-pointer"
                  >
                    ตรวจสอบรายการ
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Expense Breakdown Donut */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 sm:p-6 flex flex-col justify-between gap-4">
          <div>
            <h2 className="font-display text-base sm:text-lg font-semibold text-slate-900 flex items-center gap-2">
              <PieChart className="w-5 h-5 text-blue-700 shrink-0" aria-hidden="true" />
              <span>สัดส่วนค่าใช้จ่าย</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              แยกตามหมวดหมู่เชื้อเพลิงและซ่อมบำรุง
            </p>
          </div>

          <div className="flex items-center justify-center py-2">
            <div className="relative w-36 h-36 flex items-center justify-center">
              <svg viewBox="0 0 140 140" className="w-full h-full -rotate-90" aria-hidden="true">
                <circle
                  cx="70"
                  cy="70"
                  r={radius}
                  fill="none"
                  stroke="#1d4ed8"
                  strokeWidth="16"
                  strokeDasharray={`${maintDash} ${circumference}`}
                  strokeDashoffset={-fuelDash}
                />
                <circle
                  cx="70"
                  cy="70"
                  r={radius}
                  fill="none"
                  stroke="#059669"
                  strokeWidth="16"
                  strokeDasharray={`${fuelDash} ${circumference}`}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-[11px] text-slate-500">รวมสุทธิ</span>
                <span className="font-mono text-base font-bold text-slate-900 tabular-nums">
                  {formatBaht(costSummary.totalCost)} ฿
                </span>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 space-y-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-slate-600">
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-600 shrink-0" aria-hidden="true" />
                <span>ค่าน้ำมันเชื้อเพลิง</span>
              </span>
              <span className="font-mono font-semibold text-slate-900 tabular-nums">
                {costSummary.fuelPercentShare}% ({formatBaht(costSummary.totalFuelCost)} บ.)
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-slate-600">
                <span className="w-2.5 h-2.5 rounded-sm bg-blue-700 shrink-0" aria-hidden="true" />
                <span>ค่าซ่อมบำรุงและอะไหล่</span>
              </span>
              <span className="font-mono font-semibold text-slate-900 tabular-nums">
                {costSummary.maintenancePercentShare}% ({formatBaht(costSummary.totalMaintenanceCost)} บ.)
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Month-over-Month Maintenance Cost Trend (Recharts) */}
      <div
        data-testid="maintenance-trend-chart"
        className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-4"
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base sm:text-lg font-semibold text-slate-900 flex items-center gap-2">
              <Activity className="w-5 h-5 text-blue-700 shrink-0" aria-hidden="true" />
              <span>แนวโน้มค่าใช้จ่ายซ่อมบำรุงรายเดือน (MoM)</span>
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              ยอดรวม{' '}
              <strong className="font-mono tabular-nums text-slate-800">
                {formatBaht(trend.totalPeriodCost)} บาท
              </strong>{' '}
              · เฉลี่ย/เดือน{' '}
              <strong className="font-mono tabular-nums text-slate-800">
                {formatBaht(trend.monthlyAverage)} บาท
              </strong>
              {trend.peakMonth && (
                <>
                  {' '}
                  · เดือนสูงสุด{' '}
                  <strong className="font-mono tabular-nums text-amber-700">
                    {trend.peakMonth.monthLabel} ({formatBaht(trend.peakMonth.totalCost)} บ.)
                  </strong>
                </>
              )}
            </p>
          </div>

          <div
            role="group"
            aria-label="ช่วงเวลาย้อนหลังของกราฟค่าซ่อมบำรุง"
            className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start lg:self-auto"
          >
            <button
              type="button"
              onClick={() => setTrendRange('6m')}
              aria-pressed={trendRange === '6m'}
              className={`px-3 py-1.5 min-h-[34px] rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                trendRange === '6m'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              6 เดือนล่าสุด
            </button>
            <button
              type="button"
              onClick={() => setTrendRange('12m')}
              aria-pressed={trendRange === '12m'}
              className={`px-3 py-1.5 min-h-[34px] rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                trendRange === '12m'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              12 เดือนล่าสุด
            </button>
          </div>
        </div>

        {trend.totalPeriodCost === 0 ? (
          <div className="h-56 flex items-center justify-center border border-dashed border-slate-200 rounded-lg text-sm text-slate-500">
            ยังไม่มีรายการค่าใช้จ่ายซ่อมบำรุงในช่วง {trendRange === '12m' ? '12' : '6'} เดือนล่าสุด
          </div>
        ) : (
          <div className="space-y-3">
            <div className="w-full h-64 sm:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={trend.points}
                  margin={{ top: 18, right: 28, left: 8, bottom: 4 }}
                >
                  <defs>
                    <linearGradient id="maintTrendGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#1d4ed8" stopOpacity={0.22} />
                      <stop offset="100%" stopColor="#1d4ed8" stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis
                    dataKey="shortLabel"
                    tick={{ fill: '#475569', fontSize: 11 }}
                    axisLine={{ stroke: '#cbd5e1' }}
                    tickLine={false}
                    interval={0}
                  />
                  <YAxis
                    tickFormatter={(val: number) => formatBaht(val)}
                    tick={{ fill: '#64748b', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={56}
                  />
                  <Tooltip
                    content={<CustomTrendTooltip />}
                    cursor={{ stroke: '#94a3b8', strokeDasharray: '3 3' }}
                  />
                  {trend.monthlyAverage > 0 && (
                    <ReferenceLine
                      y={trend.monthlyAverage}
                      stroke="#64748b"
                      strokeDasharray="4 4"
                      label={{
                        value: `เฉลี่ย ${formatBaht(trend.monthlyAverage)} บ.`,
                        position: 'insideBottomLeft',
                        dy: -6,
                        fill: '#475569',
                        fontSize: 11,
                      }}
                    />
                  )}
                  <Area
                    type="monotone"
                    dataKey="totalCost"
                    name="ค่าซ่อมบำรุงรายเดือน (บาท)"
                    stroke="#1d4ed8"
                    strokeWidth={2.5}
                    fill="url(#maintTrendGrad)"
                    animationDuration={200}
                    dot={<CustomTrendDot />}
                    activeDot={{
                      r: 6,
                      fill: '#1d4ed8',
                      stroke: '#ffffff',
                      strokeWidth: 2,
                    }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs text-slate-500">
              <div className="flex flex-wrap items-center gap-4">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-700 shrink-0" aria-hidden="true" />
                  <span>ค่าซ่อมบำรุงรายเดือน</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-600 shrink-0" aria-hidden="true" />
                  <span>
                    จุดพีคค่าใช้จ่ายสูง (≥ {formatBaht(trend.spikeThreshold)} บ.)
                  </span>
                </span>
              </div>
              <span className="font-mono tabular-nums text-slate-500">
                มีค่าใช้จ่าย {trend.activeMonthCount} จาก {trend.points.length} เดือน
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Odometer Readings Over Time (Recharts LineChart) */}
      <div
        data-testid="odometer-trend-chart"
        className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-4"
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base sm:text-lg font-semibold text-slate-900 flex items-center gap-2">
              <Gauge className="w-5 h-5 text-indigo-700 shrink-0" aria-hidden="true" />
              <span>กราฟแนวโน้มเลขไมล์สะสมและการใช้งานรถ</span>
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              {odometerTrend.points.length >= 2 ? (
                <>
                  เฉลี่ยใช้งาน{' '}
                  <strong className="font-mono tabular-nums text-indigo-700">
                    ~{formatKm(odometerTrend.averageMonthlyKm)} กม./เดือน
                  </strong>{' '}
                  ({odometerTrend.averageDailyKm.toFixed(1)} กม./วัน) · ระยะที่บันทึก{' '}
                  <strong className="font-mono tabular-nums text-slate-800">
                    +{formatKm(odometerTrend.totalTrackedKm)} กม.
                  </strong>{' '}
                  ใน {odometerTrend.spanDays} วัน
                </>
              ) : (
                'ติดตามพัฒนาการเลขไมล์สะสมและพฤติกรรมการใช้งานรายเดือนจากประวัติการบันทึก'
              )}
            </p>
          </div>

          <div
            role="group"
            aria-label="ช่วงเวลาของกราฟเลขไมล์"
            className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start lg:self-auto"
          >
            <button
              type="button"
              onClick={() => setOdometerRange('30d')}
              aria-pressed={odometerRange === '30d'}
              className={`px-3 py-1.5 min-h-[34px] rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                odometerRange === '30d'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              30 วันล่าสุด
            </button>
            <button
              type="button"
              onClick={() => setOdometerRange('90d')}
              aria-pressed={odometerRange === '90d'}
              className={`px-3 py-1.5 min-h-[34px] rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                odometerRange === '90d'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              90 วันล่าสุด
            </button>
            <button
              type="button"
              onClick={() => setOdometerRange('all')}
              aria-pressed={odometerRange === 'all'}
              className={`px-3 py-1.5 min-h-[34px] rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                odometerRange === 'all'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              ทั้งหมด
            </button>
          </div>
        </div>

        {odometerTrend.points.length === 0 ? (
          <div className="h-56 flex items-center justify-center border border-dashed border-slate-200 rounded-lg text-sm text-slate-500">
            ยังไม่มีประวัติการบันทึกเลขไมล์สำหรับแสดงกราฟ
          </div>
        ) : (
          <div className="space-y-3">
            <div className="w-full h-64 sm:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={odometerTrend.points}
                  margin={{ top: 16, right: 24, left: 8, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis
                    dataKey="shortDate"
                    tick={{ fill: '#475569', fontSize: 11 }}
                    axisLine={{ stroke: '#cbd5e1' }}
                    tickLine={false}
                    minTickGap={30}
                  />
                  <YAxis
                    domain={[odoYMin, odoYMax]}
                    tickFormatter={(val: number) => formatKm(val)}
                    tick={{ fill: '#64748b', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={64}
                  />
                  <Tooltip
                    content={<CustomOdometerTooltip />}
                    cursor={{ stroke: '#94a3b8', strokeDasharray: '3 3' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="odometer"
                    name="เลขไมล์สะสม (กม.)"
                    stroke="#4338ca"
                    strokeWidth={2.5}
                    animationDuration={200}
                    dot={
                      odometerTrend.points.length <= 30
                        ? { r: 4, fill: '#ffffff', stroke: '#4338ca', strokeWidth: 2 }
                        : false
                    }
                    activeDot={{
                      r: 6,
                      fill: '#4338ca',
                      stroke: '#ffffff',
                      strokeWidth: 2,
                    }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs text-slate-500">
              <span className="font-mono tabular-nums">
                ช่วงเลขไมล์ {formatKm(odometerTrend.minOdometer)} –{' '}
                {formatKm(odometerTrend.maxOdometer)} กม.
              </span>
              <span className="font-mono tabular-nums">
                ข้อมูล {odometerTrend.points.length} จุดเวลา (ล่าสุด{' '}
                {formatKm(odometerTrend.latestOdometer)} กม.)
              </span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
