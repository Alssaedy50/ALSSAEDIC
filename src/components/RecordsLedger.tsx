import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  CreditCard,
  Edit3,
  Eye,
  FilePlus2,
  Search,
  Trash2,
} from 'lucide-react';
import { ClinicSettings, ReceiptRecord } from '../types/clinic';
import { OfficialReceiptCard } from './OfficialReceiptCard';

interface RecordsLedgerProps {
  settings: ClinicSettings;
  receipts: ReceiptRecord[];
  defaultCurrency: string;
  onEditReceipt: (receipt: ReceiptRecord) => void;
  onSettleDebt: (receiptId: string, amountPaid: number) => void;
  onDeleteReceipt: (receiptId: string) => void;
  onGoToNewReceipt: () => void;
  notify: (message: string, type?: 'success' | 'warning' | 'error' | 'info') => void;
}

export const RecordsLedger: React.FC<RecordsLedgerProps> = ({
  settings,
  receipts,
  defaultCurrency,
  onEditReceipt,
  onSettleDebt,
  onDeleteReceipt,
  onGoToNewReceipt,
  notify,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'debt' | 'paid'>('all');
  const [currencyFilter, setCurrencyFilter] = useState<string>('all');

  // Pop-up Modals
  const [settlingReceipt, setSettlingReceipt] = useState<ReceiptRecord | null>(null);
  const [settleAmountInput, setSettleAmountInput] = useState<string>('');
  const [previewReceipt, setPreviewReceipt] = useState<ReceiptRecord | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const availableCurrencies = useMemo(() => {
    const set = new Set<string>([defaultCurrency]);
    receipts.forEach((r) => {
      if (r.currency) set.add(String(r.currency));
    });
    return Array.from(set);
  }, [receipts, defaultCurrency]);

  const filteredReceipts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return receipts.filter((r) => {
      if (statusFilter === 'debt' && (Number(r.remainingAmount) || 0) <= 0) return false;
      if (statusFilter === 'paid' && (Number(r.remainingAmount) || 0) > 0) return false;
      if (currencyFilter !== 'all' && r.currency !== currencyFilter) return false;

      if (!q) return true;
      const inName = (r.patientName || '').toLowerCase().includes(q);
      const inPhone = (r.patientPhone || '').toLowerCase().includes(q);
      const inNo = String(r.receiptNo || '').includes(q);
      const inServices = (r.services || []).join(' ').toLowerCase().includes(q);
      return inName || inPhone || inNo || inServices;
    });
  }, [receipts, searchQuery, statusFilter, currencyFilter]);

  const summaryStats = useMemo(() => {
    return filteredReceipts.reduce(
      (acc, r) => {
        acc.totalBilled += Number(r.totalAmount) || 0;
        acc.totalPaid += Number(r.paidAmount) || 0;
        acc.totalRemaining += Number(r.remainingAmount) || 0;
        if ((Number(r.remainingAmount) || 0) > 0) acc.debtors += 1;
        return acc;
      },
      { totalBilled: 0, totalPaid: 0, totalRemaining: 0, debtors: 0 }
    );
  }, [filteredReceipts]);

  const openSettleModal = (rec: ReceiptRecord) => {
    setSettlingReceipt(rec);
    setSettleAmountInput(String(rec.remainingAmount || 0));
  };

  const confirmSettleDebt = (e: React.FormEvent) => {
    e.preventDefault();
    if (!settlingReceipt) return;
    const val = Number(settleAmountInput) || 0;
    if (val <= 0) return;
    onSettleDebt(settlingReceipt.id, val);
    setSettlingReceipt(null);
  };

  return (
    <div className="space-y-4">
      {/* Top 3-Tab Filter Bar (الكل | ديون المرضى | مسدد) */}
      <div className="grid grid-cols-3 gap-1.5 p-1.5 rounded-xl bg-slate-200/70 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        <button
          type="button"
          onClick={() => setStatusFilter('all')}
          className={`py-2 px-2 rounded-lg text-xs font-bold transition-colors ${
            statusFilter === 'all'
              ? 'bg-sky-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          الكل ({receipts.length})
        </button>
        <button
          type="button"
          onClick={() => setStatusFilter('debt')}
          className={`py-2 px-2 rounded-lg text-xs font-bold transition-colors ${
            statusFilter === 'debt'
              ? 'bg-rose-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          ديون المرضى
        </button>
        <button
          type="button"
          onClick={() => setStatusFilter('paid')}
          className={`py-2 px-2 rounded-lg text-xs font-bold transition-colors ${
            statusFilter === 'paid'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          مسدد بالكامل
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5">
          <div className="text-xs text-slate-500 dark:text-slate-400">عدد السندات</div>
          <div className="mt-1 text-lg sm:text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {filteredReceipts.length}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5">
          <div className="text-xs text-slate-500 dark:text-slate-400">إجمالي السندات</div>
          <div className="mt-1 text-lg sm:text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {summaryStats.totalBilled.toLocaleString()}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5">
          <div className="text-xs text-slate-500 dark:text-slate-400">المقبوض نقداً</div>
          <div className="mt-1 text-lg sm:text-xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
            {summaryStats.totalPaid.toLocaleString()}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5">
          <div className="text-xs text-slate-500 dark:text-slate-400">الديون المتبقية</div>
          <div className="mt-1 text-lg sm:text-xl font-bold font-mono tabular-nums text-rose-600 dark:text-rose-400">
            {summaryStats.totalRemaining.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Search & Currency Filter */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث بالاسم، الهاتف، أو رقم السند..."
              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 pr-9 pl-3 py-2 text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:border-sky-500 focus:outline-none"
            />
          </div>

          <select
            value={currencyFilter}
            onChange={(e) => setCurrencyFilter(e.target.value)}
            className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-bold text-slate-800 dark:text-slate-200"
          >
            <option value="all">كل العملات</option>
            {availableCurrencies.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {filteredReceipts.length === 0 ? (
          <div className="py-10 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-xl space-y-3">
            <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
              لا توجد سندات مطابقة للبحث
            </p>
            <button
              type="button"
              onClick={onGoToNewReceipt}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-sky-600 hover:bg-sky-500 rounded-lg"
            >
              <FilePlus2 className="w-4 h-4" />
              <span>إصدار سند</span>
            </button>
          </div>
        ) : (
          <>
            {/* Mobile Cards View */}
            <div className="grid grid-cols-1 gap-3 md:hidden">
              {filteredReceipts.map((rec) => {
                const hasDebt = (Number(rec.remainingAmount) || 0) > 0;
                return (
                  <div
                    key={rec.id}
                    className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-3.5 space-y-2.5"
                  >
                    <div className="flex items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono tabular-nums font-black text-sky-600 dark:text-sky-400 text-sm">
                          #{rec.receiptNo}
                        </span>
                        <span className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                          {rec.patientName}
                        </span>
                      </div>
                      <span className="font-mono tabular-nums text-[11px] text-slate-500">
                        {rec.date}
                      </span>
                    </div>

                    <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1">
                      <div>
                        <span className="text-slate-400">الخدمات: </span>
                        <span className="font-semibold">
                          {(rec.services || []).join(' + ') || rec.notes || '—'}
                        </span>
                      </div>
                      {rec.toothFDI && (
                        <div>
                          <span className="text-slate-400">الأسنان (FDI): </span>
                          <span className="font-mono font-bold text-sky-500">{rec.toothFDI}</span>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center bg-white dark:bg-slate-900 p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-xs">
                      <div>
                        <div className="text-[10px] text-slate-400">الإجمالي</div>
                        <div className="font-mono tabular-nums font-bold">
                          {Number(rec.totalAmount).toLocaleString()}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-emerald-500">المقبوض</div>
                        <div className="font-mono tabular-nums font-bold text-emerald-600 dark:text-emerald-400">
                          {Number(rec.paidAmount).toLocaleString()}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-rose-500">المتبقي</div>
                        <div
                          className={`font-mono tabular-nums font-bold ${
                            hasDebt
                              ? 'text-rose-600 dark:text-rose-400'
                              : 'text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {hasDebt ? Number(rec.remainingAmount).toLocaleString() : 'مسدد'}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={() => setPreviewReceipt(rec)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/60 rounded-lg border border-sky-200 dark:border-sky-800"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>معاينة</span>
                      </button>

                      {hasDebt && (
                        <button
                          type="button"
                          onClick={() => openSettleModal(rec)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 rounded-lg border border-emerald-200 dark:border-emerald-800"
                        >
                          <CreditCard className="w-3.5 h-3.5" />
                          <span>تسديد</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => onEditReceipt(rec)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-200/70 dark:bg-slate-800 rounded-lg"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>تعديل</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onDeleteReceipt(rec.id)}
                        className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg"
                        title="حذف"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-right border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-500 dark:text-slate-400">
                    <th className="py-3 px-3">رقم السند</th>
                    <th className="py-3 px-3">التاريخ</th>
                    <th className="py-3 px-3">المريض</th>
                    <th className="py-3 px-3">الخدمات العلاجية</th>
                    <th className="py-3 px-3 text-left">الإجمالي</th>
                    <th className="py-3 px-3 text-left">المقبوض</th>
                    <th className="py-3 px-3 text-left">المتبقي</th>
                    <th className="py-3 px-3 text-left">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs sm:text-sm">
                  {filteredReceipts.map((rec) => {
                    const hasDebt = (Number(rec.remainingAmount) || 0) > 0;
                    return (
                      <tr
                        key={rec.id}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="py-3 px-3 font-mono tabular-nums font-bold text-sky-600 dark:text-sky-400">
                          #{rec.receiptNo}
                        </td>
                        <td className="py-3 px-3 font-mono tabular-nums text-xs text-slate-500">
                          {rec.date}
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-bold text-slate-900 dark:text-slate-100">
                            {rec.patientName}
                          </div>
                          {rec.patientPhone && (
                            <div className="text-xs font-mono tabular-nums text-slate-500">
                              {rec.patientPhone}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3 max-w-xs">
                          <div className="text-xs text-slate-800 dark:text-slate-200 truncate">
                            {(rec.services || []).join(' + ') || rec.notes || '—'}
                          </div>
                          {rec.toothFDI && (
                            <div className="text-[11px] font-mono text-sky-600 dark:text-sky-400">
                              FDI: {rec.toothFDI}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3 text-left font-mono tabular-nums">
                          {Number(rec.totalAmount).toLocaleString()}{' '}
                          <span className="text-[10px] text-slate-400">{rec.currency}</span>
                        </td>
                        <td className="py-3 px-3 text-left font-mono tabular-nums font-bold text-emerald-600 dark:text-emerald-400">
                          {Number(rec.paidAmount).toLocaleString()}
                        </td>
                        <td className="py-3 px-3 text-left font-mono tabular-nums">
                          {hasDebt ? (
                            <span className="font-bold text-rose-600 dark:text-rose-400">
                              {Number(rec.remainingAmount).toLocaleString()}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>مسدد</span>
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-left">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setPreviewReceipt(rec)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/60 rounded-lg border border-sky-200 dark:border-sky-800"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>معاينة</span>
                            </button>

                            {hasDebt && (
                              <button
                                type="button"
                                onClick={() => openSettleModal(rec)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-lg"
                              >
                                <CreditCard className="w-3.5 h-3.5" />
                                <span>تسديد</span>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => onEditReceipt(rec)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 rounded-lg"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>تعديل</span>
                            </button>

                            {deletingId === rec.id ? (
                              <button
                                type="button"
                                onClick={() => {
                                  onDeleteReceipt(rec.id);
                                  setDeletingId(null);
                                }}
                                className="px-2.5 py-1.5 text-xs font-bold text-white bg-rose-600 rounded-lg"
                              >
                                تأكيد
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setDeletingId(rec.id)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {/* Pop-up Modal: Receipt Preview with Sticky Back Header */}
      {previewReceipt && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-3 sm:p-4 no-print"
          onClick={() => setPreviewReceipt(null)}
        >
          <div
            className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                سند قبض #{previewReceipt.receiptNo}
              </h3>
              <button
                type="button"
                onClick={() => setPreviewReceipt(null)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold"
              >
                <ArrowRight className="w-3.5 h-3.5" />
                <span>رجوع</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3.5 sm:p-5">
              <OfficialReceiptCard
                data={previewReceipt}
                settings={settings}
                notify={notify}
                showToolbar={true}
              />
            </div>
          </div>
        </div>
      )}

      {/* Pop-up Modal: Debt Settlement with Sticky Back Header */}
      {settlingReceipt && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-4 no-print"
          onClick={() => setSettlingReceipt(null)}
        >
          <form
            onSubmit={confirmSettleDebt}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                تسديد دين #{settlingReceipt.receiptNo}
              </h3>
              <button
                type="button"
                onClick={() => setSettlingReceipt(null)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold"
              >
                <ArrowRight className="w-3.5 h-3.5" />
                <span>رجوع</span>
              </button>
            </div>

            <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
              <div>
                المريض:{' '}
                <strong className="text-slate-900 dark:text-slate-100">
                  {settlingReceipt.patientName}
                </strong>
              </div>
              <div>
                المتبقي حالياً:{' '}
                <strong className="font-mono tabular-nums text-rose-600 dark:text-rose-400">
                  {Number(settlingReceipt.remainingAmount).toLocaleString()}{' '}
                  {settlingReceipt.currency}
                </strong>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                المبلغ المسدد الآن ({settlingReceipt.currency})
              </label>
              <input
                type="number"
                min="1"
                max={settlingReceipt.remainingAmount}
                value={settleAmountInput}
                onChange={(e) => setSettleAmountInput(e.target.value)}
                autoFocus
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setSettlingReceipt(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-400"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg"
              >
                تأكيد السداد
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
