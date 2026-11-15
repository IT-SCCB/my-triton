import type {
  CostSummary,
  FleetHealthBanner,
  FuelAnalyticsSummary,
  FuelLogEntry,
  MaintenanceAlertItem,
  MaintenanceScheduleItem,
  MaintenanceTrendSummary,
  MonthlyCostComparisonPoint,
  MonthlyMaintenanceTrendPoint,
  OdometerAnalyticsSummary,
  OdometerLogEntry,
  OdometerMonthlyMileagePoint,
  OdometerTrendPoint,
  ScheduleKey,
  ScheduleStatus,
  ServiceCategory,
  ServiceRecord,
  VehicleMaintenanceState,
} from '../types/maintenance';

export const CATEGORY_LABELS: Record<ServiceCategory, string> = {
  engine_belt: 'เครื่องยนต์และสายพาน',
  fluids: 'น้ำมันและของเหลว',
  filters: 'ไส้กรอง',
  brakes_tires: 'เบรกและช่วงล่าง',
  ac_electrical: 'ระบบแอร์และไฟฟ้า',
  other: 'อื่นๆ',
};

const THAI_MONTHS_FULL = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
];

const THAI_MONTHS_SHORT = [
  'ม.ค.',
  'ก.พ.',
  'มี.ค.',
  'เม.ย.',
  'พ.ค.',
  'มิ.ย.',
  'ก.ค.',
  'ส.ค.',
  'ก.ย.',
  'ต.ค.',
  'พ.ย.',
  'ธ.ค.',
];

export function formatThaiDate(isoDate: string, style: 'short' | 'full' = 'short'): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!match) return isoDate;
  const year = Number(match[1]) + 543;
  const monthIdx = Number(match[2]) - 1;
  const day = Number(match[3]);
  const months = style === 'full' ? THAI_MONTHS_FULL : THAI_MONTHS_SHORT;
  const monthName = months[monthIdx];
  if (!monthName) return isoDate;
  return `${day} ${monthName} ${year}`;
}

export function formatKm(value: number): string {
  return new Intl.NumberFormat('th-TH', { maximumFractionDigits: 0 }).format(Math.round(value));
}

