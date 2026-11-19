import type {
  FuelLogEntry,
  MaintenanceScheduleItem,
  OdometerLogEntry,
} from '../types/maintenance';
import {
  addMonths,
  computeMonthlyOdometerSummary,
  computeOdometerTrend,
  formatThaiMonthShortYear,
  formatThaiMonthYear,
} from './maintenance';

export type DrivingCondition = 'highway' | 'mixed' | 'city_mountain';

export interface LatLngPoint {
  lat: number;
  lng: number;
}

export interface TripPresetRoute {
  id: string;
  label: string;
  origin: string;
  destination: string;
  destinationQuery: string;
  originCoords?: LatLngPoint;
  destinationCoords?: LatLngPoint;
  oneWayKm: number;
  note: string;
}

export const TRIP_PRESET_ROUTES: TripPresetRoute[] = [
  {
    id: 'bkk-pattaya',
    label: 'กรุงเทพฯ – พัทยา',
    origin: 'กรุงเทพฯ',
    destination: 'พัทยา (ชลบุรี)',
    destinationQuery: 'พัทยา ชลบุรี ประเทศไทย',
    oneWayKm: 150,
    note: 'มอเตอร์เวย์สาย 7 ขับขี่ทางไกล',
  },
  {
    id: 'siamcc-nayaiam',
    label: 'Siam CC บางนา – นายายอาม',
    origin: 'Siam Country Club Bangkok (บางนา-ตราด)',
    destination: 'ต.ช้างข้าม อ.นายายอาม (จันทบุรี)',
    destinationQuery: 'ช้างข้าม อำเภอนายายอาม จันทบุรี ประเทศไทย',
    originCoords: { lat: 13.6143643, lng: 100.7913915 },
    destinationCoords: { lat: 12.7550739, lng: 101.8605464 },
    oneWayKm: 174,
    note: 'จาก Siam Country Club Bangkok (ถ.บางนา-ตราด อ.บางเสาธง) → ต.ช้างข้าม อ.นายายอาม จ.จันทบุรี (~174 กม.)',
  },
  {
    id: 'bkk-khaoyai',
    label: 'กรุงเทพฯ – เขาใหญ่',
    origin: 'กรุงเทพฯ',
    destination: 'ปากช่อง / เขาใหญ่',
    destinationQuery: 'ปากช่อง นครราชสีมา ประเทศไทย',
    oneWayKm: 185,
    note: 'มีช่วงขึ้นเนินและทางโค้ง',
  },
  {
    id: 'bkk-huahin',
    label: 'กรุงเทพฯ – หัวหิน',
    origin: 'กรุงเทพฯ',
    destination: 'หัวหิน (ประจวบฯ)',
    destinationQuery: 'หัวหิน ประจวบคีรีขันธ์ ประเทศไทย',
    oneWayKm: 200,
    note: 'พระราม 2 / เพชรเกษม',
  },
  {
    id: 'bkk-chiangmai',
    label: 'กรุงเทพฯ – เชียงใหม่',
    origin: 'กรุงเทพฯ',
    destination: 'เชียงใหม่',
    destinationQuery: 'อำเภอเมืองเชียงใหม่ เชียงใหม่ ประเทศไทย',
    oneWayKm: 695,
    note: 'ทางไกลสายเหนือ',
  },
  {
    id: 'bkk-phuket',
    label: 'กรุงเทพฯ – ภูเก็ต',
    origin: 'กรุงเทพฯ',
    destination: 'ภูเก็ต',
    destinationQuery: 'อำเภอเมืองภูเก็ต ภูเก็ต ประเทศไทย',
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

export function extractDestinationFromRouteName(routeName: string): string {
  const trimmed = routeName.trim();
  if (!trimmed) return '';
  const parts = trimmed.split(/\s*[–—\-→>]+\s*|\s+ไป\s+/);
  const candidate = (parts.length > 1 ? parts[parts.length - 1] : trimmed).trim();
  if (!candidate) return '';
  return candidate.includes('ไทย') ? candidate : `${candidate} ประเทศไทย`;
}

export function decodeEncodedPolyline(encoded: string): LatLngPoint[] {
  if (!encoded) return [];
  const points: LatLngPoint[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    const deltaLat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lat += deltaLat;

    if (index >= encoded.length) break;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    const deltaLng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lng += deltaLng;

    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }

  return points;
}

export function haversineDistanceKm(a: LatLngPoint, b: LatLngPoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h =
    sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return 2 * earthRadiusKm * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function buildRouteCumulativeDistances(points: LatLngPoint[]): number[] {
  if (points.length === 0) return [];
  const cum: number[] = [0];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineDistanceKm(points[i - 1], points[i]);
    cum.push(total);
  }
  return cum;
}

export function interpolatePointAtDistanceKm(
  points: LatLngPoint[],
  cumKm: number[],
  targetKm: number
): LatLngPoint | null {
  if (points.length === 0 || cumKm.length !== points.length) return null;
  if (targetKm <= 0) return points[0];
  const totalKm = cumKm[cumKm.length - 1];
  if (targetKm >= totalKm) return points[points.length - 1];

  for (let i = 1; i < points.length; i++) {
    if (cumKm[i] >= targetKm) {
      const segStart = cumKm[i - 1];
      const segEnd = cumKm[i];
      const segLen = segEnd - segStart;
      if (segLen <= 0) return points[i];
      const ratio = (targetKm - segStart) / segLen;
      return {
        lat: points[i - 1].lat + (points[i].lat - points[i - 1].lat) * ratio,
        lng: points[i - 1].lng + (points[i].lng - points[i - 1].lng) * ratio,
      };
    }
  }
  return points[points.length - 1];
}

export function projectPointOntoRouteKm(
  points: LatLngPoint[],
  cumKm: number[],
  target: LatLngPoint
): { routeKm: number; deviationKm: number } {
  if (points.length === 0 || cumKm.length !== points.length) {
    return { routeKm: 0, deviationKm: 0 };
  }
  if (points.length === 1) {
    return {
      routeKm: 0,
      deviationKm: Number(haversineDistanceKm(points[0], target).toFixed(2)),
    };
  }

  let bestRouteKm = 0;
  let bestDistKm = Infinity;

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const cosLat = Math.cos((a.lat * Math.PI) / 180);
    const ax = a.lng * cosLat;
    const ay = a.lat;
    const bx = b.lng * cosLat;
    const by = b.lat;
    const px = target.lng * cosLat;
    const py = target.lat;

    const abx = bx - ax;
    const aby = by - ay;
    const abLenSq = abx * abx + aby * aby;
    const t =
      abLenSq > 0
        ? Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / abLenSq))
        : 0;

    const closest: LatLngPoint = {
      lat: a.lat + (b.lat - a.lat) * t,
      lng: a.lng + (b.lng - a.lng) * t,
    };
    const dKm = haversineDistanceKm(closest, target);
    if (dKm < bestDistKm) {
      bestDistKm = dKm;
      bestRouteKm = cumKm[i] + (cumKm[i + 1] - cumKm[i]) * t;
    }
  }

  return {
    routeKm: Number(bestRouteKm.toFixed(1)),
    deviationKm: Number(bestDistKm.toFixed(2)),
  };
}

