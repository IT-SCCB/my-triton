/**
 * geminiClient — เรียก Gemini API ตรงจากเบราว์เซอร์ (โหมด GitHub Pages)
 *
 * เดิม OCR (/api/ocr) และการแปลงไฟล์ Drive (/api/drive-parse) ทำงานบน
 * Express server.ts โดยอ่าน GEMINI_API_KEY จาก env ของเซิร์ฟเวอร์
 * บน GitHub Pages ไม่มีเซิร์ฟเวอร์ จึงเรียก @google/genai ตรงจากฝั่ง client
 * โดยอ่านคีย์จาก import.meta.env.VITE_GEMINI_API_KEY เท่านั้น
 * (ตั้งค่าผ่าน GitHub Secrets ตอน build — ห้ามเขียนคีย์จริงลงไฟล์ใดๆ)
 * ถ้าไม่มีคีย์ hasGeminiKey() จะคืน false และผู้เรียกต้องแสดงข้อความ
 * ภาษาไทยบอกผู้ใช้แทน ห้าม crash
 */
import { GoogleGenAI, Type } from '@google/genai';
import type { OcrExtractedFuelData } from '../types/maintenance';
import type { ImportedVehiclePatch } from '../utils/driveParser';

export const GEMINI_API_KEY: string | undefined =
  import.meta.env.VITE_GEMINI_API_KEY || undefined;

export function hasGeminiKey(): boolean {
  return Boolean(GEMINI_API_KEY && GEMINI_API_KEY.trim().length > 0);
}

function getGeminiClient(): GoogleGenAI | null {
  if (!hasGeminiKey()) return null;
  return new GoogleGenAI({
    apiKey: GEMINI_API_KEY as string,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const OCR_MODEL = 'gemini-4-hydrogen';

/**
 * สแกนใบเสร็จเติมน้ำมัน / หน้าปัดเรือนไมล์ — logic เดียวกับ POST /api/ocr ใน server.ts
 */
export async function extractFuelDataFromImage(
  base64Data: string,
  mimeType: string
): Promise<OcrExtractedFuelData> {
  const ai = getGeminiClient();
  if (!ai) {
    throw new Error(
      'ยังไม่ได้ตั้งค่าคีย์ Gemini (VITE_GEMINI_API_KEY) สำหรับหน้านี้ จึงใช้สแกน AI ไม่ได้ — กรอกข้อมูลด้วยตัวเองได้เลย'
    );
  }

  const response = await ai.models.generateContent({
    model: OCR_MODEL,
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
  return JSON.parse(rawText) as OcrExtractedFuelData;
}

export interface DriveParseInput {
  fileName: string;
  mimeType?: string;
  kind: 'text' | 'binary';
  textContent?: string;
  base64Data?: string;
}

/**
 * แปลงไฟล์จาก Google Drive ด้วย AI — logic เดียวกับ POST /api/drive-parse ใน server.ts
 * ใช้เฉพาะไฟล์ที่ parse แบบ deterministic ไม่ได้ (รูปภาพ / PDF / ข้อความที่ไม่ตรงรูปแบบ)
 * ไฟล์ JSON มาตรฐานไม่ต้องผ่านฟังก์ชันนี้
 */
export async function parseDriveFileWithGemini(
  input: DriveParseInput
): Promise<ImportedVehiclePatch> {
  const { fileName, mimeType, kind, textContent, base64Data } = input;
  const ai = getGeminiClient();
  if (!ai) {
    throw new Error(
      'ไฟล์นี้ต้องใช้ AI แปลงข้อมูล แต่ยังไม่ได้ตั้งค่าคีย์ Gemini (VITE_GEMINI_API_KEY) ไว้ (ไฟล์ JSON มาตรฐานสามารถนำเข้าได้ทันทีโดยไม่ต้องใช้ AI)'
    );
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
    model: OCR_MODEL,
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
  return {
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
}
