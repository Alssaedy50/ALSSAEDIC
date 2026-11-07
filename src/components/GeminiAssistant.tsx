import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  Copy,
  ImagePlus,
  Loader2,
  Mic,
  MicOff,
  Send,
  Trash2,
  User,
  Volume2,
  X,
} from 'lucide-react';
import {
  ChatMessage,
  ClinicSettings,
  CurrencyFinancialSummary,
  ExpenseRecord,
  InventoryItem,
  ReceiptRecord,
} from '../types/clinic';
import { queryClinicAssistantDetailed } from '../utils/aiClient';

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
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);

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
        currencySummaries,
        financialSummary: {
          totalReceipts: receipts.length,
          byCurrency: currencySummaries,
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

      const assistantResult = await queryClinicAssistantDetailed({
        prompt: userMsg.text,
        clinicContext,
        history: messages.slice(-6).map((m) => ({ role: m.role, text: m.text })),
        attachment: sentAttachment,
        taskType: 'chat',
      });

      const assistantMsg: ChatMessage = {
        id: 'msg_a_' + Date.now(),
        role: 'assistant',
        text: assistantResult.reply || 'تمت المعالجة.',
        timestamp: new Date().toLocaleTimeString('ar-YE', { hour: '2-digit', minute: '2-digit' }),
        modelUsed: assistantResult.modelLabel,
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

  return (
    <div className="flex-1 min-h-0 w-full h-full sm:rounded-2xl border-0 sm:border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col overflow-hidden sm:shadow-xs">
      {/* Quick Prompts Strip + Clear Chat Action */}
      <div className="shrink-0 px-3 sm:px-4 py-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/60 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
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
                          onClick={() => speakText(msg.text)}
                          className="inline-flex items-center gap-1 hover:text-sky-500 font-bold whitespace-nowrap shrink-0"
                        >
                          <Volume2 className="w-3 h-3" />
                          <span>استماع</span>
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
            <div className="flex items-center gap-2 text-xs font-bold text-sky-600 dark:text-sky-400 px-2 py-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>جاري التحليل...</span>
            </div>
          )}
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

      {/* Bottom Composer Bar with Expanded Input & Sleek Icon-Only Send Button */}
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
            onClick={toggleVoiceInput}
            className={`w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-xl border shrink-0 transition-colors ${
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
            placeholder="اكتب سؤالك الطبي أو المالي..."
            className="flex-1 min-w-0 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs sm:text-sm font-medium text-slate-900 dark:text-slate-100 focus:border-sky-500 focus:outline-none"
          />

          <button
            type="submit"
            disabled={isSending || (!input.trim() && !attachment)}
            aria-label="إرسال"
            title="إرسال"
            className="w-9 h-9 sm:w-10 sm:h-10 inline-flex items-center justify-center text-white bg-sky-600 hover:bg-sky-500 disabled:opacity-50 rounded-xl shrink-0 transition-colors shadow-xs"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  );
};
