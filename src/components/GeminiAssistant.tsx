import React, { useRef, useState } from 'react';
import {
  Bot,
  ImagePlus,
  Loader2,
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

interface GeminiAssistantProps {
  settings: ClinicSettings;
  receipts: ReceiptRecord[];
  inventory: InventoryItem[];
  expenses: ExpenseRecord[];
  messages: ChatMessage[];
  onAddMessage: (msg: ChatMessage) => void;
  onClearMessages: () => void;
  notify: (message: string, type?: 'success' | 'warning' | 'error' | 'info') => void;
}

const QUICK_PROMPTS = [
  'كشف ديون المرضى',
  'نواقص المخزون',
  'ملخص الأرباح',
  'تعليمات بعد الخلع',
];

export const GeminiAssistant: React.FC<GeminiAssistantProps> = ({
  settings,
  receipts,
  inventory,
  expenses,
  messages,
  onAddMessage,
  onClearMessages,
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
        recentReceipts: receipts.slice(0, 15),
        inventoryStatus: inventory,
        lowStockAlerts: lowStock,
        recentExpenses: expenses.slice(0, 15),
      };

      const response = await fetch('/api/gemini/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: userMsg.text,
          clinicContext,
          history: messages.slice(-6).map((m) => ({ role: m.role, text: m.text })),
          attachment: sentAttachment,
          taskType: 'chat',
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'تعذر الحصول على رد');
      }

      const assistantMsg: ChatMessage = {
        id: 'msg_a_' + Date.now(),
        role: 'assistant',
        text: data.reply || 'تمت المعالجة.',
        timestamp: new Date().toLocaleTimeString('ar-YE', { hour: '2-digit', minute: '2-digit' }),
      };
      onAddMessage(assistantMsg);
    } catch (err: unknown) {
      const errMsg: ChatMessage = {
        id: 'msg_err_' + Date.now(),
        role: 'assistant',
        text: err instanceof Error ? `خطأ: ${err.message}` : 'تعذر الاتصال بخادم Gemini.',
        timestamp: new Date().toLocaleTimeString('ar-YE', { hour: '2-digit', minute: '2-digit' }),
      };
      onAddMessage(errMsg);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col h-[calc(100vh-8.5rem)] min-h-[480px] overflow-hidden">
      {/* Compact Header */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-sky-600 text-white flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
              المساعد الذكي
            </h2>
            <p className="text-[11px] text-slate-500 truncate">Gemini 3.8 Flash</p>
          </div>
        </div>

        {messages.length > 0 && (
          <button
            type="button"
            onClick={onClearMessages}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-lg shrink-0"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>مسح</span>
          </button>
        )}
      </div>

      {/* Quick Prompts */}
      <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 flex flex-wrap items-center gap-1.5">
        {QUICK_PROMPTS.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => sendMessage(q)}
            disabled={isSending}
            className="px-2.5 py-1 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:border-sky-400"
          >
            {q}
          </button>
        ))}
      </div>

      {/* Messages List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center max-w-sm mx-auto space-y-2 py-6">
            <div className="w-11 h-11 rounded-xl bg-sky-50 dark:bg-sky-950/60 border border-sky-200 dark:border-sky-800 text-sky-600 dark:text-sky-400 flex items-center justify-center">
              <Bot className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              مساعد عيادة السعيدي
            </h3>
            <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              اسأل عن أي مريض، سند، ديون، مخزون، أو أرفق صورة أشعة للتحليل المباشر.
            </p>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex items-start gap-2.5 ${
                msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'
              }`}
            >
              <div
                className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                  msg.role === 'user'
                    ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                    : 'bg-sky-600 text-white'
                }`}
              >
                {msg.role === 'user' ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
              </div>

              <div
                className={`max-w-[85%] rounded-xl p-3 text-xs sm:text-sm leading-relaxed space-y-1.5 break-words ${
                  msg.role === 'user'
                    ? 'bg-slate-900 text-white dark:bg-slate-800 dark:text-slate-100'
                    : 'bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200'
                }`}
              >
                {msg.attachmentPreview && (
                  <img
                    src={msg.attachmentPreview}
                    alt="مرفق"
                    className="max-h-40 rounded-lg border border-slate-300 dark:border-slate-700 object-contain"
                  />
                )}
                <div className="whitespace-pre-line">{msg.text}</div>
                <div className="flex items-center justify-between gap-3 pt-1 text-[10px] opacity-70">
                  <span className="font-mono tabular-nums">{msg.timestamp}</span>
                  {msg.role === 'assistant' && (
                    <button
                      type="button"
                      onClick={() => speakText(msg.text)}
                      className="inline-flex items-center gap-1 hover:underline"
                    >
                      <Volume2 className="w-3 h-3" />
                      <span>نطق</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}

        {isSending && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin text-sky-600" />
            <span>جاري التحليل...</span>
          </div>
        )}
      </div>

      {attachment && (
        <div className="px-4 py-1.5 bg-sky-50 dark:bg-sky-950/50 border-t border-sky-200 dark:border-sky-900 flex items-center justify-between text-xs">
          <span className="font-bold text-sky-800 dark:text-sky-300 truncate">
            {attachment.name}
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

      {/* Mobile-Safe Composer Bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          sendMessage();
        }}
        className="p-3 border-t border-slate-200 dark:border-slate-800 flex items-center gap-1.5"
      >
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
          className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-300 shrink-0"
          title="إرفاق صورة"
        >
          <ImagePlus className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={toggleVoiceInput}
          className={`p-2 rounded-lg border shrink-0 ${
            isListening
              ? 'bg-rose-600 border-rose-500 text-white'
              : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-300'
          }`}
          title="صوت"
        >
          {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
        </button>

        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="اكتب سؤالك هنا..."
          className="flex-1 min-w-0 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:border-sky-500 focus:outline-none"
        />

        <button
          type="submit"
          disabled={isSending || (!input.trim() && !attachment)}
          className="inline-flex items-center justify-center gap-1 px-3 py-2 text-xs font-bold text-white bg-sky-600 hover:bg-sky-500 disabled:opacity-50 rounded-lg shrink-0"
        >
          <Send className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">إرسال</span>
        </button>
      </form>
    </div>
  );
};
