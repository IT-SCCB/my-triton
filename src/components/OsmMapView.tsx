/**
 * แผนที่ OpenStreetMap ด้วย Leaflet ล้วนๆ (ไม่ต้องใช้ API key)
 * แทน Google Maps เดิมที่ต้องใช้ VITE_GOOGLE_MAPS_API_KEY ซึ่งไม่มีการผูกบัตร
 * จึงใช้บน GitHub Pages ไม่ได้
 *
 * - กระเบื้องแผนที่จาก tile.openstreetmap.org พร้อม Attribution © OpenStreetMap contributors
 * - ห้ามใส่ <meta name="referrer" content="no-referrer"> ใน index.html เด็ดขาด
 *   (เซิร์ฟเวอร์กระเบื้องตรวจ Referer — ถ้าไม่ส่งจะโดน 403)
 * - หมุดใช้ divIcon (HTML) จึงไม่ต้องพึ่งไฟล์รูปไอคอนของ Leaflet
 */

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type {
  EnrichedGasStation,
  LatLngPoint,
  TankRefuelMilestone,
} from '../utils/tripPlanner';

interface OsmMapViewProps {
  origin: LatLngPoint;
  originLabel: string;
  routePoints: LatLngPoint[];
  endLocation: LatLngPoint | null;
  endLabel: string;
  stations: EnrichedGasStation[];
  milestones: TankRefuelMilestone[];
  focusedLocation: LatLngPoint | null;
  selectedStationId: string | null;
  selectedMilestoneIdx: number | null;
  onSelectStation: (id: string) => void;
  onSelectMilestone: (idx: number) => void;
  onCloseSelection: () => void;
}

