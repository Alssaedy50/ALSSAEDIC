/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Bot,
  Cloud,
  FileSpreadsheet,
  FileText,
  Menu,
  Moon,
  Package,
  Settings,
  Sun,
  Wallet,
  X,
} from 'lucide-react';
import {
  ChatMessage,
  ClinicSettings,
  ExpenseRecord,
  InventoryItem,
  ReceiptRecord,
} from './types/clinic';
import {
  DEFAULT_EXPENSES,
  DEFAULT_INVENTORY,
  DEFAULT_RECEIPTS,
  DEFAULT_SETTINGS,
} from './data/defaultData';
import { numberToArabicWords } from './utils/arabicTafqeet';
import { safeParseJsonResponse } from './utils/aiClient';
import { ReceiptStudio } from './components/ReceiptStudio';
import { RecordsLedger } from './components/RecordsLedger';
import { InventoryManager } from './components/InventoryManager';
import { FinanceDashboard } from './components/FinanceDashboard';
import { GeminiAssistant } from './components/GeminiAssistant';
import { ClinicSettingsPanel } from './components/ClinicSettingsPanel';
import { CloudAccountModal, DirectClinicSession } from './components/CloudAccountModal';
import { OfflineIndicator, PWAInstallButton } from './components/PWAInstallButton';
import {
  User,
  auth,
  deleteExpenseFromCloud,
  deleteInventoryItemFromCloud,
  deleteReceiptFromCloud,
  ensureClinicDocumentInCloud,
  onAuthStateChanged,
  saveClinicSettingsToCloud,
  saveExpenseToCloud,
  saveInventoryItemToCloud,
  saveReceiptToCloud,
  saveServiceToCloud,
  signInWithGoogleAccount,
  signOutAccount,
  subscribeToClinicCloudData,
  syncLocalDataToCloud,
} from './firebase';

export type MainSectionId =
  | 'receipt'
  | 'records'
  | 'inventory'
  | 'finance'
  | 'assistant'
  | 'settings';

interface NavSectionItem {
  id: MainSectionId;
  title: string; // Strictly 1-2 words, zero duplication
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
}

