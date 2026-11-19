import 'dotenv/config';
import express from 'express';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GoogleGenAI,
  Modality,
  Type,
  type Content,
  type GenerateContentResponse,
  type LiveServerMessage,
} from '@google/genai';
import { WebSocket, WebSocketServer } from 'ws';
import { SEED_VEHICLE_STATE } from './src/data/seedData.ts';
import type {
  FuelLogEntry,
  LegalDocuments,
  OcrExtractedFuelData,
  OdometerLogEntry,
  ServiceRecord,
  VehicleMaintenanceState,
} from './src/types/maintenance.ts';
import {
  mergeImportedPatch,
  type ImportedVehiclePatch,
} from './src/utils/driveParser.ts';
import { mergeSheetsPayloadIntoState } from './src/utils/sheetsMerge.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'maintenance.json');

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const GMP_SOLUTION_ID = 'gmp_mcp_codeassist_v1_aistudio';

function getMapsApiKey(): string {
  const key = (
    process.env.GOOGLE_MAPS_API_KEY ??
    process.env.VITE_GOOGLE_MAPS_API_KEY ??
    ''
  ).trim();
  if (!key || key === 'MY_GOOGLE_MAPS_API_KEY') return '';
  return key;
}

interface RawPlaceResult {
  id?: string;
  displayName?: { text?: string; languageCode?: string };
  formattedAddress?: string;
  shortFormattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  googleMapsUri?: string;
  googleMapsLinks?: { directionsUri?: string; placeUri?: string };
  currentOpeningHours?: { openNow?: boolean };
  rating?: number;
  userRatingCount?: number;
}

interface RawRoutingSummary {
  legs?: Array<{
    duration?: string;
    distanceMeters?: number;
  }>;
  directionsUri?: string;
}

function parseDurationSeconds(raw?: string): number | null {
  if (!raw) return null;
  const match = raw.match(/^(\d+(?:\.\d+)?)s$/);
  return match ? Math.round(Number(match[1])) : null;
}

function isQuotaExceededError(status: number, payload: unknown): boolean {
  if (status === 429) return true;
  if (payload && typeof payload === 'object') {
    const err = (payload as { error?: { status?: string; message?: string } }).error;
    if (
      err?.status === 'RESOURCE_EXHAUSTED' ||
      err?.status === 'OVER_QUERY_LIMIT' ||
      (typeof err?.message === 'string' &&
        (err.message.includes('RESOURCE_EXHAUSTED') ||
          err.message.toLowerCase().includes('quota')))
    ) {
      return true;
    }
  }
  return false;
}

function mapPlaceToStation(
  place: RawPlaceResult,
  routingSummary?: RawRoutingSummary
) {
  const lat = place.location?.latitude;
  const lng = place.location?.longitude;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;

  const firstLeg = routingSummary?.legs?.[0];
  return {
    id: place.id ?? `${lat.toFixed(5)},${lng.toFixed(5)}`,
    name: place.displayName?.text ?? 'สถานีบริการน้ำมัน',
    address: place.shortFormattedAddress ?? place.formattedAddress ?? '',
    location: { lat, lng },
    rating: typeof place.rating === 'number' ? place.rating : null,
    userRatingCount:
      typeof place.userRatingCount === 'number' ? place.userRatingCount : null,
    openNow:
      typeof place.currentOpeningHours?.openNow === 'boolean'
        ? place.currentOpeningHours.openNow
        : null,
    googleMapsUri:
      place.googleMapsUri ?? place.googleMapsLinks?.placeUri ?? null,
    directionsUri:
      routingSummary?.directionsUri ??
      place.googleMapsLinks?.directionsUri ??
      place.googleMapsUri ??
      null,
    routingDistanceMeters:
      typeof firstLeg?.distanceMeters === 'number'
        ? firstLeg.distanceMeters
        : null,
    routingDurationSeconds: parseDurationSeconds(firstLeg?.duration),
  };
}

async function readState(): Promise<VehicleMaintenanceState> {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as VehicleMaintenanceState;
    if (
      parsed &&
      parsed.vehicle &&
      Array.isArray(parsed.services) &&
      Array.isArray(parsed.fuelLogs)
    ) {
      return {
        ...parsed,
        legalDocuments: Array.isArray(parsed.legalDocuments) ? parsed.legalDocuments : [],
      };
    }
  } catch {
    // Initialize from deterministic seed on first run or schema upgrade
  }
  await writeState(SEED_VEHICLE_STATE);
  return structuredClone(SEED_VEHICLE_STATE);
}