const STATION_COLORS: Record<EnrichedGasStation['fuelStatus'], string> = {
  recommended_stop: '#d97706',
  within_tank: '#059669',
  after_refuel: '#475569',
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function stationIcon(station: EnrichedGasStation, selected: boolean): L.DivIcon {
  const color = STATION_COLORS[station.fuelStatus];
  const size = selected ? 34 : station.fuelStatus === 'recommended_stop' ? 32 : 28;
  return L.divIcon({
    className: 'osm-station-marker',
    html:
      `<div style="width:${size}px;height:${size}px;border-radius:9999px;` +
      `background:${color};border:2px solid #ffffff;box-shadow:0 1px 4px rgba(0,0,0,0.35);` +
      `display:flex;align-items:center;justify-content:center;font-size:15px;line-height:1;">⛽</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function milestoneIcon(milestone: TankRefuelMilestone): L.DivIcon {
  const bg = milestone.isFirstStop ? '#dc2626' : '#f59e0b';
  return L.divIcon({
    className: 'osm-milestone-marker',
    html:
      `<div style="background:${bg};color:#ffffff;border:1px solid rgba(0,0,0,0.25);` +
      `border-radius:6px;padding:2px 6px;font-size:11px;font-weight:700;font-family:monospace;` +
      `white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.35);">⚠ กม.${milestone.kmFromOrigin}</div>`,
    iconSize: [76, 22],
    iconAnchor: [38, 11],
  });
}

function emojiIcon(emoji: string, background: string): L.DivIcon {
  return L.divIcon({
    className: 'osm-emoji-marker',
    html:
      `<div style="width:32px;height:32px;border-radius:9999px;background:${background};` +
      `border:2px solid #ffffff;box-shadow:0 1px 4px rgba(0,0,0,0.35);display:flex;` +
      `align-items:center;justify-content:center;font-size:16px;line-height:1;">${emoji}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}

export function OsmMapView({
  origin,
  originLabel,
  routePoints,
  endLocation,
  endLabel,
  stations,
  milestones,
  focusedLocation,
  selectedStationId,
  selectedMilestoneIdx,
  onSelectStation,
  onSelectMilestone,
  onCloseSelection,
}: OsmMapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const callbacksRef = useRef({
    onSelectStation,
    onSelectMilestone,
    onCloseSelection,
  });
  callbacksRef.current = { onSelectStation, onSelectMilestone, onCloseSelection };

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      zoomControl: true,
      scrollWheelZoom: true,
    });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors',
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();

    if (routePoints.length >= 2) {
      L.polyline(
        routePoints.map((p) => [p.lat, p.lng] as [number, number]),
        { color: '#1d4ed8', weight: 5, opacity: 0.9 }
      ).addTo(layer);
    }

    L.marker([origin.lat, origin.lng], {
      icon: emojiIcon('🚗', '#1d4ed8'),
      title: originLabel,
      zIndexOffset: 500,
    }).addTo(layer);

    if (endLocation) {
      L.marker([endLocation.lat, endLocation.lng], {
        icon: emojiIcon('🏁', '#0f172a'),
        title: endLabel,
        zIndexOffset: 450,
      }).addTo(layer);
    }

    for (const milestone of milestones) {
      const marker = L.marker([milestone.coords.lat, milestone.coords.lng], {
        icon: milestoneIcon(milestone),
        title: milestone.label,
        zIndexOffset: 400,
      });
      marker.on('click', () => callbacksRef.current.onSelectMilestone(milestone.index));
      marker.addTo(layer);
      if (selectedMilestoneIdx === milestone.index) {
        marker
          .bindPopup(
            `<div style="font-family:sans-serif">` +
              `<p style="margin:0 0 4px;font-size:12px;font-weight:700;color:#b91c1c;">จุดคาดว่าน้ำมันใกล้หมดระยะปลอดภัย</p>` +
              `<p style="margin:0;font-size:12px;">${escapeHtml(milestone.label)}</p>` +
              `<p style="margin:4px 0 0;font-size:11px;color:#64748b;">แนะนำให้เลือกปั๊มสีส้มบนเส้นทางก่อนถึงจุดนี้</p>` +
              `</div>`,
            { maxWidth: 250 }
          )
          .openPopup();
      }
    }

    for (const station of stations) {
      const selected = selectedStationId === station.id;
      const marker = L.marker([station.location.lat, station.location.lng], {
        icon: stationIcon(station, selected),
        title: station.name,
        zIndexOffset: selected ? 300 : 200,
      });
      marker.on('click', () => callbacksRef.current.onSelectStation(station.id));
      marker.addTo(layer);
      if (selected) {
        const distanceText =
          station.routeKmPosition !== null
            ? `กม.ที่ ${station.routeKmPosition.toLocaleString('th-TH')}`
            : `ห่าง ${station.distanceKmFromOrigin.toLocaleString('th-TH')} กม.`;
        const navLink = station.directionsUri ?? station.googleMapsUri;
        marker
          .bindPopup(
            `<div style="font-family:sans-serif">` +
              `<p style="margin:0 0 2px;font-size:13px;font-weight:700;">${escapeHtml(station.name)}</p>` +
              (station.address
                ? `<p style="margin:0 0 4px;font-size:11px;color:#475569;">${escapeHtml(station.address)}</p>`
                : '') +
              `<p style="margin:0;font-size:12px;">${distanceText} · เหลือ ~${station.estimatedRemainingLitersOnArrival} ล. (${station.estimatedRemainingPercentOnArrival}%)</p>` +
              (navLink
                ? `<p style="margin:6px 0 0;"><a href="${navLink}" target="_blank" rel="noopener noreferrer" style="font-size:12px;font-weight:700;color:#1d4ed8;">เปิดนำทางใน Google Maps ↗</a></p>`
                : '') +
              `</div>`,
            { maxWidth: 290 }
          )
          .openPopup();
      }
    }

    const boundsPoints: Array<[number, number]> = [[origin.lat, origin.lng]];
    if (routePoints.length >= 2) {
      const step = Math.max(1, Math.floor(routePoints.length / 60));
      for (let i = 0; i < routePoints.length; i += step) {
        boundsPoints.push([routePoints[i].lat, routePoints[i].lng]);
      }
      const last = routePoints[routePoints.length - 1];
      boundsPoints.push([last.lat, last.lng]);
    } else {
      stations.slice(0, 8).forEach((s) => boundsPoints.push([s.location.lat, s.location.lng]));
    }
    if (endLocation) boundsPoints.push([endLocation.lat, endLocation.lng]);
    map.fitBounds(L.latLngBounds(boundsPoints), { padding: [44, 44] });
  }, [
    origin,
    originLabel,
    routePoints,
    endLocation,
    endLabel,
    stations,
    milestones,
    selectedStationId,
    selectedMilestoneIdx,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusedLocation) return;
    map.panTo([focusedLocation.lat, focusedLocation.lng]);
  }, [focusedLocation]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const onPopupClose = () => callbacksRef.current.onCloseSelection();
    map.on('popupclose', onPopupClose);
    return () => {
      map.off('popupclose', onPopupClose);
    };
  }, []);

  return <div ref={containerRef} className="w-full h-full" data-testid="osm-map" />;
}
