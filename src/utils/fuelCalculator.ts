export interface FuelCalculatorInput {
  plannedDistanceKm: number;
  expectedFuelPrice: number;
  historicalAvgKml: number;
  roundTrip?: boolean;
  bufferPercent?: number;
  currentTankLiters?: number;
}

export interface FuelCalculatorEstimate {
  valid: boolean;
  error?: string;
  plannedDistanceKm: number;
  effectiveDistanceKm: number;
  effectiveKml: number;
  expectedFuelPrice: number;
  bufferPercent: number;
  baseLitersNeeded: number;
  bufferedLitersNeeded: number;
  baseCostBaht: number;
  estimatedTotalCostBaht: number;
  costPerKm: number;
  currentTankLiters: number;
  canCompleteWithCurrentFuel: boolean;
  additionalLitersNeeded: number;
  additionalRefuelCostBaht: number;
}

export const FUEL_CALCULATOR_DISTANCE_PRESETS = [50, 100, 200, 350, 500, 700] as const;
export const FUEL_CALCULATOR_BUFFER_OPTIONS = [0, 10, 15] as const;

export function computeFuelTripCostEstimate(
  input: FuelCalculatorInput
): FuelCalculatorEstimate {
  const plannedDistanceKm = Number(input.plannedDistanceKm);
  const expectedFuelPrice = Number(input.expectedFuelPrice);
  const historicalAvgKml = Number(input.historicalAvgKml);
  const roundTrip = Boolean(input.roundTrip);
  const bufferPercent = Math.max(0, Math.min(50, Number(input.bufferPercent ?? 0) || 0));
  const currentTankLiters = Math.max(0, Number(input.currentTankLiters ?? 0) || 0);

  if (!Number.isFinite(plannedDistanceKm) || plannedDistanceKm <= 0) {
    return {
      valid: false,
      error: 'กรุณาระบุระยะทางที่วางแผนมากกว่า 0 กม.',
      plannedDistanceKm: 0,
      effectiveDistanceKm: 0,
      effectiveKml: Number.isFinite(historicalAvgKml) && historicalAvgKml > 0 ? historicalAvgKml : 0,
      expectedFuelPrice: Number.isFinite(expectedFuelPrice) && expectedFuelPrice >= 0 ? expectedFuelPrice : 0,
      bufferPercent,
      baseLitersNeeded: 0,
      bufferedLitersNeeded: 0,
      baseCostBaht: 0,
      estimatedTotalCostBaht: 0,
      costPerKm: 0,
      currentTankLiters,
      canCompleteWithCurrentFuel: true,
      additionalLitersNeeded: 0,
      additionalRefuelCostBaht: 0,
    };
  }

  if (!Number.isFinite(expectedFuelPrice) || expectedFuelPrice <= 0) {
    return {
      valid: false,
      error: 'กรุณาระบุราคาน้ำมันที่คาดการณ์มากกว่า 0 บาท/ลิตร',
      plannedDistanceKm,
      effectiveDistanceKm: roundTrip ? plannedDistanceKm * 2 : plannedDistanceKm,
      effectiveKml: Number.isFinite(historicalAvgKml) && historicalAvgKml > 0 ? historicalAvgKml : 0,
      expectedFuelPrice: 0,
      bufferPercent,
      baseLitersNeeded: 0,
      bufferedLitersNeeded: 0,
      baseCostBaht: 0,
      estimatedTotalCostBaht: 0,
      costPerKm: 0,
      currentTankLiters,
      canCompleteWithCurrentFuel: true,
      additionalLitersNeeded: 0,
      additionalRefuelCostBaht: 0,
    };
  }

  if (!Number.isFinite(historicalAvgKml) || historicalAvgKml <= 0) {
    return {
      valid: false,
      error: 'ยังไม่มีค่าอัตราสิ้นเปลืองเฉลี่ย (กม./ลิตร) ที่ใช้งานได้ กรุณาระบุค่า กม./ลิตร',
      plannedDistanceKm,
      effectiveDistanceKm: roundTrip ? plannedDistanceKm * 2 : plannedDistanceKm,
      effectiveKml: 0,
      expectedFuelPrice,
      bufferPercent,
      baseLitersNeeded: 0,
      bufferedLitersNeeded: 0,
      baseCostBaht: 0,
      estimatedTotalCostBaht: 0,
      costPerKm: 0,
      currentTankLiters,
      canCompleteWithCurrentFuel: false,
      additionalLitersNeeded: 0,
      additionalRefuelCostBaht: 0,
    };
  }

  const effectiveDistanceKm = Number((roundTrip ? plannedDistanceKm * 2 : plannedDistanceKm).toFixed(1));
  const baseLitersNeeded = effectiveDistanceKm / historicalAvgKml;
  const bufferedLitersNeeded = baseLitersNeeded * (1 + bufferPercent / 100);
  const baseCostBaht = baseLitersNeeded * expectedFuelPrice;
  const estimatedTotalCostBaht = bufferedLitersNeeded * expectedFuelPrice;
  const costPerKm = expectedFuelPrice / historicalAvgKml;

  const canCompleteWithCurrentFuel = currentTankLiters >= bufferedLitersNeeded;
  const additionalLitersNeeded = Math.max(0, bufferedLitersNeeded - currentTankLiters);
  const additionalRefuelCostBaht = additionalLitersNeeded * expectedFuelPrice;

  return {
    valid: true,
    plannedDistanceKm,
    effectiveDistanceKm,
    effectiveKml: Number(historicalAvgKml.toFixed(2)),
    expectedFuelPrice: Number(expectedFuelPrice.toFixed(2)),
    bufferPercent,
    baseLitersNeeded: Number(baseLitersNeeded.toFixed(2)),
    bufferedLitersNeeded: Number(bufferedLitersNeeded.toFixed(2)),
    baseCostBaht: Math.round(baseCostBaht),
    estimatedTotalCostBaht: Math.round(estimatedTotalCostBaht),
    costPerKm: Number(costPerKm.toFixed(2)),
    currentTankLiters: Number(currentTankLiters.toFixed(1)),
    canCompleteWithCurrentFuel,
    additionalLitersNeeded: Number(additionalLitersNeeded.toFixed(2)),
    additionalRefuelCostBaht: Math.round(additionalRefuelCostBaht),
  };
}