export interface TankRefuelMilestone {
  index: number;
  kmFromOrigin: number;
  coords: LatLngPoint;
  isFirstStop: boolean;
  label: string;
}

export function computeTankRefuelMilestones(params: {
  points: LatLngPoint[];
  cumKm: number[];
  routeDistanceKm: number;
  estimatedCurrentRangeKm: number;
  fullTankRangeKm: number;
}): TankRefuelMilestone[] {
  const {
    points,
    cumKm,
    routeDistanceKm,
    estimatedCurrentRangeKm,
    fullTankRangeKm,
  } = params;

  if (
    points.length < 2 ||
    routeDistanceKm <= 0 ||
    estimatedCurrentRangeKm >= routeDistanceKm
  ) {
    return [];
  }

  const milestones: TankRefuelMilestone[] = [];
  const polyTotalKm = cumKm[cumKm.length - 1] || routeDistanceKm;
  const scaleFactor = routeDistanceKm > 0 ? polyTotalKm / routeDistanceKm : 1;

  let nextStopKm = Math.max(20, estimatedCurrentRangeKm);
  let idx = 1;
  const safeFullRange = Math.max(100, fullTankRangeKm);

  while (nextStopKm < routeDistanceKm && milestones.length < 6) {
    const coords = interpolatePointAtDistanceKm(
      points,
      cumKm,
      nextStopKm * scaleFactor
    );
    if (coords) {
      milestones.push({
        index: idx,
        kmFromOrigin: Math.round(nextStopKm),
        coords,
        isFirstStop: idx === 1,
        label:
          idx === 1
            ? `จุดที่ต้องเติม (กม.ที่ ${Math.round(nextStopKm).toLocaleString('th-TH')} · ก่อนเข้าขีดสำรอง ~10 ล.)`
            : `จุดแวะเติมรอบที่ ${idx} (กม.ที่ ${Math.round(nextStopKm).toLocaleString('th-TH')})`,
      });
    }
    nextStopKm += safeFullRange;
    idx += 1;
  }

  return milestones;
}

