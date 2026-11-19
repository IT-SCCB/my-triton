import { useEffect, useState } from 'react';
import {
  Check,
  CheckCircle2,
  CloudDownload,
  CloudUpload,
  Copy,
  RefreshCw,
  X,
} from 'lucide-react';
import {
  DEFAULT_GAS_WEBHOOK_URL,
  formatLastSyncBadgeTime,
  type GasSyncStatus,
} from '../services/googleSheetsSync';

interface GoogleSheetsSyncModalProps {
  isOpen: boolean;
  gasUrl: string;
  autoSyncEnabled: boolean;
  syncStatus: GasSyncStatus;
  lastSyncAt: string | null;
  lastDirection: 'pull' | 'push' | null;
  onClose: () => void;
  onChangeGasUrl: (url: string) => void;
  onToggleAutoSync: (enabled: boolean) => void;
  onManualSync: (
    direction: 'push' | 'pull',
    urlOverride?: string
  ) => Promise<{ ok: boolean; message: string }>;
}

const GAS_SCRIPT_CODE = `// Google Apps Script สำหรับ "อ้วนพี" (Mitsubishi Triton 2012)
// เลขไมล์เริ่มทำเซอร์วิส 14 ก.ย. 2569 = 233,589 กม.
const SHEET_STATE = 'AppState';
const INITIAL_DEFAULT_ODO = 233589;

function doGet(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_STATE);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_STATE);
    sheet.getRange('A1').setValue(JSON.stringify({ initialServiceOdo: INITIAL_DEFAULT_ODO }));
  }
  const raw = sheet.getRange('A1').getValue();
  return ContentService.createTextOutput(raw || '{}')
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(SHEET_STATE) || ss.insertSheet(SHEET_STATE);
    const payload = e.postData.contents;
    sheet.getRange('A1').setValue(payload);
    sheet.getRange('B1').setValue(new Date().toLocaleString('th-TH'));
    return ContentService.createTextOutput(JSON.stringify({ status: 'success', baseOdo: INITIAL_DEFAULT_ODO }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}`;

