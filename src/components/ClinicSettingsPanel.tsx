import React, { useMemo, useRef, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  ChevronDown,
  Cpu,
  Crown,
  Database,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileSpreadsheet,
  Globe,
  Image as ImageIcon,
  Key,
  Lock,
  Mic,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  AIProviderConfig,
  ClinicSettings,
  CurrencyCode,
  DentalServiceItem,
  ExpenseRecord,
  InventoryItem,
  MaterialConsumptionType,
  ReceiptRecord,
  ServiceMaterialRule,
  TelegramBackupSettings,
  WorkspaceRole,
  DEFAULT_AI_CONFIG,
} from '../types/clinic';
import {
  CURRENCIES,
  DEFAULT_CLINIC_LOGO_DATA_URI,
  isPlatformDeveloperUser,
} from '../data/defaultData';
import {
  RegisteredClinicSummary,
  applyAiConfigToAllClinicsByDeveloper,
  auth,
  fetchRegisteredSystemDirectory,
  flushPendingSyncQueue,
  getActiveCloudDiagnostics,
  sendBackupToTelegramApi,
  updateClinicAiConfigByDeveloper,
} from '../firebase';
import {
  AI_TTS_MODELS,
  DIRECT_DATA_ENTRY_MODELS,
  GEMINI_CANDIDATE_MODELS,
  GEMINI_VISION_MODELS,
  GROQ_TEXT_MODELS,
  GROQ_VISION_MODELS,
  GROQ_WHISPER_MODELS,
  OPENROUTER_MODELS,
  OPENROUTER_VISION_MODELS,
  ProviderTestResult,
  formatModelDisplayLabel,
  loadAIProviderConfig,
  saveAIProviderConfig,
  testAIProviderConnection,
} from '../utils/aiClient';
import { WorkspaceTeamPanel } from './WorkspaceTeamModal';
import { SmartNumberInput } from './SmartNumberInput';

interface ClinicSettingsPanelProps {
  settings: ClinicSettings;
  receipts: ReceiptRecord[];
  inventory: InventoryItem[];
  expenses: ExpenseRecord[];
  workspaceId?: string;
  ownerUid?: string;
  isOwner?: boolean;
  currentRole?: WorkspaceRole;
  isNewAccountSetup?: boolean;
  ownerEmail?: string | null;
  initialSubTab?: 'identity' | 'services' | 'team' | 'backup' | 'ai' | 'subscription';
  onDeleteService?: (serviceId: string) => void;
  onSaveSettings: (nextSettings: ClinicSettings) => void;
  onImportFullBackup: (payload: {
    settings?: ClinicSettings;
    receipts?: ReceiptRecord[];
    inventory?: InventoryItem[];
    expenses?: ExpenseRecord[];
  }) => void;
  onOpenTeamModal?: () => void;
  notify: (message: string, type?: 'success' | 'warning' | 'error' | 'info') => void;
}

