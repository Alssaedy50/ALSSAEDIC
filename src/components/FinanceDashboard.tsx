import React, { useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  Loader2,
  PlusCircle,
  Sparkles,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wallet,
  X,
} from 'lucide-react';
import {
  ClinicSettings,
  CurrencyCode,
  CurrencyFinancialSummary,
  ExpenseRecord,
  InventoryItem,
  ReceiptRecord,
} from '../types/clinic';
import { CURRENCIES } from '../data/defaultData';
import {
  convertAmountToYer,
  fetchLiveExchangeRateToYer,
  getStoredExchangeRates,
  queryClinicAssistant,
  saveStoredExchangeRates,
} from '../utils/aiClient';
import { SmartNumberInput } from './SmartNumberInput';

interface FinanceDashboardProps {
  receipts: ReceiptRecord[];
  expenses: ExpenseRecord[];
  inventory: InventoryItem[];
  defaultCurrency: CurrencyCode | string;
  settings?: ClinicSettings;
  onAddExpense: (title: string, amount: number, category: string, currency: string) => void;
  onDeleteExpense: (id: string) => void;
  notify: (message: string, type?: 'success' | 'warning' | 'error' | 'info') => void;
}

const EXPENSE_CATEGORIES = [
  'مشتريات مخزون',
  'إيجار ومرافق',
  'رواتب وأجور',
  'صيانة وتشغيل',
  'تسويق وقرطاسية',
  'مصروفات عامة',
];

