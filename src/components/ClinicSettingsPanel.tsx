import React, { useRef, useState } from 'react';
import {
  Building2,
  CheckCircle2,
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
  ReceiptRecord,
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
      {/* Top Segmented Switcher (الهوية | الخدمات | الفريق | النسخ | [للمطور فقط: الذكاء AI]) */}
      <div
        className={`grid grid-cols-2 ${
          isPlatformDev ? 'sm:grid-cols-5' : 'sm:grid-cols-4'
        } gap-1 p-1 rounded-xl bg-slate-200/70 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] sm:text-xs`}
      >
        <button
          type="button"
          onClick={() => {
            setSubTab('identity');
            try { localStorage.setItem('docai_settings_subtab_v1', 'identity'); } catch {}
          }}
          className={`py-2 px-1 sm:px-2 rounded-lg font-bold transition-colors truncate ${
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
          className={`py-2 px-1 sm:px-2 rounded-lg font-bold transition-colors truncate ${
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
          className={`py-2 px-1 sm:px-2 rounded-lg font-bold transition-colors truncate ${
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
          className={`py-2 px-1 sm:px-2 rounded-lg font-bold transition-colors truncate ${
            subTab === 'backup'
              ? 'bg-sky-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          النسخ
        </button>
        {isPlatformDev && (
          <button
            type="button"
            onClick={() => {
              setSubTab('ai');
              try { localStorage.setItem('docai_settings_subtab_v1', 'ai'); } catch {}
            }}
            className={`col-span-2 sm:col-span-1 py-2 px-1 sm:px-2 rounded-lg font-bold transition-colors truncate flex items-center justify-center gap-1 ${
              subTab === 'ai'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 shrink-0" />
            <span>الذكاء</span>
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
    </div>
  );
};
