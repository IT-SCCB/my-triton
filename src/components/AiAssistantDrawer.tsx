import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  AudioLines,
  Bot,
  Loader2,
  MessageSquare,
  Mic,
  MicOff,
  PhoneOff,
  Send,
  Sparkles,
  Trash2,
  User as UserIcon,
  Volume2,
  X,
} from 'lucide-react';
import type {
  FuelAnalyticsSummary,
  LegalDocuments,
  MaintenanceScheduleItem,
  VehicleProfile,
} from '../types/maintenance';
import { computeDaysUntilExpiry, LEGAL_DOC_TYPE_LABELS } from '../utils/legalDocuments';
import type { TripPlanEstimate } from '../utils/tripPlanner';
import { STATIC_MODE } from '../utils/serverApi';
import {
  buildAssistantSystemInstructionForClient,
  connectDirectLiveSession,
  streamAssistantReply,
  type AssistantChatContext,
  type AssistantRecentService,
  type DirectLiveSession,
} from '../services/geminiAssistantClient';

export interface AssistantVehicleContext {
  avgKml: number;
  lastKml: number;
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
  activeTrip: TripPlanEstimate | null;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
}

interface VoiceTranscriptItem {
  id: string;
  role: 'user' | 'model';
  text: string;
}

interface AiAssistantDrawerProps {
  isOpen: boolean;
  initialMode?: 'chat' | 'voice';
  pendingTripPrompt?: { id: number; text: string } | null;
  vehicle: VehicleProfile;
  fuelStats: FuelAnalyticsSummary;
  schedules: MaintenanceScheduleItem[];
  activeTrip: TripPlanEstimate | null;
  recentServices?: AssistantRecentService[];
  legalDocuments?: LegalDocuments[];
  onClose: () => void;
}

function downsampleTo16k(input: Float32Array, sourceRate: number): Float32Array {
  if (sourceRate === 16000 || sourceRate <= 0) return input;
  const ratio = sourceRate / 16000;
  const newLength = Math.max(1, Math.round(input.length / ratio));
  const result = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    let count = 0;
    for (let j = start; j < end; j++) {
      sum += input[j];
      count += 1;
    }
    result[i] = count > 0 ? sum / count : input[Math.min(start, input.length - 1)];
  }
  return result;
}