export function formatBaht(value: number, decimals = 0): string {
  return new Intl.NumberFormat('th-TH', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export const DEFAULT_ALERT_THRESHOLD_KM = 500;
export const ALERT_THRESHOLD_OPTIONS = [300, 500, 1000, 1500] as const;

export function computeScheduleStatus(
  remainingKm: number,
  intervalKm: number,
  warningThresholdKm = DEFAULT_ALERT_THRESHOLD_KM
): ScheduleStatus {
  if (remainingKm <= 0) return 'overdue';
  const effectiveThreshold =
    warningThresholdKm > 0
      ? warningThresholdKm
      : Math.min(1500, Math.round(intervalKm * 0.15));
  if (remainingKm <= effectiveThreshold) return 'warning';
  return 'nominal';
}

interface TrackedScheduleDefinition {
  key: ScheduleKey;
  label: string;
  subtitle: string;
  defaultIntervalKm: number;
  intervalMonths: number | null;
  minIntervalKm?: number | null;
}

export const TRACKED_SCHEDULE_DEFINITIONS: TrackedScheduleDefinition[] = [
  {
    key: 'engine_oil',
    label: 'น้ำมันเครื่อง',
    subtitle: 'มาตรฐานทุกๆ 5,000 – 10,000 กม.',
    defaultIntervalKm: 10000,
    intervalMonths: 6,
    minIntervalKm: 5000,
  },
  {
    key: 'air_cabin_filter',
    label: 'กรองอากาศเครื่องยนต์และกรองแอร์',
    subtitle: 'อิงรอบเดียวกับน้ำมันเครื่อง (ทุกๆ 10,000 กม.)',
    defaultIntervalKm: 10000,
    intervalMonths: 12,
    minIntervalKm: null,
  },
  {
    key: 'coolant',
    label: 'น้ำยาหล่อเย็น (Coolant สีฟ้า)',
    subtitle: 'ตรวจสอบและเปลี่ยนถ่ายตามรอบ 40,000 กม. หรือ 2 ปี',
    defaultIntervalKm: 40000,
    intervalMonths: 24,
    minIntervalKm: null,
  },
  {
    key: 'timing_belt',
    label: 'ชุดสายพานไทม์มิ่ง (ราวลิ้น + ปั๊ม)',
    subtitle: 'ครบระยะ 100,000 กม. หรือประมาณ 5 ปี',
    defaultIntervalKm: 100000,
    intervalMonths: 60,
    minIntervalKm: null,
  },
];

export function buildMaintenanceSchedules(
  services: ServiceRecord[],
  currentOdometer: number,
  intervalOverrides: Record<string, number> = {},
  warningThresholdKm = DEFAULT_ALERT_THRESHOLD_KM
): MaintenanceScheduleItem[] {
  const results: MaintenanceScheduleItem[] = [];

  for (const def of TRACKED_SCHEDULE_DEFINITIONS) {
    const matching = services
      .filter((s) => s.scheduleKey === def.key)
      .sort((a, b) => {
        if (b.date !== a.date) return b.date.localeCompare(a.date);
        return b.odometer - a.odometer;
      });

    const latest = matching[0];
    if (!latest) continue;

    const intervalKm =
      intervalOverrides[def.key] ?? latest.intervalKm ?? def.defaultIntervalKm;
    const nextDueKm = latest.odometer + intervalKm;
    const remainingKm = nextDueKm - currentOdometer;
    const usedKm = Math.max(0, currentOdometer - latest.odometer);
    const rawPct = intervalKm > 0 ? (usedKm / intervalKm) * 100 : 0;
    const progressPercent = Math.min(100, Math.max(0, Number(rawPct.toFixed(1))));
    const status = computeScheduleStatus(remainingKm, intervalKm, warningThresholdKm);

    const earlyCheckKm = def.minIntervalKm ? latest.odometer + def.minIntervalKm : null;
    const earlyRemainingKm =
      earlyCheckKm !== null ? earlyCheckKm - currentOdometer : null;

    results.push({
      key: def.key,
      label: def.label,
      subtitle: def.subtitle,
      lastServiceId: latest.id,
      lastServiceDate: latest.date,
      lastServiceOdometer: latest.odometer,
      intervalKm,
      intervalMonths: latest.intervalMonths ?? def.intervalMonths,
      minIntervalKm: def.minIntervalKm ?? null,
      nextDueKm,
      remainingKm,
      usedKm,
      progressPercent,
      status,
      earlyCheckKm,
      earlyRemainingKm,
    });
  }

  return results.sort((a, b) => a.remainingKm - b.remainingKm);
}

export function evaluateMaintenanceAlerts(
  services: ServiceRecord[],
  currentOdometer: number,
  intervalOverrides: Record<string, number> = {},
  thresholdKm = DEFAULT_ALERT_THRESHOLD_KM
): MaintenanceAlertItem[] {
  const safeThreshold =
    Number.isFinite(thresholdKm) && thresholdKm > 0
      ? thresholdKm
      : DEFAULT_ALERT_THRESHOLD_KM;
  const alerts: MaintenanceAlertItem[] = [];
  const coveredServiceIds = new Set<string>();
  const coveredTrackedKeys = new Set<ScheduleKey>();

  const schedules = buildMaintenanceSchedules(
    services,
    currentOdometer,
    intervalOverrides,
    safeThreshold
  );

  for (const item of schedules) {
    coveredServiceIds.add(item.lastServiceId);
    coveredTrackedKeys.add(item.key);
    if (item.remainingKm <= safeThreshold) {
      const severity = item.remainingKm <= 0 ? 'overdue' : 'approaching';
      alerts.push({
        id: `${item.key}:${item.lastServiceId}:${item.nextDueKm}:${severity}`,
        scheduleKey: item.key,
        serviceId: item.lastServiceId,
        title: item.label,
        severity,
        remainingKm: item.remainingKm,
        nextDueKm: item.nextDueKm,
        currentOdometer,
        intervalKm: item.intervalKm,
        lastServiceDate: item.lastServiceDate,
        lastServiceOdometer: item.lastServiceOdometer,
      });
    }
  }

  // Also check custom / non-tracked services that specify a recurring intervalKm
  const latestCustomByTitle = new Map<string, ServiceRecord>();
  const sortedServices = [...services].sort((a, b) =>
    b.date !== a.date ? b.date.localeCompare(a.date) : b.odometer - a.odometer
  );
  for (const s of sortedServices) {
    if (coveredServiceIds.has(s.id)) continue;
    if (s.scheduleKey && coveredTrackedKeys.has(s.scheduleKey)) continue;
    if (!s.intervalKm || s.intervalKm <= 0) continue;
    const dedupKey = s.scheduleKey && s.scheduleKey !== 'custom' ? s.scheduleKey : s.title.trim().toLowerCase();
    if (!latestCustomByTitle.has(dedupKey)) {
      latestCustomByTitle.set(dedupKey, s);
    }
  }

  for (const s of latestCustomByTitle.values()) {
    const intervalKm = intervalOverrides[s.scheduleKey ?? ''] ?? s.intervalKm ?? 0;
    if (intervalKm <= 0) continue;
    const nextDueKm = s.odometer + intervalKm;
    const remainingKm = nextDueKm - currentOdometer;
    if (remainingKm <= safeThreshold) {
      const severity = remainingKm <= 0 ? 'overdue' : 'approaching';
      alerts.push({
        id: `custom:${s.id}:${nextDueKm}:${severity}`,
        scheduleKey: s.scheduleKey ?? 'custom',
        serviceId: s.id,
        title: s.title,
        severity,
        remainingKm,
        nextDueKm,
        currentOdometer,
        intervalKm,
        lastServiceDate: s.date,
        lastServiceOdometer: s.odometer,
      });
    }
  }

  return alerts.sort((a, b) => a.remainingKm - b.remainingKm);
}

export function computeFleetHealthBanner(
  schedules: MaintenanceScheduleItem[],
  services: ServiceRecord[],
  currentOdometer: number,
  intervalOverrides: Record<string, number> = {},
  warningThresholdKm = DEFAULT_ALERT_THRESHOLD_KM
): FleetHealthBanner {
  const alerts = evaluateMaintenanceAlerts(
    services,
    currentOdometer,
    intervalOverrides,
    warningThresholdKm
  );

  // Also ensure any prebuilt schedule status is respected if caller passed custom schedules
  const seenKeys = new Set(alerts.map((a) => a.serviceId));
  let overdueCount = alerts.filter((a) => a.severity === 'overdue').length;
  let warningCount = alerts.filter((a) => a.severity === 'approaching').length;

  for (const item of schedules) {
    if (seenKeys.has(item.lastServiceId)) continue;
    if (item.status === 'overdue') overdueCount += 1;
    else if (item.status === 'warning') warningCount += 1;
  }

  const mostUrgent = alerts[0];

  if (overdueCount > 0) {
    const detail = mostUrgent
      ? ` (${mostUrgent.title} เกินระยะ ${formatKm(Math.abs(mostUrgent.remainingKm))} กม.)`
      : '';
    return {
      level: 'overdue',
      overdueCount,
      warningCount,
      message: `แจ้งเตือนซ่อมบำรุง: มี ${overdueCount} รายการเกินกำหนดระยะเปลี่ยนถ่ายแล้ว${detail}`,
    };
  }
  if (warningCount > 0) {
    const detail = mostUrgent
      ? ` (${mostUrgent.title} เหลืออีก ${formatKm(mostUrgent.remainingKm)} กม.)`
      : '';
    return {
      level: 'warning',
      overdueCount,
      warningCount,
      message: `แจ้งเตือนล่วงหน้า (ภายใน ${formatKm(warningThresholdKm)} กม.): มี ${warningCount} รายการใกล้ถึงกำหนด${detail}`,
    };
  }
  return {
    level: 'nominal',
    overdueCount: 0,
    warningCount: 0,
    message: 'สถานะซ่อมบำรุงปกติทุกรายการ — อ้วนพีพร้อมลุยทุกเส้นทาง',
  };
}

export const MAX_REALISTIC_KML = 30;

export function isFuelKmlSpike(kml: number): boolean {
  return Number.isFinite(kml) && kml > MAX_REALISTIC_KML;
}

export function isFuelLitersOverTank(
  liters: number,
  tankCapacityLiters = 75
): boolean {
  return (
    Number.isFinite(liters) &&
    Number.isFinite(tankCapacityLiters) &&
    tankCapacityLiters > 0 &&
    liters > tankCapacityLiters
  );
}

export function isRealisticFuelKml(kml: number): boolean {
  return Number.isFinite(kml) && kml > 0 && kml <= MAX_REALISTIC_KML;
}

export function getFuelChartLogs(
  fuelLogs: FuelLogEntry[],
  options: { includeOutliers?: boolean; limit?: number | null } = {}
): FuelLogEntry[] {
  const { includeOutliers = false, limit = null } = options;
  const filtered = sortFuelLogsChronological(fuelLogs).filter((l) =>
    includeOutliers ? l.kml > 0 : isRealisticFuelKml(l.kml)
  );
  if (typeof limit === 'number' && limit > 0 && filtered.length > limit) {
    return filtered.slice(-limit);
  }
  return filtered;
}

export function computeFuelAnalytics(
  fuelLogs: FuelLogEntry[],
  fuelPercent: number,
  tankCapacityLiters: number
): FuelAnalyticsSummary {
  const sorted = [...fuelLogs].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.odometer - b.odometer;
  });

  const totalFuelCost = sorted.reduce((sum, l) => sum + Number(l.amount || 0), 0);
  const totalLiters = sorted.reduce((sum, l) => sum + Number(l.liters || 0), 0);
  const totalDistance = sorted.reduce((sum, l) => sum + Number(l.distance || 0), 0);

  const realisticKmlLogs = sorted.filter((l) => isRealisticFuelKml(l.kml));
  const fallbackKmlLogs = sorted.filter((l) => l.kml > 0);
  const kmlSample = realisticKmlLogs.length > 0 ? realisticKmlLogs : fallbackKmlLogs;

  const avgKml =
    kmlSample.length > 0
      ? kmlSample.reduce((sum, l) => sum + Number(l.kml), 0) / kmlSample.length
      : 0;
  const lastLog = sorted[sorted.length - 1];
  const lastKml = lastLog ? Number(lastLog.kml) : 0;
  const lastPricePerLiter = lastLog ? Number(lastLog.pricePerLiter) : 33.55;
  const costPerKm = avgKml > 0 ? lastPricePerLiter / avgKml : 0;
  const clampedPct = Math.max(0, Math.min(100, fuelPercent));
  const approxTankLiters = (clampedPct / 100) * tankCapacityLiters;

  return {
    totalFuelCost,
    totalLiters: Number(totalLiters.toFixed(3)),
    totalDistance,
    avgKml: Number(avgKml.toFixed(2)),
    lastKml: Number(lastKml.toFixed(2)),
    lastPricePerLiter: Number(lastPricePerLiter.toFixed(2)),
    costPerKm: Number(costPerKm.toFixed(2)),
    approxTankLiters: Number(approxTankLiters.toFixed(1)),
  };
}

