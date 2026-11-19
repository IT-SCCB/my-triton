/**
 * geminiAssistantClient — ผู้ช่วย AI ตรงจากเบราว์เซอร์ (โหมด GitHub Pages)
 *
 * บน GitHub Pages ไม่มีเซิร์ฟเวอร์ AiAssistantDrawer จึงเรียก /api/chat กับ
 * WebSocket /api/live ไม่ได้ (STATIC_MODE) เดิม drawer แสดงข้อความ
 * "ไม่รองรับ" แล้วจบ ไฟล์นี้ทำให้โหมดสแตติกคุยกับ Gemini ตรงจากเบราว์เซอร์
 * ด้วยคีย์เดียวกับ OCR (VITE_GEMINI_API_KEY) โดย mirror logic ของ server.ts:
 * - แชทข้อความ: ai.chats.create + sendMessageStream โมเดลเดียวกับเซิร์ฟเวอร์
 *   (standard = gemini-4-hydrogen, fast = gemini-3.1-flash-lite)
 * - เสียงสด: ai.live.connect โมเดล gemini-3.8-live เสียง Zephyr ตรงตามเซิร์ฟเวอร์
 *   (responseModalities AUDIO + input/output transcription)
 * system instruction สร้างจากข้อมูลเดียวกับที่ drawer มีอยู่แล้ว
 * (เลขไมล์ อัตราสิ้นเปลือง ตารางซ่อม แผนทริป ประวัติเซอร์วิสล่าสุด)
 * ถ้าไม่มีคีย์จะ throw ข้อความภาษาไทย ให้ผู้เรียกแสดงแทน ห้าม crash
 */
import { GoogleGenAI, Modality, type LiveServerMessage } from '@google/genai';
import { getGeminiClient } from './geminiClient';

export type DirectLiveSession = Awaited<
  ReturnType<GoogleGenAI['live']['connect']>
>;

export interface AssistantRecentService {
  date: string;
  title: string;
  odometer: number;
  totalCost: number;
  notes?: string | null;
}

export interface AssistantChatContext {
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: number;
  engineSpec: string;
  lastUpdatedDate: string;
  avgKml: number;
  lastPricePerLiter: number;
  currentOdometer: number;
  fuelPercent: number;
  tankCapacityLiters: number;
  schedulesSummary: Array<{
    key: string;
    label: string;
    nextDueKm: number;
    remainingKm: number;
    status: string;
  }>;
  activeTrip: unknown;
  recentServices?: AssistantRecentService[];
  legalDocumentsSummary?: Array<{
    title: string;
    docType: string;
    provider: string;
    policyNumber: string;
    expiryDate: string;
    daysRemaining: number | null;
  }>;
}

const NO_KEY_MESSAGE =
  'ยังไม่ได้ตั้งค่าคีย์ Gemini (VITE_GEMINI_API_KEY) สำหรับหน้านี้ จึงใช้ผู้ช่วย AI ไม่ได้';

/** system instruction เดียวกับ buildAssistantSystemInstruction ใน server.ts แต่ใช้ข้อมูลฝั่ง client */
export function buildAssistantSystemInstructionForClient(
  ctx: AssistantChatContext,
  isVoiceMode = false
): string {
  const avgKml =
    ctx.avgKml > 0 ? `${ctx.avgKml.toFixed(2)} กม./ลิตร` : 'ยังไม่มีข้อมูลเฉลี่ย';
  const lastPrice =
    ctx.lastPricePerLiter > 0
      ? `${ctx.lastPricePerLiter.toFixed(2)} บาท/ลิตร`
      : '33.55 บาท/ลิตร';

  const schedulesText =
    ctx.schedulesSummary.length > 0
      ? ctx.schedulesSummary
          .map(
            (s) =>
              `- ${s.label}: ครบกำหนดที่ ${s.nextDueKm} กม. (คงเหลือ ${s.remainingKm} กม., สถานะ: ${s.status})`
          )
          .join('\n')
      : 'ไม่มีข้อมูลตารางรอบซ่อม';

  const servicesText = (ctx.recentServices ?? [])
    .map(
      (s) =>
        `- ${s.date}: ${s.title} ที่ไมล์ ${s.odometer} กม. (${s.totalCost} บาท${s.notes ? `, หมายเหตุ: ${s.notes}` : ''})`
    )
    .join('\n');

  const tripPlanText =
    ctx.activeTrip && typeof ctx.activeTrip === 'object'
      ? JSON.stringify(ctx.activeTrip)
      : null;

  const legalDocsText = (ctx.legalDocumentsSummary ?? [])
    .map(
      (d) =>
        `- ${d.title} (${d.docType}): หน่วยงาน ${d.provider || '-'}, เลขที่ ${d.policyNumber || '-'}, หมดอายุ ${d.expiryDate}${
          d.daysRemaining !== null ? ` (เหลือ ${d.daysRemaining} วัน)` : ''
        }`
    )
    .join('\n');

  return [
    `คุณคือ "ผู้ช่วยช่างและวางแผนทริปประจำรถอ้วนพี" สำหรับรถกระบะ ${ctx.vehicleMake} ${ctx.vehicleModel} ปี ${ctx.vehicleYear} (${ctx.engineSpec})`,
    'หน้าที่ของคุณคือตอบคำถามเรื่องการบำรุงรักษารถยนต์ การวางแผนเดินทาง คำนวณค่าน้ำมัน การเช็กรายการอะไหล่ตามระยะไมล์ เอกสาร พ.ร.บ. ประกันภัย ทะเบียน/ภาษีรถยนต์ และคำแนะนำด้านเทคนิคของเครื่องยนต์ดีเซล 2.5 DI-D อย่างเป็นกันเอง ชัดเจน และแม่นยำเป็นภาษาไทย',
    '',
    'ข้อมูลรถล่าสุดจากสมุดบันทึก:',
    `- เลขไมล์ปัจจุบัน: ${ctx.currentOdometer.toLocaleString('th-TH')} กม. (อัปเดต ${ctx.lastUpdatedDate})`,
    `- ความจุถังน้ำมัน: ${ctx.tankCapacityLiters} ลิตร | น้ำมันคงเหลือในถัง: ${ctx.fuelPercent}% (~${((ctx.fuelPercent / 100) * ctx.tankCapacityLiters).toFixed(1)} ลิตร)`,
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
    tripPlanText
      ? `\nแผนการเดินทางที่ผู้ใช้กำลังคำนวณอยู่ในขณะนี้:\n${tripPlanText}`
      : '',
    '',
    isVoiceMode
      ? 'โหมดสนทนาด้วยเสียงสด: ตอบเป็นภาษาไทยที่ฟังเป็นธรรมชาติ กระชับ ชัดเจน ไม่ยาวเยิ่นเย้อ เหมาะสำหรับการสนทนาโต้ตอบระหว่างขับรถหรือเตรียมออกทริป ไม่ต้องอ่านสัญลักษณ์ markdown เช่น ดอกจัน หรือขีดกลาง'
      : 'ตอบเป็นภาษาไทยที่อ่านง่าย เป็นระบบ อ้างอิงตัวเลขจริงของรถคันนี้เสมอเมื่อเกี่ยวข้อง และเตือนล่วงหน้าหากระยะทางที่ถามจะทำให้ถึงรอบซ่อมบำรุง หรือหากมี พ.ร.บ./ประกัน/ภาษีใกล้หมดอายุ',
  ]
    .filter(Boolean)
    .join('\n');
}

