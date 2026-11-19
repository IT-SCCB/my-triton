import type {
  LegalDocumentAlertItem,
  LegalDocumentAlertStatus,
  LegalDocuments,
  LegalDocumentType,
} from '../types/maintenance.ts';
import { getTodayIsoDate } from './maintenance.ts';

export const LEGAL_DOC_TYPE_LABELS: Record<LegalDocumentType, string> = {
  compulsory_insurance: 'พ.ร.บ. (ภาคบังคับ)',
  voluntary_insurance: 'ประกันภัยรถยนต์ (ภาคสมัครใจ)',
  registration_tax: 'ทะเบียน / ภาษีรถยนต์ประจำปี',
  other: 'เอกสารรถอื่นๆ',
};

export const LEGAL_DOC_DEFAULT_TITLES: Record<LegalDocumentType, string> = {
  compulsory_insurance: 'พ.ร.บ. คุ้มครองผู้ประสบภัยจากรถ',
  voluntary_insurance: 'ประกันภัยรถยนต์ภาคสมัครใจ',
  registration_tax: 'ป้ายภาษีและทะเบียนรถยนต์ประจำปี',
  other: 'เอกสารสำคัญประจำรถ',
};

export const LEGAL_DOC_ALERT_DAYS_OPTIONS = [7, 15, 30, 60, 90] as const;

/** Safe ceiling below Firestore 450 KB string limit and 1 MiB document size cap */
export const MAX_LEGAL_DOC_IMAGE_DATA_URL_LEN = 420_000;

function parseIsoUtcMs(isoDate: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const ms = Date.UTC(year, month - 1, day);
  const check = new Date(ms);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }
  return ms;
}

export function computeDaysUntilExpiry(
  expiryDate: string,
  todayIso: string = getTodayIsoDate()
): number | null {
  const expMs = parseIsoUtcMs(expiryDate);
  const todayMs = parseIsoUtcMs(todayIso);
  if (expMs === null || todayMs === null) return null;
  return Math.round((expMs - todayMs) / 86_400_000);
}

export function evaluateLegalDocumentStatus(
  daysRemaining: number,
  alertDaysBefore: number
): LegalDocumentAlertStatus {
  if (daysRemaining < 0) return 'expired';
  const safeLeadDays = Math.max(0, Math.round(alertDaysBefore));
  if (daysRemaining <= safeLeadDays) return 'expiring_soon';
  return 'valid';
}

export function evaluateLegalDocumentItem(
  doc: LegalDocuments,
  todayIso: string = getTodayIsoDate()
): (LegalDocumentAlertItem & { status: LegalDocumentAlertStatus }) | null {
  const daysRemaining = computeDaysUntilExpiry(doc.expiryDate, todayIso);
  if (daysRemaining === null) return null;
  const status = evaluateLegalDocumentStatus(daysRemaining, doc.alertDaysBefore);
  return {
    id: `legal:${doc.id}:${doc.expiryDate}:${status}`,
    documentId: doc.id,
    docType: doc.docType,
    title: doc.title,
    provider: doc.provider,
    policyNumber: doc.policyNumber,
    expiryDate: doc.expiryDate,
    alertDaysBefore: doc.alertDaysBefore,
    daysRemaining,
    status,
  };
}

export function evaluateLegalDocumentAlerts(
  docs: LegalDocuments[] = [],
  todayIso: string = getTodayIsoDate()
): LegalDocumentAlertItem[] {
  const alerts: LegalDocumentAlertItem[] = [];
  for (const doc of docs) {
    if (!doc.alertEnabled) continue;
    const item = evaluateLegalDocumentItem(doc, todayIso);
    if (!item || item.status === 'valid') continue;
    alerts.push(item);
  }
  return alerts.sort((a, b) => a.daysRemaining - b.daysRemaining);
}

export function sortLegalDocuments(docs: LegalDocuments[] = []): LegalDocuments[] {
  return [...docs].sort((a, b) => {
    if (a.expiryDate !== b.expiryDate) {
      return a.expiryDate.localeCompare(b.expiryDate);
    }
    return a.title.localeCompare(b.title);
  });
}

export function formatLegalExpiryCountdown(daysRemaining: number): string {
  if (daysRemaining < 0) {
    return `หมดอายุแล้ว ${Math.abs(daysRemaining).toLocaleString('th-TH')} วัน`;
  }
  if (daysRemaining === 0) {
    return 'หมดอายุวันนี้';
  }
  return `เหลืออีก ${daysRemaining.toLocaleString('th-TH')} วัน`;
}

