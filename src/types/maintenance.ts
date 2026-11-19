export type ServiceCategory = 'engine_belt' | 'fluids' | 'filters' | 'brakes_tires' | 'ac_electrical' | 'other';

export type ScheduleKey =
  | 'engine_oil'
  | 'air_cabin_filter'
  | 'timing_belt'
  | 'coolant'
  | 'custom';

export type ScheduleStatus = 'nominal' | 'warning' | 'overdue';

export interface VehicleProfile {
  id: string;
  nickname: string;
  make: string;
  model: string;
  engineSpec: string;
  year: number;
  tankCapacityLiters: number;
  fuelPercent: number;
  currentOdometer: number;
  lastUpdatedDate: string; // YYYY-MM-DD (Gregorian)
  lastUpdatedSource: string;
  imageUrl: string;
}

export interface ServiceRecord {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  category: ServiceCategory;
  odometer: number;
  partsCost: number;
  laborCost: number;
  totalCost: number;
  intervalKm: number | null;
  intervalMonths?: number | null;
  scheduleKey?: ScheduleKey;
  notes: string;
  revisionNote?: string;
}

export interface FuelLogEntry {
  id: string;
  date: string; // YYYY-MM-DD
  odometer: number;
  distance: number;
  amount: number;
  liters: number;
  pricePerLiter: number;
  kml: number;
  kmPerLiter?: number;
  note: string;
}

export interface OdometerLogEntry {
  id: string;
  date: string; // YYYY-MM-DD
  odometer: number;
  source: string;
  note?: string;
}

export interface MaintenanceScheduleItem {
  key: ScheduleKey;
  label: string;
  subtitle: string;
  lastServiceId: string;
  lastServiceDate: string;
  lastServiceOdometer: number;
  intervalKm: number;
  intervalMonths: number | null;
  minIntervalKm?: number | null;
  nextDueKm: number;
  remainingKm: number;
  usedKm: number;
  progressPercent: number;
  status: ScheduleStatus;
  earlyCheckKm?: number | null;
  earlyRemainingKm?: number | null;
}

export interface FuelAnalyticsSummary {
  totalFuelCost: number;
  totalLiters: number;
  totalDistance: number;
  avgKml: number;
  lastKml: number;
  lastPricePerLiter: number;
  costPerKm: number;
  approxTankLiters: number;
}

export interface CostSummary {
  totalCost: number;
  totalFuelCost: number;
  totalMaintenanceCost: number;
  fuelPercentShare: number;
  maintenancePercentShare: number;
  partsCost: number;
  laborCost: number;
  recordCount: number;
  byCategory: Array<{
    category: ServiceCategory;
    label: string;
    totalCost: number;
    partsCost: number;
    laborCost: number;
    count: number;
  }>;
}

export interface FleetHealthBanner {
  level: ScheduleStatus;
  overdueCount: number;
  warningCount: number;
  message: string;
}

export type MaintenanceAlertSeverity = 'approaching' | 'overdue';

export interface MaintenanceAlertItem {
  id: string;
  scheduleKey: ScheduleKey | 'custom';
  serviceId: string;
  title: string;
  severity: MaintenanceAlertSeverity;
  remainingKm: number;
  nextDueKm: number;
  currentOdometer: number;
  intervalKm: number;
  lastServiceDate: string;
  lastServiceOdometer: number;
}

export interface NotificationPreferences {
  thresholdKm: number;
  browserEnabled: boolean;
  dismissedAlertIds: string[];
  sentBrowserKeys: string[];
}

export interface OcrExtractedFuelData {
  odometer: number | null;
  amount: number | null;
  liters: number | null;
  pricePerLiter: number | null;
  stationOrFuel: string | null;
}

export interface MonthlyCostComparisonPoint {
  monthKey: string; // YYYY-MM
  monthLabel: string; // e.g. ก.ย. 2569
  partsCost: number;
  laborCost: number;
  totalCost: number;
  partsPercent: number;
  laborPercent: number;
  recordCount: number;
}