export function computeFuelKmlFromFormula(
  distance: number,
  liters: number
): number {
  if (!Number.isFinite(distance) || !Number.isFinite(liters) || distance <= 0 || liters <= 0) {
    return 0;
  }
  return Number((distance / liters).toFixed(2));
}

export function findPreviousFuelLog(
  fuelLogs: FuelLogEntry[],
  target: { id?: string; date: string; odometer: number }
): FuelLogEntry | null {
  const sorted = sortFuelLogsChronological(fuelLogs).filter(
    (l) => l.id !== target.id
  );
  let previous: FuelLogEntry | null = null;
  for (const log of sorted) {
    if (log.date < target.date) {
      previous = log;
    } else if (log.date === target.date && log.odometer < target.odometer) {
      previous = log;
    }
  }
  return previous;
}

export function calculateFuelRefillPreview(params: {
  newOdometer: number;
  previousOdometer: number;
  amount: number;
  pricePerLiter: number;
  litersOverride?: number | null;
}): { distance: number; liters: number; kml: number } {
  const distance = Math.max(0, params.newOdometer - params.previousOdometer);
  const liters =
    params.litersOverride && params.litersOverride > 0
      ? params.litersOverride
      : params.amount > 0 && params.pricePerLiter > 0
        ? params.amount / params.pricePerLiter
        : 0;
  const kml = computeFuelKmlFromFormula(distance, liters);

  return {
    distance,
    liters: Number(liters.toFixed(3)),
    kml,
  };
}

