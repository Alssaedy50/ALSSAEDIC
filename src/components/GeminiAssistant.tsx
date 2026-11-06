import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Bot,
  Copy,
  ImagePlus,
  Loader2,
  Menu,
  Mic,
  MicOff,
  Send,
  Sparkles,
  Trash2,
  User,
  Volume2,
  X,
} from 'lucide-react';
import {
  ChatMessage,
  ClinicSettings,
  ExpenseRecord,
  InventoryItem,
  ReceiptRecord,
} from '../types/clinic';
import { queryClinicAssistant } from '../utils/aiClient';

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
  notify: (message: string, type?: 'success' | 'warning' | 'error' | 'info') => void;
}

const QUICK_PROMPTS = [
  'كشف ديون المرضى بالتفصيل',
  'تقرير نواقص المخزون الطبي',
  'ملخص صافي الأرباح والمصروفات',
  'تعليمات للمريض بعد خلع الضرس',
  'خطة علاج عصب للسن 16',
];

export const GeminiAssistant: React.FC<GeminiAssistantProps> = ({
  settings,
  receipts,
  inventory,
  expenses,
  messages,
  onAddMessage,
  onClearMessages,
  onExitFullScreen,
  onOpenMenu,
  notify,
}) => {
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [attachment, setAttachment] = useState<{
    name: string;
    mimeType: string;
    base64Data: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setAttachment({
        name: file.name,
        mimeType: file.type || 'image/jpeg',
        base64Data: String(reader.result || ''),
      });
      notify(`تم إرفاق: ${file.name}`, 'info');
    };
    reader.readAsDataURL(file);
  };

  const speakText = (text: string) => {
    if (!('speechSynthesis' in window)) {
      notify('المتصفح لا يدعم القراءة الصوتية', 'warning');
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text.replace(/[*#_`-]/g, ' '));
    utterance.lang = 'ar-SA';
    window.speechSynthesis.speak(utterance);
  };

  const copyMessageText = (text: string) => {
    navigator.clipboard
      ?.writeText(text)
      .then(() => notify('تم نسخ الرد للحافظة', 'success'))
      .catch(() => {});
  };

  const toggleVoiceInput = () => {
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
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
      notify('المتصفح لا يدعم الإملاء الصوتي', 'warning');
      return;
    }

    try {
      const rec = new SpeechRec() as {
        lang: string;
        continuous: boolean;
        interimResults: boolean;
        onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
        onerror: (() => void) | null;
        onend: (() => void) | null;
        start: () => void;
        stop: () => void;
      };
      rec.lang = 'ar-YE';
      rec.continuous = false;
      rec.interimResults = false;
      rec.onresult = (event) => {
        const transcript = event.results?.[0]?.[0]?.transcript || '';
        if (transcript.trim()) {
          setInput((prev) => (prev ? `${prev} ${transcript.trim()}` : transcript.trim()));
        }
      };
      rec.onerror = () => setIsListening(false);
      rec.onend = () => setIsListening(false);
      recognitionRef.current = rec;
      setIsListening(true);
      rec.start();
    } catch {
      setIsListening(false);
    }
  };

  const sendMessage = async (textOverride?: string) => {
    const promptText = (textOverride ?? input).trim();
    if (!promptText && !attachment) return;

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

    try {
      const debtors = receipts.filter((r) => (Number(r.remainingAmount) || 0) > 0);
      const lowStock = inventory.filter((i) => Number(i.qty) <= Number(i.minQty));

      const clinicContext = {
        identity: settings.identity,
        servicesCatalog: settings.services,
        financialSummary: {
          totalReceipts: receipts.length,
          totalBilled: receipts.reduce((s, r) => s + (Number(r.totalAmount) || 0), 0),
          totalCollected: receipts.reduce((s, r) => s + (Number(r.paidAmount) || 0), 0),
          totalPendingDebts: receipts.reduce((s, r) => s + (Number(r.remainingAmount) || 0), 0),
          totalExpenses: expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0),
        },
        pendingDebtsPatients: debtors.map((r) => ({
          receiptNo: r.receiptNo,
          patientName: r.patientName,
          phone: r.patientPhone,
          remainingAmount: r.remainingAmount,
          currency: r.currency,
          date: r.date,
        })),
        recentReceipts: receipts.slice(0, 12).map((r) => ({
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
        inventoryStatus: inventory,
        lowStockAlerts: lowStock,
        recentExpenses: expenses.slice(0, 12),
      };

      const replyText = await queryClinicAssistant({
        prompt: userMsg.text,
        clinicContext,
        history: messages.slice(-6).map((m) => ({ role: m.role, text: m.text })),
        attachment: sentAttachment,
        taskType: 'chat',
      });

      const assistantMsg: ChatMessage = {
        id: 'msg_a_' + Date.now(),
        role: 'assistant',
        text: replyText || 'تمت المعالجة.',
        timestamp: new Date().toLocaleTimeString('ar-YE', { hour: '2-digit', minute: '2-digit' }),
      };
      onAddMessage(assistantMsg);
    } catch (err: unknown) {
      const errMsg: ChatMessage = {
        id: 'msg_err_' + Date.now(),
        role: 'assistant',
        text: err instanceof Error ? `خطأ: ${err.message}` : 'تعذر الاتصال بخادم التحليل.',
        timestamp: new Date().toLocaleTimeString('ar-YE', { hour: '2-digit', minute: '2-digit' }),
      };
      onAddMessage(errMsg);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 w-full h-[100dvh] bg-white dark:bg-slate-950 flex flex-col overflow-hidden">
      {/* Full-Screen Top Navigation Bar */}
      <header className="shrink-0 h-14 px-3 sm:px-6 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {onOpenMenu && (
            <button
              type="button"
              onClick={onOpenMenu}
              className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 text-xs font-bold shrink-0"
            >
              <Menu className="w-4 h-4 text-sky-500" />
              <span>القائمة</span>
            </button>
          )}

          <div className="w-8 h-8 rounded-xl bg-sky-600 text-white flex items-center justify-center shrink-0 shadow-xs">
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xs sm:text-sm font-black text-slate-900 dark:text-slate-100 truncate">
              المساعد الطبي والمالي الذكي
            </h2>
            <p className="text-[10px] sm:text-[11px] font-bold text-sky-600 dark:text-sky-400 truncate">
              شاشة كاملة — Gemini 3.8 Flash
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {messages.length > 0 && (
            <button
              type="button"
              onClick={onClearMessages}
              className="inline-flex items-center gap-1 px-2.5 py-2 text-xs font-bold text-rose-600 dark:text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 rounded-xl shrink-0 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden xs:inline">مسح</span>
            </button>
          )}

          {onExitFullScreen && (
            <button
              type="button"
              onClick={onExitFullScreen}
              className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 text-xs font-bold transition-colors shrink-0"
            >
              <ArrowRight className="w-3.5 h-3.5 text-sky-500" />
              <span>رجوع للسند</span>
            </button>
          )}
        </div>
      </header>

      {/* Quick Prompts Strip */}
      <div className="shrink-0 px-3 sm:px-6 py-2.5 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/80 dark:bg-slate-900/60 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        {QUICK_PROMPTS.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => sendMessage(q)}
            disabled={isSending}
            className="shrink-0 px-3 py-1.5 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 hover:border-sky-500 hover:text-sky-600 dark:hover:text-sky-400 transition-colors"
          >
            {q}
          </button>
        ))}
      </div>

      {/* Full-Screen Scrollable Messages Area */}
      <div className="flex-1 overflow-y-auto px-3 sm:px-6 py-4">
        <div className="max-w-4xl mx-auto h-full space-y-4">
          {messages.length === 0 ? (
            <div className="min-h-[60vh] flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-3 px-4">
              <div className="w-14 h-14 rounded-2xl bg-sky-500/10 border border-sky-500/30 text-sky-600 dark:text-sky-400 flex items-center justify-center shadow-xs">
                <Bot className="w-7 h-7" />
              </div>
              <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-slate-100">
                مساعد عيادة السعيدي الذكي (شاشة كاملة)
              </h3>
              <p className="text-xs sm:text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                متصل مباشرة بقاعدة بيانات المرضى، السندات، الديون، والمخزون الطبي. يمكنك الاستفسار عن أي حساب مالي أو إرفاق صورة أشعة سنية أو تقرير طبي لتحليله بدقة.
              </p>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex items-start gap-2.5 sm:gap-3 ${
                  msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                    msg.role === 'user'
                      ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
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
                  className={`max-w-[88%] sm:max-w-[80%] rounded-2xl p-3.5 sm:p-4 text-xs sm:text-sm leading-relaxed space-y-2 break-words shadow-2xs ${
                    msg.role === 'user'
                      ? 'bg-sky-600 text-white'
                      : 'bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100'
                  }`}
                >
                  {msg.attachmentPreview && (
                    <img
                      src={msg.attachmentPreview}
                      alt="مرفق"
                      className="max-h-56 rounded-xl border border-slate-300 dark:border-slate-700 object-contain"
                    />
                  )}
                  <div className="whitespace-pre-line">{msg.text}</div>
                  <div
                    className={`flex items-center justify-between gap-4 pt-1.5 border-t text-[10px] ${
                      msg.role === 'user'
                        ? 'border-white/20 text-white/80'
                        : 'border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    <span className="font-mono tabular-nums">{msg.timestamp}</span>
                    {msg.role === 'assistant' && (
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => copyMessageText(msg.text)}
                          className="inline-flex items-center gap-1 hover:text-sky-500 font-bold"
                        >
                          <Copy className="w-3 h-3" />
                          <span>نسخ</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => speakText(msg.text)}
                          className="inline-flex items-center gap-1 hover:text-sky-500 font-bold"
                        >
                          <Volume2 className="w-3 h-3" />
                          <span>استماع</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}

          {isSending && (
            <div className="flex items-center gap-2 text-xs font-bold text-sky-600 dark:text-sky-400 px-2 py-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>جاري التحليل وإعداد الإجابة...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Attachment Preview Bar */}
      {attachment && (
        <div className="shrink-0 px-4 py-2 bg-sky-50 dark:bg-sky-950/60 border-t border-sky-200 dark:border-sky-900 flex items-center justify-between text-xs">
          <span className="font-bold text-sky-800 dark:text-sky-300 truncate">
            مرفق جاهز للتحليل: {attachment.name}
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

      {/* Full-Screen Bottom Composer Bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          sendMessage();
        }}
        className="shrink-0 p-3 sm:px-6 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
      >
        <div className="max-w-4xl mx-auto flex items-center gap-2">
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
            className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 hover:border-sky-500 shrink-0 transition-colors"
            title="إرفاق صورة أشعة أو ملف"
          >
            <ImagePlus className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={toggleVoiceInput}
            className={`p-2.5 rounded-xl border shrink-0 transition-colors ${
              isListening
                ? 'bg-rose-600 border-rose-500 text-white animate-pulse'
                : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 hover:border-sky-500'
            }`}
            title="إملاء صوتي"
          >
            {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>

          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="اسأل عن مريض، سند، ديون، مخزون، أو أرفق صورة أشعة..."
            className="flex-1 min-w-0 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 text-xs sm:text-sm font-medium text-slate-900 dark:text-slate-100 focus:border-sky-500 focus:outline-none"
          />

          <button
            type="submit"
            disabled={isSending || (!input.trim() && !attachment)}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs sm:text-sm font-black text-white bg-sky-600 hover:bg-sky-500 disabled:opacity-50 rounded-xl shrink-0 transition-colors shadow-xs"
          >
            <Send className="w-4 h-4" />
            <span>إرسال</span>
          </button>
        </div>
      </form>
    </div>
  );
};
