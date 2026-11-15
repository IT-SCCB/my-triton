import { useEffect, useState } from 'react';
import { Check, CloudDownload, CloudUpload, Copy, X } from 'lucide-react';
import type { VehicleMaintenanceState } from '../types/maintenance';
import { buildGasSyncPayload } from '../utils/maintenance';

interface GoogleSheetsSyncModalProps {
  isOpen: boolean;
  state: VehicleMaintenanceState;
  onClose: () => void;
  onImportCloudState: (cloudPayload: unknown) => Promise<void>;
}

const GAS_URL_STORAGE = 'ouanpee_gas_webhook_url';

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
  state,
  onClose,
  onImportCloudState,
}: GoogleSheetsSyncModalProps) {
  const [gasUrl, setGasUrl] = useState(() => {
    try {
      return window.localStorage.getItem(GAS_URL_STORAGE) ?? '';
    } catch {
      return '';
    }
  });
  const [status, setStatus] = useState<{ type: 'info' | 'success' | 'error'; text: string } | null>(
    null
  );
  const [copied, setCopied] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setStatus(null);
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  function handleUrlChange(val: string) {
    setGasUrl(val);
    try {
      window.localStorage.setItem(GAS_URL_STORAGE, val.trim());
    } catch {
      // Ignore storage error
    }
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
    const trimmed = gasUrl.trim();
    if (!trimmed) {
      setStatus({
        type: 'error',
        text: 'กรุณาวาง URL ของ Google Apps Script Web App ก่อน',
      });
      return;
    }

    setSyncing(true);
    setStatus({
      type: 'info',
      text:
        direction === 'push'
          ? 'กำลังส่งข้อมูลขึ้น Google Sheets...'
          : 'กำลังดึงข้อมูลจาก Google Sheets...',
    });

    try {
      if (direction === 'push') {
        const res = await fetch(trimmed, {
          method: 'POST',
          body: JSON.stringify(buildGasSyncPayload(state)),
        });
        const result = (await res.json()) as { status?: string; message?: string };
        if (result.status !== 'success') {
          throw new Error(result.message ?? 'ไม่สามารถบันทึกข้อมูลขึ้น Sheets ได้');
        }
        setStatus({ type: 'success', text: 'ส่งข้อมูลขึ้น Google Sheets สำเร็จเรียบร้อยแล้ว' });
      } else {
        const res = await fetch(trimmed);
        const cloudData = (await res.json()) as unknown;
        await onImportCloudState(cloudData);
        setStatus({ type: 'success', text: 'ดึงข้อมูลจาก Google Sheets ลงแดชบอร์ดสำเร็จแล้ว' });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'เชื่อมต่อไม่สำเร็จ';
      setStatus({ type: 'error', text: `เชื่อมต่อไม่สำเร็จ: ${msg}` });
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-[1px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="sync-modal-title"
        className="w-full max-w-2xl bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 id="sync-modal-title" className="font-display text-lg font-semibold text-slate-900">
            ซิงค์ข้อมูล 2 ทางกับ Google Sheets
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดหน้าต่างซิงค์"
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          <div className="space-y-1.5">
            <label htmlFor="gas-webhook-url" className="block text-xs font-medium text-slate-700">
              Google Apps Script Web App URL
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                id="gas-webhook-url"
                type="url"
                value={gasUrl}
                onChange={(e) => handleUrlChange(e.target.value)}
                placeholder="https://script.google.com/macros/s/.../exec"
                className="flex-1 min-h-[42px] px-3 py-2 rounded-lg border border-slate-300 font-mono text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <button
                type="button"
                disabled={syncing}
                onClick={() => handleSync('push')}
                className="inline-flex items-center justify-center gap-1.5 min-h-[42px] px-3.5 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer"
              >
                <CloudUpload className="w-4 h-4" aria-hidden="true" />
                <span>ส่งข้อมูลขึ้น Cloud</span>
              </button>
              <button
                type="button"
                disabled={syncing}
                onClick={() => handleSync('pull')}
                className="inline-flex items-center justify-center gap-1.5 min-h-[42px] px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer"
              >
                <CloudDownload className="w-4 h-4" aria-hidden="true" />
                <span>ดึงข้อมูลลงเครื่อง</span>
              </button>
            </div>
          </div>

          {status && (
            <p
              role={status.type === 'error' ? 'alert' : 'status'}
              className={`p-3 rounded-lg text-xs font-medium border ${
                status.type === 'error'
                  ? 'bg-red-50 text-red-700 border-red-200'
                  : status.type === 'success'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-blue-50 text-blue-800 border-blue-200'
              }`}
            >
              {status.text}
            </p>
          )}

          <div className="border-t border-slate-200 pt-4 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-800">
                โค้ด Google Apps Script (เลขไมล์ตั้งต้น 233,589 กม.)
              </span>
              <button
                type="button"
                onClick={handleCopyCode}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-medium cursor-pointer"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
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

            <pre className="bg-slate-900 text-slate-200 p-4 rounded-lg text-[11px] font-mono overflow-x-auto leading-relaxed">
              {GAS_SCRIPT_CODE}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