export function computeCostSummary(
  services: ServiceRecord[],
  fuelLogs: FuelLogEntry[] = []
): CostSummary {
  const categories: ServiceCategory[] = [
    'engine_belt',
    'fluids',
    'filters',
    'brakes_tires',
    'ac_electrical',
    'other',
  ];

  const byCategoryMap = new Map<
    ServiceCategory,
    { totalCost: number; partsCost: number; laborCost: number; count: number }
  >();

  for (const cat of categories) {
    byCategoryMap.set(cat, { totalCost: 0, partsCost: 0, laborCost: 0, count: 0 });
  }

  let totalMaintenanceCost = 0;
  let partsCost = 0;
  let laborCost = 0;

  for (const s of services) {
    totalMaintenanceCost += s.totalCost;
    partsCost += s.partsCost;
    laborCost += s.laborCost;

    const bucket = byCategoryMap.get(s.category) ?? {
      totalCost: 0,
      partsCost: 0,
      laborCost: 0,
      count: 0,
    };
    bucket.totalCost += s.totalCost;
    bucket.partsCost += s.partsCost;
    bucket.laborCost += s.laborCost;
    bucket.count += 1;
    byCategoryMap.set(s.category, bucket);
  }

  const totalFuelCost = fuelLogs.reduce((sum, l) => sum + Number(l.amount || 0), 0);
  const totalCost = totalMaintenanceCost + totalFuelCost;
  const fuelPercentShare =
    totalCost > 0 ? Number(((totalFuelCost / totalCost) * 100).toFixed(1)) : 0;
  const maintenancePercentShare =
    totalCost > 0 ? Number((100 - fuelPercentShare).toFixed(1)) : 0;

  const byCategory = categories
    .map((category) => {
      const bucket = byCategoryMap.get(category)!;
      return {
        category,
        label: CATEGORY_LABELS[category],
        ...bucket,
      };
    })
    .filter((item) => item.count > 0)
    .sort((a, b) => b.totalCost - a.totalCost);

  return {
    totalCost,
    totalFuelCost,
    totalMaintenanceCost,
    fuelPercentShare,
    maintenancePercentShare,
    partsCost,
    laborCost,
    recordCount: services.length,
    byCategory,
  };
}