export interface AssistantChatHistoryItem {
  role: 'user' | 'model';
  text: string;
}

/** แชทข้อความตรงจากเบราว์เซอร์ (ใช้แทน POST /api/chat ตอน STATIC_MODE) */
export async function streamAssistantReply(options: {
  history: AssistantChatHistoryItem[];
  latestText: string;
  modelMode: 'standard' | 'fast';
  systemInstruction: string;
  onDelta: (text: string) => void;
}): Promise<void> {
  const ai = getGeminiClient();
  if (!ai) {
    throw new Error(NO_KEY_MESSAGE);
  }

  const model =
    options.modelMode === 'fast' ? 'gemini-3.1-flash-lite' : 'gemini-4-hydrogen';

  const chat = ai.chats.create({
    model,
    history: options.history
      .filter((m) => (m.role === 'user' || m.role === 'model') && m.text.trim())
      .map((m) => ({
        role: m.role,
        parts: [{ text: m.text }],
      })),
    config: {
      systemInstruction: options.systemInstruction,
    },
  });

  const streamResponse = await chat.sendMessageStream({
    message: options.latestText.trim(),
  });

  for await (const chunk of streamResponse) {
    const delta = chunk.text ?? '';
    if (delta) {
      options.onDelta(delta);
    }
  }
}

export interface DirectLiveCallbacks {
  onOpen?: () => void;
  /** เสียงตอบกลับของโมเดล (base64 PCM 16-bit 24kHz) */
  onAudio?: (base64Data: string) => void;
  onInputTranscript?: (text: string) => void;
  onOutputTranscript?: (text: string) => void;
  onInterrupted?: () => void;
  onError?: (message: string) => void;
  onClose?: () => void;
}

/** เสียงสดตรงจากเบราว์เซอร์ (ใช้แทน WebSocket /api/live ตอน STATIC_MODE) */
export async function connectDirectLiveSession(options: {
  systemInstruction: string;
  callbacks: DirectLiveCallbacks;
}): Promise<DirectLiveSession> {
  const ai = getGeminiClient();
  if (!ai) {
    throw new Error(NO_KEY_MESSAGE);
  }

  const session = await ai.live.connect({
    model: 'gemini-3.8-live',
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
      },
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      systemInstruction: options.systemInstruction,
    },
    callbacks: {
      onopen: () => {
        options.callbacks.onOpen?.();
      },
      onmessage: (message: LiveServerMessage) => {
        const content = message.serverContent;
        if (content?.inputTranscription?.text) {
          options.callbacks.onInputTranscript?.(content.inputTranscription.text);
        }
        if (content?.outputTranscription?.text) {
          options.callbacks.onOutputTranscript?.(content.outputTranscription.text);
        }
        for (const part of content?.modelTurn?.parts ?? []) {
          if (part.inlineData?.data) {
            options.callbacks.onAudio?.(part.inlineData.data);
          }
        }
        if (content?.interrupted) {
          options.callbacks.onInterrupted?.();
        }
      },
      onerror: (err: unknown) => {
        const msg =
          err instanceof Error
            ? err.message
            : typeof err === 'object' && err !== null && 'message' in err
              ? String((err as { message?: unknown }).message)
              : 'เกิดข้อผิดพลาดในการเชื่อมต่อ Gemini Live';
        options.callbacks.onError?.(msg);
      },
      onclose: () => {
        options.callbacks.onClose?.();
      },
    },
  });

  return session;
}