export function GoogleSheetsSyncModal({
  isOpen,
  gasUrl,
  autoSyncEnabled,
  syncStatus,
  lastSyncAt,
  lastDirection,
  onClose,
  onChangeGasUrl,
  onToggleAutoSync,
  onManualSync,
}: GoogleSheetsSyncModalProps) {
  const [urlInput, setUrlInput] = useState(gasUrl);
  const [status, setStatus] = useState<{ type: 'info' | 'success' | 'error'; text: string } | null>(
    null
  );
  const [copied, setCopied] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    setUrlInput(gasUrl);
  }, [gasUrl]);

  useEffect(() => {
    if (!isOpen) return;
    setStatus(null);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  function handleUrlChange(val: string) {
    setUrlInput(val);
    onChangeGasUrl(val);
  }

  async function handleCopyCode() {
    try {
      await navigator.clipboard.writeText(GAS_SCRIPT_CODE);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setStatus({ type: 'error', text: 'ไม่สามารถคัดลอกอัตโนมัติได้ กรุณาคัดลอกจากกล่องโค้ด' });
    }
  }

  async function handleSync(direction: 'push' | 'pull') {
    const trimmed = urlInput.trim();
    if (!trimmed) {
      setStatus({
        type: 'error',
        text: 'กรุณาวาง URL ของ Google Apps Script Web App ก่อน',
      });
      return;
    }

    onChangeGasUrl(trimmed);
    setSyncing(true);
    setStatus({
      type: 'info',
      text:
        direction === 'push'
          ? 'กำลังส่งข้อมูลขึ้น Google Sheets...'
          : 'กำลังดึงข้อมูลจาก Google Sheets...',
    });

    const result = await onManualSync(direction, trimmed);
    setStatus({
      type: result.ok ? 'success' : 'error',
      text: result.message,
    });
    setSyncing(false);
  }

  const formattedLastSync = lastSyncAt ? formatLastSyncBadgeTime(lastSyncAt) : '';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-[1px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="sync-modal-title"
        className="w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h2 id="sync-modal-title" className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
              ซิงค์ข้อมูล 2 ทางกับ Google Sheets
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {formattedLastSync
                ? `ซิงค์ล่าสุดเมื่อ ${formattedLastSync}${
                    lastDirection === 'pull'
                      ? ' (ดึงจาก Sheets)'
                      : lastDirection === 'push'
                        ? ' (ส่งขึ้น Sheets)'
                        : ''
                  }`
                : syncStatus === 'syncing'
                  ? 'กำลังซิงค์ข้อมูล...'
                  : 'ยังไม่มีประวัติการซิงค์'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดหน้าต่างซิงค์"
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="gas-webhook-url" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Google Apps Script Web App URL
              </label>
              {urlInput.trim() && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>
                    {DEFAULT_GAS_WEBHOOK_URL && urlInput.trim() === DEFAULT_GAS_WEBHOOK_URL
                      ? 'ใช้ค่าตั้งต้นจากโค้ด + บันทึกในเครื่องแล้ว'
                      : 'บันทึก URL ในเบราว์เซอร์แล้ว'}
                  </span>
                </span>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <input
                id="gas-webhook-url"
                type="url"
                value={urlInput}
                onChange={(e) => handleUrlChange(e.target.value)}
                placeholder="https://script.google.com/macros/s/.../exec"
                className="flex-1 min-h-[42px] px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono text-xs text-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <button
                type="button"
                disabled={syncing}
                onClick={() => handleSync('push')}
                data-testid="manual-push-sheets-btn"
                className="inline-flex items-center justify-center gap-1.5 min-h-[42px] px-3.5 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 disabled:opacity-60 text-white text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer"
              >
                <CloudUpload className="w-4 h-4" aria-hidden="true" />
                <span>ส่งข้อมูลขึ้น Cloud</span>
              </button>
              <button
                type="button"
                disabled={syncing}
                onClick={() => handleSync('pull')}
                data-testid="manual-pull-sheets-btn"
                className="inline-flex items-center justify-center gap-1.5 min-h-[42px] px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white dark:text-slate-900 disabled:opacity-60 text-white text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer"
              >
                <CloudDownload className="w-4 h-4" aria-hidden="true" />
                <span>ดึงข้อมูลลงเครื่อง</span>
              </button>
            </div>
          </div>

          <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 flex items-start justify-between gap-3">
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900 dark:text-slate-100">
                <RefreshCw className="w-3.5 h-3.5 text-blue-700 dark:text-blue-400 shrink-0" aria-hidden="true" />
                <span>ซิงค์อัตโนมัติ (Auto Sync 2 ทาง)</span>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                ดึงข้อมูลล่าสุดจาก Google Sheets ทันทีเมื่อเปิดหน้าเว็บ และส่งข้อมูลขึ้นเบื้องหลังอัตโนมัติทุกครั้งที่บันทึกเติมน้ำมัน อัปเดตเลขไมล์ หรือแก้ไขรายการซ่อมบำรุง
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0 pt-0.5">
              <input
                type="checkbox"
                checked={autoSyncEnabled}
                onChange={(e) => onToggleAutoSync(e.target.checked)}
                data-testid="toggle-gas-auto-sync"
                className="sr-only peer"
                aria-label="เปิดใช้งานซิงค์อัตโนมัติกับ Google Sheets"
              />
              <div className="w-9 h-5 bg-slate-300 dark:bg-slate-700 peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-blue-600 rounded-full peer peer-checked:bg-blue-700 dark:peer-checked:bg-blue-600 after:content-[''] after:absolute after:top-[4px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4" />
            </label>
          </div>

          {status && (
            <p
              role={status.type === 'error' ? 'alert' : 'status'}
              className={`p-3 rounded-lg text-xs font-medium border ${
                status.type === 'error'
                  ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-800'
                  : status.type === 'success'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800'
                    : 'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950/60 dark:text-blue-200 dark:border-blue-800'
              }`}
            >
              {status.text}
            </p>
          )}

          <div className="border-t border-slate-200 dark:border-slate-800 pt-4 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                โค้ด Google Apps Script (เลขไมล์ตั้งต้น 233,589 กม.)
              </span>
              <button
                type="button"
                onClick={handleCopyCode}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-medium cursor-pointer"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
                    <span>คัดลอกแล้ว</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>คัดลอกโค้ด</span>
                  </>
                )}
              </button>
            </div>

            <pre className="bg-slate-900 dark:bg-slate-950 dark:border dark:border-slate-800 text-slate-200 p-4 rounded-lg text-[11px] font-mono overflow-x-auto leading-relaxed">
              {GAS_SCRIPT_CODE}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