export function formatThaiMonthYear(monthKey: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey.trim());
  if (!match) return monthKey;
  const year = Number(match[1]) + 543;
  const monthIdx = Number(match[2]) - 1;
  const monthName = THAI_MONTHS_SHORT[monthIdx];
  if (!monthName) return monthKey;
  return `${monthName} ${year}`;
}

export function formatThaiMonthShortYear(monthKey: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey.trim());
  if (!match) return monthKey;
  const shortYear = String(Number(match[1]) + 543).slice(-2);
  const monthIdx = Number(match[2]) - 1;
  const monthName = THAI_MONTHS_SHORT[monthIdx];
  if (!monthName) return monthKey;
  return `${monthName} ${shortYear}`;
}

export function computeMonthlyPartsVsLabor(
  services: ServiceRecord[]
): MonthlyCostComparisonPoint[] {
  const monthMap = new Map<
    string,
    { partsCost: number; laborCost: number; recordCount: number }
  >();

  for (const s of services) {
    const match = /^(\d{4}-\d{2})-\d{2}$/.exec(s.date.trim());
    if (!match) continue;
    const monthKey = match[1];
    const bucket = monthMap.get(monthKey) ?? {
      partsCost: 0,
      laborCost: 0,
      recordCount: 0,
    };
    bucket.partsCost += Math.max(0, Number(s.partsCost || 0));
    bucket.laborCost += Math.max(0, Number(s.laborCost || 0));
    bucket.recordCount += 1;
    monthMap.set(monthKey, bucket);
  }

  return Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([monthKey, bucket]) => {
      const totalCost = bucket.partsCost + bucket.laborCost;
      const partsPercent =
        totalCost > 0
          ? Number(((bucket.partsCost / totalCost) * 100).toFixed(1))
          : 0;
      const laborPercent =
        totalCost > 0 ? Number((100 - partsPercent).toFixed(1)) : 0;

      return {
        monthKey,
        monthLabel: formatThaiMonthYear(monthKey),
        partsCost: bucket.partsCost,
        laborCost: bucket.laborCost,
        totalCost,
        partsPercent,
        laborPercent,
        recordCount: bucket.recordCount,
      };
    });
}

function addMonths(monthKey: string, delta: number): string {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) return monthKey;
  const totalMonths = Number(match[1]) * 12 + (Number(match[2]) - 1) + delta;
  const year = Math.floor(totalMonths / 12);
  const month = (totalMonths % 12) + 1;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
}