export interface GasStationApiItem {
  id: string;
  name: string;
  address: string;
  location: LatLngPoint;
  rating: number | null;
  userRatingCount: number | null;
  openNow: boolean | null;
  googleMapsUri: string | null;
  directionsUri: string | null;
  routingDistanceMeters: number | null;
  routingDurationSeconds: number | null;
}

export type StationFuelStatus = 'recommended_stop' | 'within_tank' | 'after_refuel';

export interface EnrichedGasStation extends GasStationApiItem {
  distanceKmFromOrigin: number;
  routeKmPosition: number | null;
  routeDeviationKm: number | null;
  durationMinutes: number | null;
  fuelStatus: StationFuelStatus;
  estimatedRemainingLitersOnArrival: number;
  estimatedRemainingPercentOnArrival: number;
}

export function enrichGasStationsForTank(params: {
  stations: GasStationApiItem[];
  origin: LatLngPoint;
  points: LatLngPoint[];
  cumKm: number[];
  estimate: TripPlanEstimate;
  tankCapacityLiters: number;
  isAlongRoute: boolean;
}): EnrichedGasStation[] {
  const {
    stations,
    origin,
    points,
    cumKm,
    estimate,
    tankCapacityLiters,
    isAlongRoute,
  } = params;

  const hasRoute = isAlongRoute && points.length >= 2 && cumKm.length === points.length;
  const safeKml = estimate.effectiveKml > 0 ? estimate.effectiveKml : 12;
  const safeCap = tankCapacityLiters > 0 ? tankCapacityLiters : 75;
  const rangeLimit = estimate.estimatedCurrentRangeKm;
  const recommendedWindowStart = Math.max(0, rangeLimit * 0.6);

  const enriched = stations.map((st): EnrichedGasStation => {
    const straightKm = Number(haversineDistanceKm(origin, st.location).toFixed(1));
    const projected = hasRoute
      ? projectPointOntoRouteKm(points, cumKm, st.location)
      : null;
    const distanceKmFromOrigin =
      typeof st.routingDistanceMeters === 'number' && st.routingDistanceMeters > 0
        ? Number((st.routingDistanceMeters / 1000).toFixed(1))
        : projected
          ? projected.routeKm
          : straightKm;

    const effectiveKmAlong =
      typeof st.routingDistanceMeters === 'number' && st.routingDistanceMeters > 0
        ? distanceKmFromOrigin
        : projected
          ? projected.routeKm
          : distanceKmFromOrigin;
    const litersConsumed = effectiveKmAlong / safeKml;
    const remainingLiters = Number(
      Math.max(0, estimate.currentTankLiters - litersConsumed).toFixed(1)
    );
    const remainingPct = Math.max(
      0,
      Math.min(100, Math.round((remainingLiters / safeCap) * 100))
    );

    let fuelStatus: StationFuelStatus;
    if (effectiveKmAlong > rangeLimit) {
      fuelStatus = 'after_refuel';
    } else if (
      !estimate.canCompleteWithCurrentFuel &&
      effectiveKmAlong >= recommendedWindowStart
    ) {
      fuelStatus = 'recommended_stop';
    } else {
      fuelStatus = 'within_tank';
    }

    return {
      ...st,
      distanceKmFromOrigin,
      routeKmPosition:
        hasRoute
          ? typeof st.routingDistanceMeters === 'number' && st.routingDistanceMeters > 0
            ? distanceKmFromOrigin
            : projected
              ? projected.routeKm
              : null
          : null,
      routeDeviationKm: projected ? projected.deviationKm : null,
      durationMinutes:
        typeof st.routingDurationSeconds === 'number'
          ? Math.max(1, Math.round(st.routingDurationSeconds / 60))
          : null,
      fuelStatus,
      estimatedRemainingLitersOnArrival: remainingLiters,
      estimatedRemainingPercentOnArrival: remainingPct,
    };
  });

  // Ensure at least the farthest reachable station along route is promoted to recommended_stop if refueling is needed and none hit the upper 60%-100% window
  if (
    !estimate.canCompleteWithCurrentFuel &&
    enriched.length > 0 &&
    !enriched.some((s) => s.fuelStatus === 'recommended_stop')
  ) {
    const within = enriched
      .filter((s) => s.fuelStatus === 'within_tank')
      .sort((a, b) => b.distanceKmFromOrigin - a.distanceKmFromOrigin);
    if (within[0]) {
      within[0].fuelStatus = 'recommended_stop';
    }
  }

  return enriched.sort((a, b) => a.distanceKmFromOrigin - b.distanceKmFromOrigin);
}

