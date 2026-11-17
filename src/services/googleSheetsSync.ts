import type { VehicleMaintenanceState } from '../types/maintenance';
import { buildGasSyncPayload } from '../utils/maintenance';
import { hasImportableSheetsPayload } from '../utils/sheetsMerge';

export { hasImportableSheetsPayload };

export const GAS_URL_STORAGE_KEY = 'ouanpee_gas_webhook_url';
export const GAS_AUTO_SYNC_STORAGE_KEY = 'ouanpee_gas_auto_sync_enabled';
export const GAS_LAST_SYNC_STORAGE_KEY = 'ouanpee_gas_last_sync_at';

/**
 * ค่าตั้งต้นของ Google Apps Script Web App URL (/exec)
 * คุณสามารถวางลิงก์ https://script.google.com/macros/s/.../exec ไว้ที่นี่โดยตรง
 * หรือกำหนดผ่านตัวแปรสภาพแวดล้อม VITE_GAS_WEBHOOK_URL
 */
export const DEFAULT_GAS_WEBHOOK_URL = (
  typeof import.meta !== 'undefined' && import.meta.env?.VITE_GAS_WEBHOOK_URL
    ? String(import.meta.env.VITE_GAS_WEBHOOK_URL)
    : ''
).trim();

export type GasSyncStatus = 'unconfigured' | 'idle' | 'syncing' | 'synced' | 'error';

export function loadSavedGasWebhookUrl(): string {
  try {
    const stored = window.localStorage.getItem(GAS_URL_STORAGE_KEY);
    if (stored && stored.trim()) {
      return stored.trim();
    }
  } catch {
    // Ignore storage errors
  }
  return DEFAULT_GAS_WEBHOOK_URL;
}

export function saveGasWebhookUrl(url: string): string {
  const cleaned = url.trim();
  try {
    if (cleaned) {
      window.localStorage.setItem(GAS_URL_STORAGE_KEY, cleaned);
    } else {
      window.localStorage.removeItem(GAS_URL_STORAGE_KEY);
    }
  } catch {
    // Ignore storage errors
  }
  return cleaned;
}

export function loadGasAutoSyncEnabled(): boolean {
  try {
    const raw = window.localStorage.getItem(GAS_AUTO_SYNC_STORAGE_KEY);
    if (raw === 'false') return false;
    if (raw === 'true') return true;
  } catch {
    // Ignore storage errors
  }
  return true;
}

export function saveGasAutoSyncEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(GAS_AUTO_SYNC_STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {
    // Ignore storage errors
  }
}

export function loadGasLastSyncAt(): string | null {
  try {
    const raw = window.localStorage.getItem(GAS_LAST_SYNC_STORAGE_KEY);
    return raw && raw.trim() ? raw.trim() : null;
  } catch {
    return null;
  }
}

export function saveGasLastSyncAt(isoTimestamp: string): void {
  try {
    window.localStorage.setItem(GAS_LAST_SYNC_STORAGE_KEY, isoTimestamp);
  } catch {
    // Ignore storage errors
  }
}

export function isValidGasWebhookUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export async function pullFromGoogleSheets(url: string): Promise<{
  hasData: boolean;
  data: unknown;
}> {
  const trimmed = url.trim();
  if (!isValidGasWebhookUrl(trimmed)) {
    throw new Error('URL ของ Google Apps Script Web App ไม่ถูกต้อง');
  }

  const separator = trimmed.includes('?') ? '&' : '?';
  const fetchUrl = `${trimmed}${separator}_ts=${Date.now()}`;
  const res = await fetch(fetchUrl, { method: 'GET' });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const cloudData = (await res.json()) as unknown;
  return {
    hasData: hasImportableSheetsPayload(cloudData),
    data: cloudData,
  };
}

export async function pushToGoogleSheets(
  url: string,
  state: VehicleMaintenanceState
): Promise<void> {
  const trimmed = url.trim();
  if (!isValidGasWebhookUrl(trimmed)) {
    throw new Error('URL ของ Google Apps Script Web App ไม่ถูกต้อง');
  }

  // Do not set Content-Type: application/json so Google Apps Script accepts CORS simple POST
  const res = await fetch(trimmed, {
    method: 'POST',
    body: JSON.stringify(buildGasSyncPayload(state)),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const result = (await res.json()) as { status?: string; message?: string };
  if (result.status !== 'success') {
    throw new Error(result.message ?? 'ไม่สามารถบันทึกข้อมูลขึ้น Sheets ได้');
  }
}

export function formatLastSyncBadgeTime(isoTimestamp: string): string {
  try {
    const date = new Date(isoTimestamp);
    if (Number.isNaN(date.getTime())) return '';

    const nowKey = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

    const syncKey = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);

    const timePart = new Intl.DateTimeFormat('th-TH', {
      timeZone: 'Asia/Bangkok',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);

    if (nowKey === syncKey) {
      return `${timePart} น.`;
    }

    const datePart = new Intl.DateTimeFormat('th-TH', {
      timeZone: 'Asia/Bangkok',
      day: 'numeric',
      month: 'short',
    }).format(date);
    return `${datePart} ${timePart} น.`;
  } catch {
    return '';
  }
}
