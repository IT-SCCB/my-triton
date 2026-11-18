import type { MaintenanceScheduleItem } from '../types/maintenance';

export type DrivingCondition = 'highway' | 'mixed' | 'city_mountain';

export interface TripPresetRoute {
  id: string;
  label: string;
  origin: string;
  destination: string;
  oneWayKm: number;
  note: string;
}

export const TRIP_PRESET_ROUTES: TripPresetRoute[] = [
  {
    id: 'bkk-pattaya',
    label: 'กรุงเทพฯ – พัทยา',
    origin: 'กรุงเทพฯ',
    destination: 'พัทยา (ชลบุรี)',
    oneWayKm: 150,
    note: 'มอเตอร์เวย์สาย 7 ขับขี่ทางไกล',
  },
  {
    id: 'bkk-khaoyai',
    label: 'กรุงเทพฯ – เขาใหญ่',
    origin: 'กรุงเทพฯ',
    destination: 'ปากช่อง / เขาใหญ่',
    oneWayKm: 185,
    note: 'มีช่วงขึ้นเนินและทางโค้ง',
  },
  {
    id: 'bkk-huahin',
    label: 'กรุงเทพฯ – หัวหิน',
    origin: 'กรุงเทพฯ',
    destination: 'หัวหิน (ประจวบฯ)',
    oneWayKm: 200,
    note: 'พระราม 2 / เพชรเกษม',
  },
  {
    id: 'bkk-chiangmai',
    label: 'กรุงเทพฯ – เชียงใหม่',
    origin: 'กรุงเทพฯ',
    destination: 'เชียงใหม่',
    oneWayKm: 695,
    note: 'ทางไกลสายเหนือ',
  },
  {
    id: 'bkk-phuket',
    label: 'กรุงเทพฯ – ภูเก็ต',
    origin: 'กรุงเทพฯ',
    destination: 'ภูเก็ต',
    oneWayKm: 840,
    note: 'ทางไกลสายใต้',
  },
];

export const DRIVING_CONDITION_CONFIG: Record<
  DrivingCondition,
  { label: string; description: string; factor: number; adjustmentLabel: string }
> = {
  highway: {
    label: 'ทางไกล / ความเร็วคงที่',
    description: '90–110 กม./ชม. รอบเครื่องนิ่ง ประหยัดขึ้นเล็กน้อย',
    factor: 1.08,
    adjustmentLabel: '+8% กม./ล.',
  },
  mixed: {
    label: 'ขับขี่ผสม (มาตรฐาน)',
    description: 'อิงค่าเฉลี่ยจริงจากประวัติเติมน้ำมันของอ้วนพี',
    factor: 1.0,
    adjustmentLabel: 'ค่าเฉลี่ยจริง',
  },
  city_mountain: {
    label: 'ในเมือง / ขึ้นเขา / บรรทุก',
    description: 'รถติด เร่งแซงบ่อย หรือไต่ทางชัน กินน้ำมันเพิ่มขึ้น',
    factor: 0.88,
    adjustmentLabel: '-12% กม./ล.',
  },
};

export interface TripPlanInput {
  routeName?: string;
  oneWayDistanceKm: number;
  roundTrip: boolean;
  baseKml: number;
  drivingCondition: DrivingCondition;
  fuelPricePerLiter: number;
  bufferPercent: number; // e.g., 0, 10, 15, 20
  extraCostBaht?: number; // tolls / parking
  currentOdometer: number;
  tankCapacityLiters: number;
  fuelPercent: number;
  reserveLiters?: number; // safety fuel left in tank before refilling (default 10L)
}

export interface TripMaintenanceImpact {
  key: string;
  label: string;
  nextDueKm: number;
  currentRemainingKm: number;
  remainingAfterTripKm: number;
  becomesOverdueDuringTrip: boolean;
  becomesWarningDuringTrip: boolean;
}

export interface TripPlanEstimate {
  routeLabel: string;
  oneWayDistanceKm: number;
  totalDistanceKm: number;
  effectiveKml: number;
  rawLitersNeeded: number;
  bufferedLitersNeeded: number;
  estimatedFuelCostBaht: number;
  extraCostBaht: number;
  totalTripCostBaht: number;
  costPerKm: number;
  currentTankLiters: number;
  usableTankLiters: number;
  estimatedCurrentRangeKm: number;
  canCompleteWithCurrentFuel: boolean;
  additionalLitersToBuy: number;
  additionalRefuelCostBaht: number;
  fullTankRangeKm: number;
  refuelStopsNeeded: number;
  projectedEndOdometer: number;
}