export type FuelPriceTrendMode = 'auto' | 'steady' | 'rising';
export type FuelPriceTrendDirection = 'up' | 'down' | 'steady';
export type MileageHistorySource = 'odometer_history' | 'fuel_history' | 'default_estimate';

export interface FuelPriceTrendAnalysis {
  direction: FuelPriceTrendDirection;
  observedMonthlyDeltaBaht: number;
  latestPricePerLiter: number;
  averageHistoricalPricePerLiter: number;
  sampleCount: number;
}

export interface MonthlyFuelForecastPoint {
  monthIndex: number;
  monthKey: string;
  monthLabel: string;
  shortLabel: string;
  projectedKm: number;
  projectedLiters: number;
  projectedPricePerLiter: number;
  estimatedCostBaht: number;
  cumulativeCostBaht: number;
}

export interface AnnualFuelForecastSummary {
  points: MonthlyFuelForecastPoint[];
  historicalMonthlyKm: number;
  mileageSource: MileageHistorySource;
  effectiveKml: number;
  baselinePricePerLiter: number;
  endPricePerLiter: number;
  observedMonthlyPriceDelta: number;
  appliedMonthlyPriceDelta: number;
  priceTrendDirection: FuelPriceTrendDirection;
  totalAnnualKm: number;
  totalAnnualLiters: number;
  totalAnnualCostBaht: number;
  averageMonthlyCostBaht: number;
}

