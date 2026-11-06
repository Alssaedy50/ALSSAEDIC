import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronDown,
  Eye,
  FileText,
  Loader2,
  Mic,
  MicOff,
  PenTool,
  RotateCcw,
  Save,
  Sparkles,
  Stethoscope,
  X,
} from 'lucide-react';
import {
  ClinicSettings,
  CurrencyCode,
  PaperFormat,
  ReceiptRecord,
} from '../types/clinic';
import { CURRENCIES, PAYMENT_METHODS } from '../data/defaultData';
import { numberToArabicWords, parseFDIToothNumbers } from '../utils/arabicTafqeet';
import { SignatureModal } from './SignatureModal';
import { FdiToothModal } from './FdiToothModal';
import { OfficialReceiptCard, ReceiptDisplayData } from './OfficialReceiptCard';

interface ReceiptStudioProps {
  settings: ClinicSettings;
  receipts: ReceiptRecord[];
  editingReceipt: ReceiptRecord | null;
  nextReceiptNo: number;
  onSaveReceipt: (payload: Omit<ReceiptRecord, 'id'> & { id?: string }) => ReceiptRecord;
  onClearEditing: () => void;
  onUpdatePermanentSig: (sigDataUrl: string) => void;
  notify: (message: string, type?: 'success' | 'warning' | 'error' | 'info') => void;
}

