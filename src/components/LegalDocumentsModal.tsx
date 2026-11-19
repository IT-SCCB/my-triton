import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  Bell,
  BellOff,
  Camera,
  CheckCircle2,
  FileText,
  Image as ImageIcon,
  Pencil,
  Phone,
  Plus,
  ShieldCheck,
  Trash2,
  Upload,
  X,
  ZoomIn,
} from 'lucide-react';
import type { LegalDocuments, LegalDocumentType } from '../types/maintenance';
import {
  captureVideoFrameToDataUrl,
  compressImageFileToDataUrl,
  computeDaysUntilExpiry,
  estimateDataUrlBytes,
  evaluateLegalDocumentItem,
  formatLegalExpiryCountdown,
  LEGAL_DOC_ALERT_DAYS_OPTIONS,
  LEGAL_DOC_DEFAULT_TITLES,
  LEGAL_DOC_TYPE_LABELS,
  sortLegalDocuments,
  validateLegalDocumentInput,
} from '../utils/legalDocuments';
import { formatBaht, formatThaiDate, getTodayIsoDate } from '../utils/maintenance';

interface LegalDocumentsModalProps {
  isOpen: boolean;
  documents: LegalDocuments[];
  initialSelectedDocId?: string | null;
  onClose: () => void;
  onSaveDocument: (doc: LegalDocuments, isEdit: boolean) => Promise<void>;
  onDeleteDocument: (docId: string) => Promise<void>;
}

const DOC_TYPE_OPTIONS: Array<{ value: LegalDocumentType; label: string }> = [
  { value: 'compulsory_insurance', label: 'พ.ร.บ. (ภาคบังคับ)' },
  { value: 'voluntary_insurance', label: 'ประกันภัยรถยนต์' },
  { value: 'registration_tax', label: 'ทะเบียน / ภาษีประจำปี' },
  { value: 'other', label: 'เอกสารอื่นๆ' },
];

function addOneYearIso(startIso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startIso);
  if (!match) return startIso;
  const year = Number(match[1]) + 1;
  return `${String(year).padStart(4, '0')}-${match[2]}-${match[3]}`;
}

