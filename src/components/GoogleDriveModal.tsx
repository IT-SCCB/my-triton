import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  FileSpreadsheet,
  FileText,
  HardDrive,
  Image as ImageIcon,
  Loader2,
  LogOut,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import type { VehicleMaintenanceState } from '../types/maintenance';
import {
  clearAccessToken,
  getAccessToken,
  googleSignIn,
  initAuth,
  logoutGoogle,
} from '../services/googleAuth';
import {
  listRecentDriveFiles,
  readDriveFileContent,
  type DriveFileItem,
} from '../services/googleDrive';
import {
  parseDriveTextDeterministic,
  type ImportedVehiclePatch,
} from '../utils/driveParser';
import { formatBaht, formatKm, formatThaiDate } from '../utils/maintenance';

interface GoogleDriveModalProps {
  isOpen: boolean;
  currentState: VehicleMaintenanceState;
  onClose: () => void;
  onApplyPatch: (patch: ImportedVehiclePatch) => Promise<void>;
}

function getBangkokDateKey(isoTimestamp: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date(isoTimestamp));
    const y = parts.find((p) => p.type === 'year')?.value ?? '';
    const m = parts.find((p) => p.type === 'month')?.value ?? '';
    const d = parts.find((p) => p.type === 'day')?.value ?? '';
    return `${y}-${m}-${d}`;
  } catch {
    return '';
  }
}

function getBangkokTimeMinutes(isoTimestamp: string): number | null {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Bangkok',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date(isoTimestamp));
    const h = Number(parts.find((p) => p.type === 'hour')?.value);
    const m = Number(parts.find((p) => p.type === 'minute')?.value);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return h * 60 + m;
  } catch {
    return null;
  }
}