export const ReceiptStudio: React.FC<ReceiptStudioProps> = ({
  settings,
  receipts,
  editingReceipt,
  nextReceiptNo,
  onSaveReceipt,
  onClearEditing,
  onUpdatePermanentSig,
  notify,
}) => {
  const [subTab, setSubTab] = useState<'form' | 'preview'>('form');

  const [receiptNo, setReceiptNo] = useState<number>(nextReceiptNo);
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [patientName, setPatientName] = useState<string>('');
  const [patientPhone, setPatientPhone] = useState<string>('');
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [toothFDI, setToothFDI] = useState<string>('');
  const [totalAmount, setTotalAmount] = useState<number>(0);
  const [paidAmount, setPaidAmount] = useState<number>(0);
  const [currency, setCurrency] = useState<CurrencyCode | string>(
    settings.identity.defaultCurrency || 'ريال يمني'
  );
  const [paymentMethod, setPaymentMethod] = useState<string>('نقداً (Cash)');
  const [notes, setNotes] = useState<string>('');
  const [paperFormat, setPaperFormat] = useState<PaperFormat>('a5');
  const [accountantSig, setAccountantSig] = useState<string>(
    settings.appearance.permanentAccountantSig || ''
  );
  const [receiverSig, setReceiverSig] = useState<string>('');

  // Smart AI input & Voice dictation
  const [smartInput, setSmartInput] = useState<string>('');
  const [isParsingAI, setIsParsingAI] = useState<boolean>(false);
  const [isListening, setIsListening] = useState<boolean>(false);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);

  // Pop-up Modals
  const [isServicesModalOpen, setIsServicesModalOpen] = useState<boolean>(false);
  const [isFdiModalOpen, setIsFdiModalOpen] = useState<boolean>(false);
  const [sigModalTarget, setSigModalTarget] = useState<'accountant' | 'receiver' | null>(null);

  useEffect(() => {
    if (editingReceipt) {
      setReceiptNo(editingReceipt.receiptNo);
      setDate(editingReceipt.date);
      setPatientName(editingReceipt.patientName);
      setPatientPhone(editingReceipt.patientPhone);
      setSelectedServices(editingReceipt.services || []);
      setToothFDI(editingReceipt.toothFDI || '');
      setTotalAmount(editingReceipt.totalAmount);
      setPaidAmount(editingReceipt.paidAmount);
      setCurrency(editingReceipt.currency || settings.identity.defaultCurrency);
      setPaymentMethod(editingReceipt.paymentMethod || 'نقداً (Cash)');
      setNotes(editingReceipt.notes || '');
      setPaperFormat(editingReceipt.paperFormat || 'a5');
      setAccountantSig(
        editingReceipt.accountantSig || settings.appearance.permanentAccountantSig || ''
      );
      setReceiverSig(editingReceipt.receiverSig || '');
    } else {
      setReceiptNo(nextReceiptNo);
    }
  }, [
    editingReceipt,
    nextReceiptNo,
    settings.identity.defaultCurrency,
    settings.appearance.permanentAccountantSig,
  ]);

  const remainingAmount = Math.max(0, (Number(totalAmount) || 0) - (Number(paidAmount) || 0));
  const amountWords = useMemo(
    () => numberToArabicWords(paidAmount, String(currency)),
    [paidAmount, currency]
  );

  const uniquePatients = useMemo(() => {
    const map = new Map<string, string>();
    receipts.forEach((r) => {
      if (r.patientName && !map.has(r.patientName)) {
        map.set(r.patientName, r.patientPhone || '');
      }
    });
    return Array.from(map.entries()).map(([name, phone]) => ({ name, phone }));
  }, [receipts]);

  const patientPreviousDebt = useMemo(() => {
    const cleanName = patientName.trim();
    if (!cleanName || !settings.features.debtAlert) return 0;
    return receipts
      .filter(
        (r) =>
          r.patientName.trim() === cleanName &&
          (!editingReceipt || r.id !== editingReceipt.id) &&
          r.remainingAmount > 0
      )
      .reduce((sum, r) => sum + (Number(r.remainingAmount) || 0), 0);
  }, [patientName, receipts, editingReceipt, settings.features.debtAlert]);

  const handleToggleService = (serviceName: string, price: number) => {
    setSelectedServices((prev) => {
      const exists = prev.includes(serviceName);
      const next = exists ? prev.filter((s) => s !== serviceName) : [...prev, serviceName];

      if (settings.features.autoPrice) {
        const nextTotal = next.reduce((sum, name) => {
          const found = settings.services.find((srv) => srv.name === name);
          return sum + (found ? Number(found.price) || 0 : 0);
        }, 0);
        setTotalAmount(nextTotal);
        setPaidAmount(nextTotal);
      } else if (!exists && totalAmount === 0) {
        setTotalAmount(price);
        setPaidAmount(price);
      }
      return next;
    });
  };

  const resetForm = () => {
    onClearEditing();
    setReceiptNo(nextReceiptNo);
    setDate(new Date().toISOString().slice(0, 10));
    setPatientName('');
    setPatientPhone('');
    setSelectedServices([]);
    setToothFDI('');
    setTotalAmount(0);
    setPaidAmount(0);
    setCurrency(settings.identity.defaultCurrency || 'ريال يمني');
    setPaymentMethod('نقداً (Cash)');
    setNotes('');
    setSmartInput('');
    setReceiverSig('');
    setAccountantSig(settings.appearance.permanentAccountantSig || '');
  };

  const applyLocalHeuristic = (raw: string) => {
    let extractedName = '';
    const nameMatch = raw.match(
      /(?:للمريض|مريض|باسم|الأخ|الاخ|المريضة)\s+([^\d،,]+?)(?=\s+(?:خدمة|علاج|حشو|خلع|عصب|تنظيف|تركيب|تقويم|كشف|أشعة|اشعة|بمبلغ|مبلغ|إجمالي|اجمالي|دفع|سدد|رقم|هاتف|جوال|$))/i
    );
    if (nameMatch?.[1]) {
      extractedName = nameMatch[1].trim();
    } else {
      const words = raw
        .replace(/سند|قبض|جديد|للمريض|مريض/g, '')
        .trim()
        .split(/\s+/)
        .slice(0, 3)
        .join(' ');
      if (words && !/\d/.test(words)) extractedName = words;
    }

    const phoneMatch = raw.match(/(?:\+?967|0)?(7\d{8})/);
    const extractedPhone = phoneMatch ? phoneMatch[0] : '';

    const matchedServices: string[] = [];
    let calculatedPrice = 0;
    settings.services.forEach((srv) => {
      const allTerms = [srv.name, ...(srv.keywords || [])];
      if (allTerms.some((term) => term && raw.includes(term))) {
        matchedServices.push(srv.name);
        calculatedPrice += Number(srv.price) || 0;
      }
    });

    const totalMatch = raw.match(/(?:بمبلغ|مبلغ|إجمالي|اجمالي)\s*(\d+)/);
    const paidMatch = raw.match(/(?:دفع|سدد|المدفوع|استلمنا)\s*(\d+)/);

    const finalTotal = totalMatch ? Number(totalMatch[1]) : calculatedPrice;
    const finalPaid = paidMatch ? Number(paidMatch[1]) : finalTotal;

    if (extractedName) setPatientName(extractedName);
    if (extractedPhone) setPatientPhone(extractedPhone);
    if (matchedServices.length > 0) setSelectedServices(matchedServices);
    if (finalTotal > 0) setTotalAmount(finalTotal);
    if (finalPaid >= 0 && (paidMatch || finalTotal > 0)) setPaidAmount(finalPaid);
  };

  const handleSmartParse = async (textOverride?: string) => {
    const textToAnalyze = (textOverride ?? smartInput).trim();
    if (!textToAnalyze) {
      notify('اكتب أو تحدث بتفاصيل السند أولاً', 'warning');
      return;
    }

    setIsParsingAI(true);
    try {
      const response = await fetch('/api/gemini/parse-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: textToAnalyze,
          availableServices: settings.services,
          defaultCurrency: settings.identity.defaultCurrency,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.result) {
        throw new Error(data.error || 'تعذر التحليل');
      }

      const r = data.result;
      if (r.patientName) setPatientName(r.patientName);
      if (r.patientPhone) setPatientPhone(r.patientPhone);

      let computedServicesTotal = 0;
      if (Array.isArray(r.services) && r.services.length > 0) {
        setSelectedServices(r.services);
        computedServicesTotal = r.services.reduce((sum: number, name: string) => {
          const found = settings.services.find((s) => s.name === name);
          return sum + (found ? Number(found.price) || 0 : 0);
        }, 0);
      }

      if (r.toothFDI) setToothFDI(r.toothFDI);

      const resolvedTotal =
        Number(r.totalAmount) > 0 ? Number(r.totalAmount) : computedServicesTotal;
      const resolvedPaid =
        r.paidAmount !== undefined && Number(r.paidAmount) > 0
          ? Number(r.paidAmount)
          : resolvedTotal;

      if (resolvedTotal > 0) setTotalAmount(resolvedTotal);
      if (resolvedPaid >= 0) setPaidAmount(resolvedPaid);
      if (r.currency && CURRENCIES.includes(r.currency)) setCurrency(r.currency);
      if (r.paymentMethod) setPaymentMethod(r.paymentMethod);
      if (r.notes) setNotes(r.notes);

      notify('تم تعبئة السند ذكياً عبر Gemini', 'success');
    } catch {
      applyLocalHeuristic(textToAnalyze);
      notify('تم استخراج بيانات السند تلقائياً', 'info');
    } finally {
      setIsParsingAI(false);
    }
  };

  const toggleVoiceDictation = () => {
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
      notify('المتصفح لا يدعم الإملاء الصوتي المباشر', 'warning');
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
          setSmartInput(transcript.trim());
          handleSmartParse(transcript.trim());
        }
      };

      rec.onerror = () => setIsListening(false);
      rec.onend = () => setIsListening(false);

      recognitionRef.current = rec;
      setIsListening(true);
      rec.start();
    } catch {
      setIsListening(false);
      notify('تعذر تشغيل المايكروفون', 'error');
    }
  };

  const handleSave = () => {
    if (!patientName.trim()) {
      notify('يرجى إدخال اسم المريض أولاً', 'warning');
      return null;
    }

    const parsedFdi = parseFDIToothNumbers(toothFDI);
    if (parsedFdi.invalid.length > 0) {
      notify(`أرقام FDI غير صحيحة: ${parsedFdi.invalid.join(', ')}`, 'warning');
      return null;
    }

    const saved = onSaveReceipt({
      id: editingReceipt?.id,
      receiptNo,
      date,
      patientName: patientName.trim(),
      patientPhone: patientPhone.trim(),
      services: selectedServices,
      toothFDI: parsedFdi.values.join(', '),
      totalAmount: Number(totalAmount) || 0,
      paidAmount: Number(paidAmount) || 0,
      remainingAmount,
      currency,
      paymentMethod,
      notes: notes.trim(),
      amountWords,
      accountantSig,
      receiverSig,
      paperFormat,
    });

    if (!editingReceipt) {
      resetForm();
    }
    return saved;
  };

  const receiptDisplayData: ReceiptDisplayData = {
    receiptNo,
    date,
    patientName,
    patientPhone,
    services: selectedServices,
    toothFDI,
    totalAmount,
    paidAmount,
    remainingAmount,
    currency: String(currency),
    paymentMethod,
    notes,
    amountWords,
    accountantSig,
    receiverSig,
    paperFormat,
  };

  const selectedTeethList = useMemo(
    () => parseFDIToothNumbers(toothFDI).values,
    [toothFDI]
  );

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {/* Top 2-Tab Segmented Switcher (بيانات السند vs معاينة السند) */}
      <div className="grid grid-cols-2 gap-1.5 p-1.5 rounded-xl bg-slate-200/70 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 no-print">
        <button
          type="button"
          onClick={() => setSubTab('form')}
          className={`inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-bold transition-colors ${
            subTab === 'form'
              ? 'bg-sky-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>بيانات السند</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('preview')}
          className={`inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-bold transition-colors ${
            subTab === 'preview'
              ? 'bg-sky-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <Eye className="w-4 h-4" />
          <span>معاينة السند</span>
        </button>
      </div>

      {subTab === 'preview' ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 no-print">
            <button
              type="button"
              onClick={() => setSubTab('form')}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200"
            >
              <ArrowRight className="w-3.5 h-3.5" />
              <span>رجوع للبيانات</span>
            </button>

            <button
              type="button"
              onClick={handleSave}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              <Save className="w-3.5 h-3.5" />
              <span>حفظ السند</span>
            </button>
          </div>

          <OfficialReceiptCard
            data={receiptDisplayData}
            settings={settings}
            onPaperFormatChange={setPaperFormat}
            notify={notify}
            showToolbar={true}
          />
        </div>
      ) : (
        <>
          {/* 1. المحلل الذكي (Smart Gemini AI Bar) */}
          <section className="rounded-xl border border-sky-500/30 bg-white dark:bg-slate-900 p-4 shadow-xs">
            <div className="flex items-center justify-between gap-2 mb-2.5">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-sky-500 shrink-0" />
                <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  المحلل الذكي
                </h2>
              </div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Gemini 3.8 Flash
              </span>
            </div>

            <div className="space-y-2.5">
              <input
                type="text"
                value={smartInput}
                onChange={(e) => setSmartInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSmartParse();
                  }
                }}
                placeholder="مثال: سند للمريض خالد محمد حشو عصب سن 16 بمبلغ 15000 دفع 10000"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2.5 text-xs sm:text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none"
              />

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={toggleVoiceDictation}
                  className={`inline-flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-bold rounded-lg border transition-colors ${
                    isListening
                      ? 'bg-rose-600 border-rose-500 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  <span>{isListening ? 'جاري الاستماع...' : 'إملاء صوتي'}</span>
                </button>

                <button
                  type="button"
                  disabled={isParsingAI}
                  onClick={() => handleSmartParse()}
                  className="inline-flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-bold text-white bg-sky-600 hover:bg-sky-500 disabled:opacity-60 rounded-lg transition-colors"
                >
                  {isParsingAI ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  <span>تحليل السند</span>
                </button>
              </div>
            </div>
          </section>

          {/* 2. نموذج بيانات السند */}
          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
                {editingReceipt ? `تعديل سند #${receiptNo}` : 'بيانات السند'}
              </h2>
              <button
                type="button"
                onClick={resetForm}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-lg"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>تفريغ</span>
              </button>
            </div>

            {/* رقم السند والتاريخ */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                  رقم السند
                </label>
                <input
                  type="number"
                  value={receiptNo}
                  onChange={(e) => setReceiptNo(Number(e.target.value) || 1)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                  التاريخ
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            {/* اسم المريض ورقم الهاتف */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                  اسم المريض
                </label>
                <input
                  type="text"
                  list="clinic-patients-datalist"
                  value={patientName}
                  onChange={(e) => {
                    const val = e.target.value;
                    setPatientName(val);
                    const found = uniquePatients.find((p) => p.name === val);
                    if (found && found.phone && !patientPhone) {
                      setPatientPhone(found.phone);
                    }
                  }}
                  placeholder="الاسم الثلاثي للمريض..."
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                />
                <datalist id="clinic-patients-datalist">
                  {uniquePatients.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.phone}
                    </option>
                  ))}
                </datalist>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                  رقم الهاتف
                </label>
                <input
                  type="tel"
                  dir="ltr"
                  value={patientPhone}
                  onChange={(e) => setPatientPhone(e.target.value)}
                  placeholder="777123456"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm font-mono tabular-nums text-right text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            {/* تنبيه الديون السابقة */}
            {patientPreviousDebt > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/40 p-3 text-xs text-amber-900 dark:text-amber-200">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    دين سابق على المريض:{' '}
                    <strong className="font-mono tabular-nums">
                      {patientPreviousDebt.toLocaleString()} {currency}
                    </strong>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setTotalAmount((prev) => Number(prev) + patientPreviousDebt);
                    notify('تمت إضافة الدين السابق للإجمالي', 'info');
                  }}
                  className="px-2.5 py-1 rounded-md bg-amber-600 text-white font-bold"
                >
                  إضافة للسند
                </button>
              </div>
            )}

            {/* القوائم المنبثقة للخدمات العلاجية ومخطط الأسنان FDI */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                  الخدمات العلاجية
                </label>
                <button
                  type="button"
                  onClick={() => setIsServicesModalOpen(true)}
                  className="w-full flex items-center justify-between gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2.5 text-xs font-bold text-slate-800 dark:text-slate-200 hover:border-sky-500 transition-colors"
                >
                  <span className="truncate">
                    {selectedServices.length > 0
                      ? selectedServices.join(' + ')
                      : 'اختر الخدمات العلاجية'}
                  </span>
                  <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                </button>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                  أرقام الأسنان (FDI)
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    dir="ltr"
                    value={toothFDI}
                    onChange={(e) => setToothFDI(e.target.value)}
                    placeholder="11, 16, 36"
                    className="flex-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-mono tabular-nums text-slate-900 dark:text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={() => setIsFdiModalOpen(true)}
                    className="px-3 py-2 text-xs font-bold rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sky-600 dark:text-sky-400 shrink-0"
                  >
                    المخطط
                  </button>
                </div>
              </div>
            </div>

            {/* المبالغ المالية الثلاثة */}
            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                  الإجمالي
                </label>
                <input
                  type="number"
                  min="0"
                  value={totalAmount || ''}
                  onChange={(e) => {
                    const val = Number(e.target.value) || 0;
                    setTotalAmount(val);
                    if (paidAmount === 0 || paidAmount === totalAmount) {
                      setPaidAmount(val);
                    }
                  }}
                  placeholder="0"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-2.5 py-2 text-sm font-mono tabular-nums font-black text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-emerald-600 dark:text-emerald-400 mb-1">
                  المقبوض
                </label>
                <input
                  type="number"
                  min="0"
                  value={paidAmount || ''}
                  onChange={(e) => setPaidAmount(Number(e.target.value) || 0)}
                  placeholder="0"
                  className="w-full rounded-lg border border-emerald-500/60 bg-emerald-50/20 dark:bg-emerald-950/20 px-2.5 py-2 text-sm font-mono tabular-nums font-black text-emerald-700 dark:text-emerald-300"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-rose-600 dark:text-rose-400 mb-1">
                  المتبقي
                </label>
                <input
                  type="text"
                  readOnly
                  value={remainingAmount.toLocaleString()}
                  className="w-full rounded-lg border border-rose-500/40 bg-rose-50/20 dark:bg-rose-950/20 px-2.5 py-2 text-sm font-mono tabular-nums font-black text-rose-700 dark:text-rose-300"
                />
              </div>
            </div>

            {/* العملة وطريقة الدفع */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                  العملة
                </label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-bold text-slate-900 dark:text-slate-100"
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                  طريقة الدفع
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-bold text-slate-900 dark:text-slate-100"
                >
                  {PAYMENT_METHODS.map((pm) => (
                    <option key={pm} value={pm}>
                      {pm}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* التفقيط والملاحظات */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                  المبلغ كتابةً
                </label>
                <input
                  type="text"
                  readOnly
                  value={amountWords}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 px-3 py-2 text-xs font-bold text-amber-700 dark:text-amber-300"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                  ملاحظات السند
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="ملاحظات الطبيب أو موعد الجلسة..."
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            {/* أزرار التوقيع الإلكتروني */}
            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setSigModalTarget('accountant')}
                className="inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-xs font-bold text-sky-700 dark:text-sky-300"
              >
                <PenTool className="w-3.5 h-3.5" />
                <span>{accountantSig ? 'تعديل توقيع الطبيب' : 'توقيع الطبيب'}</span>
              </button>

              <button
                type="button"
                onClick={() => setSigModalTarget('receiver')}
                className="inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-xs font-bold text-amber-700 dark:text-amber-300"
              >
                <PenTool className="w-3.5 h-3.5" />
                <span>{receiverSig ? 'تعديل توقيع المريض' : 'توقيع المريض'}</span>
              </button>
            </div>

            {/* أزرار الحفظ والمعاينة (بدون أي تكرار) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={handleSave}
                className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs sm:text-sm shadow-sm transition-colors"
              >
                <Save className="w-4 h-4" />
                <span>{editingReceipt ? 'تحديث السند' : 'حفظ السند في السجل'}</span>
              </button>

              <button
                type="button"
                onClick={() => setSubTab('preview')}
                className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-black text-xs sm:text-sm shadow-sm transition-colors"
              >
                <Eye className="w-4 h-4" />
                <span>معاينة وطباعة السند</span>
              </button>
            </div>
          </section>
        </>
      )}

      {/* ==================== POP-UP MODAL: SERVICES MULTI-SELECT ==================== */}
      {isServicesModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-3 sm:p-4 no-print"
          onClick={() => setIsServicesModalOpen(false)}
        >
          <div
            className="w-full max-w-lg max-h-[88vh] flex flex-col rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800 shrink-0">
              <div className="flex items-center gap-2">
                <Stethoscope className="w-4 h-4 text-sky-500" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  الخدمات العلاجية
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsServicesModalOpen(false)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold"
              >
                <ArrowRight className="w-3.5 h-3.5" />
                <span>رجوع</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 gap-2.5">
              {settings.services.map((srv) => {
                const isSelected = selectedServices.includes(srv.name);
                return (
                  <button
                    key={srv.id}
                    type="button"
                    onClick={() => handleToggleService(srv.name, srv.price)}
                    className={`flex flex-col items-start justify-between p-3 rounded-xl border text-right transition-colors ${
                      isSelected
                        ? 'bg-sky-600 border-sky-500 text-white'
                        : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 hover:border-sky-400'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full gap-1">
                      <span className="text-xs font-bold">{srv.name}</span>
                      {isSelected && <Check className="w-4 h-4 shrink-0" />}
                    </div>
                    <span
                      className={`text-xs font-mono tabular-nums mt-1 ${
                        isSelected ? 'text-sky-100' : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {Number(srv.price).toLocaleString()} {currency}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-slate-800 shrink-0">
              <button
                type="button"
                onClick={() => setIsServicesModalOpen(false)}
                className="inline-flex items-center gap-1 px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-xl"
              >
                <X className="w-4 h-4" />
                <span>إغلاق</span>
              </button>
              <button
                type="button"
                onClick={() => setIsServicesModalOpen(false)}
                className="px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold"
              >
                اعتماد ({selectedServices.length})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== POP-UP MODAL: ELECTRONIC SIGNATURE ==================== */}
      <SignatureModal
        isOpen={sigModalTarget !== null}
        target={sigModalTarget || 'accountant'}
        onClose={() => setSigModalTarget(null)}
        onSave={(dataUrl, makePermanent) => {
          if (sigModalTarget === 'accountant') {
            setAccountantSig(dataUrl);
            if (makePermanent) {
              onUpdatePermanentSig(dataUrl);
            }
          } else {
            setReceiverSig(dataUrl);
          }
          notify('تم اعتماد التوقيع الإلكتروني', 'success');
        }}
      />

      {/* ==================== POP-UP MODAL: FDI TOOTH CHART ==================== */}
      <FdiToothModal
        isOpen={isFdiModalOpen}
        selectedTeeth={selectedTeethList}
        onClose={() => setIsFdiModalOpen(false)}
        onApply={(teeth) => setToothFDI(teeth.join(', '))}
      />
    </div>
  );
};
