import React, { useMemo, useState } from 'react';
import {
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
  CurrencyCode,
  CurrencyFinancialSummary,
  ExpenseRecord,
  InventoryItem,
  ReceiptRecord,
} from '../types/clinic';
import { CURRENCIES } from '../data/defaultData';
import { queryClinicAssistant } from '../utils/aiClient';

interface FinanceDashboardProps {
  receipts: ReceiptRecord[];
  expenses: ExpenseRecord[];
  inventory: InventoryItem[];
  defaultCurrency: CurrencyCode | string;
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
  defaultCurrency,
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
  const [selectedCurrency, setSelectedCurrency] = useState<string>(String(defaultCurrency));

  React.useEffect(() => {
    try {
      localStorage.setItem('docai_finance_subtab_v1', subTab);
    } catch {
      // Ignore
    }
  }, [subTab]);

  // Pop-up Expense Modal
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState<boolean>(false);
  const [expTitle, setExpTitle] = useState('');
  const [expAmount, setExpAmount] = useState<number>(0);
  const [expCategory, setExpCategory] = useState<string>('مشتريات مخزون');
  const [expCurrency, setExpCurrency] = useState<string>(String(defaultCurrency));

  // Pop-up AI Report Modal
  const [aiReport, setAiReport] = useState<string>('');
  const [isGeneratingReport, setIsGeneratingReport] = useState<boolean>(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const currencySummaries = useMemo<CurrencyFinancialSummary[]>(() => {
    const map = new Map<string, CurrencyFinancialSummary>();

    const ensureBucket = (curr: string) => {
      const key = curr || String(defaultCurrency);
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

    ensureBucket(String(defaultCurrency));

    receipts.forEach((r) => {
      const row = ensureBucket(String(r.currency || defaultCurrency));
      row.totalBilledAmount += Number(r.totalAmount) || 0;
      row.totalCollectedRevenue += Number(r.paidAmount) || 0;
      row.totalPendingDebts += Number(r.remainingAmount) || 0;
      row.receiptsCount += 1;
      if ((Number(r.remainingAmount) || 0) > 0) {
        row.debtorsCount += 1;
      }
    });

    expenses.forEach((e) => {
      const row = ensureBucket(String(e.currency || defaultCurrency));
      row.totalExpenses += Number(e.amount) || 0;
    });

    return Array.from(map.values()).map((item) => ({
      ...item,
      netCashProfit: item.totalCollectedRevenue - item.totalExpenses,
    }));
  }, [receipts, expenses, defaultCurrency]);

  const activeSummary = useMemo(() => {
    return (
      currencySummaries.find((c) => c.currency === selectedCurrency) || {
        currency: selectedCurrency,
        totalBilledAmount: 0,
        totalCollectedRevenue: 0,
        totalPendingDebts: 0,
        totalExpenses: 0,
        netCashProfit: 0,
        receiptsCount: 0,
        debtorsCount: 0,
      }
    );
  }, [currencySummaries, selectedCurrency]);

  const collectionRate = useMemo(() => {
    if (activeSummary.totalBilledAmount <= 0) return 100;
    return Math.round(
      (activeSummary.totalCollectedRevenue / activeSummary.totalBilledAmount) * 100
    );
  }, [activeSummary]);

  const handleCreateExpense = (e: React.FormEvent) => {
    e.preventDefault();
    if (!expTitle.trim() || Number(expAmount) <= 0) {
      notify('يرجى إدخال بيان المصروف والمبلغ', 'warning');
      return;
    }
    onAddExpense(expTitle.trim(), Number(expAmount), expCategory, expCurrency);
    setExpTitle('');
    setExpAmount(0);
    setIsExpenseModalOpen(false);
  };

  const handleGenerateFinancialReport = async () => {
    setIsGeneratingReport(true);
    try {
      const reply = await queryClinicAssistant({
        taskType: 'report',
        prompt:
          'أعد تقريراً مالياً تنفيذياً مختصراً لأداء العيادة: حلل الإيرادات، نسبة التحصيل، الديون، المصروفات، وصافي الربح النقدي مع 3 توصيات عملية.',
        clinicContext: {
          currencySummaries,
          expenses: expenses.slice(0, 20),
          totalReceipts: receipts.length,
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
          المؤشرات المالية
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
            <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
              المصروفات
            </h2>
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
              {expenses.map((exp) => (
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
                      {Number(exp.amount).toLocaleString()} {exp.currency}
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
              ))}
            </div>
          )}
        </section>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
              {CURRENCIES.map((curr) => (
                <button
                  key={curr}
                  type="button"
                  onClick={() => setSelectedCurrency(curr)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${
                    selectedCurrency === curr
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {curr}
                </button>
              ))}
            </div>

            <button
              type="button"
              disabled={isGeneratingReport}
              onClick={handleGenerateFinancialReport}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-sky-600 hover:bg-sky-500 disabled:opacity-60 rounded-lg"
            >
              {isGeneratingReport ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              <span>تقرير مالي</span>
            </button>
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
              <div className="mt-1 text-[11px] text-slate-400">التحصيل: {collectionRate}%</div>
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
                {activeSummary.debtorsCount} حالة آجلة
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
              <div className="mt-1 text-[11px] text-slate-400">نفقات مسجلة</div>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>صافي الربح</span>
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
              <div className="mt-1 text-[11px] text-slate-400">{activeSummary.currency}</div>
            </div>
          </div>

          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">ملخص العملات</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {currencySummaries.map((row) => (
                <div
                  key={row.currency}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3.5 space-y-1.5 text-xs"
                >
                  <div className="font-bold text-slate-900 dark:text-slate-100 border-b border-slate-200 dark:border-slate-800 pb-1.5">
                    {row.currency} ({row.receiptsCount} سند)
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">المقبوض:</span>
                    <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      {row.totalCollectedRevenue.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">الديون:</span>
                    <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
                      {row.totalPendingDebts.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">المصروفات:</span>
                    <span className="font-mono font-bold text-rose-600 dark:text-rose-400">
                      {row.totalExpenses.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-slate-200 dark:border-slate-800">
                    <span className="font-bold">الصافي:</span>
                    <span className="font-mono font-black text-sky-600 dark:text-sky-400">
                      {row.netCashProfit.toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
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
                إضافة مصروف
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
                  المبلغ
                </label>
                <input
                  type="number"
                  min="0"
                  value={expAmount || ''}
                  onChange={(e) => setExpAmount(Number(e.target.value) || 0)}
                  placeholder="0"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm font-mono tabular-nums font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                  العملة
                </label>
                <select
                  value={expCurrency}
                  onChange={(e) => setExpCurrency(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-bold"
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>

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
                حفظ
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
                التقرير المالي
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