async function writeState(state: VehicleMaintenanceState): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(state, null, 2), 'utf-8');
}

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT ?? 3000);

  app.use(express.json({ limit: '12mb' }));

  app.get('/api/maintenance', async (_req, res) => {
    try {
      const state = await readState();
      res.json(state);
    } catch (error) {
      console.error('Failed to load maintenance state:', error);
      res.status(500).json({ error: 'ไม่สามารถโหลดข้อมูลการบำรุงรักษาได้' });
    }
  });

  app.post('/api/odometer', async (req, res) => {
    try {
      const { odometer, date, source, note } = req.body as {
        odometer?: number;
        date?: string;
        source?: string;
        note?: string;
      };
      if (
        typeof odometer !== 'number' ||
        !Number.isFinite(odometer) ||
        !Number.isInteger(odometer) ||
        odometer <= 0
      ) {
        res.status(400).json({ error: 'เลขไมล์ไม่ถูกต้อง' });
        return;
      }

      const state = await readState();
      const entryDate =
        date && /^\d{4}-\d{2}-\d{2}$/.test(date)
          ? date
          : new Date().toISOString().slice(0, 10);
      const entrySource =
        (source ?? 'อัปเดตผ่านหน้าเว็บ').trim() || 'อัปเดตผ่านหน้าเว็บ';

      const newLog: OdometerLogEntry = {
        id: `odo-${Date.now()}`,
        date: entryDate,
        odometer,
        source: entrySource,
        note: note?.trim() || undefined,
      };

      state.vehicle.currentOdometer = odometer;
      state.vehicle.lastUpdatedDate = entryDate;
      state.vehicle.lastUpdatedSource = entrySource;
      state.odometerLogs = [newLog, ...state.odometerLogs];

      await writeState(state);
      res.json(state);
    } catch (error) {
      console.error('Failed to update odometer:', error);
      res.status(500).json({ error: 'ไม่สามารถบันทึกเลขไมล์ได้' });
    }
  });

  app.patch('/api/fuel-gauge', async (req, res) => {
    try {
      const { fuelPercent } = req.body as { fuelPercent?: number };
      if (
        typeof fuelPercent !== 'number' ||
        !Number.isFinite(fuelPercent) ||
        fuelPercent < 0 ||
        fuelPercent > 100
      ) {
        res.status(400).json({ error: 'ระดับน้ำมันต้องอยู่ระหว่าง 0 ถึง 100%' });
        return;
      }
      const state = await readState();
      state.vehicle.fuelPercent = Math.round(fuelPercent);
      await writeState(state);
      res.json(state);
    } catch (error) {
      console.error('Failed to update fuel gauge:', error);
      res.status(500).json({ error: 'ไม่สามารถปรับระดับเกจน้ำมันได้' });
    }
  });

  app.post('/api/fuel-logs', async (req, res) => {
    try {
      const payload = req.body as Partial<FuelLogEntry> & { newFuelPercent?: number };
      if (
        !payload.date ||
        typeof payload.odometer !== 'number' ||
        typeof payload.amount !== 'number' ||
        typeof payload.liters !== 'number' ||
        typeof payload.pricePerLiter !== 'number'
      ) {
        res.status(400).json({ error: 'ข้อมูลการเติมน้ำมันไม่ครบถ้วน' });
        return;
      }

      const state = await readState();
      const sortedExisting = [...state.fuelLogs].sort((a, b) =>
        a.date !== b.date ? a.date.localeCompare(b.date) : a.odometer - b.odometer
      );
      const lastFuelOdo =
        sortedExisting.length > 0
          ? sortedExisting[sortedExisting.length - 1].odometer
          : state.vehicle.currentOdometer;
      const distance =
        typeof payload.distance === 'number'
          ? Math.max(0, payload.distance)
          : Math.max(0, payload.odometer - lastFuelOdo);
      const kml =
        distance > 0 && payload.liters > 0
          ? Number((distance / payload.liters).toFixed(2))
          : 0;

      const entry: FuelLogEntry = {
        id: `fuel-${Date.now()}`,
        date: payload.date,
        odometer: payload.odometer,
        distance,
        amount: Number(payload.amount),
        liters: Number(Number(payload.liters).toFixed(3)),
        pricePerLiter: Number(Number(payload.pricePerLiter).toFixed(2)),
        kml,
        note: (payload.note ?? 'เติมน้ำมันดีเซล').trim(),
      };

      state.fuelLogs = [...state.fuelLogs, entry];
      if (entry.odometer > state.vehicle.currentOdometer) {
        state.vehicle.currentOdometer = entry.odometer;
        state.vehicle.lastUpdatedDate = entry.date;
        state.vehicle.lastUpdatedSource = `เติมน้ำมัน: ${entry.note}`;
        state.odometerLogs = [
          {
            id: `odo-${Date.now()}`,
            date: entry.date,
            odometer: entry.odometer,
            source: `เติมน้ำมัน (${entry.note})`,
            note: `เติม ${entry.amount} บาท (${entry.liters} ลิตร)`,
          },
          ...state.odometerLogs,
        ];
      }
      if (
        typeof payload.newFuelPercent === 'number' &&
        Number.isFinite(payload.newFuelPercent)
      ) {
        state.vehicle.fuelPercent = Math.max(
          0,
          Math.min(100, Math.round(payload.newFuelPercent))
        );
      }

      await writeState(state);
      res.json(state);
    } catch (error) {
      console.error('Failed to add fuel log:', error);
      res.status(500).json({ error: 'ไม่สามารถบันทึกการเติมน้ำมันได้' });
    }
  });

  app.patch('/api/fuel-logs/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const payload = req.body as Partial<FuelLogEntry>;
      const state = await readState();
      const idx = state.fuelLogs.findIndex((l) => l.id === id);
      if (idx === -1) {
        res.status(404).json({ error: 'ไม่พบรายการเติมน้ำมัน' });
        return;
      }

      const existing = state.fuelLogs[idx];
      const nextDate =
        payload.date && /^\d{4}-\d{2}-\d{2}$/.test(payload.date)
          ? payload.date
          : existing.date;
      const nextOdo =
        typeof payload.odometer === 'number' && Number.isFinite(payload.odometer) && payload.odometer > 0
          ? Math.round(payload.odometer)
          : existing.odometer;
      const nextDistance =
        typeof payload.distance === 'number' && Number.isFinite(payload.distance) && payload.distance >= 0
          ? Number(payload.distance)
          : existing.distance;
      const nextAmount =
        typeof payload.amount === 'number' && Number.isFinite(payload.amount) && payload.amount > 0
          ? Number(payload.amount)
          : existing.amount;
      const nextLiters =
        typeof payload.liters === 'number' && Number.isFinite(payload.liters) && payload.liters > 0
          ? Number(Number(payload.liters).toFixed(3))
          : existing.liters;
      const nextPrice =
        typeof payload.pricePerLiter === 'number' && Number.isFinite(payload.pricePerLiter) && payload.pricePerLiter >= 0
          ? Number(Number(payload.pricePerLiter).toFixed(2))
          : existing.pricePerLiter;
      const nextKml =
        typeof payload.kml === 'number' && Number.isFinite(payload.kml) && payload.kml >= 0
          ? Number(Number(payload.kml).toFixed(2))
          : existing.kml;
      const nextNote =
        typeof payload.note === 'string' && payload.note.trim()
          ? payload.note.trim()
          : existing.note;

      state.fuelLogs[idx] = {
        ...existing,
        date: nextDate,
        odometer: nextOdo,
        distance: nextDistance,
        amount: nextAmount,
        liters: nextLiters,
        pricePerLiter: nextPrice,
        kml: nextKml,
        note: nextNote,
      };

      await writeState(state);
      res.json(state);
    } catch (error) {
      console.error('Failed to update fuel log:', error);
      res.status(500).json({ error: 'ไม่สามารถแก้ไขรายการเติมน้ำมันได้' });
    }
  });

  app.delete('/api/fuel-logs/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const state = await readState();
      const next = state.fuelLogs.filter((l) => l.id !== id);
      if (next.length === state.fuelLogs.length) {
        res.status(404).json({ error: 'ไม่พบรายการเติมน้ำมัน' });
        return;
      }
      state.fuelLogs = next;
      await writeState(state);
      res.json(state);
    } catch (error) {
      console.error('Failed to delete fuel log:', error);
      res.status(500).json({ error: 'ไม่สามารถลบรายการเติมน้ำมันได้' });
    }
  });

  app.post('/api/services', async (req, res) => {
    try {
      const payload = req.body as Partial<ServiceRecord>;
      if (!payload.title || !payload.date || typeof payload.odometer !== 'number') {
        res.status(400).json({ error: 'ข้อมูลรายการเซอร์วิสไม่ครบถ้วน' });
        return;
      }

      const partsCost = Math.max(0, Number(payload.partsCost ?? 0));
      const laborCost = Math.max(0, Number(payload.laborCost ?? 0));
      const newRecord: ServiceRecord = {
        id: `srv-${Date.now()}`,
        date: payload.date,
        title: payload.title.trim(),
        category: payload.category ?? 'other',
        odometer: payload.odometer,
        partsCost,
        laborCost,
        totalCost: partsCost + laborCost,
        intervalKm:
          payload.intervalKm !== undefined && payload.intervalKm !== null
            ? Number(payload.intervalKm)
            : null,
        intervalMonths: payload.intervalMonths ?? null,
        scheduleKey: payload.scheduleKey,
        notes: (payload.notes ?? '').trim(),
        revisionNote: payload.revisionNote?.trim() || undefined,
      };

      const state = await readState();
      state.services = [newRecord, ...state.services];

      if (newRecord.odometer > state.vehicle.currentOdometer) {
        state.vehicle.currentOdometer = newRecord.odometer;
        state.vehicle.lastUpdatedDate = newRecord.date;
        state.vehicle.lastUpdatedSource = `บันทึกเซอร์วิส: ${newRecord.title}`;
        state.odometerLogs = [
          {
            id: `odo-${Date.now()}`,
            date: newRecord.date,
            odometer: newRecord.odometer,
            source: 'บันทึกเซอร์วิสใหม่',
            note: newRecord.title,
          },
          ...state.odometerLogs,
        ];
      }

      await writeState(state);
      res.json(state);
    } catch (error) {
      console.error('Failed to create service record:', error);
      res.status(500).json({ error: 'ไม่สามารถบันทึกรายการเซอร์วิสได้' });
    }
  });

  app.patch('/api/services/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const payload = req.body as Partial<ServiceRecord>;
      const state = await readState();
      const index = state.services.findIndex((s) => s.id === id);
      if (index === -1) {
        res.status(404).json({ error: 'ไม่พบรายการเซอร์วิสที่ต้องการแก้ไข' });
        return;
      }

      const existing = state.services[index];
      const partsCost =
        payload.partsCost !== undefined
          ? Math.max(0, Number(payload.partsCost))
          : existing.partsCost;
      const laborCost =
        payload.laborCost !== undefined
          ? Math.max(0, Number(payload.laborCost))
          : existing.laborCost;

      const updated: ServiceRecord = {
        ...existing,
        ...payload,
        id: existing.id,
        partsCost,
        laborCost,
        totalCost: partsCost + laborCost,
      };

      state.services[index] = updated;
      await writeState(state);
      res.json(state);
    } catch (error) {
      console.error('Failed to update service record:', error);
      res.status(500).json({ error: 'ไม่สามารถแก้ไขรายการเซอร์วิสได้' });
    }
  });

  app.post('/api/services/:id/reset-cycle', async (req, res) => {
    try {
      const { id } = req.params;
      const state = await readState();
      const existing = state.services.find((s) => s.id === id);
      if (!existing || !existing.intervalKm) {
        res.status(404).json({ error: 'ไม่พบรายการซ่อมบำรุงที่มีรอบระยะ' });
        return;
      }
      const todayIso = new Date().toISOString().slice(0, 10);
      const updatedRecord: ServiceRecord = {
        ...existing,
        date: todayIso,
        odometer: state.vehicle.currentOdometer,
        revisionNote: `รีเซ็ตรอบใหม่ที่เลขไมล์ ${state.vehicle.currentOdometer.toLocaleString('th-TH')} กม.`,
      };
      state.services = state.services.map((s) => (s.id === id ? updatedRecord : s));
      await writeState(state);
      res.json(state);
    } catch (error) {
      console.error('Failed to reset cycle:', error);
      res.status(500).json({ error: 'ไม่สามารถรีเซ็ตรอบซ่อมบำรุงได้' });
    }
  });

  app.delete('/api/services/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const state = await readState();
      const nextServices = state.services.filter((s) => s.id !== id);
      if (nextServices.length === state.services.length) {
        res.status(404).json({ error: 'ไม่พบรายการเซอร์วิส' });
        return;
      }
      state.services = nextServices;
      await writeState(state);
      res.json(state);
    } catch (error) {
      console.error('Failed to delete service record:', error);
      res.status(500).json({ error: 'ไม่สามารถลบรายการเซอร์วิสได้' });
    }
  });

  app.patch('/api/schedules/:key', async (req, res) => {
    try {
      const { key } = req.params;
      const { intervalKm } = req.body as { intervalKm?: number };
      if (typeof intervalKm !== 'number' || !Number.isFinite(intervalKm) || intervalKm <= 0) {
        res.status(400).json({ error: 'ระยะรอบถัดไปไม่ถูกต้อง' });
        return;
      }
      const state = await readState();
      state.scheduleIntervals = {
        ...state.scheduleIntervals,
        [key]: Math.round(intervalKm),
      };
      await writeState(state);
      res.json(state);
    } catch (error) {
      console.error('Failed to update schedule interval:', error);
      res.status(500).json({ error: 'ไม่สามารถอัปเดตระยะรอบถัดไปได้' });
    }
  });

  app.post('/api/legal-documents', async (req, res) => {
    try {
      const payload = req.body as Partial<LegalDocuments>;
      if (!payload.title?.trim() || !payload.expiryDate || !payload.issueDate) {
        res.status(400).json({ error: 'กรุณาระบุชื่อเอกสาร วันที่เริ่มต้น และวันหมดอายุให้ครบถ้วน' });
        return;
      }

      const newDoc: LegalDocuments = {
        id: payload.id?.trim() || `doc-${Date.now()}`,
        docType: payload.docType ?? 'other',
        title: payload.title.trim().slice(0, 200),
        provider: (payload.provider ?? '').trim().slice(0, 200),
        policyNumber: (payload.policyNumber ?? '').trim().slice(0, 120),
        issueDate: payload.issueDate,
        expiryDate: payload.expiryDate,
        alertDaysBefore: Math.max(0, Math.min(365, Math.round(Number(payload.alertDaysBefore ?? 30)))),
        alertEnabled: payload.alertEnabled ?? true,
        cost: Math.max(0, Number(payload.cost ?? 0)),
        emergencyPhone: payload.emergencyPhone?.trim() || undefined,
        imageDataUrl: payload.imageDataUrl?.trim() || undefined,
        notes: payload.notes?.trim() || undefined,
        updatedAt: new Date().toISOString(),
      };

      const state = await readState();
      const existingDocs = Array.isArray(state.legalDocuments) ? state.legalDocuments : [];
      state.legalDocuments = [newDoc, ...existingDocs].sort((a, b) =>
        a.expiryDate.localeCompare(b.expiryDate)
      );
      await writeState(state);
      res.json(state);
    } catch (error) {
      console.error('Failed to create legal document:', error);
      res.status(500).json({ error: 'ไม่สามารถบันทึกข้อมูล พ.ร.บ. / ประกัน / ทะเบียนรถได้' });
    }
  });

  app.patch('/api/legal-documents/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const payload = req.body as Partial<LegalDocuments>;
      const state = await readState();
      const existingDocs = Array.isArray(state.legalDocuments) ? state.legalDocuments : [];
      const index = existingDocs.findIndex((d) => d.id === id);
      if (index === -1) {
        res.status(404).json({ error: 'ไม่พบเอกสารที่ต้องการแก้ไข' });
        return;
      }

      const existing = existingDocs[index];
      const updated: LegalDocuments = {
        ...existing,
        docType: payload.docType ?? existing.docType,
        title: payload.title !== undefined ? payload.title.trim().slice(0, 200) : existing.title,
        provider: payload.provider !== undefined ? payload.provider.trim().slice(0, 200) : existing.provider,
        policyNumber:
          payload.policyNumber !== undefined
            ? payload.policyNumber.trim().slice(0, 120)
            : existing.policyNumber,
        issueDate: payload.issueDate ?? existing.issueDate,
        expiryDate: payload.expiryDate ?? existing.expiryDate,
        alertDaysBefore:
          payload.alertDaysBefore !== undefined
            ? Math.max(0, Math.min(365, Math.round(Number(payload.alertDaysBefore))))
            : existing.alertDaysBefore,
        alertEnabled:
          payload.alertEnabled !== undefined ? Boolean(payload.alertEnabled) : existing.alertEnabled,
        cost: payload.cost !== undefined ? Math.max(0, Number(payload.cost)) : existing.cost,
        emergencyPhone:
          payload.emergencyPhone !== undefined
            ? payload.emergencyPhone.trim() || undefined
            : existing.emergencyPhone,
        imageDataUrl:
          payload.imageDataUrl !== undefined
            ? payload.imageDataUrl.trim() || undefined
            : existing.imageDataUrl,
        notes: payload.notes !== undefined ? payload.notes.trim() || undefined : existing.notes,
        updatedAt: new Date().toISOString(),
      };

      existingDocs[index] = updated;
      state.legalDocuments = [...existingDocs].sort((a, b) =>
        a.expiryDate.localeCompare(b.expiryDate)
      );
      await writeState(state);
      res.json(state);
    } catch (error) {
      console.error('Failed to update legal document:', error);
      res.status(500).json({ error: 'ไม่สามารถแก้ไขข้อมูลเอกสารได้' });
    }
  });

  app.delete('/api/legal-documents/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const state = await readState();
      const existingDocs = Array.isArray(state.legalDocuments) ? state.legalDocuments : [];
      const nextDocs = existingDocs.filter((d) => d.id !== id);
      if (nextDocs.length === existingDocs.length) {
        res.status(404).json({ error: 'ไม่พบเอกสารที่ต้องการลบ' });
        return;
      }
      state.legalDocuments = nextDocs;
      await writeState(state);
      res.json(state);
    } catch (error) {
      console.error('Failed to delete legal document:', error);
      res.status(500).json({ error: 'ไม่สามารถลบเอกสารได้' });
    }
  });

  app.post('/api/sync-import', async (req, res) => {
    try {
      const current = await readState();
      const merged = mergeSheetsPayloadIntoState(current, req.body);
      await writeState(merged.state);
      res.json(merged.state);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'ไม่สามารถนำเข้าข้อมูลจาก Google Sheets ได้';
      const isBadPayload = message.includes('ไม่พบโครงสร้างข้อมูล');
      console.error('Failed to import cloud sync state:', error);
      res.status(isBadPayload ? 400 : 500).json({ error: message });
    }
  });

  app.post('/api/ocr', async (req, res) => {
    try {
      const { base64Data, mimeType } = req.body as {
        base64Data?: string;
        mimeType?: string;
      };
      if (!base64Data || !mimeType) {
        res.status(400).json({ error: 'กรุณาแนบรูปภาพใบเสร็จหรือหน้าปัดเรือนไมล์' });
        return;
      }

      const ai = getGeminiClient();
      if (!ai) {
        res.status(503).json({
          error:
            'ยังไม่ได้ตั้งค่า GEMINI_API_KEY ใน Settings > Secrets ของโปรเจกต์ กรุณาตั้งค่าคีย์ก่อนใช้งานสแกน AI OCR',
        });
        return;
      }

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType,
                data: base64Data,
              },
            },
            {
              text: 'อ่านข้อมูลจากภาพใบเสร็จเติมน้ำมันหรือหน้าปัดเรือนไมล์รถยนต์นี้ สกัดค่าเลขไมล์ (odometer), ยอดเงินรวมบาท (amount), ปริมาณลิตร (liters), ราคาต่อลิตร (pricePerLiter), และชื่อปั๊มน้ำมัน/ชนิดเชื้อเพลิง (stationOrFuel) ถ้าไม่พบข้อมูลช่องใดให้คืนค่า null',
            },
          ],
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              odometer: { type: Type.INTEGER, nullable: true },
              amount: { type: Type.NUMBER, nullable: true },
              liters: { type: Type.NUMBER, nullable: true },
              pricePerLiter: { type: Type.NUMBER, nullable: true },
              stationOrFuel: { type: Type.STRING, nullable: true },
            },
          },
        },
      });

      const rawText = (response.text ?? '{}').trim();
      const extracted = JSON.parse(rawText) as OcrExtractedFuelData;
      res.json(extracted);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการสแกนภาพ';
      console.error('Gemini OCR error:', error);
      res.status(500).json({ error: `สแกน AI OCR ไม่สำเร็จ: ${msg}` });
    }
  });

  app.post('/api/drive-parse', async (req, res) => {
    try {
      const { fileName, mimeType, kind, textContent, base64Data } = req.body as {
        fileName?: string;
        mimeType?: string;
        kind?: 'text' | 'binary';
        textContent?: string;
        base64Data?: string;
      };

      if (!fileName || (!textContent && !base64Data)) {
        res.status(400).json({ error: 'ไม่พบเนื้อหาไฟล์สำหรับวิเคราะห์ข้อมูล' });
        return;
      }

      const ai = getGeminiClient();
      if (!ai) {
        res.status(503).json({
          error:
            'ยังไม่ได้ตั้งค่า GEMINI_API_KEY ใน Settings > Secrets ของโปรเจกต์ กรุณาตั้งค่าคีย์ก่อนให้ AI แปลงข้อมูลจากไฟล์นี้ (ไฟล์ JSON มาตรฐานสามารถนำเข้าได้ทันทีโดยไม่ต้องใช้ AI)',
        });
        return;
      }

      const instruction = [
        `คุณคือผู้ช่วยอ่านและแปลงข้อมูลสมุดบันทึกการใช้รถ "อ้วนพี" (Mitsubishi Triton 2012 2.5 DI-D) จากไฟล์ชื่อ "${fileName}".`,
        'วิเคราะห์เนื้อหาและสกัดข้อมูลที่ต้องการอัปเดตลงในระบบให้ครบถ้วน:',
        '- วันที่ (date / updatedDate): แปลงเป็นรูปแบบ ISO YYYY-MM-DD (หากเป็นปี พ.ศ. เช่น 2569 ให้แปลงเป็น ค.ศ. 2026).',
        '- เลขไมล์ล่าสุด (updatedOdometer): จำนวนเต็ม (กิโลเมตร) หากมีระบุเลขไมล์ล่าสุดในเอกสาร.',
        '- ระดับน้ำมันคงเหลือ (updatedFuelPercent): จำนวนเต็ม 0-100 หากมีระบุเป็นเปอร์เซ็นต์.',
        '- รายการเติมน้ำมันใหม่ (newFuelLogs): รายการที่มีข้อมูลการเติมน้ำมัน (date, odometer, distance, amount, liters, pricePerLiter, kml, note). ถ้าไม่มี distance หรือ kml ให้ใส่ 0.',
        '- รายการซ่อมบำรุง/เซอร์วิสใหม่ (newServices): รายการซ่อม เปลี่ยนอะไหล่ หรือตรวจเช็ก (date, title, category ต้องเป็นหนึ่งใน engine_belt | fluids | filters | brakes_tires | ac_electrical | other, odometer, partsCost, laborCost, intervalKm หรือ null, notes).',
        '- summary: สรุปสั้นๆ ภาษาไทยว่าพบข้อมูลอะไรบ้างในไฟล์นี้.',
      ].join('\n');

      const parts =
        kind === 'binary' && base64Data
          ? [
              {
                inlineData: {
                  mimeType: mimeType || 'image/jpeg',
                  data: base64Data,
                },
              },
              { text: instruction },
            ]
          : [
              {
                text: `${instruction}\n\nเนื้อหาไฟล์ (${mimeType || 'text/plain'}):\n${(textContent ?? '').slice(0, 120000)}`,
              },
            ];

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: { parts },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: { type: Type.STRING },
              updatedOdometer: { type: Type.INTEGER, nullable: true },
              updatedFuelPercent: { type: Type.INTEGER, nullable: true },
              updatedDate: { type: Type.STRING, nullable: true },
              newFuelLogs: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    date: { type: Type.STRING },
                    odometer: { type: Type.INTEGER },
                    distance: { type: Type.NUMBER },
                    amount: { type: Type.NUMBER },
                    liters: { type: Type.NUMBER },
                    pricePerLiter: { type: Type.NUMBER },
                    kml: { type: Type.NUMBER },
                    note: { type: Type.STRING },
                  },
                  required: ['date', 'odometer', 'amount', 'liters', 'pricePerLiter', 'note'],
                },
              },
              newServices: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    date: { type: Type.STRING },
                    title: { type: Type.STRING },
                    category: {
                      type: Type.STRING,
                      enum: [
                        'engine_belt',
                        'fluids',
                        'filters',
                        'brakes_tires',
                        'ac_electrical',
                        'other',
                      ],
                    },
                    odometer: { type: Type.INTEGER },
                    partsCost: { type: Type.NUMBER },
                    laborCost: { type: Type.NUMBER },
                    intervalKm: { type: Type.INTEGER, nullable: true },
                    notes: { type: Type.STRING },
                  },
                  required: ['date', 'title', 'category', 'odometer', 'partsCost', 'laborCost'],
                },
              },
            },
            required: ['summary', 'newFuelLogs', 'newServices'],
          },
        },
      });

      const rawText = (response.text ?? '{}').trim();
      const parsed = JSON.parse(rawText) as ImportedVehiclePatch;
      const patch: ImportedVehiclePatch = {
        summary: parsed.summary || `วิเคราะห์ข้อมูลจากไฟล์ ${fileName}`,
        updatedOdometer:
          typeof parsed.updatedOdometer === 'number' ? parsed.updatedOdometer : null,
        updatedFuelPercent:
          typeof parsed.updatedFuelPercent === 'number' ? parsed.updatedFuelPercent : null,
        updatedDate: parsed.updatedDate ?? null,
        sourceLabel: `Google Drive (${fileName})`,
        newFuelLogs: Array.isArray(parsed.newFuelLogs) ? parsed.newFuelLogs : [],
        newServices: Array.isArray(parsed.newServices) ? parsed.newServices : [],
      };

      res.json(patch);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการวิเคราะห์ไฟล์';
      console.error('Drive parse error:', error);
      res.status(500).json({ error: `วิเคราะห์ข้อมูลจาก Google Drive ไม่สำเร็จ: ${msg}` });
    }
  });

  app.post('/api/drive-apply', async (req, res) => {
    try {
      const { patch } = req.body as { patch?: ImportedVehiclePatch };
      if (!patch || typeof patch !== 'object') {
        res.status(400).json({ error: 'ไม่พบชุดข้อมูลที่ต้องการอัปเดต' });
        return;
      }

      const current = await readState();
      const next = mergeImportedPatch(current, patch);
      await writeState(next);
      res.json(next);
    } catch (error) {
      console.error('Failed to apply Google Drive patch:', error);
      res.status(500).json({ error: 'ไม่สามารถบันทึกข้อมูลจาก Google Drive ได้' });
    }
  });

  app.post('/api/reset', async (_req, res) => {
    try {
      const fresh = structuredClone(SEED_VEHICLE_STATE);
      await writeState(fresh);
      res.json(fresh);
    } catch (error) {
      console.error('Failed to reset state:', error);
      res.status(500).json({ error: 'ไม่สามารถรีเซ็ตข้อมูลได้' });
    }
  });

  function buildAssistantSystemInstruction(
    vehicleState: VehicleMaintenanceState,
    clientContext?: Record<string, unknown>,
    isVoiceMode = false
  ): string {
    const fuelLogs = [...vehicleState.fuelLogs].sort((a, b) =>
      b.date !== a.date ? b.date.localeCompare(a.date) : b.odometer - a.odometer
    );
    const latestFuel = fuelLogs[0];
    const recentServices = [...vehicleState.services]
      .sort((a, b) => (b.date !== a.date ? b.date.localeCompare(a.date) : b.odometer - a.odometer))
      .slice(0, 6);

    const ctx = clientContext ?? {};
    const avgKml =
      typeof ctx.avgKml === 'number' && ctx.avgKml > 0 ? `${ctx.avgKml.toFixed(2)} กม./ลิตร` : 'ยังไม่มีข้อมูลเฉลี่ย';
    const lastPrice =
      typeof ctx.lastPricePerLiter === 'number' && ctx.lastPricePerLiter > 0
        ? `${ctx.lastPricePerLiter.toFixed(2)} บาท/ลิตร`
        : latestFuel
          ? `${latestFuel.pricePerLiter.toFixed(2)} บาท/ลิตร`
          : '33.55 บาท/ลิตร';

    const schedulesText = Array.isArray(ctx.schedulesSummary)
      ? (ctx.schedulesSummary as Array<{ label?: string; remainingKm?: number; nextDueKm?: number; status?: string }>)
          .map(
            (s) =>
              `- ${s.label ?? 'รายการซ่อม'}: ครบกำหนดที่ ${s.nextDueKm ?? '-'} กม. (คงเหลือ ${s.remainingKm ?? '-'} กม., สถานะ: ${s.status ?? 'nominal'})`
          )
          .join('\n')
      : 'ไม่มีข้อมูลตารางรอบซ่อม';

    const tripPlanText =
      ctx.activeTrip && typeof ctx.activeTrip === 'object'
        ? JSON.stringify(ctx.activeTrip)
        : null;

    const servicesText = recentServices
      .map(
        (s) =>
          `- ${s.date}: ${s.title} ที่ไมล์ ${s.odometer} กม. (${s.totalCost} บาท${s.notes ? `, หมายเหตุ: ${s.notes}` : ''})`
      )
      .join('\n');

    const legalDocsText = (vehicleState.legalDocuments ?? [])
      .map(
        (d) =>
          `- ${d.title} (${d.docType}): หน่วยงาน/บริษัท ${d.provider || '-'}, เลขที่ ${d.policyNumber || '-'}, เริ่ม ${d.issueDate} หมดอายุ ${d.expiryDate}, แจ้งเตือนล่วงหน้า ${d.alertDaysBefore} วัน (${d.alertEnabled ? 'เปิด' : 'ปิด'})`
      )
      .join('\n');

    return [
      `คุณคือ "ผู้ช่วยช่างและวางแผนทริปประจำรถอ้วนพี" สำหรับรถกระบะ ${vehicleState.vehicle.make} ${vehicleState.vehicle.model} ปี ${vehicleState.vehicle.year} (${vehicleState.vehicle.engineSpec})`,
      'หน้าที่ของคุณคือตอบคำถามเรื่องการบำรุงรักษารถยนต์ การวางแผนเดินทาง คำนวณค่าน้ำมัน การเช็กรายการอะไหล่ตามระยะไมล์ เอกสาร พ.ร.บ. ประกันภัย ทะเบียน/ภาษีรถยนต์ และคำแนะนำด้านเทคนิคของเครื่องยนต์ดีเซล 2.5 DI-D อย่างเป็นกันเอง ชัดเจน และแม่นยำเป็นภาษาไทย',
      '',
      'ข้อมูลรถล่าสุดจากสมุดบันทึก:',
      `- เลขไมล์ปัจจุบัน: ${vehicleState.vehicle.currentOdometer.toLocaleString('th-TH')} กม. (อัปเดต ${vehicleState.vehicle.lastUpdatedDate})`,
      `- ความจุถังน้ำมัน: ${vehicleState.vehicle.tankCapacityLiters} ลิตร | น้ำมันคงเหลือในถัง: ${vehicleState.vehicle.fuelPercent}% (~${((vehicleState.vehicle.fuelPercent / 100) * vehicleState.vehicle.tankCapacityLiters).toFixed(1)} ลิตร)`,
      `- อัตราสิ้นเปลืองเฉลี่ยจริง: ${avgKml} | ราคาน้ำมันล่าสุด: ${lastPrice}`,
      '',
      'ตารางซ่อมบำรุงตามระยะที่กำลังติดตาม:',
      schedulesText,
      '',
      'เอกสาร พ.ร.บ. / ประกันภัย / ทะเบียนรถ:',
      legalDocsText || '- ยังไม่มีเอกสารที่บันทึกไว้',
      '',
      'ประวัติเซอร์วิสล่าสุด:',
      servicesText || '- ยังไม่มีประวัติเซอร์วิส',
      tripPlanText ? `\nแผนการเดินทางที่ผู้ใช้กำลังคำนวณอยู่ในขณะนี้:\n${tripPlanText}` : '',
      '',
      isVoiceMode
        ? 'โหมดสนทนาด้วยเสียงสด: ตอบเป็นภาษาไทยที่ฟังเป็นธรรมชาติ กระชับ ชัดเจน ไม่ยาวเยิ่นเย้อ เหมาะสำหรับการสนทนาโต้ตอบระหว่างขับรถหรือเตรียมออกทริป ไม่ต้องอ่านสัญลักษณ์ markdown เช่น ดอกจัน หรือขีดกลาง'
        : 'ตอบเป็นภาษาไทยที่อ่านง่าย เป็นระบบ อ้างอิงตัวเลขจริงของรถคันนี้เสมอเมื่อเกี่ยวข้อง และเตือนล่วงหน้าหากระยะทางที่ถามจะทำให้ถึงรอบซ่อมบำรุง หรือหากมี พ.ร.บ./ประกัน/ภาษีใกล้หมดอายุ',
    ]
      .filter(Boolean)
      .join('\n');
  }

  app.post('/api/chat', async (req, res) => {
    try {
      const { messages, modelMode, vehicleContext } = req.body as {
        messages?: Array<{ role: 'user' | 'model'; text: string }>;
        modelMode?: 'standard' | 'fast';
        vehicleContext?: Record<string, unknown>;
      };

      if (!Array.isArray(messages) || messages.length === 0) {
        res.status(400).json({ error: 'กรุณาพิมพ์ข้อความที่ต้องการสนทนา' });
        return;
      }

      const ai = getGeminiClient();
      if (!ai) {
        res.status(503).json({
          error:
            'ยังไม่ได้ตั้งค่า GEMINI_API_KEY ใน Settings > Secrets ของโปรเจกต์ กรุณาตั้งค่าคีย์ก่อนใช้งานผู้ช่วย AI',
        });
        return;
      }

      const latest = messages[messages.length - 1];
      if (!latest || latest.role !== 'user' || !latest.text?.trim()) {
        res.status(400).json({ error: 'ข้อความล่าสุดของผู้ใช้ไม่ถูกต้อง' });
        return;
      }

      const history: Content[] = messages
        .slice(0, -1)
        .filter((m) => (m.role === 'user' || m.role === 'model') && m.text?.trim())
        .map((m) => ({
          role: m.role,
          parts: [{ text: m.text }],
        }));

      const state = await readState();
      const systemInstruction = buildAssistantSystemInstruction(state, vehicleContext, false);
      const model = modelMode === 'fast' ? 'gemini-3.1-flash-lite' : 'gemini-4-hydrogen';

      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();

      const chat = ai.chats.create({
        model,
        history,
        config: {
          systemInstruction,
        },
      });

      const streamResponse = await chat.sendMessageStream({
        message: latest.text.trim(),
      });

      for await (const chunk of streamResponse) {
        const c = chunk as GenerateContentResponse;
        const delta = c.text ?? '';
        if (delta) {
          res.write(`data: ${JSON.stringify({ text: delta })}\n\n`);
        }
      }

      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการสนทนากับ Gemini AI';
      console.error('Gemini chat error:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: `ผู้ช่วย AI ตอบไม่สำเร็จ: ${msg}` });
      } else {
        res.write(`data: ${JSON.stringify({ error: `ผู้ช่วย AI ตอบไม่สำเร็จ: ${msg}` })}\n\n`);
        res.end();
      }
    }
  });

  app.get('/api/maps/config', (_req, res) => {
    const apiKey = getMapsApiKey();
    res.json({
      configured: Boolean(apiKey),
      apiKey,
    });
  });

  app.post('/api/maps/route-stations', async (req, res) => {
    try {
      const apiKey = getMapsApiKey();
      if (!apiKey) {
        res.status(503).json({
          error: 'ยังไม่ได้ตั้งค่า Google Maps API Key ในระบบเซิร์ฟเวอร์',
        });
        return;
      }

      const { origin, destinationQuery, destinationCoords } = req.body as {
        origin?: { lat?: number; lng?: number };
        destinationQuery?: string;
        destinationCoords?: { lat?: number; lng?: number };
      };

      if (
        !origin ||
        typeof origin.lat !== 'number' ||
        typeof origin.lng !== 'number' ||
        !Number.isFinite(origin.lat) ||
        !Number.isFinite(origin.lng)
      ) {
        res.status(400).json({ error: 'พิกัดตำแหน่งปัจจุบันไม่ถูกต้อง' });
        return;
      }

      const trimmedDest = destinationQuery?.trim() ?? '';
      const hasDestCoords =
        destinationCoords &&
        typeof destinationCoords.lat === 'number' &&
        typeof destinationCoords.lng === 'number' &&
        Number.isFinite(destinationCoords.lat) &&
        Number.isFinite(destinationCoords.lng);

      let computedRoute: {
        distanceMeters: number;
        durationSeconds: number;
        encodedPolyline: string;
        startLocation: { lat: number; lng: number } | null;
        endLocation: { lat: number; lng: number } | null;
      } | null = null;
      let routeNotice: string | null = null;

      if (hasDestCoords || trimmedDest) {
        const destinationPayload = hasDestCoords
          ? {
              location: {
                latLng: {
                  latitude: destinationCoords!.lat,
                  longitude: destinationCoords!.lng,
                },
              },
            }
          : { address: trimmedDest };

        const routesRes = await fetch(
          'https://routes.googleapis.com/directions/v2:computeRoutes',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Goog-Api-Key': apiKey,
              'X-Goog-FieldMask':
                'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline,routes.legs.startLocation,routes.legs.endLocation',
              'X-Goog-Maps-Solution-ID': GMP_SOLUTION_ID,
            },
            body: JSON.stringify({
              origin: {
                location: {
                  latLng: {
                    latitude: origin.lat,
                    longitude: origin.lng,
                  },
                },
              },
              destination: destinationPayload,
              travelMode: 'DRIVE',
              routingPreference: 'TRAFFIC_AWARE',
              languageCode: 'th',
              units: 'METRIC',
            }),
          }
        );

        const routesJson = (await routesRes.json().catch(() => ({}))) as {
          routes?: Array<{
            distanceMeters?: number;
            duration?: string;
            polyline?: { encodedPolyline?: string };
            legs?: Array<{
              startLocation?: { latLng?: { latitude?: number; longitude?: number } };
              endLocation?: { latLng?: { latitude?: number; longitude?: number } };
            }>;
          }>;
          error?: { status?: string; message?: string };
        };

        if (!routesRes.ok) {
          if (isQuotaExceededError(routesRes.status, routesJson)) {
            res.status(429).json({
              error: 'โควตา Google Maps Platform เต็มชั่วคราว',
              quotaExceeded: true,
            });
            return;
          }
          routeNotice =
            routesJson.error?.message ??
            'ไม่สามารถคำนวณเส้นทางไปยังปลายทางนี้ได้ กำลังค้นหาปั๊มใกล้เคียงแทน';
        } else {
          const primary = routesJson.routes?.[0];
          const encodedPolyline = primary?.polyline?.encodedPolyline ?? '';
          if (primary && encodedPolyline) {
            const firstLeg = primary.legs?.[0];
            const lastLeg = primary.legs?.[primary.legs.length - 1];
            const startLatLng = firstLeg?.startLocation?.latLng;
            const endLatLng = lastLeg?.endLocation?.latLng;
            computedRoute = {
              distanceMeters: primary.distanceMeters ?? 0,
              durationSeconds: parseDurationSeconds(primary.duration) ?? 0,
              encodedPolyline,
              startLocation:
                typeof startLatLng?.latitude === 'number' &&
                typeof startLatLng?.longitude === 'number'
                  ? { lat: startLatLng.latitude, lng: startLatLng.longitude }
                  : origin as { lat: number; lng: number },
              endLocation:
                typeof endLatLng?.latitude === 'number' &&
                typeof endLatLng?.longitude === 'number'
                  ? { lat: endLatLng.latitude, lng: endLatLng.longitude }
                  : null,
            };
          } else {
            routeNotice = 'ไม่พบเส้นทางรถยนต์ไปยังปลายทางที่ระบุ กำลังแสดงปั๊มน้ำมันใกล้ตำแหน่งของคุณ';
          }
        }
      }

      const placeFieldMask = [
        'places.id',
        'places.displayName',
        'places.shortFormattedAddress',
        'places.formattedAddress',
        'places.location',
        'places.googleMapsUri',
        'places.googleMapsLinks',
        'places.currentOpeningHours',
        'places.rating',
        'places.userRatingCount',
      ].join(',');

      let alongRouteStations: ReturnType<typeof mapPlaceToStation>[] = [];
      if (computedRoute?.encodedPolyline && computedRoute.distanceMeters >= 500) {
        const searchRouteRes = await fetch(
          'https://places.googleapis.com/v1/places:searchText',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Goog-Api-Key': apiKey,
              'X-Goog-FieldMask': `${placeFieldMask},routingSummaries`,
              'X-Goog-Maps-Solution-ID': GMP_SOLUTION_ID,
            },
            body: JSON.stringify({
              textQuery: 'ปั๊มน้ำมัน',
              includedType: 'gas_station',
              maxResultCount: 16,
              languageCode: 'th',
              regionCode: 'TH',
              searchAlongRouteParameters: {
                polyline: {
                  encodedPolyline: computedRoute.encodedPolyline,
                },
              },
              routingParameters: {
                origin: {
                  latitude: origin.lat,
                  longitude: origin.lng,
                },
                travelMode: 'DRIVE',
              },
            }),
          }
        );

        const searchRouteJson = (await searchRouteRes.json().catch(() => ({}))) as {
          places?: RawPlaceResult[];
          routingSummaries?: RawRoutingSummary[];
          error?: { status?: string; message?: string };
        };

        if (!searchRouteRes.ok && isQuotaExceededError(searchRouteRes.status, searchRouteJson)) {
          res.status(429).json({
            error: 'โควตา Google Maps Platform เต็มชั่วคราว',
            quotaExceeded: true,
          });
          return;
        }

        if (searchRouteRes.ok && Array.isArray(searchRouteJson.places)) {
          const summaries = Array.isArray(searchRouteJson.routingSummaries)
            ? searchRouteJson.routingSummaries
            : [];
          alongRouteStations = searchRouteJson.places
            .map((p, idx) => mapPlaceToStation(p, summaries[idx]))
            .filter(Boolean);
        }
      }

      const nearbyRes = await fetch(
        'https://places.googleapis.com/v1/places:searchNearby',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': placeFieldMask,
            'X-Goog-Maps-Solution-ID': GMP_SOLUTION_ID,
          },
          body: JSON.stringify({
            includedTypes: ['gas_station'],
            maxResultCount: 10,
            rankPreference: 'DISTANCE',
            languageCode: 'th',
            regionCode: 'TH',
            locationRestriction: {
              circle: {
                center: {
                  latitude: origin.lat,
                  longitude: origin.lng,
                },
                radius: 15000,
              },
            },
          }),
        }
      );

      const nearbyJson = (await nearbyRes.json().catch(() => ({}))) as {
        places?: RawPlaceResult[];
        error?: { status?: string; message?: string };
      };

      if (!nearbyRes.ok && isQuotaExceededError(nearbyRes.status, nearbyJson)) {
        res.status(429).json({
          error: 'โควตา Google Maps Platform เต็มชั่วคราว',
          quotaExceeded: true,
        });
        return;
      }

      const nearbyStations =
        nearbyRes.ok && Array.isArray(nearbyJson.places)
          ? nearbyJson.places.map((p) => mapPlaceToStation(p)).filter(Boolean)
          : [];

      res.json({
        origin: { lat: origin.lat, lng: origin.lng },
        route: computedRoute,
        alongRouteStations,
        nearbyStations,
        routeNotice,
      });
    } catch (error) {
      const msg =
        error instanceof Error
          ? error.message
          : 'เกิดข้อผิดพลาดในการค้นหาปั๊มน้ำมันและเส้นทาง';
      console.error('Google Maps proxy error:', error);
      res.status(500).json({ error: msg });
    }
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (isProd) {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const httpServer = http.createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: '/api/live' });

  wss.on('connection', (clientWs: WebSocket) => {
    let liveSession: Awaited<ReturnType<GoogleGenAI['live']['connect']>> | null = null;
    let isClosed = false;
    let connecting = false;

    const safeSend = (payload: Record<string, unknown>) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify(payload));
      }
    };

    const connectLiveSession = async (vehicleContext?: Record<string, unknown>) => {
      if (connecting || liveSession || isClosed) return;
      connecting = true;

      const ai = getGeminiClient();
      if (!ai) {
        safeSend({
          type: 'error',
          error:
            'ยังไม่ได้ตั้งค่า GEMINI_API_KEY ใน Settings > Secrets ของโปรเจกต์ กรุณาตั้งค่าคีย์ก่อนใช้งานโหมดสนทนาเสียงสด',
        });
        clientWs.close();
        return;
      }

      try {
        const state = await readState();
        const systemInstruction = buildAssistantSystemInstruction(state, vehicleContext, true);

        const session = await ai.live.connect({
          model: 'gemini-3.8-live',
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
            },
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            systemInstruction,
          },
          callbacks: {
            onmessage: (message: LiveServerMessage) => {
              const content = message.serverContent;
              if (content?.inputTranscription?.text) {
                safeSend({
                  type: 'inputTranscript',
                  text: content.inputTranscription.text,
                });
              }
              if (content?.outputTranscription?.text) {
                safeSend({
                  type: 'outputTranscript',
                  text: content.outputTranscription.text,
                });
              }
              for (const part of content?.modelTurn?.parts ?? []) {
                if (part.inlineData?.data) {
                  safeSend({
                    type: 'audio',
                    data: part.inlineData.data,
                  });
                }
              }
              if (content?.interrupted) {
                safeSend({ type: 'interrupted' });
              }
              if (content?.turnComplete) {
                safeSend({ type: 'turnComplete' });
              }
            },
            onerror: (err: unknown) => {
              const msg =
                err instanceof Error
                  ? err.message
                  : typeof err === 'object' && err !== null && 'message' in err
                    ? String((err as { message?: unknown }).message)
                    : 'เกิดข้อผิดพลาดในการเชื่อมต่อ Gemini Live';
              console.error('Gemini Live session error:', err);
              safeSend({ type: 'error', error: msg });
            },
            onclose: () => {
              if (!isClosed) {
                safeSend({ type: 'closed' });
              }
            },
          },
        });

        if (isClosed) {
          session.close();
          return;
        }
        liveSession = session;
        safeSend({ type: 'ready' });
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : 'ไม่สามารถเริ่มเซสชันสนทนาด้วยเสียง Gemini Live ได้';
        console.error('Failed to initialize Gemini Live:', err);
        safeSend({ type: 'error', error: msg });
        clientWs.close();
      } finally {
        connecting = false;
      }
    };

    clientWs.on('message', (raw) => {
      try {
        const parsed = JSON.parse(raw.toString()) as {
          type?: string;
          data?: string;
          text?: string;
          vehicleContext?: Record<string, unknown>;
        };

        if (parsed.type === 'setup') {
          void connectLiveSession(parsed.vehicleContext);
          return;
        }

        if (parsed.type === 'audio' && parsed.data && liveSession) {
          liveSession.sendRealtimeInput({
            audio: { data: parsed.data, mimeType: 'audio/pcm;rate=16000' },
          });
          return;
        }

        if (parsed.type === 'text' && parsed.text && liveSession) {
          liveSession.sendRealtimeInput({
            text: parsed.text,
          });
        }
      } catch (err) {
        console.error('Live WS message handling error:', err);
      }
    });

    clientWs.on('close', () => {
      isClosed = true;
      if (liveSession) {
        try {
          liveSession.close();
        } catch {
          // Ignore close errors
        }
        liveSession = null;
      }
    });
  });

  httpServer.listen(port, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${port}`);
  });
}

startServer();