export function computeMaintenanceCostTrend(
  services: ServiceRecord[],
  referenceMonth?: string,
  monthsCount = 12
): MaintenanceTrendSummary {
  const serviceMonths = services
    .map((s) => /^(\d{4}-\d{2})-\d{2}$/.exec(s.date.trim())?.[1] ?? null)
    .filter((m): m is string => m !== null)
    .sort();

  const currentMonth = new Date().toISOString().slice(0, 7);
  const latestServiceMonth = serviceMonths[serviceMonths.length - 1] ?? currentMonth;
  const endMonth =
    referenceMonth && /^\d{4}-\d{2}$/.test(referenceMonth)
      ? referenceMonth
      : latestServiceMonth > currentMonth
        ? latestServiceMonth
        : currentMonth;

  const bucketMap = new Map<
    string,
    {
      partsCost: number;
      laborCost: number;
      totalCost: number;
      recordCount: number;
      topServiceTitle: string | null;
      topServiceCost: number;
    }
  >();

  for (const s of services) {
    const match = /^(\d{4}-\d{2})-\d{2}$/.exec(s.date.trim());
    if (!match) continue;
    const monthKey = match[1];
    const parts = Math.max(0, Number(s.partsCost || 0));
    const labor = Math.max(0, Number(s.laborCost || 0));
    const total = Math.max(0, Number(s.totalCost ?? parts + labor));
    const current = bucketMap.get(monthKey) ?? {
      partsCost: 0,
      laborCost: 0,
      totalCost: 0,
      recordCount: 0,
      topServiceTitle: null,
      topServiceCost: -1,
    };
    current.partsCost += parts;
    current.laborCost += labor;
    current.totalCost += total;
    current.recordCount += 1;
    if (total > current.topServiceCost) {
      current.topServiceCost = total;
      current.topServiceTitle = s.title;
    }
    bucketMap.set(monthKey, current);
  }

  const keys: string[] = [];
  for (let i = -(monthsCount - 1); i <= 0; i++) {
    keys.push(addMonths(endMonth, i));
  }

  const rawPoints = keys.map((monthKey) => {
    const bucket = bucketMap.get(monthKey);
    return {
      monthKey,
      monthLabel: formatThaiMonthYear(monthKey),
      shortLabel: formatThaiMonthShortYear(monthKey),
      totalCost: bucket?.totalCost ?? 0,
      partsCost: bucket?.partsCost ?? 0,
      laborCost: bucket?.laborCost ?? 0,
      recordCount: bucket?.recordCount ?? 0,
      topServiceTitle: bucket?.topServiceTitle ?? null,
    };
  });

  const totalPeriodCost = rawPoints.reduce((sum, p) => sum + p.totalCost, 0);
  const activeMonths = rawPoints.filter((p) => p.totalCost > 0);
  const activeMonthCount = activeMonths.length;
  const monthlyAverage = monthsCount > 0 ? Math.round(totalPeriodCost / monthsCount) : 0;
  const activeAverage =
    activeMonthCount > 0 ? totalPeriodCost / activeMonthCount : 0;

  // A month is flagged as a spending spike when it meaningfully exceeds both the period average and active-month baseline
  const spikeThreshold =
    totalPeriodCost > 0
      ? Math.round(Math.max(monthlyAverage * 1.5, activeAverage * 1.25))
      : 0;

  const points: MonthlyMaintenanceTrendPoint[] = rawPoints.map((p, idx) => {
    const prev = idx > 0 ? rawPoints[idx - 1] : null;
    const momDelta = prev ? p.totalCost - prev.totalCost : null;
    const momPercent =
      prev && prev.totalCost > 0
        ? Number((((p.totalCost - prev.totalCost) / prev.totalCost) * 100).toFixed(1))
        : null;
    const isSpike =
      p.totalCost > 0 && spikeThreshold > 0 && p.totalCost >= spikeThreshold;

    return {
      ...p,
      momDelta,
      momPercent,
      isSpike,
    };
  });

  const peakMonth =
    activeMonths.length > 0
      ? points.reduce((best, cur) => (cur.totalCost > best.totalCost ? cur : best), points[0])
      : null;

  return {
    points,
    totalPeriodCost,
    monthlyAverage,
    spikeThreshold,
    peakMonth,
    activeMonthCount,
  };
}

