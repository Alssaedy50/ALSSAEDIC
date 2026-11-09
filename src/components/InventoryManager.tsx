import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Edit3,
  Link2,
  Loader2,
  Minus,
  MoreVertical,
  PackagePlus,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { DentalServiceItem, InventoryItem } from '../types/clinic';
import { INVENTORY_UNITS } from '../data/defaultData';
import { queryClinicAssistant } from '../utils/aiClient';
import { SmartNumberInput } from './SmartNumberInput';

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

  interface InventoryFormData {
    name: string;
    location: 'clinic' | 'lab';
    quantity: number;
    unit: string;
    packageSize: number;
    usageUnit: string;
    remainingSubUnits: number;
    minThreshold: number;
    costPerUnit: number;
    linkedService: string;
    notes: string;
    recordAsExpense: boolean;
  }

  const [formData, setFormData] = useState<InventoryFormData>({
    name: '',
    location: 'clinic',
    quantity: 10,
    unit: 'علبة',
    packageSize: 1,
    usageUnit: 'قطعة',
    remainingSubUnits: 10,
    minThreshold: 2,
    costPerUnit: 0,
    linkedService: '',
    notes: '',
    recordAsExpense: false,
  });

  const [filterMode, setFilterMode] = useState<'all' | 'clinic' | 'lab' | 'low'>('all');
  const [auditReport, setAuditReport] = useState<string>('');
  const [isAuditing, setIsAuditing] = useState<boolean>(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [openItemMenuId, setOpenItemMenuId] = useState<string | null>(null);

  const getLinkedServicesForMaterial = (item: InventoryItem): string[] => {
    const names = new Set<string>();
    if (item.linkedService && item.linkedService.trim()) {
      names.add(item.linkedService.trim());
    }
    for (const srv of services) {
      if (
        Array.isArray(srv.materialsRecipe) &&
        srv.materialsRecipe.some((r) => r.materialId === item.id)
      ) {
        names.add(srv.name);
      }
    }
    return Array.from(names);
  };

  const USAGE_UNIT_SUGGESTIONS = [
    'حبة',
    'أمبول',
    'جرام',
    'مل',
    'نقطة',
    'وحدة معمل',
    'قطعة',
    'شريحة',
    'قمع',
    'إبرة',
  ];

  const totalCost = useMemo(
    () => +(Number(formData.quantity || 0) * Number(formData.costPerUnit || 0)).toFixed(2),
    [formData.quantity, formData.costPerUnit]
  );

  const lowStockItems = useMemo(
    () => inventory.filter((item) => Number(item.qty) <= Number(item.minQty)),
    [inventory]
  );

  const clinicItemsCount = useMemo(
    () => inventory.filter((item) => (item.location || 'clinic') === 'clinic').length,
    [inventory]
  );

  const labItemsCount = useMemo(
    () => inventory.filter((item) => item.location === 'lab').length,
    [inventory]
  );

  const totalInventoryValue = useMemo(
    () => inventory.reduce((sum, i) => sum + (Number(i.qty) || 0) * (Number(i.unitPrice) || 0), 0),
    [inventory]
  );

  const displayedInventory = useMemo(() => {
    if (filterMode === 'low') return lowStockItems;
    if (filterMode === 'clinic') {
      return inventory.filter((item) => (item.location || 'clinic') === 'clinic');
    }
    if (filterMode === 'lab') {
      return inventory.filter((item) => item.location === 'lab');
    }
    return inventory;
  }, [inventory, lowStockItems, filterMode]);

  const handleQuantityChange = (safeQty: number) => {
    const pkgSize =
      formData.packageSize && formData.packageSize > 0 ? Number(formData.packageSize) : 1;
    setFormData((prev) => ({
      ...prev,
      quantity: safeQty,
      remainingSubUnits: Number((safeQty * pkgSize).toFixed(4)),
    }));
  };

  const handlePackageSizeChange = (safePkg: number) => {
    setFormData((prev) => {
      const updatedSub =
        safePkg > 0
          ? Number(((prev.quantity || 0) * safePkg).toFixed(4))
          : prev.remainingSubUnits;
      return {
        ...prev,
        packageSize: safePkg,
        remainingSubUnits: updatedSub,
      };
    });
  };

  const handleRemainingSubUnitsChange = (safeSub: number) => {
    const pkgSize =
      formData.packageSize && formData.packageSize > 0 ? Number(formData.packageSize) : 1;
    const computedQty = Number((safeSub / pkgSize).toFixed(4));
    setFormData((prev) => ({
      ...prev,
      remainingSubUnits: safeSub,
      quantity: computedQty,
    }));
  };

  const handleMinThresholdChange = (safeVal: number) => {
    setFormData((prev) => ({
      ...prev,
      minThreshold: safeVal,
    }));
  };

  const handleCostPerUnitChange = (safeVal: number) => {
    setFormData((prev) => ({
      ...prev,
      costPerUnit: safeVal,
    }));
  };

  const openAddModal = () => {
    setEditingId(null);
    setFormData({
      name: '',
      location: filterMode === 'lab' ? 'lab' : 'clinic',
      quantity: 10,
      unit: 'علبة',
      packageSize: 1,
      usageUnit: filterMode === 'lab' ? 'وحدة معمل' : 'قطعة',
      remainingSubUnits: 10,
      minThreshold: 2,
      costPerUnit: 0,
      linkedService: '',
      notes: '',
      recordAsExpense: false,
    });
    setIsFormModalOpen(true);
  };

  const openEditModal = (item: InventoryItem) => {
    const pkg = Number(item.packageSize) > 0 ? Number(item.packageSize) : 1;
    const itemQty = Number(item.qty !== undefined ? item.qty : (item as any).quantity || 0);
    const sub =
      item.remainingSubUnits !== undefined && Number(item.remainingSubUnits) >= 0
        ? Number(item.remainingSubUnits)
        : Number((itemQty * pkg).toFixed(4));
    setEditingId(item.id);
    setFormData({
      name: item.name,
      location: item.location === 'lab' ? 'lab' : 'clinic',
      quantity: itemQty,
      unit: item.unit || 'علبة',
      packageSize: pkg,
      usageUnit: item.usageUnit || item.unit || 'قطعة',
      remainingSubUnits: sub,
      minThreshold: Number(item.minQty !== undefined ? item.minQty : 2),
      costPerUnit: Number(item.unitPrice !== undefined ? item.unitPrice : 0),
      linkedService: item.linkedService || '',
      notes: item.notes || '',
      recordAsExpense: false,
    });
    setIsFormModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      notify('يرجى إدخال اسم الصنف', 'warning');
      return;
    }

    const finalPkgSize =
      formData.packageSize && formData.packageSize > 0 ? Number(formData.packageSize) : 1;
    const finalUnit = formData.unit.trim() || 'علبة';
    let finalUsageUnit = formData.usageUnit.trim();
    if (!finalUsageUnit && finalPkgSize === 1) {
      finalUsageUnit = finalUnit;
    }
    if (!finalUsageUnit) {
      finalUsageUnit = finalUnit;
    }

    const safeQty = Math.max(0, Number(formData.quantity) || 0);
    const safeSub =
      formData.remainingSubUnits !== undefined && formData.remainingSubUnits >= 0
        ? Number(formData.remainingSubUnits)
        : Number((safeQty * finalPkgSize).toFixed(4));
    const cost = Math.max(0, Number(formData.costPerUnit) || 0);
    const totalCost = +((cost * safeQty).toFixed(2));

    onSaveItem(
      {
        id: editingId || undefined,
        name: formData.name.trim(),
        location: formData.location,
        qty: safeQty,
        unit: finalUnit,
        packageSize: finalPkgSize,
        usageUnit: finalUsageUnit,
        remainingSubUnits: safeSub,
        minQty: formData.minThreshold !== undefined ? Number(formData.minThreshold) : 1,
        unitPrice: cost,
        totalCost,
        linkedService: formData.linkedService,
        notes: formData.notes.trim(),
      },
      !editingId && formData.recordAsExpense
    );
    setIsFormModalOpen(false);
  };

  const handleQuickAdjust = (item: InventoryItem, deltaPackages: number) => {
    const pkgSize = item.packageSize && item.packageSize > 0 ? Number(item.packageSize) : 1;
    const currentItemQty = Number(item.qty !== undefined ? item.qty : (item as any).quantity || 0);
    const currentSub =
      item.remainingSubUnits !== undefined
        ? Number(item.remainingSubUnits)
        : Number((currentItemQty * pkgSize).toFixed(4));
    const newSub = Math.max(0, Number((currentSub + deltaPackages * pkgSize).toFixed(4)));
    const newQty = Number((newSub / pkgSize).toFixed(4));

    const { updatedAt: _unused, ...itemWithoutUpdatedAt } = item;
    onSaveItem(
      {
        ...itemWithoutUpdatedAt,
        packageSize: pkgSize,
        remainingSubUnits: newSub,
        qty: newQty,
        totalCost: Number((newQty * Number(item.unitPrice || 0)).toFixed(2)),
      },
      false
    );
  };

  const handleRunGeminiAudit = async () => {
    setIsAuditing(true);
    try {
      const reply = await queryClinicAssistant({
        taskType: 'report',
        prompt:
          'قم بإجراء جرد تحليلي للمخزون الطبي (مواد العيادة ومواد المعمل): حدد النواقص وتكلفة إعادة التزويد وقدم توصيات عملية مختصرة.',
        clinicContext: {
          defaultCurrency,
          inventory,
          lowStockCount: lowStockItems.length,
          totalInventoryValue,
        },
      });
      setAuditReport(reply || '');
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'تعذر تحليل المخزون', 'error');
    } finally {
      setIsAuditing(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 text-center sm:text-right">
          <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">مخزن العيادة</div>
          <div className="mt-1 text-base sm:text-xl font-black font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {clinicItemsCount}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 text-center sm:text-right">
          <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">مخزن المعمل</div>
          <div className="mt-1 text-base sm:text-xl font-black font-mono tabular-nums text-indigo-600 dark:text-indigo-400">
            {labItemsCount}
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

      {/* Main Toolbar with Clean Dropdown Filter */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 sm:p-4 space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="relative min-w-[200px] flex-1 sm:flex-initial">
            <select
              value={filterMode}
              onChange={(e) => setFilterMode(e.target.value as 'all' | 'clinic' | 'lab' | 'low')}
              aria-label="تصفية المخزن"
              className="w-full appearance-none rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-3.5 py-2 pl-8 text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:border-sky-500"
            >
              <option value="all">تصفية المخزن: الكل ({inventory.length})</option>
              <option value="clinic">مخزن العيادة ({clinicItemsCount})</option>
              <option value="lab">مخزن المعمل ({labItemsCount})</option>
              <option value="low">النواقص فقط ({lowStockItems.length})</option>
            </select>
            <ChevronDown className="w-4 h-4 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          <div className="flex items-center gap-2">
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
              <span>تحليل المخزون</span>
            </button>

            <button
              type="button"
              onClick={openAddModal}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-sky-600 hover:bg-sky-500 rounded-xl"
            >
              <PackagePlus className="w-4 h-4" />
              <span>إضافة مادة / صنف</span>
            </button>
          </div>
        </div>

        {/* Mobile Cards */}
        <div className="grid grid-cols-1 gap-3 md:hidden">
          {displayedInventory.map((item) => {
            const isLow = Number(item.qty) <= Number(item.minQty);
            const isLab = item.location === 'lab';
            const pkgSize = Number(item.packageSize) > 0 ? Number(item.packageSize) : 1;
            const uUnit = item.usageUnit || item.unit || 'قطعة';
            const subUnits =
              Number.isFinite(Number(item.remainingSubUnits)) && Number(item.remainingSubUnits) >= 0
                ? +Number(item.remainingSubUnits).toFixed(4)
                : +(Number(item.qty || 0) * pkgSize).toFixed(4);
            const linkedSrvNames = getLinkedServicesForMaterial(item);

            return (
              <div
                key={item.id}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-3.5 space-y-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-sm text-slate-900 dark:text-slate-100 break-words">
                        {item.name}
                      </span>
                      <span
                        className={`px-2 py-0.5 text-[10px] font-bold rounded-md border ${
                          isLab
                            ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800'
                            : 'bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800'
                        }`}
                      >
                        {isLab ? 'مخزن المعمل' : 'مخزن العيادة'}
                      </span>
                    </div>
                    {linkedSrvNames.length > 0 && (
                      <div className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-400 mt-1">
                        <Link2 className="w-3 h-3 shrink-0" />
                        <span>مربوط بـ: {linkedSrvNames.join(' + ')}</span>
                      </div>
                    )}
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

                <div className="grid grid-cols-2 gap-2 text-center bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs">
                  <div>
                    <div className="text-[10px] text-slate-400">العبوات المتوفرة</div>
                    <div className="font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100">
                      {item.qty} {item.unit}
                    </div>
                    {pkgSize > 1 && (
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        (العبوة = {pkgSize} {uUnit})
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400">الرصيد الجزئي الدقيق</div>
                    <div className="font-mono tabular-nums font-bold text-sky-600 dark:text-sky-400">
                      {subUnits} {uUnit}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      الحد الأدنى: {item.minQty} {item.unit}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-1">
                  <span className="text-xs font-mono tabular-nums font-bold text-slate-600 dark:text-slate-300 whitespace-nowrap">
                    {(Number(item.qty) * Number(item.unitPrice)).toLocaleString()} {defaultCurrency}
                  </span>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {confirmDeleteId === item.id ? (
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            onDeleteItem(item.id);
                            setConfirmDeleteId(null);
                          }}
                          className="px-2.5 py-1 text-xs font-bold text-white bg-rose-600 rounded-lg"
                        >
                          تأكيد الحذف
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-2 py-1 text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-200 dark:bg-slate-800 rounded-lg"
                        >
                          إلغاء
                        </button>
                      </div>
                    ) : (
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() =>
                            setOpenItemMenuId((prev) => (prev === item.id ? null : item.id))
                          }
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-700 dark:text-slate-200 hover:border-sky-500 transition-colors"
                        >
                          <span>إجراءات الصنف</span>
                          <MoreVertical className="w-3.5 h-3.5 text-slate-500" />
                        </button>

                        {openItemMenuId === item.id && (
                          <>
                            <div
                              className="fixed inset-0 z-30"
                              onClick={() => setOpenItemMenuId(null)}
                            />
                            <div className="absolute left-0 bottom-full mb-1.5 w-48 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl py-1.5 z-40 text-xs">
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenItemMenuId(null);
                                  openEditModal(item);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-right font-bold text-sky-600 dark:text-sky-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                                <span>تعديل الصنف والربط</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenItemMenuId(null);
                                  handleQuickAdjust(item, 1);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-right font-bold text-emerald-600 dark:text-emerald-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>تزويد 1 {item.unit} (+1)</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenItemMenuId(null);
                                  handleQuickAdjust(item, -1);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-right font-bold text-amber-600 dark:text-amber-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                              >
                                <Minus className="w-3.5 h-3.5" />
                                <span>خصم 1 {item.unit} (-1)</span>
                              </button>
                              <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenItemMenuId(null);
                                  setConfirmDeleteId(item.id);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-right font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>حذف الصنف</span>
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
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
                <th className="py-3 px-3">الصنف</th>
                <th className="py-3 px-3">القسم</th>
                <th className="py-3 px-3">العبوات المتوفرة</th>
                <th className="py-3 px-3">الرصيد بالوحدة الصغرى</th>
                <th className="py-3 px-3">الحد الأدنى</th>
                <th className="py-3 px-3 text-left">إجمالي القيمة</th>
                <th className="py-3 px-3 text-left">الحالة</th>
                <th className="py-3 px-3 text-left">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs sm:text-sm">
              {displayedInventory.map((item) => {
                const isLow = Number(item.qty) <= Number(item.minQty);
                const isLab = item.location === 'lab';
                const pkgSize = Number(item.packageSize) > 0 ? Number(item.packageSize) : 1;
                const uUnit = item.usageUnit || item.unit || 'قطعة';
                const subUnits =
                  Number.isFinite(Number(item.remainingSubUnits)) &&
                  Number(item.remainingSubUnits) >= 0
                    ? +Number(item.remainingSubUnits).toFixed(4)
                    : +(Number(item.qty || 0) * pkgSize).toFixed(4);
                const linkedSrvNames = getLinkedServicesForMaterial(item);

                return (
                  <tr key={item.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-3">
                      <div className="font-bold text-slate-900 dark:text-slate-100">{item.name}</div>
                      {linkedSrvNames.length > 0 && (
                        <div className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                          <Link2 className="w-3 h-3" />
                          <span>مربوط بـ: {linkedSrvNames.join(' + ')}</span>
                        </div>
                      )}
                      {item.notes && <div className="text-xs text-slate-500">{item.notes}</div>}
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 text-[11px] font-bold rounded-md border ${
                          isLab
                            ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800'
                            : 'bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800'
                        }`}
                      >
                        {isLab ? 'مخزن المعمل' : 'مخزن العيادة'}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-mono tabular-nums font-bold">
                      <div>
                        {item.qty} {item.unit}
                      </div>
                      {pkgSize > 1 && (
                        <div className="text-[11px] font-normal text-slate-400">
                          العبوة = {pkgSize} {uUnit}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-3 font-mono tabular-nums font-bold text-sky-600 dark:text-sky-400">
                      {subUnits} {uUnit}
                    </td>
                    <td className="py-3 px-3 font-mono tabular-nums text-slate-500">
                      {item.minQty} {item.unit}
                    </td>
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
                      {confirmDeleteId === item.id ? (
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              onDeleteItem(item.id);
                              setConfirmDeleteId(null);
                            }}
                            className="px-2 py-1 text-xs font-bold text-white bg-rose-600 rounded-lg"
                          >
                            تأكيد؟
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-2 py-1 text-xs font-bold text-slate-600 bg-slate-200 rounded-lg"
                          >
                            إلغاء
                          </button>
                        </div>
                      ) : (
                        <div className="relative inline-block">
                          <button
                            type="button"
                            onClick={() =>
                              setOpenItemMenuId((prev) => (prev === item.id ? null : item.id))
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 hover:border-sky-500"
                          >
                            <span>إجراءات</span>
                            <MoreVertical className="w-3.5 h-3.5" />
                          </button>

                          {openItemMenuId === item.id && (
                            <>
                              <div
                                className="fixed inset-0 z-30"
                                onClick={() => setOpenItemMenuId(null)}
                              />
                              <div className="absolute left-0 top-full mt-1 w-48 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl py-1.5 z-40 text-xs text-right">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenItemMenuId(null);
                                    openEditModal(item);
                                  }}
                                  className="w-full flex items-center gap-2 px-3 py-2 font-bold text-sky-600 dark:text-sky-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                  <span>تعديل الصنف والربط</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenItemMenuId(null);
                                    handleQuickAdjust(item, 1);
                                  }}
                                  className="w-full flex items-center gap-2 px-3 py-2 font-bold text-emerald-600 dark:text-emerald-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                  <span>تزويد 1 {item.unit} (+1)</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenItemMenuId(null);
                                    handleQuickAdjust(item, -1);
                                  }}
                                  className="w-full flex items-center gap-2 px-3 py-2 font-bold text-amber-600 dark:text-amber-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                                >
                                  <Minus className="w-3.5 h-3.5" />
                                  <span>خصم 1 {item.unit} (-1)</span>
                                </button>
                                <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenItemMenuId(null);
                                    setConfirmDeleteId(item.id);
                                  }}
                                  className="w-full flex items-center gap-2 px-3 py-2 font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>حذف الصنف</span>
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Pop-up Modal: Add / Edit Inventory Item with Sub-Units & Location */}
      {isFormModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-3 sm:p-4"
          onClick={() => setIsFormModalOpen(false)}
        >
          <form
            onSubmit={handleSubmit}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg max-h-[90vh] flex flex-col rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800 shrink-0">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                {editingId ? 'تعديل مادة / صنف مخزون' : 'إضافة مادة للمخزون (العيادة أو المعمل)'}
              </h3>
              <button
                type="button"
                onClick={() => setIsFormModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                aria-label="إغلاق"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
              {/* Location Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
                  القسم (مكان المادة)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, location: 'clinic' }))}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${
                      formData.location === 'clinic'
                        ? 'bg-sky-600 text-white border-sky-600 shadow-xs'
                        : 'bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    مخزن العيادة
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, location: 'lab' }))}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${
                      formData.location === 'lab'
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                        : 'bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    مخزن المعمل
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                  اسم المادة / الصنف
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder={
                    formData.location === 'lab'
                      ? 'مثال: بلوك زيركون متعدد الطبقات / معدن / طبعة سيليكون'
                      : 'مثال: كومبوزيت ضوئي 4 جرام / علبة بنج Lidocaine'
                  }
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
                />
              </div>

              {/* Purchase Unit & Qty */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                    عدد العبوات الكبرى المتوفرة
                  </label>
                  <SmartNumberInput
                    min={0}
                    value={formData.quantity}
                    onValueChange={(val) => handleQuantityChange(val)}
                    placeholder="0"
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm font-mono tabular-nums font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                    وحدة الشراء الكبرى (العبوة)
                  </label>
                  <select
                    value={formData.unit}
                    onChange={(e) => setFormData((prev) => ({ ...prev, unit: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-bold"
                  >
                    {INVENTORY_UNITS.map((u) => (
                      <option key={u.value} value={u.value}>
                        {u.label}
                      </option>
                    ))}
                    <option value="قرص">قرص (Disk)</option>
                    <option value="عبوة">عبوة (Syringe/Bottle)</option>
                  </select>
                </div>
              </div>

              {/* Sub-unit & Package Size Config */}
              <div className="rounded-xl border border-sky-200/80 dark:border-sky-900/60 bg-sky-50/40 dark:bg-sky-950/25 p-3 space-y-3">
                <div className="text-xs font-bold text-sky-800 dark:text-sky-300">
                  إعدادات تجزئة العبوة والاستهلاك الدقيق
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                      سعة العبوة الواحدة (بالوحدة الصغرى)
                    </label>
                    <SmartNumberInput
                      min={0}
                      value={formData.packageSize}
                      onValueChange={(val) => handlePackageSizeChange(val)}
                      placeholder="1"
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5 text-sm font-mono tabular-nums font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                      وحدة الاستهلاك الجزئي (للربط بالخدمات)
                    </label>
                    <input
                      type="text"
                      list="usage-unit-options"
                      value={formData.usageUnit}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, usageUnit: e.target.value }))
                      }
                      placeholder="جرام، أمبول، حبة، مل، وحدة معمل"
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-bold"
                    />
                    <datalist id="usage-unit-options">
                      {USAGE_UNIT_SUGGESTIONS.map((u) => (
                        <option key={u} value={u} />
                      ))}
                    </datalist>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-1 border-t border-sky-200/60 dark:border-sky-900/50">
                  <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                    إجمالي الرصيد المتبقي بالوحدة الصغرى:
                  </span>
                  <div className="flex items-center gap-1.5">
                    <SmartNumberInput
                      min={0}
                      value={formData.remainingSubUnits}
                      onValueChange={(val) => handleRemainingSubUnitsChange(val)}
                      placeholder="0"
                      className="w-24 rounded-lg border border-sky-300 dark:border-sky-800 bg-white dark:bg-slate-900 px-2.5 py-1 text-xs font-mono font-bold text-center text-sky-700 dark:text-sky-300"
                    />
                    <span className="text-xs font-bold text-sky-700 dark:text-sky-300">
                      {formData.usageUnit || formData.unit}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                    حد تنبيه النواقص (بالعبوة)
                  </label>
                  <SmartNumberInput
                    min={0}
                    value={formData.minThreshold}
                    onValueChange={(val) => handleMinThresholdChange(val)}
                    placeholder="0"
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm font-mono tabular-nums font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                    تكلفة العبوة الواحدة ({defaultCurrency})
                  </label>
                  <SmartNumberInput
                    min={0}
                    value={formData.costPerUnit}
                    onValueChange={(val) => handleCostPerUnitChange(val)}
                    placeholder="0"
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm font-mono tabular-nums font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                  ربط تلقائي بخدمة علاجية (لخصم المادة عند اختيار الخدمة)
                </label>
                <div className="relative">
                  <select
                    value={formData.linkedService}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, linkedService: e.target.value }))
                    }
                    className="w-full appearance-none rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 pl-8 text-xs font-bold text-slate-900 dark:text-slate-100"
                  >
                    <option value="">— بدون ربط مباشر (أو يدار من وصفات الخدمات) —</option>
                    {services.map((srv) => (
                      <option key={srv.id} value={srv.name}>
                        {srv.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                  ملاحظات الصنف
                </label>
                <input
                  type="text"
                  value={formData.notes}
                  onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
                  placeholder="تفاصيل إضافية (اختياري)"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs"
                />
              </div>

              {!editingId && (
                <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.recordAsExpense}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, recordAsExpense: e.target.checked }))
                    }
                    className="rounded border-slate-300 text-sky-600"
                  />
                  <span>تسجيل التكلفة ({totalCost.toLocaleString()}) كمصروف شراء</span>
                </label>
              )}
            </div>

            <div className="p-3 border-t border-slate-200 dark:border-slate-800 shrink-0">
              <button
                type="submit"
                className="w-full py-2.5 rounded-xl text-xs font-bold text-white bg-sky-600 hover:bg-sky-500 transition-colors"
              >
                حفظ المادة في المخزون
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Pop-up Modal: AI Audit Report */}
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
                تحليل المخزون
              </h3>
              <button
                type="button"
                onClick={() => setAuditReport('')}
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                aria-label="إغلاق"
              >
                <X className="w-4 h-4" />
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
