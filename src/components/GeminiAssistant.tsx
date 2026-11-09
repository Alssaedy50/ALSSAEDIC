import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  CheckCircle2,
  Copy,
  Crown,
  ExternalLink,
  Eye,
  EyeOff,
  Globe,
  ImagePlus,
  Key,
  Loader2,
  Lock,
  Mic,
  MicOff,
  PhoneCall,
  Radio,
  RefreshCw,
  Send,
  SlidersHorizontal,
  Sparkles,
  Square,
  Trash2,
  Unlock,
  User,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  AIProviderConfig,
  ChatMessage,
  ClinicSettings,
  ClinicSubscription,
  CurrencyFinancialSummary,
  ExpenseRecord,
  InventoryItem,
  ReceiptRecord,
} from '../types/clinic';
import { isPlatformDeveloperUser } from '../data/defaultData';
import { auth } from '../firebase';
import {
  GEMINI_CANDIDATE_MODELS,
  GROQ_TEXT_MODELS,
  GROQ_VISION_MODELS,
  GROQ_WHISPER_MODELS,
  OPENROUTER_MODELS,
  formatModelDisplayLabel,
  loadAIProviderConfig,
  saveAIProviderConfig,
  queryClinicAssistantDetailed,
  transcribeAudioWithGroqWhisper,
} from '../utils/aiClient';
import {
  buildCleanSpeechTranscript,
  deduplicateSpeechText,
} from '../utils/speechTranscript';

interface GeminiAssistantProps {
  settings: ClinicSettings;
  receipts: ReceiptRecord[];
  inventory: InventoryItem[];
  expenses: ExpenseRecord[];
  messages: ChatMessage[];
  onAddMessage: (msg: ChatMessage) => void;
  onClearMessages: () => void;
  onExitFullScreen?: () => void;
  onOpenMenu?: () => void;
  onOpenSettings?: (tab?: 'subscription' | 'ai') => void;
  onUpdateSubscription?: (sub: ClinicSubscription) => void;
  notify: (message: string, type?: 'success' | 'warning' | 'error' | 'info') => void;
}

const QUICK_PROMPTS = [
  'كشف ديون المرضى بالتفصيل',
  'تقرير نواقص المخزون',
  'ملخص صافي الأرباح والمصروفات',
  'وصفة مضاد حيوي ومسكن لخراج سني',
  'تعليمات للمريض بعد خلع الضرس',
  'خطة علاج عصب للسن 16',
  'بروتوكول تحضير وإلصاق الزيركون',
];

