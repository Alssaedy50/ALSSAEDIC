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
import {
  CloudAccountModal,
  DirectAuthOptions,
  DirectClinicSession,
} from './components/CloudAccountModal';
import { OfflineIndicator, PWAInstallButton } from './components/PWAInstallButton';
import {
  User,
  auth,
  authenticateDirectWorkspaceInCloud,
  deleteExpenseFromCloud,
  deleteInventoryItemFromCloud,
  deleteReceiptFromCloud,
  deleteServiceFromCloud,
  ensureClinicDocumentInCloud,
  onAuthStateChanged,
  pushDirectWorkspaceToCloud,
  saveClinicSettingsToCloud,
  saveExpenseToCloud,
  saveInventoryItemToCloud,
  saveReceiptToCloud,
  saveServiceToCloud,
  signInWithGoogleAccount,
  signOutAccount,
  subscribeToClinicCloudData,
  subscribeToDirectWorkspaceInCloud,
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
  const hasPromptedInitialAuth = useRef<boolean>(false);
  const hasBootstrappedDirectSession = useRef<boolean>(false);

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
  const [settlingReceiptIdFromStudio, setSettlingReceiptIdFromStudio] = useState<string | null>(null);

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

  // Helper to push current state to Direct Cloud Workspace (Firestore clinic_workspaces/{clinicId})
  const pushToDirectCloud = async (
    session: DirectClinicSession,
    nextSettings: ClinicSettings,
    nextReceipts: ReceiptRecord[],
    nextInventory: InventoryItem[],
    nextExpenses: ExpenseRecord[]
  ) => {
    try {
      const updatedAt = await pushDirectWorkspaceToCloud(session.clinicId, session.password, {
        settings: nextSettings,
        receipts: nextReceipts,
        inventory: nextInventory,
        expenses: nextExpenses,
      });
      if (updatedAt) {
        lastDirectSyncTimestamp.current = updatedAt;
      }
    } catch {
      // Offline or transient network error; will sync next time
    }
  };

  // Real-time Firestore listener (onSnapshot) + initial cloud handshake for Direct Cloud Workspace
  useEffect(() => {
    if (!directSession) return;

    if (!hasBootstrappedDirectSession.current) {
      hasBootstrappedDirectSession.current = true;
      authenticateDirectWorkspaceInCloud(
        directSession.clinicId,
        directSession.password,
        {
          settings,
          receipts,
          inventory,
          expenses,
        },
        'auto'
      )
        .then((res) => {
          if (res.ok && res.data) {
            lastDirectSyncTimestamp.current = res.updatedAt;
            if (res.data.settings) setSettings(res.data.settings);
            if (Array.isArray(res.data.receipts)) setReceipts(res.data.receipts);
            if (Array.isArray(res.data.inventory)) setInventory(res.data.inventory);
            if (Array.isArray(res.data.expenses)) setExpenses(res.data.expenses);
          }
        })
        .catch(() => {});
    }

    const unsubDirect = subscribeToDirectWorkspaceInCloud(
      directSession.clinicId,
      directSession.password,
      (payload) => {
        if (payload.updatedAt && payload.updatedAt === lastDirectSyncTimestamp.current) {
          return;
        }
        lastDirectSyncTimestamp.current = payload.updatedAt;
        if (payload.settings) setSettings(payload.settings);
        if (Array.isArray(payload.receipts)) setReceipts(payload.receipts);
        if (Array.isArray(payload.inventory)) setInventory(payload.inventory);
        if (Array.isArray(payload.expenses)) setExpenses(payload.expenses);
      }
    );

    return () => unsubDirect();
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

  // Automatically open Login / Create Account screen on first open when not connected
  useEffect(() => {
    if (!authReady) return;
    if (!currentUser && !directSession && !hasPromptedInitialAuth.current) {
      hasPromptedInitialAuth.current = true;
      setIsCloudModalOpen(true);
    }
  }, [authReady, currentUser, directSession]);

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
        setSettings((prev) => ({
          ...prev,
          services: cloudServices,
        }));
      },
      onReceiptsUpdate: (cloudReceipts) => {
        setReceipts(cloudReceipts);
      },
      onInventoryUpdate: (cloudInventory) => {
        setInventory(cloudInventory);
      },
      onExpensesUpdate: (cloudExpenses) => {
        setExpenses(cloudExpenses);
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
    password: string,
    options?: DirectAuthOptions
  ): Promise<boolean> => {
    setIsSyncingCloud(true);
    try {
      const updatedSettings: ClinicSettings =
        options?.mode === 'register' && (options.clinicNameAr || options.doctorNameAr)
          ? {
              ...settings,
              identity: {
                ...settings.identity,
                clinicAr: options.clinicNameAr || settings.identity.clinicAr,
                systemTitleAr: options.clinicNameAr || settings.identity.systemTitleAr,
                doctorAr: options.doctorNameAr || settings.identity.doctorAr,
              },
            }
          : settings;

      if (updatedSettings !== settings) {
        setSettings(updatedSettings);
      }

      const result = await authenticateDirectWorkspaceInCloud(
        clinicId,
        password,
        {
          settings: updatedSettings,
          receipts,
          inventory,
          expenses,
        },
        options?.mode || 'auto'
      );

      if (!result.ok) {
        notify(result.error || 'تعذر تسجيل الدخول لحساب العيادة', 'error');
        return false;
      }

      const sessionObj: DirectClinicSession = {
        clinicId: result.clinicId,
        password,
        updatedAt: result.updatedAt,
      };
      hasBootstrappedDirectSession.current = true;
      lastDirectSyncTimestamp.current = result.updatedAt;
      setDirectSession(sessionObj);

      if (result.status === 'authenticated' && result.data) {
        const nextSettings =
          options?.mode === 'register' && (options.clinicNameAr || options.doctorNameAr)
            ? updatedSettings
            : result.data.settings || updatedSettings;
        const nextReceipts = Array.isArray(result.data.receipts) ? result.data.receipts : receipts;
        const nextInventory = Array.isArray(result.data.inventory)
          ? result.data.inventory
          : inventory;
        const nextExpenses = Array.isArray(result.data.expenses) ? result.data.expenses : expenses;

        setSettings(nextSettings);
        setReceipts(nextReceipts);
        setInventory(nextInventory);
        setExpenses(nextExpenses);

        await pushToDirectCloud(sessionObj, nextSettings, nextReceipts, nextInventory, nextExpenses);
        notify(`تم تسجيل الدخول لحساب العيادة (${result.clinicId}) ومزامنة البيانات بنجاح`, 'success');
      } else {
        await pushToDirectCloud(sessionObj, updatedSettings, receipts, inventory, expenses);
        notify(`تم إنشاء الحساب السحابي (${result.clinicId}) وحفظ البيانات بنجاح`, 'success');
      }
      return true;
    } catch {
      notify('تعذر الاتصال بالخادم السحابي', 'error');
      return false;
    } finally {
      setIsSyncingCloud(false);
    }
  };

  const handleSignInWithGoogle = async (): Promise<boolean> => {
    try {
      const user = await signInWithGoogleAccount();
      notify(`تم تسجيل الدخول بنجاح (${user.email}) وتفعيل المزامنة السحابية`, 'success');
      return true;
    } catch {
      notify('استخدم تسجيل الدخول بمعرّف العيادة وكلمة المرور في الأعلى للعمل مباشرة بدون نوافذ منبثقة', 'info');
      return false;
    }
  };

  const handleSignOut = async () => {
    try {
      hasBootstrappedDirectSession.current = false;
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
    const today = new Date().toISOString().slice(0, 10);
    const nextReceiptsList = receipts.map((r) => {
      if (r.id !== receiptId) return r;
      const nextPaid = Math.min(r.totalAmount, Number(r.paidAmount) + amountPaidNow);
      const nextRem = Math.max(0, Number(r.totalAmount) - nextPaid);
      const settlementNote = `تم سداد دفعة ${amountPaidNow.toLocaleString()} ${r.currency} بتاريخ ${today}`;
      const nextNotes = r.notes
        ? `${r.notes} | ${settlementNote}`.slice(0, 500)
        : settlementNote;
      const updated: ReceiptRecord = {
        ...r,
        paidAmount: nextPaid,
        remainingAmount: nextRem,
        notes: nextNotes,
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
    notify('تم تسديد الدفعة وتوثيقها في السند ومزامنتها بنجاح', 'success');
  };

  const handleDeleteReceipt = (receiptId: string) => {
    const deletedReceipt = receipts.find((r) => r.id === receiptId);
    const nextReceiptsList = receipts.filter((r) => r.id !== receiptId);
    setReceipts(nextReceiptsList);

    let nextInventoryList = inventory;
    if (
      deletedReceipt &&
      settings.features.autoInventory &&
      Array.isArray(deletedReceipt.services) &&
      deletedReceipt.services.length > 0
    ) {
      const today = new Date().toISOString().slice(0, 10);
      nextInventoryList = inventory.map((item) => {
        if (item.linkedService && deletedReceipt.services.includes(item.linkedService)) {
          const nextQty = +(Number(item.qty) + 1).toFixed(2);
          const updatedItem: InventoryItem = {
            ...item,
            qty: nextQty,
            totalCost: +(nextQty * (Number(item.unitPrice) || 0)).toFixed(2),
            updatedAt: today,
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
      deleteReceiptFromCloud(currentUser.uid, receiptId).catch(() => {});
    }
    notify('تم حذف السند واسترجاع المواد المرتبطة للمخزون', 'info');
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
        isFirstOpenGate={!isCloudConnected}
        user={currentUser}
        directSession={directSession}
        defaultClinicName={settings.identity.clinicAr}
        defaultDoctorName={settings.identity.doctorAr}
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
      <main className="flex-1 w-full max-w-4xl mx-auto px-3 sm:px-6 py-4 pb-24 md:pb-6">
        {!isCloudConnected && (
          <div className="mb-4 rounded-2xl border border-sky-500/35 bg-sky-500/10 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 no-print">
            <div className="flex items-center gap-2 min-w-0">
              <Cloud className="w-4 h-4 text-sky-500 shrink-0" />
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                لم يتم ربط الحساب السحابي بعد — سجّل الدخول أو أنشئ حساباً لحفظ البيانات ومزامنتها تلقائياً.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsCloudModalOpen(true)}
              className="px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-black transition-colors shrink-0"
            >
              تسجيل الدخول / إنشاء حساب
            </button>
          </div>
        )}
        {activeSection === 'receipt' && (
          <ReceiptStudio
            settings={settings}
            receipts={receipts}
            editingReceipt={editingReceipt}
            nextReceiptNo={nextReceiptNo}
            onSaveReceipt={handleSaveReceipt}
            onClearEditing={() => setEditingReceipt(null)}
            onJumpToSettleDebt={(receiptId) => {
              setSettlingReceiptIdFromStudio(receiptId);
              navigateToSection('records');
            }}
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
            initialSettleReceiptId={settlingReceiptIdFromStudio}
            onClearInitialSettle={() => setSettlingReceiptIdFromStudio(null)}
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
            onDeleteService={(serviceId) => {
              if (currentUser) {
                deleteServiceFromCloud(currentUser.uid, serviceId).catch(() => {});
              }
            }}
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

      {/* ==================== MOBILE BOTTOM NAVIGATION BAR (5 TABS + BADGES) ==================== */}
      <nav
        aria-label="التنقل السفلي السريع"
        className="fixed bottom-0 inset-x-0 z-30 md:hidden border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md no-print"
      >
        <div className="grid grid-cols-5 h-16 max-w-md mx-auto px-1">
          {[
            { id: 'receipt' as MainSectionId, label: 'إصدار سند', icon: FileText },
            {
              id: 'records' as MainSectionId,
              label: 'السجل',
              icon: FileSpreadsheet,
              badge: pendingDebtsCount > 0 ? pendingDebtsCount : undefined,
              badgeColor: 'bg-rose-500 text-white',
            },
            {
              id: 'inventory' as MainSectionId,
              label: 'المخزون',
              icon: Package,
              badge: lowStockCount > 0 ? lowStockCount : undefined,
              badgeColor: 'bg-amber-500 text-slate-950',
            },
            { id: 'finance' as MainSectionId, label: 'المالية', icon: Wallet },
            { id: 'assistant' as MainSectionId, label: 'المساعد', icon: Bot },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeSection === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => navigateToSection(tab.id)}
                className={`relative flex flex-col items-center justify-center gap-1 py-1.5 rounded-xl transition-colors ${
                  isActive
                    ? 'text-sky-600 dark:text-sky-400 font-black'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 font-bold'
                }`}
              >
                <div className="relative flex items-center justify-center">
                  <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.5]' : 'stroke-2'}`} />
                  {tab.badge !== undefined && (
                    <span
                      dir="ltr"
                      className={`absolute -top-1.5 -left-3 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-mono font-black flex items-center justify-center shadow-xs ${tab.badgeColor}`}
                    >
                      {tab.badge}
                    </span>
                  )}
                </div>
                <span className="text-[11px] leading-tight whitespace-nowrap">{tab.label}</span>
                {isActive && (
                  <span className="absolute top-0 inset-x-4 h-0.5 rounded-b-full bg-sky-600 dark:bg-sky-400" />
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Offline Mode Indicator */}
      <OfflineIndicator />

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-20 md:bottom-4 left-4 right-4 sm:right-auto z-50 sm:max-w-sm rounded-xl border border-slate-700 bg-slate-900 text-white px-4 py-3 shadow-xl flex items-center justify-between gap-3 text-xs font-bold no-print">
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