export interface LegalDocumentFormValidationInput {
  title: string;
  issueDate: string;
  expiryDate: string;
  alertDaysBefore: string;
  cost: string;
}

export function validateLegalDocumentInput(
  input: LegalDocumentFormValidationInput
): { valid: boolean; error?: string } {
  if (!input.title.trim()) {
    return { valid: false, error: 'กรุณาระบุชื่อเอกสารหรือรายการคุ้มครอง' };
  }
  const issueMs = parseIsoUtcMs(input.issueDate);
  if (issueMs === null) {
    return { valid: false, error: 'กรุณาระบุวันที่เริ่มต้นให้ถูกต้อง (YYYY-MM-DD)' };
  }
  const expiryMs = parseIsoUtcMs(input.expiryDate);
  if (expiryMs === null) {
    return { valid: false, error: 'กรุณาระบุวันหมดอายุให้ถูกต้อง (YYYY-MM-DD)' };
  }
  if (expiryMs < issueMs) {
    return { valid: false, error: 'วันหมดอายุต้องไม่น้อยกว่าวันที่เริ่มต้น' };
  }
  const leadDays = Number(input.alertDaysBefore);
  if (!Number.isFinite(leadDays) || leadDays < 0 || leadDays > 365) {
    return { valid: false, error: 'จำนวนวันแจ้งเตือนล่วงหน้าต้องอยู่ระหว่าง 0 ถึง 365 วัน' };
  }
  const cost = input.cost.trim() === '' ? 0 : Number(input.cost.replace(/,/g, ''));
  if (!Number.isFinite(cost) || cost < 0) {
    return { valid: false, error: 'ค่าเบี้ยประกันหรือค่าต่อภาษีต้องไม่ติดลบ' };
  }
  return { valid: true };
}

export function estimateDataUrlBytes(dataUrl: string): number {
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1) return dataUrl.length;
  const base64 = dataUrl.slice(commaIdx + 1);
  return Math.floor((base64.length * 3) / 4);
}

function renderScaledJpeg(
  source: HTMLImageElement | HTMLVideoElement,
  srcWidth: number,
  srcHeight: number,
  maxDimension: number,
  quality: number
): string {
  const scale = Math.min(1, maxDimension / Math.max(srcWidth, srcHeight, 1));
  const targetW = Math.max(1, Math.round(srcWidth * scale));
  const targetH = Math.max(1, Math.round(srcHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('ไม่สามารถเตรียมพื้นที่ย่อขนาดรูปภาพได้');
  }
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, targetW, targetH);
  ctx.drawImage(source, 0, 0, targetW, targetH);
  return canvas.toDataURL('image/jpeg', quality);
}

function compressSourceWithBudget(
  source: HTMLImageElement | HTMLVideoElement,
  width: number,
  height: number
): string {
  const attempts: Array<{ maxDim: number; quality: number }> = [
    { maxDim: 1280, quality: 0.78 },
    { maxDim: 1024, quality: 0.72 },
    { maxDim: 860, quality: 0.64 },
    { maxDim: 680, quality: 0.56 },
  ];

  let lastResult = '';
  for (const attempt of attempts) {
    lastResult = renderScaledJpeg(source, width, height, attempt.maxDim, attempt.quality);
    if (lastResult.length <= MAX_LEGAL_DOC_IMAGE_DATA_URL_LEN) {
      return lastResult;
    }
  }
  if (lastResult.length > MAX_LEGAL_DOC_IMAGE_DATA_URL_LEN) {
    throw new Error('ขนาดรูปภาพใหญ่เกินขีดจำกัดสำหรับบันทึกบนคลาวด์ กรุณาเลือกรูปที่เล็กลง');
  }
  return lastResult;
}

export async function compressImageFileToDataUrl(file: File): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('ไม่สามารถอ่านไฟล์รูปภาพที่เลือกได้'));
      el.src = objectUrl;
    });
    return compressSourceWithBudget(img, img.naturalWidth || img.width, img.naturalHeight || img.height);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function captureVideoFrameToDataUrl(video: HTMLVideoElement): string {
  const width = video.videoWidth || 1280;
  const height = video.videoHeight || 720;
  return compressSourceWithBudget(video, width, height);
}