export function analyzeFuelPriceTrend(
  fuelLogs: FuelLogEntry[],
  fallbackPrice = 33.55
): FuelPriceTrendAnalysis {
  const validLogs = [...fuelLogs]
    .filter(
      (l) =>
        /^\d{4}-\d{2}-\d{2}$/.test(l.date.trim()) &&
        Number.isFinite(l.pricePerLiter) &&
        l.pricePerLiter > 0
    )
    .sort((a, b) =>
      a.date !== b.date ? a.date.localeCompare(b.date) : a.odometer - b.odometer
    );

  if (validLogs.length === 0) {
    const safePrice =
      Number.isFinite(fallbackPrice) && fallbackPrice > 0 ? fallbackPrice : 33.55;
    return {
      direction: 'steady',
      observedMonthlyDeltaBaht: 0,
      latestPricePerLiter: Number(safePrice.toFixed(2)),
      averageHistoricalPricePerLiter: Number(safePrice.toFixed(2)),
      sampleCount: 0,
    };
  }

  const latestPricePerLiter = Number(
    validLogs[validLogs.length - 1].pricePerLiter.toFixed(2)
  );
  const avgPrice =
    validLogs.reduce((sum, l) => sum + l.pricePerLiter, 0) / validLogs.length;

  if (validLogs.length < 2) {
    return {
      direction: 'steady',
      observedMonthlyDeltaBaht: 0,
      latestPricePerLiter,
      averageHistoricalPricePerLiter: Number(avgPrice.toFixed(2)),
      sampleCount: validLogs.length,
    };
  }

  // Compare earlier half vs recent half of recorded fills over smoothed time span
  // to avoid short-term pump spikes extrapolating into unrealistic runaway numbers.
  const splitIdx = Math.max(1, Math.floor(validLogs.length / 2));
  const earlierSlice = validLogs.slice(0, splitIdx);
  const recentSlice = validLogs.slice(splitIdx);
  const earlierAvg =
    earlierSlice.reduce((sum, l) => sum + l.pricePerLiter, 0) / earlierSlice.length;
  const recentAvg =
    recentSlice.reduce((sum, l) => sum + l.pricePerLiter, 0) / recentSlice.length;

  const firstMs = Date.parse(validLogs[0].date);
  const lastMs = Date.parse(validLogs[validLogs.length - 1].date);
  const spanDays = Math.max(0, Math.round((lastMs - firstMs) / 86_400_000));
  const smoothedMonths = Math.max(3, spanDays / 30.4375);

  const rawMonthlySlope = (recentAvg - earlierAvg) / smoothedMonths;
  // Dampen and clamp within realistic monthly diesel price drift bounds (-0.20 to +0.30 THB/L/month)
  const dampedMonthlyDelta = rawMonthlySlope * 0.25;
  const clampedDelta = Number(
    Math.max(-0.2, Math.min(0.3, dampedMonthlyDelta)).toFixed(2)
  );

  const direction: FuelPriceTrendDirection =
    clampedDelta >= 0.03 ? 'up' : clampedDelta <= -0.03 ? 'down' : 'steady';

  return {
    direction,
    observedMonthlyDeltaBaht: direction === 'steady' ? 0 : clampedDelta,
    latestPricePerLiter,
    averageHistoricalPricePerLiter: Number(avgPrice.toFixed(2)),
    sampleCount: validLogs.length,
  };
}

