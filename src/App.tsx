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
  Users,
  Wallet,
  X,
} from 'lucide-react';
import {
  ChatMessage,
  ClinicSettings,
  ExpenseRecord,
  InventoryItem,
  ReceiptRecord,
  WorkspaceRole,
  WorkspacePermissions,
  DEFAULT_ROLE_PERMISSIONS,
} from './types/clinic';
import {
  DEFAULT_EXPENSES,
  DEFAULT_INVENTORY,
  DEFAULT_RECEIPTS,
  DEFAULT_SETTINGS,
  SEED_DEMO_IDS,
  createInitialClinicSettingsForUser,
} from './data/defaultData';
import { numberToArabicWords } from './utils/arabicTafqeet';
import { LOCAL_API_SESSION_KEY } from './utils/aiClient';
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
  extractClinicIdFromEmail,
  flushPendingSyncQueue,
  initializeOrLoadUserClinicInCloud,
  issueServerSessionToken,
  lookupUserWorkspaceByEmail,
  onAuthStateChanged,
  pushDirectWorkspaceToCloud,
  reloadAndCheckEmailVerified,
  resendVerificationEmail,
  saveClinicSettingsToCloud,
  saveExpenseToCloud,
  saveInventoryItemToCloud,
  saveReceiptToCloud,
  saveServiceToCloud,
  signInWithGoogleAccount,
  signOutAccount,
  subscribeToClinicCloudData,
  syncLocalDataToCloud,
  validateAndNormalizeExpense,
  validateAndNormalizeInventoryItem,
  validateAndNormalizeReceipt,
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
  ACTIVE_SECTION: 'docai_active_section_v1',
};

const VALID_MAIN_SECTIONS: MainSectionId[] = [
  'receipt',
  'records',
  'inventory',
  'finance',
  'assistant',
  'settings',
];

function isValidMainSection(val: unknown): val is MainSectionId {
  return typeof val === 'string' && (VALID_MAIN_SECTIONS as string[]).includes(val);
}

function getInitialActiveSection(): MainSectionId {
  try {
    const hashSection = window.location.hash.replace(/^#/, '').trim();
    if (isValidMainSection(hashSection)) {
      return hashSection;
    }
    const storedSection = localStorage.getItem(STORAGE_KEYS.ACTIVE_SECTION);
    if (isValidMainSection(storedSection)) {
      return storedSection;
    }
  } catch {
    // Ignore storage access errors
  }
  return 'receipt';
}

function getScopedStorageKey(baseKey: string, ownerUid?: string | null): string {
  if (!ownerUid) return baseKey;
  return `${baseKey}_${ownerUid}`;
}

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function loadSecureDirectSession(): DirectClinicSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.DIRECT_CLOUD_SESSION);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    // Immediately purge any legacy session that contained a plaintext password or lacks signed token/expiration
    if (
      !parsed ||
      'password' in parsed ||
      typeof parsed.clinicId !== 'string' ||
      typeof parsed.ownerUid !== 'string' ||
      typeof parsed.sessionToken !== 'string' ||
      typeof parsed.expiresAt !== 'string'
    ) {
      localStorage.removeItem(STORAGE_KEYS.DIRECT_CLOUD_SESSION);
      return null;
    }
    const expMs = Date.parse(parsed.expiresAt);
    if (!Number.isFinite(expMs) || expMs <= Date.now()) {
      localStorage.removeItem(STORAGE_KEYS.DIRECT_CLOUD_SESSION);
      return null;
    }
    return {
      clinicId: parsed.clinicId,
      ownerUid: parsed.ownerUid,
      sessionToken: parsed.sessionToken,
      expiresAt: parsed.expiresAt,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : undefined,
    };
  } catch {
    localStorage.removeItem(STORAGE_KEYS.DIRECT_CLOUD_SESSION);
    return null;
  }
}

