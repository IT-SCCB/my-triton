import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Compass,
  ExternalLink,
  Fuel,
  Loader2,
  Navigation,
  Star,
} from 'lucide-react';
import { formatKm } from '../utils/maintenance';
import type { LatLngPoint, TripPlanEstimate } from '../utils/tripPlanner';
import {
  buildRouteCumulativeDistances,
  computeTankRefuelMilestones,
  decodeEncodedPolyline,
  enrichGasStationsForTank,
} from '../utils/tripPlanner';
import type { RouteStationsApiResponse } from '../utils/clientOsm';
import { OsmMapView } from './OsmMapView';

export type { RouteStationsApiResponse };

interface TripStationsMapPanelProps {
  loading: boolean;
  error: string | null;
  locationLabel: string;
  isFallbackLocation: boolean;
  data: RouteStationsApiResponse | null;
  estimate: TripPlanEstimate;
  tankCapacityLiters: number;
  fuelPercent: number;
  onApplyRouteDistanceKm?: (km: number) => void;
  onRetrySearch?: () => void;
}

function formatDurationThai(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '-';
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours === 0) return `${mins} นาที`;
  if (mins === 0) return `${hours} ชม.`;
  return `${hours} ชม. ${mins} นาที`;
}

export function TripStationsMapPanel({
  loading,
  error,
  locationLabel,
  isFallbackLocation,
  data,
  estimate,
  tankCapacityLiters,
  fuelPercent,
  onApplyRouteDistanceKm,
  onRetrySearch,
}: TripStationsMapPanelProps) {
  const [listMode, setListMode] = useState<'along' | 'nearby'>('along');
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);
  const [selectedMilestoneIdx, setSelectedMilestoneIdx] = useState<number | null>(null);
  const [focusedLocation, setFocusedLocation] = useState<LatLngPoint | null>(null);

  const routePoints = useMemo(
    () => (data?.route?.encodedPolyline ? decodeEncodedPolyline(data.route.encodedPolyline) : []),
    [data?.route?.encodedPolyline]
  );

  const cumKm = useMemo(() => buildRouteCumulativeDistances(routePoints), [routePoints]);

  const routeDistanceKm = data?.route?.distanceMeters
    ? Math.round(data.route.distanceMeters / 1000)
    : 0;

  const refuelMilestones = useMemo(
    () =>
      computeTankRefuelMilestones({
        points: routePoints,
        cumKm,
        routeDistanceKm: routeDistanceKm || estimate.oneWayDistanceKm,
        estimatedCurrentRangeKm: estimate.estimatedCurrentRangeKm,
        fullTankRangeKm: estimate.fullTankRangeKm,
      }),
    [
      routePoints,
      cumKm,
      routeDistanceKm,
      estimate.oneWayDistanceKm,
      estimate.estimatedCurrentRangeKm,
      estimate.fullTankRangeKm,
    ]
  );

  const enrichedAlongStations = useMemo(() => {
    if (!data) return [];
    return enrichGasStationsForTank({
      stations: data.alongRouteStations,
      origin: data.origin,
      points: routePoints,
      cumKm,
      estimate,
      tankCapacityLiters,
      isAlongRoute: true,
    });
  }, [data, routePoints, cumKm, estimate, tankCapacityLiters]);

  const enrichedNearbyStations = useMemo(() => {
    if (!data) return [];
    return enrichGasStationsForTank({
      stations: data.nearbyStations,
      origin: data.origin,
      points: routePoints,
      cumKm,
      estimate,
      tankCapacityLiters,
      isAlongRoute: false,
    });
  }, [data, routePoints, cumKm, estimate, tankCapacityLiters]);

  useEffect(() => {
    if (data) {
      setSelectedStationId(null);
      setSelectedMilestoneIdx(null);
      setFocusedLocation(null);
      if (enrichedAlongStations.length > 0) {
        setListMode('along');
      } else {
        setListMode('nearby');
      }
    }
  }, [data, enrichedAlongStations.length]);

  const displayedStations =
    listMode === 'along' && enrichedAlongStations.length > 0
      ? enrichedAlongStations
      : enrichedNearbyStations;

  const recommendedCount = enrichedAlongStations.filter(
    (s) => s.fuelStatus === 'recommended_stop'
  ).length;

  const effectiveRangeCoveragePct =
    routeDistanceKm > 0
      ? Math.min(100, Math.round((estimate.estimatedCurrentRangeKm / routeDistanceKm) * 100))
      : 100;

  if (loading) {
    return (
      <div className="border-t border-slate-200 bg-slate-50/70 p-6 flex items-center justify-center gap-3 text-sm text-slate-700">
        <Loader2 className="w-5 h-5 text-blue-700 animate-spin shrink-0" aria-hidden="true" />
        <span>กำลังระบุพิกัด GPS และค้นหาปั๊มน้ำมันตลอดเส้นทางบน OpenStreetMap...</span>
      </div>
    );
  }

  // แผนที่กับเส้นทางไม่พึ่งข้อมูลปั๊ม — ถ้ามี data แล้วให้แสดงแผงเสมอ
  // error (เช่น โหลดไฟล์ปั๊มไม่ได้) แสดงเป็นป้ายเตือนข้างในแผงแทนการซ่อนทั้งแผง
  if (!data) {
    if (error) {
      return (
        <div className="border-t border-slate-200 bg-red-50/60 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 text-sm text-red-900">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <p className="font-medium">ไม่สามารถโหลดแผนที่หรือค้นหาปั๊มน้ำมันได้</p>
              <p className="text-xs text-red-800 mt-0.5">{error}</p>
            </div>
          </div>
          {onRetrySearch && (
            <button
              type="button"
              onClick={onRetrySearch}
              className="px-3.5 py-2 rounded-lg border border-red-300 bg-white text-red-900 hover:bg-red-50 text-xs font-medium cursor-pointer shrink-0 self-start sm:self-auto"
            >
              ลองค้นหาอีกครั้ง
            </button>
          )}
        </div>
      );
    }
    return null;
  }

  return (
    <div
      data-testid="trip-stations-map-panel"
      className="border-t border-slate-200 bg-white p-5 sm:p-6 space-y-4"
    >
      {/* Panel Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm sm:text-base font-semibold text-slate-900 flex items-center gap-2">
            <Navigation className="w-4 h-4 text-blue-700 shrink-0" aria-hidden="true" />
            <span>แผนที่เส้นทาง & จุดแวะเติมน้ำมันตามระยะถัง ({tankCapacityLiters} ลิตร)</span>
          </h3>
          <p className="text-xs text-slate-600 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="inline-flex items-center gap-1">
              <Compass className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
              {locationLabel}
              {isFallbackLocation && ' (พิกัดตั้งต้น)'}
            </span>
            {data.route && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums font-medium text-slate-800">
                  ระยะทางจริงขาเดียว {formatKm(routeDistanceKm)} กม. ({formatDurationThai(data.route.durationSeconds)})
                </span>
              </>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {data.route &&
            routeDistanceKm > 0 &&
            Math.abs(routeDistanceKm - estimate.oneWayDistanceKm) >= 3 &&
            onApplyRouteDistanceKm && (
              <button
                type="button"
                onClick={() => onApplyRouteDistanceKm(routeDistanceKm)}
                className="px-3 py-1.5 min-h-[34px] rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-900 text-xs font-medium transition-colors cursor-pointer"
              >
                ใช้ระยะทางจริง ({formatKm(routeDistanceKm)} กม.) คำนวณค่าน้ำมัน
              </button>
            )}

          <div
            role="group"
            aria-label="มุมมองรายการปั๊มน้ำมัน"
            className="inline-flex p-1 rounded-lg bg-slate-100"
          >
            <button
              type="button"
              onClick={() => setListMode('along')}
              disabled={enrichedAlongStations.length === 0}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                listMode === 'along'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              ตามเส้นทาง ({enrichedAlongStations.length})
            </button>
            <button
              type="button"
              onClick={() => setListMode('nearby')}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                listMode === 'nearby'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              ใกล้ตำแหน่งฉัน ({enrichedNearbyStations.length})
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="text-xs text-red-900 bg-red-50 border border-red-200 rounded-lg px-3.5 py-2 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" aria-hidden="true" />
          <span>{error}</span>
          {onRetrySearch && (
            <button
              type="button"
              onClick={onRetrySearch}
              className="ml-auto px-2.5 py-1 rounded-md border border-red-300 bg-white text-red-900 hover:bg-red-50 text-[11px] font-medium cursor-pointer shrink-0"
            >
              ลองค้นหาอีกครั้ง
            </button>
          )}
        </div>
      )}

      {data.routeNotice && (
        <div className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3.5 py-2 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" aria-hidden="true" />
          <span>{data.routeNotice}</span>
        </div>
      )}

      {/* Tank Range Progress Along Route */}
      {data.route && routeDistanceKm > 0 && (
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-medium text-slate-800 flex items-center gap-1.5">
              <Fuel className="w-3.5 h-3.5 text-amber-600" aria-hidden="true" />
              ระยะวิ่งจากน้ำมันในถังปัจจุบัน ({fuelPercent}% ≈ {estimate.currentTankLiters.toFixed(1)} ล.)
            </span>
            <span className="font-mono tabular-nums text-slate-600">
              วิ่งได้ก่อนเข้าขีดสำรอง ~{formatKm(estimate.estimatedCurrentRangeKm)} กม. / เส้นทาง {formatKm(routeDistanceKm)} กม.
            </span>
          </div>

          <div className="relative w-full h-3 bg-slate-200 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                estimate.estimatedCurrentRangeKm >= routeDistanceKm
                  ? 'bg-emerald-600'
                  : 'bg-amber-500'
              }`}
              style={{ width: `${effectiveRangeCoveragePct}%` }}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
            {estimate.estimatedCurrentRangeKm >= routeDistanceKm ? (
              <span className="inline-flex items-center gap-1 text-emerald-800 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
                ขาเดียวนี้วิ่งถึงปลายทางได้โดยไม่ต้องแวะเติมเพิ่ม
                {!estimate.canCompleteWithCurrentFuel && ' (แต่ต้องเติมเพิ่มสำหรับการเดินทางขากลับ)'}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-amber-900 font-medium">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-700" aria-hidden="true" />
                น้ำมันปัจจุบันจะเข้าขีดสำรองราว กม.ที่ {formatKm(estimate.estimatedCurrentRangeKm)}
                {recommendedCount > 0 && ` · พบจุดแนะนำแวะเติม ${recommendedCount} แห่งก่อนถึงจุดเตือน`}
              </span>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-600 inline-block" />
                จุดแนะนำแวะเติม
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block" />
                อยู่ในระยะถังปัจจุบัน
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-red-600 inline-block" />
                จุดเตือนขีดสำรอง
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Map + Stations Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        <div className="lg:col-span-7">
          <div className="w-full h-[380px] sm:h-[440px] rounded-xl overflow-hidden border border-slate-200 bg-slate-100 relative">
            <OsmMapView
              origin={data.origin}
              originLabel={locationLabel}
              routePoints={routePoints}
              endLocation={data.route?.endLocation ?? null}
              endLabel={estimate.routeLabel}
              stations={displayedStations}
              milestones={refuelMilestones}
              focusedLocation={focusedLocation}
              selectedStationId={selectedStationId}
              selectedMilestoneIdx={selectedMilestoneIdx}
              onSelectStation={(id) => {
                setSelectedMilestoneIdx(null);
                setSelectedStationId(id);
              }}
              onSelectMilestone={(idx) => {
                setSelectedStationId(null);
                setSelectedMilestoneIdx(idx);
              }}
              onCloseSelection={() => {
                setSelectedStationId(null);
                setSelectedMilestoneIdx(null);
              }}
            />
          </div>
          <p className="text-[11px] text-slate-400 mt-1.5 text-right">
            แผนที่ © OpenStreetMap contributors · ข้อมูลปั๊ม OSM (ไฟล์ static 19 พ.ย. 2569) · เส้นทางด้วย OSRM
          </p>
        </div>

        {/* Station List */}
        <div className="lg:col-span-5 space-y-2.5 max-h-[440px] overflow-y-auto pr-1">
          {displayedStations.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-600">
              ไม่พบปั๊มน้ำมันในบริเวณที่ค้นหา
            </div>
          ) : (
            displayedStations.map((st) => {
              const selected = selectedStationId === st.id;
              return (
                <div
                  key={st.id}
                  onClick={() => {
                    setSelectedMilestoneIdx(null);
                    setSelectedStationId(st.id);
                    setFocusedLocation(st.location);
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedMilestoneIdx(null);
                      setSelectedStationId(st.id);
                      setFocusedLocation(st.location);
                    }
                  }}
                  className={`rounded-xl border p-3.5 transition-colors cursor-pointer ${
                    selected
                      ? 'border-blue-700 bg-blue-50/60'
                      : st.fuelStatus === 'recommended_stop'
                        ? 'border-amber-300 bg-amber-50/40 hover:bg-amber-50'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">
                        {st.name}
                      </p>
                      {st.address && (
                        <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">
                          {st.address}
                        </p>
                      )}
                    </div>

                    {st.openNow !== null && (
                      <span
                        className={`shrink-0 px-2 py-0.5 rounded text-[11px] font-medium ${
                          st.openNow
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : 'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}
                      >
                        {st.openNow ? 'เปิดอยู่' : 'ปิดอยู่'}
                      </span>
                    )}
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-700">
                    <span className="font-mono tabular-nums font-medium text-slate-900">
                      {st.routeKmPosition !== null
                        ? `กม.ที่ ${st.routeKmPosition.toLocaleString('th-TH')}`
                        : `ห่าง ${st.distanceKmFromOrigin.toLocaleString('th-TH')} กม.`}
                    </span>
                    {st.durationMinutes !== null && (
                      <span className="font-mono tabular-nums text-slate-500">
                        ~{st.durationMinutes} นาที
                      </span>
                    )}
                    {st.rating !== null && (
                      <span className="inline-flex items-center gap-0.5 font-mono tabular-nums text-amber-700">
                        <Star className="w-3 h-3 fill-amber-500 text-amber-500" aria-hidden="true" />
                        {st.rating.toFixed(1)}
                        {st.userRatingCount ? ` (${st.userRatingCount})` : ''}
                      </span>
                    )}
                  </div>

                  <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                    <span
                      className={`text-[11px] font-medium ${
                        st.fuelStatus === 'recommended_stop'
                          ? 'text-amber-800'
                          : st.fuelStatus === 'within_tank'
                            ? 'text-emerald-800'
                            : 'text-slate-500'
                      }`}
                    >
                      {st.fuelStatus === 'recommended_stop'
                        ? `แนะนำแวะเติม · เหลือ ~${st.estimatedRemainingLitersOnArrival} ล. (${st.estimatedRemainingPercentOnArrival}%)`
                        : st.fuelStatus === 'within_tank'
                          ? `ถึงจุดนี้เหลือ ~${st.estimatedRemainingLitersOnArrival} ล. (${st.estimatedRemainingPercentOnArrival}%)`
                          : 'ช่วงถังถัดไป (ต้องเติมก่อนถึงจุดนี้)'}
                    </span>

                    {(st.directionsUri || st.googleMapsUri) && (
                      <a
                        href={st.directionsUri ?? st.googleMapsUri ?? '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-900 hover:underline shrink-0"
                      >
                        <span>นำทาง</span>
                        <ExternalLink className="w-3 h-3" aria-hidden="true" />
                      </a>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