export function LegalDocumentsModal({
  isOpen,
  documents,
  initialSelectedDocId,
  onClose,
  onSaveDocument,
  onDeleteDocument,
}: LegalDocumentsModalProps) {
  const [viewMode, setViewMode] = useState<'list' | 'form'>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [docType, setDocType] = useState<LegalDocumentType>('compulsory_insurance');
  const [title, setTitle] = useState(LEGAL_DOC_DEFAULT_TITLES.compulsory_insurance);
  const [provider, setProvider] = useState('');
  const [policyNumber, setPolicyNumber] = useState('');
  const [issueDate, setIssueDate] = useState(getTodayIsoDate());
  const [expiryDate, setExpiryDate] = useState(addOneYearIso(getTodayIsoDate()));
  const [alertDaysBefore, setAlertDaysBefore] = useState('30');
  const [alertEnabled, setAlertEnabled] = useState(true);
  const [cost, setCost] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [imageDataUrl, setImageDataUrl] = useState<string | undefined>(undefined);
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<{ src: string; title: string } | null>(
    null
  );

  // Live camera state
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [processingImage, setProcessingImage] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraCaptureInputRef = useRef<HTMLInputElement | null>(null);
  const galleryUploadInputRef = useRef<HTMLInputElement | null>(null);

  function stopCameraStream() {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraOpen(false);
  }

  function resetForm(nextType: LegalDocumentType = 'compulsory_insurance') {
    const today = getTodayIsoDate();
    setEditingId(null);
    setDocType(nextType);
    setTitle(LEGAL_DOC_DEFAULT_TITLES[nextType]);
    setProvider('');
    setPolicyNumber('');
    setIssueDate(today);
    setExpiryDate(addOneYearIso(today));
    setAlertDaysBefore('30');
    setAlertEnabled(true);
    setCost('');
    setEmergencyPhone('');
    setImageDataUrl(undefined);
    setNotes('');
    setFormError(null);
    setCameraError(null);
    stopCameraStream();
  }

  function populateFormForEdit(doc: LegalDocuments) {
    setEditingId(doc.id);
    setDocType(doc.docType);
    setTitle(doc.title);
    setProvider(doc.provider);
    setPolicyNumber(doc.policyNumber);
    setIssueDate(doc.issueDate);
    setExpiryDate(doc.expiryDate);
    setAlertDaysBefore(String(doc.alertDaysBefore));
    setAlertEnabled(doc.alertEnabled);
    setCost(doc.cost > 0 ? String(doc.cost) : '');
    setEmergencyPhone(doc.emergencyPhone ?? '');
    setImageDataUrl(doc.imageDataUrl);
    setNotes(doc.notes ?? '');
    setFormError(null);
    setCameraError(null);
    stopCameraStream();
    setViewMode('form');
  }

  useEffect(() => {
    if (!isOpen) {
      stopCameraStream();
      setLightboxImage(null);
      setConfirmDeleteId(null);
      return;
    }

    if (initialSelectedDocId) {
      const target = documents.find((d) => d.id === initialSelectedDocId);
      if (target) {
        populateFormForEdit(target);
        return;
      }
    }

    if (documents.length === 0) {
      resetForm('compulsory_insurance');
      setViewMode('form');
    } else {
      stopCameraStream();
      setViewMode('list');
    }
  }, [isOpen, initialSelectedDocId]);

  useEffect(() => {
    return () => {
      stopCameraStream();
    };
  }, []);

  useEffect(() => {
    if (!cameraOpen || !videoRef.current || !streamRef.current) return;
    videoRef.current.srcObject = streamRef.current;
    void videoRef.current.play().catch(() => {});
  }, [cameraOpen]);

  if (!isOpen) return null;

  const sortedDocuments = sortLegalDocuments(documents);
  const previewDays = computeDaysUntilExpiry(expiryDate);

  function handleDocTypeChange(nextType: LegalDocumentType) {
    const currentDefault = LEGAL_DOC_DEFAULT_TITLES[docType];
    setDocType(nextType);
    if (!title.trim() || title === currentDefault) {
      setTitle(LEGAL_DOC_DEFAULT_TITLES[nextType]);
    }
  }

  async function handleOpenLiveCamera() {
    setCameraError(null);
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      setCameraError(
        'เบราว์เซอร์นี้ไม่รองรับการเปิดกล้องสด กรุณาใช้ปุ่ม "ถ่ายรูป / เลือกไฟล์" แทน'
      );
      return;
    }

    try {
      stopCameraStream();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 960 },
        },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOpen(true);
    } catch {
      setCameraError(
        'ไม่สามารถเปิดกล้องได้ (อาจไม่ได้อนุญาตสิทธิ์กล้อง หรือไม่มีกล้องบนอุปกรณ์นี้) กรุณาลองอัปโหลดไฟล์รูปภาพแทน'
      );
    }
  }

  function handleSnapFromCamera() {
    if (!videoRef.current) return;
    setProcessingImage(true);
    setCameraError(null);
    try {
      const compressed = captureVideoFrameToDataUrl(videoRef.current);
      setImageDataUrl(compressed);
      stopCameraStream();
    } catch (err) {
      setCameraError(err instanceof Error ? err.message : 'ไม่สามารถบันทึกภาพจากกล้องได้');
    } finally {
      setProcessingImage(false);
    }
  }

  async function handleFileUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setFormError('กรุณาเลือกไฟล์รูปภาพ (JPG, PNG หรือ WebP)');
      return;
    }
    setProcessingImage(true);
    setFormError(null);
    setCameraError(null);
    try {
      const compressed = await compressImageFileToDataUrl(file);
      setImageDataUrl(compressed);
      stopCameraStream();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'ไม่สามารถย่อขนาดรูปภาพที่เลือกได้');
    } finally {
      setProcessingImage(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const validation = validateLegalDocumentInput({
      title,
      issueDate,
      expiryDate,
      alertDaysBefore,
      cost,
    });
    if (!validation.valid) {
      setFormError(validation.error ?? 'ข้อมูลไม่ถูกต้อง');
      return;
    }

    const isEdit = Boolean(editingId);
    const parsedCost = cost.trim() === '' ? 0 : Number(cost.replace(/,/g, ''));
    const nextRecord: LegalDocuments = {
      id: editingId ?? `doc-${Date.now()}`,
      docType,
      title: title.trim(),
      provider: provider.trim(),
      policyNumber: policyNumber.trim(),
      issueDate,
      expiryDate,
      alertDaysBefore: Math.max(0, Math.min(365, Math.round(Number(alertDaysBefore || 30)))),
      alertEnabled,
      cost: Math.max(0, Number.isFinite(parsedCost) ? parsedCost : 0),
      emergencyPhone: emergencyPhone.trim() || undefined,
      imageDataUrl: imageDataUrl || undefined,
      notes: notes.trim() || undefined,
      updatedAt: new Date().toISOString(),
    };

    setSaving(true);
    setFormError(null);
    try {
      await onSaveDocument(nextRecord, isEdit);
      stopCameraStream();
      setEditingId(null);
      setViewMode('list');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'บันทึกข้อมูลไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  }

  async function handleConfirmDelete(id: string) {
    setSaving(true);
    try {
      await onDeleteDocument(id);
      setConfirmDeleteId(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="legal-docs-modal-title"
      data-testid="legal-documents-modal"
    >
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400 shrink-0">
              <ShieldCheck className="w-5 h-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2
                id="legal-docs-modal-title"
                className="font-display text-lg font-bold text-slate-900 dark:text-slate-100 truncate"
              >
                พ.ร.บ. / ประกันภัย &amp; ทะเบียนรถยนต์
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                เก็บข้อมูลกรมธรรม์ รูปถ่ายจากกล้อง และตั้งแจ้งเตือนวันหมดอายุบนแดชบอร์ด
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {viewMode === 'list' ? (
              <button
                type="button"
                onClick={() => {
                  resetForm('compulsory_insurance');
                  setViewMode('form');
                }}
                data-testid="add-legal-doc-btn"
                className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-white text-white dark:text-slate-900 text-xs font-medium cursor-pointer"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                <span>เพิ่มเอกสารใหม่</span>
              </button>
            ) : (
              documents.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    stopCameraStream();
                    setViewMode('list');
                  }}
                  className="min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  กลับไปรายการ ({documents.length})
                </button>
              )
            )}

            <button
              type="button"
              onClick={() => {
                stopCameraStream();
                onClose();
              }}
              aria-label="ปิดหน้าต่าง"
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-5 flex-1">
          {viewMode === 'list' ? (
            <div className="space-y-3" data-testid="legal-docs-list">
              {sortedDocuments.length === 0 ? (
                <div className="py-10 text-center space-y-3 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl">
                  <FileText
                    className="w-10 h-10 text-slate-400 dark:text-slate-500 mx-auto"
                    aria-hidden="true"
                  />
                  <div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                      ยังไม่มีข้อมูล พ.ร.บ. ประกันภัย หรือป้ายภาษี
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      เพิ่มเอกสารพร้อมถ่ายรูปและตั้งเตือนวันหมดอายุล่วงหน้าได้ทันที
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      resetForm('compulsory_insurance');
                      setViewMode('form');
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 text-white text-xs font-medium cursor-pointer"
                  >
                    <Plus className="w-4 h-4" aria-hidden="true" />
                    <span>เพิ่มเอกสารฉบับแรก</span>
                  </button>
                </div>
              ) : (
                sortedDocuments.map((docItem) => {
                  const evaluated = evaluateLegalDocumentItem(docItem);
                  const isExpired = evaluated?.status === 'expired';
                  const isExpiringSoon = evaluated?.status === 'expiring_soon';

                  return (
                    <article
                      key={docItem.id}
                      data-testid={`legal-doc-card-${docItem.id}`}
                      className={`border rounded-xl p-4 flex flex-col sm:flex-row gap-4 justify-between transition-colors ${
                        isExpired && docItem.alertEnabled
                          ? 'border-red-300 dark:border-red-800/80 bg-red-50/40 dark:bg-red-950/20'
                          : isExpiringSoon && docItem.alertEnabled
                            ? 'border-amber-300 dark:border-amber-700/80 bg-amber-50/40 dark:bg-amber-950/20'
                            : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                      }`}
                    >
                      <div className="flex gap-3.5 min-w-0 flex-1">
                        {docItem.imageDataUrl ? (
                          <button
                            type="button"
                            onClick={() =>
                              setLightboxImage({
                                src: docItem.imageDataUrl!,
                                title: docItem.title,
                              })
                            }
                            aria-label={`ดูรูปขนาดใหญ่: ${docItem.title}`}
                            className="group relative w-20 h-20 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 shrink-0 cursor-pointer"
                          >
                            <img
                              src={docItem.imageDataUrl}
                              alt={docItem.title}
                              className="w-full h-full object-cover"
                            />
                            <span className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                              <ZoomIn className="w-4 h-4" aria-hidden="true" />
                            </span>
                          </button>
                        ) : (
                          <div className="w-20 h-20 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-center text-slate-400 dark:text-slate-500 shrink-0">
                            <FileText className="w-6 h-6" aria-hidden="true" />
                          </div>
                        )}

                        <div className="min-w-0 flex-1 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                              {LEGAL_DOC_TYPE_LABELS[docItem.docType]}
                            </span>

                            {evaluated && (
                              <span
                                className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded ${
                                  isExpired
                                    ? 'bg-red-100 dark:bg-red-950/70 text-red-700 dark:text-red-300'
                                    : isExpiringSoon
                                      ? 'bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300'
                                      : 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300'
                                }`}
                              >
                                {isExpired ? (
                                  <AlertOctagon className="w-3 h-3" aria-hidden="true" />
                                ) : isExpiringSoon ? (
                                  <AlertTriangle className="w-3 h-3" aria-hidden="true" />
                                ) : (
                                  <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                                )}
                                {formatLegalExpiryCountdown(evaluated.daysRemaining)}
                              </span>
                            )}

                            <span
                              className={`inline-flex items-center gap-1 text-[11px] ${
                                docItem.alertEnabled
                                  ? 'text-blue-700 dark:text-blue-400'
                                  : 'text-slate-400 dark:text-slate-500'
                              }`}
                            >
                              {docItem.alertEnabled ? (
                                <>
                                  <Bell className="w-3 h-3" aria-hidden="true" />
                                  <span>เตือนล่วงหน้า {docItem.alertDaysBefore} วัน</span>
                                </>
                              ) : (
                                <>
                                  <BellOff className="w-3 h-3" aria-hidden="true" />
                                  <span>ปิดเตือน</span>
                                </>
                              )}
                            </span>
                          </div>

                          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                            {docItem.title}
                          </h3>

                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
                            {docItem.provider && <span>หน่วยงาน: {docItem.provider}</span>}
                            {docItem.policyNumber && (
                              <span className="font-mono tabular-nums">
                                เลขที่: {docItem.policyNumber}
                              </span>
                            )}
                            <span>
                              หมดอายุ:{' '}
                              <strong className="text-slate-800 dark:text-slate-200">
                                {formatThaiDate(docItem.expiryDate, 'full')}
                              </strong>
                            </span>
                            {docItem.cost > 0 && (
                              <span className="font-mono tabular-nums">
                                ค่าใช้จ่าย: {formatBaht(docItem.cost)} บ.
                              </span>
                            )}
                          </div>

                          {docItem.emergencyPhone && (
                            <p className="text-xs text-blue-700 dark:text-blue-400 flex items-center gap-1">
                              <Phone className="w-3 h-3" aria-hidden="true" />
                              <a
                                href={`tel:${docItem.emergencyPhone}`}
                                className="hover:underline font-mono tabular-nums"
                              >
                                สายด่วน/เคลม: {docItem.emergencyPhone}
                              </a>
                            </p>
                          )}

                          {docItem.notes && (
                            <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                              {docItem.notes}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex sm:flex-col items-center sm:items-end justify-end gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => populateFormForEdit(docItem)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>แก้ไข</span>
                        </button>

                        {confirmDeleteId === docItem.id ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => void handleConfirmDelete(docItem.id)}
                              className="px-2.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium cursor-pointer"
                            >
                              ยืนยันลบ
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 cursor-pointer"
                            >
                              ยกเลิก
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(docItem.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-red-200 dark:border-red-900/70 text-xs font-medium text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>ลบ</span>
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4" noValidate data-testid="legal-doc-form">
              {/* Document Type Selector */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  ประเภทเอกสาร
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {DOC_TYPE_OPTIONS.map((opt) => {
                    const active = docType === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => handleDocTypeChange(opt.value)}
                        className={`px-3 py-2 rounded-lg border text-xs font-medium text-left transition-colors cursor-pointer ${
                          active
                            ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/60 text-blue-900 dark:text-blue-200'
                            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Title + Provider */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label
                    htmlFor="legal-doc-title"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    ชื่อเอกสาร / รายการ <span className="text-red-600">*</span>
                  </label>
                  <input
                    id="legal-doc-title"
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="เช่น ประกันชั้น 1 วิริยะ / ป้ายภาษี 2570"
                    className="w-full min-h-[40px] px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <div>
                  <label
                    htmlFor="legal-doc-provider"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    บริษัทประกัน / กรมการขนส่งฯ
                  </label>
                  <input
                    id="legal-doc-provider"
                    type="text"
                    value={provider}
                    onChange={(e) => setProvider(e.target.value)}
                    placeholder="เช่น วิริยะประกันภัย / กรมการขนส่งทางบก"
                    className="w-full min-h-[40px] px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              {/* Policy Number + Cost + Emergency Phone */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div>
                  <label
                    htmlFor="legal-doc-policy"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    เลขที่กรมธรรม์ / ทะเบียนรถ
                  </label>
                  <input
                    id="legal-doc-policy"
                    type="text"
                    value={policyNumber}
                    onChange={(e) => setPolicyNumber(e.target.value)}
                    placeholder="เช่น 12345-67890"
                    className="w-full min-h-[40px] px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <div>
                  <label
                    htmlFor="legal-doc-cost"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    ค่าเบี้ย / ค่าภาษี (บาท)
                  </label>
                  <input
                    id="legal-doc-cost"
                    type="number"
                    min="0"
                    step="any"
                    value={cost}
                    onChange={(e) => setCost(e.target.value)}
                    placeholder="0"
                    className="w-full min-h-[40px] px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <div>
                  <label
                    htmlFor="legal-doc-phone"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    เบอร์แจ้งเคลม / สายด่วน 24 ชม.
                  </label>
                  <input
                    id="legal-doc-phone"
                    type="tel"
                    value={emergencyPhone}
                    onChange={(e) => setEmergencyPhone(e.target.value)}
                    placeholder="เช่น 1557 หรือ 02-xxx-xxxx"
                    className="w-full min-h-[40px] px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label
                    htmlFor="legal-doc-issue-date"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    วันที่เริ่มคุ้มครอง / วันต่ออายุ <span className="text-red-600">*</span>
                  </label>
                  <input
                    id="legal-doc-issue-date"
                    type="date"
                    required
                    value={issueDate}
                    onChange={(e) => setIssueDate(e.target.value)}
                    className="w-full min-h-[40px] px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <div>
                  <label
                    htmlFor="legal-doc-expiry-date"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    วันหมดอายุ <span className="text-red-600">*</span>
                  </label>
                  <input
                    id="legal-doc-expiry-date"
                    type="date"
                    required
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                    className="w-full min-h-[40px] px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                  {previewDays !== null && (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                      ตรงกับ {formatThaiDate(expiryDate, 'full')} ({formatLegalExpiryCountdown(previewDays)})
                    </p>
                  )}
                </div>
              </div>

              {/* Dashboard Expiration Alert Settings */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-3.5 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={alertEnabled}
                      onChange={(e) => setAlertEnabled(e.target.checked)}
                      data-testid="legal-doc-alert-toggle"
                      className="rounded border-slate-300 dark:border-slate-600 text-blue-700 focus:ring-blue-600"
                    />
                    <span>แจ้งเตือนวันหมดอายุบนแดชบอร์ด</span>
                  </label>

                  {alertEnabled && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs text-slate-600 dark:text-slate-400">
                        เตือนล่วงหน้า:
                      </span>
                      {LEGAL_DOC_ALERT_DAYS_OPTIONS.map((daysOpt) => {
                        const active = Number(alertDaysBefore) === daysOpt;
                        return (
                          <button
                            key={daysOpt}
                            type="button"
                            onClick={() => setAlertDaysBefore(String(daysOpt))}
                            className={`px-2.5 py-1 rounded-md text-xs font-mono tabular-nums cursor-pointer transition-colors ${
                              active
                                ? 'bg-blue-700 dark:bg-blue-600 text-white font-semibold'
                                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                            }`}
                          >
                            {daysOpt} วัน
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Camera & Image Upload */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3.5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      รูปถ่ายกรมธรรม์ / ป้ายภาษี / เล่มทะเบียน
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      ถ่ายภาพผ่านกล้องได้ทันที ระบบจะย่อขนาดอัตโนมัติเพื่อให้ซิงค์ขึ้นคลาวด์ได้รวดเร็ว
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleOpenLiveCamera()}
                      data-testid="open-legal-camera-btn"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 text-white text-xs font-medium cursor-pointer"
                    >
                      <Camera className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>เปิดกล้องถ่ายรูป</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => cameraCaptureInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium cursor-pointer"
                    >
                      <Camera className="w-3.5 h-3.5 text-blue-700 dark:text-blue-400" aria-hidden="true" />
                      <span>กล้องมือถือ</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => galleryUploadInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>เลือกไฟล์รูป</span>
                    </button>

                    <input
                      ref={cameraCaptureInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleFileUpload}
                      className="hidden"
                      aria-label="ถ่ายรูปเอกสารด้วยกล้อง"
                    />
                    <input
                      ref={galleryUploadInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload}
                      className="hidden"
                      aria-label="อัปโหลดรูปภาพเอกสารจากเครื่อง"
                    />
                  </div>
                </div>

                {cameraError && (
                  <p
                    role="alert"
                    className="text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/70 rounded-lg px-3 py-2"
                  >
                    {cameraError}
                  </p>
                )}

                {cameraOpen && (
                  <div className="space-y-2 rounded-lg overflow-hidden border border-blue-200 dark:border-blue-800 bg-slate-950 p-2">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full max-h-64 object-contain rounded bg-black"
                    />
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={stopCameraStream}
                        className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-200 text-xs hover:bg-slate-800 cursor-pointer"
                      >
                        ปิดกล้อง
                      </button>
                      <button
                        type="button"
                        disabled={processingImage}
                        onClick={handleSnapFromCamera}
                        data-testid="snap-legal-camera-btn"
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer"
                      >
                        <Camera className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>ถ่ายภาพเอกสาร</span>
                      </button>
                    </div>
                  </div>
                )}

                {processingImage && (
                  <p className="text-xs text-blue-700 dark:text-blue-400">
                    กำลังย่อขนาดและเตรียมรูปภาพ...
                  </p>
                )}

                {imageDataUrl ? (
                  <div className="flex items-center gap-3 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60">
                    <button
                      type="button"
                      onClick={() =>
                        setLightboxImage({
                          src: imageDataUrl,
                          title: title || 'รูปภาพเอกสาร',
                        })
                      }
                      className="w-16 h-16 rounded overflow-hidden border border-slate-300 dark:border-slate-700 shrink-0 cursor-pointer"
                    >
                      <img
                        src={imageDataUrl}
                        alt="ตัวอย่างเอกสาร"
                        className="w-full h-full object-cover"
                      />
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-slate-800 dark:text-slate-200">
                        แนบรูปภาพเรียบร้อยแล้ว
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                        ขนาด ~{Math.round(estimateDataUrlBytes(imageDataUrl) / 1024)} KB (พร้อมซิงค์คลาวด์)
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setImageDataUrl(undefined)}
                      className="px-2.5 py-1 rounded border border-red-200 dark:border-red-900/70 text-xs text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
                    >
                      ลบรูป
                    </button>
                  </div>
                ) : (
                  !cameraOpen && (
                    <div className="py-4 px-3 rounded-lg border border-dashed border-slate-200 dark:border-slate-700 text-center text-xs text-slate-500 dark:text-slate-400 flex items-center justify-center gap-2">
                      <ImageIcon className="w-4 h-4 shrink-0" aria-hidden="true" />
                      <span>ยังไม่ได้แนบรูปภาพเอกสาร (ไม่บังคับ)</span>
                    </div>
                  )
                )}
              </div>

              {/* Notes */}
              <div>
                <label
                  htmlFor="legal-doc-notes"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  รายละเอียดความคุ้มครอง / หมายเหตุ
                </label>
                <textarea
                  id="legal-doc-notes"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="เช่น ทุนประกัน 350,000 บาท ซ่อมอู่ในเครือ รวมรถยกฉุกเฉิน..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              {formError && (
                <p
                  role="alert"
                  className="text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/70 rounded-lg px-3 py-2"
                >
                  {formError}
                </p>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    stopCameraStream();
                    if (documents.length > 0) {
                      setViewMode('list');
                    } else {
                      onClose();
                    }
                  }}
                  className="min-h-[40px] px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={saving || processingImage}
                  data-testid="save-legal-doc-btn"
                  className="min-h-[40px] px-5 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 disabled:opacity-60 text-white text-xs sm:text-sm font-semibold cursor-pointer"
                >
                  {saving ? 'กำลังบันทึก...' : editingId ? 'อัปเดตเอกสาร' : 'บันทึกเอกสาร'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Image Lightbox */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-[60] bg-slate-950/85 flex items-center justify-center p-4"
          onClick={() => setLightboxImage(null)}
        >
          <div
            className="max-w-3xl w-full bg-slate-900 border border-slate-700 rounded-xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between text-white">
              <span className="text-sm font-medium truncate">{lightboxImage.title}</span>
              <button
                type="button"
                onClick={() => setLightboxImage(null)}
                aria-label="ปิดรูปภาพขยาย"
                className="p-1 rounded hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>
            <div className="p-3 bg-black flex items-center justify-center max-h-[80vh]">
              <img
                src={lightboxImage.src}
                alt={lightboxImage.title}
                className="max-h-[74vh] w-auto object-contain rounded"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
