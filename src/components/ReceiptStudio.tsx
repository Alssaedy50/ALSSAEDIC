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
  Plus,
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
import {
  RETURN_VISIT_MARKER,
  buildPatientAccountsFromReceipts,
  findMatchingPatientAccount,
  parseSmartReceiptWithFallback,
} from '../utils/aiClient';
import {
  buildCleanSpeechTranscript,
  deduplicateSpeechText,
} from '../utils/speechTranscript';
import { SignatureModal } from './SignatureModal';
import { FdiToothModal } from './FdiToothModal';
import { OfficialReceiptCard, ReceiptDisplayData } from './OfficialReceiptCard';

interface ReceiptStudioProps {
  settings: ClinicSettings;
  receipts: ReceiptRecord[];
  editingReceipt: ReceiptRecord | null;
  prefillPatient?: {
    patientName: string;
    patientPhone: string;
    isReturnVisit?: boolean;
  } | null;
  onClearPrefillPatient?: () => void;
  nextReceiptNo: number;
  onSaveReceipt: (payload: Omit<ReceiptRecord, 'id'> & { id?: string }) => ReceiptRecord;
  onClearEditing: () => void;
  onJumpToSettleDebt?: (receiptId: string) => void;
  onOpenPatientAccount?: (accountKey: string) => void;
  onUpdatePermanentSig: (sigDataUrl: string) => void;
  notify: (message: string, type?: 'success' | 'warning' | 'error' | 'info') => void;
}