export function computeAnnualFuelCostForecast(params: {
  odometerLogs: OdometerLogEntry[];
  fuelLogs: FuelLogEntry[];
  baseKml: number;
  currentFuelPricePerLiter: number;
  trendMode?: FuelPriceTrendMode;
  startMonthKey?: string;
}): AnnualFuelForecastSummary {
  const {
    odometerLogs,
    fuelLogs,
    baseKml,
    currentFuelPricePerLiter,
    trendMode = 'auto',
    startMonthKey,
  } = params;

  const safeKml = Number.isFinite(baseKml) && baseKml > 0 ? baseKml : 12.67;

  // 1. Derive historical average monthly mileage
  const odoTrend = computeOdometerTrend(odometerLogs);
  const monthlyOdoSummary = computeMonthlyOdometerSummary(odometerLogs);

  let historicalMonthlyKm = 0;
  let mileageSource: MileageHistorySource = 'default_estimate';

  if (odoTrend.averageMonthlyKm > 0) {
    historicalMonthlyKm = odoTrend.averageMonthlyKm;
    mileageSource = 'odometer_history';
  } else if (monthlyOdoSummary.averageMonthlyDistanceKm > 0) {
    historicalMonthlyKm = monthlyOdoSummary.averageMonthlyDistanceKm;
    mileageSource = 'odometer_history';
  } else {
    const validFuel = [...fuelLogs]
      .filter(
        (l) =>
          /^\d{4}-\d{2}-\d{2}$/.test(l.date.trim()) &&
          Number.isFinite(l.distance) &&
          l.distance > 0
      )
      .sort((a, b) => a.date.localeCompare(b.date));

    if (validFuel.length >= 2) {
      const totalFuelDist = validFuel.reduce((sum, l) => sum + l.distance, 0);
      const spanDays = Math.max(
        1,
        Math.round(
          (Date.parse(validFuel[validFuel.length - 1].date) -
            Date.parse(validFuel[0].date)) /
            86_400_000
        )
      );
      historicalMonthlyKm = Math.round((totalFuelDist / spanDays) * 30.4375);
      mileageSource = 'fuel_history';
    } else if (validFuel.length === 1) {
      historicalMonthlyKm = Math.round(validFuel[0].distance);
      mileageSource = 'fuel_history';
    } else {
      historicalMonthlyKm = 900;
      mileageSource = 'default_estimate';
    }
  }

  // 2. Analyze fuel price trend
  const priceAnalysis = analyzeFuelPriceTrend(fuelLogs, currentFuelPricePerLiter);
  const baselinePricePerLiter = Number(
    (
      Number.isFinite(currentFuelPricePerLiter) && currentFuelPricePerLiter > 0
        ? currentFuelPricePerLiter
        : priceAnalysis.latestPricePerLiter
    ).toFixed(2)
  );

  let appliedMonthlyPriceDelta = 0;
  if (trendMode === 'auto') {
    appliedMonthlyPriceDelta = priceAnalysis.observedMonthlyDeltaBaht;
  } else if (trendMode === 'rising') {
    appliedMonthlyPriceDelta = 0.25;
  } else {
    appliedMonthlyPriceDelta = 0;
  }

  // 3. Determine starting month (default: next month from latest log or current calendar month)
  const fallbackBaseMonth = new Date().toISOString().slice(0, 7);
  const resolvedStartMonth =
    startMonthKey && /^\d{4}-\d{2}$/.test(startMonthKey)
      ? startMonthKey
      : addMonths(fallbackBaseMonth, 1);

  const minFloorPrice = Math.max(22, Number((baselinePricePerLiter * 0.8).toFixed(2)));
  const maxCeilPrice = Math.min(65, Number((baselinePricePerLiter * 1.4).toFixed(2)));

  const points: MonthlyFuelForecastPoint[] = [];
  let cumulativeCost = 0;
  let totalLiters = 0;

  for (let i = 0; i < 12; i++) {
    const monthKey = addMonths(resolvedStartMonth, i);
    const rawProjectedPrice = baselinePricePerLiter + appliedMonthlyPriceDelta * (i + 1);
    const projectedPricePerLiter = Number(
      Math.max(minFloorPrice, Math.min(maxCeilPrice, rawProjectedPrice)).toFixed(2)
    );
    const exactLiters = historicalMonthlyKm / safeKml;
    const projectedLiters = Number(exactLiters.toFixed(1));
    const estimatedCostBaht = Math.round(exactLiters * projectedPricePerLiter);

    cumulativeCost += estimatedCostBaht;
    totalLiters += exactLiters;

    points.push({
      monthIndex: i + 1,
      monthKey,
      monthLabel: formatThaiMonthYear(monthKey),
      shortLabel: formatThaiMonthShortYear(monthKey),
      projectedKm: historicalMonthlyKm,
      projectedLiters,
      projectedPricePerLiter,
      estimatedCostBaht,
      cumulativeCostBaht: cumulativeCost,
    });
  }

  const endPricePerLiter =
    points[points.length - 1]?.projectedPricePerLiter ?? baselinePricePerLiter;
  const totalAnnualCostBaht = cumulativeCost;
  const averageMonthlyCostBaht = Math.round(totalAnnualCostBaht / 12);

  const effectiveDirection: FuelPriceTrendDirection =
    appliedMonthlyPriceDelta >= 0.03
      ? 'up'
      : appliedMonthlyPriceDelta <= -0.03
        ? 'down'
        : 'steady';

  return {
    points,
    historicalMonthlyKm,
    mileageSource,
    effectiveKml: Number(safeKml.toFixed(2)),
    baselinePricePerLiter,
    endPricePerLiter,
    observedMonthlyPriceDelta: priceAnalysis.observedMonthlyDeltaBaht,
    appliedMonthlyPriceDelta,
    priceTrendDirection: effectiveDirection,
    totalAnnualKm: historicalMonthlyKm * 12,
    totalAnnualLiters: Number(totalLiters.toFixed(1)),
    totalAnnualCostBaht,
    averageMonthlyCostBaht,
  };
}

