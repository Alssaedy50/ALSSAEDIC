import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bookmark,
  Bot,
  Check,
  CheckCircle2,
  Copy,
  Crown,
  ExternalLink,
  FilePlus2,
  FileText,
  Globe,
  History,
  ImagePlus,
  Loader2,
  Maximize2,
  MessageSquarePlus,
  Mic,
  MicOff,
  PackagePlus,
  Palette,
  PanelRightOpen,
  Save,
  Send,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Square,
  Trash2,
  Type,
  User,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  AIProviderConfig,
  ChatAppearanceSettings,
  ChatMessage,
  ChatSession,
  ClinicSettings,
  ClinicSubscription,
  CurrencyFinancialSummary,
  ExpenseRecord,
  InventoryItem,
  PendingDataEntryProposal,
  PendingInventoryEntryData,
  PendingReceiptEntryData,
  ReceiptRecord,
} from '../types/clinic';
import { isPlatformDeveloperUser } from '../data/defaultData';
import { auth } from '../firebase';
import {
  findMatchingPatientAccount,
  isDestructiveSystemIntent,
  isDirectDataEntryIntent,
  loadAIProviderConfig,
  parseDirectDataEntryProposal,
  queryClinicAssistantDetailed,
  saveAIProviderConfig,
  speakTextWithAIModel,
  stopActiveAISpeech,
  transcribeAudioWithGroqWhisper,
} from '../utils/aiClient';
import {
  deduplicateSpeechText,
  extractSessionSpeechTranscript,
  mergeTranscriptSegments,
} from '../utils/speechTranscript';

interface GeminiAssistantProps {
  settings: ClinicSettings;
  receipts: ReceiptRecord[];
  inventory: InventoryItem[];
  expenses: ExpenseRecord[];
  messages: ChatMessage[];
  onSetMessages?: (msgs: ChatMessage[]) => void;
  onAddMessage: (msg: ChatMessage) => void;
  onClearMessages: () => void;
  onExitFullScreen?: () => void;
  onOpenMenu?: () => void;
  onOpenSettings?: (tab?: 'subscription' | 'ai') => void;
  onUpdateSubscription?: (sub: ClinicSubscription) => void;
  onApproveReceiptEntry?: (data: PendingReceiptEntryData) => ReceiptRecord | void;
  onApproveInventoryEntry?: (data: PendingInventoryEntryData) => void;
  notify: (message: string, type?: 'success' | 'warning' | 'error' | 'info') => void;
}

const CHAT_SESSIONS_STORAGE_KEY = 'docai_chat_sessions_v1';
const CHAT_APPEARANCE_STORAGE_KEY = 'docai_chat_appearance_v1';

const DEFAULT_CHAT_APPEARANCE: ChatAppearanceSettings = {
  fontFamily: 'Tajawal',
  fontSize: 'base',
  accentColor: 'sky',
  maxMessagesPerSession: 30,
  allowAiReceiptEntry: true,
  allowAiInventoryEntry: true,
  strictCatalogValidation: true,
};

const QUICK_PROMPTS = [
  'كشف ديون المرضى بالتفصيل',
  'تقرير نواقص المخزون',
  'ملخص صافي الأرباح والمصروفات',
  'سجل سند قبض للمريض أحمد بمبلغ 15000 علاج عصب',
  'أضف للمخزون 10 علب بنج بسعر 4500 للعلبة',
  'وصفة مضاد حيوي ومسكن لخراج سني',
  'تعليمات للمريض بعد خلع الضرس',
];

const ACCENT_THEME_MAP: Record<
  ChatAppearanceSettings['accentColor'],
  {
    userBubble: string;
    botAvatar: string;
    badge: string;
    borderHover: string;
    sendBtn: string;
    label: string;
    swatch: string;
  }
> = {
  sky: {
    userBubble: 'bg-sky-600 text-white',
    botAvatar: 'bg-sky-600 text-white',
    badge: 'bg-sky-500/10 border-sky-500/20 text-sky-700 dark:text-sky-300',
    borderHover: 'hover:border-sky-500 hover:text-sky-600 dark:hover:text-sky-400',
    sendBtn: 'bg-sky-600 hover:bg-sky-500',
    label: 'أزرق طبي',
    swatch: 'bg-sky-600',
  },
  emerald: {
    userBubble: 'bg-emerald-600 text-white',
    botAvatar: 'bg-emerald-600 text-white',
    badge: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-300',
    borderHover: 'hover:border-emerald-500 hover:text-emerald-600 dark:hover:text-emerald-400',
    sendBtn: 'bg-emerald-600 hover:bg-emerald-500',
    label: 'زمردي',
    swatch: 'bg-emerald-600',
  },
  indigo: {
    userBubble: 'bg-indigo-600 text-white',
    botAvatar: 'bg-indigo-600 text-white',
    badge: 'bg-indigo-500/10 border-indigo-500/20 text-indigo-700 dark:text-indigo-300',
    borderHover: 'hover:border-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-400',
    sendBtn: 'bg-indigo-600 hover:bg-indigo-500',
    label: 'نيلي',
    swatch: 'bg-indigo-600',
  },
  violet: {
    userBubble: 'bg-violet-600 text-white',
    botAvatar: 'bg-violet-600 text-white',
    badge: 'bg-violet-500/10 border-violet-500/20 text-violet-700 dark:text-violet-300',
    borderHover: 'hover:border-violet-500 hover:text-violet-600 dark:hover:text-violet-400',
    sendBtn: 'bg-violet-600 hover:bg-violet-500',
    label: 'بنفسجي',
    swatch: 'bg-violet-600',
  },
  amber: {
    userBubble: 'bg-amber-600 text-white',
    botAvatar: 'bg-amber-600 text-white',
    badge: 'bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-300',
    borderHover: 'hover:border-amber-500 hover:text-amber-600 dark:hover:text-amber-400',
    sendBtn: 'bg-amber-600 hover:bg-amber-500',
    label: 'عنبر',
    swatch: 'bg-amber-600',
  },
  slate: {
    userBubble: 'bg-slate-800 dark:bg-slate-700 text-white',
    botAvatar: 'bg-slate-800 dark:bg-slate-700 text-white',
    badge: 'bg-slate-500/10 border-slate-500/20 text-slate-700 dark:text-slate-300',
    borderHover: 'hover:border-slate-500 hover:text-slate-700 dark:hover:text-slate-300',
    sendBtn: 'bg-slate-800 hover:bg-slate-700',
    label: 'كحلي رسمي',
    swatch: 'bg-slate-800',
  },
};

const FONT_SIZE_CLASS_MAP: Record<ChatAppearanceSettings['fontSize'], string> = {
  sm: 'text-xs',
  base: 'text-xs sm:text-sm',
  lg: 'text-sm sm:text-base',
  xl: 'text-base sm:text-lg',
};

const FONT_FAMILY_CLASS_MAP: Record<ChatAppearanceSettings['fontFamily'], string> = {
  Tajawal: 'font-sans',
  Cairo: 'font-sans tracking-normal',
  'IBM Plex Sans Arabic': 'font-sans',
  'Plus Jakarta Sans': 'font-sans',
};

function loadSavedChatSessions(): ChatSession[] {
  try {
    const raw = localStorage.getItem(CHAT_SESSIONS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function loadSavedAppearance(): ChatAppearanceSettings {
  try {
    const raw = localStorage.getItem(CHAT_APPEARANCE_STORAGE_KEY);
    if (!raw) return DEFAULT_CHAT_APPEARANCE;
    const parsed = JSON.parse(raw) as Partial<ChatAppearanceSettings>;
    return {
      fontFamily: parsed.fontFamily || DEFAULT_CHAT_APPEARANCE.fontFamily,
      fontSize: parsed.fontSize || DEFAULT_CHAT_APPEARANCE.fontSize,
      accentColor: parsed.accentColor || DEFAULT_CHAT_APPEARANCE.accentColor,
      maxMessagesPerSession:
        typeof parsed.maxMessagesPerSession === 'number' && parsed.maxMessagesPerSession >= 10
          ? parsed.maxMessagesPerSession
          : DEFAULT_CHAT_APPEARANCE.maxMessagesPerSession,
      allowAiReceiptEntry:
        typeof parsed.allowAiReceiptEntry === 'boolean'
          ? parsed.allowAiReceiptEntry
          : DEFAULT_CHAT_APPEARANCE.allowAiReceiptEntry,
      allowAiInventoryEntry:
        typeof parsed.allowAiInventoryEntry === 'boolean'
          ? parsed.allowAiInventoryEntry
          : DEFAULT_CHAT_APPEARANCE.allowAiInventoryEntry,
      strictCatalogValidation:
        typeof parsed.strictCatalogValidation === 'boolean'
          ? parsed.strictCatalogValidation
          : DEFAULT_CHAT_APPEARANCE.strictCatalogValidation,
    };
  } catch {
    return DEFAULT_CHAT_APPEARANCE;
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || ''));
    reader.onerror = () => resolve('');
    reader.readAsDataURL(blob);
  });
}