export function filterServiceRecords(
  services: ServiceRecord[],
  query: string,
  category: ServiceCategory | 'all'
): ServiceRecord[] {
  const normalizedQuery = query.trim().toLowerCase();

  return services
    .filter((record) => {
      if (category !== 'all' && record.category !== category) {
        return false;
      }
      if (!normalizedQuery) return true;
      const haystack = [
        record.title,
        record.notes,
        record.revisionNote ?? '',
        CATEGORY_LABELS[record.category],
        formatThaiDate(record.date, 'short'),
        formatThaiDate(record.date, 'full'),
        String(record.odometer),
        String(record.totalCost),
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    })
    .sort((a, b) => {
      if (b.date !== a.date) return b.date.localeCompare(a.date);
      return b.odometer - a.odometer;
    });
}

export function sortOdometerLogs(logs: OdometerLogEntry[]): OdometerLogEntry[] {
  return [...logs].sort((a, b) => {
    if (b.date !== a.date) return b.date.localeCompare(a.date);
    return b.odometer - a.odometer;
  });
}

export function computeOdometerTrend(
  odometerLogs: OdometerLogEntry[],
  daysLimit: number | null = null
): OdometerAnalyticsSummary {
  const validSorted = [...odometerLogs]
    .filter(
      (l) =>
        /^\d{4}-\d{2}-\d{2}$/.test(l.date.trim()) &&
        Number.isFinite(l.odometer) &&
        l.odometer > 0
    )
    .sort((a, b) =>
      a.date !== b.date ? a.date.localeCompare(b.date) : a.odometer - b.odometer
    );

  // Deduplicate same-date readings by retaining the latest/highest odometer reading per calendar date
  const byDate = new Map<string, OdometerLogEntry>();
  for (const entry of validSorted) {
    byDate.set(entry.date, entry);
  }
  let chronological = Array.from(byDate.values());

  if (
    typeof daysLimit === 'number' &&
    daysLimit > 0 &&
    chronological.length > 0
  ) {
    const latestMs = Date.parse(chronological[chronological.length - 1].date);
    const cutoffMs = latestMs - daysLimit * 86_400_000;
    const filtered = chronological.filter((e) => Date.parse(e.date) >= cutoffMs);
    if (filtered.length >= 2) {
      chronological = filtered;
    }
  }

  const points: OdometerTrendPoint[] = chronological.map((entry, idx) => {
    const prev = idx > 0 ? chronological[idx - 1] : null;
    const deltaKm = prev ? entry.odometer - prev.odometer : 0;
    const daysSincePrev = prev
      ? Math.max(
          0,
          Math.round(
            (Date.parse(entry.date) - Date.parse(prev.date)) / 86_400_000
          )
        )
      : 0;
    const dailyRateKm =
      prev && daysSincePrev > 0 && deltaKm >= 0
        ? Number((deltaKm / daysSincePrev).toFixed(1))
        : null;

    return {
      id: entry.id,
      date: entry.date,
      shortDate: formatThaiDate(entry.date, 'short'),
      fullDate: formatThaiDate(entry.date, 'full'),
      odometer: entry.odometer,
      deltaKm,
      daysSincePrev,
      dailyRateKm,
      source: entry.source,
      note: entry.note,
    };
  });

  if (points.length === 0) {
    return {
      points: [],
      monthlyUsage: [],
      totalTrackedKm: 0,
      spanDays: 0,
      averageMonthlyKm: 0,
      averageDailyKm: 0,
      minOdometer: 0,
      maxOdometer: 0,
      latestOdometer: 0,
    };
  }

  const odoValues = points.map((p) => p.odometer);
  const minOdometer = Math.min(...odoValues);
  const maxOdometer = Math.max(...odoValues);
  const latestOdometer = points[points.length - 1].odometer;
  const totalTrackedKm = Math.max(0, maxOdometer - minOdometer);

  const firstMs = Date.parse(points[0].date);
  const lastMs = Date.parse(points[points.length - 1].date);
  const spanDays =
    points.length >= 2
      ? Math.max(1, Math.round((lastMs - firstMs) / 86_400_000))
      : 0;
  const averageDailyKm =
    points.length >= 2 && spanDays > 0
      ? Number((totalTrackedKm / spanDays).toFixed(1))
      : 0;
  const averageMonthlyKm =
    points.length >= 2 && spanDays > 0
      ? Math.round((totalTrackedKm / spanDays) * 30.4375)
      : 0;

  const monthGroups = new Map<string, OdometerTrendPoint[]>();
  for (const p of points) {
    const monthKey = p.date.slice(0, 7);
    const list = monthGroups.get(monthKey) ?? [];
    list.push(p);
    monthGroups.set(monthKey, list);
  }

  const monthlyUsage: OdometerMonthlyMileagePoint[] = [];
  let prevMonthEnd: number | null = null;
  for (const [monthKey, items] of Array.from(monthGroups.entries()).sort(([a], [b]) =>
    a.localeCompare(b)
  )) {
    const startOdometer =
      prevMonthEnd !== null ? Math.min(prevMonthEnd, items[0].odometer) : items[0].odometer;
    const endOdometer = items[items.length - 1].odometer;
    monthlyUsage.push({
      monthKey,
      monthLabel: formatThaiMonthYear(monthKey),
      shortLabel: formatThaiMonthShortYear(monthKey),
      startOdometer,
      endOdometer,
      distanceKm: Math.max(0, endOdometer - startOdometer),
      readingsCount: items.length,
    });
    prevMonthEnd = endOdometer;
  }

  return {
    points,
    monthlyUsage,
    totalTrackedKm,
    spanDays,
    averageMonthlyKm,
    averageDailyKm,
    minOdometer,
    maxOdometer,
    latestOdometer,
  };
}

export function sortFuelLogsNewestFirst(logs: FuelLogEntry[]): FuelLogEntry[] {
  return [...logs].sort((a, b) => {
    if (b.date !== a.date) return b.date.localeCompare(a.date);
    return b.odometer - a.odometer;
  });
}

export function sortFuelLogsChronological(logs: FuelLogEntry[]): FuelLogEntry[] {
  return [...logs].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.odometer - b.odometer;
  });
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export function validateOdometerInput(rawValue: string): ValidationResult {
  const cleaned = rawValue.replace(/,/g, '').trim();
  if (!cleaned) {
    return { valid: false, error: 'กรุณาระบุเลขไมล์' };
  }
  const num = Number(cleaned);
  if (!Number.isFinite(num) || !Number.isInteger(num) || num <= 0 || num > 2_000_000) {
    return { valid: false, error: 'กรุณาระบุเลขไมล์เป็นจำนวนเต็มบวกที่ถูกต้อง (เช่น 233850)' };
  }
  return { valid: true };
}

