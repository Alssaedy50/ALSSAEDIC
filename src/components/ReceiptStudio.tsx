import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  Eye,
  FileText,
  Layers,
  MoreVertical,
  Package,
  PenTool,
  RotateCcw,
  Save,
  Stethoscope,
  X,
} from 'lucide-react';
import {
  ClinicSettings,
  CurrencyCode,
  InventoryItem,
  PaperFormat,
  ReceiptRecord,
} from '../types/clinic';
import { CURRENCIES, PAYMENT_METHODS } from '../data/defaultData';
import {
  calculateReceiptMaterialsConsumption,
  formatServiceWithTeeth,
  isServiceAlreadyBilledForPatient,
  numberToArabicWords,
  parseFDIToothNumbers,
  parseServiceWithTeeth,
  splitServiceEntriesPreservingTeeth,
} from '../utils/arabicTafqeet';
import {
  RETURN_VISIT_MARKER,
  buildPatientAccountsFromReceipts,
  findMatchingPatientAccount,
} from '../utils/aiClient';
import { SignatureModal } from './SignatureModal';
import { FdiToothModal } from './FdiToothModal';
import { OfficialReceiptCard, ReceiptDisplayData } from './OfficialReceiptCard';
import { SmartNumberInput } from './SmartNumberInput';

interface ReceiptStudioProps {
  settings: ClinicSettings;
  receipts: ReceiptRecord[];
  inventory?: InventoryItem[];
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
  inventory = [],
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
  const [serviceTeethMap, setServiceTeethMap] = useState<Record<string, string[]>>({});
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