export function calculateTripEstimate(input: TripPlanInput): TripPlanEstimate {
  const safeOneWay =
    Number.isFinite(input.oneWayDistanceKm) && input.oneWayDistanceKm > 0
      ? input.oneWayDistanceKm
      : 0;
  const totalDistanceKm = Number((safeOneWay * (input.roundTrip ? 2 : 1)).toFixed(1));

  const safeBaseKml =
    Number.isFinite(input.baseKml) && input.baseKml > 0 ? input.baseKml : 12.67;
  const conditionFactor = DRIVING_CONDITION_CONFIG[input.drivingCondition]?.factor ?? 1;
  const effectiveKml = Number((safeBaseKml * conditionFactor).toFixed(2));

  const safePrice =
    Number.isFinite(input.fuelPricePerLiter) && input.fuelPricePerLiter >= 0
      ? input.fuelPricePerLiter
      : 0;
  const safeBufferPct =
    Number.isFinite(input.bufferPercent) && input.bufferPercent >= 0
      ? Math.min(50, input.bufferPercent)
      : 0;
  const safeExtraCost =
    Number.isFinite(input.extraCostBaht) && (input.extraCostBaht ?? 0) > 0
      ? Number(input.extraCostBaht)
      : 0;

  const rawLitersNeeded =
    effectiveKml > 0 && totalDistanceKm > 0 ? totalDistanceKm / effectiveKml : 0;
  const bufferedLitersNeeded = rawLitersNeeded * (1 + safeBufferPct / 100);
  const estimatedFuelCostBaht = Math.round(bufferedLitersNeeded * safePrice);
  const totalTripCostBaht = Math.round(estimatedFuelCostBaht + safeExtraCost);
  const costPerKm =
    totalDistanceKm > 0 ? Number((estimatedFuelCostBaht / totalDistanceKm).toFixed(2)) : 0;

  const tankCap =
    Number.isFinite(input.tankCapacityLiters) && input.tankCapacityLiters > 0
      ? input.tankCapacityLiters
      : 75;
  const clampedFuelPct = Math.max(0, Math.min(100, input.fuelPercent));
  const currentTankLiters = Number(((clampedFuelPct / 100) * tankCap).toFixed(1));
  const reserveLiters = Math.min(
    tankCap * 0.25,
    Math.max(0, input.reserveLiters ?? 10)
  );
  const usableTankLiters = Number(Math.max(0, currentTankLiters - reserveLiters).toFixed(1));
  const estimatedCurrentRangeKm = Math.round(usableTankLiters * effectiveKml);

  const canCompleteWithCurrentFuel =
    totalDistanceKm === 0 || usableTankLiters >= bufferedLitersNeeded;
  const additionalLitersToBuy = Number(
    Math.max(0, bufferedLitersNeeded - usableTankLiters).toFixed(1)
  );
  const additionalRefuelCostBaht = Math.round(additionalLitersToBuy * safePrice);

  const usableFullTankLiters = Math.max(10, tankCap - reserveLiters);
  const fullTankRangeKm = Math.round(usableFullTankLiters * effectiveKml);
  const refuelStopsNeeded =
    totalDistanceKm === 0 || canCompleteWithCurrentFuel
      ? 0
      : Math.max(1, Math.ceil(additionalLitersToBuy / usableFullTankLiters));

  const projectedEndOdometer = Math.round(input.currentOdometer + totalDistanceKm);

  return {
    routeLabel: input.routeName?.trim() || 'เส้นทางที่วางแผน',
    oneWayDistanceKm: safeOneWay,
    totalDistanceKm,
    effectiveKml,
    rawLitersNeeded: Number(rawLitersNeeded.toFixed(1)),
    bufferedLitersNeeded: Number(bufferedLitersNeeded.toFixed(1)),
    estimatedFuelCostBaht,
    extraCostBaht: Math.round(safeExtraCost),
    totalTripCostBaht,
    costPerKm,
    currentTankLiters,
    usableTankLiters,
    estimatedCurrentRangeKm,
    canCompleteWithCurrentFuel,
    additionalLitersToBuy,
    additionalRefuelCostBaht,
    fullTankRangeKm,
    refuelStopsNeeded,
    projectedEndOdometer,
  };
}

export function evaluateTripMaintenanceImpacts(
  schedules: MaintenanceScheduleItem[],
  totalTripDistanceKm: number,
  warningThresholdKm = 500
): TripMaintenanceImpact[] {
  const safeDist = Math.max(0, totalTripDistanceKm);
  const safeThreshold = warningThresholdKm > 0 ? warningThresholdKm : 500;

  return schedules
    .map((item) => {
      const remainingAfterTripKm = Math.round(item.remainingKm - safeDist);
      const becomesOverdueDuringTrip = remainingAfterTripKm <= 0;
      const becomesWarningDuringTrip =
        !becomesOverdueDuringTrip && remainingAfterTripKm <= safeThreshold;
      return {
        key: item.key,
        label: item.label,
        nextDueKm: item.nextDueKm,
        currentRemainingKm: item.remainingKm,
        remainingAfterTripKm,
        becomesOverdueDuringTrip,
        becomesWarningDuringTrip,
      };
    })
    .filter((item) => item.becomesOverdueDuringTrip || item.becomesWarningDuringTrip)
    .sort((a, b) => a.remainingAfterTripKm - b.remainingAfterTripKm);
}
