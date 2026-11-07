import React, { useRef, useState } from 'react';
import {
  ArrowRight,
  Building2,
  Download,
  Image as ImageIcon,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  ClinicSettings,
  CurrencyCode,
  DentalServiceItem,
  ExpenseRecord,
  InventoryItem,
  ReceiptRecord,
} from '../types/clinic';
import { CURRENCIES, DEFAULT_CLINIC_LOGO_DATA_URI } from '../data/defaultData';

interface ClinicSettingsPanelProps {
  settings: ClinicSettings;
  receipts: ReceiptRecord[];
  inventory: InventoryItem[];
  expenses: ExpenseRecord[];
  onDeleteService?: (serviceId: string) => void;
  onSaveSettings: (nextSettings: ClinicSettings) => void;
  onImportFullBackup: (payload: {
    settings?: ClinicSettings;
    receipts?: ReceiptRecord[];
    inventory?: InventoryItem[];
    expenses?: ExpenseRecord[];
  }) => void;
  notify: (message: string, type?: 'success' | 'warning' | 'error' | 'info') => void;
}

export const ClinicSettingsPanel: React.FC<ClinicSettingsPanelProps> = ({
  settings,
  receipts,
  inventory,
  expenses,
  onDeleteService,
  onSaveSettings,
  onImportFullBackup,
  notify,
}) => {
  const [subTab, setSubTab] = useState<'identity' | 'services' | 'backup'>('identity');
  const [formState, setFormState] = useState<ClinicSettings>(settings);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Pop-up Add Service Modal
  const [isAddServiceModalOpen, setIsAddServiceModalOpen] = useState(false);
  const [newSrvName, setNewSrvName] = useState('');
  const [newSrvPrice, setNewSrvPrice] = useState<number>(5000);
  const [newSrvKeywords, setNewSrvKeywords] = useState('');

  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const backupInputRef = useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    setFormState(settings);
  }, [settings]);

  const handleIdentityChange = (field: keyof ClinicSettings['identity'], value: string) => {
    setFormState((prev) => ({
      ...prev,
      identity: {
        ...prev.identity,
        [field]: value,
      },
    }));
  };

  const handleAppearanceChange = (
    field: keyof ClinicSettings['appearance'],
    value: string | number
  ) => {
    setFormState((prev) => ({
      ...prev,
      appearance: {
        ...prev.appearance,
        [field]: value,
      },
    }));
  };

  const handleFeatureToggle = (field: keyof ClinicSettings['features']) => {
    setFormState((prev) => ({
      ...prev,
      features: {
        ...prev.features,
        [field]: !prev.features[field],
      },
    }));
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const rawDataUrl = String(reader.result || '');
      const img = new Image();
      img.onload = () => {
        try {
          const maxDim = 220;
          let w = img.width || maxDim;
          let h = img.height || maxDim;
          if (w > maxDim || h > maxDim) {
            if (w > h) {
              h = Math.round((h * maxDim) / w);
              w = maxDim;
            } else {
              w = Math.round((w * maxDim) / h);
              h = maxDim;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, w, h);
            const optimized = canvas.toDataURL('image/png', 0.85);
            handleAppearanceChange('customLogoDataUrl', optimized);
          } else {
            handleAppearanceChange('customLogoDataUrl', rawDataUrl);
          }
        } catch {
          handleAppearanceChange('customLogoDataUrl', rawDataUrl);
        }
        notify('تم اختيار الشعار وضغط حجمه تلقائياً، اضغط حفظ لاعتماده', 'info');
      };
      img.onerror = () => {
        handleAppearanceChange('customLogoDataUrl', rawDataUrl);
        notify('تم اختيار الشعار، اضغط حفظ لاعتماده', 'info');
      };
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
  };

  const handleAddService = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSrvName.trim()) {
      notify('يرجى إدخال اسم الخدمة', 'warning');
      return;
    }
    const newItem: DentalServiceItem = {
      id: 'srv_' + Date.now(),
      name: newSrvName.trim(),
      price: Number(newSrvPrice) || 0,
      category: 'علاجي',
      keywords: newSrvKeywords
        .split(/[,،]/)
        .map((k) => k.trim())
        .filter(Boolean),
    };
    const updated: ClinicSettings = {
      ...formState,
      services: [...formState.services, newItem],
    };
    setFormState(updated);
    onSaveSettings(updated);
    setNewSrvName('');
    setNewSrvPrice(5000);
    setNewSrvKeywords('');
    setIsAddServiceModalOpen(false);
  };

  const handleServicePriceUpdate = (id: string, price: number) => {
    setFormState((prev) => ({
      ...prev,
      services: prev.services.map((s) => (s.id === id ? { ...s, price } : s)),
    }));
  };

  const handleRemoveService = (id: string) => {
    const updated: ClinicSettings = {
      ...formState,
      services: formState.services.filter((s) => s.id !== id),
    };
    setFormState(updated);
    onDeleteService?.(id);
    onSaveSettings(updated);
    setConfirmDeleteId(null);
  };

  const handleExportBackup = () => {
    const backupData = {
      version: 'DOCAI-ERP-v4',
      exportedAt: new Date().toISOString(),
      settings: formState,
      receipts,
      inventory,
      expenses,
    };
    const blob = new Blob([JSON.stringify(backupData, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `DOCAI-Backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    notify('تم تصدير النسخة الاحتياطية بنجاح', 'success');
  };

  const handleImportBackupFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || '{}'));
        onImportFullBackup(parsed);
        if (parsed.settings) {
          setFormState(parsed.settings);
        }
        notify('تم استعادة النسخة الاحتياطية بنجاح', 'success');
      } catch {
        notify('ملف النسخة الاحتياطية غير صالح', 'error');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {/* Top 3-Tab Segmented Switcher (هوية العيادة | قائمة الخدمات | النسخ الاحتياطي) */}
      <div className="grid grid-cols-3 gap-1.5 p-1.5 rounded-xl bg-slate-200/70 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        <button
          type="button"
          onClick={() => setSubTab('identity')}
          className={`py-2 px-2 rounded-lg text-xs font-bold transition-colors ${
            subTab === 'identity'
              ? 'bg-sky-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          هوية العيادة
        </button>
        <button
          type="button"
          onClick={() => setSubTab('services')}
          className={`py-2 px-2 rounded-lg text-xs font-bold transition-colors ${
            subTab === 'services'
              ? 'bg-sky-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          قائمة الخدمات
        </button>
        <button
          type="button"
          onClick={() => setSubTab('backup')}
          className={`py-2 px-2 rounded-lg text-xs font-bold transition-colors ${
            subTab === 'backup'
              ? 'bg-sky-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          النسخ الاحتياطي
        </button>
      </div>

      {/* TAB 1: CLINIC IDENTITY */}
      {subTab === 'identity' && (
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-sky-600 dark:text-sky-400" />
              <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
                هوية العيادة
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onSaveSettings(formState)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-sky-600 hover:bg-sky-500 rounded-lg"
            >
              <Save className="w-4 h-4" />
              <span>حفظ الهوية</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                اسم العيادة (عربي)
              </label>
              <input
                type="text"
                value={formState.identity.clinicAr}
                onChange={(e) => handleIdentityChange('clinicAr', e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs sm:text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                اسم الطبيب (عربي)
              </label>
              <input
                type="text"
                value={formState.identity.doctorAr}
                onChange={(e) => handleIdentityChange('doctorAr', e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs sm:text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                التخصص الطبي
              </label>
              <input
                type="text"
                value={formState.identity.specialtyAr}
                onChange={(e) => handleIdentityChange('specialtyAr', e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs sm:text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                العملة الافتراضية
              </label>
              <select
                value={formState.identity.defaultCurrency}
                onChange={(e) =>
                  handleIdentityChange('defaultCurrency', e.target.value as CurrencyCode)
                }
                className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-bold"
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
                اسم العيادة (إنجليزي)
              </label>
              <input
                type="text"
                dir="ltr"
                value={formState.identity.clinicEn}
                onChange={(e) => handleIdentityChange('clinicEn', e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                اسم الطبيب (إنجليزي)
              </label>
              <input
                type="text"
                dir="ltr"
                value={formState.identity.doctorEn}
                onChange={(e) => handleIdentityChange('doctorEn', e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                العنوان
              </label>
              <input
                type="text"
                value={formState.identity.address}
                onChange={(e) => handleIdentityChange('address', e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs sm:text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                أرقام الهواتف
              </label>
              <input
                type="text"
                dir="ltr"
                value={formState.identity.phones}
                onChange={(e) => handleIdentityChange('phones', e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-mono"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <img
                src={formState.appearance.customLogoDataUrl || DEFAULT_CLINIC_LOGO_DATA_URI}
                alt="شعار العيادة"
                referrerPolicy="no-referrer"
                className="w-14 h-14 rounded-xl border border-slate-200 dark:border-slate-700 object-contain bg-white p-1 shrink-0"
              />
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 rounded-lg"
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  <span>تغيير الشعار</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleAppearanceChange('customLogoDataUrl', DEFAULT_CLINIC_LOGO_DATA_URI)
                  }
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-slate-500"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>الافتراضي</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={formState.features.autoPrice}
                  onChange={() => handleFeatureToggle('autoPrice')}
                  className="rounded border-slate-300 text-sky-600"
                />
                <span>تسعير تلقائي للخدمات</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={formState.features.autoInventory}
                  onChange={() => handleFeatureToggle('autoInventory')}
                  className="rounded border-slate-300 text-sky-600"
                />
                <span>خصم المخزون تلقائياً</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={formState.features.showQrCode}
                  onChange={() => handleFeatureToggle('showQrCode')}
                  className="rounded border-slate-300 text-sky-600"
                />
                <span>إظهار رمز QR بالسند</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={formState.features.debtAlert}
                  onChange={() => handleFeatureToggle('debtAlert')}
                  className="rounded border-slate-300 text-sky-600"
                />
                <span>تنبيه ديون المريض</span>
              </label>
            </div>
          </div>
        </section>
      )}

      {/* TAB 2: SERVICES CATALOG */}
      {subTab === 'services' && (
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
            <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
              قائمة الخدمات ({formState.services.length})
            </h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsAddServiceModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-sky-600 hover:bg-sky-500 rounded-lg"
              >
                <Plus className="w-4 h-4" />
                <span>إضافة خدمة</span>
              </button>
              <button
                type="button"
                onClick={() => onSaveSettings(formState)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg"
              >
                <Save className="w-4 h-4" />
                <span>حفظ الأسعار</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {formState.services.map((srv) => (
              <div
                key={srv.id}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-3.5 flex flex-col justify-between gap-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">
                    {srv.name}
                  </span>
                  {confirmDeleteId === srv.id ? (
                    <button
                      type="button"
                      onClick={() => handleRemoveService(srv.id)}
                      className="px-2 py-0.5 text-xs font-bold text-white bg-rose-600 rounded-md"
                    >
                      تأكيد؟
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(srv.id)}
                      className="p-1 text-slate-400 hover:text-rose-600"
                      title="حذف"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    value={srv.price}
                    onChange={(e) => handleServicePriceUpdate(srv.id, Number(e.target.value) || 0)}
                    className="flex-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs sm:text-sm font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100"
                  />
                  <span className="text-xs text-slate-500 shrink-0">
                    {formState.identity.defaultCurrency}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* TAB 3: BACKUP & RESTORE */}
      {subTab === 'backup' && (
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
          <div className="pb-3 border-b border-slate-200 dark:border-slate-800">
            <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
              النسخ الاحتياطي (JSON)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              حفظ أو استعادة جميع السندات ({receipts.length})، المخزون ({inventory.length})، والمصروفات ({expenses.length}).
            </p>
          </div>

          <input
            ref={backupInputRef}
            type="file"
            accept="application/json"
            onChange={handleImportBackupFile}
            className="hidden"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={handleExportBackup}
              className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition-colors"
            >
              <Download className="w-4 h-4 shrink-0" />
              <span>تصدير نسخة احتياطية</span>
            </button>

            <button
              type="button"
              onClick={() => backupInputRef.current?.click()}
              className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors"
            >
              <Upload className="w-4 h-4 shrink-0" />
              <span>استيراد نسخة احتياطية</span>
            </button>
          </div>
        </section>
      )}

      {/* Pop-up Modal: Add Service */}
      {isAddServiceModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-4"
          onClick={() => setIsAddServiceModalOpen(false)}
        >
          <form
            onSubmit={handleAddService}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                إضافة خدمة علاجية
              </h3>
              <button
                type="button"
                onClick={() => setIsAddServiceModalOpen(false)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold"
              >
                <ArrowRight className="w-3.5 h-3.5" />
                <span>رجوع</span>
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                اسم الخدمة
              </label>
              <input
                type="text"
                value={newSrvName}
                onChange={(e) => setNewSrvName(e.target.value)}
                placeholder="مثال: زراعة أسنان"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                السعر الافتراضي ({formState.identity.defaultCurrency})
              </label>
              <input
                type="number"
                min="0"
                value={newSrvPrice}
                onChange={(e) => setNewSrvPrice(Number(e.target.value) || 0)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm font-mono tabular-nums font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                كلمات مفتاحية للتحليل الذكي
              </label>
              <input
                type="text"
                value={newSrvKeywords}
                onChange={(e) => setNewSrvKeywords(e.target.value)}
                placeholder="زراعة، غرسة، زرعة"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsAddServiceModalOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-500"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="px-5 py-2 text-xs font-bold text-white bg-sky-600 hover:bg-sky-500 rounded-lg"
              >
                إضافة وحفظ
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