export interface MonthlyMaintenanceTrendPoint {
  monthKey: string; // YYYY-MM
  monthLabel: string; // e.g. ก.ย. 2569
  shortLabel: string; // e.g. ก.ย. 69
  totalCost: number;
  partsCost: number;
  laborCost: number;
  recordCount: number;
  momDelta: number | null;
  momPercent: number | null;
  topServiceTitle: string | null;
  isSpike: boolean;
}

export interface MaintenanceTrendSummary {
  points: MonthlyMaintenanceTrendPoint[];
  totalPeriodCost: number;
  monthlyAverage: number;
  spikeThreshold: number;
  peakMonth: MonthlyMaintenanceTrendPoint | null;
  activeMonthCount: number;
}

export interface MonthlyFuelCostTrendPoint {
  monthKey: string; // YYYY-MM
  monthLabel: string; // e.g. พ.ย. 2569
  shortLabel: string; // e.g. พ.ย. 69
  totalCost: number;
  totalLiters: number;
  totalDistance: number;
  refillCount: number;
  avgPricePerLiter: number;
  momDelta: number | null;
  momPercent: number | null;
  isPeakMonth: boolean;
}

export interface FuelCostTrendSummary {
  points: MonthlyFuelCostTrendPoint[];
  totalPeriodCost: number;
  totalPeriodLiters: number;
  monthlyAverage: number;
  activeMonthlyAverage: number;
  peakMonth: MonthlyFuelCostTrendPoint | null;
  activeMonthCount: number;
}

export interface OdometerTrendPoint {
  id: string;
  date: string;
  shortDate: string;
  fullDate: string;
  odometer: number;
  deltaKm: number;
  daysSincePrev: number;
  dailyRateKm: number | null;
  source: string;
  note?: string;
}

export interface OdometerMonthlyMileagePoint {
  monthKey: string;
  monthLabel: string;
  shortLabel: string;
  startOdometer: number;
  endOdometer: number;
  distanceKm: number;
  readingsCount: number;
}

export interface OdometerAnalyticsSummary {
  points: OdometerTrendPoint[];
  monthlyUsage: OdometerMonthlyMileagePoint[];
  totalTrackedKm: number;
  spanDays: number;
  averageMonthlyKm: number;
  averageDailyKm: number;
  minOdometer: number;
  maxOdometer: number;
  latestOdometer: number;
}

export interface MonthlyOdometerPoint extends OdometerMonthlyMileagePoint {
  momDistanceDelta: number | null;
  isPeakMonth: boolean;
}

export interface MonthlyOdometerSummary {
  points: MonthlyOdometerPoint[];
  monthCount: number;
  totalTrackedKm: number;
  averageMonthlyDistanceKm: number;
  peakDistanceMonth: MonthlyOdometerPoint | null;
  minOdometer: number;
  maxOdometer: number;
  latestOdometer: number;
}

export type LegalDocumentType =
  | 'compulsory_insurance'
  | 'voluntary_insurance'
  | 'registration_tax'
  | 'other';

export type LegalDocumentAlertStatus = 'expired' | 'expiring_soon' | 'valid';

export interface LegalDocuments {
  id: string;
  docType: LegalDocumentType;
  title: string;
  provider: string;
  policyNumber: string;
  issueDate: string; // YYYY-MM-DD
  expiryDate: string; // YYYY-MM-DD
  alertDaysBefore: number;
  alertEnabled: boolean;
  cost: number;
  emergencyPhone?: string;
  imageDataUrl?: string;
  notes?: string;
  updatedAt?: string;
}

export interface LegalDocumentAlertItem {
  id: string;
  documentId: string;
  docType: LegalDocumentType;
  title: string;
  provider: string;
  policyNumber: string;
  expiryDate: string;
  alertDaysBefore: number;
  daysRemaining: number;
  status: LegalDocumentAlertStatus;
}

export interface VehicleMaintenanceState {
  vehicle: VehicleProfile;
  services: ServiceRecord[];
  fuelLogs: FuelLogEntry[];
  odometerLogs: OdometerLogEntry[];
  scheduleIntervals: Record<string, number>;
  legalDocuments?: LegalDocuments[];
}