export const ClinicSettingsPanel: React.FC<ClinicSettingsPanelProps> = ({
  settings,
  receipts,
  inventory,
  expenses,
  workspaceId,
  ownerUid,
  isOwner,
  currentRole,
  isNewAccountSetup,
  ownerEmail,
  initialSubTab,
  onDeleteService,
  onSaveSettings,
  onImportFullBackup,
  onOpenTeamModal,
  notify,
}) => {
  // Strict Platform Developer check (alssaedy50@gmail.com only)
  const isPlatformDev = isPlatformDeveloperUser(auth.currentUser?.email);

  const [subTab, setSubTab] = useState<'identity' | 'services' | 'team' | 'backup' | 'ai' | 'subscription'>(() => {
    if (initialSubTab) {
      if ((initialSubTab === 'ai' || initialSubTab === 'subscription') && !isPlatformDev) {
        return 'identity';
      }
      if (initialSubTab === 'subscription') return 'ai';
      return initialSubTab;
    }
    try {
      const saved = localStorage.getItem('docai_settings_subtab_v1');
      if (
        saved === 'identity' ||
        saved === 'services' ||
        saved === 'team' ||
        saved === 'backup' ||
        (saved === 'ai' && isPlatformDev)
      ) {
        return saved;
      }
    } catch {
      // Ignore
    }
    return 'identity';
  });
  const [formState, setFormState] = useState<ClinicSettings>(settings);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // AI Configuration state (Strictly managed by Platform Developer per clinic)
  const [aiConfig, setAiConfig] = useState<AIProviderConfig>(() => settings.aiConfig || loadAIProviderConfig());
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [showGroqKey, setShowGroqKey] = useState(false);
  const [showOpenRouterKey, setShowOpenRouterKey] = useState(false);
  const [testingProvider, setTestingProvider] = useState<'gemini' | 'groq' | 'openrouter' | 'all' | null>(null);
  const [testResults, setTestResults] = useState<Record<string, ProviderTestResult>>({});

  // Developer Per-Clinic AI Key Management State
  const [devClinicsList, setDevClinicsList] = useState<RegisteredClinicSummary[]>([]);
  const [selectedDevClinicId, setSelectedDevClinicId] = useState<string>(() => ownerUid || auth.currentUser?.uid || '');
  const [isLoadingDevClinics, setIsLoadingDevClinics] = useState(false);
  const [isSavingClinicAi, setIsSavingClinicAi] = useState(false);
  const [isApplyingAiToAll, setIsApplyingAiToAll] = useState(false);

  // Pop-up Add Service Modal
  const [isAddServiceModalOpen, setIsAddServiceModalOpen] = useState(false);
  const [newSrvName, setNewSrvName] = useState('');
  const [newSrvPrice, setNewSrvPrice] = useState<number>(5000);
  const [newSrvKeywords, setNewSrvKeywords] = useState('');

  // Service Materials Recipe Configurator Modal State
  const [recipeModalServiceId, setRecipeModalServiceId] = useState<string | null>(null);
  const [editingRecipeRules, setEditingRecipeRules] = useState<ServiceMaterialRule[]>([]);
  const [editingServiceTotalSessions, setEditingServiceTotalSessions] = useState<number>(1);
  const [activeSessionFilter, setActiveSessionFilter] = useState<'all' | number>('all');

  // Telegram & Backup state
  const [showBotToken, setShowBotToken] = useState(false);
  const [isSendingTelegram, setIsSendingTelegram] = useState(false);
  const [isFlushingSync, setIsFlushingSync] = useState(false);
  const [, setDiagRefreshTick] = useState(0);
  const [lastLocalExportAt, setLastLocalExportAt] = useState<string>(() => {
    try {
      return localStorage.getItem('docai_last_backup_export_v1') || '';
    } catch {
      return '';
    }
  });

  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const backupInputRef = useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    const unsub = auth.onAuthStateChanged(() => {
      setDiagRefreshTick((t) => t + 1);
    });
    const handleOnlineStatus = () => setDiagRefreshTick((t) => t + 1);
    window.addEventListener('online', handleOnlineStatus);
    window.addEventListener('offline', handleOnlineStatus);
    return () => {
      unsub();
      window.removeEventListener('online', handleOnlineStatus);
      window.removeEventListener('offline', handleOnlineStatus);
    };
  }, []);

  React.useEffect(() => {
    if (subTab !== 'backup') return;
    const targetUid = ownerUid || auth.currentUser?.uid;
    if (!targetUid || (typeof navigator !== 'undefined' && navigator.onLine === false)) return;
    const diagNow = getActiveCloudDiagnostics(
      targetUid,
      ownerEmail || formState.identity.ownerEmail
    );
    if (diagNow.pendingSyncCount > 0) {
      setIsFlushingSync(true);
      flushPendingSyncQueue(targetUid)
        .catch(() => {})
        .finally(() => {
          setIsFlushingSync(false);
          setDiagRefreshTick((t) => t + 1);
        });
    }
  }, [subTab, ownerUid, ownerEmail, formState.identity.ownerEmail]);

  React.useEffect(() => {
    setFormState(settings);
  }, [settings]);

  React.useEffect(() => {
    if (isNewAccountSetup) {
      setSubTab('identity');
    } else if (!isPlatformDev && (subTab === 'ai' || subTab === 'subscription')) {
      setSubTab('identity');
    } else if (subTab === 'subscription') {
      setSubTab(isPlatformDev ? 'ai' : 'identity');
    }
  }, [isNewAccountSetup, isPlatformDev, subTab]);

  const loadDeveloperClinicsDirectory = React.useCallback(async () => {
    if (!isPlatformDev) return;
    setIsLoadingDevClinics(true);
    try {
      const res = await fetchRegisteredSystemDirectory(
        workspaceId || 'alssaedy-clinic',
        ownerEmail || formState.identity.ownerEmail || auth.currentUser?.email
      );
      setDevClinicsList(res.clinics);
      setSelectedDevClinicId((prev) => {
        if (prev && res.clinics.some((c) => c.id === prev)) return prev;
        return res.clinics[0]?.id || ownerUid || auth.currentUser?.uid || '';
      });
    } catch {
      // Ignore directory load errors
    } finally {
      setIsLoadingDevClinics(false);
    }
  }, [
    isPlatformDev,
    workspaceId,
    ownerUid,
    ownerEmail,
    formState.identity.ownerEmail,
  ]);

  React.useEffect(() => {
    if (isPlatformDev && subTab === 'ai') {
      loadDeveloperClinicsDirectory();
    }
  }, [isPlatformDev, subTab, loadDeveloperClinicsDirectory]);

  React.useEffect(() => {
    try {
      localStorage.setItem('docai_settings_subtab_v1', subTab);
      localStorage.removeItem('docai_developer_mode_active');
    } catch {
      // Ignore
    }
  }, [subTab]);

  const handleIdentityChange = (field: keyof ClinicSettings['identity'], value: string) => {
    setFormState((prev) => ({
      ...prev,
      identity: {
        ...prev.identity,
        [field]: value,
        ...(field === 'clinicAr' ? { systemTitleAr: value } : {}),
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
        notify('تم اختيار الشعار، اضغط حفظ لاعتماده', 'info');
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

  const openServiceRecipeModal = (srv: DentalServiceItem) => {
    setRecipeModalServiceId(srv.id);
    setEditingServiceTotalSessions(Math.max(1, srv.totalSessions || 1));
    setActiveSessionFilter('all');
    setEditingRecipeRules(
      Array.isArray(srv.materialsRecipe) ? srv.materialsRecipe.map((r) => ({ ...r })) : []
    );
  };

  const handleAddMaterialRuleRow = () => {
    if (inventory.length === 0) {
      notify('يرجى إضافة مواد في قسم المخزون أولاً قبل ربطها بالخدمات', 'warning');
      return;
    }
    const defaultMat = inventory[0];
    setEditingRecipeRules((prev) => [
      ...prev,
      {
        materialId: defaultMat.id,
        consumptionType: 'per_session',
        qtyFixed: 1,
        qtyAnterior: 1,
        qtyMolar: 1.5,
        sessionNumber: activeSessionFilter === 'all' ? 'all' : activeSessionFilter,
      },
    ]);
  };

  const handleUpdateMaterialRuleRow = (
    index: number,
    patch: Partial<ServiceMaterialRule>
  ) => {
    setEditingRecipeRules((prev) =>
      prev.map((rule, i) => (i === index ? { ...rule, ...patch } : rule))
    );
  };

  const handleRemoveMaterialRuleRow = (index: number) => {
    setEditingRecipeRules((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSaveServiceRecipe = () => {
    if (!recipeModalServiceId) return;
    const cleanedRules = editingRecipeRules
      .filter((r) => Boolean(r && r.materialId))
      .map((r) => ({
        materialId: r.materialId,
        consumptionType: r.consumptionType,
        qtyFixed: Number(r.qtyFixed ?? 0),
        qtyAnterior: Number(r.qtyAnterior ?? 0),
        qtyMolar: Number(r.qtyMolar ?? 0),
        sessionNumber: r.sessionNumber ?? 'all',
      }));
    const finalTotalSessions = Math.max(1, editingServiceTotalSessions || 1);
    const updated: ClinicSettings = {
      ...formState,
      services: formState.services.map((s) =>
        s.id === recipeModalServiceId
          ? {
              ...s,
              totalSessions: finalTotalSessions,
              sessionsCount: finalTotalSessions,
              materialsRecipe: cleanedRules,
            }
          : s
      ),
    };
    setFormState(updated);
    onSaveSettings(updated);
    setRecipeModalServiceId(null);
    notify('تم حفظ وصفة المواد وجلسات الخدمة بنجاح', 'success');
  };

  const recordBackupTimestamp = (isoStr: string) => {
    try {
      localStorage.setItem('docai_last_backup_export_v1', isoStr);
    } catch {
      // Ignore
    }
    setLastLocalExportAt(isoStr);
  };

  const handleExportBackup = () => {
    const nowIso = new Date().toISOString();
    const backupData = {
      version: 'DOCAI-ERP-v4',
      exportedAt: nowIso,
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
    a.download = `DOCAI-Backup-${nowIso.slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    recordBackupTimestamp(nowIso);
    notify('تم تصدير النسخة الاحتياطية الشاملة (JSON) بنجاح', 'success');
  };

  const handleExportCsv = () => {
    const nowIso = new Date().toISOString();
    const escapeCsv = (val: unknown): string => {
      const str = String(val ?? '').replace(/"/g, '""');
      return `"${str}"`;
    };

    const headers = [
      'رقم السند',
      'التاريخ',
      'اسم المريض',
      'الهاتف',
      'الخدمات',
      'الأسنان (FDI)',
      'الإجمالي',
      'المدفوع',
      'المتبقي',
      'العملة',
      'طريقة الدفع',
      'ملاحظات',
    ];

    const rows = receipts.map((r) =>
      [
        r.receiptNo,
        r.date,
        r.patientName,
        r.patientPhone || '',
        Array.isArray(r.services) ? r.services.join(' + ') : '',
        r.toothFDI || '',
        r.totalAmount,
        r.paidAmount,
        r.remainingAmount,
        r.currency,
        r.paymentMethod,
        r.notes || '',
      ]
        .map(escapeCsv)
        .join(',')
    );

    // Prepend UTF-8 BOM (\uFEFF) so Microsoft Excel opens Arabic characters cleanly
    const csvContent = '\uFEFF' + [headers.map(escapeCsv).join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `DOCAI-Receipts-Debts-${nowIso.slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    recordBackupTimestamp(nowIso);
    notify('تم تصدير سجل السندات والديون (CSV للـ Excel) بنجاح', 'success');
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

  const currentTelegramConfig: TelegramBackupSettings = formState.telegramBackup || {
    enabled: false,
    autoBackupOnReceipt: true,
    botToken: '',
    chatId: '',
  };

  const handleTelegramFieldChange = (
    field: keyof TelegramBackupSettings,
    value: string | boolean
  ) => {
    setFormState((prev) => {
      const base: TelegramBackupSettings = prev.telegramBackup || {
        enabled: false,
        autoBackupOnReceipt: true,
        botToken: '',
        chatId: '',
      };
      const updatedTg: TelegramBackupSettings = {
        ...base,
        [field]: value,
      };
      if (field === 'botToken' || field === 'chatId') {
        updatedTg.enabled = Boolean(updatedTg.botToken.trim() && updatedTg.chatId.trim());
      }
      return {
        ...prev,
        telegramBackup: updatedTg,
      };
    });
  };

  const handleSaveTelegramSettings = () => {
    const updatedTg: TelegramBackupSettings = {
      ...currentTelegramConfig,
      botToken: currentTelegramConfig.botToken.trim(),
      chatId: currentTelegramConfig.chatId.trim(),
      enabled: Boolean(
        currentTelegramConfig.botToken.trim() && currentTelegramConfig.chatId.trim()
      ),
    };
    const nextSettings: ClinicSettings = {
      ...formState,
      telegramBackup: updatedTg,
    };
    setFormState(nextSettings);
    try {
      localStorage.setItem('docai_telegram_backup_v1', JSON.stringify(updatedTg));
    } catch {
      // Ignore
    }
    onSaveSettings(nextSettings);
    notify('تم حفظ إعدادات النسخ الاحتياطي لتليجرام بنجاح', 'success');
  };

  const handleSendTelegramBackupNow = async () => {
    const botToken = currentTelegramConfig.botToken.trim();
    const chatId = currentTelegramConfig.chatId.trim();
    if (!botToken || !chatId) {
      notify('يرجى إدخال رمز البوت (Bot Token) ومعرّف المحادثة (Chat ID) أولاً.', 'warning');
      return;
    }

    setIsSendingTelegram(true);
    try {
      const result = await sendBackupToTelegramApi({
        botToken,
        chatId,
        settings: formState,
        receipts,
        inventory,
        expenses,
        triggerReason: 'نسخ احتياطي يدوي فوري',
      });

      if (!result.ok) {
        notify(result.error || 'تعذر إرسال النسخة الاحتياطية إلى تليجرام.', 'error');
        return;
      }

      const sentAt = result.sentAt || new Date().toISOString();
      recordBackupTimestamp(sentAt);
      const updatedTg: TelegramBackupSettings = {
        ...currentTelegramConfig,
        botToken,
        chatId,
        enabled: true,
        lastBackupAt: sentAt,
      };
      const nextSettings: ClinicSettings = {
        ...formState,
        telegramBackup: updatedTg,
      };
      setFormState(nextSettings);
      try {
        localStorage.setItem('docai_telegram_backup_v1', JSON.stringify(updatedTg));
      } catch {
        // Ignore
      }
      onSaveSettings(nextSettings);
      notify('تم إرسال النسخة الاحتياطية الشاملة إلى تليجرام بنجاح', 'success');
    } catch {
      notify('تعذر الاتصال بخادم النسخ الاحتياطي لتليجرام.', 'error');
    } finally {
      setIsSendingTelegram(false);
    }
  };

  const handleAiFieldChange = <K extends keyof AIProviderConfig>(field: K, value: AIProviderConfig[K]) => {
    setAiConfig((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSelectDevClinicForAi = (clinicId: string) => {
    setSelectedDevClinicId(clinicId);
    const found = devClinicsList.find((c) => c.id === clinicId);
    if (found?.aiConfig) {
      const hasAnyKey = Boolean(
        found.aiConfig.geminiApiKey?.trim() ||
          found.aiConfig.groqApiKey?.trim() ||
          found.aiConfig.openrouterApiKey?.trim()
      );
      if (hasAnyKey) {
        setAiConfig({
          ...DEFAULT_AI_CONFIG,
          ...found.aiConfig,
        });
      }
    }
  };

  const handleSaveAiSettings = async () => {
    saveAIProviderConfig(aiConfig);
    if (!isPlatformDev) return;

    const targetClinic: RegisteredClinicSummary =
      devClinicsList.find((c) => c.id === selectedDevClinicId) || {
        id: selectedDevClinicId || ownerUid || auth.currentUser?.uid || 'local_owner',
        clinicAr: formState.identity.clinicAr || formState.identity.systemTitleAr || 'العيادة الحالية',
        doctorAr: formState.identity.doctorAr || '',
        ownerEmail: ownerEmail || formState.identity.ownerEmail || auth.currentUser?.email || '',
        phones: formState.identity.phones || '',
        address: formState.identity.address || '',
        updatedAt: new Date().toISOString(),
      };

    setIsSavingClinicAi(true);
    try {
      await updateClinicAiConfigByDeveloper(targetClinic, aiConfig);
      setDevClinicsList((prev) =>
        prev.map((c) =>
          c.id === targetClinic.id
            ? { ...c, aiConfig: { ...aiConfig } }
            : c
        )
      );
      if (targetClinic.id === (ownerUid || auth.currentUser?.uid)) {
        const nextSettings: ClinicSettings = {
          ...formState,
          aiConfig: { ...aiConfig },
        };
        setFormState(nextSettings);
        onSaveSettings(nextSettings);
      }
      notify(`تم حفظ وتفعيل مفاتيح الذكاء الاصطناعي لعيادة (${targetClinic.clinicAr}) سحابياً بنجاح ✅`, 'success');
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'تعذر حفظ مفاتيح الذكاء للعيادة سحابياً', 'error');
    } finally {
      setIsSavingClinicAi(false);
    }
  };

  const handleApplyAiSettingsToAllClinics = async () => {
    if (!isPlatformDev) return;
    saveAIProviderConfig(aiConfig);
    setIsApplyingAiToAll(true);
    try {
      const clinicsToUpdate: RegisteredClinicSummary[] =
        devClinicsList.length > 0
          ? devClinicsList
          : [
              {
                id: ownerUid || auth.currentUser?.uid || 'local_owner',
                clinicAr: formState.identity.clinicAr || 'العيادة الحالية',
                doctorAr: formState.identity.doctorAr || '',
                ownerEmail: ownerEmail || formState.identity.ownerEmail || '',
                phones: formState.identity.phones || '',
                address: formState.identity.address || '',
                updatedAt: new Date().toISOString(),
              },
            ];
      const count = await applyAiConfigToAllClinicsByDeveloper(clinicsToUpdate, aiConfig);
      setDevClinicsList((prev) => prev.map((c) => ({ ...c, aiConfig: { ...aiConfig } })));
      const nextSettings: ClinicSettings = {
        ...formState,
        aiConfig: { ...aiConfig },
      };
      setFormState(nextSettings);
      onSaveSettings(nextSettings);
      notify(`تم تعميم وحفظ مفاتيح الذكاء الاصطناعي لجميع العيادات المسجلة (${count} عيادة) بنجاح ✅`, 'success');
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'تعذر تعميم مفاتيح الذكاء على العيادات', 'error');
    } finally {
      setIsApplyingAiToAll(false);
    }
  };

  const handleTestProvider = async (provider: 'gemini' | 'groq' | 'openrouter') => {
    setTestingProvider(provider);
    try {
      const workingCopy: AIProviderConfig = { ...aiConfig };
      saveAIProviderConfig(workingCopy);
      const res = await testAIProviderConnection(provider, workingCopy);
      setTestResults((prev) => ({
        ...prev,
        [provider]: res,
      }));
      setAiConfig({ ...workingCopy });
      if (res.ok) {
        const countLabel = res.activeModelsCount ? ` (${res.activeModelsCount} نموذج جاهز)` : '';
        notify(
          `فحص ${provider.toUpperCase()} ناجح${countLabel} — الأسرع: ${formatModelDisplayLabel(res.testedModel)} (${res.latencyMs}ms)`,
          'success'
        );
      } else {
        notify(`فشل اختبار ${provider}: ${res.error || 'خطأ'}. يرجى التحقق من المفتاح.`, 'error');
      }
    } catch (err: unknown) {
      setTestResults((prev) => ({
        ...prev,
        [provider]: {
          ok: false,
          latencyMs: 0,
          error: err instanceof Error ? err.message : 'خطأ غير متوقع',
        },
      }));
      notify(`فشل اختبار الاتصال بـ ${provider}`, 'error');
    } finally {
      setTestingProvider(null);
    }
  };

  const handleTestAllProvidersDynamic = async () => {
    setTestingProvider('all');
    try {
      const workingCopy: AIProviderConfig = { ...aiConfig };
      saveAIProviderConfig(workingCopy);
      const providersToTest: ('groq' | 'gemini' | 'openrouter')[] = [];
      if (workingCopy.groqApiKey.trim()) providersToTest.push('groq');
      if (workingCopy.geminiApiKey.trim()) providersToTest.push('gemini');
      if (workingCopy.openrouterApiKey.trim()) providersToTest.push('openrouter');

      if (providersToTest.length === 0) {
        notify('يرجى إدخال مفتاح واحد على الأقل (Groq أو Gemini أو OpenRouter) لبدء الفحص الديناميكي', 'warning');
        return;
      }

      let successCount = 0;
      for (const p of providersToTest) {
        const res = await testAIProviderConnection(p, workingCopy);
        setTestResults((prev) => ({ ...prev, [p]: res }));
        if (res.ok) successCount++;
      }
      setAiConfig(loadAIProviderConfig());
      if (successCount > 0) {
        notify(`اكتمل الفحص الديناميكي بنجاح (${successCount}/${providersToTest.length} مزود نشط) وتم ترتيب النماذج من الأقوى والأسرع ✅`, 'success');
      } else {
        notify('فشل الفحص، يرجى التأكد من صحة المفاتيح المدخلة.', 'error');
      }
    } finally {
      setTestingProvider(null);
    }
  };

  const cloudDiag = getActiveCloudDiagnostics(
    ownerUid,
    ownerEmail || formState.identity.ownerEmail
  );
  const isBrowserOnline =
    typeof navigator === 'undefined' ? true : navigator.onLine !== false;
  const effectiveLastBackupAt =
    currentTelegramConfig.lastBackupAt || lastLocalExportAt || '';
  const formattedLastBackupAt = effectiveLastBackupAt
    ? effectiveLastBackupAt.replace('T', ' ').slice(0, 16)
    : 'لم يتم التصدير بعد';

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {/* Mobile Dropdown Switcher + Desktop Segmented Bar */}
      <div className="sm:hidden">
        <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">
          قسم الإعدادات المعروض:
        </label>
        <div className="relative">
          <select
            value={subTab}
            onChange={(e) => {
              const nextTab = e.target.value as typeof subTab;
              setSubTab(nextTab);
              try {
                localStorage.setItem('docai_settings_subtab_v1', nextTab);
              } catch {}
            }}
            aria-label="قسم الإعدادات"
            className="w-full appearance-none rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2.5 pl-9 text-xs font-bold text-slate-900 dark:text-slate-100 shadow-xs focus:outline-none focus:border-sky-500"
          >
            <option value="identity">1. الهوية وبيانات العيادة</option>
            <option value="services">2. الخدمات ووصفات المواد ({formState.services.length})</option>
            <option value="team">3. فريق العمل والصلاحيات</option>
            <option value="backup">4. النسخ الاحتياطي وتليجرام</option>
            {isPlatformDev && <option value="ai">5. إدارة الذكاء الاصطناعي والباقات (للمطور)</option>}
          </select>
          <ChevronDown className="w-4 h-4 text-sky-600 dark:text-sky-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
      </div>

      <div
        className={`hidden sm:grid ${
          isPlatformDev ? 'sm:grid-cols-5' : 'sm:grid-cols-4'
        } gap-1 p-1 rounded-xl bg-slate-200/70 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs`}
      >
        <button
          type="button"
          onClick={() => {
            setSubTab('identity');
            try { localStorage.setItem('docai_settings_subtab_v1', 'identity'); } catch {}
          }}
          className={`py-2 px-2 rounded-lg font-bold transition-colors truncate ${
            subTab === 'identity'
              ? 'bg-sky-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          الهوية
        </button>
        <button
          type="button"
          onClick={() => {
            setSubTab('services');
            try { localStorage.setItem('docai_settings_subtab_v1', 'services'); } catch {}
          }}
          className={`py-2 px-2 rounded-lg font-bold transition-colors truncate ${
            subTab === 'services'
              ? 'bg-sky-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          الخدمات
        </button>
        <button
          type="button"
          onClick={() => {
            setSubTab('team');
            try { localStorage.setItem('docai_settings_subtab_v1', 'team'); } catch {}
          }}
          className={`py-2 px-2 rounded-lg font-bold transition-colors truncate ${
            subTab === 'team'
              ? 'bg-sky-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          الفريق
        </button>
        <button
          type="button"
          onClick={() => {
            setSubTab('backup');
            try { localStorage.setItem('docai_settings_subtab_v1', 'backup'); } catch {}
          }}
          className={`py-2 px-2 rounded-lg font-bold transition-colors truncate ${
            subTab === 'backup'
              ? 'bg-sky-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          النسخ الاحتياطي
        </button>
        {isPlatformDev && (
          <button
            type="button"
            onClick={() => {
              setSubTab('ai');
              try { localStorage.setItem('docai_settings_subtab_v1', 'ai'); } catch {}
            }}
            className={`py-2 px-2 rounded-lg font-bold transition-colors truncate flex items-center justify-center gap-1 ${
              subTab === 'ai'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 shrink-0" />
            <span>الذكاء والباقات</span>
          </button>
        )}
      </div>

      {/* TAB 1: CLINIC IDENTITY */}
      {subTab === 'identity' && (
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-4">
          {isNewAccountSetup && (
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs font-black text-emerald-800 dark:text-emerald-200">
              أكمل بيانات العيادة ثم اضغط حفظ.
            </div>
          )}

          <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-sky-600 dark:text-sky-400" />
              <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
                بيانات العيادة
              </h2>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                اسم العيادة
              </label>
              <input
                type="text"
                placeholder="مثال: عيادة النور لطب وجراحة الأسنان"
                value={formState.identity.clinicAr}
                onChange={(e) => handleIdentityChange('clinicAr', e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs sm:text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                اسم الطبيب
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

            <div className="pt-2">
              <button
                type="button"
                onClick={() => onSaveSettings(formState)}
                className="w-full py-2.5 px-4 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-black flex items-center justify-center gap-2 shadow-sm transition-colors"
              >
                <Save className="w-4 h-4" />
                <span>حفظ الإعدادات</span>
              </button>
            </div>
          </div>
        </section>
      )}

      {/* TAB 2: SERVICES CATALOG */}
      {subTab === 'services' && (
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
            <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
              الخدمات ({formState.services.length})
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
                <span>حفظ</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {formState.services.map((srv) => {
              const recipeCount = Array.isArray(srv.materialsRecipe)
                ? srv.materialsRecipe.length
                : 0;
              return (
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
                    <SmartNumberInput
                      min={0}
                      placeholder="0"
                      value={srv.price}
                      onValueChange={(val) => handleServicePriceUpdate(srv.id, val)}
                      className="flex-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs sm:text-sm font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100"
                    />
                    <span className="text-xs text-slate-500 shrink-0">
                      {formState.identity.defaultCurrency}
                    </span>
                  </div>

                  <div className="pt-1 border-t border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => openServiceRecipeModal(srv)}
                      className={`w-full py-1.5 px-2.5 rounded-lg text-xs font-bold border transition-colors flex items-center justify-between gap-2 ${
                        recipeCount > 0
                          ? 'bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800/80 hover:bg-sky-100/70'
                          : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      <span>إعداد المواد والجلسات</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {Boolean(srv.totalSessions && srv.totalSessions > 1) && (
                          <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                            {srv.totalSessions} جلسات
                          </span>
                        )}
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold ${
                            recipeCount > 0
                              ? 'bg-sky-600 text-white'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                          }`}
                        >
                          {recipeCount > 0 ? `${recipeCount} مواد` : 'غير مربوط'}
                        </span>
                      </div>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* TAB 3: WORKSPACE TEAM */}
      {subTab === 'team' && (
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
          <WorkspaceTeamPanel
            workspaceId={workspaceId || 'alssaedy-clinic'}
            ownerUid={ownerUid || 'local_owner'}
            isOwner={isOwner}
            currentRole={currentRole}
            ownerEmail={ownerEmail || formState.identity.ownerEmail}
            doctorName={formState.identity.doctorAr || formState.identity.systemTitleAr}
            clinicName={formState.identity.clinicAr || formState.identity.systemTitleAr}
            notify={notify}
          />
        </section>
      )}

      {/* TAB 4: BACKUP & DATA SECURITY */}
      {subTab === 'backup' && (
        <div className="space-y-4">
          {/* SECTION 1: Cloud Data Diagnostics & Security Status Card */}
          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-3.5">
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
                  تشخيص وأمان البيانات السحابية
                </h2>
              </div>
              <span
                className={`text-xs font-bold ${
                  !isBrowserOnline && cloudDiag.pendingSyncCount > 0
                    ? 'text-amber-500'
                    : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {!isBrowserOnline && cloudDiag.pendingSyncCount > 0
                  ? `يوجد ${cloudDiag.pendingSyncCount} عمليات بانتظار الإنترنت`
                  : isFlushingSync
                    ? 'جارٍ مزامنة السجلات سحابياً...'
                    : cloudDiag.connectedEmail
                      ? 'متصل ومؤمّن'
                      : 'حفظ محلي نشط'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-3 space-y-1">
                <div className="text-slate-500 font-bold">البريد الإلكتروني المتصل حالياً</div>
                <div
                  className="font-mono font-bold text-slate-900 dark:text-slate-100 truncate"
                  dir="ltr"
                >
                  {cloudDiag.connectedEmail ||
                    ownerEmail ||
                    formState.identity.ownerEmail ||
                    'alssaedy50@gmail.com'}
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-3 space-y-1">
                <div className="text-slate-500 font-bold">معرّف المشروع السحابي النشط</div>
                <div
                  className="font-mono font-bold text-sky-600 dark:text-sky-400 truncate"
                  dir="ltr"
                >
                  {cloudDiag.projectId}
                  {cloudDiag.isCustomProject ? ' (حساب شخصي)' : ''}
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-3 space-y-1">
                <div className="text-slate-500 font-bold">حالة المزامنة اللحظية</div>
                <div className="font-bold text-slate-900 dark:text-slate-100 flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2
                      className={`w-3.5 h-3.5 shrink-0 ${
                        !isBrowserOnline && cloudDiag.pendingSyncCount > 0
                          ? 'text-amber-500'
                          : 'text-emerald-600 dark:text-emerald-400'
                      }`}
                    />
                    <span>
                      {!isBrowserOnline && cloudDiag.pendingSyncCount > 0
                        ? `يوجد ${cloudDiag.pendingSyncCount} عمليات بانتظار الإنترنت`
                        : isFlushingSync
                          ? 'جارٍ المزامنة السحابية الآن...'
                          : 'متصل ومؤمّن — جميع السجلات متزامنة'}
                    </span>
                  </div>
                  {cloudDiag.pendingSyncCount > 0 && isBrowserOnline && (
                    <button
                      type="button"
                      disabled={isFlushingSync}
                      onClick={() => {
                        const targetUid = ownerUid || auth.currentUser?.uid;
                        if (!targetUid) return;
                        setIsFlushingSync(true);
                        flushPendingSyncQueue(targetUid)
                          .catch(() => {})
                          .finally(() => {
                            setIsFlushingSync(false);
                            setDiagRefreshTick((t) => t + 1);
                          });
                      }}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-600 hover:bg-sky-500 text-white text-[10px] font-bold shrink-0"
                    >
                      <RefreshCw className={`w-3 h-3 ${isFlushingSync ? 'animate-spin' : ''}`} />
                      <span>مزامنة</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-3 space-y-1">
                <div className="text-slate-500 font-bold">تاريخ آخر نسخة احتياطية تم تصديرها</div>
                <div
                  className="font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100"
                  dir="ltr"
                >
                  {formattedLastBackupAt}
                </div>
              </div>
            </div>
          </section>

          {/* SECTION 2: Local Backup & Restore (JSON + Excel CSV) */}
          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
                <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
                  النسخ الاحتياطي المحلي
                </h2>
              </div>
              <span className="text-xs font-mono tabular-nums text-slate-500">
                {receipts.length} سند · {inventory.length} صنف · {expenses.length} مصروف
              </span>
            </div>

            <input
              ref={backupInputRef}
              type="file"
              accept="application/json"
              onChange={handleImportBackupFile}
              className="hidden"
            />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={handleExportBackup}
                className="w-full inline-flex items-center justify-center gap-2 py-3 px-3.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition-colors"
              >
                <Download className="w-4 h-4 shrink-0" />
                <span>تصدير نسخة احتياطية</span>
              </button>

              <button
                type="button"
                onClick={handleExportCsv}
                className="w-full inline-flex items-center justify-center gap-2 py-3 px-3.5 text-xs font-bold text-white bg-sky-600 hover:bg-sky-500 rounded-xl transition-colors"
              >
                <FileSpreadsheet className="w-4 h-4 shrink-0" />
                <span>تصدير ملف Excel</span>
              </button>

              <button
                type="button"
                onClick={() => backupInputRef.current?.click()}
                className="w-full inline-flex items-center justify-center gap-2 py-3 px-3.5 text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors"
              >
                <Upload className="w-4 h-4 shrink-0" />
                <span>استعادة نسخة احتياطية</span>
              </button>
            </div>
          </section>

          {/* SECTION 3: Automatic & Instant Telegram Cloud Backup */}
          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Send className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
                <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
                  النسخ الاحتياطي عبر تليجرام
                </h2>
              </div>
              <button
                type="button"
                onClick={handleSaveTelegramSettings}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-sky-600 hover:bg-sky-500 rounded-lg transition-colors"
              >
                <Save className="w-3.5 h-3.5" />
                <span>حفظ</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                  رمز البوت (Bot Token)
                </label>
                <div className="relative">
                  <input
                    type={showBotToken ? 'text' : 'password'}
                    dir="ltr"
                    value={currentTelegramConfig.botToken}
                    onChange={(e) => handleTelegramFieldChange('botToken', e.target.value)}
                    placeholder="1234567890:AAH_xxxxxxxxxxxxxxxxxxxxxxxx"
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 pl-3 pr-9 py-2 text-xs font-mono text-slate-900 dark:text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={() => setShowBotToken((s) => !s)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                    title={showBotToken ? 'إخفاء الرمز' : 'إظهار الرمز'}
                  >
                    {showBotToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                  معرّف القناة (Chat ID)
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={currentTelegramConfig.chatId}
                  onChange={(e) => handleTelegramFieldChange('chatId', e.target.value)}
                  placeholder="987654321"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-mono text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            <label className="flex items-center gap-2.5 cursor-pointer text-xs font-bold text-slate-700 dark:text-slate-300 pt-1">
              <input
                type="checkbox"
                checked={Boolean(currentTelegramConfig.autoBackupOnReceipt)}
                onChange={(e) =>
                  handleTelegramFieldChange('autoBackupOnReceipt', e.target.checked)
                }
                className="w-4 h-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
              />
              <span>نسخ تلقائي عند حفظ السندات</span>
            </label>

            <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <button
                type="button"
                disabled={isSendingTelegram}
                onClick={handleSendTelegramBackupNow}
                className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-xs font-black flex items-center justify-center gap-2 transition-colors"
              >
                {isSendingTelegram ? (
                  <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
                ) : (
                  <Send className="w-4 h-4 shrink-0" />
                )}
                <span>
                  {isSendingTelegram ? 'جاري الإرسال...' : 'إرسال لتليجرام الآن'}
                </span>
              </button>

              {currentTelegramConfig.lastBackupAt && (
                <div className="text-[11px] font-mono tabular-nums text-slate-500 text-center sm:text-left shrink-0">
                  آخر إرسال: {currentTelegramConfig.lastBackupAt.replace('T', ' ').slice(0, 16)}
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {/* TAB 5: DEVELOPER-ONLY AI MULTI-PROVIDER ARCHITECTURE & PER-CLINIC KEYS */}
      {subTab === 'ai' && isPlatformDev && (
        <div className="space-y-4">
          {/* Developer Per-Clinic Selector & Save Bar */}
          <section className="rounded-2xl border-2 border-amber-500/40 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                  <Crown className="w-4 h-4" />
                </div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-slate-100">
                    مفاتيح الذكاء الاصطناعي
                  </h2>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                    للمطور
                  </span>
                </div>
              </div>

                <button
                  type="button"
                  onClick={handleTestAllProvidersDynamic}
                  disabled={testingProvider !== null}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${testingProvider === 'all' ? 'animate-spin' : ''}`} />
                  <span>فحص ديناميكي شامل</span>
                </button>
              </div>

            {/* Target Clinic Picker for AI Keys */}
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 dark:bg-amber-950/20 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-black text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Building2 className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span>العيادة المستهدفة:</span>
                </label>
                <button
                  type="button"
                  onClick={loadDeveloperClinicsDirectory}
                  disabled={isLoadingDevClinics}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-600 dark:text-amber-400 hover:underline"
                >
                  <RefreshCw className={`w-3 h-3 ${isLoadingDevClinics ? 'animate-spin' : ''}`} />
                  <span>تحديث القائمة ({devClinicsList.length})</span>
                </button>
              </div>

              <select
                value={selectedDevClinicId}
                onChange={(e) => handleSelectDevClinicForAi(e.target.value)}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100"
              >
                {devClinicsList.length === 0 ? (
                  <option value={ownerUid || auth.currentUser?.uid || 'local_owner'}>
                    {formState.identity.clinicAr || 'العيادة الحالية'} — {ownerEmail || auth.currentUser?.email}
                  </option>
                ) : (
                  devClinicsList.map((clinic, idx) => {
                    const hasKeys = Boolean(
                      clinic.aiConfig?.geminiApiKey?.trim() ||
                        clinic.aiConfig?.groqApiKey?.trim() ||
                        clinic.aiConfig?.openrouterApiKey?.trim()
                    );
                    return (
                      <option key={clinic.id} value={clinic.id}>
                        {idx + 1}. {clinic.clinicAr} ({clinic.doctorAr || clinic.ownerEmail}){' '}
                        {hasKeys ? '— [مفعل ✓]' : ''}
                      </option>
                    );
                  })
                )}
              </select>
            </div>
          </section>

          {/* PROVIDER 1: Groq Cloud */}
          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-3.5">
            <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center font-black text-xs">
                  Q
                </div>
                <div>
                  <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                    <span>Groq Cloud</span>
                  </h3>
                  <a
                    href="https://console.groq.com/keys"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400 hover:underline"
                  >
                    <span>console.groq.com</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {testResults['groq'] && (
                  <span
                    className={`text-[11px] font-bold ${
                      testResults['groq'].ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'
                    }`}
                  >
                    {testResults['groq'].ok
                      ? `✓ نشط (${testResults['groq'].latencyMs}ms)`
                      : '✗ فشل'}
                  </span>
                )}
                <button
                  type="button"
                  disabled={testingProvider !== null}
                  onClick={() => handleTestProvider('groq')}
                  className="px-2.5 py-1 text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors flex items-center gap-1"
                >
                  {testingProvider === 'groq' ? (
                    <RefreshCw className="w-3 h-3 animate-spin" />
                  ) : (
                    <Key className="w-3 h-3" />
                  )}
                  <span>فحص</span>
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                  مفتاح Groq API
                </label>
                <div className="relative">
                  <input
                    type={showGroqKey ? 'text' : 'password'}
                    dir="ltr"
                    value={aiConfig.groqApiKey}
                    onChange={(e) => handleAiFieldChange('groqApiKey', e.target.value)}
                    placeholder="gsk_..."
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 pl-3 pr-9 py-2 text-xs font-mono text-slate-900 dark:text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={() => setShowGroqKey((s) => !s)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                    title={showGroqKey ? 'إخفاء' : 'إظهار'}
                  >
                    {showGroqKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                    نموذج النصوص
                  </label>
                  <select
                    value={aiConfig.groqTextModel}
                    onChange={(e) => handleAiFieldChange('groqTextModel', e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-2.5 py-2 text-xs font-bold text-slate-900 dark:text-slate-100"
                  >
                    {GROQ_TEXT_MODELS.map((m, idx) => (
                      <option key={m} value={m}>
                        {idx + 1}. {formatModelDisplayLabel(m)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                    نموذج الصور
                  </label>
                  <select
                    value={aiConfig.groqVisionModel}
                    onChange={(e) => handleAiFieldChange('groqVisionModel', e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-2.5 py-2 text-xs font-bold text-slate-900 dark:text-slate-100"
                  >
                    {GROQ_VISION_MODELS.map((m, idx) => (
                      <option key={m} value={m}>
                        {idx + 1}. {formatModelDisplayLabel(m)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                    نموذج الصوت
                  </label>
                  <select
                    value={aiConfig.groqWhisperModel}
                    onChange={(e) => handleAiFieldChange('groqWhisperModel', e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-2.5 py-2 text-xs font-bold text-slate-900 dark:text-slate-100"
                  >
                    {GROQ_WHISPER_MODELS.map((m, idx) => (
                      <option key={m} value={m}>
                        {idx + 1}. {formatModelDisplayLabel(m)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </section>

          {/* PROVIDER 2: Google Gemini */}
          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-3.5">
            <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center font-black text-xs">
                  G
                </div>
                <div>
                  <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                    <span>Google Gemini</span>
                  </h3>
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[10px] text-sky-600 dark:text-sky-400 hover:underline"
                  >
                    <span>Google AI Studio</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {testResults['gemini'] && (
                  <span
                    className={`text-[11px] font-bold ${
                      testResults['gemini'].ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'
                    }`}
                  >
                    {testResults['gemini'].ok
                      ? `✓ نشط (${testResults['gemini'].latencyMs}ms)`
                      : '✗ فشل'}
                  </span>
                )}
                <button
                  type="button"
                  disabled={testingProvider !== null}
                  onClick={() => handleTestProvider('gemini')}
                  className="px-2.5 py-1 text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors flex items-center gap-1"
                >
                  {testingProvider === 'gemini' ? (
                    <RefreshCw className="w-3 h-3 animate-spin" />
                  ) : (
                    <Key className="w-3 h-3" />
                  )}
                  <span>فحص</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                  مفتاح Gemini API
                </label>
                <div className="relative">
                  <input
                    type={showGeminiKey ? 'text' : 'password'}
                    dir="ltr"
                    value={aiConfig.geminiApiKey}
                    onChange={(e) => handleAiFieldChange('geminiApiKey', e.target.value)}
                    placeholder="AIzaSy..."
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 pl-3 pr-9 py-2 text-xs font-mono text-slate-900 dark:text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={() => setShowGeminiKey((s) => !s)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                    title={showGeminiKey ? 'إخفاء' : 'إظهار'}
                  >
                    {showGeminiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                  نموذج النصوص
                </label>
                <select
                  value={aiConfig.geminiModel}
                  onChange={(e) => handleAiFieldChange('geminiModel', e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-2.5 py-2 text-xs font-bold text-slate-900 dark:text-slate-100"
                >
                  {GEMINI_CANDIDATE_MODELS.map((m, idx) => (
                    <option key={m} value={m}>
                      {idx + 1}. {formatModelDisplayLabel(m)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                  نموذج الصور
                </label>
                <select
                  value={aiConfig.geminiVisionModel || 'gemini-2.5-flash'}
                  onChange={(e) => handleAiFieldChange('geminiVisionModel', e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-2.5 py-2 text-xs font-bold text-slate-900 dark:text-slate-100"
                >
                  {GEMINI_VISION_MODELS.map((m, idx) => (
                    <option key={m} value={m}>
                      {idx + 1}. {formatModelDisplayLabel(m)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700 dark:text-slate-300 pt-1">
              <input
                type="checkbox"
                checked={aiConfig.enableWebGrounding}
                onChange={(e) => handleAiFieldChange('enableWebGrounding', e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
              />
              <span className="flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                <span>البحث عبر الويب</span>
              </span>
            </label>
          </section>

          {/* PROVIDER 3: OpenRouter */}
          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-3.5">
            <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center font-black text-xs">
                  OR
                </div>
                <div>
                  <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                    <span>OpenRouter</span>
                  </h3>
                  <a
                    href="https://openrouter.ai/keys"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[10px] text-purple-600 dark:text-purple-400 hover:underline"
                  >
                    <span>openrouter.ai</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {testResults['openrouter'] && (
                  <span
                    className={`text-[11px] font-bold ${
                      testResults['openrouter'].ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'
                    }`}
                  >
                    {testResults['openrouter'].ok
                      ? `✓ نشط (${testResults['openrouter'].latencyMs}ms)`
                      : '✗ فشل'}
                  </span>
                )}
                <button
                  type="button"
                  disabled={testingProvider !== null}
                  onClick={() => handleTestProvider('openrouter')}
                  className="px-2.5 py-1 text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors flex items-center gap-1"
                >
                  {testingProvider === 'openrouter' ? (
                    <RefreshCw className="w-3 h-3 animate-spin" />
                  ) : (
                    <Key className="w-3 h-3" />
                  )}
                  <span>فحص</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                  مفتاح OpenRouter API
                </label>
                <div className="relative">
                  <input
                    type={showOpenRouterKey ? 'text' : 'password'}
                    dir="ltr"
                    value={aiConfig.openrouterApiKey}
                    onChange={(e) => handleAiFieldChange('openrouterApiKey', e.target.value)}
                    placeholder="sk-or-v1-..."
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 pl-3 pr-9 py-2 text-xs font-mono text-slate-900 dark:text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={() => setShowOpenRouterKey((s) => !s)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                    title={showOpenRouterKey ? 'إخفاء' : 'إظهار'}
                  >
                    {showOpenRouterKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                  نموذج النصوص
                </label>
                <select
                  value={aiConfig.openrouterModel}
                  onChange={(e) => handleAiFieldChange('openrouterModel', e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-2.5 py-2 text-xs font-bold text-slate-900 dark:text-slate-100"
                >
                  {OPENROUTER_MODELS.map((m, idx) => (
                    <option key={m} value={m}>
                      {idx + 1}. {formatModelDisplayLabel(m)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                  نموذج الصور
                </label>
                <select
                  value={aiConfig.openrouterVisionModel || 'google/gemini-2.5-flash'}
                  onChange={(e) => handleAiFieldChange('openrouterVisionModel', e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-2.5 py-2 text-xs font-bold text-slate-900 dark:text-slate-100"
                >
                  {OPENROUTER_VISION_MODELS.map((m, idx) => (
                    <option key={m} value={m}>
                      {idx + 1}. {formatModelDisplayLabel(m)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {/* SECTION 4: Dedicated Audio Reading (TTS) & Direct Data Entry Models */}
          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-200 dark:border-slate-800">
              <Cpu className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">
                نماذج الإدخال والصوت
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                  نموذج الإدخال المباشر
                </label>
                <select
                  value={aiConfig.dataEntryModel || 'openai/gpt-oss-120b'}
                  onChange={(e) => handleAiFieldChange('dataEntryModel', e.target.value)}
                  className="w-full rounded-lg border border-emerald-500/40 bg-emerald-500/5 dark:bg-slate-950 px-3 py-2 text-xs font-bold text-slate-900 dark:text-slate-100"
                >
                  {DIRECT_DATA_ENTRY_MODELS.map((m, idx) => (
                    <option key={m} value={m}>
                      {idx + 1}. {formatModelDisplayLabel(m)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                  نموذج قراءة الردود
                </label>
                <select
                  value={aiConfig.ttsModel || 'canopylabs/orpheus-arabic-saudi'}
                  onChange={(e) => handleAiFieldChange('ttsModel', e.target.value)}
                  className="w-full rounded-lg border border-sky-500/40 bg-sky-500/5 dark:bg-slate-950 px-3 py-2 text-xs font-bold text-slate-900 dark:text-slate-100"
                >
                  {AI_TTS_MODELS.map((m, idx) => (
                    <option key={m} value={m}>
                      {idx + 1}. {formatModelDisplayLabel(m)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <label
                className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center gap-2.5 ${
                  aiConfig.sttEngine === 'groq'
                    ? 'border-amber-500 bg-amber-500/5 dark:bg-amber-950/40'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40'
                }`}
              >
                <input
                  type="radio"
                  name="sttEngine"
                  checked={aiConfig.sttEngine === 'groq'}
                  onChange={() => handleAiFieldChange('sttEngine', 'groq')}
                  className="text-amber-600"
                />
                <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                  تفريغ Groq Whisper
                </span>
              </label>

              <label
                className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center gap-2.5 ${
                  aiConfig.sttEngine === 'browser'
                    ? 'border-sky-500 bg-sky-500/5 dark:bg-sky-950/40'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40'
                }`}
              >
                <input
                  type="radio"
                  name="sttEngine"
                  checked={aiConfig.sttEngine === 'browser'}
                  onChange={() => handleAiFieldChange('sttEngine', 'browser')}
                  className="text-sky-600"
                />
                <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                  إملاء المتصفح
                </span>
              </label>
            </div>
          </section>

          {/* Single Action Bar for Selected Clinic or All Clinics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <button
              type="button"
              disabled={isSavingClinicAi}
              onClick={handleSaveAiSettings}
              className="w-full py-3 px-4 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-black flex items-center justify-center gap-2 shadow-sm transition-colors"
            >
              {isSavingClinicAi ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              <span>حفظ للعيادة المحددة</span>
            </button>

            <button
              type="button"
              disabled={isApplyingAiToAll}
              onClick={handleApplyAiSettingsToAllClinics}
              className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-black flex items-center justify-center gap-2 shadow-sm transition-colors"
            >
              {isApplyingAiToAll ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              <span>تعميم لجميع العيادات ({devClinicsList.length || 1})</span>
            </button>
          </div>
        </div>
      )}
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
                إضافة خدمة
              </h3>
              <button
                type="button"
                onClick={() => setIsAddServiceModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                aria-label="إغلاق"
              >
                <X className="w-4 h-4" />
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
                placeholder="زراعة أسنان"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                السعر ({formState.identity.defaultCurrency})
              </label>
              <SmartNumberInput
                min={0}
                placeholder="0"
                value={newSrvPrice}
                onValueChange={(val) => setNewSrvPrice(val)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm font-mono tabular-nums font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                كلمات مفتاحية
              </label>
              <input
                type="text"
                value={newSrvKeywords}
                onChange={(e) => setNewSrvKeywords(e.target.value)}
                placeholder="زراعة، زرعة"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs"
              />
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

      {/* Modal: Dynamic Service Materials Recipe Configurator (Clinic & Lab & Sessions) */}
      {recipeModalServiceId && (() => {
        const currentService = formState.services.find((s) => s.id === recipeModalServiceId);
        const totalSessions = Math.max(1, editingServiceTotalSessions || 1);

        // Compute Grand Total Summary for each material across all sessions
        const materialSummaryMap = new Map<
          string,
          {
            material: InventoryItem;
            isLab: boolean;
            unit: string;
            fixedTotal: number;
            anteriorTotal: number;
            molarTotal: number;
            types: Set<MaterialConsumptionType>;
            sessionBreakdown: string[];
          }
        >();

        editingRecipeRules.forEach((rule) => {
          if (!rule.materialId) return;
          const mat = inventory.find((i) => i.id === rule.materialId);
          if (!mat) return;

          let entry = materialSummaryMap.get(rule.materialId);
          if (!entry) {
            entry = {
              material: mat,
              isLab: mat.location === 'lab',
              unit: mat.usageUnit?.trim() || mat.unit?.trim() || 'قطعة',
              fixedTotal: 0,
              anteriorTotal: 0,
              molarTotal: 0,
              types: new Set<MaterialConsumptionType>(),
              sessionBreakdown: [],
            };
            materialSummaryMap.set(rule.materialId, entry);
          }

          entry.types.add(rule.consumptionType);
          const ruleSessionsMultiplier =
            rule.sessionNumber === 'all' || !rule.sessionNumber ? totalSessions : 1;

          if (rule.consumptionType === 'by_tooth_type') {
            const ant = +((rule.qtyAnterior ?? 1) * ruleSessionsMultiplier).toFixed(4);
            const mol = +((rule.qtyMolar ?? 1.5) * ruleSessionsMultiplier).toFixed(4);
            entry.anteriorTotal = +(entry.anteriorTotal + ant).toFixed(4);
            entry.molarTotal = +(entry.molarTotal + mol).toFixed(4);
            entry.sessionBreakdown.push(
              rule.sessionNumber === 'all' || !rule.sessionNumber
                ? `كل الجلسات (${totalSessions}): ${ant} أمامي / ${mol} ضرس`
                : `الجلسة ${rule.sessionNumber}: ${rule.qtyAnterior ?? 1} أمامي / ${rule.qtyMolar ?? 1.5} ضرس`
            );
          } else {
            const qty = +((rule.qtyFixed ?? 1) * ruleSessionsMultiplier).toFixed(4);
            entry.fixedTotal = +(entry.fixedTotal + qty).toFixed(4);
            const typeLabel =
              rule.consumptionType === 'per_session'
                ? 'جلسات'
                : rule.consumptionType === 'per_tooth_unit'
                  ? 'لكل سن'
                  : 'لكل فك';
            entry.sessionBreakdown.push(
              rule.sessionNumber === 'all' || !rule.sessionNumber
                ? `كل الجلسات (${totalSessions}): ${qty} ${entry.unit} (${typeLabel})`
                : `الجلسة ${rule.sessionNumber}: ${rule.qtyFixed ?? 1} ${entry.unit} (${typeLabel})`
            );
          }
        });

        const grandTotalsList = Array.from(materialSummaryMap.values());

        // Filter displayed rules according to activeSessionFilter
        const visibleRules = editingRecipeRules
          .map((rule, origIndex) => ({ rule, origIndex }))
          .filter(({ rule }) => {
            if (activeSessionFilter === 'all') return true;
            return rule.sessionNumber === 'all' || rule.sessionNumber === activeSessionFilter;
          });

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-3 sm:p-4"
            onClick={() => setRecipeModalServiceId(null)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-3xl max-h-[92vh] flex flex-col rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-200 dark:border-slate-800 shrink-0 bg-slate-50/60 dark:bg-slate-950/40">
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <span>إعداد المواد وجلسات الخدمة (العيادة والمعمل)</span>
                  </h3>
                  <p className="text-xs text-sky-600 dark:text-sky-400 font-bold mt-0.5">
                    الخدمة: {currentService?.name || ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setRecipeModalServiceId(null)}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  aria-label="إغلاق"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* 1. Total Sessions Selector */}
                <div className="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/50 dark:bg-amber-950/20 p-3.5 space-y-2.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div>
                      <div className="text-xs font-bold text-amber-950 dark:text-amber-200 flex items-center gap-1.5">
                        <span>عدد جلسات الخدمة الإجمالية (خطة العلاج)</span>
                      </div>
                      <p className="text-[11px] text-amber-800/80 dark:text-amber-300/80 mt-0.5">
                        حدد عدد الجلسات لحساب الإجمالي الكلي لمواد الخدمة وخصمها دفعة واحدة في السند الأول للمريض
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <div className="relative min-w-[160px]">
                        <select
                          value={editingServiceTotalSessions}
                          onChange={(e) =>
                            setEditingServiceTotalSessions(Math.max(1, Number(e.target.value) || 1))
                          }
                          aria-label="عدد جلسات الخدمة"
                          className="w-full appearance-none rounded-xl border border-amber-300 dark:border-amber-800 bg-white dark:bg-slate-900 px-3 py-2 pl-8 text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:border-amber-500"
                        >
                          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((count) => (
                            <option key={count} value={count}>
                              {count === 1
                                ? 'جلسة واحدة (1)'
                                : count === 2
                                  ? 'جلستان (2)'
                                  : `${count} جلسات`}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="w-4 h-4 text-amber-600 dark:text-amber-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. Session Filter Dropdown & Add Material Button */}
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-slate-800">
                  <div className="relative min-w-[210px] flex-1 sm:flex-initial">
                    <select
                      value={activeSessionFilter === 'all' ? 'all' : String(activeSessionFilter)}
                      onChange={(e) => {
                        const val = e.target.value;
                        setActiveSessionFilter(val === 'all' ? 'all' : Number(val));
                      }}
                      aria-label="تصفية الجلسات"
                      className="w-full appearance-none rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-3 py-2 pl-8 text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:border-sky-500"
                    >
                      <option value="all">
                        عرض المواد: الكل ({editingRecipeRules.length} مادة)
                      </option>
                      {Array.from({ length: totalSessions }, (_, i) => i + 1).map((sNum) => {
                        const countInSession = editingRecipeRules.filter(
                          (r) => r.sessionNumber === 'all' || r.sessionNumber === sNum
                        ).length;
                        return (
                          <option key={sNum} value={sNum}>
                            مواد الجلسة {sNum} ({countInSession})
                          </option>
                        );
                      })}
                    </select>
                    <ChevronDown className="w-4 h-4 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>

                  <button
                    type="button"
                    onClick={handleAddMaterialRuleRow}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white transition-colors shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                    <span>إضافة مادة للخدمة</span>
                  </button>
                </div>

                {/* 3. Materials Rules List */}
                {editingRecipeRules.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-6 text-center space-y-2">
                    <div className="text-xs font-bold text-slate-500 dark:text-slate-400">
                      لا توجد مواد مربوطة بهذه الخدمة حالياً
                    </div>
                    <button
                      type="button"
                      onClick={handleAddMaterialRuleRow}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      <span>+ ربط مادة من المخزون</span>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {visibleRules.map(({ rule, origIndex }) => {
                      const selectedItem = inventory.find((i) => i.id === rule.materialId);
                      const unitLabel =
                        selectedItem?.usageUnit?.trim() || selectedItem?.unit?.trim() || 'قطعة';
                      const isLab = selectedItem?.location === 'lab';

                      return (
                        <div
                          key={`${rule.materialId}_${origIndex}`}
                          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-3.5 space-y-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                              {/* Material Selector */}
                              <div>
                                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                                  المادة من المخزون (عيادة / معمل)
                                </label>
                                <select
                                  value={rule.materialId}
                                  onChange={(e) =>
                                    handleUpdateMaterialRuleRow(origIndex, {
                                      materialId: e.target.value,
                                    })
                                  }
                                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-2 text-xs font-bold"
                                >
                                  {inventory.map((inv) => (
                                    <option key={inv.id} value={inv.id}>
                                      [{inv.location === 'lab' ? 'معمل' : 'عيادة'}] {inv.name} (
                                      {inv.usageUnit?.trim() || inv.unit?.trim() || 'قطعة'})
                                    </option>
                                  ))}
                                </select>
                              </div>

                              {/* Session Assignment Selector */}
                              <div>
                                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                                  توزيع الجلسة المستهلكة
                                </label>
                                <select
                                  value={rule.sessionNumber ?? 'all'}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    handleUpdateMaterialRuleRow(origIndex, {
                                      sessionNumber: val === 'all' ? 'all' : Number(val),
                                    });
                                  }}
                                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-2 text-xs font-bold text-sky-700 dark:text-sky-300"
                                >
                                  <option value="all">تتكرر في كل جلسة (كل الجلسات)</option>
                                  {Array.from({ length: totalSessions }, (_, i) => i + 1).map((sNum) => (
                                    <option key={sNum} value={sNum}>
                                      الجلسة {sNum} فقط
                                    </option>
                                  ))}
                                </select>
                              </div>

                              {/* Consumption Mode Selector */}
                              <div>
                                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                                  طريقة حساب الخصم
                                </label>
                                <select
                                  value={rule.consumptionType}
                                  onChange={(e) =>
                                    handleUpdateMaterialRuleRow(origIndex, {
                                      consumptionType: e.target.value as MaterialConsumptionType,
                                    })
                                  }
                                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-2 text-xs font-bold"
                                >
                                  <option value="per_session">ثابت للجلسة (مرة واحدة)</option>
                                  <option value="by_tooth_type">حسب نوع السن (أمامي / ضرس)</option>
                                  <option value="per_tooth_unit">لكل سن / وحدة معملية</option>
                                  <option value="per_arch">لكل فك (طبعة / موديل معمل)</option>
                                </select>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleRemoveMaterialRuleRow(origIndex)}
                              className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg shrink-0 mt-5"
                              title="حذف المادة من الوصفة"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>

                          {/* Dynamic Quantity Inputs */}
                          {rule.consumptionType === 'by_tooth_type' ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                              <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5">
                                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                                  للسن الأمامي (1، 2، 3) — ({unitLabel})
                                </label>
                                <div className="flex items-center gap-2">
                                  <SmartNumberInput
                                    min={0}
                                    placeholder="0"
                                    value={rule.qtyAnterior}
                                    onValueChange={(val) =>
                                      handleUpdateMaterialRuleRow(origIndex, {
                                        qtyAnterior: Math.max(0, val),
                                      })
                                    }
                                    className="flex-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 text-xs font-mono font-bold"
                                  />
                                  <span className="text-xs font-bold text-sky-700 dark:text-sky-300 shrink-0">
                                    {unitLabel}
                                  </span>
                                </div>
                              </div>

                              <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5">
                                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                                  للضرس الخلفي (4 إلى 8) — ({unitLabel})
                                </label>
                                <div className="flex items-center gap-2">
                                  <SmartNumberInput
                                    min={0}
                                    placeholder="0"
                                    value={rule.qtyMolar}
                                    onValueChange={(val) =>
                                      handleUpdateMaterialRuleRow(origIndex, {
                                        qtyMolar: Math.max(0, val),
                                      })
                                    }
                                    className="flex-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 text-xs font-mono font-bold"
                                  />
                                  <span className="text-xs font-bold text-sky-700 dark:text-sky-300 shrink-0">
                                    {unitLabel}
                                  </span>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5">
                              <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                                {rule.consumptionType === 'per_session'
                                  ? `الكمية للجلسة الواحدة (${unitLabel})`
                                  : rule.consumptionType === 'per_tooth_unit'
                                    ? `الكمية لكل سن / وحدة معملية (${unitLabel})`
                                    : `الكمية لكل فك متأثر (${unitLabel})`}
                              </label>
                              <div className="flex items-center gap-2">
                                <SmartNumberInput
                                  min={0}
                                  placeholder="0"
                                  value={rule.qtyFixed}
                                  onValueChange={(val) =>
                                    handleUpdateMaterialRuleRow(origIndex, {
                                      qtyFixed: Math.max(0, val),
                                    })
                                  }
                                  className="flex-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 text-xs font-mono font-bold"
                                />
                                <span
                                  className={`px-2.5 py-1 rounded-md text-xs font-bold shrink-0 ${
                                    isLab
                                      ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300'
                                      : 'bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300'
                                  }`}
                                >
                                  {unitLabel} ({isLab ? 'مخزن المعمل' : 'مخزن العيادة'})
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    <button
                      type="button"
                      onClick={handleAddMaterialRuleRow}
                      className="w-full py-2.5 rounded-xl border border-dashed border-sky-400 dark:border-sky-700 text-xs font-bold text-sky-700 dark:text-sky-300 hover:bg-sky-50/50 dark:hover:bg-sky-950/30 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Plus className="w-4 h-4" />
                      <span>+ ربط مادة جديدة من المخزون</span>
                    </button>
                  </div>
                )}

                {/* 4. Live Grand Total Across All Sessions Summary Card */}
                {grandTotalsList.length > 0 && (
                  <div className="rounded-xl border border-emerald-300 dark:border-emerald-800/80 bg-emerald-50/60 dark:bg-emerald-950/30 p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-bold text-emerald-950 dark:text-emerald-200 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>الإجمالي الكلي لمواد الخدمة عبر جميع جلساتها ({totalSessions} جلسات)</span>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-600 text-white">
                        {grandTotalsList.length} مواد محسوبة
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {grandTotalsList.map((entry, idx) => (
                        <div
                          key={`summary_${entry.material.id}_${idx}`}
                          className="rounded-lg border border-emerald-200 dark:border-emerald-800/60 bg-white/80 dark:bg-slate-900/80 p-2.5 text-xs flex items-center justify-between gap-2"
                        >
                          <div>
                            <div className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                              <span
                                className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${
                                  entry.isLab
                                    ? 'bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300'
                                    : 'bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300'
                                }`}
                              >
                                {entry.isLab ? 'معمل' : 'عيادة'}
                              </span>
                              <span>{entry.material.name}</span>
                            </div>
                            <div className="text-[10px] text-slate-500 mt-0.5">
                              {entry.sessionBreakdown.join(' + ')}
                            </div>
                          </div>

                          <div className="text-left font-mono font-bold text-emerald-700 dark:text-emerald-300 text-xs shrink-0">
                            {entry.anteriorTotal > 0 || entry.molarTotal > 0 ? (
                              <span>
                                {entry.anteriorTotal} أمامي / {entry.molarTotal} ضرس ({entry.unit})
                              </span>
                            ) : (
                              <span>
                                {entry.fixedTotal} {entry.unit}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    <p className="text-[11px] text-emerald-800/80 dark:text-emerald-300/80 leading-relaxed pt-1">
                      💡 <strong>قاعدة الخصم الحاسمة:</strong> يتم خصم هذا الإجمالي الكلي دفعة واحدة عند إصدار أول سند للمريض يتضمن هذه الخدمة، ولا يتم تكرار الخصم في سندات الأقساط أو الدفعات اللاحقة.
                    </p>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="p-3.5 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2 shrink-0 bg-slate-50/60 dark:bg-slate-950/40">
                <button
                  type="button"
                  onClick={handleSaveServiceRecipe}
                  className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 transition-colors flex items-center justify-center gap-1.5 shadow-xs"
                >
                  <Save className="w-4 h-4" />
                  <span>حفظ وصفة المواد وجلسات الخدمة</span>
                </button>
                <button
                  type="button"
                  onClick={() => setRecipeModalServiceId(null)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
