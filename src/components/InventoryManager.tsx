import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Edit3,
  Loader2,
  Minus,
  PackagePlus,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { DentalServiceItem, InventoryItem } from '../types/clinic';
import { INVENTORY_UNITS } from '../data/defaultData';
import { queryClinicAssistant } from '../utils/aiClient';

interface InventoryManagerProps {
  inventory: InventoryItem[];
  services: DentalServiceItem[];
  defaultCurrency: string;
  onSaveItem: (
    item: Omit<InventoryItem, 'id' | 'updatedAt'> & { id?: string },
    recordAsExpense: boolean
  ) => void;
  onQuickConsume: (id: string, amount?: number) => void;
  onQuickRestock: (id: string, amount: number, recordExpense: boolean) => void;
  onDeleteItem: (id: string) => void;
  notify: (message: string, type?: 'success' | 'warning' | 'error' | 'info') => void;
}

export const InventoryManager: React.FC<InventoryManagerProps> = ({
  inventory,
  services,
  defaultCurrency,
  onSaveItem,
  onQuickConsume,
  onQuickRestock,
  onDeleteItem,
  notify,
}) => {
  const [isFormModalOpen, setIsFormModalOpen] = useState<boolean>(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [qty, setQty] = useState<number>(10);
  const [unit, setUnit] = useState<string>('عدد');
  const [minQty, setMinQty] = useState<number>(5);
  const [unitPrice, setUnitPrice] = useState<number>(0);
  const [linkedService, setLinkedService] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [recordAsExpense, setRecordAsExpense] = useState<boolean>(false);

  const [filterMode, setFilterMode] = useState<'all' | 'low'>('all');
  const [auditReport, setAuditReport] = useState<string>('');
  const [isAuditing, setIsAuditing] = useState<boolean>(false);

  const totalCost = useMemo(
    () => +(Number(qty || 0) * Number(unitPrice || 0)).toFixed(2),
    [qty, unitPrice]
  );

  const lowStockItems = useMemo(
    () => inventory.filter((item) => Number(item.qty) <= Number(item.minQty)),
    [inventory]
  );

  const totalInventoryValue = useMemo(
    () => inventory.reduce((sum, i) => sum + (Number(i.qty) || 0) * (Number(i.unitPrice) || 0), 0),
    [inventory]
  );

  const displayedInventory = useMemo(
    () => (filterMode === 'low' ? lowStockItems : inventory),
    [inventory, lowStockItems, filterMode]
  );

  const openAddModal = () => {
    setEditingId(null);
    setName('');
    setQty(10);
    setUnit('عدد');
    setMinQty(5);
    setUnitPrice(0);
    setLinkedService('');
    setNotes('');
    setRecordAsExpense(false);
    setIsFormModalOpen(true);
  };

  const openEditModal = (item: InventoryItem) => {
    setEditingId(item.id);
    setName(item.name);
    setQty(item.qty);
    setUnit(item.unit);
    setMinQty(item.minQty);
    setUnitPrice(item.unitPrice);
    setLinkedService(item.linkedService || '');
    setNotes(item.notes || '');
    setRecordAsExpense(false);
    setIsFormModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      notify('يرجى إدخال اسم الصنف الطبي', 'warning');
      return;
    }

    onSaveItem(
      {
        id: editingId || undefined,
        name: name.trim(),
        qty: Number(qty) || 0,
        unit,
        minQty: Number(minQty) || 1,
        unitPrice: Number(unitPrice) || 0,
        totalCost,
        linkedService,
        notes: notes.trim(),
      },
      !editingId && recordAsExpense
    );
    setIsFormModalOpen(false);
  };

  const handleRunGeminiAudit = async () => {
    setIsAuditing(true);
    try {
      const reply = await queryClinicAssistant({
        taskType: 'report',
        prompt:
          'قم بإجراء جرد تحليلي للمخزون الطبي في العيادة: حدد النواقص وتكلفة إعادة التزويد وقدم توصيات عملية مختصرة.',
        clinicContext: {
          defaultCurrency,
          inventory,
          lowStockCount: lowStockItems.length,
          totalInventoryValue,
        },
      });
      setAuditReport(reply || '');
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'تعذر إجراء الجرد الذكي', 'error');
    } finally {
      setIsAuditing(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 text-center sm:text-right">
          <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">الأصناف</div>
          <div className="mt-1 text-base sm:text-xl font-black font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {inventory.length}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 text-center sm:text-right">
          <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">قيمة المخزون</div>
          <div className="mt-1 text-base sm:text-xl font-black font-mono tabular-nums text-sky-600 dark:text-sky-400 truncate">
            {totalInventoryValue.toLocaleString()}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 text-center sm:text-right">
          <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">النواقص</div>
          <div
            className={`mt-1 text-base sm:text-xl font-black font-mono tabular-nums ${
              lowStockItems.length > 0
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-emerald-600 dark:text-emerald-400'
            }`}
          >
            {lowStockItems.length}
          </div>
        </div>
      </div>

      {/* Main Toolbar */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 sm:p-4 space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="grid grid-cols-2 sm:flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
            <button
              type="button"
              onClick={() => setFilterMode('all')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                filterMode === 'all'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              الكل ({inventory.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('low')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                filterMode === 'low'
                  ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              النواقص ({lowStockItems.length})
            </button>
          </div>

          <div className="grid grid-cols-2 sm:flex items-center gap-2">
            <button
              type="button"
              disabled={isAuditing}
              onClick={handleRunGeminiAudit}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/60 border border-sky-200 dark:border-sky-800 rounded-xl"
            >
              {isAuditing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              <span>جرد ذكي</span>
            </button>

            <button
              type="button"
              onClick={openAddModal}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-sky-600 hover:bg-sky-500 rounded-xl"
            >
              <PackagePlus className="w-4 h-4" />
              <span>إضافة صنف</span>
            </button>
          </div>
        </div>

        {/* Mobile Cards */}
        <div className="grid grid-cols-1 gap-3 md:hidden">
          {displayedInventory.map((item) => {
            const isLow = Number(item.qty) <= Number(item.minQty);
            return (
              <div
                key={item.id}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-3.5 space-y-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-bold text-sm text-slate-900 dark:text-slate-100 break-words">
                      {item.name}
                    </div>
                    {item.notes && (
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 break-words">
                        {item.notes}
                      </div>
                    )}
                  </div>
                  {isLow ? (
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-600 dark:text-amber-400 shrink-0">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>نقص</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400 shrink-0">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>متوفر</span>
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2 text-center bg-white dark:bg-slate-900 p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-xs">
                  <div>
                    <div className="text-[10px] text-slate-400">الكمية</div>
                    <div className="font-mono tabular-nums font-bold">
                      {item.qty} {item.unit}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400">الحد الأدنى</div>
                    <div className="font-mono tabular-nums">
                      {item.minQty} {item.unit}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400">الخدمة</div>
                    <div className="truncate font-semibold">{item.linkedService || '—'}</div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-1">
                  <span className="text-xs font-mono tabular-nums font-bold text-slate-600 dark:text-slate-300 whitespace-nowrap">
                    {(Number(item.qty) * Number(item.unitPrice)).toLocaleString()} {defaultCurrency}
                  </span>

                  <div className="inline-flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => onQuickConsume(item.id, 1)}
                      className="inline-flex items-center gap-0.5 px-2.5 py-1 text-xs font-mono font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 rounded-lg"
                    >
                      <Minus className="w-3 h-3" />
                      <span>1</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onQuickRestock(item.id, 5, false)}
                      className="inline-flex items-center gap-0.5 px-2.5 py-1 text-xs font-mono font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-lg"
                    >
                      <Plus className="w-3 h-3" />
                      <span>5</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditModal(item)}
                      className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteItem(item.id)}
                      className="p-1.5 text-rose-500"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-right border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-500 dark:text-slate-400">
                <th className="py-3 px-3">الصنف الطبي</th>
                <th className="py-3 px-3">الكمية</th>
                <th className="py-3 px-3">الحد الأدنى</th>
                <th className="py-3 px-3">الخدمة المرتبطة</th>
                <th className="py-3 px-3 text-left">إجمالي القيمة</th>
                <th className="py-3 px-3 text-left">الحالة</th>
                <th className="py-3 px-3 text-left">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs sm:text-sm">
              {displayedInventory.map((item) => {
                const isLow = Number(item.qty) <= Number(item.minQty);
                return (
                  <tr key={item.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-3">
                      <div className="font-bold text-slate-900 dark:text-slate-100">{item.name}</div>
                      {item.notes && <div className="text-xs text-slate-500">{item.notes}</div>}
                    </td>
                    <td className="py-3 px-3 font-mono tabular-nums font-bold">
                      {item.qty} {item.unit}
                    </td>
                    <td className="py-3 px-3 font-mono tabular-nums text-slate-500">
                      {item.minQty} {item.unit}
                    </td>
                    <td className="py-3 px-3 text-xs">{item.linkedService || '—'}</td>
                    <td className="py-3 px-3 text-left font-mono tabular-nums font-bold">
                      {(Number(item.qty) * Number(item.unitPrice)).toLocaleString()}
                    </td>
                    <td className="py-3 px-3 text-left">
                      {isLow ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-600 dark:text-amber-400">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span>نقص</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>متوفر</span>
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-left">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onQuickConsume(item.id, 1)}
                          className="inline-flex items-center gap-0.5 px-2.5 py-1 text-xs font-mono font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 rounded-lg"
                        >
                          <Minus className="w-3 h-3" />
                          <span>1</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onQuickRestock(item.id, 5, false)}
                          className="inline-flex items-center gap-0.5 px-2.5 py-1 text-xs font-mono font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-lg"
                        >
                          <Plus className="w-3 h-3" />
                          <span>5</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditModal(item)}
                          className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteItem(item.id)}
                          className="p-1.5 text-rose-500"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Pop-up Modal: Add / Edit Inventory Item with Sticky Back Header */}
      {isFormModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-3 sm:p-4"
          onClick={() => setIsFormModalOpen(false)}
        >
          <form
            onSubmit={handleSubmit}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg max-h-[88vh] flex flex-col rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800 shrink-0">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                {editingId ? 'تعديل صنف' : 'إضافة صنف طبي'}
              </h3>
              <button
                type="button"
                onClick={() => setIsFormModalOpen(false)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold"
              >
                <ArrowRight className="w-3.5 h-3.5" />
                <span>رجوع</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                  اسم الصنف الطبي
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="مثال: أمبولات بنج Lidocaine"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                    الكمية
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={qty}
                    onChange={(e) => setQty(Number(e.target.value) || 0)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm font-mono tabular-nums"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                    الوحدة
                  </label>
                  <select
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-bold"
                  >
                    {INVENTORY_UNITS.map((u) => (
                      <option key={u.value} value={u.value}>
                        {u.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                    حد النواقص
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={minQty}
                    onChange={(e) => setMinQty(Number(e.target.value) || 0)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm font-mono tabular-nums"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                    تكلفة الوحدة ({defaultCurrency})
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={unitPrice}
                    onChange={(e) => setUnitPrice(Number(e.target.value) || 0)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm font-mono tabular-nums"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                  الخدمة المرتبطة (خصم تلقائي)
                </label>
                <select
                  value={linkedService}
                  onChange={(e) => setLinkedService(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-bold"
                >
                  <option value="">بدون ربط</option>
                  {services.map((s) => (
                    <option key={s.id} value={s.name}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                  ملاحظات
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs"
                />
              </div>

              {!editingId && (
                <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={recordAsExpense}
                    onChange={(e) => setRecordAsExpense(e.target.checked)}
                    className="rounded border-slate-300 text-sky-600"
                  />
                  <span>تسجيل التكلفة ({totalCost.toLocaleString()}) كمصروف شراء</span>
                </label>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-slate-200 dark:border-slate-800 shrink-0">
              <button
                type="button"
                onClick={() => setIsFormModalOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-500"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="px-5 py-2 text-xs font-bold text-white bg-sky-600 hover:bg-sky-500 rounded-lg"
              >
                حفظ الصنف
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Pop-up Modal: AI Audit Report with Sticky Back Header */}
      {auditReport && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-4"
          onClick={() => setAuditReport('')}
        >
          <div
            className="w-full max-w-lg max-h-[85vh] flex flex-col rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800 shrink-0">
              <h3 className="text-sm font-bold text-sky-600 dark:text-sky-400">
                تقرير جرد المخزون (Gemini AI)
              </h3>
              <button
                type="button"
                onClick={() => setAuditReport('')}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold"
              >
                <ArrowRight className="w-3.5 h-3.5" />
                <span>رجوع</span>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 text-xs sm:text-sm leading-relaxed text-slate-800 dark:text-slate-200 whitespace-pre-line">
              {auditReport}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