export interface ServiceFormInput {
  date: string;
  title: string;
  odometer: string;
  partsCost: string;
  laborCost: string;
  intervalKm: string;
}

export function validateServiceInput(input: ServiceFormInput): ValidationResult {
  if (!input.date || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    return { valid: false, error: 'กรุณาระบุวันที่ให้ถูกต้อง' };
  }
  if (!input.title.trim()) {
    return { valid: false, error: 'กรุณาระบุรายการเซอร์วิส' };
  }
  const odoCheck = validateOdometerInput(input.odometer);
  if (!odoCheck.valid) {
    return { valid: false, error: 'กรุณาระบุเลขไมล์ตอนทำเซอร์วิสให้ถูกต้อง' };
  }
  const parts = input.partsCost.trim() === '' ? 0 : Number(input.partsCost.replace(/,/g, ''));
  const labor = input.laborCost.trim() === '' ? 0 : Number(input.laborCost.replace(/,/g, ''));
  if (!Number.isFinite(parts) || parts < 0 || !Number.isFinite(labor) || labor < 0) {
    return { valid: false, error: 'ค่าอะไหล่และค่าแรงต้องไม่ติดลบ' };
  }
  if (input.intervalKm.trim() !== '') {
    const interval = Number(input.intervalKm.replace(/,/g, ''));
    if (!Number.isFinite(interval) || interval <= 0) {
      return { valid: false, error: 'ระยะรอบถัดไปต้องมากกว่า 0 กม.' };
    }
  }
  return { valid: true };
}

export interface FuelFormInput {
  date: string;
  odometer: string;
  amount: string;
  pricePerLiter: string;
  liters: string;
  note: string;
  fuelPercent?: string;
  maxTankLiters?: number;
}

export function validateFuelInput(input: FuelFormInput): ValidationResult {
  if (!input.date || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    return { valid: false, error: 'กรุณาระบุวันที่เติมน้ำมันให้ถูกต้อง' };
  }
  const odoCheck = validateOdometerInput(input.odometer);
  if (!odoCheck.valid) {
    return { valid: false, error: 'กรุณาระบุเลขไมล์หน้าปัดให้ถูกต้อง' };
  }
  const amount = Number(input.amount);
  const price = Number(input.pricePerLiter);
  const liters = Number(input.liters);
  const tankCap = input.maxTankLiters ?? 75;
  if (!Number.isFinite(amount) || amount <= 0) {
    return { valid: false, error: 'กรุณาระบุยอดเงินที่เติม (มากกว่า 0 บาท)' };
  }
  if (!Number.isFinite(price) || price <= 0) {
    return { valid: false, error: 'กรุณาระบุราคาน้ำมันต่อลิตร' };
  }
  if (!Number.isFinite(liters) || liters <= 0) {
    return { valid: false, error: 'กรุณาระบุปริมาณน้ำมัน (ลิตร)' };
  }
  if (liters > tankCap) {
    return {
      valid: false,
      error: `ปริมาณน้ำมัน (${liters.toFixed(2)} ลิตร) เกินความจุถัง ${tankCap} ลิตร กรุณาตรวจสอบตัวเลข`,
    };
  }
  if (!input.note.trim()) {
    return { valid: false, error: 'กรุณาระบุปั๊มน้ำมันหรือชนิดเชื้อเพลิง' };
  }
  if (input.fuelPercent && input.fuelPercent.trim() !== '') {
    const pct = Number(input.fuelPercent);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      return { valid: false, error: 'ระดับน้ำมันในถังต้องอยู่ระหว่าง 0 ถึง 100%' };
    }
  }
  return { valid: true };
}

export function buildGasSyncPayload(state: VehicleMaintenanceState) {
  return {
    odometer: state.vehicle.currentOdometer,
    fuelPercent: state.vehicle.fuelPercent,
    fuelLogs: state.fuelLogs,
    maintenanceItems: state.services.map((s) => ({
      id: s.id,
      title: s.title,
      date: formatThaiDate(s.date, 'short'),
      isoDate: s.date,
      doneOdo: s.odometer,
      interval: s.intervalKm,
      nextOdo: s.intervalKm ? s.odometer + s.intervalKm : null,
      cost: s.totalCost,
      partsCost: s.partsCost,
      laborCost: s.laborCost,
      category: s.category,
      scheduleKey: s.scheduleKey,
      notes: s.notes,
      revisionNote: s.revisionNote,
    })),
    fullState: state,
  };
}