function float32ToBase64Pcm16(float32: Float32Array): string {
  const buffer = new ArrayBuffer(float32.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < float32.length; i++) {
    const clamped = Math.max(-1, Math.min(1, float32[i]));
    view.setInt16(i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64Pcm16ToFloat32(base64: string): Float32Array {
  const binary = atob(base64);
  const byteLength = binary.length;
  const buffer = new ArrayBuffer(byteLength);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < byteLength; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const view = new DataView(buffer);
  const samples = Math.floor(byteLength / 2);
  const float32 = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    float32[i] = view.getInt16(i * 2, true) / 32768;
  }
  return float32;
}

const QUICK_PROMPTS = [
  'เช็กสภาพอ้วนพีก่อนออกทริปไกล ควรตรวจอะไรบ้าง?',
  'วิเคราะห์อัตราสิ้นเปลืองและค่าน้ำมันของทริปที่วางแผนไว้ให้หน่อย',
  'รายการซ่อมบำรุงไหนใกล้ครบกำหนดที่สุด และควรเตรียมงบประมาณเท่าไหร่?',
];

export function AiAssistantDrawer({
  isOpen,
  initialMode = 'chat',
  pendingTripPrompt = null,
  vehicle,
  fuelStats,
  schedules,
  activeTrip,
  recentServices = [],
  legalDocuments = [],
  onClose,
}: AiAssistantDrawerProps) {
  const [mode, setMode] = useState<'chat' | 'voice'>(initialMode);
  const [modelMode, setModelMode] = useState<'standard' | 'fast'>('standard');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'model',
      text: `สวัสดีครับ! ผมเป็นผู้ช่วยดูแลรถอ้วนพี (${vehicle.make} ${vehicle.model} ${vehicle.engineSpec}) พร้อมช่วยคำนวณค่าใช้จ่ายทริป ตรวจสอบรอบเปลี่ยนถ่ายอะไหล่ และตอบคำถามซ่อมบำรุงจากเลขไมล์จริง ${vehicle.currentOdometer.toLocaleString('th-TH')} กม. ครับ`,
    },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatStreaming, setChatStreaming] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  // Voice Live API state
  const [voiceStatus, setVoiceStatus] = useState<'idle' | 'connecting' | 'live' | 'error'>('idle');
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isModelSpeaking, setIsModelSpeaking] = useState(false);
  const [voiceTranscripts, setVoiceTranscripts] = useState<VoiceTranscriptItem[]>([]);
  const [voiceTextInput, setVoiceTextInput] = useState('');

  const chatScrollRef = useRef<HTMLDivElement>(null);
  const voiceScrollRef = useRef<HTMLDivElement>(null);
  const handledTripPromptIdRef = useRef<number | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const liveSessionRef = useRef<DirectLiveSession | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const inputAudioCtxRef = useRef<AudioContext | null>(null);
  const outputAudioCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const activePlaybackSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextStartTimeRef = useRef<number>(0);
  const liveReadyRef = useRef<boolean>(false);
  const isMutedRef = useRef<boolean>(false);

  isMutedRef.current = isMuted;

  const buildVehicleContext = useCallback((): AssistantVehicleContext => {
    return {
      avgKml: fuelStats.avgKml,
      lastKml: fuelStats.lastKml,
      lastPricePerLiter: fuelStats.lastPricePerLiter,
      currentOdometer: vehicle.currentOdometer,
      fuelPercent: vehicle.fuelPercent,
      tankCapacityLiters: vehicle.tankCapacityLiters,
      schedulesSummary: schedules.map((s) => ({
        key: s.key,
        label: s.label,
        nextDueKm: s.nextDueKm,
        remainingKm: s.remainingKm,
        status: s.status,
      })),
      activeTrip,
    };
  }, [fuelStats, vehicle, schedules, activeTrip]);

  // ข้อมูลรถสำหรับ system instruction ฝั่ง client (โหมด GitHub Pages)
  const buildClientChatContext = useCallback((): AssistantChatContext => {
    const vc = buildVehicleContext();
    return {
      vehicleMake: vehicle.make,
      vehicleModel: vehicle.model,
      vehicleYear: vehicle.year,
      engineSpec: vehicle.engineSpec,
      lastUpdatedDate: vehicle.lastUpdatedDate,
      avgKml: vc.avgKml,
      lastPricePerLiter: vc.lastPricePerLiter,
      currentOdometer: vc.currentOdometer,
      fuelPercent: vc.fuelPercent,
      tankCapacityLiters: vc.tankCapacityLiters,
      schedulesSummary: vc.schedulesSummary,
      activeTrip: vc.activeTrip,
      recentServices,
      legalDocumentsSummary: legalDocuments.map((d) => ({
        title: d.title,
        docType: LEGAL_DOC_TYPE_LABELS[d.docType],
        provider: d.provider,
        policyNumber: d.policyNumber,
        expiryDate: d.expiryDate,
        daysRemaining: computeDaysUntilExpiry(d.expiryDate),
      })),
    };
  }, [vehicle, buildVehicleContext, recentServices, legalDocuments]);

  const stopPlaybackQueue = useCallback(() => {
    for (const src of activePlaybackSourcesRef.current) {
      try {
        src.stop();
        src.disconnect();
      } catch {
        // Ignore already stopped sources
      }
    }
    activePlaybackSourcesRef.current.clear();
    if (outputAudioCtxRef.current) {
      nextStartTimeRef.current = outputAudioCtxRef.current.currentTime;
    } else {
      nextStartTimeRef.current = 0;
    }
    setIsModelSpeaking(false);
  }, []);

  const stopVoiceSession = useCallback(() => {
    liveReadyRef.current = false;
    stopPlaybackQueue();

    if (liveSessionRef.current) {
      try {
        liveSessionRef.current.close();
      } catch {
        // Ignore close errors
      }
      liveSessionRef.current = null;
    }

    if (processorRef.current) {
      processorRef.current.onaudioprocess = null;
      try {
        processorRef.current.disconnect();
      } catch {
        // Ignore
      }
      processorRef.current = null;
    }

    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.disconnect();
      } catch {
        // Ignore
      }
      sourceNodeRef.current = null;
    }

    if (mediaStreamRef.current) {
      for (const track of mediaStreamRef.current.getTracks()) {
        track.stop();
      }
      mediaStreamRef.current = null;
    }

    if (inputAudioCtxRef.current) {
      void inputAudioCtxRef.current.close().catch(() => {});
      inputAudioCtxRef.current = null;
    }

    if (outputAudioCtxRef.current) {
      void outputAudioCtxRef.current.close().catch(() => {});
      outputAudioCtxRef.current = null;
    }

    if (wsRef.current) {
      const ws = wsRef.current;
      wsRef.current = null;
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    }

    setVoiceStatus('idle');
    setIsMuted(false);
    setIsModelSpeaking(false);
  }, [stopPlaybackQueue]);

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
    }
  }, [isOpen, initialMode]);

  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    return () => {
      stopVoiceSession();
    };
  }, [stopVoiceSession]);

  useEffect(() => {
    chatScrollRef.current?.scrollTo({
      top: chatScrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages, chatStreaming]);

  useEffect(() => {
    voiceScrollRef.current?.scrollTo({
      top: voiceScrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [voiceTranscripts]);

  const sendChatMessage = useCallback(
    async (rawText: string) => {
      const trimmed = rawText.trim();
      if (!trimmed || chatStreaming) return;

      setChatError(null);
      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        text: trimmed,
      };
      const assistantId = `model-${Date.now() + 1}`;
      const historyPayload = [...messages.filter((m) => m.id !== 'welcome'), userMsg].map(
        (m) => ({
          role: m.role,
          text: m.text,
        })
      );

      setMessages((prev) => [...prev, userMsg, { id: assistantId, role: 'model', text: '' }]);
      setChatInput('');
      setChatStreaming(true);

      try {
        let accumulated = '';

        if (STATIC_MODE) {
          // GitHub Pages ไม่มีเซิร์ฟเวอร์ — คุยกับ Gemini ตรงจากเบราว์เซอร์
          await streamAssistantReply({
            history: historyPayload,
            latestText: trimmed,
            modelMode,
            systemInstruction: buildAssistantSystemInstructionForClient(
              buildClientChatContext(),
              false
            ),
            onDelta: (delta) => {
              accumulated += delta;
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantId ? { ...m, text: accumulated } : m))
              );
            },
          });
        } else {
          const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messages: historyPayload,
              modelMode,
              vehicleContext: buildVehicleContext(),
            }),
          });

          if (!res.ok) {
            const errJson = (await res.json().catch(() => ({}))) as { error?: string };
            throw new Error(errJson.error || `เกิดข้อผิดพลาด (${res.status})`);
          }

          const reader = res.body?.getReader();
          if (!reader) {
            throw new Error('ไม่สามารถอ่านสตรีมข้อมูลจากเซิร์ฟเวอร์ได้');
          }

          const decoder = new TextDecoder();
          let buffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            const events = buffer.split('\n\n');
            buffer = events.pop() ?? '';

            for (const evt of events) {
              for (const line of evt.split('\n')) {
                if (!line.startsWith('data:')) continue;
                const jsonStr = line.slice(5).trim();
                if (!jsonStr) continue;
                const payload = JSON.parse(jsonStr) as {
                  text?: string;
                  done?: boolean;
                  error?: string;
                };
                if (payload.error) {
                  throw new Error(payload.error);
                }
                if (payload.text) {
                  accumulated += payload.text;
                  setMessages((prev) =>
                    prev.map((m) => (m.id === assistantId ? { ...m, text: accumulated } : m))
                  );
                }
              }
            }
          }
        }

        if (!accumulated.trim()) {
          setMessages((prev) => prev.filter((m) => m.id !== assistantId));
          throw new Error('AI ไม่ได้ส่งข้อความตอบกลับ กรุณาลองใหม่อีกครั้ง');
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'เชื่อมต่อผู้ช่วย AI ไม่สำเร็จ';
        setChatError(msg);
        setMessages((prev) =>
          prev.filter((m) => !(m.id === assistantId && m.text.trim() === ''))
        );
      } finally {
        setChatStreaming(false);
      }
    },
    [chatStreaming, messages, modelMode, buildVehicleContext, buildClientChatContext]
  );

  useEffect(() => {
    if (
      isOpen &&
      pendingTripPrompt &&
      handledTripPromptIdRef.current !== pendingTripPrompt.id
    ) {
      handledTripPromptIdRef.current = pendingTripPrompt.id;
      setMode('chat');
      void sendChatMessage(pendingTripPrompt.text);
    }
  }, [isOpen, pendingTripPrompt, sendChatMessage]);

  function play24kPcmChunk(base64Data: string) {
    const ctx = outputAudioCtxRef.current;
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    const float32 = base64Pcm16ToFloat32(base64Data);
    if (float32.length === 0) return;

    const audioBuffer = ctx.createBuffer(1, float32.length, 24000);
    audioBuffer.copyToChannel(new Float32Array(float32), 0);

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);

    const now = ctx.currentTime;
    if (nextStartTimeRef.current < now) {
      nextStartTimeRef.current = now;
    }

    activePlaybackSourcesRef.current.add(source);
    setIsModelSpeaking(true);
    source.onended = () => {
      activePlaybackSourcesRef.current.delete(source);
      if (activePlaybackSourcesRef.current.size === 0) {
        setIsModelSpeaking(false);
      }
    };

    source.start(nextStartTimeRef.current);
    nextStartTimeRef.current += audioBuffer.duration;
  }

  function appendTranscript(role: 'user' | 'model', chunkText: string) {
    if (!chunkText) return;
    setVoiceTranscripts((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.role === role) {
        return [
          ...prev.slice(0, -1),
          { ...last, text: `${last.text}${chunkText}` },
        ];
      }
      return [
        ...prev,
        {
          id: `vt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          role,
          text: chunkText,
        },
      ];
    });
  }

  async function startVoiceSession() {
    if (voiceStatus === 'connecting' || voiceStatus === 'live') return;

    setVoiceError(null);
    setVoiceStatus('connecting');
    liveReadyRef.current = false;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = stream;

      const inputCtx = new AudioContext({ sampleRate: 16000 });
      const outputCtx = new AudioContext({ sampleRate: 24000 });
      if (inputCtx.state === 'suspended') await inputCtx.resume();
      if (outputCtx.state === 'suspended') await outputCtx.resume();

      inputAudioCtxRef.current = inputCtx;
      outputAudioCtxRef.current = outputCtx;
      nextStartTimeRef.current = outputCtx.currentTime;

      const source = inputCtx.createMediaStreamSource(stream);
      const processor = inputCtx.createScriptProcessor(4096, 1, 1);
      sourceNodeRef.current = source;
      processorRef.current = processor;

      source.connect(processor);
      processor.connect(inputCtx.destination);

      // ส่งเสียงไมค์ไปตามช่องทางที่ใช้งานอยู่ (เซสชัน Live ตรง / WebSocket เซิร์ฟเวอร์)
      const sendVoiceAudio = (base64Audio: string) => {
        if (liveSessionRef.current) {
          liveSessionRef.current.sendRealtimeInput({
            audio: { data: base64Audio, mimeType: 'audio/pcm;rate=16000' },
          });
          return;
        }
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'audio', data: base64Audio }));
        }
      };

      processor.onaudioprocess = (event) => {
        if (!liveReadyRef.current || isMutedRef.current) {
          return;
        }
        const channelData = event.inputBuffer.getChannelData(0);
        const pcm16k = downsampleTo16k(channelData, inputCtx.sampleRate);
        const base64Audio = float32ToBase64Pcm16(pcm16k);
        sendVoiceAudio(base64Audio);
      };

      if (STATIC_MODE) {
        // GitHub Pages ไม่มีเซิร์ฟเวอร์ — ต่อ Gemini Live ตรงจากเบราว์เซอร์
        const session = await connectDirectLiveSession({
          systemInstruction: buildAssistantSystemInstructionForClient(
            buildClientChatContext(),
            true
          ),
          callbacks: {
            onOpen: () => {
              liveReadyRef.current = true;
              setVoiceStatus('live');
            },
            onAudio: (data) => play24kPcmChunk(data),
            onInputTranscript: (text) => appendTranscript('user', text),
            onOutputTranscript: (text) => appendTranscript('model', text),
            onInterrupted: () => stopPlaybackQueue(),
            onError: (msg) => {
              setVoiceError(msg);
              stopVoiceSession();
              setVoiceStatus('error');
            },
            onClose: () => {
              if (liveReadyRef.current) {
                stopVoiceSession();
              }
            },
          },
        });
        liveSessionRef.current = session;
        // connect จะ resolve ต่อเมื่อเซสชันพร้อมแล้ว — กันกรณี onOpen เกิดก่อน
        liveReadyRef.current = true;
        setVoiceStatus('live');
        return;
      }

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/api/live`);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: 'setup',
            vehicleContext: buildVehicleContext(),
          })
        );
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as {
            type?: string;
            data?: string;
            text?: string;
            error?: string;
          };
          if (msg.type === 'ready') {
            liveReadyRef.current = true;
            setVoiceStatus('live');
            return;
          }
          if (msg.type === 'audio' && msg.data) {
            play24kPcmChunk(msg.data);
            return;
          }
          if (msg.type === 'inputTranscript' && msg.text) {
            appendTranscript('user', msg.text);
            return;
          }
          if (msg.type === 'outputTranscript' && msg.text) {
            appendTranscript('model', msg.text);
            return;
          }
          if (msg.type === 'interrupted') {
            stopPlaybackQueue();
            return;
          }
          if (msg.type === 'error') {
            setVoiceError(msg.error || 'เกิดข้อผิดพลาดในการสนทนาเสียงสด');
            stopVoiceSession();
            setVoiceStatus('error');
            return;
          }
          if (msg.type === 'closed') {
            stopVoiceSession();
          }
        } catch (err) {
          console.error('Failed to parse live WS payload:', err);
        }
      };

      ws.onerror = () => {
        setVoiceError('ไม่สามารถเชื่อมต่อ WebSocket สำหรับสนทนาเสียงสดได้');
        stopVoiceSession();
        setVoiceStatus('error');
      };

      ws.onclose = () => {
        if (liveReadyRef.current) {
          stopVoiceSession();
        }
      };
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.name === 'NotAllowedError'
            ? 'กรุณาอนุญาตการใช้ไมโครโฟนในเบราว์เซอร์เพื่อเริ่มสนทนาด้วยเสียง'
            : err.message
          : 'ไม่สามารถเปิดใช้งานไมโครโฟนได้';
      setVoiceError(msg);
      stopVoiceSession();
      setVoiceStatus('error');
    }
  }

  function handleChatSubmit(e: FormEvent) {
    e.preventDefault();
    void sendChatMessage(chatInput);
  }

  function handleVoiceTextSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = voiceTextInput.trim();
    if (!trimmed) return;
    if (liveSessionRef.current) {
      liveSessionRef.current.sendRealtimeInput({ text: trimmed });
      appendTranscript('user', trimmed);
      setVoiceTextInput('');
      return;
    }
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: 'text', text: trimmed }));
    appendTranscript('user', trimmed);
    setVoiceTextInput('');
  }

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-950/55 backdrop-blur-[1px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-drawer-title"
        data-testid="ai-assistant-drawer"
        className="w-full max-w-xl bg-white dark:bg-slate-900 h-full border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-slate-900 dark:bg-slate-800 dark:border dark:border-slate-700 text-white flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4 text-blue-300 dark:text-blue-400" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2
                id="ai-drawer-title"
                className="font-display text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100 truncate"
              >
                ผู้ช่วย AI ประจำรถอ้วนพี
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate font-mono tabular-nums">
                ไมล์ {vehicle.currentOdometer.toLocaleString('th-TH')} กม. · เฉลี่ย {fuelStats.avgKml.toFixed(2)} กม./ล.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดหน้าต่างผู้ช่วย AI"
            className="p-2 min-w-[40px] min-h-[40px] inline-flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Mode Switcher */}
        <div className="px-5 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/70 flex items-center justify-between gap-3 shrink-0">
          <div
            role="tablist"
            aria-label="เลือกโหมดผู้ช่วย AI"
            className="grid grid-cols-2 gap-1 p-1 bg-slate-200/75 dark:bg-slate-800 rounded-lg"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'chat'}
              onClick={() => setMode('chat')}
              data-testid="ai-tab-chat"
              className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                mode === 'chat'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-slate-100'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" aria-hidden="true" />
              <span>แชทถาม-ตอบ</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'voice'}
              onClick={() => setMode('voice')}
              data-testid="ai-tab-voice"
              className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                mode === 'voice'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-slate-100'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <AudioLines className="w-3.5 h-3.5" aria-hidden="true" />
              <span>คุยด้วยเสียงสด</span>
            </button>
          </div>

          {mode === 'chat' && (
            <div className="flex items-center gap-2">
              <label htmlFor="ai-model-select" className="sr-only">
                เลือกโหมดความเร็ว AI
              </label>
              <select
                id="ai-model-select"
                value={modelMode}
                onChange={(e) => setModelMode(e.target.value as 'standard' | 'fast')}
                className="min-h-[32px] px-2 py-1 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="standard">Gemini 4 (มาตรฐาน)</option>
                <option value="fast">Flash Lite (ตอบไว)</option>
              </select>
              <button
                type="button"
                onClick={() => {
                  setMessages((prev) => prev.slice(0, 1));
                  setChatError(null);
                }}
                aria-label="ล้างประวัติแชท"
                title="ล้างประวัติแชท"
                className="p-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          )}
        </div>

        {/* Body */}
        {mode === 'chat' ? (
          <>
            <div
              ref={chatScrollRef}
              className="flex-1 overflow-y-auto p-5 space-y-4 bg-slate-50/40 dark:bg-slate-950/60"
            >
              {messages.map((msg) => {
                const isUser = msg.role === 'user';
                return (
                  <div
                    key={msg.id}
                    className={`flex items-start gap-2.5 ${isUser ? 'flex-row-reverse' : ''}`}
                  >
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                        isUser
                          ? 'bg-blue-700 dark:bg-blue-600 text-white'
                          : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      {isUser ? (
                        <UserIcon className="w-3.5 h-3.5" aria-hidden="true" />
                      ) : (
                        <Bot className="w-3.5 h-3.5 text-blue-700 dark:text-blue-400" aria-hidden="true" />
                      )}
                    </div>
                    <div
                      className={`max-w-[84%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                        isUser
                          ? 'bg-blue-700 dark:bg-blue-600 text-white'
                          : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100'
                      }`}
                    >
                      {msg.text || (
                        <span className="inline-flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-400">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                          กำลังพิมพ์คำตอบ...
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}

              {messages.length <= 2 && !chatStreaming && (
                <div className="pt-2 space-y-2">
                  <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">คำถามแนะนำ:</p>
                  <div className="flex flex-col gap-1.5">
                    {QUICK_PROMPTS.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => void sendChatMessage(prompt)}
                        className="text-left px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-950/60 hover:border-blue-200 dark:hover:border-blue-800 text-xs text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {chatError && (
                <div
                  role="alert"
                  className="p-3 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-xs text-red-800 dark:text-red-300"
                >
                  {chatError}
                </div>
              )}
            </div>

            <form
              onSubmit={handleChatSubmit}
              className="p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-end gap-2 shrink-0"
            >
              <label htmlFor="ai-chat-input" className="sr-only">
                พิมพ์คำถามถึงผู้ช่วย AI
              </label>
              <textarea
                id="ai-chat-input"
                rows={2}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void sendChatMessage(chatInput);
                  }
                }}
                placeholder="ถามเรื่องค่าน้ำมัน เส้นทาง รอบเปลี่ยนอะไหล่ หรืออาการรถ..."
                data-testid="ai-chat-input"
                className="flex-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 resize-none focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <button
                type="submit"
                disabled={chatStreaming || !chatInput.trim()}
                data-testid="ai-chat-send-btn"
                className="inline-flex items-center justify-center gap-1.5 min-w-[44px] min-h-[44px] px-4 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white dark:text-slate-900 disabled:opacity-50 text-white text-sm font-medium transition-colors shrink-0 cursor-pointer"
              >
                {chatStreaming ? (
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Send className="w-4 h-4" aria-hidden="true" />
                )}
                <span className="hidden sm:inline">ส่ง</span>
              </button>
            </form>
          </>
        ) : (
          /* Real-Time Voice Live Mode */
          <div className="flex-1 flex flex-col overflow-hidden bg-slate-50/40 dark:bg-slate-950/60">
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4 shrink-0">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <Volume2 className="w-4 h-4 text-blue-700 dark:text-blue-400" aria-hidden="true" />
                    <span>สนทนาด้วยเสียงแบบเรียลไทม์ (Gemini Live)</span>
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    พูดคุยโต้ตอบเรื่องทริป ค่าน้ำมัน และรอบซ่อมบำรุงได้ทันทีโดยไม่ต้องพิมพ์
                  </p>
                </div>

                {voiceStatus === 'live' && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 font-mono shrink-0">
                    <span className="w-2 h-2 rounded-full bg-emerald-600 dark:bg-emerald-400 animate-pulse" />
                    LIVE
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {voiceStatus === 'idle' || voiceStatus === 'error' ? (
                  <button
                    type="button"
                    onClick={() => void startVoiceSession()}
                    data-testid="voice-start-btn"
                    className="inline-flex items-center justify-center gap-2 min-h-[42px] px-5 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 text-white text-sm font-medium transition-colors cursor-pointer"
                  >
                    <Mic className="w-4 h-4" aria-hidden="true" />
                    <span>เริ่มคุยด้วยเสียงสด</span>
                  </button>
                ) : voiceStatus === 'connecting' ? (
                  <button
                    type="button"
                    disabled
                    className="inline-flex items-center justify-center gap-2 min-h-[42px] px-5 py-2 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm font-medium"
                  >
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                    <span>กำลังเชื่อมต่อไมโครโฟนและ Gemini Live...</span>
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setIsMuted((prev) => !prev)}
                      data-testid="voice-mute-btn"
                      className={`inline-flex items-center justify-center gap-1.5 min-h-[42px] px-4 py-2 rounded-lg border text-sm font-medium transition-colors cursor-pointer ${
                        isMuted
                          ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-200'
                          : 'border-slate-300 bg-white hover:bg-slate-50 text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-100'
                      }`}
                    >
                      {isMuted ? (
                        <>
                          <MicOff className="w-4 h-4 text-amber-700 dark:text-amber-400" aria-hidden="true" />
                          <span>เปิดไมค์</span>
                        </>
                      ) : (
                        <>
                          <Mic className="w-4 h-4 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
                          <span>{isModelSpeaking ? 'กำลังตอบ (พูดแทรกได้)' : 'กำลังฟัง...'}</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={stopVoiceSession}
                      data-testid="voice-stop-btn"
                      className="inline-flex items-center justify-center gap-1.5 min-h-[42px] px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors cursor-pointer"
                    >
                      <PhoneOff className="w-4 h-4" aria-hidden="true" />
                      <span>วางสาย</span>
                    </button>
                  </>
                )}
              </div>

              {voiceError && (
                <div
                  role="alert"
                  className="p-3 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-xs text-red-800 dark:text-red-300"
                >
                  {voiceError}
                </div>
              )}
            </div>

            {/* Live Transcript Feed */}
            <div ref={voiceScrollRef} className="flex-1 overflow-y-auto p-5 space-y-3">
              {voiceTranscripts.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center px-6 py-8 text-slate-500 dark:text-slate-400 space-y-2">
                  <AudioLines className="w-8 h-8 text-slate-400 dark:text-slate-500" aria-hidden="true" />
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    พร้อมสนทนาเรื่องรถอ้วนพีด้วยเสียง
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm">
                    กดปุ่ม &ldquo;เริ่มคุยด้วยเสียงสด&rdquo; แล้วพูดถามได้เลย เช่น &ldquo;ถ้าจะขับไปเชียงใหม่ น้ำมันในถังพอไหม&rdquo; หรือ &ldquo;ใกล้ถึงรอบเปลี่ยนน้ำมันเครื่องหรือยัง&rdquo;
                  </p>
                </div>
              ) : (
                voiceTranscripts.map((item) => (
                  <div
                    key={item.id}
                    className={`rounded-xl px-3.5 py-2.5 text-sm leading-relaxed border ${
                      item.role === 'user'
                        ? 'bg-blue-50 border-blue-200 text-blue-950 dark:bg-blue-950/50 dark:border-blue-800 dark:text-blue-100 ml-8'
                        : 'bg-white border-slate-200 text-slate-800 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 mr-8'
                    }`}
                  >
                    <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-0.5">
                      {item.role === 'user' ? 'คุณ' : 'ผู้ช่วย AI'}
                    </p>
                    <p className="whitespace-pre-wrap">{item.text}</p>
                  </div>
                ))
              )}
            </div>

            {voiceStatus === 'live' && (
              <form
                onSubmit={handleVoiceTextSubmit}
                className="p-3.5 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-2 shrink-0"
              >
                <label htmlFor="voice-text-prompt" className="sr-only">
                  ส่งข้อความแทรกในสายเสียงสด
                </label>
                <input
                  id="voice-text-prompt"
                  type="text"
                  value={voiceTextInput}
                  onChange={(e) => setVoiceTextInput(e.target.value)}
                  placeholder="หรือพิมพ์ข้อความแทรกให้ AI อ่านตอบเป็นเสียง..."
                  className="flex-1 min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
                <button
                  type="submit"
                  disabled={!voiceTextInput.trim()}
                  className="min-h-[38px] px-3.5 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white dark:text-slate-900 disabled:opacity-50 text-white text-xs font-medium cursor-pointer"
                >
                  ส่ง
                </button>
              </form>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