export const GeminiAssistant: React.FC<GeminiAssistantProps> = ({
  settings,
  receipts,
  inventory,
  expenses,
  messages,
  onSetMessages,
  onAddMessage,
  onClearMessages,
  onOpenSettings,
  onApproveReceiptEntry,
  onApproveInventoryEntry,
  notify,
}) => {
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isRecordingGroq, setIsRecordingGroq] = useState(false);
  const [isTranscribingGroq, setIsTranscribingGroq] = useState(false);
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);
  const [aiConfig, setAiConfig] = useState<AIProviderConfig>(() =>
    settings.aiConfig ? settings.aiConfig : loadAIProviderConfig()
  );

  // Media attachment state + Lightbox zoom state
  const [attachment, setAttachment] = useState<{
    name: string;
    mimeType: string;
    base64Data: string;
  } | null>(null);
  const [lightboxImageUrl, setLightboxImageUrl] = useState<string | null>(null);

  // Direct Data Entry mode toggle ('auto' | 'receipt' | 'inventory')
  const [directEntryMode, setDirectEntryMode] = useState<'auto' | 'receipt' | 'inventory'>('auto');

  // Editable drafts for pending approval cards keyed by proposal ID
  const [proposalDrafts, setProposalDrafts] = useState<
    Record<
      string,
      {
        status: 'pending' | 'approved' | 'rejected';
        receiptData?: PendingReceiptEntryData;
        inventoryData?: PendingInventoryEntryData;
      }
    >
  >({});

  // Chat Sidebar Drawer + Sessions History + Appearance & Governance State
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<'history' | 'settings'>('history');
  const [sessions, setSessions] = useState<ChatSession[]>(() => loadSavedChatSessions());
  const [activeSessionId, setActiveSessionId] = useState<string>(() => 'sess_' + Date.now());
  const [appearance, setAppearance] = useState<ChatAppearanceSettings>(() => loadSavedAppearance());

  const latestMessagesRef = useRef<ChatMessage[]>(messages);
  const latestSessionIdRef = useRef<string>(activeSessionId);
  latestMessagesRef.current = messages;
  latestSessionIdRef.current = activeSessionId;

  useEffect(() => {
    if (settings.aiConfig) {
      setAiConfig(settings.aiConfig);
      saveAIProviderConfig(settings.aiConfig);
    }
  }, [settings.aiConfig]);

  // Persist appearance & governance settings
  useEffect(() => {
    try {
      localStorage.setItem(CHAT_APPEARANCE_STORAGE_KEY, JSON.stringify(appearance));
    } catch {
      // Ignore
    }
  }, [appearance]);

  // Persist sessions list
  const persistSessionsList = (nextList: ChatSession[]) => {
    setSessions(nextList);
    try {
      const compactList = nextList.slice(0, 35).map((s) => ({
        ...s,
        messages: s.messages.slice(-50),
      }));
      localStorage.setItem(CHAT_SESSIONS_STORAGE_KEY, JSON.stringify(compactList));
    } catch {
      // Ignore quota errors
    }
  };

  // Helper to flush current conversation to localStorage synchronously (used on exit/unmount/archive)
  const flushCurrentSessionToStorage = (msgsToSave: ChatMessage[], sessId: string) => {
    if (!msgsToSave || msgsToSave.length === 0) return;
    try {
      const firstUserMsg = msgsToSave.find((m) => m.role === 'user');
      const derivedTitle = firstUserMsg
        ? firstUserMsg.text.slice(0, 42)
        : `محادثة ${new Date().toLocaleDateString('ar-YE')}`;
      const nowIso = new Date().toISOString();
      const currentSaved = loadSavedChatSessions();
      const existingIdx = currentSaved.findIndex((s) => s.id === sessId);
      let updated: ChatSession[];
      if (existingIdx > -1) {
        updated = [...currentSaved];
        updated[existingIdx] = {
          ...updated[existingIdx],
          title: updated[existingIdx].title || derivedTitle,
          updatedAt: nowIso,
          messages: msgsToSave.slice(-50),
        };
      } else {
        updated = [
          {
            id: sessId,
            title: derivedTitle,
            createdAt: nowIso,
            updatedAt: nowIso,
            messages: msgsToSave.slice(-50),
          },
          ...currentSaved,
        ];
      }
      localStorage.setItem(CHAT_SESSIONS_STORAGE_KEY, JSON.stringify(updated.slice(0, 35)));
    } catch {
      // Ignore storage errors
    }
  };

  // Auto-sync current conversation into sessions list when messages change
  useEffect(() => {
    if (messages.length === 0) return;
    const firstUserMsg = messages.find((m) => m.role === 'user');
    const derivedTitle = firstUserMsg
      ? firstUserMsg.text.slice(0, 42)
      : `محادثة ${new Date().toLocaleDateString('ar-YE')}`;
    const nowIso = new Date().toISOString();

    setSessions((prev) => {
      const existingIdx = prev.findIndex((s) => s.id === activeSessionId);
      let updated: ChatSession[];
      if (existingIdx > -1) {
        updated = [...prev];
        updated[existingIdx] = {
          ...updated[existingIdx],
          title: updated[existingIdx].title || derivedTitle,
          updatedAt: nowIso,
          messages,
        };
      } else {
        const newSession: ChatSession = {
          id: activeSessionId,
          title: derivedTitle,
          createdAt: nowIso,
          updatedAt: nowIso,
          messages,
        };
        updated = [newSession, ...prev];
      }
      try {
        localStorage.setItem(
          CHAT_SESSIONS_STORAGE_KEY,
          JSON.stringify(updated.slice(0, 35))
        );
      } catch {
        // Ignore
      }
      return updated;
    });
  }, [messages, activeSessionId]);

  // Save conversation automatically when exiting the app / closing tab / unmounting
  useEffect(() => {
    const handleExitSave = () => {
      if (latestMessagesRef.current.length > 0) {
        flushCurrentSessionToStorage(latestMessagesRef.current, latestSessionIdRef.current);
      }
    };
    window.addEventListener('beforeunload', handleExitSave);
    window.addEventListener('pagehide', handleExitSave);
    return () => {
      handleExitSave();
      window.removeEventListener('beforeunload', handleExitSave);
      window.removeEventListener('pagehide', handleExitSave);
    };
  }, []);

  // Auto-archive and start a fresh session when conversation reaches maxMessagesPerSession
  useEffect(() => {
    const maxMsgs = appearance.maxMessagesPerSession || 30;
    if (!isSending && messages.length >= maxMsgs) {
      flushCurrentSessionToStorage(messages, activeSessionId);
      const nextId = 'sess_' + Date.now();
      setActiveSessionId(nextId);
      onClearMessages();
      notify(
        `تم حفظ المحادثة تلقائياً لوصولها إلى (${maxMsgs}) رسالة وفتح محادثة جديدة.`,
        'info'
      );
    }
  }, [messages.length, isSending, appearance.maxMessagesPerSession, activeSessionId]);

  const handleStartNewSession = () => {
    if (messages.length > 0) {
      flushCurrentSessionToStorage(messages, activeSessionId);
    }
    const nextId = 'sess_' + Date.now();
    setActiveSessionId(nextId);
    onClearMessages();
    setIsSidebarOpen(false);
    notify('تم بدء محادثة جديدة', 'info');
  };

  const handleSaveCurrentSessionExplicitly = () => {
    if (messages.length === 0) {
      notify('لا توجد رسائل في المحادثة الحالية لحفظها', 'warning');
      return;
    }
    const firstUserMsg = messages.find((m) => m.role === 'user');
    const title = firstUserMsg
      ? firstUserMsg.text.slice(0, 42)
      : `محادثة محفوظة (${new Date().toLocaleTimeString('ar-YE', { hour: '2-digit', minute: '2-digit' })})`;
    const nowIso = new Date().toISOString();
    const existing = sessions.find((s) => s.id === activeSessionId);
    const nextSession: ChatSession = {
      id: activeSessionId,
      title: existing?.title || title,
      createdAt: existing?.createdAt || nowIso,
      updatedAt: nowIso,
      isPinned: true,
      messages,
    };
    const nextList = [
      nextSession,
      ...sessions.filter((s) => s.id !== activeSessionId),
    ];
    persistSessionsList(nextList);
    notify('تم حفظ وتثبيت المحادثة في السجل ✓', 'success');
  };

  const handleSelectSession = (session: ChatSession) => {
    setActiveSessionId(session.id);
    if (onSetMessages) {
      onSetMessages(session.messages);
    } else {
      onClearMessages();
      session.messages.forEach((m) => onAddMessage(m));
    }
    setIsSidebarOpen(false);
  };

  const handleDeleteSession = (sessionId: string) => {
    const nextList = sessions.filter((s) => s.id !== sessionId);
    persistSessionsList(nextList);
    if (sessionId === activeSessionId) {
      setActiveSessionId('sess_' + Date.now());
      onClearMessages();
    }
    notify('تم حذف المحادثة من السجل', 'info');
  };

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const recognitionRef = useRef<{ start: () => void; stop: () => void } | null>(null);
  const recognitionSessionTokenRef = useRef<number>(0);
  const restartTimerRef = useRef<number | null>(null);
  const latestInputRef = useRef<string>(input);
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
    latestInputRef.current = input;
  }, [input]);

  useEffect(() => {
    return () => {
      shouldKeepListeningRef.current = false;
      recognitionSessionTokenRef.current += 1;
      if (restartTimerRef.current) {
        window.clearTimeout(restartTimerRef.current);
      }
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
      stopActiveAISpeech();
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

  const optimizeMediaFile = (
    file: File
  ): Promise<{ base64Data: string; mimeType: string }> => {
    return new Promise((resolve) => {
      if (!file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = () =>
          resolve({
            base64Data: String(reader.result || ''),
            mimeType: file.type || 'application/octet-stream',
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
      const { base64Data, mimeType } = await optimizeMediaFile(file);
      if (base64Data) {
        setAttachment({
          name: file.name,
          mimeType,
          base64Data,
        });
        // If an audio file was uploaded and Groq API key is present, offer automatic transcription into input
        if (mimeType.startsWith('audio/') && aiConfig.groqApiKey.trim()) {
          setIsTranscribingGroq(true);
          try {
            const transcript = await transcribeAudioWithGroqWhisper(
              file,
              aiConfig.groqApiKey,
              aiConfig.groqWhisperModel
            );
            if (transcript && transcript.trim()) {
              setInput((prev) =>
                prev ? `${prev.trim()} ${transcript.trim()}` : transcript.trim()
              );
              notify('تم رفع الملف الصوتي وتفريغ محتواه بنجاح', 'success');
            }
          } catch {
            // Keep audio attachment ready for playback and sending
          } finally {
            setIsTranscribingGroq(false);
          }
        }
      }
    } catch {
      notify('تعذر تحميل الملف المرفق', 'warning');
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Delegate Speech Reading to Dedicated AI Audio/TTS Model
  const toggleSpeakText = (msgId: string, text: string) => {
    if (speakingMsgId === msgId) {
      stopActiveAISpeech();
      setSpeakingMsgId(null);
      return;
    }
    setSpeakingMsgId(msgId);
    void speakTextWithAIModel(text, aiConfig, () => {
      setSpeakingMsgId((current) => (current === msgId ? null : current));
    });
  };

  const copyMessageText = (text: string) => {
    navigator.clipboard
      ?.writeText(text)
      .then(() => notify('تم نسخ الرد', 'success'))
      .catch(() => {});
  };

  const stopVoiceInput = () => {
    shouldKeepListeningRef.current = false;
    recognitionSessionTokenRef.current += 1;
    if (restartTimerRef.current) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    setIsListening(false);
    try {
      recognitionRef.current?.stop();
    } catch {
      // Ignore
    }
    if (currentSessionFinalRef.current.trim()) {
      const merged = deduplicateSpeechText(
        mergeTranscriptSegments(
          accumulatedTranscriptRef.current,
          currentSessionFinalRef.current
        )
      );
      accumulatedTranscriptRef.current = merged;
      currentSessionFinalRef.current = '';
      latestInputRef.current = merged;
      setInput(merged);
    } else if (latestInputRef.current.trim()) {
      const clean = deduplicateSpeechText(latestInputRef.current);
      accumulatedTranscriptRef.current = clean;
      latestInputRef.current = clean;
      setInput(clean);
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

  const launchBrowserRecognitionSession = () => {
    if (!shouldKeepListeningRef.current) return;

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
      shouldKeepListeningRef.current = false;
      setIsListening(false);
      notify('المتصفح لا يدعم الإملاء الصوتي المباشر', 'warning');
      return;
    }

    try {
      try {
        recognitionRef.current?.stop();
      } catch {
        // Ignore
      }

      const sessionToken = ++recognitionSessionTokenRef.current;

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

      currentSessionFinalRef.current = '';

      rec.onresult = (event) => {
        if (
          sessionToken !== recognitionSessionTokenRef.current ||
          !shouldKeepListeningRef.current
        ) {
          return;
        }
        const sessionTranscript = extractSessionSpeechTranscript(event.results);
        if (sessionTranscript) {
          currentSessionFinalRef.current = sessionTranscript;
          const combined = deduplicateSpeechText(
            mergeTranscriptSegments(accumulatedTranscriptRef.current, sessionTranscript)
          );
          latestInputRef.current = combined;
          setInput(combined);
        }
      };

      rec.onerror = (event) => {
        if (sessionToken !== recognitionSessionTokenRef.current) return;
        const errCode = String(event?.error || '');
        if (errCode === 'not-allowed' || errCode === 'service-not-allowed') {
          shouldKeepListeningRef.current = false;
          setIsListening(false);
          notify('يرجى السماح بصلاحية المايكروفون في المتصفح', 'warning');
        }
      };

      rec.onend = () => {
        if (sessionToken !== recognitionSessionTokenRef.current) return;

        // Lock in any spoken words from this sub-session into accumulatedTranscriptRef
        if (currentSessionFinalRef.current.trim()) {
          const merged = deduplicateSpeechText(
            mergeTranscriptSegments(
              accumulatedTranscriptRef.current,
              currentSessionFinalRef.current
            )
          );
          accumulatedTranscriptRef.current = merged;
          currentSessionFinalRef.current = '';
          latestInputRef.current = merged;
          setInput(merged);
        }

        // Automatically restart listening so the browser recorder NEVER stops until Send is clicked
        if (shouldKeepListeningRef.current) {
          if (restartTimerRef.current) {
            window.clearTimeout(restartTimerRef.current);
          }
          restartTimerRef.current = window.setTimeout(() => {
            if (shouldKeepListeningRef.current) {
              launchBrowserRecognitionSession();
            }
          }, 60);
        } else {
          setIsListening(false);
        }
      };

      recognitionRef.current = rec;
      setIsListening(true);
      rec.start();
    } catch {
      if (shouldKeepListeningRef.current) {
        if (restartTimerRef.current) {
          window.clearTimeout(restartTimerRef.current);
        }
        restartTimerRef.current = window.setTimeout(() => {
          if (shouldKeepListeningRef.current) {
            launchBrowserRecognitionSession();
          }
        }, 200);
      } else {
        setIsListening(false);
      }
    }
  };

  const startContinuousBrowserVoiceInput = () => {
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

    if (isListening || shouldKeepListeningRef.current) {
      // Keep listening active until the user clicks Send
      return;
    }

    const initialBase = deduplicateSpeechText(latestInputRef.current.trim());
    accumulatedTranscriptRef.current = initialBase;
    currentSessionFinalRef.current = '';
    shouldKeepListeningRef.current = true;
    setIsListening(true);
    launchBrowserRecognitionSession();
  };

  const handleMicButtonClick = () => {
    if (isRecordingGroq) {
      stopGroqRecording();
    }
    startContinuousBrowserVoiceInput();
  };

  const handleStopResponse = () => {
    userInitiatedAbortRef.current = true;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsSending(false);
  };

  const handleConfirmProposal = (proposal: PendingDataEntryProposal) => {
    const draft = proposalDrafts[proposal.id];
    const currentStatus = draft?.status || proposal.status;
    if (currentStatus !== 'pending') return;

    if (proposal.type === 'receipt') {
      const data = draft?.receiptData || proposal.receiptData;
      if (!data) return;
      const cleanName = String(data.patientName || '').trim();
      if (cleanName.length < 2) {
        notify('يرجى إدخال اسم المريض الصحيح قبل اعتماد السند', 'warning');
        return;
      }
      if (!data.services || data.services.length === 0) {
        notify('يرجى تحديد الخدمة العلاجية قبل اعتماد السند', 'warning');
        return;
      }
      const total = Number(data.totalAmount) || 0;
      const paid = Number(data.paidAmount) || 0;
      if (total < 0 || (total === 0 && !data.isReturnVisit)) {
        notify('يرجى تحديد المبلغ الإجمالي للسند (أكبر من صفر)', 'warning');
        return;
      }
      if (paid < 0 || paid > total) {
        notify('المبلغ المدفوع يجب أن يكون بين 0 والإجمالي', 'warning');
        return;
      }

      if (onApproveReceiptEntry) {
        onApproveReceiptEntry({
          ...data,
          patientName: cleanName,
          totalAmount: total,
          paidAmount: paid,
          remainingAmount: Math.max(0, +(total - paid).toFixed(2)),
        });
        setProposalDrafts((prev) => ({
          ...prev,
          [proposal.id]: {
            ...prev[proposal.id],
            status: 'approved',
            receiptData: {
              ...data,
              patientName: cleanName,
              totalAmount: total,
              paidAmount: paid,
              remainingAmount: Math.max(0, +(total - paid).toFixed(2)),
            },
          },
        }));
      }
    } else if (proposal.type === 'inventory') {
      const data = draft?.inventoryData || proposal.inventoryData;
      if (!data) return;
      const cleanItemName = String(data.name || '').trim();
      if (cleanItemName.length < 2) {
        notify('يرجى إدخال اسم الصنف الصحيح قبل اعتماد العملية', 'warning');
        return;
      }
      const qty = Number(data.qty) || 0;
      if (qty <= 0) {
        notify('الكمية يجب أن تكون أكبر من صفر', 'warning');
        return;
      }
      if (data.operation === 'consume') {
        const matched = inventory.find(
          (i) =>
            i.id === data.matchedItemId ||
            i.name.trim().toLowerCase() === cleanItemName.toLowerCase()
        );
        if (!matched) {
          notify(`الصنف (${cleanItemName}) غير موجود في المخزون للسحب منه`, 'error');
          return;
        }
        if (qty > Number(matched.qty)) {
          notify(
            `الكمية المطلوب سحبها (${qty}) تتجاوز الرصيد المتوفر (${matched.qty} ${matched.unit})`,
            'error'
          );
          return;
        }
      }

      if (onApproveInventoryEntry) {
        onApproveInventoryEntry({
          ...data,
          name: cleanItemName,
          qty,
        });
        setProposalDrafts((prev) => ({
          ...prev,
          [proposal.id]: {
            ...prev[proposal.id],
            status: 'approved',
            inventoryData: {
              ...data,
              name: cleanItemName,
              qty,
            },
          },
        }));
      }
    }
  };

  const handleRejectProposal = (proposal: PendingDataEntryProposal) => {
    setProposalDrafts((prev) => ({
      ...prev,
      [proposal.id]: {
        ...prev[proposal.id],
        status: 'rejected',
      },
    }));
    notify('تم إلغاء عملية الإدخال المباشر', 'info');
  };

  const sendMessage = async (textOverride?: string) => {
    const wasListening = isListening || shouldKeepListeningRef.current;
    if (wasListening) {
      stopVoiceInput();
    }
    if (isRecordingGroq) {
      stopGroqRecording();
    }
    const rawPrompt =
      textOverride !== undefined ? textOverride : latestInputRef.current || input;
    const promptText = wasListening
      ? deduplicateSpeechText(rawPrompt).trim()
      : rawPrompt.trim();
    if (!promptText && !attachment) return;

    userInitiatedAbortRef.current = false;

    const isImageAttachment = Boolean(attachment?.mimeType.startsWith('image/'));
    const isAudioAttachment = Boolean(attachment?.mimeType.startsWith('audio/'));

    const userMsg: ChatMessage = {
      id: 'msg_u_' + Date.now(),
      role: 'user',
      text: promptText || `تحليل المرفق: ${attachment?.name}`,
      timestamp: new Date().toLocaleTimeString('ar-YE', { hour: '2-digit', minute: '2-digit' }),
      attachmentName: attachment?.name,
      attachmentMimeType: attachment?.mimeType,
      attachmentPreview:
        isImageAttachment || isAudioAttachment ? attachment?.base64Data : undefined,
    };

    onAddMessage(userMsg);
    setInput('');
    latestInputRef.current = '';
    accumulatedTranscriptRef.current = '';
    currentSessionFinalRef.current = '';
    const sentAttachment = attachment;
    setAttachment(null);
    setIsSending(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      // 1. Strict Anti-Tampering & Anti-Deletion Guard
      if (isDestructiveSystemIntent(userMsg.text)) {
        const blockMsg: ChatMessage = {
          id: 'msg_block_' + Date.now(),
          role: 'assistant',
          text: '⛔ تنبيه حماية النظام: يمنع على المساعد الذكي حذف أي سندات أو أصناف مخزون أو مصروفات أو تعديل بيانات النظام الداخلية. جميع عمليات الحذف والتعديل الحساسة تتم يدوياً فقط من قبل الإدارة.',
          timestamp: new Date().toLocaleTimeString('ar-YE', {
            hour: '2-digit',
            minute: '2-digit',
          }),
        };
        onAddMessage(blockMsg);
        return;
      }

      // 2. Check if Direct Data Entry (Receipt or Inventory) is requested and permitted
      const forcedEntryType =
        directEntryMode === 'receipt' && appearance.allowAiReceiptEntry
          ? 'receipt'
          : directEntryMode === 'inventory' && appearance.allowAiInventoryEntry
            ? 'inventory'
            : undefined;
      const detectedIntent =
        forcedEntryType ||
        isDirectDataEntryIntent(userMsg.text, {
          allowReceipt: appearance.allowAiReceiptEntry,
          allowInventory: appearance.allowAiInventoryEntry,
        });

      if (detectedIntent) {
        const proposal = await parseDirectDataEntryProposal(
          userMsg.text,
          settings,
          inventory,
          sentAttachment,
          detectedIntent,
          {
            strictCatalogValidation: appearance.strictCatalogValidation,
            allowReceipt: appearance.allowAiReceiptEntry,
            allowInventory: appearance.allowAiInventoryEntry,
          },
          receipts
        );

        if (proposal && !userInitiatedAbortRef.current) {
          setProposalDrafts((prev) => ({
            ...prev,
            [proposal.id]: {
              status: 'pending',
              receiptData: proposal.receiptData,
              inventoryData: proposal.inventoryData,
            },
          }));
          if (directEntryMode !== 'auto') {
            setDirectEntryMode('auto');
          }

          const assistantProposalMsg: ChatMessage = {
            id: 'msg_a_' + Date.now(),
            role: 'assistant',
            text: proposal.summaryText,
            timestamp: new Date().toLocaleTimeString('ar-YE', {
              hour: '2-digit',
              minute: '2-digit',
            }),
            modelUsed: proposal.modelUsed,
            dataEntryProposal: proposal,
          };
          onAddMessage(assistantProposalMsg);
          return;
        }
      }

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
        recentReceipts: receipts,
        inventoryStatus: inventory,
        recentExpenses: expenses,
      };

      const assistantResult = await queryClinicAssistantDetailed(
        {
          prompt: userMsg.text,
          clinicContext,
          history: messages.slice(-4).map((m) => ({ role: m.role, text: m.text })),
          attachment: sentAttachment?.mimeType.startsWith('image/') ? sentAttachment : null,
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
          text: '⏹️ تم إيقاف توليد الرد.',
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

  const activeTheme = ACCENT_THEME_MAP[appearance.accentColor] || ACCENT_THEME_MAP.sky;
  const activeFontSizeClass = FONT_SIZE_CLASS_MAP[appearance.fontSize] || FONT_SIZE_CLASS_MAP.base;
  const activeFontFamilyClass =
    FONT_FAMILY_CLASS_MAP[appearance.fontFamily] || FONT_FAMILY_CLASS_MAP.Tajawal;

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
              isUser ? 'bg-white/20 text-white' : `border ${activeTheme.badge}`
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

  const renderDataEntryApprovalCard = (proposal: PendingDataEntryProposal) => {
    const draftState = proposalDrafts[proposal.id];
    const currentStatus = draftState?.status || proposal.status;

    if (proposal.type === 'receipt') {
      const rec = draftState?.receiptData || proposal.receiptData;
      if (!rec) return null;

      const isPatientValid = String(rec.patientName || '').trim().length >= 2;
      const isTotalValid =
        (Number(rec.totalAmount) || 0) > 0 || Boolean(rec.isReturnVisit && Number(rec.totalAmount) === 0);
      const isPaidValid =
        (Number(rec.paidAmount) || 0) >= 0 &&
        (Number(rec.paidAmount) || 0) <= (Number(rec.totalAmount) || 0);
      const isReceiptReadyToApprove = isPatientValid && isTotalValid && isPaidValid;

      const liveMatchedAccount =
        rec.patientName && rec.patientName.trim().length >= 2
          ? findMatchingPatientAccount(
              rec.patientName,
              receipts,
              settings.identity.defaultCurrency
            )
          : null;

      const updateRecField = <K extends keyof PendingReceiptEntryData>(
        field: K,
        val: PendingReceiptEntryData[K]
      ) => {
        setProposalDrafts((prev) => {
          const base = prev[proposal.id]?.receiptData || rec;
          const updated: PendingReceiptEntryData = {
            ...base,
            [field]: val,
          };
          if (field === 'patientName' && typeof val === 'string') {
            const matchedAcc = findMatchingPatientAccount(
              val,
              receipts,
              settings.identity.defaultCurrency
            );
            if (matchedAcc) {
              updated.matchedAccountName = matchedAcc.patientName;
              updated.previousDebtAmount = matchedAcc.totalRemaining;
              updated.previousVisitsCount = matchedAcc.visitsCount;
              if (!updated.patientPhone && matchedAcc.patientPhone) {
                updated.patientPhone = matchedAcc.patientPhone;
              }
            }
          }
          if (field === 'totalAmount' || field === 'paidAmount') {
            updated.remainingAmount = Math.max(
              0,
              (Number(updated.totalAmount) || 0) - (Number(updated.paidAmount) || 0)
            );
          }
          return {
            ...prev,
            [proposal.id]: {
              status: currentStatus,
              receiptData: updated,
            },
          };
        });
      };

      return (
        <div className="mt-2.5 rounded-xl border border-emerald-500/40 bg-white dark:bg-slate-900 p-3.5 space-y-3 text-xs shadow-xs">
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-1.5 font-black text-emerald-700 dark:text-emerald-400">
              <FilePlus2 className="w-4 h-4 shrink-0" />
              <span>{rec.isReturnVisit ? 'مراجعة واعتماد عودة / مراجعة' : 'مراجعة واعتماد سند قبض'}</span>
            </div>
            {currentStatus === 'pending' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300 font-bold text-[10px]">
                <ShieldCheck className="w-3 h-3" />
                <span>بانتظار موافقتك</span>
              </span>
            )}
            {currentStatus === 'approved' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-bold text-[11px]">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>تم الاعتماد والحفظ</span>
              </span>
            )}
            {currentStatus === 'rejected' && (
              <span className="px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-600 dark:text-rose-400 font-bold text-[11px]">
                ملغى
              </span>
            )}
          </div>

          {liveMatchedAccount && (
            <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 p-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold text-sky-900 dark:text-sky-200">
              <span>
                مرتبط بحساب المريض المسجل: <strong>{liveMatchedAccount.patientName}</strong> (زيارات سابقة: {liveMatchedAccount.visitsCount})
              </span>
              <span
                className={`px-2 py-0.5 rounded ${
                  liveMatchedAccount.totalRemaining > 0
                    ? 'bg-rose-500/20 text-rose-700 dark:text-rose-300'
                    : 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                }`}
              >
                {liveMatchedAccount.totalRemaining > 0
                  ? `عليه دين: ${liveMatchedAccount.totalRemaining.toLocaleString()} ${liveMatchedAccount.currency}`
                  : 'مسدد كامل'}
              </span>
            </div>
          )}

          {proposal.validationWarnings && proposal.validationWarnings.length > 0 && currentStatus === 'pending' && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 space-y-1 text-[11px] font-bold text-amber-800 dark:text-amber-200">
              {proposal.validationWarnings.map((w, idx) => (
                <div key={idx} className="flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <span>{w}</span>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                اسم المريض *
              </label>
              <input
                type="text"
                placeholder="أدخل اسم المريض..."
                disabled={currentStatus !== 'pending'}
                value={rec.patientName}
                onChange={(e) => updateRecField('patientName', e.target.value)}
                className={`w-full rounded-lg border px-2.5 py-1.5 text-xs font-bold text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-950 ${
                  !isPatientValid && currentStatus === 'pending'
                    ? 'border-rose-500'
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                الخدمة العلاجية (من قائمة العيادة)
              </label>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  disabled={currentStatus !== 'pending'}
                  value={rec.services.join(' ، ')}
                  onChange={(e) =>
                    updateRecField(
                      'services',
                      e.target.value
                        .split(/[،,]/)
                        .map((s) => s.trim())
                        .filter(Boolean)
                    )
                  }
                  className="flex-1 min-w-0 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 text-xs font-bold text-slate-900 dark:text-slate-100"
                />
                {currentStatus === 'pending' && settings.services.length > 0 && (
                  <select
                    value=""
                    onChange={(e) => {
                      const srv = settings.services.find((s) => s.id === e.target.value);
                      if (srv) {
                        setProposalDrafts((prev) => {
                          const base = prev[proposal.id]?.receiptData || rec;
                          const price = Number(srv.price) || 0;
                          return {
                            ...prev,
                            [proposal.id]: {
                              status: currentStatus,
                              receiptData: {
                                ...base,
                                services: [srv.name],
                                totalAmount: price,
                                paidAmount: price,
                                remainingAmount: 0,
                              },
                            },
                          };
                        });
                      }
                    }}
                    className="w-24 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 px-1.5 py-1 text-[10px] font-bold text-slate-700 dark:text-slate-200"
                    title="اختيار من خدمات العيادة المعتمدة"
                  >
                    <option value="">اختر خدمة...</option>
                    {settings.services.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.price})
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                الإجمالي ({rec.currency}) *
              </label>
              <input
                type="number"
                disabled={currentStatus !== 'pending'}
                value={rec.totalAmount}
                onChange={(e) => updateRecField('totalAmount', Number(e.target.value) || 0)}
                className={`w-full rounded-lg border bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 text-xs font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100 ${
                  !isTotalValid && currentStatus === 'pending'
                    ? 'border-rose-500'
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                المدفوع ({rec.currency}) — المتبقي: {rec.remainingAmount.toLocaleString()}
              </label>
              <input
                type="number"
                disabled={currentStatus !== 'pending'}
                value={rec.paidAmount}
                onChange={(e) => updateRecField('paidAmount', Number(e.target.value) || 0)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 text-xs font-mono tabular-nums font-bold text-emerald-600 dark:text-emerald-400"
              />
            </div>
          </div>

          {currentStatus === 'pending' && (
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => handleRejectProposal(proposal)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold text-xs transition-colors"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={!isReceiptReadyToApprove}
                onClick={() => handleConfirmProposal(proposal)}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-black text-xs shadow-xs transition-colors"
              >
                <Check className="w-3.5 h-3.5" />
                <span>اعتماد وحفظ السند</span>
              </button>
            </div>
          )}
        </div>
      );
    }

    if (proposal.type === 'inventory') {
      const inv = draftState?.inventoryData || proposal.inventoryData;
      if (!inv) return null;

      const cleanItemName = String(inv.name || '').trim();
      const matchedStockItem = inventory.find(
        (i) =>
          i.id === inv.matchedItemId ||
          i.name.trim().toLowerCase() === cleanItemName.toLowerCase()
      );
      const isConsumeInvalid =
        inv.operation === 'consume' &&
        (!matchedStockItem || (Number(inv.qty) || 0) > Number(matchedStockItem.qty));
      const isInvReadyToApprove =
        cleanItemName.length >= 2 && (Number(inv.qty) || 0) >= 1 && !isConsumeInvalid;

      const updateInvField = <K extends keyof PendingInventoryEntryData>(
        field: K,
        val: PendingInventoryEntryData[K]
      ) => {
        setProposalDrafts((prev) => {
          const base = prev[proposal.id]?.inventoryData || inv;
          const updated: PendingInventoryEntryData = {
            ...base,
            [field]: val,
          };
          updated.totalCost = +((Number(updated.qty) || 0) * (Number(updated.unitPrice) || 0)).toFixed(2);
          return {
            ...prev,
            [proposal.id]: {
              status: currentStatus,
              inventoryData: updated,
            },
          };
        });
      };

      return (
        <div className="mt-2.5 rounded-xl border border-amber-500/40 bg-white dark:bg-slate-900 p-3.5 space-y-3 text-xs shadow-xs">
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-1.5 font-black text-amber-700 dark:text-amber-400">
              <PackagePlus className="w-4 h-4 shrink-0" />
              <span>مراجعة واعتماد حركة مخزون</span>
            </div>
            {currentStatus === 'pending' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300 font-bold text-[10px]">
                <ShieldCheck className="w-3 h-3" />
                <span>بانتظار موافقتك</span>
              </span>
            )}
            {currentStatus === 'approved' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-bold text-[11px]">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>تم الاعتماد والحفظ</span>
              </span>
            )}
            {currentStatus === 'rejected' && (
              <span className="px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-600 dark:text-rose-400 font-bold text-[11px]">
                ملغى
              </span>
            )}
          </div>

          {proposal.validationWarnings && proposal.validationWarnings.length > 0 && currentStatus === 'pending' && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 space-y-1 text-[11px] font-bold text-amber-800 dark:text-amber-200">
              {proposal.validationWarnings.map((w, idx) => (
                <div key={idx} className="flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <span>{w}</span>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 mb-0.5">نوع العملية</label>
              <select
                disabled={currentStatus !== 'pending'}
                value={inv.operation}
                onChange={(e) =>
                  updateInvField('operation', e.target.value as 'add_new' | 'restock' | 'consume')
                }
                className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 text-xs font-bold text-slate-900 dark:text-slate-100"
              >
                <option value="add_new">إضافة صنف جديد</option>
                <option value="restock">توريد كمية إضافية</option>
                <option value="consume">صرف / سحب كمية</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                اسم الصنف * {matchedStockItem ? `(المتوفر: ${matchedStockItem.qty})` : ''}
              </label>
              <input
                type="text"
                placeholder="أدخل اسم الصنف..."
                disabled={currentStatus !== 'pending'}
                value={inv.name}
                onChange={(e) => updateInvField('name', e.target.value)}
                className={`w-full rounded-lg border bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 text-xs font-bold text-slate-900 dark:text-slate-100 ${
                  cleanItemName.length < 2 && currentStatus === 'pending'
                    ? 'border-rose-500'
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                الكمية ({inv.unit}) *
              </label>
              <input
                type="number"
                disabled={currentStatus !== 'pending'}
                value={inv.qty}
                onChange={(e) => updateInvField('qty', Math.max(1, Number(e.target.value) || 1))}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 text-xs font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                سعر الوحدة — الإجمالي: {inv.totalCost.toLocaleString()}
              </label>
              <input
                type="number"
                disabled={currentStatus !== 'pending'}
                value={inv.unitPrice}
                onChange={(e) => updateInvField('unitPrice', Math.max(0, Number(e.target.value) || 0))}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 text-xs font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          {currentStatus === 'pending' && (
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => handleRejectProposal(proposal)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold text-xs transition-colors"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={!isInvReadyToApprove}
                onClick={() => handleConfirmProposal(proposal)}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-black text-xs shadow-xs transition-colors"
              >
                <Check className="w-3.5 h-3.5" />
                <span>اعتماد وتحديث المخزون</span>
              </button>
            </div>
          )}
        </div>
      );
    }

    return null;
  };

  const isPlatformDev = isPlatformDeveloperUser(auth.currentUser?.email);

  return (
    <div
      style={{ fontFamily: `"${appearance.fontFamily}", sans-serif` }}
      className={`relative flex-1 min-h-0 w-full h-full sm:rounded-2xl border-0 sm:border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col overflow-hidden sm:shadow-xs ${activeFontFamilyClass}`}
    >
      {/* Top Action Strip: Chat Sidebar Button + Direct Entry Mode + Quick Prompts */}
      <div className="shrink-0 px-3 sm:px-4 py-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/60 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        <button
          type="button"
          onClick={() => setIsSidebarOpen((o) => !o)}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:border-sky-500 rounded-xl transition-colors whitespace-nowrap shadow-2xs"
          title="المحادثات والإعدادات"
        >
          <PanelRightOpen className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
          <span>المحادثات والإعدادات</span>
        </button>

        {/* Direct Data Entry Quick Mode Buttons (Governed by Settings) */}
        {appearance.allowAiReceiptEntry && (
          <button
            type="button"
            onClick={() =>
              setDirectEntryMode((m) => (m === 'receipt' ? 'auto' : 'receipt'))
            }
            className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold rounded-xl border transition-colors whitespace-nowrap ${
              directEntryMode === 'receipt'
                ? 'bg-emerald-600 text-white border-emerald-500'
                : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20'
            }`}
            title="إدخال سند مع المراجعة والاعتماد"
          >
            <FilePlus2 className="w-3.5 h-3.5 shrink-0" />
            <span>إدخال سند</span>
          </button>
        )}

        {appearance.allowAiInventoryEntry && (
          <button
            type="button"
            onClick={() =>
              setDirectEntryMode((m) => (m === 'inventory' ? 'auto' : 'inventory'))
            }
            className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold rounded-xl border transition-colors whitespace-nowrap ${
              directEntryMode === 'inventory'
                ? 'bg-amber-600 text-white border-amber-500'
                : 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30 hover:bg-amber-500/20'
            }`}
            title="إدخال مخزون مع المراجعة والاعتماد"
          >
            <PackagePlus className="w-3.5 h-3.5 shrink-0" />
            <span>إدخال مخزون</span>
          </button>
        )}

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
            onClick={handleStartNewSession}
            className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-sky-600 dark:text-sky-400 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/20 rounded-xl transition-colors whitespace-nowrap"
          >
            <MessageSquarePlus className="w-3.5 h-3.5 shrink-0" />
            <span>محادثة جديدة</span>
          </button>
        )}

        {QUICK_PROMPTS.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => sendMessage(q)}
            disabled={isSending}
            className={`shrink-0 px-3 py-1.5 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 ${activeTheme.borderHover} transition-colors whitespace-nowrap`}
          >
            {q}
          </button>
        ))}
      </div>

      {/* Collapsible Chat Sidebar Drawer (Conversations History + Appearance & Governance Settings) */}
      {isSidebarOpen && (
        <div className="absolute inset-0 z-30 flex">
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-2xs"
            onClick={() => setIsSidebarOpen(false)}
          />
          <aside className="relative z-10 w-80 max-w-[88vw] h-full bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 flex flex-col shadow-2xl">
            <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setSidebarTab('history')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                    sidebarTab === 'history'
                      ? 'bg-sky-600 text-white'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <History className="w-3.5 h-3.5" />
                  <span>المحادثات ({sessions.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSidebarTab('settings')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                    sidebarTab === 'settings'
                      ? 'bg-sky-600 text-white'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span>الإعدادات</span>
                </button>
              </div>
              <button
                type="button"
                onClick={() => setIsSidebarOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {sidebarTab === 'history' ? (
              <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={handleStartNewSession}
                    className="py-2 px-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <MessageSquarePlus className="w-3.5 h-3.5" />
                    <span>محادثة جديدة</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveCurrentSessionExplicitly}
                    className="py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>حفظ الحالية</span>
                  </button>
                </div>

                {sessions.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-500 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                    لا توجد محادثات محفوظة بعد.
                  </div>
                ) : (
                  <div className="space-y-2 pt-1">
                    {sessions.map((sess) => {
                      const isCurrent = sess.id === activeSessionId;
                      return (
                        <div
                          key={sess.id}
                          className={`p-2.5 rounded-xl border text-xs transition-all flex items-center justify-between gap-2 ${
                            isCurrent
                              ? 'border-sky-500 bg-sky-500/5 dark:bg-sky-950/30'
                              : 'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 hover:border-slate-300'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => handleSelectSession(sess)}
                            className="flex-1 min-w-0 text-right space-y-0.5"
                          >
                            <div className="font-bold text-slate-900 dark:text-slate-100 truncate flex items-center gap-1">
                              {sess.isPinned && (
                                <Bookmark className="w-3 h-3 text-amber-500 fill-amber-500 shrink-0" />
                              )}
                              <span className="truncate">{sess.title}</span>
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono tabular-nums">
                              {sess.messages.length} رسالة · {sess.updatedAt.slice(0, 10)}
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteSession(sess.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg shrink-0"
                            title="حذف المحادثة"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-3.5 space-y-4 text-xs">
                {/* Strict AI Data Entry & System Protection Governance */}
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 dark:bg-slate-950 p-3 space-y-2.5">
                  <div className="font-black text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4 shrink-0" />
                    <span>ضوابط الإدخال وحماية النظام</span>
                  </div>

                  <label className="flex items-center justify-between gap-2 cursor-pointer pt-1">
                    <span className="font-bold text-slate-700 dark:text-slate-300">
                      إدخال السندات بموافقة المستخدم
                    </span>
                    <input
                      type="checkbox"
                      checked={appearance.allowAiReceiptEntry}
                      onChange={(e) =>
                        setAppearance((prev) => ({
                          ...prev,
                          allowAiReceiptEntry: e.target.checked,
                        }))
                      }
                      className="w-4 h-4 rounded text-emerald-600"
                    />
                  </label>

                  <label className="flex items-center justify-between gap-2 cursor-pointer">
                    <span className="font-bold text-slate-700 dark:text-slate-300">
                      إدخال المخزون بموافقة المستخدم
                    </span>
                    <input
                      type="checkbox"
                      checked={appearance.allowAiInventoryEntry}
                      onChange={(e) =>
                        setAppearance((prev) => ({
                          ...prev,
                          allowAiInventoryEntry: e.target.checked,
                        }))
                      }
                      className="w-4 h-4 rounded text-emerald-600"
                    />
                  </label>

                  <label className="flex items-center justify-between gap-2 cursor-pointer">
                    <span className="font-bold text-slate-700 dark:text-slate-300">
                      مطابقة تسعيرة وخدمات العيادة
                    </span>
                    <input
                      type="checkbox"
                      checked={appearance.strictCatalogValidation}
                      onChange={(e) =>
                        setAppearance((prev) => ({
                          ...prev,
                          strictCatalogValidation: e.target.checked,
                        }))
                      }
                      className="w-4 h-4 rounded text-emerald-600"
                    />
                  </label>

                  <div className="pt-1.5 border-t border-emerald-500/20 text-[10px] font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>منع الحذف أو التعديل التلقائي للنظام مفعل دائماً</span>
                  </div>
                </div>

                {/* Auto-Save Session Message Threshold */}
                <div className="space-y-1.5">
                  <label className="font-bold text-slate-700 dark:text-slate-300 block">
                    حفظ وفتح محادثة جديدة تلقائياً عند:
                  </label>
                  <select
                    value={appearance.maxMessagesPerSession}
                    onChange={(e) =>
                      setAppearance((prev) => ({
                        ...prev,
                        maxMessagesPerSession: Number(e.target.value) || 30,
                      }))
                    }
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 font-bold text-slate-900 dark:text-slate-100"
                  >
                    <option value={20}>20 رسالة</option>
                    <option value={30}>30 رسالة</option>
                    <option value={50}>50 رسالة</option>
                    <option value={100}>100 رسالة</option>
                  </select>
                </div>

                {/* Font Family */}
                <div className="space-y-1.5 pt-2 border-t border-slate-200 dark:border-slate-800">
                  <label className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Type className="w-3.5 h-3.5 text-sky-500" />
                    <span>نوع الخط</span>
                  </label>
                  <select
                    value={appearance.fontFamily}
                    onChange={(e) =>
                      setAppearance((prev) => ({
                        ...prev,
                        fontFamily: e.target.value as ChatAppearanceSettings['fontFamily'],
                      }))
                    }
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 font-bold text-slate-900 dark:text-slate-100"
                  >
                    <option value="Tajawal">Tajawal</option>
                    <option value="Cairo">Cairo</option>
                    <option value="IBM Plex Sans Arabic">IBM Plex Arabic</option>
                    <option value="Plus Jakarta Sans">Plus Jakarta</option>
                  </select>
                </div>

                {/* Font Size */}
                <div className="space-y-1.5">
                  <label className="font-bold text-slate-700 dark:text-slate-300 block">
                    حجم الخط
                  </label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {(
                      [
                        { id: 'sm', label: 'صغير' },
                        { id: 'base', label: 'متوسط' },
                        { id: 'lg', label: 'كبير' },
                        { id: 'xl', label: 'أكبر' },
                      ] as const
                    ).map((sz) => (
                      <button
                        key={sz.id}
                        type="button"
                        onClick={() =>
                          setAppearance((prev) => ({ ...prev, fontSize: sz.id }))
                        }
                        className={`py-2 rounded-lg border font-bold transition-colors ${
                          appearance.fontSize === sz.id
                            ? 'bg-sky-600 border-sky-500 text-white'
                            : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {sz.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Accent Colors */}
                <div className="space-y-1.5">
                  <label className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Palette className="w-3.5 h-3.5 text-sky-500" />
                    <span>لون المحادثة</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      Object.keys(ACCENT_THEME_MAP) as Array<
                        ChatAppearanceSettings['accentColor']
                      >
                    ).map((colorKey) => {
                      const item = ACCENT_THEME_MAP[colorKey];
                      const isSelected = appearance.accentColor === colorKey;
                      return (
                        <button
                          key={colorKey}
                          type="button"
                          onClick={() =>
                            setAppearance((prev) => ({
                              ...prev,
                              accentColor: colorKey,
                            }))
                          }
                          className={`p-2 rounded-xl border flex items-center gap-2 font-bold transition-all ${
                            isSelected
                              ? 'border-sky-500 bg-sky-500/10 text-slate-900 dark:text-white'
                              : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          <span className={`w-4 h-4 rounded-full ${item.swatch} shrink-0`} />
                          <span>{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </aside>
        </div>
      )}

      {/* Active Direct Entry Mode Indicator Banner */}
      {directEntryMode !== 'auto' && (
        <div className="shrink-0 px-4 py-1.5 bg-emerald-500/10 border-b border-emerald-500/20 flex items-center justify-between text-xs font-bold text-emerald-700 dark:text-emerald-300">
          <span>
            {directEntryMode === 'receipt'
              ? 'وضع الإدخال المباشر للسندات مفعل: اكتب تفاصيل السند أو ارفع صورة الفاتورة للمراجعة والاعتماد'
              : 'وضع الإدخال المباشر للمخزون مفعل: اكتب اسم الصنف والكمية والسعر للمراجعة والاعتماد'}
          </span>
          <button
            type="button"
            onClick={() => setDirectEntryMode('auto')}
            className="text-slate-500 hover:text-rose-600"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

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
                اختر استفساراً سريعاً من الأعلى أو اكتب سؤالك أو أدخل سنداً أو صنف مخزون مباشرة.
              </p>
            </div>
          ) : (
            <div className="space-y-3 pb-2">
              {messages.map((msg) => {
                const isImagePreview = Boolean(
                  msg.attachmentPreview &&
                    (msg.attachmentMimeType?.startsWith('image/') ||
                      msg.attachmentPreview.startsWith('data:image/'))
                );
                const isAudioPreview = Boolean(
                  msg.attachmentPreview &&
                    (msg.attachmentMimeType?.startsWith('audio/') ||
                      msg.attachmentPreview.startsWith('data:audio/'))
                );

                return (
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
                          : activeTheme.botAvatar
                      }`}
                    >
                      {msg.role === 'user' ? (
                        <User className="w-4 h-4" />
                      ) : (
                        <Bot className="w-4 h-4" />
                      )}
                    </div>

                    <div
                      className={`w-full sm:w-auto sm:max-w-[84%] rounded-2xl p-3.5 sm:p-4 ${activeFontSizeClass} space-y-2 break-words shadow-2xs ${
                        msg.role === 'user'
                          ? activeTheme.userBubble
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

                      {/* Uploaded Image Preview inside Message with Click-to-Zoom Lightbox */}
                      {isImagePreview && msg.attachmentPreview && (
                        <div className="relative group inline-block">
                          <img
                            src={msg.attachmentPreview}
                            alt={msg.attachmentName || 'صورة مرفقة'}
                            onClick={() => setLightboxImageUrl(msg.attachmentPreview!)}
                            className="max-h-60 rounded-xl border border-slate-300 dark:border-slate-700 object-contain cursor-zoom-in transition-transform hover:scale-[1.01]"
                          />
                          <button
                            type="button"
                            onClick={() => setLightboxImageUrl(msg.attachmentPreview!)}
                            className="absolute bottom-2 left-2 p-1.5 rounded-lg bg-slate-900/75 text-white hover:bg-slate-900 transition-colors"
                            title="تكبير الصورة"
                          >
                            <Maximize2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}

                      {/* Uploaded or Recorded Audio Player inside Message */}
                      {isAudioPreview && msg.attachmentPreview && (
                        <div className="pt-1">
                          <audio
                            controls
                            src={msg.attachmentPreview}
                            className="w-full max-w-xs h-9 rounded-lg"
                          />
                        </div>
                      )}

                      <div className="space-y-1.5">
                        {renderFormattedMessageText(msg.text, msg.role === 'user')}
                      </div>

                      {/* Interactive Direct Data Entry Approval Card (Receipts & Inventory) */}
                      {msg.dataEntryProposal && renderDataEntryApprovalCard(msg.dataEntryProposal)}

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

                        {/* Icon-Only Copy and Listen Buttons (No text labels) */}
                        {msg.role === 'assistant' && (
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => copyMessageText(msg.text)}
                              title="نسخ"
                              aria-label="نسخ"
                              className="p-1.5 rounded-lg hover:bg-slate-200/70 dark:hover:bg-slate-800 hover:text-sky-500 transition-colors shrink-0"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleSpeakText(msg.id, msg.text)}
                              title={speakingMsgId === msg.id ? 'إيقاف القراءة' : 'استماع'}
                              aria-label={speakingMsgId === msg.id ? 'إيقاف القراءة' : 'استماع'}
                              className={`p-1.5 rounded-lg transition-colors shrink-0 ${
                                speakingMsgId === msg.id
                                  ? 'bg-rose-500/15 text-rose-500 hover:text-rose-600 animate-pulse'
                                  : 'hover:bg-slate-200/70 dark:hover:bg-slate-800 hover:text-sky-500'
                              }`}
                            >
                              {speakingMsgId === msg.id ? (
                                <VolumeX className="w-3.5 h-3.5" />
                              ) : (
                                <Volume2 className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {isSending && (
            <div className="flex items-center gap-2 text-sky-600 dark:text-sky-400 py-1.5 px-3">
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
            </div>
          )}
        </div>
      </div>

      {/* Rich Attachment Preview Bar (Image Thumbnail + Zoom OR Audio Player before sending) */}
      {attachment && (
        <div className="shrink-0 px-4 py-2.5 bg-sky-50/90 dark:bg-sky-950/60 border-t border-sky-200 dark:border-sky-900 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {attachment.mimeType.startsWith('image/') ? (
              <div className="relative group shrink-0">
                <img
                  src={attachment.base64Data}
                  alt={attachment.name}
                  onClick={() => setLightboxImageUrl(attachment.base64Data)}
                  className="w-14 h-14 rounded-xl border border-sky-300 dark:border-sky-700 object-cover cursor-zoom-in"
                />
                <button
                  type="button"
                  onClick={() => setLightboxImageUrl(attachment.base64Data)}
                  className="absolute bottom-1 left-1 p-1 rounded bg-slate-900/75 text-white"
                  title="معاينة وتكبير الصورة"
                >
                  <Maximize2 className="w-3 h-3" />
                </button>
              </div>
            ) : attachment.mimeType.startsWith('audio/') ? (
              <audio
                controls
                src={attachment.base64Data}
                className="h-9 max-w-[240px] sm:max-w-xs rounded-lg shrink-0"
              />
            ) : (
              <FileText className="w-5 h-5 text-sky-600 shrink-0" />
            )}

            <div className="min-w-0">
              <div className="font-bold text-sky-900 dark:text-sky-200 truncate">
                {attachment.name}
              </div>
              {attachment.mimeType.startsWith('image/') && (
                <button
                  type="button"
                  onClick={() => setLightboxImageUrl(attachment.base64Data)}
                  className="text-[11px] font-bold text-sky-600 dark:text-sky-400 hover:underline"
                >
                  اضغط لعرض الصورة بحجم كامل
                </button>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setAttachment(null)}
            className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-500/10"
            title="إزالة المرفق"
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
            accept="image/*,audio/*,application/pdf"
            onChange={handleFileChange}
            className="hidden"
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 hover:border-sky-500 shrink-0 transition-colors"
            title="إرفاق صورة أو ملف صوتي"
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
              isListening
                ? 'المسجل الصوتي نشط (يتوقف عند النقر على إرسال)'
                : 'تشغيل الإملاء الصوتي المستمر'
            }
          >
            <Mic className="w-4 h-4" />
          </button>

          <input
            type="text"
            value={input}
            onChange={(e) => {
              const nextVal = e.target.value;
              setInput(nextVal);
              latestInputRef.current = nextVal;
              accumulatedTranscriptRef.current = nextVal;
              currentSessionFinalRef.current = '';
              if (isListening || shouldKeepListeningRef.current) {
                recognitionSessionTokenRef.current += 1;
                try {
                  recognitionRef.current?.stop();
                } catch {
                  // Ignore
                }
                if (restartTimerRef.current) {
                  window.clearTimeout(restartTimerRef.current);
                }
                restartTimerRef.current = window.setTimeout(() => {
                  if (shouldKeepListeningRef.current) {
                    launchBrowserRecognitionSession();
                  }
                }, 80);
              }
            }}
            placeholder={
              isListening
                ? 'جارٍ الاستماع المستمر... تحدث ثم اضغط إرسال عند الانتهاء'
                : directEntryMode === 'receipt'
                  ? 'اكتب بيانات السند (مثال: سند للمريض محمد 20000 زيركون)...'
                  : directEntryMode === 'inventory'
                    ? 'اكتب بيانات الصنف (مثال: أضف 5 علب كمبوزت بسعر 8000)...'
                    : 'اكتب سؤالك الطبي أو المالي أو أدخل سنداً مباشرة...'
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
              disabled={!input.trim() && !attachment && !isListening}
              aria-label="إرسال"
              title="إرسال"
              className={`w-9 h-9 sm:w-10 sm:h-10 inline-flex items-center justify-center text-white ${activeTheme.sendBtn} disabled:opacity-50 rounded-xl shrink-0 transition-colors shadow-xs`}
            >
              <Send className="w-4 h-4" />
            </button>
          )}
        </div>
      </form>

      {/* Full-Screen Image Lightbox Modal for Viewing Uploaded Images */}
      {lightboxImageUrl && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setLightboxImageUrl(null)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setLightboxImageUrl(null)}
              className="absolute -top-3 -left-3 p-2 rounded-full bg-rose-600 hover:bg-rose-500 text-white shadow-lg"
              title="إغلاق"
            >
              <X className="w-4 h-4" />
            </button>
            <img
              src={lightboxImageUrl}
              alt="عرض كامل للصورة"
              className="max-w-full max-h-[85vh] rounded-2xl border border-slate-700 object-contain shadow-2xl"
            />
          </div>
        </div>
      )}
    </div>
  );
};