  // Pop-up Modals & Dropdowns
  const [isServicesModalOpen, setIsServicesModalOpen] = useState<boolean>(false);
  const [isFdiModalOpen, setIsFdiModalOpen] = useState<boolean>(false);
  const [activeServiceForFdiModal, setActiveServiceForFdiModal] = useState<string | undefined>(
    undefined
  );
  const [sigModalTarget, setSigModalTarget] = useState<'accountant' | 'receiver' | null>(null);
  const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState<boolean>(false);
  const headerMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (headerMenuRef.current && !headerMenuRef.current.contains(e.target as Node)) {
        setIsHeaderMenuOpen(false);
      }
    };
    if (isHeaderMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isHeaderMenuOpen]);

  useEffect(() => {
    if (editingReceipt) {
      setReceiptNo(editingReceipt.receiptNo);
      setDate(editingReceipt.date);
      setPatientName(editingReceipt.patientName);
      setPatientPhone(editingReceipt.patientPhone);

      const rawList = splitServiceEntriesPreservingTeeth(editingReceipt.services || []);
      const baseNames: string[] = [];
      const extractedMap: Record<string, string[]> = {};
      for (const rawSrv of rawList) {
        const parsed = parseServiceWithTeeth(rawSrv);
        if (parsed.serviceName) {
          if (!baseNames.includes(parsed.serviceName)) {
            baseNames.push(parsed.serviceName);
          }
          if (parsed.teeth.length > 0) {
            extractedMap[parsed.serviceName] = parsed.teeth;
          }
        }
      }

      setSelectedServices(baseNames);
      setServiceTeethMap(extractedMap);
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

  const patientPreviousReceipts = useMemo(() => {
    if (!matchedPatientAccount) return [];
    return matchedPatientAccount.receipts.filter(
      (r) => !editingReceipt || r.id !== editingReceipt.id
    );
  }, [matchedPatientAccount, editingReceipt]);

  const selectedTeethList = useMemo(
    () => parseFDIToothNumbers(toothFDI).values,
    [toothFDI]
  );

  // Format services with their assigned per-service teeth when saving or displaying
  const formattedServicesWithTeeth = useMemo(() => {
    return selectedServices.map((srv) => {
      const cleanSrv = srv
        .replace(/تجليح\s*لثة|تجليح\s*اللثة/g, 'تقليح اللثة')
        .replace(/تجليح/g, 'تقليح');
      const assignedTeeth = serviceTeethMap[cleanSrv] || serviceTeethMap[srv] || [];
      if (selectedServices.length > 1 && assignedTeeth.length > 0) {
        return formatServiceWithTeeth(cleanSrv, assignedTeeth);
      }
      return cleanSrv;
    });
  }, [selectedServices, serviceTeethMap]);

  // Calculate exact scheduled material deductions for live preview
  const scheduledDeductions = useMemo(() => {
    if (selectedServices.length === 0 || !settings.features.autoInventory) return [];
    return calculateReceiptMaterialsConsumption(
      formattedServicesWithTeeth,
      toothFDI,
      settings.services,
      inventory,
      patientPreviousReceipts,
      {
        isReturnVisit,
        serviceTeethMap,
      }
    );
  }, [
    selectedServices,
    formattedServicesWithTeeth,
    toothFDI,
    settings.services,
    inventory,
    patientPreviousReceipts,
    isReturnVisit,
    serviceTeethMap,
    settings.features.autoInventory,
  ]);

  const scheduledDeductionDetails = useMemo(() => {
    return scheduledDeductions
      .map((entry) => {
        const item = inventory.find((i) => i.id === entry.materialId);
        if (!item) return null;
        return {
          id: item.id,
          name: item.name,
          amount: entry.amountDeducted,
          unit: item.usageUnit || item.unit || 'وحدة',
        };
      })
      .filter(Boolean) as { id: string; name: string; amount: number; unit: string }[];
  }, [scheduledDeductions, inventory]);

  // Identify any selected services that have NO recipe or linked inventory item
  const unlinkedSelectedServices = useMemo(() => {
    if (!settings.features.autoInventory || selectedServices.length === 0) return [];
    return selectedServices.filter((srvName) => {
      const matched = settings.services.find(
        (s) => s.name.trim() === srvName.trim() || s.name.includes(srvName) || srvName.includes(s.name)
      );
      const hasRecipe =
        matched && Array.isArray(matched.materialsRecipe) && matched.materialsRecipe.length > 0;
      const hasLinkedInv = inventory.some(
        (inv) =>
          inv.linkedService &&
          (inv.linkedService.trim() === srvName.trim() ||
            inv.linkedService.includes(srvName.trim()))
      );
      return !hasRecipe && !hasLinkedInv;
    });
  }, [selectedServices, settings.services, inventory, settings.features.autoInventory]);

  const inventoryDeductionStatus = useMemo(() => {
    if (selectedServices.length === 0 || !settings.features.autoInventory) return null;
    if (!isReturnVisit) {
      return {
        type: 'initial' as const,
        label: 'سند أساسي (خصم مباشر)',
        message:
          scheduledDeductionDetails.length > 0
            ? `سيتم خصم المواد المربوطة بجميع الخدمات المختارة (${selectedServices.length} خدمة) من المخزون.`
            : 'يرجى ربط الخدمات بالمواد من قسم (الإعدادات > الخدمات) أو (المخزون) ليتم خصمها تلقائياً.',
      };
    }
    const unbilledServices = selectedServices.filter((srv) => {
      const srvTeeth = (serviceTeethMap[srv] || []).join(' - ') || toothFDI;
      return !isServiceAlreadyBilledForPatient(srv, srvTeeth, patientPreviousReceipts).isAlreadyBilled;
    });
    if (unbilledServices.length === 0) {
      return {
        type: 'installment' as const,
        label: 'عودة / مراجعة',
        message: 'مواد هذه الخدمة خُصمت مسبقاً في السند الأساسي للمريض ولن يتم تكرار الخصم.',
      };
    }
    return {
      type: 'mixed' as const,
      label: 'عودة مع خدمة جديدة',
      message: `سيتم خصم مواد الخدمة/الأسنان الجديدة فقط (${unbilledServices.join('، ')}) وتخطي السابقة.`,
    };
  }, [
    selectedServices,
    toothFDI,
    serviceTeethMap,
    patientPreviousReceipts,
    isReturnVisit,
    scheduledDeductionDetails.length,
    settings.features.autoInventory,
  ]);

  const handleToggleService = (serviceName: string, price: number) => {
    setSelectedServices((prev) => {
      const normalizeSrv = (val: string) =>
        val.replace(/تجليح\s*لثة|تجليح\s*اللثة/g, 'تقليح اللثة').replace(/تجليح/g, 'تقليح');
      const normalizedPrev = prev.map(normalizeSrv);
      const exists = normalizedPrev.includes(serviceName);
      const next = exists
        ? normalizedPrev.filter((s) => s !== serviceName)
        : [...normalizedPrev, serviceName];

      if (exists) {
        setServiceTeethMap((prevMap) => {
          const copy = { ...prevMap };
          delete copy[serviceName];
          return copy;
        });
      }

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

  const handleToggleToothForService = (serviceName: string, toothCode: string) => {
    setServiceTeethMap((prev) => {
      const current = prev[serviceName] || [];
      const nextList = current.includes(toothCode)
        ? current.filter((t) => t !== toothCode)
        : [...current, toothCode];
      const nextMap = { ...prev, [serviceName]: nextList };
      // Ensure toothCode is also in general toothFDI
      const allSet = new Set<string>(selectedTeethList);
      Object.values(nextMap).forEach((arr) => arr.forEach((t) => allSet.add(t)));
      setToothFDI(Array.from(allSet).join(' - '));
      return nextMap;
    });
  };

  const resetForm = () => {
    onClearEditing();
    setReceiptNo(nextReceiptNo);
    setDate(new Date().toISOString().slice(0, 10));
    setPatientName('');
    setPatientPhone('');
    setSelectedServices([]);
    setServiceTeethMap({});
    setToothFDI('');
    setTotalAmount(0);
    setPaidAmount(0);
    setCurrency(settings.identity.defaultCurrency || 'ريال يمني');
    setPaymentMethod('نقداً (Cash)');
    setNotes('');
    setIsReturnVisit(false);
    setReceiverSig('');
    setAccountantSig(settings.appearance.permanentAccountantSig || '');
  };

  const handleVisitTypeChange = (nextIsReturn: boolean) => {
    setIsReturnVisit(nextIsReturn);
    if (nextIsReturn && !notes.includes(RETURN_VISIT_MARKER)) {
      setNotes((prev) =>
        prev ? `${RETURN_VISIT_MARKER} ${prev}` : `${RETURN_VISIT_MARKER} جلسة متابعة / مراجعة`
      );
    } else if (!nextIsReturn && notes.includes(RETURN_VISIT_MARKER)) {
      setNotes((prev) => prev.replace(RETURN_VISIT_MARKER, '').trim());
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
        formattedServicesWithTeeth.length > 0
          ? formattedServicesWithTeeth
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
    services: formattedServicesWithTeeth,
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
          {/* نموذج بيانات السند */}
          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2 min-w-0">
                <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 truncate">
                  {editingReceipt ? `تعديل سند #${receiptNo}` : 'إصدار سند جديد'}
                </h2>
              </div>

              {/* Clean Dropdown Controls instead of crowded buttons */}
              <div className="flex items-center gap-2 shrink-0">
                <div className="relative">
                  <select
                    value={isReturnVisit ? 'return' : 'primary'}
                    onChange={(e) => handleVisitTypeChange(e.target.value === 'return')}
                    aria-label="نوع السند"
                    className={`appearance-none rounded-xl border px-3 py-1.5 pl-7 text-xs font-bold transition-colors focus:outline-none ${
                      isReturnVisit
                        ? 'bg-indigo-600 border-indigo-500 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    <option value="primary" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
                      سند أساسي (جديد)
                    </option>
                    <option value="return" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
                      عودة / مراجعة
                    </option>
                  </select>
                  <ChevronDown
                    className={`w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none ${
                      isReturnVisit ? 'text-white' : 'text-slate-500'
                    }`}
                  />
                </div>

                {/* Actions Dropdown Menu */}
                <div className="relative" ref={headerMenuRef}>
                  <button
                    type="button"
                    onClick={() => setIsHeaderMenuOpen((v) => !v)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 hover:border-sky-500 transition-colors"
                  >
                    <span>خيارات</span>
                    <MoreVertical className="w-3.5 h-3.5" />
                  </button>

                  {isHeaderMenuOpen && (
                    <div className="absolute left-0 top-full mt-1.5 w-52 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl py-1.5 z-40 text-xs">
                      <button
                        type="button"
                        onClick={() => {
                          setIsHeaderMenuOpen(false);
                          setSigModalTarget('accountant');
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-right font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        <PenTool className="w-3.5 h-3.5 text-sky-500" />
                        <span>{accountantSig ? 'تعديل توقيع المستلم' : 'توقيع المستلم'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsHeaderMenuOpen(false);
                          setSigModalTarget('receiver');
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-right font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        <PenTool className="w-3.5 h-3.5 text-amber-500" />
                        <span>{receiverSig ? 'تعديل توقيع المريض' : 'توقيع المريض'}</span>
                      </button>
                      {matchedPatientAccount && onOpenPatientAccount && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsHeaderMenuOpen(false);
                            onOpenPatientAccount(matchedPatientAccount.accountKey);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-right font-bold text-sky-600 dark:text-sky-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>فتح كشف حساب المريض</span>
                        </button>
                      )}
                      <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
                      <button
                        type="button"
                        onClick={() => {
                          setIsHeaderMenuOpen(false);
                          resetForm();
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-right font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>تفريغ الحقول</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* رقم السند والتاريخ */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                  رقم السند
                </label>
                <SmartNumberInput
                  allowDecimal={false}
                  value={receiptNo}
                  onValueChange={(val) => setReceiptNo(val > 0 ? Math.round(val) : 1)}
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
                      مرتبط بحساب: {matchedPatientAccount.patientName}
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
                    الزيارات السابقة: {matchedPatientAccount.visitsCount} • آخر زيارة:{' '}
                    {matchedPatientAccount.lastVisitDate}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {onOpenPatientAccount && (
                    <button
                      type="button"
                      onClick={() => onOpenPatientAccount(matchedPatientAccount.accountKey)}
                      className="px-2.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold transition-colors"
                    >
                      كشف الحساب
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
                  الخدمات العلاجية ({selectedServices.length})
                </label>
                <button
                  type="button"
                  onClick={() => setIsServicesModalOpen(true)}
                  className="w-full flex items-center justify-between gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2.5 text-xs font-bold text-slate-800 dark:text-slate-200 hover:border-sky-500 transition-colors"
                >
                  <span className="truncate">
                    {selectedServices.length > 0
                      ? selectedServices.join(' + ')
                      : 'اضغط لاختيار الخدمات من القائمة'}
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
                    placeholder="12 - 46"
                    className="flex-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-mono tabular-nums text-slate-900 dark:text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setActiveServiceForFdiModal(selectedServices[0]);
                      setIsFdiModalOpen(true);
                    }}
                    className="px-3 py-2 text-xs font-bold rounded-lg bg-sky-600 hover:bg-sky-500 text-white shrink-0 transition-colors"
                  >
                    المخطط
                  </button>
                </div>
              </div>
            </div>

            {/* تخصيص رقم السن لكل خدمة عند اختيار أكثر من خدمة */}
            {selectedServices.length > 1 && (
              <div className="rounded-xl border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/50 dark:bg-indigo-950/25 p-3 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-950 dark:text-indigo-200">
                    <Layers className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                    <span>تحديد رقم السن لكل خدمة على حدة:</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveServiceForFdiModal(selectedServices[0]);
                      setIsFdiModalOpen(true);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold transition-colors"
                  >
                    تخصيص من مخطط الأسنان
                  </button>
                </div>

                <div className="space-y-2">
                  {selectedServices.map((srv, idx) => {
                    const assignedTeeth = serviceTeethMap[srv] || [];
                    return (
                      <div
                        key={srv}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-5 h-5 rounded-full bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 text-[11px] font-bold flex items-center justify-center shrink-0">
                            {idx + 1}
                          </span>
                          <span className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                            {srv}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          {/* Quick toggle buttons for already entered teeth */}
                          {selectedTeethList.map((tooth) => {
                            const isAssigned = assignedTeeth.includes(tooth);
                            return (
                              <button
                                key={tooth}
                                type="button"
                                onClick={() => handleToggleToothForService(srv, tooth)}
                                className={`px-2 py-1 rounded-md text-[11px] font-mono font-bold border transition-colors ${
                                  isAssigned
                                    ? 'bg-sky-600 border-sky-500 text-white'
                                    : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-sky-400'
                                }`}
                                title={`تخصيص السن ${tooth} لخدمة ${srv}`}
                              >
                                سن {tooth} {isAssigned ? '✓' : ''}
                              </button>
                            );
                          })}

                          <button
                            type="button"
                            onClick={() => {
                              setActiveServiceForFdiModal(srv);
                              setIsFdiModalOpen(true);
                            }}
                            className="px-2 py-1 rounded-md text-[11px] font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-sky-600 dark:text-sky-400 border border-slate-200 dark:border-slate-700"
                          >
                            {assignedTeeth.length > 0
                              ? `الأسنان: ${assignedTeeth.join(' / ')}`
                              : '+ اختيار سن'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* معاينة المواد المجدولة للخصم من المخزون */}
            {inventoryDeductionStatus && (
              <div
                className={`rounded-xl border p-3 text-xs space-y-2 transition-colors ${
                  inventoryDeductionStatus.type === 'installment'
                    ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200'
                    : 'border-sky-200 dark:border-sky-900/60 bg-sky-50/70 dark:bg-sky-950/30 text-sky-900 dark:text-sky-200'
                }`}
              >
                <div className="flex items-start gap-2">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                      inventoryDeductionStatus.type === 'installment'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-sky-600 text-white'
                    }`}
                  >
                    {inventoryDeductionStatus.label}
                  </span>
                  <span className="flex-1 leading-relaxed text-[11px] sm:text-xs font-medium">
                    {inventoryDeductionStatus.message}
                  </span>
                </div>

                {scheduledDeductionDetails.length > 0 && (
                  <div className="pt-1.5 border-t border-sky-200/60 dark:border-sky-800/50 flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-700 dark:text-slate-300">
                      <Package className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                      <span>المواد التي ستُخصم:</span>
                    </span>
                    {scheduledDeductionDetails.map((mat) => (
                      <span
                        key={mat.id}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 border border-sky-300/70 dark:border-sky-800 text-[11px] font-bold text-slate-800 dark:text-slate-100"
                      >
                        <span>{mat.name}:</span>
                        <strong className="font-mono text-sky-600 dark:text-sky-400">
                          {mat.amount} {mat.unit}
                        </strong>
                      </span>
                    ))}
                  </div>
                )}

                {unlinkedSelectedServices.length > 0 && (
                  <div className="text-[11px] text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2.5 py-1.5">
                    ملاحظة: الخدمة ({unlinkedSelectedServices.join(' ، ')}) غير مربوطة بمادة في المخزون بعد. يمكنك ربطها من (الإعدادات &gt; الخدمات &gt; إعداد المواد) أو من (المخزون &gt; تعديل الصنف).
                  </div>
                )}
              </div>
            )}

            {/* المبالغ المالية الثلاثة */}
            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                  الإجمالي
                </label>
                <SmartNumberInput
                  placeholder="0"
                  emptyWhenZero
                  value={totalAmount}
                  onFocus={(e) => e.currentTarget.select()}
                  onValueChange={(val) => {
                    const safeVal = Math.max(0, val);
                    setTotalAmount(safeVal);
                    if (paidAmount === 0 || paidAmount === totalAmount) {
                      setPaidAmount(safeVal);
                    }
                  }}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-2.5 py-2 text-sm font-mono tabular-nums font-black text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-emerald-600 dark:text-emerald-400 mb-1">
                  المقبوض
                </label>
                <SmartNumberInput
                  placeholder="0"
                  emptyWhenZero
                  value={paidAmount}
                  onFocus={(e) => e.currentTarget.select()}
                  onValueChange={(val) => {
                    setPaidAmount(Math.max(0, val));
                  }}
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

            {/* زر الحفظ */}
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={handleSave}
                className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs sm:text-sm shadow-sm transition-colors"
              >
                <Save className="w-4 h-4" />
                <span>{editingReceipt ? 'تحديث السند' : 'حفظ السند واعتماد الخصم'}</span>
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
                  اختيار الخدمات العلاجية
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

            <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {settings.services.map((srv) => {
                const displayName = srv.name
                  .replace(/تجليح\s*لثة|تجليح\s*اللثة/g, 'تقليح اللثة')
                  .replace(/تجليح/g, 'تقليح');
                const isSelected =
                  selectedServices.includes(displayName) || selectedServices.includes(srv.name);
                const rulesCount = Array.isArray(srv.materialsRecipe)
                  ? srv.materialsRecipe.length
                  : 0;
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
                    <div className="flex items-center justify-between w-full mt-1.5 gap-2">
                      <span
                        className={`text-xs font-mono tabular-nums ${
                          isSelected ? 'text-sky-100' : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {Number(srv.price).toLocaleString()} {currency}
                      </span>
                      {rulesCount > 0 && (
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                            isSelected
                              ? 'bg-sky-800/70 text-sky-100'
                              : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {rulesCount} مادة مربوطة
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 shrink-0 flex items-center gap-2">
              {selectedServices.length > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    setIsServicesModalOpen(false);
                    setActiveServiceForFdiModal(selectedServices[0]);
                    setIsFdiModalOpen(true);
                  }}
                  className="py-2.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-colors shrink-0"
                >
                  تحديد سن لكل خدمة
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsServicesModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition-colors shadow-sm"
              >
                اعتماد الخدمات ({selectedServices.length})
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
        services={selectedServices}
        serviceTeethMap={serviceTeethMap}
        initialActiveService={activeServiceForFdiModal}
        onClose={() => setIsFdiModalOpen(false)}
        onApply={(teeth) => setToothFDI(teeth.join(' - '))}
        onApplyServiceTeeth={(nextMap, allUnique) => {
          setServiceTeethMap(nextMap);
          setToothFDI(allUnique.join(' - '));
        }}
      />
    </div>
  );
};
