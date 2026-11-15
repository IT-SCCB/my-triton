import { useEffect, useState, type ChangeEvent } from 'react';
import { Camera, Loader2, ScanLine, X } from 'lucide-react';
import type { OcrExtractedFuelData } from '../types/maintenance';
import {
  extractFuelDataFromImage,
  hasGeminiKey,
} from '../services/geminiClient';

interface OcrScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExtracted: (data: OcrExtractedFuelData) => void;
}

export function OcrScannerModal({ isOpen, onClose, onExtracted }: OcrScannerModalProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [base64Data, setBase64Data] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string>('image/jpeg');
  const [statusMsg, setStatusMsg] = useState<{ type: 'info' | 'error'; text: string } | null>(
    null
  );
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setStatusMsg(null);
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setMimeType(file.type || 'image/jpeg');
    setStatusMsg(null);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const result = String(evt.target?.result ?? '');
      setPreviewUrl(result);
      const parts = result.split(',');
      setBase64Data(parts[1] ?? null);
    };
    reader.readAsDataURL(file);
  }

  async function handleRunOcr() {
    if (!base64Data) {
      setStatusMsg({
        type: 'error',
        text: 'กรุณาเลือกรูปภาพใบเสร็จปั๊มน้ำมันหรือหน้าปัดเรือนไมล์ก่อน',
      });
      return;
    }

    if (!hasGeminiKey()) {
      setStatusMsg({
        type: 'error',
        text: 'สแกน AI ต้องใช้คีย์ Gemini (VITE_GEMINI_API_KEY) ซึ่งยังไม่ได้ตั้งค่าไว้ในหน้านี้ — กรอกข้อมูลด้วยตัวเองได้เลย',
      });
      return;
    }

    setScanning(true);
    setStatusMsg({
      type: 'info',
      text: 'กำลังส่งภาพให้ Gemini AI วิเคราะห์ตัวเลข...',
    });

    try {
      // เรียก Gemini ตรงจากเบราว์เซอร์ (เดิมเรียกผ่าน /api/ocr บนเซิร์ฟเวอร์)
      const extracted = await extractFuelDataFromImage(base64Data, mimeType);
      onExtracted(extracted);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการสแกนภาพ';
      setStatusMsg({ type: 'error', text: message });
    } finally {
      setScanning(false);
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
        aria-labelledby="ocr-modal-title"
        className="w-full max-w-lg bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 id="ocr-modal-title" className="font-display text-lg font-semibold text-slate-900">
            สแกนใบเสร็จน้ำมัน / หน้าปัดไมล์ด้วย AI
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดหน้าต่างสแกน AI"
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          <div className="space-y-2">
            <label
              htmlFor="ocr-image-input"
              className="block text-xs font-medium text-slate-700"
            >
              อัปโหลดรูปถ่ายใบเสร็จปั๊มน้ำมัน หรือหน้าปัดเรือนไมล์
            </label>
            <label
              htmlFor="ocr-image-input"
              className="flex flex-col items-center justify-center w-full h-44 border-2 border-dashed border-slate-300 rounded-xl cursor-pointer bg-slate-50 hover:bg-slate-100/80 transition-colors overflow-hidden"
            >
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt="ตัวอย่างรูปภาพสำหรับสแกน"
                  className="w-full h-full object-contain bg-slate-900"
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-center px-4">
                  <Camera className="w-8 h-8 text-blue-700 mb-2" aria-hidden="true" />
                  <p className="text-xs sm:text-sm font-medium text-slate-700">
                    คลิกเพื่อเลือกรูปภาพ หรือถ่ายภาพ
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">รองรับ JPG, PNG, WEBP</p>
                </div>
              )}
              <input
                id="ocr-image-input"
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="sr-only"
              />
            </label>
          </div>

          {statusMsg && (
            <p
              role={statusMsg.type === 'error' ? 'alert' : 'status'}
              className={`p-3 rounded-lg text-xs font-medium border ${
                statusMsg.type === 'error'
                  ? 'bg-red-50 text-red-700 border-red-200'
                  : 'bg-blue-50 text-blue-800 border-blue-200'
              }`}
            >
              {statusMsg.text}
            </p>
          )}

          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] px-4 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium cursor-pointer"
            >
              ปิด
            </button>
            <button
              type="button"
              onClick={handleRunOcr}
              disabled={scanning}
              className="inline-flex items-center gap-2 min-h-[40px] px-5 py-2 rounded-lg bg-indigo-700 hover:bg-indigo-800 disabled:opacity-60 text-white text-sm font-medium cursor-pointer"
            >
              {scanning ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  <span>กำลังวิเคราะห์ภาพ...</span>
                </>
              ) : (
                <>
                  <ScanLine className="w-4 h-4" aria-hidden="true" />
                  <span>วิเคราะห์ข้อมูลด้วย AI</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