function formatBangkokTimestamp(isoTimestamp: string): string {
  try {
    return new Intl.DateTimeFormat('th-TH', {
      timeZone: 'Asia/Bangkok',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(isoTimestamp));
  } catch {
    return isoTimestamp;
  }
}

function describeMimeLabel(mimeType: string): string {
  if (mimeType === 'application/vnd.google-apps.document') return 'Google Docs';
  if (mimeType === 'application/vnd.google-apps.spreadsheet') return 'Google Sheets';
  if (mimeType === 'application/json') return 'JSON';
  if (mimeType === 'text/csv') return 'CSV';
  if (mimeType === 'application/pdf') return 'PDF';
  if (mimeType.startsWith('image/')) return 'รูปภาพ';
  if (mimeType.startsWith('text/')) return 'ข้อความ';
  return 'ไฟล์';
}

function FileTypeIcon({ mimeType }: { mimeType: string }) {
  if (
    mimeType === 'application/vnd.google-apps.spreadsheet' ||
    mimeType === 'text/csv'
  ) {
    return <FileSpreadsheet className="w-4 h-4 text-emerald-700 shrink-0" aria-hidden="true" />;
  }
  if (mimeType.startsWith('image/')) {
    return <ImageIcon className="w-4 h-4 text-blue-700 shrink-0" aria-hidden="true" />;
  }
  return <FileText className="w-4 h-4 text-slate-600 shrink-0" aria-hidden="true" />;
}

export function GoogleDriveModal({
  isOpen,
  currentState,
  onClose,
  onApplyPatch,
}: GoogleDriveModalProps) {
  const [token, setToken] = useState<string | null>(() => getAccessToken());
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  const [files, setFiles] = useState<DriveFileItem[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [parsingFileId, setParsingFileId] = useState<string | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState<{
    file: DriveFileItem;
    patch: ImportedVehiclePatch;
  } | null>(null);
  const [applying, setApplying] = useState(false);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const loadFiles = useCallback(async (accessToken: string, query: string) => {
    setLoadingFiles(true);
    setErrorMsg(null);
    try {
      const list = await listRecentDriveFiles(accessToken, query);
      setFiles(list);
    } catch (err) {
      if (err instanceof Error && err.message === 'AUTH_EXPIRED') {
        clearAccessToken();
        setToken(null);
        setErrorMsg('สิทธิ์การเข้าถึง Google Drive หมดอายุ กรุณาเข้าสู่ระบบใหม่อีกครั้ง');
      } else {
        setErrorMsg(
          err instanceof Error ? err.message : 'ไม่สามารถดึงรายการไฟล์จาก Google Drive ได้'
        );
      }
    } finally {
      setLoadingFiles(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    setPendingConfirmation(null);

    const unsubscribe = initAuth(
      (user, activeToken) => {
        setUserEmail(user.email ?? user.displayName ?? 'บัญชี Google');
        setToken(activeToken);
        void loadFiles(activeToken, '');
      },
      (user) => {
        setUserEmail(user?.email ?? null);
        setToken(getAccessToken());
      }
    );

    const activeToken = getAccessToken();
    if (activeToken) {
      setToken(activeToken);
      void loadFiles(activeToken, '');
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);

    return () => {
      unsubscribe();
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, loadFiles, onClose]);

  if (!isOpen) return null;

  const todayBangkokKey = getBangkokDateKey(new Date().toISOString());

  async function handleGoogleSignIn() {
    setSigningIn(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const { user, accessToken } = await googleSignIn();
      if (!accessToken) {
        throw new Error('ไม่ได้รับ Access Token สำหรับอ่าน Google Drive กรุณาอนุญาตสิทธิ์การเข้าถึงอีกครั้ง');
      }
      setUserEmail(user.email ?? user.displayName ?? 'บัญชี Google');
      setToken(accessToken);
      await loadFiles(accessToken, searchQuery);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'ไม่สามารถเข้าสู่ระบบด้วย Google ได้ กรุณาลองใหม่อีกครั้ง'
      );
    } finally {
      setSigningIn(false);
    }
  }

  async function handleSignOut() {
    await logoutGoogle();
    setToken(null);
    setUserEmail(null);
    setFiles([]);
    setPendingConfirmation(null);
    setSuccessMsg(null);
  }

  function handleSearchSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    void loadFiles(token, searchQuery);
  }

  async function handleSelectFile(file: DriveFileItem) {
    if (!token) return;
    setParsingFileId(file.id);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const payload = await readDriveFileContent(token, file);

      let patch: ImportedVehiclePatch | null = null;
      if (payload.kind === 'text' && payload.textContent) {
        patch = parseDriveTextDeterministic(payload.textContent, file.name);
      }

      if (!patch) {
        const res = await fetch('/api/drive-parse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: file.name,
            mimeType: payload.effectiveMimeType,
            kind: payload.kind,
            textContent: payload.textContent,
            base64Data: payload.base64Data,
          }),
        });
        if (!res.ok) {
          const errData = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(
            errData.error ?? 'ไม่สามารถวิเคราะห์โครงสร้างข้อมูลจากไฟล์นี้ได้'
          );
        }
        patch = (await res.json()) as ImportedVehiclePatch;
      }

      setPendingConfirmation({ file, patch });
    } catch (err) {
      if (err instanceof Error && err.message === 'AUTH_EXPIRED') {
        clearAccessToken();
        setToken(null);
        setErrorMsg('สิทธิ์การเข้าถึง Google Drive หมดอายุ กรุณาเข้าสู่ระบบใหม่อีกครั้ง');
      } else {
        setErrorMsg(
          err instanceof Error ? err.message : 'ไม่สามารถอ่านไฟล์จาก Google Drive ได้'
        );
      }
    } finally {
      setParsingFileId(null);
    }
  }

  async function handleConfirmApply() {
    if (!pendingConfirmation) return;
    setApplying(true);
    setErrorMsg(null);
    try {
      await onApplyPatch(pendingConfirmation.patch);
      setSuccessMsg(
        `อัปเดตข้อมูลจากไฟล์ "${pendingConfirmation.file.name}" เรียบร้อยแล้ว`
      );
      setPendingConfirmation(null);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'ไม่สามารถบันทึกข้อมูลที่นำเข้าได้'
      );
    } finally {
      setApplying(false);
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
        aria-labelledby="drive-modal-title"
        className="w-full max-w-2xl bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <HardDrive className="w-5 h-5 text-blue-700 shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <h2
                id="drive-modal-title"
                className="font-display text-lg font-semibold text-slate-900 truncate"
              >
                ดึงข้อมูลจาก Google Drive
              </h2>
              <p className="text-xs text-slate-500 truncate">
                เลือกไฟล์ที่อัปโหลดล่าสุด (เช่น ช่วงเวลา 15:24 น.) เพื่อตรวจสอบก่อนอัปเดตลงสมุดบันทึก
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดหน้าต่าง Google Drive"
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {errorMsg && (
            <div
              role="alert"
              className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs font-medium text-red-700 flex items-start gap-2"
            >
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div
              role="status"
              className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-700 flex items-center justify-between gap-3"
            >
              <span className="inline-flex items-center gap-1.5">
                <Check className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{successMsg}</span>
              </span>
              <button
                type="button"
                onClick={onClose}
                className="px-2.5 py-1 rounded bg-emerald-700 text-white text-xs font-medium hover:bg-emerald-800 cursor-pointer shrink-0"
              >
                ดูแดชบอร์ด
              </button>
            </div>
          )}

          {!token ? (
            <div className="border border-slate-200 rounded-xl p-6 text-center space-y-4 bg-slate-50/70">
              <div className="space-y-1.5 max-w-md mx-auto">
                <p className="text-sm font-semibold text-slate-900">
                  เชื่อมต่อ Google Drive เพื่อดูไฟล์ล่าสุดของคุณ
                </p>
                <p className="text-xs text-slate-600 leading-relaxed">
                  ระบบขอสิทธิ์อ่านไฟล์เท่านั้น (Read-only) เพื่อค้นหาไฟล์บันทึกข้อมูล ใบเสร็จ หรือเอกสารที่คุณอัปโหลดไว้ และจะให้คุณยืนยันความถูกต้องก่อนเปลี่ยนแปลงข้อมูลทุกครั้ง
                </p>
              </div>

              <div className="flex justify-center">
                <button
                  type="button"
                  disabled={signingIn}
                  onClick={handleGoogleSignIn}
                  data-testid="google-signin-button"
                  className="gsi-material-button"
                >
                  <div className="gsi-material-button-state" />
                  <div className="gsi-material-button-content-wrapper">
                    <div className="gsi-material-button-icon">
                      <svg
                        version="1.1"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 48 48"
                        style={{ display: 'block' }}
                        aria-hidden="true"
                      >
                        <path
                          fill="#EA4335"
                          d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                        />
                        <path
                          fill="#4285F4"
                          d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                        />
                        <path
                          fill="#34A853"
                          d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                        />
                        <path fill="none" d="M0 0h48v48H0z" />
                      </svg>
                    </div>
                    <span className="gsi-material-button-contents">
                      {signingIn ? 'Signing in...' : 'Sign in with Google'}
                    </span>
                    <span style={{ display: 'none' }}>Sign in with Google</span>
                  </div>
                </button>
              </div>
            </div>
          ) : pendingConfirmation ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setPendingConfirmation(null)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>เลือกไฟล์อื่น</span>
                </button>
                <span className="text-xs text-slate-500 font-mono tabular-nums">
                  {formatBangkokTimestamp(pendingConfirmation.file.modifiedTime)}
                </span>
              </div>

              <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50/70">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-slate-500">
                      ตัวอย่างการเปลี่ยนแปลงจากไฟล์: {pendingConfirmation.file.name}
                    </p>
                    <p className="text-sm font-semibold text-slate-900 mt-1">
                      {pendingConfirmation.patch.summary}
                    </p>
                  </div>
                </div>

                {pendingConfirmation.patch.replaceFullState ? (
                  <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900">
                    ไฟล์นี้เป็นข้อมูลฉบับเต็ม ระบบจะแทนที่ประวัติเดิมด้วยข้อมูลจากไฟล์นี้ทั้งหมด (เลขไมล์{' '}
                    <strong className="font-mono tabular-nums">
                      {formatKm(
                        pendingConfirmation.patch.replaceFullState.vehicle.currentOdometer
                      )}
                    </strong>{' '}
                    กม.)
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                    {typeof pendingConfirmation.patch.updatedOdometer === 'number' && (
                      <div className="p-3 rounded-lg bg-white border border-slate-200">
                        <p className="text-slate-500">เลขไมล์ที่จะอัปเดต</p>
                        <p className="font-mono text-sm font-semibold text-slate-900 tabular-nums mt-0.5">
                          {formatKm(currentState.vehicle.currentOdometer)} →{' '}
                          <span className="text-blue-700">
                            {formatKm(
                              Math.max(
                                currentState.vehicle.currentOdometer,
                                pendingConfirmation.patch.updatedOdometer
                              )
                            )}
                          </span>{' '}
                          กม.
                        </p>
                      </div>
                    )}

                    {typeof pendingConfirmation.patch.updatedFuelPercent === 'number' && (
                      <div className="p-3 rounded-lg bg-white border border-slate-200">
                        <p className="text-slate-500">ระดับน้ำมันในถัง</p>
                        <p className="font-mono text-sm font-semibold text-slate-900 tabular-nums mt-0.5">
                          {currentState.vehicle.fuelPercent}% →{' '}
                          <span className="text-blue-700">
                            {pendingConfirmation.patch.updatedFuelPercent}%
                          </span>
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {pendingConfirmation.patch.newFuelLogs.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-slate-700">
                      รายการเติมน้ำมันที่พบ ({pendingConfirmation.patch.newFuelLogs.length}{' '}
                      รายการ)
                    </p>
                    <ul className="divide-y divide-slate-200 border border-slate-200 rounded-lg bg-white">
                      {pendingConfirmation.patch.newFuelLogs.map((log, idx) => (
                        <li
                          key={`${log.date}-${log.odometer}-${idx}`}
                          className="px-3 py-2 flex items-center justify-between gap-2 text-xs"
                        >
                          <div className="min-w-0">
                            <p className="font-medium text-slate-900 truncate">{log.note}</p>
                            <p className="text-slate-500 font-mono tabular-nums">
                              {formatThaiDate(log.date, 'short')} · ไมล์{' '}
                              {formatKm(log.odometer)} กม.
                            </p>
                          </div>
                          <div className="text-right font-mono tabular-nums shrink-0">
                            <p className="font-semibold text-slate-900">
                              {formatBaht(log.amount)} บ.
                            </p>
                            <p className="text-slate-500">{log.liters.toFixed(2)} ล.</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {pendingConfirmation.patch.newServices.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-slate-700">
                      รายการซ่อมบำรุงที่พบ ({pendingConfirmation.patch.newServices.length}{' '}
                      รายการ)
                    </p>
                    <ul className="divide-y divide-slate-200 border border-slate-200 rounded-lg bg-white">
                      {pendingConfirmation.patch.newServices.map((srv, idx) => (
                        <li
                          key={`${srv.date}-${srv.title}-${idx}`}
                          className="px-3 py-2 flex items-center justify-between gap-2 text-xs"
                        >
                          <div className="min-w-0">
                            <p className="font-medium text-slate-900 truncate">{srv.title}</p>
                            <p className="text-slate-500 font-mono tabular-nums">
                              {formatThaiDate(srv.date, 'short')} · ไมล์{' '}
                              {formatKm(srv.odometer)} กม.
                            </p>
                          </div>
                          <p className="font-mono font-semibold text-slate-900 tabular-nums shrink-0">
                            {formatBaht((srv.partsCost || 0) + (srv.laborCost || 0))} บ.
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  disabled={applying}
                  onClick={() => setPendingConfirmation(null)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  disabled={applying}
                  onClick={handleConfirmApply}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-xs font-medium cursor-pointer"
                >
                  {applying ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Check className="w-3.5 h-3.5" aria-hidden="true" />
                  )}
                  <span>{applying ? 'กำลังอัปเดต...' : 'ยืนยันอัปเดตข้อมูล'}</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                <span>
                  เชื่อมต่อแล้ว:{' '}
                  <strong className="font-medium text-slate-900">
                    {userEmail ?? 'บัญชี Google'}
                  </strong>
                </span>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-900 font-medium cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>เปลี่ยนบัญชี</span>
                </button>
              </div>

              <form onSubmit={handleSearchSubmit} className="flex gap-2">
                <div className="relative flex-1">
                  <Search
                    className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                    aria-hidden="true"
                  />
                  <label htmlFor="drive-search-input" className="sr-only">
                    ค้นหาชื่อไฟล์ใน Google Drive
                  </label>
                  <input
                    id="drive-search-input"
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="ค้นหาชื่อไฟล์ใน Google Drive..."
                    className="w-full min-h-[38px] pl-9 pr-3 py-1.5 rounded-lg border border-slate-300 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loadingFiles}
                  className="px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-xs font-medium cursor-pointer"
                >
                  ค้นหา
                </button>
                <button
                  type="button"
                  disabled={loadingFiles}
                  onClick={() => token && loadFiles(token, searchQuery)}
                  aria-label="รีเฟรชรายการไฟล์"
                  className="px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-medium inline-flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${loadingFiles ? 'animate-spin' : ''}`}
                    aria-hidden="true"
                  />
                  <span className="hidden sm:inline">รีเฟรช</span>
                </button>
              </form>

              {loadingFiles ? (
                <div className="py-10 text-center text-xs text-slate-500 flex flex-col items-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin text-blue-700" aria-hidden="true" />
                  <span>กำลังดึงรายการไฟล์ล่าสุดจาก Google Drive...</span>
                </div>
              ) : files.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-lg">
                  ไม่พบไฟล์ที่ตรงกับคำค้นหาใน Google Drive
                </div>
              ) : (
                <ul className="divide-y divide-slate-200 border border-slate-200 rounded-xl overflow-hidden">
                  {files.map((file) => {
                    const isToday =
                      getBangkokDateKey(file.modifiedTime) === todayBangkokKey;
                    const mins = getBangkokTimeMinutes(file.modifiedTime);
                    const isNear1524 =
                      isToday && mins !== null && Math.abs(mins - (15 * 60 + 24)) <= 30;
                    const isParsing = parsingFileId === file.id;

                    return (
                      <li
                        key={file.id}
                        className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-slate-50 transition-colors"
                      >
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="mt-0.5">
                            <FileTypeIcon mimeType={file.mimeType} />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs sm:text-sm font-medium text-slate-900 truncate">
                              {file.name}
                            </p>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500 mt-0.5">
                              <span>{describeMimeLabel(file.mimeType)}</span>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono tabular-nums">
                                {formatBangkokTimestamp(file.modifiedTime)} น.
                              </span>
                              {isNear1524 ? (
                                <span className="font-medium text-emerald-700">
                                  · อัปโหลดช่วง 15:24 น. วันนี้
                                </span>
                              ) : isToday ? (
                                <span className="font-medium text-blue-700">
                                  · อัปโหลดวันนี้
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={parsingFileId !== null}
                          onClick={() => handleSelectFile(file)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-60 text-xs font-medium text-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          {isParsing && (
                            <Loader2
                              className="w-3.5 h-3.5 animate-spin text-blue-700"
                              aria-hidden="true"
                            />
                          )}
                          <span>{isParsing ? 'กำลังอ่าน...' : 'อ่านและอัปเดต'}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