const STORAGE_KEYS = {
  SETTINGS: 'docai_gemini_settings_v3',
  RECEIPTS: 'docai_gemini_receipts_v3',
  INVENTORY: 'docai_gemini_inventory_v3',
  EXPENSES: 'docai_gemini_expenses_v3',
  THEME: 'docai_theme_mode_v1',
  DIRECT_CLOUD_SESSION: 'docai_direct_cloud_session_v1',
};

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export default function App() {
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.THEME);
    return saved ? saved === 'dark' : true;
  });

  const [activeSection, setActiveSection] = useState<MainSectionId>('receipt');
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [isCloudModalOpen, setIsCloudModalOpen] = useState<boolean>(false);

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [directSession, setDirectSession] = useState<DirectClinicSession | null>(() =>
    loadFromStorage<DirectClinicSession | null>(STORAGE_KEYS.DIRECT_CLOUD_SESSION, null)
  );
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [isSyncingCloud, setIsSyncingCloud] = useState<boolean>(false);
  const lastDirectSyncTimestamp = useRef<string>('');

  const [settings, setSettings] = useState<ClinicSettings>(() =>
    loadFromStorage<ClinicSettings>(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS)
  );
  const [receipts, setReceipts] = useState<ReceiptRecord[]>(() =>
    loadFromStorage<ReceiptRecord[]>(STORAGE_KEYS.RECEIPTS, DEFAULT_RECEIPTS)
  );
  const [inventory, setInventory] = useState<InventoryItem[]>(() =>
    loadFromStorage<InventoryItem[]>(STORAGE_KEYS.INVENTORY, DEFAULT_INVENTORY)
  );
  const [expenses, setExpenses] = useState<ExpenseRecord[]>(() =>
    loadFromStorage<ExpenseRecord[]>(STORAGE_KEYS.EXPENSES, DEFAULT_EXPENSES)
  );
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [editingReceipt, setEditingReceipt] = useState<ReceiptRecord | null>(null);

  const [toast, setToast] = useState<{
    id: number;
    message: string;
    type: 'success' | 'warning' | 'error' | 'info';
  } | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem(STORAGE_KEYS.THEME, darkMode ? 'dark' : 'light');
  }, [darkMode]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.RECEIPTS, JSON.stringify(receipts));
  }, [receipts]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.INVENTORY, JSON.stringify(inventory));
  }, [inventory]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.EXPENSES, JSON.stringify(expenses));
  }, [expenses]);

  useEffect(() => {
    if (directSession) {
      localStorage.setItem(STORAGE_KEYS.DIRECT_CLOUD_SESSION, JSON.stringify(directSession));
    } else {
      localStorage.removeItem(STORAGE_KEYS.DIRECT_CLOUD_SESSION);
    }
  }, [directSession]);

  const notify = (
    message: string,
    type: 'success' | 'warning' | 'error' | 'info' = 'info'
  ) => {
    setToast({ id: Date.now(), message, type });
  };

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(timer);
  }, [toast]);

  // Helper to push current state to Direct Cloud Workspace
  const pushToDirectCloud = async (
    session: DirectClinicSession,
    nextSettings: ClinicSettings,
    nextReceipts: ReceiptRecord[],
    nextInventory: InventoryItem[],
    nextExpenses: ExpenseRecord[]
  ) => {
    try {
      const res = await fetch('/api/cloud/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinicId: session.clinicId,
          password: session.password,
          data: {
            settings: nextSettings,
            receipts: nextReceipts,
            inventory: nextInventory,
            expenses: nextExpenses,
          },
        }),
      });
      const parsed = await safeParseJsonResponse<{ updatedAt?: string }>(res);
      if (parsed.ok && parsed.data?.updatedAt) {
        lastDirectSyncTimestamp.current = parsed.data.updatedAt;
      }
    } catch {
      // Offline or transient network error; will sync next time
    }
  };

  // Poll Direct Cloud Workspace every 8 seconds so multiple phones stay in sync automatically
  useEffect(() => {
    if (!directSession) return;

    const pullLatest = async () => {
      try {
        const res = await fetch('/api/cloud/pull', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clinicId: directSession.clinicId,
            password: directSession.password,
          }),
        });
        const parsed = await safeParseJsonResponse<{
          ok?: boolean;
          updatedAt?: string;
          data?: {
            settings?: ClinicSettings;
            receipts?: ReceiptRecord[];
            inventory?: InventoryItem[];
            expenses?: ExpenseRecord[];
          };
        }>(res);
        if (!parsed.ok || !parsed.data) return;
        const json = parsed.data;
        if (
          json.ok &&
          json.updatedAt &&
          json.updatedAt !== lastDirectSyncTimestamp.current &&
          json.data
        ) {
          lastDirectSyncTimestamp.current = json.updatedAt;
          if (json.data.settings) setSettings(json.data.settings as ClinicSettings);
          if (Array.isArray(json.data.receipts)) {
            setReceipts(json.data.receipts as ReceiptRecord[]);
          }
          if (Array.isArray(json.data.inventory)) {
            setInventory(json.data.inventory as InventoryItem[]);
          }
          if (Array.isArray(json.data.expenses)) {
            setExpenses(json.data.expenses as ExpenseRecord[]);
          }
        }
      } catch {
        // Ignore network errors while offline
      }
    };

    pullLatest();
    const interval = setInterval(pullLatest, 8000);
    return () => clearInterval(interval);
  }, [directSession]);

  // Firebase Auth & Real-Time Multi-Phone Cloud Sync
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      setAuthReady(true);

      if (user) {
        setIsSyncingCloud(true);
        try {
          await syncLocalDataToCloud(
            user.uid,
            settings,
            receipts,
            inventory,
            expenses,
            false
          );
        } catch (err) {
          console.error('Initial cloud sync warning:', err);
        } finally {
          setIsSyncingCloud(false);
        }
      }
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!authReady || !currentUser) return;

    const unsubCloud = subscribeToClinicCloudData(currentUser.uid, {
      onSettingsUpdate: (partial) => {
        setSettings((prev) => ({
          ...prev,
          identity: partial.identity,
          appearance: {
            ...partial.appearance,
            customLogoDataUrl:
              partial.appearance.customLogoDataUrl || prev.appearance.customLogoDataUrl,
          },
          features: partial.features,
        }));
      },
      onServicesUpdate: (cloudServices) => {
        if (cloudServices.length > 0) {
          setSettings((prev) => ({
            ...prev,
            services: cloudServices,
          }));
        }
      },
      onReceiptsUpdate: (cloudReceipts) => {
        if (cloudReceipts.length > 0) {
          setReceipts(cloudReceipts);
        }
      },
      onInventoryUpdate: (cloudInventory) => {
        if (cloudInventory.length > 0) {
          setInventory(cloudInventory);
        }
      },
      onExpensesUpdate: (cloudExpenses) => {
        if (cloudExpenses.length > 0) {
          setExpenses(cloudExpenses);
        }
      },
    });

    return () => unsubCloud();
  }, [authReady, currentUser]);

  // Support Android/Browser Back Button so the user can always return to the main screen
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      if (isCloudModalOpen) {
        setIsCloudModalOpen(false);
        return;
      }
      if (isDrawerOpen) {
        setIsDrawerOpen(false);
        return;
      }
      const targetSection = (e.state?.section as MainSectionId) || 'receipt';
      setActiveSection(targetSection);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isDrawerOpen, isCloudModalOpen]);

  const navigateToSection = (sectionId: MainSectionId) => {
    if (sectionId !== activeSection) {
      window.history.pushState({ section: sectionId }, '', `#${sectionId}`);
      setActiveSection(sectionId);
    }
    setIsDrawerOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDirectClinicLogin = async (
    clinicId: string,
    password: string
  ): Promise<boolean> => {
    setIsSyncingCloud(true);
    try {
      const res = await fetch('/api/cloud/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinicId,
          password,
          initialData: {
            settings,
            receipts,
            inventory,
            expenses,
          },
        }),
      });
      const parsed = await safeParseJsonResponse<{
        status?: string;
        clinicId?: string;
        updatedAt?: string;
        error?: string;
        data?: {
          settings?: ClinicSettings;
          receipts?: ReceiptRecord[];
          inventory?: InventoryItem[];
          expenses?: ExpenseRecord[];
        };
      }>(res);

      if (!parsed.data) {
        const cleanId = clinicId.trim().toLowerCase().replace(/\s+/g, '-');
        const fallbackSession: DirectClinicSession = {
          clinicId: cleanId,
          password,
          updatedAt: new Date().toISOString(),
        };
        setDirectSession(fallbackSession);
        notify(`تم تفعيل حساب العيادة (${cleanId}) بنجاح`, 'success');
        return true;
      }

      const json = parsed.data;
      if (!parsed.ok) {
        notify(json.error || 'تعذر تسجيل الدخول لحساب العيادة', 'error');
        return false;
      }

      const sessionObj: DirectClinicSession = {
        clinicId: json.clinicId || clinicId.trim().toLowerCase(),
        password,
        updatedAt: json.updatedAt || new Date().toISOString(),
      };
      lastDirectSyncTimestamp.current = json.updatedAt || '';
      setDirectSession(sessionObj);

      if (json.status === 'authenticated' && json.data) {
        if (json.data.settings) setSettings(json.data.settings as ClinicSettings);
        if (Array.isArray(json.data.receipts) && json.data.receipts.length > 0) {
          setReceipts(json.data.receipts as ReceiptRecord[]);
        }
        if (Array.isArray(json.data.inventory) && json.data.inventory.length > 0) {
          setInventory(json.data.inventory as InventoryItem[]);
        }
        if (Array.isArray(json.data.expenses) && json.data.expenses.length > 0) {
          setExpenses(json.data.expenses as ExpenseRecord[]);
        }
        notify(`تم ربط حساب العيادة (${json.clinicId}) وجلب البيانات السحابية بنجاح`, 'success');
      } else {
        notify(`تم إنشاء وربط حساب العيادة السحابي (${json.clinicId}) بنجاح`, 'success');
      }
      return true;
    } catch {
      notify('تعذر الاتصال بالخادم السحابي', 'error');
      return false;
    } finally {
      setIsSyncingCloud(false);
    }
  };

  const handleSignInWithGoogle = async () => {
    try {
      const user = await signInWithGoogleAccount();
      notify(`تم تسجيل الدخول بنجاح (${user.email}) وتفعيل المزامنة السحابية`, 'success');
    } catch {
      notify('استخدم تسجيل الدخول بمعرّف العيادة وكلمة المرور في الأعلى للعمل مباشرة بدون نوافذ منبثقة', 'info');
    }
  };

  const handleSignOut = async () => {
    try {
      setDirectSession(null);
      if (currentUser) {
        await signOutAccount();
      }
      notify('تم تسجيل الخروج من الحساب السحابي', 'info');
    } catch {
      notify('تعذر تسجيل الخروج', 'error');
    }
  };

  const handleForceCloudSync = async () => {
    setIsSyncingCloud(true);
    try {
      if (directSession) {
        await pushToDirectCloud(directSession, settings, receipts, inventory, expenses);
      }
      if (currentUser) {
        await syncLocalDataToCloud(
          currentUser.uid,
          settings,
          receipts,
          inventory,
          expenses,
          true
        );
      }
      notify('تم رفع ومزامنة جميع بيانات العيادة سحابياً بنجاح', 'success');
    } catch {
      notify('حدث خطأ أثناء رفع بعض البيانات للسحابة', 'error');
    } finally {
      setIsSyncingCloud(false);
    }
  };

  const nextReceiptNo = useMemo(() => {
    if (receipts.length === 0) return 1001;
    const maxNo = receipts.reduce(
      (max, r) => Math.max(max, Number(r.receiptNo) || 1000),
      1000
    );
    return maxNo + 1;
  }, [receipts]);

  const pendingDebtsCount = useMemo(
    () => receipts.filter((r) => (Number(r.remainingAmount) || 0) > 0).length,
    [receipts]
  );

  const lowStockCount = useMemo(
    () => inventory.filter((i) => Number(i.qty) <= Number(i.minQty)).length,
    [inventory]
  );

  const isCloudConnected = Boolean(currentUser || directSession);

  const handleSaveReceipt = (
    payload: Omit<ReceiptRecord, 'id'> & { id?: string }
  ): ReceiptRecord => {
    const isEdit = Boolean(payload.id);
    const record: ReceiptRecord = {
      ...payload,
      id: payload.id || 'rec_' + Date.now(),
      createdAt: new Date().toISOString(),
    };

    const nextReceiptsList = (() => {
      const idx = receipts.findIndex((r) => r.id === record.id);
      if (idx > -1) {
        const updated = [...receipts];
        updated[idx] = record;
        return updated;
      }
      return [record, ...receipts];
    })();

    setReceipts(nextReceiptsList);

    let nextInventoryList = inventory;
    if (!isEdit && settings.features.autoInventory && payload.services.length > 0) {
      nextInventoryList = inventory.map((item) => {
        if (item.linkedService && payload.services.includes(item.linkedService) && item.qty > 0) {
          const nextQty = Math.max(0, +(Number(item.qty) - 1).toFixed(2));
          const updatedItem: InventoryItem = {
            ...item,
            qty: nextQty,
            totalCost: +(nextQty * (Number(item.unitPrice) || 0)).toFixed(2),
            updatedAt: new Date().toISOString().slice(0, 10),
          };
          if (currentUser) {
            saveInventoryItemToCloud(currentUser.uid, updatedItem).catch(() => {});
          }
          return updatedItem;
        }
        return item;
      });
      setInventory(nextInventoryList);
    }

    if (directSession) {
      pushToDirectCloud(directSession, settings, nextReceiptsList, nextInventoryList, expenses);
    }

    if (currentUser) {
      ensureClinicDocumentInCloud(currentUser.uid, settings)
        .then(() => saveReceiptToCloud(currentUser.uid, record))
        .catch(() => {});
    }

    setEditingReceipt(null);
    notify(
      isCloudConnected
        ? `تم حفظ السند #${record.receiptNo} ومزامنته سحابياً`
        : `تم حفظ السند #${record.receiptNo} بنجاح`,
      'success'
    );
    return record;
  };

  const handleSettleDebt = (receiptId: string, amountPaidNow: number) => {
    const nextReceiptsList = receipts.map((r) => {
      if (r.id !== receiptId) return r;
      const nextPaid = Math.min(r.totalAmount, Number(r.paidAmount) + amountPaidNow);
      const nextRem = Math.max(0, Number(r.totalAmount) - nextPaid);
      const updated: ReceiptRecord = {
        ...r,
        paidAmount: nextPaid,
        remainingAmount: nextRem,
        amountWords: numberToArabicWords(nextPaid, String(r.currency)),
      };
      if (currentUser) {
        saveReceiptToCloud(currentUser.uid, updated).catch(() => {});
      }
      return updated;
    });
    setReceipts(nextReceiptsList);
    if (directSession) {
      pushToDirectCloud(directSession, settings, nextReceiptsList, inventory, expenses);
    }
    notify('تم تسديد الدفعة ومزامنتها بنجاح', 'success');
  };

  const handleDeleteReceipt = (receiptId: string) => {
    const nextReceiptsList = receipts.filter((r) => r.id !== receiptId);
    setReceipts(nextReceiptsList);
    if (directSession) {
      pushToDirectCloud(directSession, settings, nextReceiptsList, inventory, expenses);
    }
    if (currentUser) {
      deleteReceiptFromCloud(currentUser.uid, receiptId).catch(() => {});
    }
    notify('تم حذف السند', 'info');
  };

  const handleSaveInventoryItem = (
    payload: Omit<InventoryItem, 'id' | 'updatedAt'> & { id?: string },
    recordAsExpense: boolean
  ) => {
    const today = new Date().toISOString().slice(0, 10);
    const newItem: InventoryItem = {
      ...payload,
      id: payload.id || 'inv_' + Date.now(),
      updatedAt: today,
    };

    const nextInventoryList = (() => {
      const idx = inventory.findIndex((i) => i.id === newItem.id);
      if (idx > -1) {
        const copy = [...inventory];
        copy[idx] = newItem;
        return copy;
      }
      return [newItem, ...inventory];
    })();
    setInventory(nextInventoryList);

    if (currentUser) {
      ensureClinicDocumentInCloud(currentUser.uid, settings)
        .then(() => saveInventoryItemToCloud(currentUser.uid, newItem))
        .catch(() => {});
    }

    let nextExpensesList = expenses;
    if (recordAsExpense && newItem.totalCost > 0) {
      const exp: ExpenseRecord = {
        id: 'exp_' + Date.now(),
        title: `شراء مخزون: ${newItem.name}`,
        amount: newItem.totalCost,
        category: 'مشتريات مخزون',
        currency: settings.identity.defaultCurrency,
        date: today,
      };
      nextExpensesList = [exp, ...expenses];
      setExpenses(nextExpensesList);
      if (currentUser) {
        saveExpenseToCloud(currentUser.uid, exp).catch(() => {});
      }
    }

    if (directSession) {
      pushToDirectCloud(directSession, settings, receipts, nextInventoryList, nextExpensesList);
    }

    notify(`تم حفظ الصنف (${newItem.name})`, 'success');
  };

  const handleQuickConsumeInventory = (id: string, amount = 1) => {
    const nextInventoryList = inventory.map((item) => {
      if (item.id !== id) return item;
      const nextQty = Math.max(0, +(Number(item.qty) - amount).toFixed(2));
      const updated: InventoryItem = {
        ...item,
        qty: nextQty,
        totalCost: +(nextQty * Number(item.unitPrice)).toFixed(2),
        updatedAt: new Date().toISOString().slice(0, 10),
      };
      if (currentUser) {
        saveInventoryItemToCloud(currentUser.uid, updated).catch(() => {});
      }
      return updated;
    });
    setInventory(nextInventoryList);
    if (directSession) {
      pushToDirectCloud(directSession, settings, receipts, nextInventoryList, expenses);
    }
    notify('تم خصم الاستهلاك', 'info');
  };

  const handleQuickRestockInventory = (id: string, amount: number, recordExpense: boolean) => {
    const today = new Date().toISOString().slice(0, 10);
    let nextExpensesList = expenses;
    const nextInventoryList = inventory.map((item) => {
      if (item.id !== id) return item;
      const nextQty = +(Number(item.qty) + amount).toFixed(2);
      if (recordExpense && item.unitPrice > 0) {
        const exp: ExpenseRecord = {
          id: 'exp_' + Date.now(),
          title: `تزويد مخزون: ${item.name}`,
          amount: +(amount * item.unitPrice).toFixed(2),
          category: 'مشتريات مخزون',
          currency: settings.identity.defaultCurrency,
          date: today,
        };
        nextExpensesList = [exp, ...nextExpensesList];
        setExpenses(nextExpensesList);
        if (currentUser) {
          saveExpenseToCloud(currentUser.uid, exp).catch(() => {});
        }
      }
      const updated: InventoryItem = {
        ...item,
        qty: nextQty,
        totalCost: +(nextQty * Number(item.unitPrice)).toFixed(2),
        updatedAt: today,
      };
      if (currentUser) {
        saveInventoryItemToCloud(currentUser.uid, updated).catch(() => {});
      }
      return updated;
    });
    setInventory(nextInventoryList);
    if (directSession) {
      pushToDirectCloud(directSession, settings, receipts, nextInventoryList, nextExpensesList);
    }
    notify(`تم تزويد المخزون +${amount}`, 'success');
  };

  // Exactly 6 Non-Duplicate Core Sections (1-2 word titles)
  const navSections: NavSectionItem[] = [
    { id: 'receipt', title: 'إصدار سند', icon: FileText },
    {
      id: 'records',
      title: 'سجل السندات',
      icon: FileSpreadsheet,
      badge: pendingDebtsCount > 0 ? pendingDebtsCount : receipts.length,
    },
    {
      id: 'inventory',
      title: 'المخزون الطبي',
      icon: Package,
      badge: lowStockCount > 0 ? lowStockCount : undefined,
    },
    { id: 'finance', title: 'المالية', icon: Wallet },
    { id: 'assistant', title: 'المساعد الذكي', icon: Bot },
    { id: 'settings', title: 'الإعدادات', icon: Settings },
  ];

  const currentSectionObj =
    navSections.find((s) => s.id === activeSection) || navSections[0];

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* ==================== CLEAN NON-OVERLAPPING MOBILE HEADER ==================== */}
      <header className="sticky top-0 z-30 w-full border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs no-print">
        <div className="max-w-4xl mx-auto px-3 sm:px-6 h-14 flex items-center justify-between gap-2">
          {/* Right: Menu Button + Clear Page Title */}
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => setIsDrawerOpen(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 hover:border-sky-500 text-xs font-bold transition-colors shrink-0"
              aria-label="القائمة"
            >
              <Menu className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
              <span>القائمة</span>
            </button>

            <div className="min-w-0">
              <div className="text-sm sm:text-base font-black text-slate-900 dark:text-slate-100 whitespace-nowrap">
                {currentSectionObj.title}
              </div>
              <div className="text-[10px] font-bold text-sky-600 dark:text-sky-400 truncate hidden sm:block">
                {settings.identity.clinicAr}
              </div>
            </div>
          </div>

          {/* Left: Back Button + Cloud Button + Theme Toggle */}
          <div className="flex items-center gap-1.5 shrink-0">
            {activeSection !== 'receipt' && (
              <button
                type="button"
                onClick={() => navigateToSection('receipt')}
                className="inline-flex items-center gap-1 px-2.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 text-xs font-bold transition-colors shrink-0"
              >
                <ArrowRight className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                <span>رجوع</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsCloudModalOpen(true)}
              className={`inline-flex items-center gap-1 px-2.5 py-2 rounded-xl border text-xs font-bold transition-colors shrink-0 ${
                isCloudConnected
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                  : 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300'
              }`}
              title="حساب العيادة والتثبيت"
            >
              <Cloud className="w-4 h-4 shrink-0" />
              <span className={activeSection !== 'receipt' ? 'hidden sm:inline' : 'inline'}>
                {isCloudConnected ? 'متصل' : 'سحابي'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setDarkMode((d) => !d)}
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
              title="تبديل المظهر"
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </header>

      {/* ==================== SINGLE UNIFIED POP-UP DRAWER MENU ==================== */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 flex no-print">
          <div
            className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs"
            onClick={() => setIsDrawerOpen(false)}
          />
          <aside className="relative w-72 max-w-[84vw] bg-white dark:bg-slate-900 h-full flex flex-col border-l border-slate-200 dark:border-slate-800 z-10 shadow-2xl">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <img
                  src={settings.appearance.customLogoDataUrl}
                  alt="Logo"
                  className="w-9 h-9 rounded-xl object-contain bg-slate-900 p-1 shrink-0"
                />
                <div className="min-w-0">
                  <div className="text-sm font-black text-slate-900 dark:text-slate-100 truncate">
                    عيادة السعيدي
                  </div>
                  <div className="text-[11px] text-sky-600 dark:text-sky-400 font-bold truncate">
                    {settings.identity.doctorAr}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsDrawerOpen(false)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <nav className="flex-1 p-3 space-y-1.5 overflow-y-auto">
              {navSections.map((item) => {
                const Icon = item.icon;
                const isActive = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => navigateToSection(item.id)}
                    className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-xs sm:text-sm font-bold transition-colors ${
                      isActive
                        ? 'bg-sky-600 text-white shadow-xs'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className="w-4 h-4 shrink-0" />
                      <span>{item.title}</span>
                    </div>
                    {item.badge !== undefined && (
                      <span
                        className={`text-[11px] font-mono tabular-nums px-2 py-0.5 rounded-md ${
                          isActive
                            ? 'bg-white/20 text-white'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}

              {/* Cloud & PWA Section in Drawer */}
              <div className="pt-3 mt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsDrawerOpen(false);
                    setIsCloudModalOpen(true);
                  }}
                  className="w-full flex items-center justify-between px-3.5 py-3 rounded-xl border border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300 text-xs sm:text-sm font-bold"
                >
                  <div className="flex items-center gap-2.5">
                    <Cloud className="w-4 h-4 shrink-0" />
                    <span>المنصة السحابية والربط</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-sky-500/20 font-bold">
                    {isCloudConnected ? 'متصل' : 'تسجيل'}
                  </span>
                </button>

                <PWAInstallButton notify={notify} />
              </div>
            </nav>

            <div className="p-3.5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
              <span>إجمالي السندات: {receipts.length}</span>
              <span>{settings.identity.defaultCurrency}</span>
            </div>
          </aside>
        </div>
      )}

      {/* ==================== CLOUD ACCOUNT & MULTI-DEVICE MODAL ==================== */}
      <CloudAccountModal
        isOpen={isCloudModalOpen}
        onClose={() => setIsCloudModalOpen(false)}
        user={currentUser}
        directSession={directSession}
        isSyncing={isSyncingCloud}
        onSignInGoogle={handleSignInWithGoogle}
        onDirectLogin={handleDirectClinicLogin}
        onSignOut={handleSignOut}
        onForceSyncNow={handleForceCloudSync}
        receiptsCount={receipts.length}
        inventoryCount={inventory.length}
        expensesCount={expenses.length}
        notify={notify}
      />

      {/* ==================== MAIN PAGE VIEWPORT ==================== */}
      <main className="flex-1 w-full max-w-4xl mx-auto px-3 sm:px-6 py-4">
        {activeSection === 'receipt' && (
          <ReceiptStudio
            settings={settings}
            receipts={receipts}
            editingReceipt={editingReceipt}
            nextReceiptNo={nextReceiptNo}
            onSaveReceipt={handleSaveReceipt}
            onClearEditing={() => setEditingReceipt(null)}
            onUpdatePermanentSig={(sig) => {
              const nextSettings: ClinicSettings = {
                ...settings,
                appearance: { ...settings.appearance, permanentAccountantSig: sig },
              };
              setSettings(nextSettings);
              if (directSession) {
                pushToDirectCloud(directSession, nextSettings, receipts, inventory, expenses);
              }
              if (currentUser) {
                saveClinicSettingsToCloud(currentUser.uid, nextSettings).catch(() => {});
              }
            }}
            notify={notify}
          />
        )}

        {activeSection === 'records' && (
          <RecordsLedger
            settings={settings}
            receipts={receipts}
            defaultCurrency={settings.identity.defaultCurrency}
            onEditReceipt={(rec) => {
              setEditingReceipt(rec);
              navigateToSection('receipt');
              notify(`تم فتح السند #${rec.receiptNo}`, 'info');
            }}
            onSettleDebt={handleSettleDebt}
            onDeleteReceipt={handleDeleteReceipt}
            onGoToNewReceipt={() => {
              setEditingReceipt(null);
              navigateToSection('receipt');
            }}
            notify={notify}
          />
        )}

        {activeSection === 'inventory' && (
          <InventoryManager
            inventory={inventory}
            services={settings.services}
            defaultCurrency={settings.identity.defaultCurrency}
            onSaveItem={handleSaveInventoryItem}
            onQuickConsume={handleQuickConsumeInventory}
            onQuickRestock={handleQuickRestockInventory}
            onDeleteItem={(id) => {
              const nextInventoryList = inventory.filter((i) => i.id !== id);
              setInventory(nextInventoryList);
              if (directSession) {
                pushToDirectCloud(directSession, settings, receipts, nextInventoryList, expenses);
              }
              if (currentUser) {
                deleteInventoryItemFromCloud(currentUser.uid, id).catch(() => {});
              }
              notify('تم حذف الصنف', 'info');
            }}
            notify={notify}
          />
        )}

        {activeSection === 'finance' && (
          <FinanceDashboard
            receipts={receipts}
            expenses={expenses}
            inventory={inventory}
            defaultCurrency={settings.identity.defaultCurrency}
            onAddExpense={(title, amount, category, currency) => {
              const newExp: ExpenseRecord = {
                id: 'exp_' + Date.now(),
                title,
                amount,
                category,
                currency,
                date: new Date().toISOString().slice(0, 10),
              };
              const nextExpensesList = [newExp, ...expenses];
              setExpenses(nextExpensesList);
              if (directSession) {
                pushToDirectCloud(directSession, settings, receipts, inventory, nextExpensesList);
              }
              if (currentUser) {
                ensureClinicDocumentInCloud(currentUser.uid, settings)
                  .then(() => saveExpenseToCloud(currentUser.uid, newExp))
                  .catch(() => {});
              }
              notify('تم إضافة المصروف', 'success');
            }}
            onDeleteExpense={(id) => {
              const nextExpensesList = expenses.filter((e) => e.id !== id);
              setExpenses(nextExpensesList);
              if (directSession) {
                pushToDirectCloud(directSession, settings, receipts, inventory, nextExpensesList);
              }
              if (currentUser) {
                deleteExpenseFromCloud(currentUser.uid, id).catch(() => {});
              }
              notify('تم حذف المصروف', 'info');
            }}
            notify={notify}
          />
        )}

        {activeSection === 'assistant' && (
          <GeminiAssistant
            settings={settings}
            receipts={receipts}
            inventory={inventory}
            expenses={expenses}
            messages={chatMessages}
            onAddMessage={(msg) => setChatMessages((prev) => [...prev, msg])}
            onClearMessages={() => setChatMessages([])}
            onExitFullScreen={() => navigateToSection('receipt')}
            onOpenMenu={() => setIsDrawerOpen(true)}
            notify={notify}
          />
        )}

        {activeSection === 'settings' && (
          <ClinicSettingsPanel
            settings={settings}
            receipts={receipts}
            inventory={inventory}
            expenses={expenses}
            onSaveSettings={(next) => {
              setSettings(next);
              if (directSession) {
                pushToDirectCloud(directSession, next, receipts, inventory, expenses);
              }
              if (currentUser) {
                saveClinicSettingsToCloud(currentUser.uid, next).catch(() => {});
                for (const srv of next.services) {
                  saveServiceToCloud(currentUser.uid, srv).catch(() => {});
                }
              }
              notify('تم حفظ الإعدادات ومزامنتها سحابياً بنجاح', 'success');
            }}
            onImportFullBackup={(payload) => {
              const nextSettings = payload.settings || settings;
              const nextReceipts = Array.isArray(payload.receipts) ? payload.receipts : receipts;
              const nextInventory = Array.isArray(payload.inventory)
                ? payload.inventory
                : inventory;
              const nextExpenses = Array.isArray(payload.expenses) ? payload.expenses : expenses;

              if (payload.settings) setSettings(nextSettings);
              if (Array.isArray(payload.receipts)) setReceipts(nextReceipts);
              if (Array.isArray(payload.inventory)) setInventory(nextInventory);
              if (Array.isArray(payload.expenses)) setExpenses(nextExpenses);

              if (directSession) {
                pushToDirectCloud(
                  directSession,
                  nextSettings,
                  nextReceipts,
                  nextInventory,
                  nextExpenses
                );
              }
              if (currentUser) {
                syncLocalDataToCloud(
                  currentUser.uid,
                  nextSettings,
                  nextReceipts,
                  nextInventory,
                  nextExpenses,
                  true
                ).catch(() => {});
              }
            }}
            notify={notify}
          />
        )}
      </main>

      {/* Offline Mode Indicator */}
      <OfflineIndicator />

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-4 left-4 right-4 sm:right-auto z-50 sm:max-w-sm rounded-xl border border-slate-700 bg-slate-900 text-white px-4 py-3 shadow-xl flex items-center justify-between gap-3 text-xs font-bold no-print">
          <span>{toast.message}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="text-slate-400 hover:text-white shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