export const FinanceDashboard: React.FC<FinanceDashboardProps> = ({
  receipts,
  expenses,
  inventory,
  settings,
  onAddExpense,
  onDeleteExpense,
  notify,
}) => {
  const [subTab, setSubTab] = useState<'overview' | 'expenses'>(() => {
    try {
      const saved = localStorage.getItem('docai_finance_subtab_v1');
      if (saved === 'overview' || saved === 'expenses') {
        return saved;
      }
    } catch {
      // Ignore
    }
    return 'overview';
  });

  React.useEffect(() => {
    try {
      localStorage.setItem('docai_finance_subtab_v1', subTab);
    } catch {
      // Ignore
    }
  }, [subTab]);

  // Pop-up Expense Modal (Unified in Yemeni Rial with instant conversion if foreign currency chosen)
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState<boolean>(false);
  const [expTitle, setExpTitle] = useState('');
  const [expAmount, setExpAmount] = useState<number>(0);
  const [expCategory, setExpCategory] = useState<string>('مشتريات مخزون');
  const [expCurrency, setExpCurrency] = useState<string>('ريال يمني');
  const [expExchangeRate, setExpExchangeRate] = useState<number>(() => getStoredExchangeRates(settings).sarToYerRate);
  const [isFetchingExpRate, setIsFetchingExpRate] = useState<boolean>(false);

  // Pop-up AI Report Modal
  const [aiReport, setAiReport] = useState<string>('');
  const [isGeneratingReport, setIsGeneratingReport] = useState<boolean>(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const rates = useMemo(() => getStoredExchangeRates(settings), [settings]);

  // Unified Yemeni Rial Financial Summary
  const activeSummary = useMemo<CurrencyFinancialSummary>(() => {
    let totalBilledAmount = 0;
    let totalCollectedRevenue = 0;
    let totalPendingDebts = 0;
    let totalExpenses = 0;
    let debtorsCount = 0;

    receipts.forEach((r) => {
      const billedYer = convertAmountToYer(Number(r.totalAmount) || 0, r.currency, settings).yerAmount;
      const paidYer = convertAmountToYer(Number(r.paidAmount) || 0, r.currency, settings).yerAmount;
      const remYer = convertAmountToYer(Number(r.remainingAmount) || 0, r.currency, settings).yerAmount;
      totalBilledAmount += billedYer;
      totalCollectedRevenue += paidYer;
      totalPendingDebts += remYer;
      if (remYer > 0) {
        debtorsCount += 1;
      }
    });

    expenses.forEach((e) => {
      const expYer = convertAmountToYer(Number(e.amount) || 0, e.currency, settings).yerAmount;
      totalExpenses += expYer;
    });

    return {
      currency: 'ريال يمني',
      totalBilledAmount,
      totalCollectedRevenue,
      totalPendingDebts,
      totalExpenses,
      netCashProfit: totalCollectedRevenue - totalExpenses,
      receiptsCount: receipts.length,
      debtorsCount,
    };
  }, [receipts, expenses, settings]);

  const collectionRate = useMemo(() => {
    if (activeSummary.totalBilledAmount <= 0) return 100;
    return Math.round(
      (activeSummary.totalCollectedRevenue / activeSummary.totalBilledAmount) * 100
    );
  }, [activeSummary]);

  const handleFetchExpenseLiveRate = async () => {
    if (expCurrency !== 'ريال سعودي' && expCurrency !== 'دولار أمريكي') return;
    setIsFetchingExpRate(true);
    try {
      const res = await fetchLiveExchangeRateToYer(expCurrency, settings);
      if (res.rate > 0) {
        setExpExchangeRate(res.rate);
        const currentRates = getStoredExchangeRates(settings);
        saveStoredExchangeRates(
          expCurrency === 'ريال سعودي' ? res.rate : currentRates.sarToYerRate,
          expCurrency === 'دولار أمريكي' ? res.rate : currentRates.usdToYerRate
        );
        notify(`تم تحديث سعر صرف ${expCurrency}: ${res.rate} ريال يمني`, 'success');
      }
    } finally {
      setIsFetchingExpRate(false);
    }
  };

  const handleCreateExpense = (e: React.FormEvent) => {
    e.preventDefault();
    if (!expTitle.trim() || Number(expAmount) <= 0) {
      notify('يرجى إدخال بيان المصروف والمبلغ', 'warning');
      return;
    }

    let finalYerAmount = Math.round(Number(expAmount));
    let finalTitle = expTitle.trim();

    if (expCurrency === 'ريال سعودي' || expCurrency === 'دولار أمريكي') {
      const rate = Number(expExchangeRate) > 0 ? Number(expExchangeRate) : expCurrency === 'ريال سعودي' ? rates.sarToYerRate : rates.usdToYerRate;
      finalYerAmount = Math.round(Number(expAmount) * rate);
      finalTitle = `${finalTitle} (محوّل من ${expAmount} ${expCurrency} × ${rate})`;
    }

    onAddExpense(finalTitle, finalYerAmount, expCategory, 'ريال يمني');
    setExpTitle('');
    setExpAmount(0);
    setExpCurrency('ريال يمني');
    setIsExpenseModalOpen(false);
  };

  const handleGenerateFinancialReport = async () => {
    setIsGeneratingReport(true);
    try {
      const reply = await queryClinicAssistant({
        taskType: 'report',
        prompt:
          'أعد تقريراً مالياً تنفيذياً مختصراً لأداء العيادة بالحساب الموحد (ريال يمني): حلل الإيرادات، نسبة التحصيل، الديون، المصروفات، وصافي الربح النقدي مع 3 توصيات عملية.',
        clinicContext: {
          currencySummaries: [activeSummary],
          allExpenses: expenses,
          expenses,
          totalReceipts: receipts.length,
          allReceipts: receipts,
          inventoryCount: inventory.length,
        },
      });
      setAiReport(reply || '');
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'تعذر توليد التقرير المالي', 'error');
    } finally {
      setIsGeneratingReport(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top 2-Tab Segmented Switcher (المؤشرات المالية | سجل المصروفات) */}
      <div className="grid grid-cols-2 gap-1.5 p-1.5 rounded-xl bg-slate-200/70 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        <button
          type="button"
          onClick={() => setSubTab('overview')}
          className={`py-2 px-3 rounded-lg text-xs font-bold transition-colors ${
            subTab === 'overview'
              ? 'bg-sky-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          المؤشرات المالية (ريال يمني)
        </button>
        <button
          type="button"
          data-tab="expenses"
          onClick={() => setSubTab('expenses')}
          className={`py-2 px-3 rounded-lg text-xs font-bold transition-colors ${
            subTab === 'expenses'
              ? 'bg-sky-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          المصروفات ({expenses.length})
        </button>
      </div>

      {subTab === 'expenses' ? (
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-4">
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
                سجل المصروفات (بالريال اليمني الموحد)
              </h2>
              <p className="text-[11px] text-slate-500">
                إجمالي المصروفات: {activeSummary.totalExpenses.toLocaleString()} ريال يمني
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsExpenseModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-sky-600 hover:bg-sky-500 rounded-lg"
            >
              <PlusCircle className="w-4 h-4" />
              <span>إضافة مصروف</span>
            </button>
          </div>

          {expenses.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-500">
              لا توجد مصروفات مسجلة حتى الآن.
            </div>
          ) : (
            <div className="space-y-2.5">
              {expenses.map((exp) => {
                const converted = convertAmountToYer(Number(exp.amount) || 0, exp.currency, settings);
                return (
                  <div
                    key={exp.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-3.5"
                  >
                    <div className="min-w-0">
                      <div className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                        {exp.title}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                        <span>{exp.category}</span>
                        <span>·</span>
                        <span className="whitespace-nowrap shrink-0 font-mono tabular-nums">
                          {exp.date}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono tabular-nums font-bold text-xs sm:text-sm text-rose-600 dark:text-rose-400 whitespace-nowrap">
                        {converted.yerAmount.toLocaleString()} ريال يمني
                      </span>
                      {confirmDeleteId === exp.id ? (
                        <button
                          type="button"
                          onClick={() => {
                            onDeleteExpense(exp.id);
                            setConfirmDeleteId(null);
                          }}
                          className="px-2.5 py-1 text-xs font-bold text-white bg-rose-600 rounded-lg"
                        >
                          تأكيد؟
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(exp.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg"
                          title="حذف"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs font-black text-emerald-700 dark:text-emerald-300">
                <Wallet className="w-3.5 h-3.5" />
                <span>الحساب المالي الموحد: ريال يمني</span>
              </span>
              <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                (السعودي = {rates.sarToYerRate} | الدولار = {rates.usdToYerRate})
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsExpenseModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors"
              >
                <PlusCircle className="w-4 h-4 text-rose-500" />
                <span>تسجيل مصروف</span>
              </button>

              <button
                type="button"
                disabled={isGeneratingReport}
                onClick={handleGenerateFinancialReport}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-sky-600 hover:bg-sky-500 disabled:opacity-60 rounded-xl transition-colors"
              >
                {isGeneratingReport ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                <span>تقرير مالي</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>الإيراد المقبوض</span>
                <TrendingUp className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="mt-1.5 text-lg sm:text-2xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                {activeSummary.totalCollectedRevenue.toLocaleString()}
              </div>
              <div className="mt-1 text-[11px] text-slate-400">
                ريال يمني · التحصيل: {collectionRate}%
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>ديون المرضى</span>
                <Wallet className="w-4 h-4 text-amber-500" />
              </div>
              <div className="mt-1.5 text-lg sm:text-2xl font-bold font-mono tabular-nums text-amber-600 dark:text-amber-400">
                {activeSummary.totalPendingDebts.toLocaleString()}
              </div>
              <div className="mt-1 text-[11px] text-slate-400">
                ريال يمني · {activeSummary.debtorsCount} حالة آجلة
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>المصروفات</span>
                <TrendingDown className="w-4 h-4 text-rose-500" />
              </div>
              <div className="mt-1.5 text-lg sm:text-2xl font-bold font-mono tabular-nums text-rose-600 dark:text-rose-400">
                {activeSummary.totalExpenses.toLocaleString()}
              </div>
              <div className="mt-1 text-[11px] text-slate-400">ريال يمني · نفقات مسجلة</div>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>صافي الربح النقدي</span>
                <Wallet className="w-4 h-4 text-sky-500" />
              </div>
              <div
                className={`mt-1.5 text-lg sm:text-2xl font-bold font-mono tabular-nums ${
                  activeSummary.netCashProfit >= 0
                    ? 'text-sky-600 dark:text-sky-400'
                    : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {activeSummary.netCashProfit.toLocaleString()}
              </div>
              <div className="mt-1 text-[11px] text-slate-400">ريال يمني</div>
            </div>
          </div>

          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                كشف الحساب المالي الموحد (ريال يمني)
              </h3>
              <span className="text-xs font-mono font-bold text-slate-500">
                إجمالي السندات: {activeSummary.receiptsCount} سند
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 flex items-center justify-between">
                <span className="text-slate-500">إجمالي قيمة الفواتير:</span>
                <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                  {activeSummary.totalBilledAmount.toLocaleString()} ريال يمني
                </span>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 flex items-center justify-between">
                <span className="text-slate-500">المقبوض الفعلي:</span>
                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  {activeSummary.totalCollectedRevenue.toLocaleString()} ريال يمني
                </span>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 flex items-center justify-between">
                <span className="text-slate-500">صافي الخزينة (المقبوض - المصروفات):</span>
                <span className="font-mono font-black text-sky-600 dark:text-sky-400">
                  {activeSummary.netCashProfit.toLocaleString()} ريال يمني
                </span>
              </div>
            </div>
          </section>
        </>
      )}

      {/* Pop-up Add Expense Modal */}
      {isExpenseModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-4"
          onClick={() => setIsExpenseModalOpen(false)}
        >
          <form
            onSubmit={handleCreateExpense}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                إضافة مصروف (يُسجل بالريال اليمني)
              </h3>
              <button
                type="button"
                onClick={() => setIsExpenseModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                aria-label="إغلاق"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                بيان المصروف
              </label>
              <input
                type="text"
                value={expTitle}
                onChange={(e) => setExpTitle(e.target.value)}
                placeholder="مستلزمات تعقيم..."
                className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                  المبلغ ({expCurrency})
                </label>
                <SmartNumberInput
                  placeholder="0"
                  emptyWhenZero
                  value={expAmount}
                  onValueChange={(val) => {
                    setExpAmount(Math.max(0, val));
                  }}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm font-mono tabular-nums font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                  عملة الدفع
                </label>
                <select
                  value={expCurrency}
                  onChange={(e) => {
                    const nextCurr = e.target.value;
                    setExpCurrency(nextCurr);
                    if (nextCurr === 'ريال سعودي') {
                      setExpExchangeRate(rates.sarToYerRate);
                    } else if (nextCurr === 'دولار أمريكي') {
                      setExpExchangeRate(rates.usdToYerRate);
                    }
                  }}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-bold"
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c === 'ريال يمني' ? 'ريال يمني (مباشر)' : `${c} (تحويل إلى يمني)`}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {(expCurrency === 'ريال سعودي' || expCurrency === 'دولار أمريكي') && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1">
                    <ArrowLeftRight className="w-3.5 h-3.5" />
                    <span>سعر صرف {expCurrency} مقابل اليمني:</span>
                  </span>
                  <button
                    type="button"
                    disabled={isFetchingExpRate}
                    onClick={handleFetchExpenseLiveRate}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-600 text-white text-[10px] font-bold"
                  >
                    {isFetchingExpRate ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                    <span>بحث مباشر</span>
                  </button>
                </div>
                <SmartNumberInput
                  value={expExchangeRate}
                  onValueChange={(val) => setExpExchangeRate(Math.max(0, val))}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-mono font-bold"
                />
                <div className="flex items-center justify-between text-xs font-bold text-emerald-700 dark:text-emerald-300 pt-1">
                  <span>المبلغ المحوّل للقيد:</span>
                  <span className="font-mono">
                    {Math.round((expAmount || 0) * (expExchangeRate || 0)).toLocaleString()} ريال يمني
                  </span>
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                التصنيف
              </label>
              <select
                value={expCategory}
                onChange={(e) => setExpCategory(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-bold"
              >
                {EXPENSE_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="submit"
                className="w-full py-2.5 rounded-xl font-bold text-xs bg-sky-600 hover:bg-sky-500 text-white transition-colors"
              >
                حفظ بالريال اليمني
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Pop-up AI Report Modal */}
      {aiReport && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-4"
          onClick={() => setAiReport('')}
        >
          <div
            className="w-full max-w-lg max-h-[85vh] flex flex-col rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800 shrink-0">
              <h3 className="text-sm font-bold text-sky-600 dark:text-sky-400">
                التقرير المالي الموحد (ريال يمني)
              </h3>
              <button
                type="button"
                onClick={() => setAiReport('')}
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                aria-label="إغلاق"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 text-xs sm:text-sm leading-relaxed text-slate-800 dark:text-slate-200 whitespace-pre-line">
              {aiReport}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