export const GeminiAssistant: React.FC<GeminiAssistantProps> = ({
  settings,
  receipts,
  inventory,
  expenses,
  messages,
  onAddMessage,
  onClearMessages,
  onOpenSettings,
  onUpdateSubscription,
  notify,
}) => {
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isRecordingGroq, setIsRecordingGroq] = useState(false);
  const [isTranscribingGroq, setIsTranscribingGroq] = useState(false);
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);
  const [isAiSettingsModalOpen, setIsAiSettingsModalOpen] = useState(false);
  const [aiConfig, setAiConfig] = useState<AIProviderConfig>(() =>
    settings.aiConfig ? settings.aiConfig : loadAIProviderConfig()
  );
  const [attachment, setAttachment] = useState<{
    name: string;
    mimeType: string;
    base64Data: string;
  } | null>(null);

  useEffect(() => {
    if (settings.aiConfig) {
      setAiConfig(settings.aiConfig);
      saveAIProviderConfig(settings.aiConfig);
    }
  }, [settings.aiConfig]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const recognitionRef = useRef<{ start: () => void; stop: () => void } | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const activeAudioStreamRef = useRef<MediaStream | null>(null);
  const shouldKeepListeningRef = useRef<boolean>(false);
  const accumulatedTranscriptRef = useRef<string>('');
  const currentSessionFinalRef = useRef<string>('');
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const userInitiatedAbortRef = useRef<boolean>(false);

  useEffect(() => {
    return () => {
      shouldKeepListeningRef.current = false;
      try {
        recognitionRef.current?.stop();
      } catch {
        // Ignore
      }
      try {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
        }
      } catch {
        // Ignore
      }
      if (activeAudioStreamRef.current) {
        activeAudioStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const currencySummaries = useMemo<CurrencyFinancialSummary[]>(() => {
    const defaultCur = String(settings.identity.defaultCurrency || 'ريال يمني');
    const map = new Map<string, CurrencyFinancialSummary>();

    const ensureBucket = (curr: string) => {
      const key = curr || defaultCur;
      if (!map.has(key)) {
        map.set(key, {
          currency: key,
          totalBilledAmount: 0,
          totalCollectedRevenue: 0,
          totalPendingDebts: 0,
          totalExpenses: 0,
          netCashProfit: 0,
          receiptsCount: 0,
          debtorsCount: 0,
        });
      }
      return map.get(key)!;
    };

    ensureBucket(defaultCur);

    receipts.forEach((r) => {
      const row = ensureBucket(String(r.currency || defaultCur));
      row.totalBilledAmount += Number(r.totalAmount) || 0;
      row.totalCollectedRevenue += Number(r.paidAmount) || 0;
      row.totalPendingDebts += Number(r.remainingAmount) || 0;
      row.receiptsCount += 1;
      if ((Number(r.remainingAmount) || 0) > 0) {
        row.debtorsCount += 1;
      }
    });

    expenses.forEach((e) => {
      const row = ensureBucket(String(e.currency || defaultCur));
      row.totalExpenses += Number(e.amount) || 0;
    });

    return Array.from(map.values()).map((item) => ({
      ...item,
      netCashProfit: item.totalCollectedRevenue - item.totalExpenses,
    }));
  }, [receipts, expenses, settings.identity.defaultCurrency]);

  useEffect(() => {
    const el = messagesContainerRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, isSending]);

  const optimizeImageFile = (
    file: File
  ): Promise<{ base64Data: string; mimeType: string }> => {
    return new Promise((resolve) => {
      if (!file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = () =>
          resolve({
            base64Data: String(reader.result || ''),
            mimeType: file.type || 'application/pdf',
          });
        reader.onerror = () =>
          resolve({ base64Data: '', mimeType: file.type || 'application/octet-stream' });
        reader.readAsDataURL(file);
        return;
      }

      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const maxDim = 1200;
        let width = img.width;
        let height = img.height;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          const reader = new FileReader();
          reader.onload = () =>
            resolve({ base64Data: String(reader.result || ''), mimeType: 'image/jpeg' });
          reader.readAsDataURL(file);
          return;
        }
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        const optimized = canvas.toDataURL('image/jpeg', 0.85);
        resolve({ base64Data: optimized, mimeType: 'image/jpeg' });
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        const reader = new FileReader();
        reader.onload = () =>
          resolve({ base64Data: String(reader.result || ''), mimeType: file.type || 'image/jpeg' });
        reader.readAsDataURL(file);
      };
      img.src = url;
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const { base64Data, mimeType } = await optimizeImageFile(file);
      if (base64Data) {
        setAttachment({
          name: file.name,
          mimeType,
          base64Data,
        });
      }
    } catch {
      notify('تعذر تحميل الملف المرفق', 'warning');
    }
  };

  const toggleSpeakText = (msgId: string, text: string) => {
    if (!('speechSynthesis' in window)) {
      notify('المتصفح لا يدعم القراءة الصوتية', 'warning');
      return;
    }
    if (speakingMsgId === msgId) {
      window.speechSynthesis.cancel();
      setSpeakingMsgId(null);
      return;
    }
    window.speechSynthesis.cancel();
    const cleanText = text.replace(/[*#_`-]/g, ' ').replace(/\s+/g, ' ').trim();
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'ar-SA';
    utterance.onend = () => setSpeakingMsgId(null);
    utterance.onerror = () => setSpeakingMsgId(null);
    setSpeakingMsgId(msgId);
    window.speechSynthesis.speak(utterance);
  };

  const copyMessageText = (text: string) => {
    navigator.clipboard
      ?.writeText(text)
      .then(() => notify('تم نسخ الرد للحافظة', 'success'))
      .catch(() => {});
  };

  const stopVoiceInput = () => {
    shouldKeepListeningRef.current = false;
    setIsListening(false);
    try {
      recognitionRef.current?.stop();
    } catch {
      // Ignore
    }
  };

  const stopGroqRecording = () => {
    setIsRecordingGroq(false);
    try {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    } catch {
      // Ignore
    }
    if (activeAudioStreamRef.current) {
      activeAudioStreamRef.current.getTracks().forEach((track) => track.stop());
      activeAudioStreamRef.current = null;
    }
  };

  const startGroqRecording = async () => {
    if (!navigator?.mediaDevices?.getUserMedia) {
      notify('المتصفح لا يدعم تسجيل الصوت عبر المايكروفون', 'warning');
      toggleBrowserVoiceInput();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      activeAudioStreamRef.current = stream;
      audioChunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : '';

      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        if (activeAudioStreamRef.current) {
          activeAudioStreamRef.current.getTracks().forEach((t) => t.stop());
          activeAudioStreamRef.current = null;
        }

        const recordedBlob = new Blob(audioChunksRef.current, {
          type: mimeType || 'audio/webm',
        });

        if (recordedBlob.size > 1500) {
          setIsTranscribingGroq(true);
          try {
            const transcript = await transcribeAudioWithGroqWhisper(
              recordedBlob,
              aiConfig.groqApiKey,
              aiConfig.groqWhisperModel
            );
            if (transcript && transcript.trim()) {
              setInput((prev) =>
                prev ? `${prev.trim()} ${transcript.trim()}` : transcript.trim()
              );
              notify('تم تفريغ الصوت بنجاح عبر Groq Whisper', 'success');
            }
          } catch (err: unknown) {
            notify(
              err instanceof Error
                ? `تعذر تفريغ الصوت: ${err.message}`
                : 'تعذر الاتصال بمحرك تفريغ الصوت.',
              'warning'
            );
          } finally {
            setIsTranscribingGroq(false);
          }
        }
      };

      recorder.start(250);
      setIsRecordingGroq(true);
    } catch {
      setIsRecordingGroq(false);
      notify('يرجى السماح بصلاحية المايكروفون في المتصفح', 'warning');
    }
  };

  const toggleBrowserVoiceInput = () => {
    if (isListening || shouldKeepListeningRef.current) {
      stopVoiceInput();
      return;
    }

    const SpeechRec =
      (
        window as unknown as {
          SpeechRecognition?: new () => unknown;
          webkitSpeechRecognition?: new () => unknown;
        }
      ).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => unknown })
        .webkitSpeechRecognition;

    if (!SpeechRec) {
      notify('المتصفح لا يدعم الإملاء الصوتي المباشر', 'warning');
      return;
    }

    try {
      try {
        recognitionRef.current?.stop();
      } catch {
        // Ignore
      }

      const rec = new SpeechRec() as {
        lang: string;
        continuous: boolean;
        interimResults: boolean;
        maxAlternatives?: number;
        onresult:
          | ((e: {
              resultIndex?: number;
              results: ArrayLike<{
                isFinal?: boolean;
                0: { transcript: string };
              }>;
            }) => void)
          | null;
        onerror: ((e: { error?: string }) => void) | null;
        onend: (() => void) | null;
        start: () => void;
        stop: () => void;
      };

      const isMobileBrowser =
        typeof navigator !== 'undefined' &&
        /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

      rec.lang = 'ar-SA';
      rec.continuous = !isMobileBrowser;
      rec.interimResults = true;
      rec.maxAlternatives = 1;

      const initialBase = deduplicateSpeechText(input.trim());
      accumulatedTranscriptRef.current = initialBase;
      currentSessionFinalRef.current = '';
      shouldKeepListeningRef.current = true;

      rec.onresult = (event) => {
        const cleanTranscript = buildCleanSpeechTranscript(initialBase, event.results);
        if (cleanTranscript) {
          currentSessionFinalRef.current = cleanTranscript;
          setInput(cleanTranscript);
        }
      };

      rec.onerror = (event) => {
        const errCode = String(event?.error || '');
        if (errCode === 'not-allowed' || errCode === 'service-not-allowed') {
          shouldKeepListeningRef.current = false;
          setIsListening(false);
          notify('يرجى السماح بصلاحية المايكروفون في المتصفح', 'warning');
        }
      };

      rec.onend = () => {
        shouldKeepListeningRef.current = false;
        setIsListening(false);
        setInput((prev) => deduplicateSpeechText(prev));
      };

      recognitionRef.current = rec;
      setIsListening(true);
      rec.start();
    } catch {
      shouldKeepListeningRef.current = false;
      setIsListening(false);
    }
  };

  const handleMicButtonClick = () => {
    // If Groq Whisper is chosen and API key is entered, use Groq Whisper recording pipeline
    if (aiConfig.sttEngine === 'groq' && aiConfig.groqApiKey.trim()) {
      if (isRecordingGroq) {
        stopGroqRecording();
      } else {
        if (isListening) stopVoiceInput();
        startGroqRecording();
      }
      return;
    }

    // Otherwise use browser Web Speech API
    if (isRecordingGroq) stopGroqRecording();
    toggleBrowserVoiceInput();
  };

  const handleStopResponse = () => {
    userInitiatedAbortRef.current = true;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsSending(false);
  };

  const sendMessage = async (textOverride?: string) => {
    if (isListening || shouldKeepListeningRef.current) {
      stopVoiceInput();
    }
    const promptText = (textOverride ?? input).trim();
    if (!promptText && !attachment) return;

    userInitiatedAbortRef.current = false;

    const userMsg: ChatMessage = {
      id: 'msg_u_' + Date.now(),
      role: 'user',
      text: promptText || `تحليل المرفق: ${attachment?.name}`,
      timestamp: new Date().toLocaleTimeString('ar-YE', { hour: '2-digit', minute: '2-digit' }),
      attachmentName: attachment?.name,
      attachmentPreview: attachment?.mimeType.startsWith('image/')
        ? attachment.base64Data
        : undefined,
    };

    onAddMessage(userMsg);
    setInput('');
    const sentAttachment = attachment;
    setAttachment(null);
    setIsSending(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const debtors = receipts.filter((r) => (Number(r.remainingAmount) || 0) > 0);
      const lowStock = inventory.filter((i) => Number(i.qty) <= Number(i.minQty));

      const clinicContext = {
        identity: settings.identity,
        servicesCatalog: settings.services,
        currencySummaries,
        financialSummary: {
          totalReceipts: receipts.length,
          totalDebtors: debtors.length,
          byCurrency: currencySummaries,
        },
        // Complete datasets so reports are 100% accurate across all history
        allReceipts: receipts.map((r) => ({
          receiptNo: r.receiptNo,
          date: r.date,
          patientName: r.patientName,
          patientPhone: r.patientPhone,
          services: r.services,
          toothFDI: r.toothFDI,
          totalAmount: r.totalAmount,
          paidAmount: r.paidAmount,
          remainingAmount: r.remainingAmount,
          currency: r.currency,
          paymentMethod: r.paymentMethod,
          notes: r.notes,
        })),
        pendingDebtsPatients: debtors.map((r) => ({
          receiptNo: r.receiptNo,
          patientName: r.patientName,
          phone: r.patientPhone,
          remainingAmount: r.remainingAmount,
          currency: r.currency,
          date: r.date,
        })),
        allInventory: inventory.map((i) => ({
          name: i.name,
          qty: i.qty,
          minQty: i.minQty,
          unit: i.unit,
          unitPrice: i.unitPrice,
          totalCost: i.totalCost,
          linkedService: i.linkedService,
        })),
        lowStockAlerts: lowStock,
        allExpenses: expenses.map((e) => ({
          title: e.title,
          amount: e.amount,
          currency: e.currency,
          category: e.category,
          date: e.date,
        })),
        // Aliases for compatibility
        recentReceipts: receipts,
        inventoryStatus: inventory,
        recentExpenses: expenses,
      };

      const assistantResult = await queryClinicAssistantDetailed(
        {
          prompt: userMsg.text,
          clinicContext,
          history: messages.slice(-6).map((m) => ({ role: m.role, text: m.text })),
          attachment: sentAttachment,
          taskType: 'chat',
        },
        controller.signal
      );

      if (userInitiatedAbortRef.current || controller.signal.aborted) {
        return;
      }

      const assistantMsg: ChatMessage = {
        id: 'msg_a_' + Date.now(),
        role: 'assistant',
        text: assistantResult.reply || 'تمت المعالجة.',
        timestamp: new Date().toLocaleTimeString('ar-YE', { hour: '2-digit', minute: '2-digit' }),
        modelUsed: assistantResult.modelLabel,
        providerUsed: assistantResult.providerUsed,
        isFallbackApplied: assistantResult.isFallbackApplied,
        webSources: assistantResult.webSources,
      };
      onAddMessage(assistantMsg);
    } catch (err: unknown) {
      if (userInitiatedAbortRef.current) {
        const stoppedMsg: ChatMessage = {
          id: 'msg_stopped_' + Date.now(),
          role: 'assistant',
          text: '⏹️ تم إيقاف توليد الرد بناءً على رغبتك.',
          timestamp: new Date().toLocaleTimeString('ar-YE', { hour: '2-digit', minute: '2-digit' }),
        };
        onAddMessage(stoppedMsg);
        return;
      }

      const errMsg: ChatMessage = {
        id: 'msg_err_' + Date.now(),
        role: 'assistant',
        text: err instanceof Error ? `تعذر إكمال التحليل: ${err.message}` : 'تعذر الاتصال بخادم التحليل.',
        timestamp: new Date().toLocaleTimeString('ar-YE', { hour: '2-digit', minute: '2-digit' }),
      };
      onAddMessage(errMsg);
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      setIsSending(false);
      userInitiatedAbortRef.current = false;
    }
  };

  const renderFormattedMessageText = (rawText: string, isUser: boolean) => {
    const lines = String(rawText || '').split('\n');
    const englishParenRegex = /\(([A-Za-z0-9][^()\u0600-\u06FF]*)\)/g;

    return lines.map((line, lineIdx) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return <div key={lineIdx} className="h-2" />;
      }

      const parts: React.ReactNode[] = [];
      let lastIdx = 0;
      let match: RegExpExecArray | null;

      while ((match = englishParenRegex.exec(line)) !== null) {
        if (match.index > lastIdx) {
          parts.push(line.slice(lastIdx, match.index));
        }
        const term = match[1].trim();
        parts.push(
          <span
            key={`${lineIdx}_${match.index}`}
            dir="ltr"
            className={`inline-block px-1.5 py-0.5 mx-0.5 rounded-md font-mono text-[11px] font-bold leading-tight align-baseline ${
              isUser
                ? 'bg-white/20 text-white'
                : 'bg-sky-500/10 border border-sky-500/20 text-sky-700 dark:text-sky-300'
            }`}
          >
            {term}
          </span>
        );
        lastIdx = match.index + match[0].length;
      }

      if (lastIdx < line.length) {
        parts.push(line.slice(lastIdx));
      }

      return (
        <p key={lineIdx} className="leading-relaxed break-words">
          {parts.length > 0 ? parts : line}
        </p>
      );
    });
  };

  const isPlatformDev = isPlatformDeveloperUser(auth.currentUser?.email);

  return (
    <div className="flex-1 min-h-0 w-full h-full sm:rounded-2xl border-0 sm:border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col overflow-hidden sm:shadow-xs">
      {/* Quick Prompts Strip + Clear Chat Action + Developer-Only Quick AI Settings Button */}
      <div className="shrink-0 px-3 sm:px-4 py-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/60 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        {isPlatformDev && onOpenSettings && (
          <button
            type="button"
            onClick={() => onOpenSettings('ai')}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-xl transition-colors whitespace-nowrap"
          >
            <Crown className="w-3.5 h-3.5 shrink-0" />
            <span>مفاتيح الذكاء</span>
          </button>
        )}

        {messages.length > 0 && (
          <button
            type="button"
            onClick={onClearMessages}
            className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-rose-600 dark:text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 rounded-xl transition-colors whitespace-nowrap"
          >
            <Trash2 className="w-3.5 h-3.5 shrink-0" />
            <span>مسح</span>
          </button>
        )}
        {QUICK_PROMPTS.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => sendMessage(q)}
            disabled={isSending}
            className="shrink-0 px-3 py-1.5 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:border-sky-500 hover:text-sky-600 dark:hover:text-sky-400 transition-colors whitespace-nowrap"
          >
            {q}
          </button>
        ))}
      </div>

      {/* Scrollable Messages Area */}
      <div
        ref={messagesContainerRef}
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain px-3 sm:px-5 py-3"
      >
        <div className="max-w-4xl mx-auto min-h-full flex flex-col">
          {messages.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-2.5 px-4">
              <div className="w-12 h-12 rounded-2xl bg-sky-500/10 border border-sky-500/30 text-sky-600 dark:text-sky-400 flex items-center justify-center shadow-xs">
                <Bot className="w-6 h-6" />
              </div>
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
                اختر استفساراً سريعاً من الأعلى أو اكتب سؤالك أدناه.
              </p>
            </div>
          ) : (
            <div className="space-y-3 pb-2">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex items-start gap-2.5 ${
                    msg.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  <div
                    className={`hidden sm:flex w-8 h-8 rounded-xl items-center justify-center shrink-0 ${
                      msg.role === 'user'
                        ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 order-2'
                        : 'bg-sky-600 text-white'
                    }`}
                  >
                    {msg.role === 'user' ? (
                      <User className="w-4 h-4" />
                    ) : (
                      <Bot className="w-4 h-4" />
                    )}
                  </div>

                  <div
                    className={`w-full sm:w-auto sm:max-w-[84%] rounded-2xl p-3.5 sm:p-4 text-xs sm:text-sm space-y-2 break-words shadow-2xs ${
                      msg.role === 'user'
                        ? 'bg-sky-600 text-white'
                        : 'bg-slate-50 dark:bg-slate-950/90 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100'
                    }`}
                  >
                    {/* Mobile compact sender header */}
                    <div
                      className={`flex sm:hidden items-center gap-1.5 pb-1 border-b text-[11px] font-bold ${
                        msg.role === 'user'
                          ? 'border-white/20 text-white/90'
                          : 'border-slate-200 dark:border-slate-800 text-sky-600 dark:text-sky-400'
                      }`}
                    >
                      {msg.role === 'user' ? (
                        <User className="w-3.5 h-3.5 shrink-0" />
                      ) : (
                        <Bot className="w-3.5 h-3.5 shrink-0" />
                      )}
                      <span>{msg.role === 'user' ? 'أنت' : 'المساعد'}</span>
                    </div>

                    {msg.attachmentPreview && (
                      <img
                        src={msg.attachmentPreview}
                        alt="مرفق"
                        className="max-h-56 rounded-xl border border-slate-300 dark:border-slate-700 object-contain"
                      />
                    )}

                    <div className="space-y-1.5">
                      {renderFormattedMessageText(msg.text, msg.role === 'user')}
                    </div>

                    {/* Web Search Grounding Source Citations */}
                    {msg.webSources && msg.webSources.length > 0 && (
                      <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-1.5">
                        <div className="text-[10px] font-bold text-sky-700 dark:text-sky-300 flex items-center gap-1">
                          <Globe className="w-3 h-3 shrink-0" />
                          <span>المصادر والمراجع السريرية عبر الويب:</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {msg.webSources.map((source, sIdx) => (
                            <a
                              key={sIdx}
                              href={source.uri}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-500/10 hover:bg-sky-500/20 text-sky-700 dark:text-sky-300 text-[10px] font-medium border border-sky-500/20 max-w-xs truncate transition-colors"
                              title={source.uri}
                            >
                              <span className="truncate">{source.title || source.uri}</span>
                              <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    <div
                      className={`flex items-center justify-between gap-3 pt-1.5 border-t text-[10px] ${
                        msg.role === 'user'
                          ? 'border-white/20 text-white/80'
                          : 'border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 min-w-0 truncate">
                        <span className="font-mono tabular-nums shrink-0">{msg.timestamp}</span>
                        {msg.role === 'assistant' && msg.modelUsed && (
                          <>
                            <span aria-hidden="true" className="shrink-0">
                              ·
                            </span>
                            <span
                              dir="ltr"
                              className="font-mono font-semibold text-sky-600 dark:text-sky-400 truncate"
                            >
                              {msg.modelUsed}
                            </span>
                            {msg.isFallbackApplied && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-300 font-bold text-[9px] shrink-0">
                                تبديل تلقائي
                              </span>
                            )}
                          </>
                        )}
                      </div>
                      {msg.role === 'assistant' && (
                        <div className="flex items-center gap-3 shrink-0">
                          <button
                            type="button"
                            onClick={() => copyMessageText(msg.text)}
                            className="inline-flex items-center gap-1 hover:text-sky-500 font-bold whitespace-nowrap shrink-0"
                          >
                            <Copy className="w-3 h-3" />
                            <span>نسخ</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleSpeakText(msg.id, msg.text)}
                            className={`inline-flex items-center gap-1 font-bold whitespace-nowrap shrink-0 transition-colors ${
                              speakingMsgId === msg.id
                                ? 'text-rose-500 hover:text-rose-600 animate-pulse'
                                : 'hover:text-sky-500'
                            }`}
                          >
                            {speakingMsgId === msg.id ? (
                              <>
                                <VolumeX className="w-3 h-3" />
                                <span>إيقاف</span>
                              </>
                            ) : (
                              <>
                                <Volume2 className="w-3 h-3" />
                                <span>استماع</span>
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {isSending && (
            <div className="flex items-center gap-2 text-sky-600 dark:text-sky-400 py-1.5 px-3">
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
            </div>
          )}
        </div>
      </div>

      {/* Attachment Preview Bar */}
      {attachment && (
        <div className="shrink-0 px-4 py-2 bg-sky-50 dark:bg-sky-950/60 border-t border-sky-200 dark:border-sky-900 flex items-center justify-between text-xs">
          <span className="font-bold text-sky-800 dark:text-sky-300 truncate">
            مرفق: {attachment.name}
          </span>
          <button
            type="button"
            onClick={() => setAttachment(null)}
            className="p-1 text-slate-500 hover:text-rose-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Transcribing Groq Audio Feedback Banner */}
      {isTranscribingGroq && (
        <div className="shrink-0 px-4 py-2 bg-amber-500/10 border-t border-amber-500/20 flex items-center gap-2 text-xs font-bold text-amber-700 dark:text-amber-300">
          <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
          <span>جارٍ تفريغ الصوت...</span>
        </div>
      )}

      {/* Bottom Composer Bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          sendMessage();
        }}
        className="shrink-0 px-2.5 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] sm:px-5 sm:py-2.5 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
      >
        <div className="max-w-4xl mx-auto flex items-center gap-1.5 sm:gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            onChange={handleFileChange}
            className="hidden"
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 hover:border-sky-500 shrink-0 transition-colors"
            title="إرفاق صورة أشعة أو ملف"
          >
            <ImagePlus className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={handleMicButtonClick}
            disabled={isTranscribingGroq}
            className={`w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-xl border shrink-0 transition-colors ${
              isListening || isRecordingGroq
                ? 'bg-rose-600 border-rose-500 text-white animate-pulse'
                : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 hover:border-sky-500'
            }`}
            title={
              aiConfig.sttEngine === 'groq' && aiConfig.groqApiKey.trim()
                ? 'تسجيل صوتي وتفريغ عبر Groq Whisper'
                : 'إملاء صوتي مباشر'
            }
          >
            {isListening || isRecordingGroq ? (
              <MicOff className="w-4 h-4" />
            ) : (
              <Mic className="w-4 h-4" />
            )}
          </button>

          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              isRecordingGroq
                ? 'جارٍ التسجيل الصوتي... اضغط المايكروفون للإيقاف'
                : 'اكتب سؤالك الطبي أو المالي...'
            }
            className="flex-1 min-w-0 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs sm:text-sm font-medium text-slate-900 dark:text-slate-100 focus:border-sky-500 focus:outline-none"
          />

          {isSending ? (
            <button
              type="button"
              onClick={handleStopResponse}
              aria-label="إيقاف"
              title="إيقاف"
              className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center text-white bg-rose-600 hover:bg-rose-500 rounded-xl shrink-0 transition-colors shadow-xs"
            >
              <Square className="w-4 h-4 fill-current" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim() && !attachment}
              aria-label="إرسال"
              title="إرسال"
              className="w-9 h-9 sm:w-10 sm:h-10 inline-flex items-center justify-center text-white bg-sky-600 hover:bg-sky-500 disabled:opacity-50 rounded-xl shrink-0 transition-colors shadow-xs"
            >
              <Send className="w-4 h-4" />
            </button>
          )}
        </div>
      </form>
    </div>
  );
};
