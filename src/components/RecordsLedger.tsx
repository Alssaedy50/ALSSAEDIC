import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  CreditCard,
  Edit3,
  Eye,
  FilePlus2,
  MessageCircle,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { ClinicSettings, ReceiptRecord } from '../types/clinic';
import { OfficialReceiptCard } from './OfficialReceiptCard';

interface RecordsLedgerProps {
  settings: ClinicSettings;
  receipts: ReceiptRecord[];
  defaultCurrency: string;
  initialSettleReceiptId?: string | null;
  onClearInitialSettle?: () => void;
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
  initialSettleReceiptId,
  onClearInitialSettle,
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

  const openSettleModal = (rec: ReceiptRecord) => {
    setSettlingReceipt(rec);
    setSettleAmountInput(String(rec.remainingAmount || 0));
  };

  useEffect(() => {
    if (!initialSettleReceiptId) return;
    const found = receipts.find((r) => r.id === initialSettleReceiptId);
    if (found) {
      openSettleModal(found);
    }
    onClearInitialSettle?.();
  }, [initialSettleReceiptId, receipts, onClearInitialSettle]);

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

  const buildWhatsAppHref = (rec: ReceiptRecord): string => {
    const rawDigits = String(rec.patientPhone || '').replace(/\D/g, '');
    let intlPhone = rawDigits;
    if (rawDigits.length === 9 && rawDigits.startsWith('7')) {
      intlPhone = `967${rawDigits}`;
    } else if (rawDigits.length === 10 && rawDigits.startsWith('07')) {
      intlPhone = `967${rawDigits.slice(1)}`;
    }

    const lines = [
      `*${settings.identity.clinicAr}*`,
      `${settings.identity.doctorAr}`,
      `━━━━━━━━━━━━━━`,
      `📄 *سند قبض رقم:* #${rec.receiptNo}`,
      `📅 *التاريخ:* ${rec.date}`,
      `👤 *المريض:* ${rec.patientName}`,
      `🦷 *الخدمات:* ${(rec.services || []).join(' + ') || rec.notes || 'خدمات علاجية'}`,
      `💰 *الإجمالي:* ${Number(rec.totalAmount).toLocaleString()} ${rec.currency}`,
      `✅ *المقبوض:* ${Number(rec.paidAmount).toLocaleString()} ${rec.currency}`,
      `📌 *المتبقي:* ${Number(rec.remainingAmount).toLocaleString()} ${rec.currency}`,
      `━━━━━━━━━━━━━━`,
      `نتمنى لكم دوام الصحة والابتسامة المشرقة`,
    ];
    const encoded = encodeURIComponent(lines.join('\n'));
    return intlPhone ? `https://wa.me/${intlPhone}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
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
      {/* Top 3-Tab Filter Bar (الكل | غير مسدد | مسدد) */}
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
          غير مسدد
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
          مسدد
        </button>
      </div>

      {/* Search & Currency Filter */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 sm:p-4 space-y-3.5">
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

          <div className="flex items-center gap-2">
            <select
              value={currencyFilter}
              onChange={(e) => setCurrencyFilter(e.target.value)}
              className="w-full sm:w-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-bold text-slate-800 dark:text-slate-200"
            >
              <option value="all">كل العملات</option>
              {availableCurrencies.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
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
              <span>سند جديد</span>
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
                    {/* Top Meta & Full Patient Name Header (No Truncation) */}
                    <div className="border-b border-slate-200 dark:border-slate-800 pb-2.5 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <span
                            dir="ltr"
                            className="inline-block px-2 py-0.5 rounded-md bg-sky-500/10 font-mono tabular-nums font-black text-sky-600 dark:text-sky-400 text-xs shrink-0"
                          >
                            #{rec.receiptNo}
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-slate-200/80 dark:bg-slate-800 text-[10px] font-bold text-slate-600 dark:text-slate-300 shrink-0">
                            {rec.currency}
                          </span>
                        </div>
                        <span
                          dir="ltr"
                          className="inline-block whitespace-nowrap shrink-0 font-mono tabular-nums text-[11px] font-bold text-slate-500 dark:text-slate-400"
                        >
                          {rec.date}
                        </span>
                      </div>

                      <div className="flex items-baseline justify-between gap-2">
                        <div className="font-black text-slate-900 dark:text-slate-100 text-sm sm:text-base break-words leading-snug">
                          {rec.patientName}
                        </div>
                        {rec.patientPhone && (
                          <span
                            dir="ltr"
                            className="inline-block font-mono tabular-nums text-[11px] font-bold text-slate-500 dark:text-slate-400 shrink-0"
                          >
                            {rec.patientPhone}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1">
                      <div>
                        <span className="text-slate-400 font-bold">الخدمات: </span>
                        <span className="font-bold text-slate-800 dark:text-slate-200 break-words">
                          {(rec.services || []).join(' + ') || rec.notes || '—'}
                        </span>
                      </div>
                      {rec.toothFDI && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-400 font-bold">الأسنان (FDI):</span>
                          <span
                            dir="ltr"
                            className="inline-block font-mono font-bold text-sky-500"
                          >
                            {rec.toothFDI}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs">
                      <div>
                        <div className="text-[10px] font-bold text-slate-400 whitespace-nowrap">
                          الإجمالي
                        </div>
                        <div className="font-mono tabular-nums font-black text-slate-900 dark:text-slate-100 mt-0.5">
                          {Number(rec.totalAmount).toLocaleString()}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] font-bold text-emerald-500 whitespace-nowrap">
                          المقبوض
                        </div>
                        <div className="font-mono tabular-nums font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
                          {Number(rec.paidAmount).toLocaleString()}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] font-bold text-rose-500 whitespace-nowrap">
                          المتبقي
                        </div>
                        <div
                          className={`font-mono tabular-nums font-black mt-0.5 ${
                            hasDebt
                              ? 'text-rose-600 dark:text-rose-400'
                              : 'text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {hasDebt ? Number(rec.remainingAmount).toLocaleString() : 'مسدد'}
                        </div>
                      </div>
                    </div>

                    {/* Balanced Single-Row Action Bar */}
                    <div
                      className={`grid ${
                        hasDebt ? 'grid-cols-5' : 'grid-cols-4'
                      } gap-1.5 pt-1`}
                    >
                      <button
                        type="button"
                        onClick={() => setPreviewReceipt(rec)}
                        className="inline-flex items-center justify-center gap-1 py-2 px-1.5 text-[11px] font-bold text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/60 rounded-lg border border-sky-200 dark:border-sky-800 whitespace-nowrap"
                      >
                        <Eye className="w-3.5 h-3.5 shrink-0" />
                        <span>معاينة</span>
                      </button>

                      <a
                        href={buildWhatsAppHref(rec)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center gap-1 py-2 px-1.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 rounded-lg border border-emerald-200 dark:border-emerald-800 whitespace-nowrap"
                      >
                        <MessageCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>واتساب</span>
                      </a>

                      {hasDebt && (
                        <button
                          type="button"
                          onClick={() => openSettleModal(rec)}
                          className="inline-flex items-center justify-center gap-1 py-2 px-1.5 text-[11px] font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 rounded-lg border border-amber-200 dark:border-amber-800 whitespace-nowrap"
                        >
                          <CreditCard className="w-3.5 h-3.5 shrink-0" />
                          <span>تسديد</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => onEditReceipt(rec)}
                        className="inline-flex items-center justify-center gap-1 py-2 px-1.5 text-[11px] font-bold text-slate-700 dark:text-slate-200 bg-slate-200/70 dark:bg-slate-800 rounded-lg whitespace-nowrap"
                      >
                        <Edit3 className="w-3.5 h-3.5 shrink-0" />
                        <span>تعديل</span>
                      </button>

                      {deletingId === rec.id ? (
                        <button
                          type="button"
                          onClick={() => {
                            onDeleteReceipt(rec.id);
                            setDeletingId(null);
                          }}
                          className="inline-flex items-center justify-center py-2 px-1 text-[11px] font-bold text-white bg-rose-600 rounded-lg whitespace-nowrap"
                        >
                          تأكيد؟
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setDeletingId(rec.id)}
                          className="inline-flex items-center justify-center py-2 px-1.5 text-[11px] font-bold text-rose-500 bg-rose-500/10 hover:bg-rose-500/20 rounded-lg"
                          title="حذف"
                        >
                          <Trash2 className="w-4 h-4 shrink-0" />
                        </button>
                      )}
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
                          <span dir="ltr">#{rec.receiptNo}</span>
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap shrink-0 font-mono tabular-nums text-xs text-slate-500">
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

      {/* Pop-up Modal: Receipt Preview */}
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
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title="إغلاق"
              >
                <X className="w-4 h-4" />
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

      {/* Pop-up Modal: Debt Settlement */}
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
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title="إغلاق"
              >
                <X className="w-4 h-4" />
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

            <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="submit"
                className="w-full py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition-colors shadow-sm"
              >
                اعتماد
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