export default function App() {
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.THEME);
    return saved ? saved === 'dark' : true;
  });

  const [activeSection, setActiveSection] = useState<MainSectionId>(() =>
    getInitialActiveSection()
  );
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [isCloudModalOpen, setIsCloudModalOpen] = useState<boolean>(false);

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [directSession, setDirectSession] = useState<DirectClinicSession | null>(() =>
    loadSecureDirectSession()
  );
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [isSyncingCloud, setIsSyncingCloud] = useState<boolean>(false);
  const lastDirectSyncTimestamp = useRef<string>('');
  const hasPromptedInitialAuth = useRef<boolean>(false);

  // Multi-User Workspace & Role State
  const [currentRole, setCurrentRole] = useState<WorkspaceRole>('owner');
  const [currentPermissions, setCurrentPermissions] = useState<WorkspacePermissions>(
    DEFAULT_ROLE_PERMISSIONS.owner
  );
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>('alssaedy-clinic');
  const [activeClinicOwnerUid, setActiveClinicOwnerUid] = useState<string | null>(null);
  const [cloudHydratedUid, setCloudHydratedUid] = useState<string | null>(null);
  const [emailVerificationNotice, setEmailVerificationNotice] = useState<boolean>(false);
  const [isNewAccountSetup, setIsNewAccountSetup] = useState<boolean>(false);
  const pendingNewAccountRedirectRef = useRef<boolean>(false);

  const [settings, setSettings] = useState<ClinicSettings>(() =>
    loadFromStorage<ClinicSettings>(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS)
  );
  const [receipts, setReceipts] = useState<ReceiptRecord[]>(() => {
    const loaded = loadFromStorage<ReceiptRecord[]>(STORAGE_KEYS.RECEIPTS, DEFAULT_RECEIPTS);
    const cleaned = Array.isArray(loaded)
      ? loaded.filter((r) => r && !SEED_DEMO_IDS.receipts.has(r.id))
      : [];
    if (Array.isArray(loaded) && cleaned.length !== loaded.length) {
      localStorage.setItem(STORAGE_KEYS.RECEIPTS, JSON.stringify(cleaned));
    }
    return cleaned;
  });
  const [inventory, setInventory] = useState<InventoryItem[]>(() => {
    const loaded = loadFromStorage<InventoryItem[]>(STORAGE_KEYS.INVENTORY, DEFAULT_INVENTORY);
    const cleaned = Array.isArray(loaded)
      ? loaded.filter((i) => i && !SEED_DEMO_IDS.inventory.has(i.id))
      : [];
    if (Array.isArray(loaded) && cleaned.length !== loaded.length) {
      localStorage.setItem(STORAGE_KEYS.INVENTORY, JSON.stringify(cleaned));
    }
    return cleaned;
  });
  const [expenses, setExpenses] = useState<ExpenseRecord[]>(() => {
    const loaded = loadFromStorage<ExpenseRecord[]>(STORAGE_KEYS.EXPENSES, DEFAULT_EXPENSES);
    const cleaned = Array.isArray(loaded)
      ? loaded.filter((e) => e && !SEED_DEMO_IDS.expenses.has(e.id))
      : [];
    if (Array.isArray(loaded) && cleaned.length !== loaded.length) {
      localStorage.setItem(STORAGE_KEYS.EXPENSES, JSON.stringify(cleaned));
    }
    return cleaned;
  });
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
    try {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_SECTION, activeSection);
      if (window.location.hash !== `#${activeSection}`) {
        window.history.replaceState({ section: activeSection }, '', `#${activeSection}`);
      }
    } catch {
      // Ignore storage or history errors
    }
  }, [activeSection]);

  useEffect(() => {
    if (currentUser && (!activeClinicOwnerUid || cloudHydratedUid !== activeClinicOwnerUid)) {
      return;
    }
    const scopedKey = getScopedStorageKey(STORAGE_KEYS.SETTINGS, activeClinicOwnerUid);
    localStorage.setItem(scopedKey, JSON.stringify(settings));
  }, [settings, activeClinicOwnerUid, currentUser, cloudHydratedUid]);

  useEffect(() => {
    if (currentUser && (!activeClinicOwnerUid || cloudHydratedUid !== activeClinicOwnerUid)) {
      return;
    }
    const scopedKey = getScopedStorageKey(STORAGE_KEYS.RECEIPTS, activeClinicOwnerUid);
    localStorage.setItem(scopedKey, JSON.stringify(receipts));
  }, [receipts, activeClinicOwnerUid, currentUser, cloudHydratedUid]);

  useEffect(() => {
    if (currentUser && (!activeClinicOwnerUid || cloudHydratedUid !== activeClinicOwnerUid)) {
      return;
    }
    const scopedKey = getScopedStorageKey(STORAGE_KEYS.INVENTORY, activeClinicOwnerUid);
    localStorage.setItem(scopedKey, JSON.stringify(inventory));
  }, [inventory, activeClinicOwnerUid, currentUser, cloudHydratedUid]);

  useEffect(() => {
    if (currentUser && (!activeClinicOwnerUid || cloudHydratedUid !== activeClinicOwnerUid)) {
      return;
    }
    const scopedKey = getScopedStorageKey(STORAGE_KEYS.EXPENSES, activeClinicOwnerUid);
    localStorage.setItem(scopedKey, JSON.stringify(expenses));
  }, [expenses, activeClinicOwnerUid, currentUser, cloudHydratedUid]);

  useEffect(() => {
    if (directSession) {
      const safeSession: DirectClinicSession = {
        clinicId: directSession.clinicId,
        ownerUid: directSession.ownerUid,
        sessionToken: directSession.sessionToken,
        expiresAt: directSession.expiresAt,
        updatedAt: directSession.updatedAt,
      };
      localStorage.setItem(STORAGE_KEYS.DIRECT_CLOUD_SESSION, JSON.stringify(safeSession));
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

  // Ensure a signed session token exists for authenticated backend API calls (/api/gemini/*)
  useEffect(() => {
    const ensureApiToken = async () => {
      try {
        if (directSession && Date.parse(directSession.expiresAt) > Date.now()) {
          return;
        }
        const existingRaw = sessionStorage.getItem(LOCAL_API_SESSION_KEY);
        if (existingRaw) {
          const parsed = JSON.parse(existingRaw) as { expiresAt?: string; sessionToken?: string };
          if (
            parsed?.sessionToken &&
            parsed?.expiresAt &&
            Date.parse(parsed.expiresAt) > Date.now()
          ) {
            return;
          }
        }
        const ownerUid = currentUser?.uid || 'local_clinic_operator';
        const clinicId = directSession?.clinicId || 'alssaedy-clinic';
        const issued = await issueServerSessionToken({ clinicId, ownerUid });
        if (issued.ok && issued.sessionToken) {
          sessionStorage.setItem(
            LOCAL_API_SESSION_KEY,
            JSON.stringify({
              clinicId,
              ownerUid,
              sessionToken: issued.sessionToken,
              expiresAt: issued.expiresAt,
            })
          );
        }
      } catch {
        // Ignore transient offline error
      }
    };
    ensureApiToken();
  }, [currentUser, directSession]);

  // Periodically check session expiration and clear expired sessions automatically
  useEffect(() => {
    if (!directSession) return;
    const checkExpiration = () => {
      const expMs = Date.parse(directSession.expiresAt);
      if (!Number.isFinite(expMs) || expMs <= Date.now()) {
        setDirectSession(null);
        signOutAccount().catch(() => {});
        notify('انتهت صلاحية الجلسة السحابية، يرجى إعادة تسجيل الدخول.', 'warning');
      }
    };
    checkExpiration();
    const timer = setInterval(checkExpiration, 60_000);
    return () => clearInterval(timer);
  }, [directSession]);

  // Helper to push current state to Direct Cloud Workspace and verify completion
  const pushToDirectCloud = async (
    session: DirectClinicSession,
    nextSettings: ClinicSettings,
    nextReceipts: ReceiptRecord[],
    nextInventory: InventoryItem[],
    nextExpenses: ExpenseRecord[]
  ): Promise<boolean> => {
    if (Date.parse(session.expiresAt) <= Date.now()) {
      setDirectSession(null);
      return false;
    }
    try {
      const updatedAt = await pushDirectWorkspaceToCloud(session.clinicId, session.ownerUid, {
        settings: nextSettings,
        receipts: nextReceipts,
        inventory: nextInventory,
        expenses: nextExpenses,
      });
      if (updatedAt) {
        lastDirectSyncTimestamp.current = updatedAt;
      }
      return true;
    } catch {
      return false;
    }
  };

  // Firebase Auth & Real-Time Multi-User Workspace Cloud Sync
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      setAuthReady(true);

      if (user) {
        setIsSyncingCloud(true);
        try {
          const isSyntheticLocalEmail = Boolean(
            user.email && user.email.endsWith('@clinic.alssaedic.local')
          );
          if (!isSyntheticLocalEmail && !user.emailVerified) {
            await reloadAndCheckEmailVerified();
          }
          setEmailVerificationNotice(false);

          // Check if this user was invited to a clinic workspace
          const workspaceLookup = user.email ? await lookupUserWorkspaceByEmail(user.email) : null;
          let effectiveOwnerUid = user.uid;
          let effectiveWorkspaceId =
            extractClinicIdFromEmail(user.email) ||
            (user.email ? user.email.split('@')[0].replace(/[^a-zA-Z0-9_-]/g, '-') : '') ||
            'alssaedy-clinic';

          if (workspaceLookup) {
            setCurrentRole(workspaceLookup.role);
            setCurrentPermissions(workspaceLookup.permissions);
            effectiveWorkspaceId = workspaceLookup.workspaceId;
            effectiveOwnerUid = workspaceLookup.addedBy || user.uid;

            const memberFallbackSettings = createInitialClinicSettingsForUser(
              user.email,
              user.displayName
            );
            const memberScopedSettings = loadFromStorage<ClinicSettings>(
              getScopedStorageKey(STORAGE_KEYS.SETTINGS, effectiveOwnerUid),
              memberFallbackSettings
            );
            const memberScopedReceipts = loadFromStorage<ReceiptRecord[]>(
              getScopedStorageKey(STORAGE_KEYS.RECEIPTS, effectiveOwnerUid),
              []
            ).filter((r) => r && !SEED_DEMO_IDS.receipts.has(r.id));
            const memberScopedInventory = loadFromStorage<InventoryItem[]>(
              getScopedStorageKey(STORAGE_KEYS.INVENTORY, effectiveOwnerUid),
              []
            ).filter((i) => i && !SEED_DEMO_IDS.inventory.has(i.id));
            const memberScopedExpenses = loadFromStorage<ExpenseRecord[]>(
              getScopedStorageKey(STORAGE_KEYS.EXPENSES, effectiveOwnerUid),
              []
            ).filter((e) => e && !SEED_DEMO_IDS.expenses.has(e.id));

            setSettings(memberScopedSettings);
            setReceipts(memberScopedReceipts);
            setInventory(memberScopedInventory);
            setExpenses(memberScopedExpenses);
            setActiveWorkspaceId(effectiveWorkspaceId);
            setActiveClinicOwnerUid(effectiveOwnerUid);

            try {
              const { data } = await initializeOrLoadUserClinicInCloud(
                effectiveOwnerUid,
                memberScopedSettings,
                memberScopedReceipts,
                memberScopedInventory,
                memberScopedExpenses
              );
              setSettings(data.settings);
              setReceipts(data.receipts);
              setInventory(data.inventory);
              setExpenses(data.expenses);
            } finally {
              setCloudHydratedUid(effectiveOwnerUid);
            }

            const roleLabels: Record<WorkspaceRole, string> = {
              owner: 'مالك العيادة',
              doctor: 'طبيب',
              accountant: 'محاسب',
              receptionist: 'موظف استقبال',
              viewer: 'مشاهد',
            };
            notify(
              `تم الانضمام إلى مساحة عمل العيادة بدور: ${roleLabels[workspaceLookup.role] || workspaceLookup.role}`,
              'info'
            );
          } else {
            setCurrentRole('owner');
            setCurrentPermissions(DEFAULT_ROLE_PERMISSIONS.owner);

            // Load user-scoped local cache (if any) or clean per-user initial settings
            const userDefaultSettings = createInitialClinicSettingsForUser(
              user.email,
              user.displayName
            );
            const scopedSettings = loadFromStorage<ClinicSettings>(
              getScopedStorageKey(STORAGE_KEYS.SETTINGS, user.uid),
              userDefaultSettings
            );

            // Also rescue any unscoped records created while offline/logged-out
            const unscopedReceipts = loadFromStorage<ReceiptRecord[]>(STORAGE_KEYS.RECEIPTS, []).filter(
              (r) => r && !SEED_DEMO_IDS.receipts.has(r.id)
            );
            const unscopedInventory = loadFromStorage<InventoryItem[]>(
              STORAGE_KEYS.INVENTORY,
              []
            ).filter((i) => i && !SEED_DEMO_IDS.inventory.has(i.id));
            const unscopedExpenses = loadFromStorage<ExpenseRecord[]>(
              STORAGE_KEYS.EXPENSES,
              []
            ).filter((e) => e && !SEED_DEMO_IDS.expenses.has(e.id));

            const rawScopedReceipts = loadFromStorage<ReceiptRecord[]>(
              getScopedStorageKey(STORAGE_KEYS.RECEIPTS, user.uid),
              []
            ).filter((r) => r && !SEED_DEMO_IDS.receipts.has(r.id));
            const rawScopedInventory = loadFromStorage<InventoryItem[]>(
              getScopedStorageKey(STORAGE_KEYS.INVENTORY, user.uid),
              []
            ).filter((i) => i && !SEED_DEMO_IDS.inventory.has(i.id));
            const rawScopedExpenses = loadFromStorage<ExpenseRecord[]>(
              getScopedStorageKey(STORAGE_KEYS.EXPENSES, user.uid),
              []
            ).filter((e) => e && !SEED_DEMO_IDS.expenses.has(e.id));

            const mergeLocalArrays = <T extends { id: string }>(a: T[], b: T[]): T[] => {
              const m = new Map<string, T>();
              for (const x of b) if (x?.id) m.set(x.id, x);
              for (const x of a) if (x?.id) m.set(x.id, x);
              return Array.from(m.values());
            };

            const scopedReceipts = mergeLocalArrays(rawScopedReceipts, unscopedReceipts);
            const scopedInventory = mergeLocalArrays(rawScopedInventory, unscopedInventory);
            const scopedExpenses = mergeLocalArrays(rawScopedExpenses, unscopedExpenses);

            // Clear unscoped records once merged into owner's clinic so they never leak to other accounts
            if (unscopedReceipts.length > 0) localStorage.removeItem(STORAGE_KEYS.RECEIPTS);
            if (unscopedInventory.length > 0) localStorage.removeItem(STORAGE_KEYS.INVENTORY);
            if (unscopedExpenses.length > 0) localStorage.removeItem(STORAGE_KEYS.EXPENSES);

            setSettings(scopedSettings);
            setReceipts(scopedReceipts);
            setInventory(scopedInventory);
            setExpenses(scopedExpenses);
            setActiveWorkspaceId(effectiveWorkspaceId);
            setActiveClinicOwnerUid(user.uid);

            try {
              const { isNewClinic, data } = await initializeOrLoadUserClinicInCloud(
                user.uid,
                scopedSettings,
                scopedReceipts,
                scopedInventory,
                scopedExpenses
              );

              setSettings(data.settings);
              setReceipts(data.receipts);
              setInventory(data.inventory);
              setExpenses(data.expenses);

              if (isNewClinic || pendingNewAccountRedirectRef.current) {
                pendingNewAccountRedirectRef.current = false;
                setIsNewAccountSetup(true);
                setActiveSection('settings');
                window.history.pushState({ section: 'settings' }, '', '#settings');
              }
            } finally {
              setCloudHydratedUid(user.uid);
            }
          }

          // Issue/refresh signed server session token for this Firebase Auth user
          const issued = await issueServerSessionToken({
            clinicId: effectiveWorkspaceId,
            ownerUid: effectiveOwnerUid,
          });
          const token = issued.ok && issued.sessionToken ? issued.sessionToken : `fb_${user.uid}`;
          const expIso =
            issued.ok && issued.expiresAt
              ? issued.expiresAt
              : new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();

          sessionStorage.setItem(
            LOCAL_API_SESSION_KEY,
            JSON.stringify({
              clinicId: effectiveWorkspaceId,
              ownerUid: effectiveOwnerUid,
              sessionToken: token,
              expiresAt: expIso,
            })
          );

          if (!directSession && extractClinicIdFromEmail(user.email)) {
            setDirectSession({
              clinicId: effectiveWorkspaceId,
              ownerUid: effectiveOwnerUid,
              sessionToken: token,
              expiresAt: expIso,
              updatedAt: new Date().toISOString(),
            });
          }
        } catch (err) {
          console.warn('Initial cloud sync notice:', err);
          setCloudHydratedUid(user.uid);
        } finally {
          setIsSyncingCloud(false);
        }
      } else {
        setCloudHydratedUid(null);
        setActiveClinicOwnerUid(null);
        setCurrentRole('owner');
        setCurrentPermissions(DEFAULT_ROLE_PERMISSIONS.owner);
        setEmailVerificationNotice(false);
        setIsNewAccountSetup(false);
        setReceipts([]);
        setInventory([]);
        setExpenses([]);
        if (directSession) {
          setDirectSession(null);
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

  const activeOwnerUid = activeClinicOwnerUid || currentUser?.uid || directSession?.ownerUid || null;
  const cloudTargetUid = currentUser ? (activeClinicOwnerUid || currentUser.uid) : null;

  // Automatically flush any pending offline changes when internet connection returns
  useEffect(() => {
    if (!cloudTargetUid || !currentUser) return;
    const handleOnline = () => {
      flushPendingSyncQueue(cloudTargetUid).catch(() => {});
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [cloudTargetUid, currentUser]);

  useEffect(() => {
    if (!authReady || !cloudTargetUid || !currentUser || cloudHydratedUid !== cloudTargetUid) return;

    const unsubCloud = subscribeToClinicCloudData(cloudTargetUid, {
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
  }, [authReady, cloudTargetUid, currentUser, cloudHydratedUid]);

  // Automatically re-check email verification when user returns to browser tab after clicking link
  useEffect(() => {
    const handleWindowFocus = async () => {
      if (
        auth.currentUser &&
        auth.currentUser.email &&
        !auth.currentUser.email.endsWith('@clinic.alssaedic.local') &&
        !auth.currentUser.emailVerified
      ) {
        const verified = await reloadAndCheckEmailVerified();
        if (verified) {
          setEmailVerificationNotice(false);
          setCurrentUser(auth.currentUser);
        }
      }
    };
    window.addEventListener('focus', handleWindowFocus);
    return () => window.removeEventListener('focus', handleWindowFocus);
  }, []);

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
      const fromState = e.state?.section;
      const fromHash = window.location.hash.replace(/^#/, '').trim();
      const targetSection: MainSectionId = isValidMainSection(fromState)
        ? fromState
        : isValidMainSection(fromHash)
          ? fromHash
          : getInitialActiveSection();
      setActiveSection(targetSection);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isDrawerOpen, isCloudModalOpen]);

  const navigateToSection = (sectionId: MainSectionId) => {
    try {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_SECTION, sectionId);
    } catch {
      // Ignore
    }
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

      if (!result.ok || !result.ownerUid || !result.sessionToken || !result.expiresAt) {
        if (!isCloudModalOpen) {
          notify(result.error || 'تعذر تسجيل الدخول لحساب العيادة', 'error');
        }
        return false;
      }

      const sessionObj: DirectClinicSession = {
        clinicId: result.clinicId,
        ownerUid: result.ownerUid,
        sessionToken: result.sessionToken,
        expiresAt: result.expiresAt,
        updatedAt: result.updatedAt,
      };
      lastDirectSyncTimestamp.current = result.updatedAt;
      setDirectSession(sessionObj);

      if (result.data) {
        const nextSettings =
          options?.mode === 'register' && (options.clinicNameAr || options.doctorNameAr)
            ? updatedSettings
            : result.data.settings || updatedSettings;
        const nextReceipts = Array.isArray(result.data.receipts)
          ? result.data.receipts.filter((r) => r && !SEED_DEMO_IDS.receipts.has(r.id))
          : receipts;
        const nextInventory = Array.isArray(result.data.inventory)
          ? result.data.inventory.filter((i) => i && !SEED_DEMO_IDS.inventory.has(i.id))
          : inventory;
        const nextExpenses = Array.isArray(result.data.expenses)
          ? result.data.expenses.filter((e) => e && !SEED_DEMO_IDS.expenses.has(e.id))
          : expenses;

        setSettings(nextSettings);
        setReceipts(nextReceipts);
        setInventory(nextInventory);
        setExpenses(nextExpenses);
      }

      notify(
        result.status === 'created'
          ? `تم إنشاء الحساب السحابي (${result.clinicId})`
          : `تم تسجيل الدخول (${result.clinicId}) ومزامنة البيانات`,
        'success'
      );
      return true;
    } catch {
      if (!isCloudModalOpen) {
        notify('تعذر الاتصال بقاعدة البيانات السحابية.', 'error');
      }
      return false;
    } finally {
      setIsSyncingCloud(false);
    }
  };

  const handleSignInWithGoogle = async (): Promise<boolean> => {
    try {
      const user = await signInWithGoogleAccount();
      const issued = await issueServerSessionToken({
        clinicId: 'alssaedy-clinic',
        ownerUid: user.uid,
      });
      if (issued.ok && issued.sessionToken) {
        setDirectSession({
          clinicId: 'alssaedy-clinic',
          ownerUid: user.uid,
          sessionToken: issued.sessionToken,
          expiresAt: issued.expiresAt,
          updatedAt: new Date().toISOString(),
        });
      }
      notify(`تم تسجيل الدخول بنجاح (${user.email}) وتفعيل المزامنة السحابية`, 'success');
      return true;
    } catch (err) {
      if (!isCloudModalOpen) {
        notify('تعذر إكمال تسجيل الدخول عبر Google. يرجى المحاولة مرة أخرى.', 'error');
        return false;
      }
      throw err;
    }
  };

  const handleSignOut = async () => {
    try {
      setDirectSession(null);
      localStorage.removeItem(STORAGE_KEYS.DIRECT_CLOUD_SESSION);
      if (currentUser) {
        await signOutAccount();
      }
      notify('تم تسجيل الخروج من الحساب السحابي', 'info');
    } catch {
      notify('تعذر تسجيل الخروج', 'error');
    }
  };

  const handleForceCloudSync = async () => {
    if (!currentUser || !cloudTargetUid) {
      notify('يرجى تسجيل الدخول أولاً لتفعيل المزامنة السحابية.', 'warning');
      return;
    }
    setIsSyncingCloud(true);
    try {
      try {
        await syncLocalDataToCloud(
          cloudTargetUid,
          settings,
          receipts,
          inventory,
          expenses,
          true
        );
      } catch (err) {
        console.warn('Cloud sync warning:', err);
      }
      if (directSession) {
        await pushToDirectCloud(directSession, settings, receipts, inventory, expenses);
      }
      notify('تمت مزامنة البيانات سحابياً', 'success');
    } catch {
      notify('تعذر إكمال المزامنة السحابية حالياً.', 'error');
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

  const isCloudConnected = Boolean(currentUser);

  const handleSaveReceipt = (
    payload: Omit<ReceiptRecord, 'id'> & { id?: string }
  ): ReceiptRecord => {
    const isEdit = Boolean(payload.id);

    // RBAC Permission Guard
    if (isEdit) {
      if (!currentPermissions.canEditReceipt && currentRole !== 'owner') {
        notify('ليس لديك صلاحية تعديل السندات المحفوظة.', 'error');
        return payload as ReceiptRecord;
      }
    } else {
      if (!currentPermissions.canCreateReceipt && currentRole !== 'owner') {
        notify('ليس لديك صلاحية إنشاء سندات جديدة.', 'error');
        return payload as ReceiptRecord;
      }
    }

    const record = validateAndNormalizeReceipt({
      ...payload,
      id: payload.id || 'rec_' + Date.now(),
      createdAt: new Date().toISOString(),
    });

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

    const targetClinicUid = cloudTargetUid;

    let nextInventoryList = inventory;
    if (!isEdit && settings.features.autoInventory && record.services.length > 0) {
      nextInventoryList = inventory.map((item) => {
        if (item.linkedService && record.services.includes(item.linkedService) && item.qty > 0) {
          const nextQty = Math.max(0, +(Number(item.qty) - 1).toFixed(2));
          const updatedItem: InventoryItem = validateAndNormalizeInventoryItem({
            ...item,
            qty: nextQty,
            totalCost: +(nextQty * (Number(item.unitPrice) || 0)).toFixed(2),
            updatedAt: new Date().toISOString().slice(0, 10),
          });
          if (targetClinicUid) {
            saveInventoryItemToCloud(targetClinicUid, updatedItem).catch(() => {});
          }
          return updatedItem;
        }
        return item;
      });
      setInventory(nextInventoryList);
    }

    setEditingReceipt(null);

    if (targetClinicUid) {
      ensureClinicDocumentInCloud(targetClinicUid, settings)
        .then(() => saveReceiptToCloud(targetClinicUid, record))
        .then(() => {
          notify(`تم حفظ السند #${record.receiptNo} ومزامنته سحابياً`, 'success');
        })
        .catch(() => {
          notify(
            `تم حفظ السند #${record.receiptNo} محلياً فقط — تعذر المزامنة السحابية`,
            'warning'
          );
        });
    } else {
      notify(`تم حفظ السند #${record.receiptNo}`, 'success');
    }

    return record;
  };

  const handleSettleDebt = (receiptId: string, amountPaidNow: number) => {
    if (!currentPermissions.canEditReceipt && currentRole !== 'owner') {
      notify('ليس لديك صلاحية تسجيل تسديدات أو تعديل السندات.', 'error');
      return;
    }
    if (!Number.isFinite(amountPaidNow) || amountPaidNow <= 0) {
      notify('يرجى إدخال مبلغ سداد صحيح أكبر من الصفر.', 'error');
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    let settledRecord: ReceiptRecord | null = null;

    const nextReceiptsList = receipts.map((r) => {
      if (r.id !== receiptId) return r;
      const nextPaid = Math.min(r.totalAmount, Number(r.paidAmount) + amountPaidNow);
      const nextRem = Math.max(0, +(Number(r.totalAmount) - nextPaid).toFixed(2));
      const settlementNote = `تم سداد دفعة ${amountPaidNow.toLocaleString()} ${r.currency} بتاريخ ${today}`;
      const nextNotes = r.notes
        ? `${r.notes} | ${settlementNote}`.slice(0, 500)
        : settlementNote;
      const updated = validateAndNormalizeReceipt({
        ...r,
        paidAmount: nextPaid,
        remainingAmount: nextRem,
        notes: nextNotes,
        amountWords: numberToArabicWords(nextPaid, String(r.currency)),
      });
      settledRecord = updated;
      return updated;
    });

    setReceipts(nextReceiptsList);

    const targetClinicUid = cloudTargetUid;
    if (targetClinicUid && settledRecord) {
      saveReceiptToCloud(targetClinicUid, settledRecord)
        .then(() => {
          notify('تم تسديد الدفعة ومزامنتها سحابياً', 'success');
        })
        .catch(() => {
          notify('تم تسديد الدفعة محلياً فقط — تعذر المزامنة السحابية', 'warning');
        });
    } else {
      notify('تم تسديد الدفعة بنجاح', 'success');
    }
  };

  const handleDeleteReceipt = (receiptId: string) => {
    if (!currentPermissions.canDeleteReceipt && currentRole !== 'owner') {
      notify('غير مصرح لك بحذف السندات المالية (يتطلب صلاحية المالك أو محاسب مخول).', 'error');
      return;
    }

    const deletedReceipt = receipts.find((r) => r.id === receiptId);
    const nextReceiptsList = receipts.filter((r) => r.id !== receiptId);
    setReceipts(nextReceiptsList);

    const targetClinicUid = cloudTargetUid;

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
          const updatedItem = validateAndNormalizeInventoryItem({
            ...item,
            qty: nextQty,
            totalCost: +(nextQty * (Number(item.unitPrice) || 0)).toFixed(2),
            updatedAt: today,
          });
          if (targetClinicUid) {
            saveInventoryItemToCloud(targetClinicUid, updatedItem).catch(() => {});
          }
          return updatedItem;
        }
        return item;
      });
      setInventory(nextInventoryList);
    }

    if (targetClinicUid) {
      deleteReceiptFromCloud(targetClinicUid, receiptId)
        .then(() => {
          notify('تم حذف السند ومزامنة الحذف سحابياً', 'info');
        })
        .catch(() => {
          notify('تم حذف السند محلياً — تعذر مزامنة الحذف سحابياً حالياً', 'warning');
        });
    } else {
      notify('تم حذف السند واسترجاع المواد المرتبطة للمخزون', 'info');
    }
  };

  const handleSaveInventoryItem = (
    payload: Omit<InventoryItem, 'id' | 'updatedAt'> & { id?: string },
    recordAsExpense: boolean
  ) => {
    if (!currentPermissions.canManageInventory && currentRole !== 'owner') {
      notify('غير مصرح لك بإدارة أصناف المخزون الطبي.', 'error');
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const newItem = validateAndNormalizeInventoryItem({
      ...payload,
      id: payload.id || 'inv_' + Date.now(),
      updatedAt: today,
    });

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

    let createdExpense: ExpenseRecord | null = null;
    if (recordAsExpense && newItem.totalCost > 0) {
      const exp = validateAndNormalizeExpense({
        id: 'exp_' + Date.now(),
        title: `شراء مخزون: ${newItem.name}`,
        amount: newItem.totalCost,
        category: 'مشتريات مخزون',
        currency: settings.identity.defaultCurrency,
        date: today,
      });
      createdExpense = exp;
      setExpenses([exp, ...expenses]);
    }

    const targetClinicUid = cloudTargetUid;
    if (targetClinicUid) {
      ensureClinicDocumentInCloud(targetClinicUid, settings)
        .then(async () => {
          await saveInventoryItemToCloud(targetClinicUid, newItem);
          if (createdExpense) {
            await saveExpenseToCloud(targetClinicUid, createdExpense);
          }
        })
        .then(() => {
          notify(`تم حفظ الصنف (${newItem.name}) ومزامنته سحابياً`, 'success');
        })
        .catch(() => {
          notify(`تم حفظ الصنف (${newItem.name}) محلياً فقط — تعذر المزامنة السحابية`, 'warning');
        });
    } else {
      notify(`تم حفظ الصنف (${newItem.name})`, 'success');
    }
  };

  const handleQuickConsumeInventory = (id: string, amount = 1) => {
    if (!currentPermissions.canManageInventory && currentRole !== 'owner') {
      notify('غير مصرح لك بتعديل كميات المخزون.', 'error');
      return;
    }

    let updatedTarget: InventoryItem | null = null;
    const nextInventoryList = inventory.map((item) => {
      if (item.id !== id) return item;
      const nextQty = Math.max(0, +(Number(item.qty) - amount).toFixed(2));
      const updated = validateAndNormalizeInventoryItem({
        ...item,
        qty: nextQty,
        totalCost: +(nextQty * Number(item.unitPrice)).toFixed(2),
        updatedAt: new Date().toISOString().slice(0, 10),
      });
      updatedTarget = updated;
      return updated;
    });
    setInventory(nextInventoryList);

    const targetClinicUid = cloudTargetUid;
    if (targetClinicUid && updatedTarget) {
      saveInventoryItemToCloud(targetClinicUid, updatedTarget).catch(() => {
        notify('تم خصم الاستهلاك محلياً فقط — تعذر المزامنة السحابية', 'warning');
      });
    }
    notify('تم خصم الاستهلاك', 'info');
  };

  const handleQuickRestockInventory = (id: string, amount: number, recordExpense: boolean) => {
    if (!currentPermissions.canManageInventory && currentRole !== 'owner') {
      notify('غير مصرح لك بتعديل كميات المخزون.', 'error');
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    let nextExpensesList = expenses;
    let updatedTarget: InventoryItem | null = null;
    let restockExpense: ExpenseRecord | null = null;

    const nextInventoryList = inventory.map((item) => {
      if (item.id !== id) return item;
      const nextQty = +(Number(item.qty) + amount).toFixed(2);
      if (recordExpense && item.unitPrice > 0) {
        const exp = validateAndNormalizeExpense({
          id: 'exp_' + Date.now(),
          title: `تزويد مخزون: ${item.name}`,
          amount: +(amount * item.unitPrice).toFixed(2),
          category: 'مشتريات مخزون',
          currency: settings.identity.defaultCurrency,
          date: today,
        });
        restockExpense = exp;
        nextExpensesList = [exp, ...nextExpensesList];
        setExpenses(nextExpensesList);
      }
      const updated = validateAndNormalizeInventoryItem({
        ...item,
        qty: nextQty,
        totalCost: +(nextQty * Number(item.unitPrice)).toFixed(2),
        updatedAt: today,
      });
      updatedTarget = updated;
      return updated;
    });
    setInventory(nextInventoryList);

    const targetClinicUid = cloudTargetUid;
    if (targetClinicUid && updatedTarget) {
      saveInventoryItemToCloud(targetClinicUid, updatedTarget)
        .then(async () => {
          if (restockExpense) {
            await saveExpenseToCloud(targetClinicUid, restockExpense);
          }
        })
        .catch(() => {
          notify('تم تزويد المخزون محلياً فقط — تعذر المزامنة السحابية', 'warning');
        });
    }
    notify(`تم تزويد المخزون +${amount}`, 'success');
  };

  // Exactly 6 Non-Duplicate Core Sections (1-2 word titles)
  const navSections: NavSectionItem[] = [
    { id: 'receipt', title: 'سند جديد', icon: FileText },
    {
      id: 'records',
      title: 'السندات',
      icon: FileSpreadsheet,
      badge: pendingDebtsCount > 0 ? pendingDebtsCount : receipts.length,
    },
    {
      id: 'inventory',
      title: 'المخزون',
      icon: Package,
      badge: lowStockCount > 0 ? lowStockCount : undefined,
    },
    { id: 'finance', title: 'المالية', icon: Wallet },
    { id: 'assistant', title: 'المساعد', icon: Bot },
    { id: 'settings', title: 'الإعدادات', icon: Settings },
  ];

  const currentSectionObj =
    navSections.find((s) => s.id === activeSection) || navSections[0];

  return (
    <div
      className={`w-full max-w-full overflow-x-hidden flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 ${
        activeSection === 'assistant'
          ? 'h-[100dvh] max-h-[100dvh] overflow-hidden'
          : 'min-h-screen'
      }`}
    >
      {/* ==================== CLEAN NON-OVERLAPPING MOBILE HEADER ==================== */}
      <header className="shrink-0 sticky top-0 z-30 w-full border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs no-print">
        <div className="max-w-4xl mx-auto px-3 sm:px-6 h-14 flex items-center justify-between gap-2">
          {/* Right: Menu Button + Clear Page Title */}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <button
              type="button"
              onClick={() => setIsDrawerOpen(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 sm:py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 hover:border-sky-500 text-xs font-bold transition-colors shrink-0"
              aria-label="القائمة"
            >
              <Menu className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
              <span>القائمة</span>
            </button>

            <div className="min-w-0 flex-1">
              <div className="text-sm sm:text-base font-black text-slate-900 dark:text-slate-100 truncate">
                {currentSectionObj.title}
              </div>
              <div className="text-[10px] font-bold text-sky-600 dark:text-sky-400 truncate hidden sm:block">
                {settings.identity.clinicAr}
              </div>
            </div>
          </div>

          {/* Left: Back Button (Tablet/Desktop) + Cloud Button + Theme Toggle */}
          <div className="flex items-center gap-1.5 shrink-0">
            {activeSection !== 'receipt' && (
              <button
                type="button"
                onClick={() => navigateToSection('receipt')}
                className="hidden sm:inline-flex items-center gap-1 px-2.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 text-xs font-bold transition-colors shrink-0"
              >
                <ArrowRight className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                <span>رجوع</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsCloudModalOpen(true)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 sm:py-2 rounded-xl border text-xs font-bold transition-colors shrink-0 ${
                isCloudConnected
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                  : 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300'
              }`}
              title="الحساب"
            >
              <Cloud className="w-4 h-4 shrink-0" />
              <span>{isCloudConnected ? 'متصل' : 'الحساب'}</span>
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

              {/* PWA Section in Drawer */}
              <div className="pt-3 mt-3 border-t border-slate-200 dark:border-slate-800">
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
        currentRole={currentRole}
        onResendVerification={async () => {
          try {
            await resendVerificationEmail();
            notify('تم إرسال رابط تأكيد البريد الإلكتروني إلى بريدك بنجاح.', 'success');
          } catch {
            notify('تعذر إرسال رابط التأكيد حالياً.', 'error');
          }
        }}
        isSyncing={isSyncingCloud}
        onSignInGoogle={handleSignInWithGoogle}
        onDirectLogin={handleDirectClinicLogin}
        onSignOut={handleSignOut}
        onForceSyncNow={handleForceCloudSync}
        receiptsCount={receipts.length}
        inventoryCount={inventory.length}
        expensesCount={expenses.length}
        onAccountCreated={() => {
          pendingNewAccountRedirectRef.current = true;
          setIsNewAccountSetup(true);
          setActiveSection('settings');
          window.history.pushState({ section: 'settings' }, '', '#settings');
        }}
        notify={notify}
      />

      {/* ==================== MAIN PAGE VIEWPORT ==================== */}
      <main
        className={`flex-1 w-full max-w-4xl mx-auto ${
          activeSection === 'assistant'
            ? 'min-h-0 p-0 sm:px-6 sm:py-3 flex flex-col overflow-hidden'
            : 'px-3 sm:px-6 py-4 pb-6'
        }`}
      >
        {activeSection !== 'assistant' &&
          emailVerificationNotice &&
          currentUser &&
          currentUser.email &&
          !currentUser.email.endsWith('@clinic.alssaedic.local') &&
          !currentUser.emailVerified && (
          <div className="mb-4 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-3.5 py-3 flex flex-wrap items-center justify-between gap-2 no-print shadow-xs">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-amber-500 font-bold">⚠️</span>
              <span className="text-xs font-bold text-amber-900 dark:text-amber-200">
                بريدك الإلكتروني غير مؤكد بعد. يرجى تأكيد البريد الإلكتروني لتأمين مساحة العمل.
              </span>
            </div>
            <button
              type="button"
              onClick={async () => {
                try {
                  await resendVerificationEmail();
                  notify('تم إرسال رابط التأكيد إلى بريدك بنجاح', 'success');
                } catch {
                  notify('تعذر إرسال الرابط حالياً.', 'error');
                }
              }}
              className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition-colors shrink-0"
            >
              إعادة إرسال الرابط
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
              if (cloudTargetUid) {
                saveClinicSettingsToCloud(cloudTargetUid, nextSettings).catch(() => {
                  notify('تم حفظ التوقيع محلياً فقط — تعذر المزامنة السحابية', 'warning');
                });
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
              if (cloudTargetUid) {
                deleteInventoryItemFromCloud(cloudTargetUid, id)
                  .then(() => notify('تم حذف الصنف ومزامنة الحذف سحابياً', 'info'))
                  .catch(() => notify('تم حذف الصنف محلياً — تعذر المزامنة السحابية', 'warning'));
              } else {
                notify('تم حذف الصنف', 'info');
              }
            }}
            notify={notify}
          />
        )}

        {activeSection === 'finance' && (
          currentPermissions.canViewFinances || currentRole === 'owner' ? (
            <FinanceDashboard
              receipts={receipts}
              expenses={expenses}
              inventory={inventory}
              defaultCurrency={settings.identity.defaultCurrency}
              onAddExpense={(title, amount, category, currency) => {
                if (!currentPermissions.canManageExpenses && currentRole !== 'owner') {
                  notify('غير مصرح لك بإضافة مصروفات مالية.', 'error');
                  return;
                }
                const newExp = validateAndNormalizeExpense({
                  id: 'exp_' + Date.now(),
                  title,
                  amount,
                  category,
                  currency,
                  date: new Date().toISOString().slice(0, 10),
                });
                const nextExpensesList = [newExp, ...expenses];
                setExpenses(nextExpensesList);
                const targetClinicUid = cloudTargetUid;
                if (targetClinicUid) {
                  ensureClinicDocumentInCloud(targetClinicUid, settings)
                    .then(() => saveExpenseToCloud(targetClinicUid, newExp))
                    .then(() => notify('تم إضافة المصروف ومزامنته سحابياً', 'success'))
                    .catch(() =>
                      notify('تم إضافة المصروف محلياً فقط — تعذر المزامنة السحابية', 'warning')
                    );
                } else {
                  notify('تم إضافة المصروف', 'success');
                }
              }}
              onDeleteExpense={(id) => {
                if (!currentPermissions.canManageExpenses && currentRole !== 'owner') {
                  notify('غير مصرح لك بحذف المصروفات المالية.', 'error');
                  return;
                }
                const nextExpensesList = expenses.filter((e) => e.id !== id);
                setExpenses(nextExpensesList);
                const targetClinicUid = cloudTargetUid;
                if (targetClinicUid) {
                  deleteExpenseFromCloud(targetClinicUid, id)
                    .then(() => notify('تم حذف المصروف ومزامنة الحذف سحابياً', 'info'))
                    .catch(() =>
                      notify('تم حذف المصروف محلياً — تعذر المزامنة السحابية', 'warning')
                    );
                } else {
                  notify('تم حذف المصروف', 'info');
                }
              }}
              notify={notify}
            />
          ) : (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6 text-center space-y-2">
              <div className="text-sm font-black text-amber-900 dark:text-amber-200">
                صلاحية مقيدة: لوحة التقارير المالية
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-400">
                حسابك الحالي لا يمتلك صلاحية الاطلاع على التقارير المالية للعيادة.
              </div>
            </div>
          )
        )}

        {activeSection === 'assistant' && (
          currentPermissions.canUseAiAssistant || currentRole === 'owner' ? (
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
          ) : (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6 text-center space-y-2">
              <div className="text-sm font-black text-amber-900 dark:text-amber-200">
                صلاحية مقيدة: المساعد الذكي
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-400">
                حسابك الحالي لا يمتلك صلاحية استخدام المساعد الذكي.
              </div>
            </div>
          )
        )}

        {activeSection === 'settings' && (
          <ClinicSettingsPanel
            settings={settings}
            receipts={receipts}
            inventory={inventory}
            expenses={expenses}
            workspaceId={activeWorkspaceId}
            ownerUid={activeClinicOwnerUid || currentUser?.uid || 'local_owner'}
            ownerEmail={
              (currentRole === 'owner' &&
              currentUser?.email &&
              !currentUser.email.endsWith('@clinic.alssaedic.local')
                ? currentUser.email
                : null) ||
              settings.identity.ownerEmail ||
              currentUser?.email ||
              auth.currentUser?.email
            }
            isOwner={
              currentRole === 'owner' ||
              currentPermissions.canManageTeam ||
              !activeClinicOwnerUid ||
              activeClinicOwnerUid === currentUser?.uid
            }
            currentRole={currentRole}
            isNewAccountSetup={isNewAccountSetup}
            onDeleteService={(serviceId) => {
              if (!currentPermissions.canManageSettings && currentRole !== 'owner') {
                notify('غير مصرح لك بحذف خدمات العيادة (خاص بالمالك).', 'error');
                return;
              }
              const targetClinicUid = cloudTargetUid;
              if (targetClinicUid) {
                deleteServiceFromCloud(targetClinicUid, serviceId).catch(() => {});
              }
            }}
            onSaveSettings={(next) => {
              if (!currentPermissions.canManageSettings && currentRole !== 'owner') {
                notify('غير مصرح لك بتعديل إعدادات وهوية العيادة (خاص بالمالك).', 'error');
                return;
              }
              const normalizedNext: ClinicSettings = {
                ...next,
                identity: {
                  ...next.identity,
                  systemTitleAr: next.identity.clinicAr || next.identity.systemTitleAr,
                },
              };
              setSettings(normalizedNext);
              setIsNewAccountSetup(false);
              const targetClinicUid = cloudTargetUid;
              if (targetClinicUid) {
                setIsSyncingCloud(true);
                saveClinicSettingsToCloud(targetClinicUid, normalizedNext)
                  .then(() =>
                    Promise.all(
                      normalizedNext.services.map((srv) =>
                        saveServiceToCloud(targetClinicUid, srv)
                      )
                    )
                  )
                  .then(() => {
                    notify('تم حفظ إعدادات عيادتك ومزامنتها سحابياً بنجاح', 'success');
                  })
                  .catch(() => {
                    notify('تم حفظ الإعدادات محلياً فقط — تعذر المزامنة السحابية', 'warning');
                  })
                  .finally(() => {
                    setIsSyncingCloud(false);
                  });
              } else {
                notify('تم حفظ الإعدادات بنجاح', 'success');
              }
            }}
            onImportFullBackup={(payload) => {
              if (!currentPermissions.canManageSettings && currentRole !== 'owner') {
                notify('خاصية استعادة النسخ الاحتياطية مقصورة على مالك العيادة.', 'error');
                return;
              }
              const nextSettings = payload.settings || settings;
              const nextReceipts = Array.isArray(payload.receipts)
                ? payload.receipts.map(validateAndNormalizeReceipt)
                : receipts;
              const nextInventory = Array.isArray(payload.inventory)
                ? payload.inventory.map(validateAndNormalizeInventoryItem)
                : inventory;
              const nextExpenses = Array.isArray(payload.expenses)
                ? payload.expenses.map(validateAndNormalizeExpense)
                : expenses;

              if (payload.settings) setSettings(nextSettings);
              if (Array.isArray(payload.receipts)) setReceipts(nextReceipts);
              if (Array.isArray(payload.inventory)) setInventory(nextInventory);
              if (Array.isArray(payload.expenses)) setExpenses(nextExpenses);

              const targetUid = cloudTargetUid;
              if (targetUid) {
                syncLocalDataToCloud(
                  targetUid,
                  nextSettings,
                  nextReceipts,
                  nextInventory,
                  nextExpenses,
                  true
                ).catch(() => {
                  notify('تم استيراد النسخة الاحتياطية محلياً — تعذر المزامنة السحابية', 'warning');
                });
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