export const ReceiptStudio: React.FC<ReceiptStudioProps> = ({
  settings,
  receipts,
  editingReceipt,
  prefillPatient,
  onClearPrefillPatient,
  nextReceiptNo,
  onSaveReceipt,
  onClearEditing,
  onJumpToSettleDebt,
  onOpenPatientAccount,
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
  const [isReturnVisit, setIsReturnVisit] = useState<boolean>(false);
  const [paperFormat, setPaperFormat] = useState<PaperFormat>('a5');
  const [accountantSig, setAccountantSig] = useState<string>(
    settings.appearance.permanentAccountantSig || ''
  );
  const [receiverSig, setReceiverSig] = useState<string>('');

  // Smart AI input & Voice dictation
  const [smartInput, setSmartInput] = useState<string>('');
  const [isParsingAI, setIsParsingAI] = useState<boolean>(false);
  const [isListening, setIsListening] = useState<boolean>(false);
  const recognitionRef = useRef<{ start: () => void; stop: () => void } | null>(null);
  const shouldKeepListeningRef = useRef<boolean>(false);
  const accumulatedTranscriptRef = useRef<string>('');
  const currentSessionFinalRef = useRef<string>('');
  const latestSmartInputRef = useRef<string>('');

  useEffect(() => {
    latestSmartInputRef.current = smartInput;
  }, [smartInput]);

  useEffect(() => {
    return () => {
      shouldKeepListeningRef.current = false;
      try {
        recognitionRef.current?.stop();
      } catch {
        // Ignore
      }
    };
  }, []);

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
      setIsReturnVisit(String(editingReceipt.notes || '').includes(RETURN_VISIT_MARKER));
      setPaperFormat(editingReceipt.paperFormat || 'a5');
      setAccountantSig(
        editingReceipt.accountantSig || settings.appearance.permanentAccountantSig || ''
      );
      setReceiverSig(editingReceipt.receiverSig || '');
      setSubTab('form');
    } else if (prefillPatient) {
      setReceiptNo(nextReceiptNo);
      setDate(new Date().toISOString().slice(0, 10));
      setPatientName(prefillPatient.patientName);
      setPatientPhone(prefillPatient.patientPhone || '');
      setIsReturnVisit(Boolean(prefillPatient.isReturnVisit));
      if (prefillPatient.isReturnVisit) {
        setNotes(`${RETURN_VISIT_MARKER} جلسة متابعة / مراجعة`);
      } else {
        setNotes('');
      }
      setSubTab('form');
      if (onClearPrefillPatient) {
        onClearPrefillPatient();
      }
    } else {
      setReceiptNo(nextReceiptNo);
    }
  }, [
    editingReceipt,
    prefillPatient,
    onClearPrefillPatient,
    nextReceiptNo,
    settings.identity.defaultCurrency,
    settings.appearance.permanentAccountantSig,
  ]);

  const remainingAmount = Math.max(0, (Number(totalAmount) || 0) - (Number(paidAmount) || 0));
  const amountWords = useMemo(
    () => numberToArabicWords(paidAmount, String(currency)),
    [paidAmount, currency]
  );

  const patientAccounts = useMemo(
    () => buildPatientAccountsFromReceipts(receipts, settings.identity.defaultCurrency),
    [receipts, settings.identity.defaultCurrency]
  );

  const matchedPatientAccount = useMemo(
    () =>
      patientName.trim().length >= 2
        ? findMatchingPatientAccount(patientName, receipts, settings.identity.defaultCurrency)
        : null,
    [patientName, receipts, settings.identity.defaultCurrency]
  );

  const uniquePatients = useMemo(
    () =>
      patientAccounts.map((acc) => ({
        name: acc.patientName,
        phone: acc.patientPhone,
        accountKey: acc.accountKey,
        totalRemaining: acc.totalRemaining,
        visitsCount: acc.visitsCount,
      })),
    [patientAccounts]
  );

  const patientUnpaidReceipts = useMemo(() => {
    if (!matchedPatientAccount || !settings.features.debtAlert) return [];
    return matchedPatientAccount.receipts.filter(
      (r) =>
        (!editingReceipt || r.id !== editingReceipt.id) &&
        (Number(r.remainingAmount) || 0) > 0
    );
  }, [matchedPatientAccount, editingReceipt, settings.features.debtAlert]);

  const patientPreviousDebt = useMemo(
    () =>
      patientUnpaidReceipts.reduce((sum, r) => sum + (Number(r.remainingAmount) || 0), 0),
    [patientUnpaidReceipts]
  );

  const handleToggleService = (serviceName: string, price: number) => {
    setSelectedServices((prev) => {
      const normalizeSrv = (val: string) =>
        val.replace(/تجليح\s*لثة|تجليح\s*اللثة/g, 'تقليح اللثة').replace(/تجليح/g, 'تقليح');
      const normalizedPrev = prev.map(normalizeSrv);
      const exists = normalizedPrev.includes(serviceName);
      const next = exists
        ? normalizedPrev.filter((s) => s !== serviceName)
        : [...normalizedPrev, serviceName];

      if (settings.features.autoPrice) {
        const nextTotal = next.reduce((sum, name) => {
          const found = settings.services.find(
            (srv) => srv.name === name || normalizeSrv(srv.name) === name
          );
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
    setIsReturnVisit(false);
    setSmartInput('');
    setReceiverSig('');
    setAccountantSig(settings.appearance.permanentAccountantSig || '');
  };

  const applyLocalHeuristic = (raw: string) => {
    let extractedName = '';
    const nameMatch = raw.match(
      /(?:للمريض|مريض|باسم|الأخ|الاخ|المريضة)\s+([^\d،,]+?)(?=\s+(?:خدمة|علاج|حشو|خلع|عصب|تنظيف|تقليح|تركيب|تقويم|كشف|أشعة|اشعة|بمبلغ|مبلغ|إجمالي|اجمالي|دفع|سدد|رقم|هاتف|جوال|$))/i
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

    if (extractedName) {
      const matchedAcc = findMatchingPatientAccount(
        extractedName,
        receipts,
        settings.identity.defaultCurrency
      );
      if (matchedAcc) {
        setPatientName(matchedAcc.patientName);
        if (!extractedPhone && matchedAcc.patientPhone) {
          setPatientPhone(matchedAcc.patientPhone);
        }
      } else {
        setPatientName(extractedName);
      }
    }
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
      const r = await parseSmartReceiptWithFallback(
        textToAnalyze,
        settings.services,
        settings.identity.defaultCurrency,
        receipts
      );
      if (!r) {
        throw new Error('تعذر التحليل');
      }

      if (r.patientName) {
        const matchedAcc = findMatchingPatientAccount(
          String(r.patientName),
          receipts,
          settings.identity.defaultCurrency
        );
        if (matchedAcc) {
          setPatientName(matchedAcc.patientName);
          if (!r.patientPhone && matchedAcc.patientPhone) {
            setPatientPhone(matchedAcc.patientPhone);
          }
        } else {
          setPatientName(String(r.patientName));
        }
      }
      if (r.patientPhone) setPatientPhone(String(r.patientPhone));

      let computedServicesTotal = 0;
      if (Array.isArray(r.services) && r.services.length > 0) {
        setSelectedServices(r.services);
        computedServicesTotal = r.services.reduce((sum: number, name: string) => {
          const found = settings.services.find((s) => s.name === name);
          return sum + (found ? Number(found.price) || 0 : 0);
        }, 0);
      }

      if (r.toothFDI) setToothFDI(String(r.toothFDI));

      const resolvedTotal =
        Number(r.totalAmount) > 0 ? Number(r.totalAmount) : computedServicesTotal;
      const resolvedPaid =
        r.paidAmount !== undefined && Number(r.paidAmount) > 0
          ? Math.min(resolvedTotal || Number(r.paidAmount), Number(r.paidAmount))
          : resolvedTotal;

      if (resolvedTotal > 0) setTotalAmount(resolvedTotal);
      if (resolvedPaid >= 0) setPaidAmount(resolvedPaid);
      if (r.currency && CURRENCIES.includes(r.currency as CurrencyCode)) {
        setCurrency(r.currency as CurrencyCode);
      }
      if (r.paymentMethod) setPaymentMethod(String(r.paymentMethod));
      if (r.notes) setNotes(String(r.notes));

      notify('تم استخراج بيانات السند', 'success');
    } catch {
      applyLocalHeuristic(textToAnalyze);
      notify('تم استخراج بيانات السند تلقائياً', 'info');
    } finally {
      setIsParsingAI(false);
    }
  };

  const stopVoiceDictation = (triggerParse = false) => {
    shouldKeepListeningRef.current = false;
    setIsListening(false);
    try {
      recognitionRef.current?.stop();
    } catch {
      // Ignore
    }
    const finalText = latestSmartInputRef.current.trim();
    if (triggerParse && finalText) {
      handleSmartParse(finalText);
    }
  };

  const toggleVoiceDictation = () => {
    if (isListening || shouldKeepListeningRef.current) {
      stopVoiceDictation(true);
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
      // Stop any previous active recognition instance before starting a new one
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
      // Disable continuous mode on mobile browsers to prevent Android Chrome's cumulative buffer duplication bug
      rec.continuous = !isMobileBrowser;
      rec.interimResults = true;
      rec.maxAlternatives = 1;

      const initialBase = deduplicateSpeechText(smartInput.trim());
      accumulatedTranscriptRef.current = initialBase;
      currentSessionFinalRef.current = '';
      shouldKeepListeningRef.current = true;

      rec.onresult = (event) => {
        const cleanTranscript = buildCleanSpeechTranscript(initialBase, event.results);
        if (cleanTranscript) {
          currentSessionFinalRef.current = cleanTranscript;
          latestSmartInputRef.current = cleanTranscript;
          setSmartInput(cleanTranscript);
          applyLocalHeuristic(cleanTranscript);
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
        const finalText = deduplicateSpeechText(latestSmartInputRef.current.trim());
        if (finalText) {
          latestSmartInputRef.current = finalText;
          setSmartInput(finalText);
          applyLocalHeuristic(finalText);
        }
      };

      recognitionRef.current = rec;
      setIsListening(true);
      rec.start();
    } catch {
      shouldKeepListeningRef.current = false;
      setIsListening(false);
      notify('تعذر تشغيل المايكروفون', 'error');
    }
  };

  const handleSave = () => {
    if (!patientName.trim()) {
      notify('يرجى إدخال اسم المريض أولاً', 'warning');
      return null;
    }

    const numericTotal = Number(totalAmount) || 0;
    const numericPaid = Number(paidAmount) || 0;

    if (numericPaid > numericTotal) {
      notify('لا يمكن أن يكون المبلغ المقبوض أكبر من الإجمالي', 'warning');
      return null;
    }

    const isDuplicateNo = receipts.some(
      (r) =>
        Number(r.receiptNo) === Number(receiptNo) &&
        (!editingReceipt || r.id !== editingReceipt.id)
    );
    if (isDuplicateNo) {
      notify(
        `رقم السند #${receiptNo} مستخدم مسبقاً في سند آخر، يرجى اختيار رقم مختلف`,
        'warning'
      );
      return null;
    }

    const parsedFdi = parseFDIToothNumbers(toothFDI);
    if (parsedFdi.invalid.length > 0) {
      notify(`أرقام FDI غير صحيحة: ${parsedFdi.invalid.join(', ')}`, 'warning');
      return null;
    }

    // Group under the exact canonical patient account if a matching account exists
    const canonicalName = matchedPatientAccount
      ? matchedPatientAccount.patientName
      : patientName.trim();
    const canonicalPhone =
      patientPhone.trim() || matchedPatientAccount?.patientPhone || '';

    const rawNotes = notes.trim();
    const finalNotes = isReturnVisit
      ? rawNotes.includes(RETURN_VISIT_MARKER)
        ? rawNotes
        : `${RETURN_VISIT_MARKER} ${rawNotes || 'جلسة متابعة / مراجعة'}`.trim()
      : rawNotes;

    const saved = onSaveReceipt({
      id: editingReceipt?.id,
      receiptNo,
      date,
      patientName: canonicalName,
      patientPhone: canonicalPhone,
      services:
        selectedServices.length > 0
          ? selectedServices.map((s) =>
              s
                .replace(/تجليح\s*لثة|تجليح\s*اللثة/g, 'تقليح اللثة')
                .replace(/تجليح/g, 'تقليح')
            )
          : isReturnVisit
            ? ['عودة / مراجعة علاجية']
            : ['كشف ومعاينة'],
      toothFDI: parsedFdi.values.join(' - '),
      totalAmount: numericTotal,
      paidAmount: numericPaid,
      remainingAmount,
      currency,
      paymentMethod,
      notes: finalNotes,
      amountWords,
      accountantSig,
      receiverSig,
      paperFormat,
    });

    setPatientName(canonicalName);
    setPatientPhone(canonicalPhone);
    setNotes(finalNotes);
    setSubTab('preview');
    return saved;
  };

  const receiptDisplayData: ReceiptDisplayData = {
    receiptNo,
    date,
    patientName: matchedPatientAccount ? matchedPatientAccount.patientName : patientName,
    patientPhone: patientPhone || matchedPatientAccount?.patientPhone || '',
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
      {/* Top 2-Tab Segmented Switcher (البيانات vs المعاينة) */}
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
          <span>البيانات</span>
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
          <span>المعاينة</span>
        </button>
      </div>

      {subTab === 'preview' ? (
        <div className="space-y-3">
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
                  الإدخال السريع
                </h2>
              </div>
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
                placeholder="اكتب تفاصيل السند أو تحدث..."
                className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2.5 text-xs sm:text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none"
              />

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={toggleVoiceDictation}
                  className={`inline-flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-bold rounded-lg border transition-colors ${
                    isListening
                      ? 'bg-rose-600 border-rose-500 text-white animate-pulse'
                      : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  <span>{isListening ? 'إيقاف الإملاء' : 'إملاء صوتي'}</span>
                </button>

                <button
                  type="button"
                  disabled={isParsingAI}
                  onClick={() => {
                    if (isListening || shouldKeepListeningRef.current) {
                      stopVoiceDictation(false);
                    }
                    handleSmartParse();
                  }}
                  className="inline-flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-bold text-white bg-sky-600 hover:bg-sky-500 disabled:opacity-60 rounded-lg transition-colors"
                >
                  {isParsingAI ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  <span>استخراج البيانات</span>
                </button>
              </div>
            </div>
          </section>

          {/* 2. نموذج بيانات السند */}
          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
                  {editingReceipt ? `تعديل سند #${receiptNo}` : 'بيانات السند'}
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    const nextVal = !isReturnVisit;
                    setIsReturnVisit(nextVal);
                    if (nextVal && !notes.includes(RETURN_VISIT_MARKER)) {
                      setNotes((prev) =>
                        prev ? `${RETURN_VISIT_MARKER} ${prev}` : `${RETURN_VISIT_MARKER} جلسة متابعة / مراجعة`
                      );
                    } else if (!nextVal && notes.includes(RETURN_VISIT_MARKER)) {
                      setNotes((prev) => prev.replace(RETURN_VISIT_MARKER, '').trim());
                    }
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors ${
                    isReturnVisit
                      ? 'bg-indigo-600 border-indigo-500 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {isReturnVisit ? '✓ عودة / مراجعة' : '+ تسجيل كعودة'}
                </button>
              </div>

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
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100 dark:[color-scheme:dark]"
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
                    const matched = findMatchingPatientAccount(
                      val,
                      receipts,
                      settings.identity.defaultCurrency
                    );
                    if (matched && matched.patientPhone && !patientPhone) {
                      setPatientPhone(matched.patientPhone);
                    }
                  }}
                  placeholder="الاسم الثلاثي للمريض..."
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                />
                <datalist id="clinic-patients-datalist">
                  {uniquePatients.map((p) => (
                    <option key={p.accountKey} value={p.name}>
                      {p.totalRemaining > 0
                        ? `عليه دين: ${p.totalRemaining.toLocaleString()} (${p.visitsCount} زيارة)`
                        : `مسدد كامل (${p.visitsCount} زيارة)`}
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

            {/* شريط ربط الحساب التلقائي بنفس اسم المريض */}
            {matchedPatientAccount && (
              <div className="rounded-xl border border-sky-500/30 bg-sky-50/70 dark:bg-sky-950/30 p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-black text-sky-900 dark:text-sky-200">
                      سيُدرج السند في حساب: {matchedPatientAccount.patientName}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-md font-bold text-[11px] ${
                        matchedPatientAccount.totalRemaining > 0
                          ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30'
                          : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                      }`}
                    >
                      {matchedPatientAccount.totalRemaining > 0
                        ? `عليه دين: ${matchedPatientAccount.totalRemaining.toLocaleString()} ${matchedPatientAccount.currency}`
                        : 'مسدد كامل'}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-600 dark:text-slate-400">
                    إجمالي الزيارات السابقة: {matchedPatientAccount.visitsCount}
                    {matchedPatientAccount.returnVisitsCount > 0
                      ? ` (منها ${matchedPatientAccount.returnVisitsCount} عودة)`
                      : ''}{' '}
                    • آخر زيارة: {matchedPatientAccount.lastVisitDate}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {onOpenPatientAccount && (
                    <button
                      type="button"
                      onClick={() => onOpenPatientAccount(matchedPatientAccount.accountKey)}
                      className="px-2.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold transition-colors"
                    >
                      صفحة الحساب
                    </button>
                  )}
                  {patientPreviousDebt > 0 && onJumpToSettleDebt && patientUnpaidReceipts[0] && (
                    <button
                      type="button"
                      onClick={() => onJumpToSettleDebt(patientUnpaidReceipts[0].id)}
                      className="px-2.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold transition-colors"
                    >
                      تسديد الدين
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* القوائم المنبثقة للخدمات ومخطط الأسنان FDI */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                  الخدمات
                </label>
                <button
                  type="button"
                  onClick={() => setIsServicesModalOpen(true)}
                  className="w-full flex items-center justify-between gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2.5 text-xs font-bold text-slate-800 dark:text-slate-200 hover:border-sky-500 transition-colors"
                >
                  <span className="truncate">
                    {selectedServices.length > 0
                      ? selectedServices.join(' + ')
                      : 'اختيار الخدمات'}
                  </span>
                  <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                </button>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                  الأسنان (FDI)
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    dir="ltr"
                    value={toothFDI}
                    onChange={(e) => setToothFDI(e.target.value)}
                    placeholder="14 - 41 - 28"
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
                  value={totalAmount === 0 ? '' : totalAmount}
                  onFocus={(e) => e.currentTarget.select()}
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
                  max={totalAmount || undefined}
                  value={paidAmount === 0 ? '' : paidAmount}
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) => setPaidAmount(Number(e.target.value) || 0)}
                  placeholder="0"
                  className={`w-full rounded-lg border px-2.5 py-2 text-sm font-mono tabular-nums font-black ${
                    paidAmount > totalAmount
                      ? 'border-rose-500 bg-rose-50/30 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300'
                      : 'border-emerald-500/60 bg-emerald-50/20 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-300'
                  }`}
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
                <PenTool className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">
                  {accountantSig ? 'تعديل توقيع المستلم' : 'توقيع المستلم'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setSigModalTarget('receiver')}
                className="inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-xs font-bold text-amber-700 dark:text-amber-300"
              >
                <PenTool className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">
                  {receiverSig ? 'تعديل توقيع المريض' : 'توقيع المريض'}
                </span>
              </button>
            </div>

            {/* زر الحفظ (بدون تكرار زر المعاينة الموجود في الأعلى) */}
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={handleSave}
                className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs sm:text-sm shadow-sm transition-colors"
              >
                <Save className="w-4 h-4" />
                <span>{editingReceipt ? 'تحديث السند' : 'حفظ السند'}</span>
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
                  الخدمات
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsServicesModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title="إغلاق"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 gap-2.5">
              {settings.services.map((srv) => {
                const displayName = srv.name
                  .replace(/تجليح\s*لثة|تجليح\s*اللثة/g, 'تقليح اللثة')
                  .replace(/تجليح/g, 'تقليح');
                const isSelected =
                  selectedServices.includes(displayName) || selectedServices.includes(srv.name);
                return (
                  <button
                    key={srv.id}
                    type="button"
                    onClick={() => handleToggleService(displayName, srv.price)}
                    className={`flex flex-col items-start justify-between p-3 rounded-xl border text-right transition-colors ${
                      isSelected
                        ? 'bg-sky-600 border-sky-500 text-white'
                        : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 hover:border-sky-400'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full gap-1">
                      <span className="text-xs font-bold">{displayName}</span>
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

            <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 shrink-0">
              <button
                type="button"
                onClick={() => setIsServicesModalOpen(false)}
                className="w-full py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition-colors shadow-sm"
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
          notify('تم اعتماد التوقيع', 'success');
        }}
      />

      {/* ==================== POP-UP MODAL: FDI TOOTH CHART ==================== */}
      <FdiToothModal
        isOpen={isFdiModalOpen}
        selectedTeeth={selectedTeethList}
        onClose={() => setIsFdiModalOpen(false)}
        onApply={(teeth) => setToothFDI(teeth.join(' - '))}
      />
    </div>
  );
};
