import { initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  User,
  createUserWithEmailAndPassword,
  getAuth,
  getRedirectResult,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  initializeFirestore,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  setLogLevel,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  AIProviderConfig,
  ClinicSettings,
  ConsumedMaterialEntry,
  CurrencyCode,
  DEFAULT_AI_CONFIG,
  DentalServiceItem,
  ExpenseRecord,
  InventoryItem,
  MaterialConsumptionType,
  ReceiptRecord,
  ServiceMaterialRule,
  TelegramBackupSettings,
  ClinicSubscription,
  WorkspaceRole,
  WorkspacePermissions,
  WorkspaceMember,
  DEFAULT_ROLE_PERMISSIONS,
} from './types/clinic';
import { DEFAULT_SETTINGS, SEED_DEMO_IDS, isPlatformDeveloperUser } from './data/defaultData';
import { saveAIProviderConfig } from './utils/aiClient';
import { numberToArabicWords } from './utils/arabicTafqeet';

export const CUSTOM_FIREBASE_CONFIG_KEY = 'docai_custom_firebase_config_v1';

export interface CustomFirebaseConfig {
  apiKey: string;
  projectId: string;
  authDomain?: string;
  storageBucket?: string;
  appId?: string;
  messagingSenderId?: string;
  measurementId?: string;
  firestoreDatabaseId?: string;
}

const firebaseConfig: CustomFirebaseConfig = {
  apiKey: 'AIzaSyDpjGbZRvLLpKCSKaNPeb1r3cE8Bfvx0jU',
  authDomain: 'u-dental-app.firebaseapp.com',
  projectId: 'u-dental-app',
  storageBucket: 'u-dental-app.firebasestorage.app',
  messagingSenderId: '704742320052',
  appId: '1:704742320052:web:57e829a8fdc182ee32b4e1',
  measurementId: 'G-4LG6PJHFLN',
  firestoreDatabaseId: '(default)',
};

function resolveEffectiveFirebaseConfig(): {
  config: CustomFirebaseConfig;
  isCustomProject: boolean;
  databaseId: string;
} {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env || {};
  const envApiKey = String(env.VITE_FIREBASE_API_KEY || '').trim();
  const envProjectId = String(env.VITE_FIREBASE_PROJECT_ID || '').trim();

  if (envApiKey && envProjectId) {
    const envDbId = String(env.VITE_FIREBASE_DATABASE_ID || '').trim();
    return {
      config: {
        apiKey: envApiKey,
        projectId: envProjectId,
        authDomain:
          String(env.VITE_FIREBASE_AUTH_DOMAIN || '').trim() ||
          `${envProjectId}.firebaseapp.com`,
        storageBucket:
          String(env.VITE_FIREBASE_STORAGE_BUCKET || '').trim() ||
          `${envProjectId}.firebasestorage.app`,
        appId: String(env.VITE_FIREBASE_APP_ID || '').trim() || firebaseConfig.appId,
        messagingSenderId:
          String(env.VITE_FIREBASE_MESSAGING_SENDER_ID || '').trim() ||
          firebaseConfig.messagingSenderId,
        firestoreDatabaseId: envDbId || '(default)',
      },
      isCustomProject: true,
      databaseId: envDbId || '(default)',
    };
  }

  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const rawCustom = window.localStorage.getItem(CUSTOM_FIREBASE_CONFIG_KEY);
      if (rawCustom) {
        const parsed = JSON.parse(rawCustom) as Partial<CustomFirebaseConfig>;
        let customApiKey = String(parsed?.apiKey || '').trim();
        const customProjectId = String(parsed?.projectId || '').trim();
        // If project is u-dental-app, ensure exact valid API key is used
        if (customProjectId === 'u-dental-app' && (customApiKey === 'AIzaSyDpjGbZrVLLOKCSkaNPeb1r3cE8Bfvx0jU' || !customApiKey)) {
          customApiKey = 'AIzaSyDpjGbZRvLLpKCSKaNPeb1r3cE8Bfvx0jU';
          try {
            window.localStorage.setItem(CUSTOM_FIREBASE_CONFIG_KEY, JSON.stringify({
              ...parsed,
              apiKey: customApiKey,
            }));
          } catch {
            // Ignore
          }
        }
        if (customApiKey && customProjectId && customProjectId !== 'refined-domain-53rp2') {
          const customDbId = String(parsed?.firestoreDatabaseId || '').trim();
          return {
            config: {
              apiKey: customApiKey,
              projectId: customProjectId,
              authDomain:
                String(parsed?.authDomain || '').trim() ||
                `${customProjectId}.firebaseapp.com`,
              storageBucket:
                String(parsed?.storageBucket || '').trim() ||
                `${customProjectId}.firebasestorage.app`,
              appId: String(parsed?.appId || '').trim() || firebaseConfig.appId,
              messagingSenderId:
                String(parsed?.messagingSenderId || '').trim() ||
                firebaseConfig.messagingSenderId,
              firestoreDatabaseId: customDbId || '(default)',
            },
            isCustomProject: true,
            databaseId: customDbId || '(default)',
          };
        }
      }
    }
  } catch {
    // Ignore localStorage parse error and fall back to firebaseConfig
  }

  const fallbackDbId = String(firebaseConfig.firestoreDatabaseId || '').trim();
  return {
    config: firebaseConfig,
    isCustomProject: true,
    databaseId: fallbackDbId || '(default)',
  };
}

const resolvedFirebase = resolveEffectiveFirebaseConfig();
const app = initializeApp(resolvedFirebase.config);
setLogLevel('silent');

const shouldUseCustomDatabaseId = Boolean(
  resolvedFirebase.databaseId && resolvedFirebase.databaseId !== '(default)'
);

export const db = shouldUseCustomDatabaseId
  ? initializeFirestore(
      app,
      {
        experimentalForceLongPolling: true,
      },
      resolvedFirebase.databaseId
    )
  : initializeFirestore(app, {
      experimentalForceLongPolling: true,
    });
export const auth = getAuth(app);

// Validate connection to Firestore on boot
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firestore is running in offline persistence mode; changes will sync upon reconnection.');
    }
  }
}
testConnection();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// ==================== RELIABLE CLOUD RETRY HELPER ====================
export async function withCloudRetry<T>(
  operation: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 350
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
      if (
        msg.includes('permission-denied') ||
        msg.includes('missing or insufficient permissions') ||
        msg.includes('unauthenticated') ||
        msg.includes('invalid-credential') ||
        msg.includes('wrong-password')
      ) {
        throw err;
      }
      if (attempt < maxAttempts) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

// ==================== DEFENSIVE SANITIZATION & FINANCIAL VALIDATION ====================
export function sanitizeId(id: string): string {
  const cleaned = String(id || '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 128);
  return cleaned || 'doc_' + Date.now();
}

export function sanitizeStr(val: unknown, maxLen: number, fallback = ''): string {
  const str = String(val ?? '').trim();
  const effective = str.length > 0 ? str : fallback;
  return effective.slice(0, maxLen);
}

export function sanitizeNum(val: unknown, min = 0, max = 1000000000): number {
  const num = Number(val);
  if (!Number.isFinite(num)) return min;
  return Math.min(max, Math.max(min, num));
}

const SERVICE_RECIPE_PREFIX = '__mr__:';
const SERVICE_SESSIONS_PREFIX = '__sess__:';
const INV_META_REGEX = /\s*\[\[invmeta:([^\]]+)\]\]$/;
const REC_CM_REGEX = /\s*\[\[cm:([^\]]+)\]\]$/;

function encodeServiceMaterialRulesToKeywords(
  baseKeywords: string[],
  serviceName: string,
  recipe?: ServiceMaterialRule[],
  totalSessions?: number
): string[] {
  const cleanKeywords = (Array.isArray(baseKeywords) && baseKeywords.length > 0
    ? baseKeywords
    : [serviceName]
  )
    .map((k) => String(k || '').trim())
    .filter((k) => k.length > 0 && !k.startsWith(SERVICE_RECIPE_PREFIX) && !k.startsWith(SERVICE_SESSIONS_PREFIX))
    .slice(0, 8)
    .map((k) => sanitizeStr(k, 80, serviceName));

  const extraMeta: string[] = [];
  const safeSessions = Math.max(1, Math.min(20, Math.round(Number(totalSessions) || 1)));
  if (safeSessions > 1) {
    extraMeta.push(`${SERVICE_SESSIONS_PREFIX}${safeSessions}`);
  }

  const encodedRules: string[] = [];
  if (Array.isArray(recipe)) {
    for (const rule of recipe.slice(0, 10)) {
      if (!rule || !rule.materialId) continue;
      const matId = String(rule.materialId).replace(/[|\s]/g, '').slice(0, 36);
      const cType =
        rule.consumptionType === 'by_tooth_type' ||
        rule.consumptionType === 'per_tooth_unit' ||
        rule.consumptionType === 'per_arch'
          ? rule.consumptionType
          : 'per_session';
      const qFix = +(Number(rule.qtyFixed) || 0).toFixed(4);
      const qAnt = +(Number(rule.qtyAnterior) || 0).toFixed(4);
      const qMol = +(Number(rule.qtyMolar) || 0).toFixed(4);
      const sNum =
        rule.sessionNumber === 'all'
          ? 'all'
          : Math.max(1, Math.min(20, Math.round(Number(rule.sessionNumber) || 1)));
      const token = `${SERVICE_RECIPE_PREFIX}${matId}|${cType}|${qFix}|${qAnt}|${qMol}|${sNum}`.slice(0, 80);
      encodedRules.push(token);
    }
  }

  const combined = [...cleanKeywords, ...extraMeta, ...encodedRules].slice(0, 20);
  return combined.length > 0 ? combined : [sanitizeStr(serviceName, 80, 'خدمة علاجية')];
}

function decodeServiceKeywordsAndRecipe(
  rawKeywords: unknown,
  serviceName: string
): { keywords: string[]; materialsRecipe: ServiceMaterialRule[]; totalSessions: number } {
  const list = Array.isArray(rawKeywords)
    ? rawKeywords.map((k) => String(k || '').trim()).filter(Boolean)
    : [];
  const keywords: string[] = [];
  const materialsRecipe: ServiceMaterialRule[] = [];
  let totalSessions = 1;

  for (const entry of list) {
    if (entry.startsWith(SERVICE_SESSIONS_PREFIX)) {
      const parsedSess = parseInt(entry.slice(SERVICE_SESSIONS_PREFIX.length), 10);
      if (Number.isFinite(parsedSess) && parsedSess >= 1) {
        totalSessions = parsedSess;
      }
    } else if (entry.startsWith(SERVICE_RECIPE_PREFIX)) {
      const payload = entry.slice(SERVICE_RECIPE_PREFIX.length);
      const [matId, cTypeRaw, qFixRaw, qAntRaw, qMolRaw, sNumRaw] = payload.split('|');
      if (matId) {
        const consumptionType: MaterialConsumptionType =
          cTypeRaw === 'by_tooth_type' ||
          cTypeRaw === 'per_tooth_unit' ||
          cTypeRaw === 'per_arch'
            ? cTypeRaw
            : 'per_session';
        const sessionNumber: number | 'all' =
          sNumRaw === 'all'
            ? 'all'
            : (Number(sNumRaw) && Number(sNumRaw) > 0 ? Number(sNumRaw) : 1);
        materialsRecipe.push({
          materialId: matId,
          consumptionType,
          qtyFixed: +(Number(qFixRaw) || 0).toFixed(4),
          qtyAnterior: +(Number(qAntRaw) || 0).toFixed(4),
          qtyMolar: +(Number(qMolRaw) || 0).toFixed(4),
          sessionNumber,
        });
      }
    } else {
      keywords.push(entry);
    }
  }

  return {
    keywords: keywords.length > 0 ? keywords : [serviceName],
    materialsRecipe,
    totalSessions,
  };
}

function encodeInventoryCategoryWithMeta(item: InventoryItem): string {
  const cleanNotes = String(item.notes || '').replace(INV_META_REGEX, '').trim();
  const loc = item.location === 'lab' ? 'lab' : 'clinic';
  const pkg = Math.max(0.0001, +(Number(item.packageSize) || 1).toFixed(4));
  const uUnit = String(item.usageUnit || item.unit || 'قطعة')
    .replace(/[|\]]/g, '')
    .trim()
    .slice(0, 20);
  const sub = Math.max(
    0,
    +(
      Number.isFinite(Number(item.remainingSubUnits))
        ? Number(item.remainingSubUnits)
        : (Number(item.qty) || 0) * pkg
    ).toFixed(4)
  );
  const metaSuffix = `[[invmeta:${loc}|${pkg}|${uUnit}|${sub}]]`;
  const maxNotesLen = Math.max(10, 158 - metaSuffix.length);
  const baseText = (cleanNotes || 'مستلزمات سنية').slice(0, maxNotesLen);
  return `${baseText} ${metaSuffix}`.slice(0, 160);
}

function decodeInventoryCategoryWithMeta(
  rawCategory: unknown,
  qty: number,
  defaultUnit: string
): {
  notes: string;
  location: 'clinic' | 'lab';
  packageSize: number;
  usageUnit: string;
  remainingSubUnits: number;
} {
  const rawStr = String(rawCategory || '').trim();
  const match = rawStr.match(INV_META_REGEX);
  const cleanNotes = rawStr.replace(INV_META_REGEX, '').trim();

  if (!match) {
    return {
      notes: cleanNotes === 'مستلزمات سنية' ? '' : cleanNotes,
      location: 'clinic',
      packageSize: 1,
      usageUnit: defaultUnit || 'قطعة',
      remainingSubUnits: Math.max(0, +(qty * 1).toFixed(4)),
    };
  }

  const [locRaw, pkgRaw, uUnitRaw, subRaw] = match[1].split('|');
  const location: 'clinic' | 'lab' = locRaw === 'lab' ? 'lab' : 'clinic';
  const parsedPkg = Number(pkgRaw);
  const packageSize = Number.isFinite(parsedPkg) && parsedPkg > 0 ? +parsedPkg.toFixed(4) : 1;
  const usageUnit = (uUnitRaw || '').trim() || defaultUnit || 'قطعة';
  const parsedSub = Number(subRaw);
  const remainingSubUnits =
    Number.isFinite(parsedSub) && parsedSub >= 0
      ? +parsedSub.toFixed(4)
      : Math.max(0, +(qty * packageSize).toFixed(4));

  return {
    notes: cleanNotes === 'مستلزمات سنية' ? '' : cleanNotes,
    location,
    packageSize,
    usageUnit,
    remainingSubUnits,
  };
}

function encodeReceiptNotesWithConsumedMaterials(
  notes: string,
  consumedMaterials?: ConsumedMaterialEntry[]
): string {
  const cleanNotes = String(notes || '').replace(REC_CM_REGEX, '').trim();
  if (!Array.isArray(consumedMaterials) || consumedMaterials.length === 0) {
    return sanitizeStr(cleanNotes, 500, '');
  }
  const tokens = consumedMaterials
    .filter((c) => c && c.materialId && Number(c.amountDeducted) > 0)
    .slice(0, 15)
    .map(
      (c) =>
        `${String(c.materialId).replace(/[,=\]]/g, '').slice(0, 32)}=${+(Number(c.amountDeducted) || 0).toFixed(4)}`
    );
  if (tokens.length === 0) {
    return sanitizeStr(cleanNotes, 500, '');
  }
  const suffix = `[[cm:${tokens.join(',')}]]`;
  const maxBase = Math.max(0, 498 - suffix.length);
  const trimmedNotes = cleanNotes.slice(0, maxBase);
  return trimmedNotes ? `${trimmedNotes} ${suffix}` : suffix;
}

function decodeReceiptNotesAndConsumedMaterials(rawNotes: unknown): {
  notes: string;
  consumedMaterials?: ConsumedMaterialEntry[];
} {
  const str = String(rawNotes || '');
  const match = str.match(REC_CM_REGEX);
  const cleanNotes = str.replace(REC_CM_REGEX, '').trim();
  if (!match) {
    return { notes: cleanNotes };
  }
  const consumedMaterials: ConsumedMaterialEntry[] = [];
  for (const pair of match[1].split(',')) {
    const [matId, amtStr] = pair.split('=');
    const amt = Number(amtStr);
    if (matId && Number.isFinite(amt) && amt > 0) {
      consumedMaterials.push({
        materialId: matId.trim(),
        amountDeducted: +amt.toFixed(4),
      });
    }
  }
  return {
    notes: cleanNotes,
    ...(consumedMaterials.length > 0 ? { consumedMaterials } : {}),
  };
}

export function validateAndNormalizeReceipt(receipt: ReceiptRecord): ReceiptRecord {
  const rawTotal = Number(receipt.totalAmount);
  const rawPaid = Number(receipt.paidAmount);
  if (!Number.isFinite(rawTotal) || rawTotal < 0) {
    throw new Error('قيمة إجمالي السند المالي غير صالحة.');
  }
  if (!Number.isFinite(rawPaid) || rawPaid < 0) {
    throw new Error('قيمة المبلغ المدفوع في السند غير صالحة.');
  }
  const totalAmount = Math.round(sanitizeNum(rawTotal, 0, 1000000000));
  const paidAmount = Math.round(sanitizeNum(Math.min(totalAmount, rawPaid), 0, totalAmount));
  // Exact subtraction so Firestore rule `data.remainingAmount == data.totalAmount - data.paidAmount` always passes
  const remainingAmount = Math.max(0, totalAmount - paidAmount);
  const currency = sanitizeStr(receipt.currency, 40, 'ريال يمني') as CurrencyCode;
  const patientName = sanitizeStr(receipt.patientName, 160, '');
  if (!patientName) {
    throw new Error('اسم المريض مطلوب لحفظ السند المالي.');
  }

  const decodedNotes = decodeReceiptNotesAndConsumedMaterials(receipt.notes);
  const normalizedConsumed = Array.isArray(receipt.consumedMaterials)
    ? receipt.consumedMaterials
        .filter((c) => c && c.materialId && Number(c.amountDeducted) > 0)
        .map((c) => ({
          materialId: String(c.materialId),
          amountDeducted: +(Number(c.amountDeducted) || 0).toFixed(4),
        }))
    : decodedNotes.consumedMaterials;

  return {
    ...receipt,
    id: sanitizeId(receipt.id || `rec_${Date.now()}`),
    receiptNo: Math.round(sanitizeNum(receipt.receiptNo, 1, 99999999)),
    date: sanitizeStr(receipt.date, 30, new Date().toISOString().slice(0, 10)),
    patientName,
    patientPhone: sanitizeStr(receipt.patientPhone, 50, ''),
    services: (() => {
      const cleaned = (Array.isArray(receipt.services) ? receipt.services : [])
        .map((s) =>
          sanitizeStr(s, 140, '')
            .replace(/تجليح\s*لثة|تجليح\s*اللثة/g, 'تقليح اللثة')
            .replace(/تجليح/g, 'تقليح')
        )
        .filter(Boolean)
        .slice(0, 25);
      return cleaned.length > 0 ? cleaned : ['كشف ومعاينة'];
    })(),
    toothFDI: sanitizeStr(receipt.toothFDI, 200, ''),
    totalAmount,
    paidAmount,
    remainingAmount,
    currency,
    paymentMethod: sanitizeStr(receipt.paymentMethod, 80, 'نقداً (Cash)'),
    notes: sanitizeStr(decodedNotes.notes, 500, ''),
    amountWords: sanitizeStr(
      receipt.amountWords || numberToArabicWords(paidAmount, currency),
      300,
      'صفر ريال يمني فقط لا غير'
    ),
    accountantSig: sanitizeStr(receipt.accountantSig, 250000, ''),
    receiverSig: sanitizeStr(receipt.receiverSig, 250000, ''),
    paperFormat: receipt.paperFormat === 'thermal80' ? 'thermal80' : 'a5',
    createdAt: sanitizeStr(receipt.createdAt, 40, new Date().toISOString()),
    ...(normalizedConsumed && normalizedConsumed.length > 0
      ? { consumedMaterials: normalizedConsumed }
      : {}),
  };
}

export function validateAndNormalizeInventoryItem(item: InventoryItem): InventoryItem {
  const name = sanitizeStr(item.name, 160, '');
  if (!name) {
    throw new Error('اسم الصنف الطبي مطلوب.');
  }
  const unit = sanitizeStr(item.unit, 50, 'قطعة');
  const location: 'clinic' | 'lab' = item.location === 'lab' ? 'lab' : 'clinic';
  const rawPkg = Number(item.packageSize);
  const packageSize = Number.isFinite(rawPkg) && rawPkg > 0 ? +rawPkg.toFixed(4) : 1;
  const usageUnit = sanitizeStr(item.usageUnit, 50, unit);
  const qty = sanitizeNum(item.qty, 0, 1000000);
  const rawSub = Number(item.remainingSubUnits);
  const remainingSubUnits =
    Number.isFinite(rawSub) && rawSub >= 0
      ? +rawSub.toFixed(4)
      : Math.max(0, +(qty * packageSize).toFixed(4));
  const minQty = sanitizeNum(item.minQty, 0, 1000000);
  const unitPrice = sanitizeNum(item.unitPrice, 0, 100000000);
  const totalCost = sanitizeNum(+(qty * unitPrice).toFixed(2), 0, 1000000000);
  const cleanNotes = String(item.notes || '').replace(INV_META_REGEX, '').trim();

  return {
    ...item,
    id: sanitizeId(item.id || `inv_${Date.now()}`),
    name,
    notes: sanitizeStr(cleanNotes, 160, ''),
    qty,
    minQty,
    unit,
    unitPrice,
    totalCost,
    linkedService: sanitizeStr(item.linkedService, 140, ''),
    updatedAt: sanitizeStr(item.updatedAt, 30, new Date().toISOString().slice(0, 10)),
    location,
    packageSize,
    usageUnit,
    remainingSubUnits,
  };
}

export function validateAndNormalizeExpense(expense: ExpenseRecord): ExpenseRecord {
  const title = sanitizeStr(expense.title, 200, '');
  if (!title) {
    throw new Error('عنوان المصروف مطلوب.');
  }
  const amount = sanitizeNum(expense.amount, 0, 1000000000);
  return {
    ...expense,
    id: sanitizeId(expense.id || `exp_${Date.now()}`),
    title,
    amount,
    category: sanitizeStr(expense.category, 100, 'تشغيل'),
    currency: sanitizeStr(expense.currency, 40, 'ريال يمني') as CurrencyCode,
    date: sanitizeStr(expense.date, 30, new Date().toISOString().slice(0, 10)),
  };
}

// ==================== NON-DESTRUCTIVE RECORD MERGE HELPERS ====================
function mergeByIdPreservingExisting<T extends { id: string }>(
  cloudItems: T[],
  localItems: T[]
): T[] {
  const map = new Map<string, T>();
  for (const item of localItems) {
    if (item && item.id) {
      map.set(item.id, item);
    }
  }
  for (const item of cloudItems) {
    if (item && item.id) {
      map.set(item.id, item);
    }
  }
  return Array.from(map.values());
}

// ==================== PERSISTENT PENDING SYNC QUEUE ====================
// Guarantees zero data loss across page refreshes, offline periods, or concurrent onSnapshot events
const PENDING_SYNC_STORAGE_PREFIX = 'docai_pending_sync_v1_';

interface PendingClinicSyncState {
  settings?: ClinicSettings;
  upserts: {
    services: Record<string, DentalServiceItem>;
    receipts: Record<string, ReceiptRecord>;
    inventory: Record<string, InventoryItem>;
    expenses: Record<string, ExpenseRecord>;
  };
  deletes: {
    services: string[];
    receipts: string[];
    inventory: string[];
    expenses: string[];
  };
}

function getEmptyPendingSyncState(): PendingClinicSyncState {
  return {
    upserts: {
      services: {},
      receipts: {},
      inventory: {},
      expenses: {},
    },
    deletes: {
      services: [],
      receipts: [],
      inventory: [],
      expenses: [],
    },
  };
}

function loadPendingSyncState(uid: string): PendingClinicSyncState {
  try {
    const safeUid = sanitizeId(uid);
    const raw = localStorage.getItem(`${PENDING_SYNC_STORAGE_PREFIX}${safeUid}`);
    if (!raw) return getEmptyPendingSyncState();
    const parsed = JSON.parse(raw) as Partial<PendingClinicSyncState>;
    return {
      settings: parsed?.settings,
      upserts: {
        services: parsed?.upserts?.services || {},
        receipts: parsed?.upserts?.receipts || {},
        inventory: parsed?.upserts?.inventory || {},
        expenses: parsed?.upserts?.expenses || {},
      },
      deletes: {
        services: Array.isArray(parsed?.deletes?.services) ? parsed.deletes.services : [],
        receipts: Array.isArray(parsed?.deletes?.receipts) ? parsed.deletes.receipts : [],
        inventory: Array.isArray(parsed?.deletes?.inventory) ? parsed.deletes.inventory : [],
        expenses: Array.isArray(parsed?.deletes?.expenses) ? parsed.deletes.expenses : [],
      },
    };
  } catch {
    return getEmptyPendingSyncState();
  }
}

function savePendingSyncState(uid: string, state: PendingClinicSyncState): void {
  try {
    const safeUid = sanitizeId(uid);
    localStorage.setItem(`${PENDING_SYNC_STORAGE_PREFIX}${safeUid}`, JSON.stringify(state));
  } catch {
    // Ignore storage quota errors
  }
}

function markPendingUpsert<K extends keyof PendingClinicSyncState['upserts']>(
  uid: string,
  collectionKey: K,
  id: string,
  item: PendingClinicSyncState['upserts'][K][string]
): void {
  const state = loadPendingSyncState(uid);
  state.upserts[collectionKey][id] = item;
  state.deletes[collectionKey] = state.deletes[collectionKey].filter((delId) => delId !== id);
  savePendingSyncState(uid, state);
}

function clearPendingUpsert<K extends keyof PendingClinicSyncState['upserts']>(
  uid: string,
  collectionKey: K,
  id: string
): void {
  const state = loadPendingSyncState(uid);
  if (id in state.upserts[collectionKey]) {
    delete state.upserts[collectionKey][id];
    savePendingSyncState(uid, state);
  }
}

function markPendingDelete<K extends keyof PendingClinicSyncState['deletes']>(
  uid: string,
  collectionKey: K,
  id: string
): void {
  const state = loadPendingSyncState(uid);
  delete state.upserts[collectionKey][id];
  if (!state.deletes[collectionKey].includes(id)) {
    state.deletes[collectionKey].push(id);
  }
  savePendingSyncState(uid, state);
}

function clearPendingDelete<K extends keyof PendingClinicSyncState['deletes']>(
  uid: string,
  collectionKey: K,
  id: string
): void {
  const state = loadPendingSyncState(uid);
  const next = state.deletes[collectionKey].filter((delId) => delId !== id);
  if (next.length !== state.deletes[collectionKey].length) {
    state.deletes[collectionKey] = next;
    savePendingSyncState(uid, state);
  }
}

const LOCAL_COLLECTION_STORAGE_KEYS: Record<
  keyof PendingClinicSyncState['upserts'],
  string | null
> = {
  services: null,
  receipts: 'docai_gemini_receipts_v3',
  inventory: 'docai_gemini_inventory_v3',
  expenses: 'docai_gemini_expenses_v3',
};

function readLocalScopedCollectionItems<T extends { id: string }>(
  uid: string,
  collectionKey: keyof PendingClinicSyncState['upserts']
): T[] {
  const baseKey = LOCAL_COLLECTION_STORAGE_KEYS[collectionKey];
  if (!baseKey || typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const safeUid = sanitizeId(uid);
    const raw = window.localStorage.getItem(`${baseKey}_${safeUid}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const demoSet =
      collectionKey === 'receipts'
        ? SEED_DEMO_IDS.receipts
        : collectionKey === 'inventory'
          ? SEED_DEMO_IDS.inventory
          : collectionKey === 'expenses'
            ? SEED_DEMO_IDS.expenses
            : null;
    return parsed.filter(
      (item): item is T =>
        Boolean(item && typeof item.id === 'string' && (!demoSet || !demoSet.has(item.id)))
    );
  } catch {
    return [];
  }
}

export function getDeletedRecordIds(
  uid: string,
  collectionKey: keyof PendingClinicSyncState['deletes']
): Set<string> {
  const state = loadPendingSyncState(uid);
  return new Set(state.deletes[collectionKey]);
}

function applyPendingQueueToItems<T extends { id: string }>(
  uid: string,
  collectionKey: keyof PendingClinicSyncState['upserts'],
  cloudItems: T[]
): T[] {
  const state = loadPendingSyncState(uid);
  const deleteSet = new Set(state.deletes[collectionKey]);
  const pendingUpsertsMap = state.upserts[collectionKey] as unknown as Record<string, T>;
  const localItems = readLocalScopedCollectionItems<T>(uid, collectionKey);

  const resultMap = new Map<string, T>();
  // 1. Preserve any existing local records that haven't been deleted
  for (const localItem of localItems) {
    if (localItem && localItem.id && !deleteSet.has(localItem.id)) {
      resultMap.set(localItem.id, localItem);
    }
  }
  // 2. Apply authoritative cloud records
  for (const item of cloudItems) {
    if (item && item.id && !deleteSet.has(item.id)) {
      resultMap.set(item.id, item);
    }
  }
  // 3. Apply latest pending local upserts on top
  for (const [id, pendingItem] of Object.entries(pendingUpsertsMap)) {
    if (pendingItem && !deleteSet.has(id)) {
      resultMap.set(id, pendingItem);
    }
  }
  return Array.from(resultMap.values());
}

// Track verified parent clinic documents in memory so child writes never fail `hasClinicParent`
const verifiedClinicParentUids = new Set<string>();
const pendingClinicParentCreation = new Map<string, Promise<boolean>>();
const latestSettingsCacheByUid = new Map<string, ClinicSettings>();
// Fast in-memory cache of confirmed documents to eliminate redundant pre-read network calls
const knownExistingDocIds = new Set<string>();

export function getPendingSyncOperationsCount(uid?: string | null): number {
  const targetUid = uid || auth.currentUser?.uid;
  if (!targetUid) return 0;
  const state = loadPendingSyncState(targetUid);
  return (
    (state.settings ? 1 : 0) +
    Object.keys(state.upserts.services).length +
    Object.keys(state.upserts.receipts).length +
    Object.keys(state.upserts.inventory).length +
    Object.keys(state.upserts.expenses).length +
    state.deletes.services.length +
    state.deletes.receipts.length +
    state.deletes.inventory.length +
    state.deletes.expenses.length
  );
}

export interface ActiveCloudDiagnostics {
  projectId: string;
  databaseId: string;
  isCustomProject: boolean;
  connectedEmail: string | null;
  ownerUid: string | null;
  pendingSyncCount: number;
}

export function getActiveCloudDiagnostics(
  overrideOwnerUid?: string | null,
  fallbackOwnerEmail?: string | null
): ActiveCloudDiagnostics {
  const rawUser = auth.currentUser;
  const effectiveOwnerUid = overrideOwnerUid || rawUser?.uid || null;
  const providerEmail = rawUser?.providerData?.find((p) => p?.email)?.email || null;
  const rawAuthEmail = rawUser?.email || providerEmail || null;

  let resolvedEmail: string | null = null;
  if (rawAuthEmail && !rawAuthEmail.endsWith('@clinic.alssaedic.local')) {
    resolvedEmail = rawAuthEmail;
  } else if (fallbackOwnerEmail && fallbackOwnerEmail.includes('@') && !fallbackOwnerEmail.endsWith('.local')) {
    resolvedEmail = fallbackOwnerEmail;
  } else {
    try {
      const cachedEmail =
        typeof window !== 'undefined' && window.localStorage
          ? window.localStorage.getItem('docai_owner_email_alssaedy-clinic')
          : null;
      if (cachedEmail && cachedEmail.includes('@') && !cachedEmail.endsWith('.local')) {
        resolvedEmail = cachedEmail;
      }
    } catch {
      // Ignore storage access error
    }
  }

  if (!resolvedEmail && rawUser) {
    resolvedEmail = isSuperAdminEmail(rawUser.email) ? 'alssaedy50@gmail.com' : (rawUser.email || null);
  }

  return {
    projectId: resolvedFirebase.config.projectId || firebaseConfig.projectId,
    databaseId: shouldUseCustomDatabaseId ? resolvedFirebase.databaseId : '(default)',
    isCustomProject: resolvedFirebase.isCustomProject,
    connectedEmail: resolvedEmail,
    ownerUid: effectiveOwnerUid,
    pendingSyncCount: getPendingSyncOperationsCount(effectiveOwnerUid),
  };
}

// ==================== SERVER SESSION TOKEN ISSUANCE ====================
export async function issueServerSessionToken(params: {
  clinicId: string;
  ownerUid: string;
  password?: string;
  storedPasswordVerifier?: string;
}): Promise<{
  ok: boolean;
  sessionToken: string;
  expiresAt: string;
  passwordVerifier?: string;
  error?: string;
}> {
  try {
    const res = await fetch('/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const rawText = await res.text();
    if (!rawText || rawText.trim().startsWith('<')) {
      return {
        ok: false,
        sessionToken: '',
        expiresAt: '',
        error: 'تعذر التحقق من جلسة الخادم.',
      };
    }
    const parsed = JSON.parse(rawText);
    if (!res.ok || !parsed?.ok || !parsed?.sessionToken) {
      return {
        ok: false,
        sessionToken: '',
        expiresAt: '',
        error: parsed?.error || 'فشل التحقق من بيانات جلسة الأمان.',
      };
    }
    return {
      ok: true,
      sessionToken: String(parsed.sessionToken),
      expiresAt: String(parsed.expiresAt),
      passwordVerifier: parsed.passwordVerifier ? String(parsed.passwordVerifier) : undefined,
    };
  } catch {
    return {
      ok: false,
      sessionToken: '',
      expiresAt: '',
      error: 'تعذر الاتصال بخادم المصادقة.',
    };
  }
}

// ==================== AUTHENTICATION ====================
export async function signInWithGoogleAccount(forceRedirect = false): Promise<User | null> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  const isMobile =
    typeof navigator !== 'undefined' &&
    /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  if (forceRedirect) {
    await signInWithRedirect(auth, provider);
    return null;
  }

  try {
    const result = await signInWithPopup(auth, provider);
    return result.user;
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code || '';
    if (
      isMobile &&
      (code === 'auth/popup-blocked' ||
        code === 'auth/popup-closed-by-user' ||
        code === 'auth/cancelled-popup-request')
    ) {
      await signInWithRedirect(auth, provider);
      return null;
    }
    throw err;
  }
}

export async function handleRedirectAuthResult(): Promise<User | null> {
  try {
    const result = await getRedirectResult(auth);
    return result?.user || null;
  } catch (err) {
    console.warn('Redirect auth result error:', err);
    throw err;
  }
}

const BLOCKED_DISPOSABLE_DOMAINS = new Set([
  'tempmail.com',
  'temp-mail.org',
  '10minutemail.com',
  'guerrillamail.com',
  'mailinator.com',
  'trashmail.com',
  'yopmail.com',
  'sharklasers.com',
  'dispostable.com',
  'fakeinbox.com',
  'generator.email',
  'getairmail.com',
  'maildrop.cc',
  'throwawaymail.com',
  'mohmal.com',
  'crazymailing.com',
  'nada.ltd',
  'inboxbear.com',
]);

const STRICT_EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

export function isValidRealEmail(email: string): boolean {
  const clean = String(email || '').trim().toLowerCase();
  if (!clean || clean.length < 6 || clean.length > 120) return false;
  if (!STRICT_EMAIL_REGEX.test(clean)) return false;

  const parts = clean.split('@');
  if (parts.length !== 2) return false;
  const [localPart, domain] = parts;
  if (!localPart || !domain) return false;

  // Reject local and synthetic fake domains
  if (
    domain.endsWith('.local') ||
    domain.endsWith('.test') ||
    domain.endsWith('.example') ||
    domain.endsWith('.invalid') ||
    domain.endsWith('.localhost') ||
    domain === 'clinic.alssaedic.local'
  ) {
    return false;
  }

  // Reject disposable/throwaway domains
  if (BLOCKED_DISPOSABLE_DOMAINS.has(domain)) {
    return false;
  }

  // Ensure domain has at least one dot and a valid TLD of at least 2 letters
  const domainSegments = domain.split('.');
  if (domainSegments.length < 2) return false;
  const tld = domainSegments[domainSegments.length - 1];
  if (!tld || tld.length < 2 || !/^[a-zA-Z]+$/.test(tld)) return false;

  return true;
}

export function isValidStrongPassword(password: string): { valid: boolean; reason?: string } {
  const p = String(password || '').trim();
  if (p.length < 8) {
    return {
      valid: false,
      reason: 'كلمة المرور يجب أن لا تقل عن 8 خانات لحماية السجلات والبيانات الطبية.',
    };
  }
  const hasLetter = /[a-zA-Z]/.test(p);
  const hasDigit = /[0-9]/.test(p);
  if (!hasLetter || !hasDigit) {
    return {
      valid: false,
      reason: 'يجب أن تحتوي كلمة المرور على أحرف إنجليزية وأرقام معاً (مثال: Dent2025@).',
    };
  }
  return { valid: true };
}

export async function registerWithEmailAndPassword(
  email: string,
  pass: string
): Promise<{ user: User; verificationSent: boolean }> {
  const cleanEmail = email.trim().toLowerCase();
  if (!isValidRealEmail(cleanEmail)) {
    throw new Error('يرجى إدخال بريد إلكتروني حقيقي وصحيح (نطاق بريدي حقيقي غير مؤقت).');
  }
  const pwdCheck = isValidStrongPassword(pass);
  if (!pwdCheck.valid) {
    throw new Error(pwdCheck.reason || 'كلمة المرور غير مطابقة للشروط الأمنية.');
  }

  const cred = await createUserWithEmailAndPassword(auth, cleanEmail, pass.trim());
  let verificationSent = false;
  try {
    const actionSettings =
      typeof window !== 'undefined' && window.location?.origin
        ? {
            url: window.location.origin,
            handleCodeInApp: true,
          }
        : undefined;
    await sendEmailVerification(cred.user, actionSettings);
    verificationSent = true;
  } catch (e) {
    console.warn('Could not send email verification immediately:', e);
  }

  return { user: cred.user, verificationSent };
}

export async function loginWithEmailAndPassword(
  email: string,
  pass: string
): Promise<User> {
  const cleanEmail = email.trim().toLowerCase();
  if (!isValidRealEmail(cleanEmail)) {
    throw new Error('يرجى إدخال بريد إلكتروني حقيقي وصحيح لتسجيل الدخول.');
  }
  const cred = await signInWithEmailAndPassword(auth, cleanEmail, pass.trim());
  if (!cred.user.emailVerified) {
    // Automatically trigger fresh verification email if still unverified
    try {
      const actionSettings =
        typeof window !== 'undefined' && window.location?.origin
          ? { url: window.location.origin, handleCodeInApp: true }
          : undefined;
      await sendEmailVerification(cred.user, actionSettings);
    } catch {
      // ignore rate limit
    }
  }
  return cred.user;
}

export async function requestPasswordReset(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email.trim());
}

export async function resendVerificationEmail(): Promise<void> {
  if (auth.currentUser && !auth.currentUser.email?.endsWith('@clinic.alssaedic.local')) {
    const actionSettings =
      typeof window !== 'undefined' && window.location?.origin
        ? { url: window.location.origin, handleCodeInApp: true }
        : undefined;
    await sendEmailVerification(auth.currentUser, actionSettings);
  } else {
    throw new Error('لا يوجد بريد إلكتروني صالح لإرسال رابط التحقق إليه.');
  }
}

export async function reloadAndCheckEmailVerified(): Promise<boolean> {
  if (!auth.currentUser) return false;
  if (auth.currentUser.email?.endsWith('@clinic.alssaedic.local')) return true;
  try {
    await auth.currentUser.reload();
    await auth.currentUser.getIdToken(true);
    return Boolean(auth.currentUser.emailVerified);
  } catch {
    return Boolean(auth.currentUser.emailVerified);
  }
}

export async function signOutAccount(): Promise<void> {
  verifiedClinicParentUids.clear();
  pendingClinicParentCreation.clear();
  await signOut(auth);
}

export { onAuthStateChanged, sendEmailVerification, sendPasswordResetEmail };
export type { User };

// Fast O(1) document existence check by document reference, with ownerId query fallback
async function checkDocExistsFast(
  collectionName: string,
  ownerUid: string,
  targetDocId: string
): Promise<boolean> {
  try {
    const snap = await getDoc(doc(db, collectionName, targetDocId));
    return snap.exists();
  } catch {
    const q = query(collection(db, collectionName), where('ownerId', '==', ownerUid));
    const snap = await getDocs(q);
    return snap.docs.some((d) => d.id === targetDocId);
  }
}

// Helper to determine if the active session is authorized to read/write for target clinic
export function isCurrentSessionAuthorizedForClinic(targetOwnerUid: string): boolean {
  if (!auth.currentUser) return false;
  // Strict rule: email must be verified (Google auth is pre-verified; email/pass requires email verification)
  if (!auth.currentUser.emailVerified) return false;
  if (auth.currentUser.uid === targetOwnerUid) return true;
  return Boolean(auth.currentUser.email);
}

// ==================== AUTHORITATIVE CLOUD FIRESTORE OPERATIONS ====================

function buildClinicCloudPayload(
  settings: ClinicSettings,
  safeUid: string,
  isInitialCreate = false
): Record<string, unknown> {
  const isDev = isPlatformDeveloperUser(auth.currentUser?.email);
  const sub = settings.subscription;
  const tg = settings.telegramBackup;

  const payload: Record<string, unknown> = {
    ownerId: safeUid,
    clinicAr: sanitizeStr(settings.identity.clinicAr, 160, 'عيادة السعيدي لطب وجراحة الفم والأسنان'),
    doctorAr: sanitizeStr(settings.identity.doctorAr, 160, 'د. صلاح الدين السعيدي'),
    specialtyAr: sanitizeStr(settings.identity.specialtyAr, 200, 'طب وجراحة الفم والأسنان'),
    clinicEn: sanitizeStr(settings.identity.clinicEn, 160, 'ALSSAEDY CLINIC FOR DENTISTRY'),
    doctorEn: sanitizeStr(settings.identity.doctorEn, 160, 'Dr. Salahaldeen Alssaedy'),
    address: sanitizeStr(settings.identity.address, 250, 'ريمة - كسمة - عزلة الضبارة'),
    phones: sanitizeStr(settings.identity.phones, 200, '+967 716 339 366'),
    defaultCurrency: sanitizeStr(settings.identity.defaultCurrency, 40, 'ريال يمني'),
    primaryColor: sanitizeStr(settings.appearance.primaryColor, 20, '#0B2545'),
    watermarkOpacity: sanitizeNum(settings.appearance.watermarkOpacity, 0, 30),
    autoInventory: Boolean(settings.features.autoInventory),
    showQrCode: Boolean(settings.features.showQrCode),
    customLogoDataUrl: sanitizeStr(settings.appearance.customLogoDataUrl, 350000, ''),
    permanentAccountantSig: sanitizeStr(settings.appearance.permanentAccountantSig, 250000, ''),
    updatedAt: serverTimestamp(),
  };

  const isOwnerSession = auth.currentUser?.uid === safeUid;
  const configuredEmail = settings.identity.ownerEmail?.trim().toLowerCase();
  let ownerEmail = '';
  if (configuredEmail && configuredEmail.includes('@') && !configuredEmail.endsWith('.local')) {
    ownerEmail = configuredEmail;
  } else if (isOwnerSession && auth.currentUser?.email && !auth.currentUser.email.endsWith('.local')) {
    ownerEmail = auth.currentUser.email.toLowerCase();
  }
  if (ownerEmail) {
    payload.ownerEmail = sanitizeStr(ownerEmail, 160, '');
  }

  if (tg) {
    payload.telegramBackup = {
      enabled: Boolean(tg.enabled && tg.botToken?.trim() && tg.chatId?.trim()),
      autoBackupOnReceipt: Boolean(tg.autoBackupOnReceipt ?? true),
      botToken: sanitizeStr(tg.botToken, 120, ''),
      chatId: sanitizeStr(tg.chatId, 80, ''),
      lastBackupAt: sanitizeStr(tg.lastBackupAt || '', 50, ''),
    };
  }

  // Only write subscription or aiConfig when the authenticated platform developer saves
  if (sub && (isDev || isInitialCreate)) {
    payload.subscription = {
      planId: sanitizeStr(sub.planId, 40, 'enterprise'),
      planNameAr: sanitizeStr(sub.planNameAr, 80, 'الباقة الشاملة'),
      isAiEnabled: true,
      status: 'active',
      activatedAt: sanitizeStr(sub.activatedAt || '', 40, ''),
      expiresAt: sanitizeStr(sub.expiresAt || '', 40, ''),
      activatedBy: sanitizeStr(sub.activatedBy || '', 120, ''),
      notes: sanitizeStr(sub.notes || '', 400, ''),
    };
  }

  if (settings.aiConfig && isDev) {
    payload.aiConfig = sanitizeAiConfigPayload(settings.aiConfig);
  }

  return payload;
}

const RETIRED_GROQ_MODELS = new Set([
  'mixtral-8x7b-32768',
  'gemma-7b-it',
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'meta-llama/llama-4-maverick-17b-128e-instruct',
  'llama-3.2-90b-vision-preview',
  'llama-3.2-11b-vision-preview',
  'llama3-70b-8192',
  'llama3-8b-8192',
]);

function sanitizeAiConfigPayload(cfg: Partial<AIProviderConfig>): AIProviderConfig {
  const rawGroqText = sanitizeStr(cfg.groqTextModel || DEFAULT_AI_CONFIG.groqTextModel, 120, DEFAULT_AI_CONFIG.groqTextModel);
  const rawGroqVision = sanitizeStr(cfg.groqVisionModel || DEFAULT_AI_CONFIG.groqVisionModel, 120, DEFAULT_AI_CONFIG.groqVisionModel);
  const rawDataEntry = sanitizeStr(cfg.dataEntryModel || DEFAULT_AI_CONFIG.dataEntryModel, 120, DEFAULT_AI_CONFIG.dataEntryModel);
  const rawTts = sanitizeStr(cfg.ttsModel || DEFAULT_AI_CONFIG.ttsModel, 100, DEFAULT_AI_CONFIG.ttsModel);

  return {
    geminiApiKey: sanitizeStr(cfg.geminiApiKey || '', 300, ''),
    geminiModel: sanitizeStr(cfg.geminiModel || DEFAULT_AI_CONFIG.geminiModel, 100, DEFAULT_AI_CONFIG.geminiModel),
    geminiVisionModel: sanitizeStr(
      cfg.geminiVisionModel || DEFAULT_AI_CONFIG.geminiVisionModel || 'gemini-2.5-flash',
      100,
      DEFAULT_AI_CONFIG.geminiVisionModel || 'gemini-2.5-flash'
    ),
    enableWebGrounding: cfg.enableWebGrounding !== false,
    groqApiKey: sanitizeStr(cfg.groqApiKey || DEFAULT_AI_CONFIG.groqApiKey || '', 300, DEFAULT_AI_CONFIG.groqApiKey || ''),
    groqTextModel: RETIRED_GROQ_MODELS.has(rawGroqText) ? 'qwen/qwen3.8-27b' : rawGroqText,
    groqVisionModel: RETIRED_GROQ_MODELS.has(rawGroqVision) ? 'qwen/qwen3.8-27b' : rawGroqVision,
    groqWhisperModel: sanitizeStr(cfg.groqWhisperModel || DEFAULT_AI_CONFIG.groqWhisperModel, 100, DEFAULT_AI_CONFIG.groqWhisperModel),
    openrouterApiKey: sanitizeStr(cfg.openrouterApiKey || '', 300, ''),
    openrouterModel: sanitizeStr(cfg.openrouterModel || DEFAULT_AI_CONFIG.openrouterModel, 120, DEFAULT_AI_CONFIG.openrouterModel),
    openrouterVisionModel: sanitizeStr(
      cfg.openrouterVisionModel || DEFAULT_AI_CONFIG.openrouterVisionModel || 'google/gemini-2.5-flash',
      120,
      DEFAULT_AI_CONFIG.openrouterVisionModel || 'google/gemini-2.5-flash'
    ),
    sttEngine: cfg.sttEngine === 'browser' ? 'browser' : 'groq',
    ttsModel:
      rawTts === 'playai-tts-arabic'
        ? 'canopylabs/orpheus-arabic-saudi'
        : rawTts === 'playai-tts'
          ? 'canopylabs/orpheus-v1-english'
          : rawTts,
    dataEntryModel: RETIRED_GROQ_MODELS.has(rawDataEntry) ? 'openai/gpt-oss-120b' : rawDataEntry,
    customPriority: ['groq', 'gemini', 'openrouter'],
  };
}

function parseCloudAiConfig(raw: unknown): AIProviderConfig | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const d = raw as Partial<AIProviderConfig>;
  return sanitizeAiConfigPayload(d);
}

export async function ensureClinicDocumentInCloud(
  uid: string,
  settings?: ClinicSettings
): Promise<boolean> {
  const safeUid = sanitizeId(uid);
  if (!isCurrentSessionAuthorizedForClinic(safeUid)) {
    throw new Error('يجب تسجيل الدخول بحساب العيادة الموثق قبل الكتابة في السحابة.');
  }

  const effectiveSettings = settings || latestSettingsCacheByUid.get(safeUid) || DEFAULT_SETTINGS;
  if (settings) {
    latestSettingsCacheByUid.set(safeUid, settings);
  }

  // If the signed-in user is an invited team member (not the clinic owner UID),
  // `/clinics/{safeUid}` is owned by `safeUid` and already exists.
  if (auth.currentUser && auth.currentUser.uid !== safeUid) {
    verifiedClinicParentUids.add(safeUid);
    return false;
  }

  if (verifiedClinicParentUids.has(safeUid)) {
    return false;
  }

  const existingPromise = pendingClinicParentCreation.get(safeUid);
  if (existingPromise) {
    return existingPromise;
  }

  const clinicPath = `clinics/${safeUid}`;
  const ref = doc(db, 'clinics', safeUid);

  const creationPromise = (async () => {
    let wasCreated = false;
    try {
      await withCloudRetry(async () => {
        if (!knownExistingDocIds.has(safeUid)) {
          const createPayload = {
            ...buildClinicCloudPayload(effectiveSettings, safeUid, true),
            createdAt: serverTimestamp(),
          };
          await setDoc(ref, createPayload, { merge: true });
          knownExistingDocIds.add(safeUid);
          wasCreated = true;
        }
      });
      verifiedClinicParentUids.add(safeUid);
      return wasCreated;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, clinicPath);
    } finally {
      pendingClinicParentCreation.delete(safeUid);
    }
  })();

  pendingClinicParentCreation.set(safeUid, creationPromise);
  return creationPromise;
}

export async function saveClinicSettingsToCloud(
  uid: string,
  settings: ClinicSettings
): Promise<void> {
  const safeUid = sanitizeId(uid);
  if (!isCurrentSessionAuthorizedForClinic(safeUid)) {
    throw new Error('غير مصرح بتعديل إعدادات عيادة أخرى.');
  }
  latestSettingsCacheByUid.set(safeUid, settings);

  // Only the clinic owner UID or developer can write directly to `/clinics/{safeUid}`
  if (auth.currentUser && auth.currentUser.uid !== safeUid && !isPlatformDeveloperUser(auth.currentUser.email)) {
    return;
  }

  const state = loadPendingSyncState(safeUid);
  state.settings = settings;
  savePendingSyncState(safeUid, state);

  const clinicPath = `clinics/${safeUid}`;
  const ref = doc(db, 'clinics', safeUid);

  try {
    await withCloudRetry(async () => {
      const payload = buildClinicCloudPayload(settings, safeUid);
      await setDoc(ref, payload, { merge: true });
      knownExistingDocIds.add(safeUid);
    });

    verifiedClinicParentUids.add(safeUid);
    const afterState = loadPendingSyncState(safeUid);
    delete afterState.settings;
    savePendingSyncState(safeUid, afterState);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, clinicPath);
  }
}

async function upsertClinicCollectionDoc(
  ref: ReturnType<typeof doc>,
  docId: string,
  safeUid: string,
  mutableFields: Record<string, unknown>
): Promise<void> {
  if (knownExistingDocIds.has(docId)) {
    await updateDoc(ref, mutableFields);
    return;
  }
  try {
    await updateDoc(ref, mutableFields);
    knownExistingDocIds.add(docId);
  } catch (err: unknown) {
    const code = String((err as { code?: string })?.code || '');
    const msg = String((err as { message?: string })?.message || '');
    if (code.includes('not-found') || msg.includes('No document to update')) {
      await setDoc(
        ref,
        {
          ownerId: safeUid,
          ...mutableFields,
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );
      knownExistingDocIds.add(docId);
    } else {
      throw err;
    }
  }
}

export async function saveServiceToCloud(
  uid: string,
  service: DentalServiceItem
): Promise<void> {
  const safeUid = sanitizeId(uid);
  if (!isCurrentSessionAuthorizedForClinic(safeUid)) {
    throw new Error('غير مصرح بحفظ خدمات لعيادة أخرى.');
  }
  // Services collection in Firestore rules requires `isClinicOwner`
  if (auth.currentUser && auth.currentUser.uid !== safeUid) {
    return;
  }

  const safeServiceId = sanitizeId(service.id || `srv_${Date.now()}`);
  const safeName = sanitizeStr(service.name, 140, 'خدمة علاجية');
  const safeCategory = sanitizeStr(service.category, 100, 'علاجات سنية');
  const safePrice = sanitizeNum(service.price, 0, 100000000);
  const cloudKeywords = encodeServiceMaterialRulesToKeywords(
    service.keywords || [],
    safeName,
    service.materialsRecipe,
    service.totalSessions
  );
  const decodedLocal = decodeServiceKeywordsAndRecipe(cloudKeywords, safeName);

  const normalizedService: DentalServiceItem = {
    id: safeServiceId,
    name: safeName,
    price: safePrice,
    category: safeCategory,
    keywords: decodedLocal.keywords,
    materialsRecipe: decodedLocal.materialsRecipe,
    totalSessions: decodedLocal.totalSessions,
  };

  markPendingUpsert(safeUid, 'services', safeServiceId, normalizedService);

  const docId = sanitizeId(`${safeUid}_${safeServiceId}`);
  const path = `services/${docId}`;
  const ref = doc(db, 'services', docId);

  try {
    await ensureClinicDocumentInCloud(safeUid);
    await withCloudRetry(async () => {
      const mutableFields = {
        name: safeName,
        price: safePrice,
        category: safeCategory,
        keywords: cloudKeywords,
        updatedAt: serverTimestamp(),
      };
      await upsertClinicCollectionDoc(ref, docId, safeUid, mutableFields);
    });
    clearPendingUpsert(safeUid, 'services', safeServiceId);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteServiceFromCloud(uid: string, serviceId: string): Promise<void> {
  const safeUid = sanitizeId(uid);
  if (!isCurrentSessionAuthorizedForClinic(safeUid)) {
    throw new Error('غير مصرح بحذف خدمات لعيادة أخرى.');
  }
  if (auth.currentUser && auth.currentUser.uid !== safeUid) {
    return;
  }
  const cleanSrvId = sanitizeId(serviceId);
  markPendingDelete(safeUid, 'services', cleanSrvId);
  const docId = sanitizeId(`${safeUid}_${cleanSrvId}`);
  const path = `services/${docId}`;
  try {
    await withCloudRetry(() => deleteDoc(doc(db, 'services', docId)));
    knownExistingDocIds.delete(docId);
    clearPendingDelete(safeUid, 'services', cleanSrvId);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function saveReceiptToCloud(
  uid: string,
  receipt: ReceiptRecord,
  settings?: ClinicSettings
): Promise<void> {
  const safeUid = sanitizeId(uid);
  if (!isCurrentSessionAuthorizedForClinic(safeUid)) {
    throw new Error('غير مصرح بحفظ سندات لعيادة أخرى.');
  }
  const validated = validateAndNormalizeReceipt(receipt);
  markPendingUpsert(safeUid, 'receipts', validated.id, validated);

  const docId = sanitizeId(`${safeUid}_${validated.id}`);
  const path = `receipts/${docId}`;
  const ref = doc(db, 'receipts', docId);

  try {
    await ensureClinicDocumentInCloud(safeUid, settings);
    await withCloudRetry(async () => {
      const mutableFields = {
        receiptNo: validated.receiptNo,
        date: validated.date,
        patientName: validated.patientName,
        patientPhone: validated.patientPhone,
        services: validated.services,
        toothFDI: validated.toothFDI,
        totalAmount: validated.totalAmount,
        paidAmount: validated.paidAmount,
        remainingAmount: validated.remainingAmount,
        currency: validated.currency,
        paymentMethod: validated.paymentMethod,
        notes: encodeReceiptNotesWithConsumedMaterials(
          validated.notes,
          validated.consumedMaterials
        ),
        amountWords: validated.amountWords,
        accountantSig: validated.accountantSig,
        receiverSig: validated.receiverSig,
        paperFormat: validated.paperFormat,
        updatedAt: serverTimestamp(),
      };

      await upsertClinicCollectionDoc(ref, docId, safeUid, mutableFields);
    });
    clearPendingUpsert(safeUid, 'receipts', validated.id);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteReceiptFromCloud(uid: string, receiptId: string): Promise<void> {
  const safeUid = sanitizeId(uid);
  if (!isCurrentSessionAuthorizedForClinic(safeUid)) {
    throw new Error('غير مصرح بحذف سندات لعيادة أخرى.');
  }
  const cleanId = sanitizeId(receiptId);
  markPendingDelete(safeUid, 'receipts', cleanId);
  const docId = sanitizeId(`${safeUid}_${cleanId}`);
  const path = `receipts/${docId}`;
  try {
    await withCloudRetry(() => deleteDoc(doc(db, 'receipts', docId)));
    knownExistingDocIds.delete(docId);
    clearPendingDelete(safeUid, 'receipts', cleanId);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function saveInventoryItemToCloud(
  uid: string,
  item: InventoryItem,
  settings?: ClinicSettings
): Promise<void> {
  const safeUid = sanitizeId(uid);
  if (!isCurrentSessionAuthorizedForClinic(safeUid)) {
    throw new Error('غير مصرح بتعديل مخزون عيادة أخرى.');
  }
  const validated = validateAndNormalizeInventoryItem(item);
  markPendingUpsert(safeUid, 'inventory', validated.id, validated);

  const docId = sanitizeId(`${safeUid}_${validated.id}`);
  const path = `inventory/${docId}`;
  const ref = doc(db, 'inventory', docId);

  try {
    await ensureClinicDocumentInCloud(safeUid, settings);
    await withCloudRetry(async () => {
      const mutableFields = {
        name: validated.name,
        category: encodeInventoryCategoryWithMeta(validated),
        qty: validated.qty,
        minQty: validated.minQty,
        unit: validated.unit,
        unitPrice: validated.unitPrice,
        totalCost: validated.totalCost,
        linkedService: validated.linkedService,
        updatedAt: serverTimestamp(),
      };

      await upsertClinicCollectionDoc(ref, docId, safeUid, mutableFields);
    });
    clearPendingUpsert(safeUid, 'inventory', validated.id);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteInventoryItemFromCloud(uid: string, itemId: string): Promise<void> {
  const safeUid = sanitizeId(uid);
  if (!isCurrentSessionAuthorizedForClinic(safeUid)) {
    throw new Error('غير مصرح بحذف أصناف مخزون لعيادة أخرى.');
  }
  const cleanId = sanitizeId(itemId);
  markPendingDelete(safeUid, 'inventory', cleanId);
  const docId = sanitizeId(`${safeUid}_${cleanId}`);
  const path = `inventory/${docId}`;
  try {
    await withCloudRetry(() => deleteDoc(doc(db, 'inventory', docId)));
    knownExistingDocIds.delete(docId);
    clearPendingDelete(safeUid, 'inventory', cleanId);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function saveExpenseToCloud(
  uid: string,
  expense: ExpenseRecord,
  settings?: ClinicSettings
): Promise<void> {
  const safeUid = sanitizeId(uid);
  if (!isCurrentSessionAuthorizedForClinic(safeUid)) {
    throw new Error('غير مصرح بحفظ مصروفات لعيادة أخرى.');
  }
  const validated = validateAndNormalizeExpense(expense);
  markPendingUpsert(safeUid, 'expenses', validated.id, validated);

  const docId = sanitizeId(`${safeUid}_${validated.id}`);
  const path = `expenses/${docId}`;
  const ref = doc(db, 'expenses', docId);

  try {
    await ensureClinicDocumentInCloud(safeUid, settings);
    await withCloudRetry(async () => {
      const mutableFields = {
        title: validated.title,
        amount: validated.amount,
        category: validated.category,
        currency: validated.currency,
        date: validated.date,
        updatedAt: serverTimestamp(),
      };

      await upsertClinicCollectionDoc(ref, docId, safeUid, mutableFields);
    });
    clearPendingUpsert(safeUid, 'expenses', validated.id);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteExpenseFromCloud(uid: string, expenseId: string): Promise<void> {
  const safeUid = sanitizeId(uid);
  if (!isCurrentSessionAuthorizedForClinic(safeUid)) {
    throw new Error('غير مصرح بحذف مصروفات لعيادة أخرى.');
  }
  const cleanId = sanitizeId(expenseId);
  markPendingDelete(safeUid, 'expenses', cleanId);
  const docId = sanitizeId(`${safeUid}_${cleanId}`);
  const path = `expenses/${docId}`;
  try {
    await withCloudRetry(() => deleteDoc(doc(db, 'expenses', docId)));
    knownExistingDocIds.delete(docId);
    clearPendingDelete(safeUid, 'expenses', cleanId);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// ==================== FLUSH PENDING LOCAL QUEUE TO FIRESTORE ====================
export async function flushPendingSyncQueue(uid: string): Promise<void> {
  const safeUid = sanitizeId(uid);
  if (!isCurrentSessionAuthorizedForClinic(safeUid)) return;

  const isBrowserOnline =
    typeof navigator === 'undefined' ? true : navigator.onLine !== false;
  if (!isBrowserOnline) return;

  const state = loadPendingSyncState(safeUid);
  const isOwner = auth.currentUser?.uid === safeUid;

  if (isOwner && state.settings) {
    try {
      await saveClinicSettingsToCloud(safeUid, state.settings);
    } catch {
      // Keep settings in pending queue to retry
    }
  } else {
    try {
      await ensureClinicDocumentInCloud(safeUid);
    } catch {
      // Ignore parent creation failure and let individual writes attempt it
    }
  }

  const tasks: Promise<void>[] = [];

  if (isOwner) {
    for (const srv of Object.values(state.upserts.services)) {
      tasks.push(saveServiceToCloud(safeUid, srv).catch(() => {}));
    }
    for (const srvId of [...state.deletes.services]) {
      tasks.push(deleteServiceFromCloud(safeUid, srvId).catch(() => {}));
    }
  }

  for (const rec of Object.values(state.upserts.receipts)) {
    if (!SEED_DEMO_IDS.receipts.has(rec.id)) {
      tasks.push(saveReceiptToCloud(safeUid, rec).catch(() => {}));
    } else {
      clearPendingUpsert(safeUid, 'receipts', rec.id);
    }
  }
  for (const recId of [...state.deletes.receipts]) {
    if (isOwner) {
      tasks.push(deleteReceiptFromCloud(safeUid, recId).catch(() => {}));
    } else {
      clearPendingDelete(safeUid, 'receipts', recId);
    }
  }

  for (const inv of Object.values(state.upserts.inventory)) {
    if (!SEED_DEMO_IDS.inventory.has(inv.id)) {
      tasks.push(saveInventoryItemToCloud(safeUid, inv).catch(() => {}));
    } else {
      clearPendingUpsert(safeUid, 'inventory', inv.id);
    }
  }
  for (const invId of [...state.deletes.inventory]) {
    if (isOwner) {
      tasks.push(deleteInventoryItemFromCloud(safeUid, invId).catch(() => {}));
    } else {
      clearPendingDelete(safeUid, 'inventory', invId);
    }
  }

  for (const exp of Object.values(state.upserts.expenses)) {
    if (!SEED_DEMO_IDS.expenses.has(exp.id)) {
      tasks.push(saveExpenseToCloud(safeUid, exp).catch(() => {}));
    } else {
      clearPendingUpsert(safeUid, 'expenses', exp.id);
    }
  }
  for (const expId of [...state.deletes.expenses]) {
    if (isOwner) {
      tasks.push(deleteExpenseFromCloud(safeUid, expId).catch(() => {}));
    } else {
      clearPendingDelete(safeUid, 'expenses', expId);
    }
  }

  if (tasks.length > 0) {
    await Promise.all(tasks);
  }
}

// ==================== FULL LOCAL-TO-CLOUD INITIAL SEED / SYNC ====================
export async function syncLocalDataToCloud(
  uid: string,
  settings: ClinicSettings,
  receipts: ReceiptRecord[],
  inventory: InventoryItem[],
  expenses: ExpenseRecord[],
  forcePushAll = false
): Promise<void> {
  const safeUid = sanitizeId(uid);
  latestSettingsCacheByUid.set(safeUid, settings);
  const wasCreated = await ensureClinicDocumentInCloud(safeUid, settings);
  await flushPendingSyncQueue(safeUid);

  if (wasCreated || forcePushAll) {
    const tasks: Promise<void>[] = [];
    if (auth.currentUser?.uid === safeUid) {
      tasks.push(saveClinicSettingsToCloud(safeUid, settings));
      for (const srv of settings.services) {
        tasks.push(saveServiceToCloud(safeUid, srv));
      }
    }
    for (const rec of receipts) {
      if (rec && !SEED_DEMO_IDS.receipts.has(rec.id)) {
        tasks.push(saveReceiptToCloud(safeUid, rec));
      }
    }
    for (const inv of inventory) {
      if (inv && !SEED_DEMO_IDS.inventory.has(inv.id)) {
        tasks.push(saveInventoryItemToCloud(safeUid, inv));
      }
    }
    for (const exp of expenses) {
      if (exp && !SEED_DEMO_IDS.expenses.has(exp.id)) {
        tasks.push(saveExpenseToCloud(safeUid, exp));
      }
    }
    if (tasks.length > 0) {
      await Promise.all(tasks);
    }
  }
}

export async function initializeOrLoadUserClinicInCloud(
  uid: string,
  initialSettings: ClinicSettings,
  localReceipts: ReceiptRecord[] = [],
  localInventory: InventoryItem[] = [],
  localExpenses: ExpenseRecord[] = []
): Promise<{
  isNewClinic: boolean;
  data: DirectWorkspacePayload;
}> {
  const safeUid = sanitizeId(uid);
  latestSettingsCacheByUid.set(safeUid, initialSettings);

  const cleanLocalReceipts = localReceipts.filter((r) => r && !SEED_DEMO_IDS.receipts.has(r.id));
  const cleanLocalInventory = localInventory.filter((i) => i && !SEED_DEMO_IDS.inventory.has(i.id));
  const cleanLocalExpenses = localExpenses.filter((e) => e && !SEED_DEMO_IDS.expenses.has(e.id));

  const exists = await checkDocExistsFast('clinics', safeUid, safeUid);

  if (!exists && auth.currentUser?.uid === safeUid) {
    await ensureClinicDocumentInCloud(safeUid, initialSettings);
    const initTasks: Promise<void>[] = [];
    for (const srv of initialSettings.services) {
      initTasks.push(saveServiceToCloud(safeUid, srv).catch(() => {}));
    }
    for (const rec of cleanLocalReceipts) {
      initTasks.push(saveReceiptToCloud(safeUid, rec).catch(() => {}));
    }
    for (const inv of cleanLocalInventory) {
      initTasks.push(saveInventoryItemToCloud(safeUid, inv).catch(() => {}));
    }
    for (const exp of cleanLocalExpenses) {
      initTasks.push(saveExpenseToCloud(safeUid, exp).catch(() => {}));
    }
    if (initTasks.length > 0) {
      await Promise.all(initTasks);
    }
    await flushPendingSyncQueue(safeUid);

    return {
      isNewClinic: true,
      data: {
        settings: initialSettings,
        receipts: applyPendingQueueToItems(safeUid, 'receipts', cleanLocalReceipts).sort(
          (a, b) => b.receiptNo - a.receiptNo
        ),
        inventory: applyPendingQueueToItems(safeUid, 'inventory', cleanLocalInventory),
        expenses: applyPendingQueueToItems(safeUid, 'expenses', cleanLocalExpenses).sort((a, b) =>
          b.date.localeCompare(a.date)
        ),
      },
    };
  }

  verifiedClinicParentUids.add(safeUid);
  await flushPendingSyncQueue(safeUid);

  const fetched = await fetchClinicCollectionsFromFirestore(safeUid, {
    settings: initialSettings,
    receipts: cleanLocalReceipts,
    inventory: cleanLocalInventory,
    expenses: cleanLocalExpenses,
  });

  return {
    isNewClinic: false,
    data: fetched,
  };
}

// ==================== FETCH ALL AUTHORITATIVE CLINIC COLLECTIONS ====================
async function fetchClinicCollectionsFromFirestore(
  uid: string,
  fallbackData: DirectWorkspacePayload
): Promise<DirectWorkspacePayload> {
  const safeUid = sanitizeId(uid);
  const prefix = `${safeUid}_`;
  const stripPrefix = (docId: string) =>
    docId.startsWith(prefix) ? docId.slice(prefix.length) : docId;

  const [clinicsSnap, servicesSnap, receiptsSnap, inventorySnap, expensesSnap] = await Promise.all([
    withCloudRetry(() => getDocs(query(collection(db, 'clinics'), where('ownerId', '==', safeUid)))),
    withCloudRetry(() => getDocs(query(collection(db, 'services'), where('ownerId', '==', safeUid)))),
    withCloudRetry(() => getDocs(query(collection(db, 'receipts'), where('ownerId', '==', safeUid)))),
    withCloudRetry(() => getDocs(query(collection(db, 'inventory'), where('ownerId', '==', safeUid)))),
    withCloudRetry(() => getDocs(query(collection(db, 'expenses'), where('ownerId', '==', safeUid)))),
  ]);

  servicesSnap.docs.forEach((docSnap) => knownExistingDocIds.add(docSnap.id));
  receiptsSnap.docs.forEach((docSnap) => knownExistingDocIds.add(docSnap.id));
  inventorySnap.docs.forEach((docSnap) => knownExistingDocIds.add(docSnap.id));
  expensesSnap.docs.forEach((docSnap) => knownExistingDocIds.add(docSnap.id));

  const pendingState = loadPendingSyncState(safeUid);
  let nextSettings = pendingState.settings || fallbackData.settings;

  if (!clinicsSnap.empty) {
    verifiedClinicParentUids.add(safeUid);
    knownExistingDocIds.add(safeUid);
    const d = clinicsSnap.docs[0].data();
    const cloudSub = d.subscription as Partial<ClinicSubscription> | undefined;
    const isDev = isPlatformDeveloperUser(auth.currentUser?.email || d.ownerEmail);
    const parsedSubscription: ClinicSubscription = {
      planId: (cloudSub?.planId as 'free' | 'ai_pro' | 'enterprise') || (isDev ? 'enterprise' : 'free'),
      planNameAr: String(cloudSub?.planNameAr || (isDev ? 'باقة المطور الشاملة' : 'الباقة الأساسية')),
      isAiEnabled: isDev ? true : Boolean(cloudSub?.isAiEnabled),
      status: (cloudSub?.status as 'active' | 'expired' | 'trial' | 'locked') || (isDev ? 'active' : 'locked'),
      activatedAt: cloudSub?.activatedAt ? String(cloudSub.activatedAt) : undefined,
      expiresAt: cloudSub?.expiresAt ? String(cloudSub.expiresAt) : undefined,
      activatedBy: cloudSub?.activatedBy ? String(cloudSub.activatedBy) : undefined,
      notes: cloudSub?.notes ? String(cloudSub.notes) : undefined,
    };

    const parsedAiConfig = parseCloudAiConfig(d.aiConfig);
    if (parsedAiConfig) {
      saveAIProviderConfig(parsedAiConfig);
    }

    if (!pendingState.settings) {
      const rawCurrency = String(d.defaultCurrency || 'ريال يمني');
      const validCurrency: CurrencyCode =
        rawCurrency === 'ريال سعودي' || rawCurrency === 'دولار أمريكي'
          ? rawCurrency
          : 'ريال يمني';

      const isOwnerSession = auth.currentUser?.uid === safeUid;
      const resolvedOwnerEmail = d.ownerEmail
        ? String(d.ownerEmail).toLowerCase()
        : isOwnerSession && auth.currentUser?.email
          ? auth.currentUser.email.toLowerCase()
          : nextSettings.identity.ownerEmail || '';

      nextSettings = {
        ...nextSettings,
        identity: {
          systemTitleAr: String(d.clinicAr || nextSettings.identity.systemTitleAr || 'عيادة طب الأسنان'),
          clinicAr: String(d.clinicAr ?? ''),
          doctorAr: String(d.doctorAr ?? ''),
          specialtyAr: String(d.specialtyAr ?? ''),
          clinicEn: String(d.clinicEn ?? ''),
          doctorEn: String(d.doctorEn ?? ''),
          address: String(d.address ?? ''),
          phones: String(d.phones ?? ''),
          defaultCurrency: validCurrency,
          ownerEmail: resolvedOwnerEmail,
        },
        appearance: {
          primaryColor: String(d.primaryColor || nextSettings.appearance.primaryColor),
          accentColor: '#0EA5E9',
          watermarkOpacity: Number(d.watermarkOpacity ?? nextSettings.appearance.watermarkOpacity),
          customLogoDataUrl: String(
            d.customLogoDataUrl || nextSettings.appearance.customLogoDataUrl
          ),
          permanentAccountantSig: String(
            d.permanentAccountantSig || nextSettings.appearance.permanentAccountantSig
          ),
        },
        features: {
          autoPrice: true,
          debtAlert: true,
          autoInventory: Boolean(d.autoInventory ?? true),
          showQrCode: Boolean(d.showQrCode ?? true),
        },
        subscription: parsedSubscription,
        ...(parsedAiConfig ? { aiConfig: parsedAiConfig } : {}),
      };
    } else {
      // Always preserve cloud subscription and developer-configured aiConfig
      nextSettings = {
        ...nextSettings,
        subscription: parsedSubscription,
        ...(parsedAiConfig ? { aiConfig: parsedAiConfig } : {}),
      };
    }
  }

  if (!servicesSnap.empty) {
    const cloudServices: DentalServiceItem[] = servicesSnap.docs.map((docSnap) => {
      const d = docSnap.data();
      const name = String(d.name || '');
      const decoded = decodeServiceKeywordsAndRecipe(d.keywords, name);
      return {
        id: stripPrefix(docSnap.id),
        name,
        price: Number(d.price || 0),
        category: String(d.category || 'علاجات سنية'),
        keywords: decoded.keywords,
        materialsRecipe: decoded.materialsRecipe,
        totalSessions: decoded.totalSessions,
      };
    });
    const mergedServices = applyPendingQueueToItems(
      safeUid,
      'services',
      mergeByIdPreservingExisting(cloudServices, fallbackData.settings.services)
    );
    nextSettings = {
      ...nextSettings,
      services: mergedServices,
    };
  } else if (auth.currentUser?.uid === safeUid && nextSettings.services.length > 0) {
    for (const srv of nextSettings.services) {
      saveServiceToCloud(safeUid, srv).catch(() => {});
    }
  }

  latestSettingsCacheByUid.set(safeUid, nextSettings);

  const cloudReceipts: ReceiptRecord[] = receiptsSnap.docs
    .filter((docSnap) => {
      const id = stripPrefix(docSnap.id);
      if (SEED_DEMO_IDS.receipts.has(id)) {
        deleteDoc(docSnap.ref).catch(() => {});
        return false;
      }
      return true;
    })
    .map((docSnap) => {
      const d = docSnap.data();
      const decodedRecNotes = decodeReceiptNotesAndConsumedMaterials(d.notes);
      return {
        id: stripPrefix(docSnap.id),
        receiptNo: Number(d.receiptNo || 1001),
        date: String(d.date || ''),
        patientName: String(d.patientName || ''),
        patientPhone: String(d.patientPhone || ''),
        services: Array.isArray(d.services) ? d.services.map(String) : [],
        toothFDI: String(d.toothFDI || ''),
        totalAmount: Number(d.totalAmount || 0),
        paidAmount: Number(d.paidAmount || 0),
        remainingAmount: Number(d.remainingAmount || 0),
        currency: String(d.currency || 'ريال يمني') as CurrencyCode,
        paymentMethod: String(d.paymentMethod || 'نقداً (Cash)'),
        notes: decodedRecNotes.notes,
        amountWords: String(d.amountWords || ''),
        accountantSig: String(d.accountantSig || ''),
        receiverSig: String(d.receiverSig || ''),
        paperFormat: (d.paperFormat === 'thermal80' ? 'thermal80' : 'a5') as 'a5' | 'thermal80',
        createdAt: d.createdAt?.toDate ? d.createdAt.toDate().toISOString() : new Date().toISOString(),
        ...(decodedRecNotes.consumedMaterials
          ? { consumedMaterials: decodedRecNotes.consumedMaterials }
          : {}),
      };
    });

  const cloudReceiptIds = new Set(cloudReceipts.map((r) => r.id));
  const deleteReceiptSet = new Set(pendingState.deletes.receipts);
  const localUnsyncedReceipts = fallbackData.receipts.filter(
    (r) =>
      r &&
      !SEED_DEMO_IDS.receipts.has(r.id) &&
      !cloudReceiptIds.has(r.id) &&
      !deleteReceiptSet.has(r.id)
  );
  // Push any local-only receipts to Firestore so they are never lost when onSnapshot fires
  for (const unsyncedRec of localUnsyncedReceipts) {
    saveReceiptToCloud(safeUid, unsyncedRec).catch(() => {});
  }

  const cloudInventory: InventoryItem[] = inventorySnap.docs
    .filter((docSnap) => {
      const id = stripPrefix(docSnap.id);
      if (SEED_DEMO_IDS.inventory.has(id)) {
        deleteDoc(docSnap.ref).catch(() => {});
        return false;
      }
      return true;
    })
    .map((docSnap) => {
      const d = docSnap.data();
      const qty = Number(d.qty || 0);
      const unit = String(d.unit || 'قطعة');
      const decodedInvMeta = decodeInventoryCategoryWithMeta(d.category, qty, unit);
      return {
        id: stripPrefix(docSnap.id),
        name: String(d.name || ''),
        notes: decodedInvMeta.notes,
        qty,
        minQty: Number(d.minQty || 0),
        unit,
        unitPrice: Number(d.unitPrice || 0),
        totalCost: Number(d.totalCost || 0),
        linkedService: String(d.linkedService || ''),
        updatedAt: d.updatedAt?.toDate
          ? d.updatedAt.toDate().toISOString().slice(0, 10)
          : new Date().toISOString().slice(0, 10),
        location: decodedInvMeta.location,
        packageSize: decodedInvMeta.packageSize,
        usageUnit: decodedInvMeta.usageUnit,
        remainingSubUnits: decodedInvMeta.remainingSubUnits,
      };
    });

  const cloudInventoryIds = new Set(cloudInventory.map((i) => i.id));
  const deleteInventorySet = new Set(pendingState.deletes.inventory);
  const localUnsyncedInventory = fallbackData.inventory.filter(
    (i) =>
      i &&
      !SEED_DEMO_IDS.inventory.has(i.id) &&
      !cloudInventoryIds.has(i.id) &&
      !deleteInventorySet.has(i.id)
  );
  for (const unsyncedInv of localUnsyncedInventory) {
    saveInventoryItemToCloud(safeUid, unsyncedInv).catch(() => {});
  }

  const cloudExpenses: ExpenseRecord[] = expensesSnap.docs
    .filter((docSnap) => {
      const id = stripPrefix(docSnap.id);
      if (SEED_DEMO_IDS.expenses.has(id)) {
        deleteDoc(docSnap.ref).catch(() => {});
        return false;
      }
      return true;
    })
    .map((docSnap) => {
      const d = docSnap.data();
      return {
        id: stripPrefix(docSnap.id),
        title: String(d.title || ''),
        amount: Number(d.amount || 0),
        category: String(d.category || 'تشغيل'),
        currency: String(d.currency || 'ريال يمني') as CurrencyCode,
        date: String(d.date || ''),
      };
    });

  const cloudExpenseIds = new Set(cloudExpenses.map((e) => e.id));
  const deleteExpenseSet = new Set(pendingState.deletes.expenses);
  const localUnsyncedExpenses = fallbackData.expenses.filter(
    (e) =>
      e &&
      !SEED_DEMO_IDS.expenses.has(e.id) &&
      !cloudExpenseIds.has(e.id) &&
      !deleteExpenseSet.has(e.id)
  );
  for (const unsyncedExp of localUnsyncedExpenses) {
    saveExpenseToCloud(safeUid, unsyncedExp).catch(() => {});
  }

  const finalReceipts = applyPendingQueueToItems(
    safeUid,
    'receipts',
    mergeByIdPreservingExisting(cloudReceipts, localUnsyncedReceipts)
  ).sort((a, b) => b.receiptNo - a.receiptNo);

  const finalInventory = applyPendingQueueToItems(
    safeUid,
    'inventory',
    mergeByIdPreservingExisting(cloudInventory, localUnsyncedInventory)
  );

  const finalExpenses = applyPendingQueueToItems(
    safeUid,
    'expenses',
    mergeByIdPreservingExisting(cloudExpenses, localUnsyncedExpenses)
  ).sort((a, b) => b.date.localeCompare(a.date));

  return {
    settings: nextSettings,
    receipts: finalReceipts,
    inventory: finalInventory,
    expenses: finalExpenses,
  };
}

// ==================== REAL-TIME CLOUD LISTENERS ====================
export function subscribeToClinicCloudData(
  uid: string,
  callbacks: {
    onSettingsUpdate: (partialSettings: Omit<ClinicSettings, 'services'>) => void;
    onServicesUpdate: (services: DentalServiceItem[]) => void;
    onReceiptsUpdate: (receipts: ReceiptRecord[]) => void;
    onInventoryUpdate: (inventory: InventoryItem[]) => void;
    onExpensesUpdate: (expenses: ExpenseRecord[]) => void;
  }
): () => void {
  const safeUid = sanitizeId(uid);
  const prefix = `${safeUid}_`;
  const stripPrefix = (docId: string) =>
    docId.startsWith(prefix) ? docId.slice(prefix.length) : docId;

  const unsubClinic = onSnapshot(
    query(collection(db, 'clinics'), where('ownerId', '==', safeUid)),
    (snap) => {
      if (snap.empty) return;
      verifiedClinicParentUids.add(safeUid);
      const pending = loadPendingSyncState(safeUid);
      if (pending.settings) {
        return;
      }
      const d = snap.docs[0].data();
      const rawCurrency = String(d.defaultCurrency || 'ريال يمني');
      const validCurrency: CurrencyCode =
        rawCurrency === 'ريال سعودي' || rawCurrency === 'دولار أمريكي'
          ? rawCurrency
          : 'ريال يمني';

      const cloudTg = d.telegramBackup as Partial<TelegramBackupSettings> | undefined;
      const parsedTelegram: TelegramBackupSettings | undefined = cloudTg
        ? {
            enabled: Boolean(cloudTg.enabled && cloudTg.botToken?.trim() && cloudTg.chatId?.trim()),
            autoBackupOnReceipt: Boolean(cloudTg.autoBackupOnReceipt ?? true),
            botToken: String(cloudTg.botToken || '').trim(),
            chatId: String(cloudTg.chatId || '').trim(),
            lastBackupAt: cloudTg.lastBackupAt ? String(cloudTg.lastBackupAt) : undefined,
          }
        : undefined;

      const cloudSub = d.subscription as Partial<ClinicSubscription> | undefined;
      const isDev = isPlatformDeveloperUser(auth.currentUser?.email || d.ownerEmail);
      const parsedSubscription: ClinicSubscription = {
        planId: (cloudSub?.planId as 'free' | 'ai_pro' | 'enterprise') || (isDev ? 'enterprise' : 'free'),
        planNameAr: String(cloudSub?.planNameAr || (isDev ? 'باقة المطور الشاملة' : 'الباقة الأساسية')),
        isAiEnabled: isDev ? true : Boolean(cloudSub?.isAiEnabled),
        status: (cloudSub?.status as 'active' | 'expired' | 'trial' | 'locked') || (isDev ? 'active' : 'locked'),
        activatedAt: cloudSub?.activatedAt ? String(cloudSub.activatedAt) : undefined,
        expiresAt: cloudSub?.expiresAt ? String(cloudSub.expiresAt) : undefined,
        activatedBy: cloudSub?.activatedBy ? String(cloudSub.activatedBy) : undefined,
        notes: cloudSub?.notes ? String(cloudSub.notes) : undefined,
      };

      const parsedAiConfig = parseCloudAiConfig(d.aiConfig);
      if (parsedAiConfig) {
        saveAIProviderConfig(parsedAiConfig);
      }

      const isOwnerSession = auth.currentUser?.uid === safeUid;
      const resolvedOwnerEmail = d.ownerEmail
        ? String(d.ownerEmail).toLowerCase()
        : isOwnerSession && auth.currentUser?.email
          ? auth.currentUser.email.toLowerCase()
          : '';

      callbacks.onSettingsUpdate({
        identity: {
          systemTitleAr: String(d.clinicAr || 'عيادة طب وجراحة الفم والأسنان'),
          clinicAr: String(d.clinicAr ?? ''),
          doctorAr: String(d.doctorAr ?? ''),
          specialtyAr: String(d.specialtyAr ?? ''),
          clinicEn: String(d.clinicEn ?? ''),
          doctorEn: String(d.doctorEn ?? ''),
          address: String(d.address ?? ''),
          phones: String(d.phones ?? ''),
          defaultCurrency: validCurrency,
          ownerEmail: resolvedOwnerEmail,
        },
        appearance: {
          primaryColor: String(d.primaryColor || '#0B2545'),
          accentColor: '#0EA5E9',
          watermarkOpacity: Number(d.watermarkOpacity ?? 6),
          customLogoDataUrl: String(d.customLogoDataUrl || ''),
          permanentAccountantSig: String(d.permanentAccountantSig || ''),
        },
        features: {
          autoPrice: true,
          debtAlert: true,
          autoInventory: Boolean(d.autoInventory ?? true),
          showQrCode: Boolean(d.showQrCode ?? true),
        },
        telegramBackup: parsedTelegram,
        subscription: parsedSubscription,
        ...(parsedAiConfig ? { aiConfig: parsedAiConfig } : {}),
      });
    },
    (err) => {
      console.warn('Firestore clinics listener notice:', err);
    }
  );

  const unsubServices = onSnapshot(
    query(collection(db, 'services'), where('ownerId', '==', safeUid)),
    (snap) => {
      snap.docs.forEach((docSnap) => knownExistingDocIds.add(docSnap.id));
      const items: DentalServiceItem[] = snap.docs.map((docSnap) => {
        const d = docSnap.data();
        const name = String(d.name || '');
        const decoded = decodeServiceKeywordsAndRecipe(d.keywords, name);
        return {
          id: stripPrefix(docSnap.id),
          name,
          price: Number(d.price || 0),
          category: String(d.category || 'علاجات سنية'),
          keywords: decoded.keywords,
          materialsRecipe: decoded.materialsRecipe,
          totalSessions: decoded.totalSessions,
        };
      });
      const merged = applyPendingQueueToItems(safeUid, 'services', items);
      if (merged.length > 0) {
        callbacks.onServicesUpdate(merged);
      }
    },
    (err) => {
      console.warn('Firestore services listener notice:', err);
    }
  );

  const unsubReceipts = onSnapshot(
    query(collection(db, 'receipts'), where('ownerId', '==', safeUid)),
    (snap) => {
      snap.docs.forEach((docSnap) => knownExistingDocIds.add(docSnap.id));
      const items: ReceiptRecord[] = snap.docs
        .filter((docSnap) => {
          const id = stripPrefix(docSnap.id);
          if (SEED_DEMO_IDS.receipts.has(id)) {
            deleteDoc(docSnap.ref).catch(() => {});
            return false;
          }
          return true;
        })
        .map((docSnap) => {
          const d = docSnap.data();
          const decodedRecNotes = decodeReceiptNotesAndConsumedMaterials(d.notes);
          return {
            id: stripPrefix(docSnap.id),
            receiptNo: Number(d.receiptNo || 1001),
            date: String(d.date || ''),
            patientName: String(d.patientName || ''),
            patientPhone: String(d.patientPhone || ''),
            services: Array.isArray(d.services) ? d.services.map(String) : [],
            toothFDI: String(d.toothFDI || ''),
            totalAmount: Number(d.totalAmount || 0),
            paidAmount: Number(d.paidAmount || 0),
            remainingAmount: Number(d.remainingAmount || 0),
            currency: String(d.currency || 'ريال يمني') as CurrencyCode,
            paymentMethod: String(d.paymentMethod || 'نقداً (Cash)'),
            notes: decodedRecNotes.notes,
            amountWords: String(d.amountWords || ''),
            accountantSig: String(d.accountantSig || ''),
            receiverSig: String(d.receiverSig || ''),
            paperFormat: (d.paperFormat === 'thermal80' ? 'thermal80' : 'a5') as 'a5' | 'thermal80',
            createdAt: d.createdAt?.toDate ? d.createdAt.toDate().toISOString() : new Date().toISOString(),
            ...(decodedRecNotes.consumedMaterials
              ? { consumedMaterials: decodedRecNotes.consumedMaterials }
              : {}),
          };
        });

      const merged = applyPendingQueueToItems(safeUid, 'receipts', items).sort(
        (a, b) => b.receiptNo - a.receiptNo
      );
      callbacks.onReceiptsUpdate(merged);
    },
    (err) => {
      console.warn('Firestore receipts listener notice:', err);
    }
  );

  const unsubInventory = onSnapshot(
    query(collection(db, 'inventory'), where('ownerId', '==', safeUid)),
    (snap) => {
      snap.docs.forEach((docSnap) => knownExistingDocIds.add(docSnap.id));
      const items: InventoryItem[] = snap.docs
        .filter((docSnap) => {
          const id = stripPrefix(docSnap.id);
          if (SEED_DEMO_IDS.inventory.has(id)) {
            deleteDoc(docSnap.ref).catch(() => {});
            return false;
          }
          return true;
        })
        .map((docSnap) => {
          const d = docSnap.data();
          const qty = Number(d.qty || 0);
          const unit = String(d.unit || 'قطعة');
          const decodedInvMeta = decodeInventoryCategoryWithMeta(d.category, qty, unit);
          return {
            id: stripPrefix(docSnap.id),
            name: String(d.name || ''),
            notes: decodedInvMeta.notes,
            qty,
            minQty: Number(d.minQty || 0),
            unit,
            unitPrice: Number(d.unitPrice || 0),
            totalCost: Number(d.totalCost || 0),
            linkedService: String(d.linkedService || ''),
            updatedAt: d.updatedAt?.toDate
              ? d.updatedAt.toDate().toISOString().slice(0, 10)
              : new Date().toISOString().slice(0, 10),
            location: decodedInvMeta.location,
            packageSize: decodedInvMeta.packageSize,
            usageUnit: decodedInvMeta.usageUnit,
            remainingSubUnits: decodedInvMeta.remainingSubUnits,
          };
        });

      const merged = applyPendingQueueToItems(safeUid, 'inventory', items);
      callbacks.onInventoryUpdate(merged);
    },
    (err) => {
      console.warn('Firestore inventory listener notice:', err);
    }
  );

  const unsubExpenses = onSnapshot(
    query(collection(db, 'expenses'), where('ownerId', '==', safeUid)),
    (snap) => {
      snap.docs.forEach((docSnap) => knownExistingDocIds.add(docSnap.id));
      const items: ExpenseRecord[] = snap.docs
        .filter((docSnap) => {
          const id = stripPrefix(docSnap.id);
          if (SEED_DEMO_IDS.expenses.has(id)) {
            deleteDoc(docSnap.ref).catch(() => {});
            return false;
          }
          return true;
        })
        .map((docSnap) => {
          const d = docSnap.data();
          return {
            id: stripPrefix(docSnap.id),
            title: String(d.title || ''),
            amount: Number(d.amount || 0),
            category: String(d.category || 'تشغيل'),
            currency: String(d.currency || 'ريال يمني') as CurrencyCode,
            date: String(d.date || ''),
          };
        });

      const merged = applyPendingQueueToItems(safeUid, 'expenses', items).sort((a, b) =>
        b.date.localeCompare(a.date)
      );
      callbacks.onExpensesUpdate(merged);
    },
    (err) => {
      console.warn('Firestore expenses listener notice:', err);
    }
  );

  return () => {
    unsubClinic();
    unsubServices();
    unsubReceipts();
    unsubInventory();
    unsubExpenses();
  };
}

// ==================== AUTHENTICATED CLINIC WORKSPACE (clinic_workspaces/{clinicId}) ====================

export function normalizeClinicWorkspaceId(raw: string): string {
  const cleaned = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);
  return cleaned.length >= 3 ? cleaned : `clinic-${cleaned || 'default'}`;
}

export function extractClinicIdFromEmail(email?: string | null): string | null {
  if (!email) return null;
  const trimmed = String(email).trim();
  if (trimmed.endsWith('@clinic.alssaedic.local')) {
    return trimmed.replace('@clinic.alssaedic.local', '');
  }
  return null;
}

function buildSyntheticClinicEmail(clinicId: string): string {
  const safeId = normalizeClinicWorkspaceId(clinicId);
  return `${safeId}@clinic.alssaedic.local`;
}

function buildFirebaseAuthPassword(clinicId: string, rawPassword: string): string {
  const safeId = normalizeClinicWorkspaceId(clinicId);
  return `alssaedic#${safeId}#${String(rawPassword || '').trim()}`;
}

export interface DirectWorkspacePayload {
  settings: ClinicSettings;
  receipts: ReceiptRecord[];
  inventory: InventoryItem[];
  expenses: ExpenseRecord[];
}

export async function authenticateDirectWorkspaceInCloud(
  clinicId: string,
  password: string,
  initialData: DirectWorkspacePayload,
  mode: 'login' | 'register' | 'auto' = 'auto'
): Promise<{
  ok: boolean;
  status?: 'authenticated' | 'created';
  clinicId: string;
  ownerUid?: string;
  sessionToken?: string;
  expiresAt?: string;
  updatedAt: string;
  error?: string;
  data?: DirectWorkspacePayload;
}> {
  const safeId = normalizeClinicWorkspaceId(clinicId);
  const cleanPass = String(password || '').trim();
  const nowIso = new Date().toISOString();

  if (!safeId || safeId.length < 3) {
    return {
      ok: false,
      clinicId: safeId,
      updatedAt: nowIso,
      error: 'يرجى إدخال معرّف العيادة أو رقم الهاتف (3 أحرف أو أرقام على الأقل).',
    };
  }
  if (cleanPass.length < 4) {
    return {
      ok: false,
      clinicId: safeId,
      updatedAt: nowIso,
      error: 'يرجى إدخال كلمة مرور مكونة من 4 أحرف أو أرقام على الأقل.',
    };
  }

  const syntheticEmail = buildSyntheticClinicEmail(safeId);
  const firebasePassword = buildFirebaseAuthPassword(safeId, cleanPass);

  let firebaseUser: User | null = null;
  let authStatus: 'authenticated' | 'created' = 'authenticated';

  // 1. Authenticate with real Firebase Authentication (Email/Password)
  try {
    if (mode === 'register') {
      try {
        const cred = await createUserWithEmailAndPassword(auth, syntheticEmail, firebasePassword);
        firebaseUser = cred.user;
        authStatus = 'created';
      } catch (regErr: unknown) {
        const regCode = (regErr as { code?: string })?.code || '';
        if (regCode === 'auth/email-already-in-use') {
          try {
            const cred = await signInWithEmailAndPassword(auth, syntheticEmail, firebasePassword);
            firebaseUser = cred.user;
            authStatus = 'authenticated';
          } catch {
            throw regErr;
          }
        } else {
          throw regErr;
        }
      }
    } else if (mode === 'login') {
      const cred = await signInWithEmailAndPassword(auth, syntheticEmail, firebasePassword);
      firebaseUser = cred.user;
      authStatus = 'authenticated';
    } else {
      try {
        const cred = await signInWithEmailAndPassword(auth, syntheticEmail, firebasePassword);
        firebaseUser = cred.user;
        authStatus = 'authenticated';
      } catch (loginErr: unknown) {
        const code = (loginErr as { code?: string })?.code || '';
        if (code === 'auth/user-not-found' || code === 'auth/invalid-credential') {
          const cred = await createUserWithEmailAndPassword(auth, syntheticEmail, firebasePassword);
          firebaseUser = cred.user;
          authStatus = 'created';
        } else {
          throw loginErr;
        }
      }
    }
  } catch (authErr: unknown) {
    const code = (authErr as { code?: string })?.code || '';
    if (code === 'auth/email-already-in-use') {
      return {
        ok: false,
        clinicId: safeId,
        updatedAt: nowIso,
        error: 'معرّف العيادة مسجل مسبقاً بكلمة مرور أخرى. اختر "تسجيل الدخول" وأدخل كلمة المرور الصحيحة.',
      };
    }
    if (
      code === 'auth/wrong-password' ||
      code === 'auth/invalid-credential' ||
      code === 'auth/user-not-found'
    ) {
      return {
        ok: false,
        clinicId: safeId,
        updatedAt: nowIso,
        error: 'معرّف العيادة أو كلمة المرور غير صحيحة.',
      };
    }
    if (code === 'auth/operation-not-allowed') {
      return {
        ok: false,
        clinicId: safeId,
        updatedAt: nowIso,
        error: 'يرجى تسجيل الدخول عبر زر حساب Google أدناه لتفعيل المزامنة السحابية.',
      };
    }
    return {
      ok: false,
      clinicId: safeId,
      updatedAt: nowIso,
      error: 'تعذر التحقق من الحساب. تحقق من الاتصال بالإنترنت.',
    };
  }

  if (!firebaseUser || !firebaseUser.uid) {
    return {
      ok: false,
      clinicId: safeId,
      updatedAt: nowIso,
      error: 'لم يتم الحصول على معرّف مستخدم موثق.',
    };
  }

  const ownerUid = sanitizeId(firebaseUser.uid);

  // 2. Issue signed, expiring server session token (with Firebase ID token fallback)
  let sessionToken = '';
  let expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();

  const sessionRes = await issueServerSessionToken({
    clinicId: safeId,
    ownerUid,
    password: cleanPass,
  });

  if (sessionRes.ok && sessionRes.sessionToken) {
    sessionToken = sessionRes.sessionToken;
    expiresAt = sessionRes.expiresAt;
  } else {
    try {
      sessionToken = await firebaseUser.getIdToken();
    } catch {
      sessionToken = `fb_${ownerUid}_${Date.now()}`;
    }
  }

  // 3. Fetch and merge existing cloud collections
  let mergedData: DirectWorkspacePayload = initialData;
  try {
    mergedData = await fetchClinicCollectionsFromFirestore(ownerUid, initialData);
  } catch (readErr) {
    console.warn('Cloud read fallback to local records:', readErr);
  }

  // 4. Synchronize records to Firestore collections
  const workspaceRef = doc(db, 'clinic_workspaces', safeId);
  try {
    await syncLocalDataToCloud(
      ownerUid,
      mergedData.settings,
      mergedData.receipts,
      mergedData.inventory,
      mergedData.expenses,
      true
    );

    const boundedSettingsMetadata = {
      identity: mergedData.settings.identity,
      appearance: {
        primaryColor: mergedData.settings.appearance.primaryColor,
        accentColor: mergedData.settings.appearance.accentColor,
        watermarkOpacity: mergedData.settings.appearance.watermarkOpacity,
      },
      features: mergedData.settings.features,
    };

    const wsExists = await checkDocExistsFast('clinic_workspaces', ownerUid, safeId);
    if (wsExists) {
      await withCloudRetry(() =>
        updateDoc(workspaceRef, {
          settings: boundedSettingsMetadata,
          receiptCount: mergedData.receipts.length,
          inventoryCount: mergedData.inventory.length,
          expenseCount: mergedData.expenses.length,
          updatedAt: serverTimestamp(),
        })
      );
    } else {
      await withCloudRetry(() =>
        setDoc(workspaceRef, {
          ownerId: ownerUid,
          clinicId: safeId,
          settings: boundedSettingsMetadata,
          receiptCount: mergedData.receipts.length,
          inventoryCount: mergedData.inventory.length,
          expenseCount: mergedData.expenses.length,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      );
    }
  } catch (syncErr) {
    console.warn('Cloud write sync notice:', syncErr);
  }

  return {
    ok: true,
    status: authStatus,
    clinicId: safeId,
    ownerUid,
    sessionToken,
    expiresAt,
    updatedAt: nowIso,
    data: mergedData,
  };
}

export async function pushDirectWorkspaceToCloud(
  clinicId: string,
  ownerUid: string,
  data: DirectWorkspacePayload
): Promise<string> {
  const safeId = normalizeClinicWorkspaceId(clinicId);
  const safeUid = sanitizeId(ownerUid);

  if (!auth.currentUser || !isCurrentSessionAuthorizedForClinic(safeUid)) {
    throw new Error('غير مصرح بالمزامنة السحابية: الجلسة غير موثقة.');
  }

  await syncLocalDataToCloud(
    safeUid,
    data.settings,
    data.receipts,
    data.inventory,
    data.expenses,
    true
  );

  if (auth.currentUser.uid === safeUid) {
    const boundedSettingsMetadata = {
      identity: data.settings.identity,
      appearance: {
        primaryColor: data.settings.appearance.primaryColor,
        accentColor: data.settings.appearance.accentColor,
        watermarkOpacity: data.settings.appearance.watermarkOpacity,
      },
      features: data.settings.features,
    };

    const ref = doc(db, 'clinic_workspaces', safeId);
    try {
      await withCloudRetry(async () => {
        const exists = await checkDocExistsFast('clinic_workspaces', safeUid, safeId);
        if (exists) {
          await updateDoc(ref, {
            settings: boundedSettingsMetadata,
            receiptCount: data.receipts.length,
            inventoryCount: data.inventory.length,
            expenseCount: data.expenses.length,
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(ref, {
            ownerId: safeUid,
            clinicId: safeId,
            settings: boundedSettingsMetadata,
            receiptCount: data.receipts.length,
            inventoryCount: data.inventory.length,
            expenseCount: data.expenses.length,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      });
    } catch (err) {
      console.warn('Workspace metadata update notice:', err);
    }
  }

  return new Date().toISOString();
}

// ==================== WORKSPACE TEAM & MEMBERSHIP (MULTI-USER RBAC) ====================

const LOCAL_WORKSPACE_MEMBERS_KEY = 'docai_workspace_members_v1';

export function normalizeEmailKey(email: string): string {
  return String(email || '')
    .trim()
    .toLowerCase()
    .slice(0, 128);
}

export function formatMemberIdentifierToEmail(rawInput: string): {
  emailKey: string;
  displayIdentifier: string;
} {
  const trimmed = String(rawInput || '').trim().toLowerCase();
  if (!trimmed) {
    return { emailKey: '', displayIdentifier: '' };
  }
  if (trimmed.includes('@')) {
    return {
      emailKey: normalizeEmailKey(trimmed),
      displayIdentifier: trimmed,
    };
  }
  const safeId = trimmed
    .replace(/[^a-z0-9_\-.]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
  const finalId = safeId.length >= 2 ? safeId : `user-${Date.now().toString().slice(-5)}`;
  return {
    emailKey: `${finalId}@clinic.alssaedic.local`,
    displayIdentifier: trimmed,
  };
}

export function loadLocalWorkspaceMembers(workspaceId: string): WorkspaceMember[] {
  try {
    const safeWsId = normalizeClinicWorkspaceId(workspaceId);
    const raw = localStorage.getItem(`${LOCAL_WORKSPACE_MEMBERS_KEY}_${safeWsId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((m) => m && typeof m.email === 'string');
  } catch {
    return [];
  }
}

function saveLocalWorkspaceMembers(workspaceId: string, members: WorkspaceMember[]): void {
  try {
    const safeWsId = normalizeClinicWorkspaceId(workspaceId);
    localStorage.setItem(`${LOCAL_WORKSPACE_MEMBERS_KEY}_${safeWsId}`, JSON.stringify(members));
  } catch {
    // Ignore storage quota errors
  }
}

export async function addWorkspaceMemberInCloud(
  workspaceId: string,
  ownerUid: string,
  memberEmail: string,
  role: WorkspaceRole,
  permissions?: WorkspacePermissions,
  displayName?: string
): Promise<WorkspaceMember> {
  const safeWsId = normalizeClinicWorkspaceId(workspaceId);
  const cleanEmail = String(memberEmail || '').trim().toLowerCase();
  if (!isValidRealEmail(cleanEmail)) {
    throw new Error('يرجى إدخال بريد إلكتروني حقيقي وصحيح للعضو (مثال: accountant@gmail.com).');
  }

  const effectivePermissions = permissions || DEFAULT_ROLE_PERMISSIONS[role];
  const memberKey = normalizeEmailKey(cleanEmail);
  const effectiveOwnerUid = auth.currentUser?.uid || ownerUid || 'local_owner';
  const nowIso = new Date().toISOString();
  const cleanDisplayName = displayName?.trim() || undefined;

  const memberData: WorkspaceMember = {
    uid: memberKey,
    email: cleanEmail,
    displayName: cleanDisplayName,
    role,
    permissions: effectivePermissions,
    addedBy: effectiveOwnerUid,
    joinedAt: nowIso,
    status: 'active',
  };

  // 1. Always save locally first so adding/upgrading works immediately even offline
  const existingLocal = loadLocalWorkspaceMembers(safeWsId);
  const updatedLocal = [
    memberData,
    ...existingLocal.filter((m) => normalizeEmailKey(m.email) !== memberKey),
  ];
  saveLocalWorkspaceMembers(safeWsId, updatedLocal);

  // 2. Sync to Firestore if signed in
  if (auth.currentUser) {
    const memberRef = doc(db, 'clinic_workspaces', safeWsId, 'members', memberKey);
    const indexRef = doc(db, 'user_workspaces', memberKey);

    try {
      await ensureClinicDocumentInCloud(auth.currentUser.uid);
      await withCloudRetry(async () => {
        await setDoc(
          memberRef,
          {
            uid: memberKey,
            email: cleanEmail,
            ...(cleanDisplayName ? { displayName: cleanDisplayName } : {}),
            role,
            permissions: effectivePermissions,
            addedBy: auth.currentUser!.uid,
            joinedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            status: 'active',
          },
          { merge: true }
        );

        await setDoc(
          indexRef,
          {
            workspaceId: safeWsId,
            email: cleanEmail,
            ...(cleanDisplayName ? { displayName: cleanDisplayName } : {}),
            role,
            permissions: effectivePermissions,
            addedBy: auth.currentUser!.uid,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      });
    } catch (err) {
      console.warn('Cloud member add sync notice:', err);
    }
  }

  return memberData;
}

export async function updateWorkspaceMemberRoleInCloud(
  workspaceId: string,
  memberEmail: string,
  newRole: WorkspaceRole,
  permissions?: WorkspacePermissions,
  displayName?: string
): Promise<WorkspaceMember> {
  const safeWsId = normalizeClinicWorkspaceId(workspaceId);
  const cleanEmail = String(memberEmail || '').trim().toLowerCase();
  const memberKey = normalizeEmailKey(cleanEmail);
  const effectivePermissions = permissions || DEFAULT_ROLE_PERMISSIONS[newRole];
  const effectiveOwnerUid = auth.currentUser?.uid || 'local_owner';

  // 1. Update local storage immediately
  const existingLocal = loadLocalWorkspaceMembers(safeWsId);
  const existingMember = existingLocal.find((m) => normalizeEmailKey(m.email) === memberKey);
  const updatedMember: WorkspaceMember = {
    uid: memberKey,
    email: cleanEmail,
    displayName: displayName?.trim() || existingMember?.displayName,
    role: newRole,
    permissions: effectivePermissions,
    addedBy: existingMember?.addedBy || effectiveOwnerUid,
    joinedAt: existingMember?.joinedAt || new Date().toISOString(),
    status: 'active',
  };

  const nextLocal = existingLocal.some((m) => normalizeEmailKey(m.email) === memberKey)
    ? existingLocal.map((m) => (normalizeEmailKey(m.email) === memberKey ? updatedMember : m))
    : [updatedMember, ...existingLocal];
  saveLocalWorkspaceMembers(safeWsId, nextLocal);

  // 2. Sync to Firestore if signed in
  if (auth.currentUser) {
    const memberRef = doc(db, 'clinic_workspaces', safeWsId, 'members', memberKey);
    const indexRef = doc(db, 'user_workspaces', memberKey);

    try {
      await withCloudRetry(async () => {
        await setDoc(
          memberRef,
          {
            uid: memberKey,
            email: cleanEmail,
            ...(updatedMember.displayName ? { displayName: updatedMember.displayName } : {}),
            role: newRole,
            permissions: effectivePermissions,
            addedBy: auth.currentUser!.uid,
            status: 'active',
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
        await setDoc(
          indexRef,
          {
            workspaceId: safeWsId,
            email: cleanEmail,
            ...(updatedMember.displayName ? { displayName: updatedMember.displayName } : {}),
            role: newRole,
            permissions: effectivePermissions,
            addedBy: auth.currentUser!.uid,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      });
    } catch (err) {
      console.warn('Cloud member role update notice:', err);
    }
  }

  return updatedMember;
}

export async function removeWorkspaceMemberFromCloud(
  workspaceId: string,
  memberEmail: string
): Promise<void> {
  const safeWsId = normalizeClinicWorkspaceId(workspaceId);
  const cleanEmail = String(memberEmail || '').trim().toLowerCase();
  const memberKey = normalizeEmailKey(cleanEmail);

  // 1. Remove from local storage immediately
  const existingLocal = loadLocalWorkspaceMembers(safeWsId);
  saveLocalWorkspaceMembers(
    safeWsId,
    existingLocal.filter((m) => normalizeEmailKey(m.email) !== memberKey)
  );

  // 2. Remove from Firestore if signed in
  if (auth.currentUser) {
    const memberRef = doc(db, 'clinic_workspaces', safeWsId, 'members', memberKey);
    const indexRef = doc(db, 'user_workspaces', memberKey);

    try {
      await withCloudRetry(async () => {
        await deleteDoc(memberRef);
        await deleteDoc(indexRef);
      });
    } catch (err) {
      console.warn('Cloud member delete notice:', err);
    }
  }
}

export function subscribeToWorkspaceMembers(
  workspaceId: string,
  onMembersUpdate: (members: WorkspaceMember[]) => void
): () => void {
  const safeWsId = normalizeClinicWorkspaceId(workspaceId);
  const localInitial = loadLocalWorkspaceMembers(safeWsId);
  onMembersUpdate(localInitial);

  if (!auth.currentUser) {
    return () => {};
  }

  const membersCol = collection(db, 'clinic_workspaces', safeWsId, 'members');

  return onSnapshot(
    membersCol,
    (snap) => {
      const cloudItems: WorkspaceMember[] = snap.docs.map((docSnap) => {
        const d = docSnap.data();
        const role = (d.role || 'viewer') as WorkspaceRole;
        const perms = d.permissions || DEFAULT_ROLE_PERMISSIONS[role];
        return {
          uid: docSnap.id,
          email: String(d.email || docSnap.id),
          displayName: d.displayName ? String(d.displayName) : undefined,
          role,
          permissions: perms,
          addedBy: String(d.addedBy || ''),
          joinedAt: d.joinedAt?.toDate ? d.joinedAt.toDate().toISOString() : new Date().toISOString(),
          status: (d.status === 'invited' ? 'invited' : 'active') as 'active' | 'invited',
        };
      });

      const currentLocal = loadLocalWorkspaceMembers(safeWsId);
      const cloudKeySet = new Set(cloudItems.map((c) => normalizeEmailKey(c.email)));
      const unsyncedLocal = currentLocal.filter((l) => !cloudKeySet.has(normalizeEmailKey(l.email)));

      if (auth.currentUser && unsyncedLocal.length > 0) {
        unsyncedLocal.forEach((m) => {
          addWorkspaceMemberInCloud(
            safeWsId,
            auth.currentUser!.uid,
            m.email,
            m.role,
            m.permissions,
            m.displayName
          ).catch(() => {});
        });
      }

      const merged = [...cloudItems, ...unsyncedLocal];
      saveLocalWorkspaceMembers(safeWsId, merged);
      onMembersUpdate(merged);
    },
    (err) => {
      console.warn('Workspace members listener notice:', err);
      onMembersUpdate(loadLocalWorkspaceMembers(safeWsId));
    }
  );
}

export async function lookupUserWorkspaceByEmail(
  email: string
): Promise<{
  workspaceId: string;
  role: WorkspaceRole;
  permissions: WorkspacePermissions;
  addedBy: string;
} | null> {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail || isSuperAdminEmail(cleanEmail)) return null;
  const memberKey = normalizeEmailKey(cleanEmail);
  const ref = doc(db, 'user_workspaces', memberKey);

  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    const d = snap.data();
    const addedBy = String(d.addedBy || '');
    // If the user added their own email to their own workspace, treat them as primary clinic owner
    if (!addedBy || (auth.currentUser && addedBy === auth.currentUser.uid)) {
      return null;
    }
    const parentExists = await checkDocExistsFast('clinics', addedBy, addedBy);
    if (!parentExists) {
      return null;
    }
    const role = (d.role || 'viewer') as WorkspaceRole;
    return {
      workspaceId: String(d.workspaceId || ''),
      role,
      permissions: d.permissions || DEFAULT_ROLE_PERMISSIONS[role],
      addedBy,
    };
  } catch (err) {
    console.warn('User workspace lookup error:', err);
    return null;
  }
}

export interface RegisteredClinicSummary {
  id: string;
  clinicAr: string;
  doctorAr: string;
  ownerEmail?: string;
  phones: string;
  address: string;
  updatedAt: string;
  subscription?: ClinicSubscription;
  aiConfig?: AIProviderConfig;
  isDeveloperClinic?: boolean;
  workspaceIds?: string[];
}

export interface RegisteredAccountSummary {
  email: string;
  displayName?: string;
  role: WorkspaceRole;
  workspaceId: string;
}

export function isSuperAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  const clean = email.trim().toLowerCase();
  return (
    clean === 'alssaedy50@gmail.com' ||
    clean === 'alssaedy500@gmail.com' ||
    clean === 'alssaedy-clinic@clinic.alssaedic.local'
  );
}

export async function fetchRegisteredSystemDirectory(
  workspaceId: string,
  overrideEmail?: string | null
): Promise<{
  clinics: RegisteredClinicSummary[];
  accounts: RegisteredAccountSummary[];
}> {
  const safeWsId = normalizeClinicWorkspaceId(workspaceId || 'alssaedy-clinic');
  const localMembers = loadLocalWorkspaceMembers(safeWsId);
  const accountMap = new Map<string, RegisteredAccountSummary>();

  const currentAuthEmail =
    auth.currentUser?.email ||
    auth.currentUser?.providerData?.find((p) => p?.email)?.email ||
    overrideEmail ||
    null;

  if (currentAuthEmail && currentAuthEmail.includes('@')) {
    accountMap.set(currentAuthEmail.toLowerCase(), {
      email: currentAuthEmail.toLowerCase(),
      displayName: auth.currentUser?.displayName || 'الحساب الرئيسي (المالك)',
      role: 'owner',
      workspaceId: safeWsId,
    });
  }

  for (const m of localMembers) {
    if (m.email) {
      accountMap.set(m.email.toLowerCase(), {
        email: m.email.toLowerCase(),
        displayName: m.displayName,
        role: m.role,
        workspaceId: safeWsId,
      });
    }
  }

  const isSuperAdmin = isSuperAdminEmail(currentAuthEmail);

  if (!auth.currentUser || !isSuperAdmin) {
    return {
      clinics: [],
      accounts: Array.from(accountMap.values()),
    };
  }

  const currentUid = auth.currentUser.uid;
  const clinicsMap = new Map<string, RegisteredClinicSummary>();
  const emailByWorkspaceId = new Map<string, string>();
  const emailByOwnerUid = new Map<string, string>();
  const workspaceIdsByOwnerUid = new Map<string, Set<string>>();

  // Fetch all collections in parallel for maximum speed
  const [clinicsResult, wsResult, accountsResult, membersResult] = await Promise.allSettled([
    getDocs(query(collection(db, 'clinics'))),
    getDocs(query(collection(db, 'clinic_workspaces'))),
    getDocs(query(collection(db, 'user_workspaces'))),
    getDocs(collection(db, 'clinic_workspaces', safeWsId, 'members')),
  ]);

  // 1. Process user_workspaces to map emails to owners and workspaces
  if (accountsResult.status === 'fulfilled') {
    accountsResult.value.docs.forEach((docSnap) => {
      const d = docSnap.data();
      const email = String(d.email || docSnap.id).trim().toLowerCase();
      if (email && email.includes('@') && !email.endsWith('.local')) {
        const role = (d.role || 'viewer') as WorkspaceRole;
        const targetWsId = String(d.workspaceId || safeWsId);
        accountMap.set(email, {
          email,
          displayName: d.displayName ? String(d.displayName) : undefined,
          role,
          workspaceId: targetWsId,
        });

        if (role === 'owner' || !d.addedBy) {
          emailByWorkspaceId.set(targetWsId, email);
          if (d.addedBy) {
            emailByOwnerUid.set(String(d.addedBy), email);
          }
        }
      }
    });
  }

  // 2. Process clinic_workspaces to map identities & accounts
  if (wsResult.status === 'fulfilled') {
    wsResult.value.docs.forEach((docSnap) => {
      const d = docSnap.data();
      const ownerId = String(d.ownerId || docSnap.id);
      const wsSet = workspaceIdsByOwnerUid.get(ownerId) || new Set<string>();
      wsSet.add(docSnap.id);
      if (d.clinicId) wsSet.add(String(d.clinicId));
      workspaceIdsByOwnerUid.set(ownerId, wsSet);

      const identity = (d.settings?.identity || {}) as Partial<ClinicSettings['identity']>;
      const wsSub = (d.settings?.subscription || d.subscription) as Partial<ClinicSubscription> | undefined;
      const rawEmail = String(identity.ownerEmail || '').trim().toLowerCase();
      const isDevWs =
        ownerId === currentUid ||
        docSnap.id === currentUid ||
        docSnap.id === 'alssaedy-clinic' ||
        (identity.clinicAr && identity.clinicAr.includes('المطور')) ||
        (identity.doctorAr && identity.doctorAr.includes('عمير'));

      let resolvedOwnerEmail: string | undefined = undefined;
      if (rawEmail && rawEmail.includes('@') && !rawEmail.endsWith('.local')) {
        if (isSuperAdminEmail(rawEmail) && !isDevWs) {
          const altEmail = emailByWorkspaceId.get(docSnap.id) || emailByOwnerUid.get(ownerId);
          if (altEmail && !isSuperAdminEmail(altEmail)) {
            resolvedOwnerEmail = altEmail;
          }
        } else {
          resolvedOwnerEmail = rawEmail;
        }
      } else {
        const altEmail = emailByWorkspaceId.get(docSnap.id) || emailByOwnerUid.get(ownerId);
        if (altEmail && (!isSuperAdminEmail(altEmail) || isDevWs)) {
          resolvedOwnerEmail = altEmail;
        } else if (isDevWs) {
          resolvedOwnerEmail = currentAuthEmail || 'alssaedy50@gmail.com';
        }
      }

      if (resolvedOwnerEmail && resolvedOwnerEmail.includes('@')) {
        emailByWorkspaceId.set(docSnap.id, resolvedOwnerEmail);
        emailByOwnerUid.set(ownerId, resolvedOwnerEmail);
        if (!accountMap.has(resolvedOwnerEmail)) {
          accountMap.set(resolvedOwnerEmail, {
            email: resolvedOwnerEmail,
            displayName: String(identity.doctorAr || identity.clinicAr || 'مالك عيادة'),
            role: 'owner',
            workspaceId: String(d.clinicId || docSnap.id),
          });
        }
      }

      const parsedSub: ClinicSubscription = {
        planId: (wsSub?.planId as 'free' | 'ai_pro' | 'enterprise') || (isDevWs ? 'enterprise' : 'free'),
        planNameAr: String(wsSub?.planNameAr || (isDevWs ? 'باقة المطور الشاملة' : 'الباقة الأساسية')),
        isAiEnabled: isDevWs ? true : Boolean(wsSub?.isAiEnabled),
        status: (wsSub?.status as 'active' | 'expired' | 'trial' | 'locked') || (isDevWs ? 'active' : 'locked'),
        activatedAt: wsSub?.activatedAt ? String(wsSub.activatedAt) : undefined,
        expiresAt: wsSub?.expiresAt ? String(wsSub.expiresAt) : undefined,
        activatedBy: wsSub?.activatedBy ? String(wsSub.activatedBy) : undefined,
        notes: wsSub?.notes ? String(wsSub.notes) : undefined,
      };

      const parsedWsAiConfig = parseCloudAiConfig(d.settings?.aiConfig || d.aiConfig);

      clinicsMap.set(ownerId, {
        id: ownerId,
        clinicAr: String(identity.clinicAr || d.clinicId || 'عيادة مسجلة'),
        doctorAr: String(identity.doctorAr || ''),
        ownerEmail: resolvedOwnerEmail,
        phones: String(identity.phones || ''),
        address: String(identity.address || ''),
        updatedAt: d.updatedAt?.toDate
          ? d.updatedAt.toDate().toISOString().slice(0, 10)
          : '',
        subscription: parsedSub,
        aiConfig: parsedWsAiConfig,
        isDeveloperClinic: Boolean(isDevWs),
        workspaceIds: Array.from(wsSet),
      });
    });
  }

  // 3. Process clinics collection
  if (clinicsResult.status === 'fulfilled') {
    clinicsResult.value.docs.forEach((docSnap) => {
      const d = docSnap.data();
      const clinicId = docSnap.id;
      const ownerId = String(d.ownerId || clinicId);
      const wsSet = workspaceIdsByOwnerUid.get(clinicId) || workspaceIdsByOwnerUid.get(ownerId) || new Set<string>();
      wsSet.add(clinicId);

      const isDeveloperClinic =
        clinicId === currentUid ||
        ownerId === currentUid ||
        clinicId === 'alssaedy-clinic' ||
        (typeof d.clinicAr === 'string' && d.clinicAr.includes('المطور')) ||
        (typeof d.doctorAr === 'string' && d.doctorAr.includes('عمير'));

      let resolvedOwnerEmail: string | undefined = undefined;
      const rawEmail = String(d.ownerEmail || '').trim().toLowerCase();

      if (rawEmail && rawEmail.includes('@') && !rawEmail.endsWith('.local')) {
        if (isSuperAdminEmail(rawEmail) && !isDeveloperClinic) {
          const altEmail = emailByWorkspaceId.get(clinicId) || emailByOwnerUid.get(ownerId);
          if (altEmail && !isSuperAdminEmail(altEmail)) {
            resolvedOwnerEmail = altEmail;
          } else {
            resolvedOwnerEmail = undefined;
          }
        } else {
          resolvedOwnerEmail = rawEmail;
        }
      } else {
        const altEmail = emailByWorkspaceId.get(clinicId) || emailByOwnerUid.get(ownerId);
        if (altEmail && (!isSuperAdminEmail(altEmail) || isDeveloperClinic)) {
          resolvedOwnerEmail = altEmail;
        } else if (isDeveloperClinic) {
          resolvedOwnerEmail = currentAuthEmail || 'alssaedy50@gmail.com';
        } else {
          resolvedOwnerEmail = undefined;
        }
      }

      if (resolvedOwnerEmail && resolvedOwnerEmail.includes('@')) {
        accountMap.set(resolvedOwnerEmail, {
          email: resolvedOwnerEmail,
          displayName: String(d.doctorAr || d.clinicAr || 'مالك عيادة'),
          role: 'owner',
          workspaceId: clinicId,
        });
      }

      const cloudSub = d.subscription as Partial<ClinicSubscription> | undefined;
      const existingEntry = clinicsMap.get(clinicId);
      const parsedSub: ClinicSubscription = cloudSub
        ? {
            planId: (cloudSub.planId as 'free' | 'ai_pro' | 'enterprise') || (isDeveloperClinic ? 'enterprise' : 'free'),
            planNameAr: String(cloudSub.planNameAr || (isDeveloperClinic ? 'باقة المطور الشاملة' : 'الباقة الأساسية')),
            isAiEnabled: isDeveloperClinic ? true : Boolean(cloudSub.isAiEnabled),
            status: (cloudSub.status as 'active' | 'expired' | 'trial' | 'locked') || (isDeveloperClinic ? 'active' : 'locked'),
            activatedAt: cloudSub.activatedAt ? String(cloudSub.activatedAt) : undefined,
            expiresAt: cloudSub.expiresAt ? String(cloudSub.expiresAt) : undefined,
            activatedBy: cloudSub.activatedBy ? String(cloudSub.activatedBy) : undefined,
            notes: cloudSub.notes ? String(cloudSub.notes) : undefined,
          }
        : existingEntry?.subscription || {
            planId: isDeveloperClinic ? 'enterprise' : 'free',
            planNameAr: isDeveloperClinic ? 'باقة المطور الشاملة' : 'الباقة الأساسية',
            isAiEnabled: Boolean(isDeveloperClinic),
            status: isDeveloperClinic ? 'active' : 'locked',
          };

      const parsedClinicAiConfig = parseCloudAiConfig(d.aiConfig) || existingEntry?.aiConfig;

      clinicsMap.set(clinicId, {
        id: clinicId,
        clinicAr: String(d.clinicAr || existingEntry?.clinicAr || 'عيادة مسجلة'),
        doctorAr: String(d.doctorAr || existingEntry?.doctorAr || ''),
        ownerEmail: resolvedOwnerEmail || existingEntry?.ownerEmail,
        phones: String(d.phones || existingEntry?.phones || ''),
        address: String(d.address || existingEntry?.address || ''),
        updatedAt: d.updatedAt?.toDate
          ? d.updatedAt.toDate().toISOString().slice(0, 10)
          : existingEntry?.updatedAt || '',
        subscription: parsedSub,
        aiConfig: parsedClinicAiConfig,
        isDeveloperClinic: Boolean(isDeveloperClinic),
        workspaceIds: Array.from(wsSet),
      });
    });
  }

  // 4. Process workspace members
  if (membersResult.status === 'fulfilled') {
    membersResult.value.docs.forEach((docSnap) => {
      const d = docSnap.data();
      const email = String(d.email || docSnap.id).trim().toLowerCase();
      if (email.includes('@') && !email.endsWith('.local')) {
        accountMap.set(email, {
          email,
          displayName: d.displayName ? String(d.displayName) : undefined,
          role: (d.role || 'viewer') as WorkspaceRole,
          workspaceId: safeWsId,
        });
      }
    });
  }

  return {
    clinics: Array.from(clinicsMap.values()),
    accounts: Array.from(accountMap.values()),
  };
}

export async function updateClinicAiConfigByDeveloper(
  targetClinic: RegisteredClinicSummary,
  nextAiConfig: AIProviderConfig
): Promise<AIProviderConfig> {
  if (!auth.currentUser || !isSuperAdminEmail(auth.currentUser.email)) {
    throw new Error('غير مصرح: إعداد مفاتيح الذكاء الاصطناعي للعيادات مخصص لمطور المنصة فقط.');
  }

  const cleanClinicId = String(targetClinic.id || '').trim();
  if (!cleanClinicId) {
    throw new Error('معرّف العيادة غير صالح.');
  }

  const cleanAi = sanitizeAiConfigPayload(nextAiConfig);

  const clinicRef = doc(db, 'clinics', cleanClinicId);
  const clinicSnap = await getDoc(clinicRef).catch(() => null);
  if (clinicSnap && clinicSnap.exists()) {
    await updateDoc(clinicRef, {
      aiConfig: cleanAi,
      updatedAt: serverTimestamp(),
    });
  } else {
    await setDoc(
      clinicRef,
      {
        ownerId: cleanClinicId,
        clinicAr: sanitizeStr(targetClinic.clinicAr, 160, 'عيادة مسجلة'),
        doctorAr: sanitizeStr(targetClinic.doctorAr, 160, ''),
        specialtyAr: 'طب وجراحة الفم والأسنان',
        clinicEn: 'DENTAL CLINIC',
        doctorEn: '',
        address: sanitizeStr(targetClinic.address, 250, ''),
        phones: sanitizeStr(targetClinic.phones, 200, ''),
        defaultCurrency: 'ريال يمني',
        primaryColor: '#0B2545',
        watermarkOpacity: 5,
        autoInventory: true,
        showQrCode: true,
        customLogoDataUrl: '',
        permanentAccountantSig: '',
        ...(targetClinic.ownerEmail ? { ownerEmail: targetClinic.ownerEmail } : {}),
        aiConfig: cleanAi,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  // Also update any linked clinic_workspaces documents
  const wsIds = Array.from(new Set([cleanClinicId, ...(targetClinic.workspaceIds || [])]));
  for (const wsId of wsIds) {
    if (!wsId) continue;
    const wsRef = doc(db, 'clinic_workspaces', wsId);
    const wsSnap = await getDoc(wsRef).catch(() => null);
    if (wsSnap && wsSnap.exists()) {
      const existingSettings = (wsSnap.data()?.settings || {}) as Record<string, unknown>;
      await updateDoc(wsRef, {
        settings: {
          ...existingSettings,
          aiConfig: cleanAi,
        },
        updatedAt: serverTimestamp(),
      }).catch(() => {});
    }
  }

  // If updating the currently active clinic or developer clinic, also update local AI config immediately
  if (
    cleanClinicId === auth.currentUser.uid ||
    cleanClinicId === 'alssaedy-clinic' ||
    targetClinic.isDeveloperClinic
  ) {
    saveAIProviderConfig(cleanAi);
  }

  return cleanAi;
}

export async function applyAiConfigToAllClinicsByDeveloper(
  clinics: RegisteredClinicSummary[],
  nextAiConfig: AIProviderConfig
): Promise<number> {
  if (!auth.currentUser || !isSuperAdminEmail(auth.currentUser.email)) {
    throw new Error('غير مصرح: هذه العملية مخصصة لمطور المنصة فقط.');
  }
  const cleanAi = sanitizeAiConfigPayload(nextAiConfig);
  saveAIProviderConfig(cleanAi);
  let updatedCount = 0;
  for (const c of clinics) {
    try {
      await updateClinicAiConfigByDeveloper(c, cleanAi);
      updatedCount++;
    } catch (e) {
      console.warn('Could not update AI config for clinic:', c.id, e);
    }
  }
  return updatedCount;
}

export async function deleteClinicByDeveloper(
  targetClinic: RegisteredClinicSummary
): Promise<void> {
  if (!auth.currentUser || !isSuperAdminEmail(auth.currentUser.email)) {
    throw new Error('غير مصرح: حذف العيادات مخصص لمطور المنصة فقط.');
  }

  const cleanClinicId = String(targetClinic.id || '').trim();
  if (!cleanClinicId) {
    throw new Error('معرّف العيادة غير صالح.');
  }

  if (
    cleanClinicId === auth.currentUser.uid ||
    cleanClinicId === 'alssaedy-clinic' ||
    targetClinic.isDeveloperClinic
  ) {
    throw new Error('لا يمكن حذف العيادة الرئيسية الخاصة بمطور المنصة.');
  }

  // 1. Delete associated sub-records (services, receipts, inventory, expenses) owned by this clinic
  const subCollections = ['services', 'receipts', 'inventory', 'expenses'] as const;
  await Promise.allSettled(
    subCollections.map(async (colName) => {
      const snap = await getDocs(query(collection(db, colName), where('ownerId', '==', cleanClinicId)));
      await Promise.allSettled(snap.docs.map((d) => deleteDoc(d.ref)));
    })
  );

  // 2. Delete clinic_workspaces documents & members
  const wsIds = Array.from(new Set([cleanClinicId, ...(targetClinic.workspaceIds || [])]));
  for (const wsId of wsIds) {
    if (!wsId || wsId === 'alssaedy-clinic' || wsId === auth.currentUser.uid) continue;
    try {
      const membersSnap = await getDocs(collection(db, 'clinic_workspaces', wsId, 'members'));
      await Promise.allSettled(membersSnap.docs.map((m) => deleteDoc(m.ref)));
    } catch {
      // Ignore
    }
    await deleteDoc(doc(db, 'clinic_workspaces', wsId)).catch(() => {});
  }

  // 3. Delete user_workspaces index entries pointing to this clinic
  if (targetClinic.ownerEmail && !isSuperAdminEmail(targetClinic.ownerEmail)) {
    await deleteDoc(doc(db, 'user_workspaces', normalizeEmailKey(targetClinic.ownerEmail))).catch(() => {});
  }

  // 4. Delete primary clinics/{clinicId} document
  await deleteDoc(doc(db, 'clinics', cleanClinicId));
}

// ==================== TELEGRAM CLOUD BACKUP CLIENT HELPER ====================
export async function sendBackupToTelegramApi(params: {
  botToken: string;
  chatId: string;
  settings: ClinicSettings;
  receipts: ReceiptRecord[];
  inventory: InventoryItem[];
  expenses: ExpenseRecord[];
  triggerReason: string;
}): Promise<{
  ok: boolean;
  sentAt?: string;
  messageId?: number;
  error?: string;
}> {
  const backupPayload = {
    version: 'DOCAI-ERP-v4',
    exportedAt: new Date().toISOString(),
    settings: params.settings,
    receipts: params.receipts,
    inventory: params.inventory,
    expenses: params.expenses,
  };

  try {
    const res = await fetch('/api/backup/telegram', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        botToken: params.botToken.trim(),
        chatId: params.chatId.trim(),
        backupPayload,
        triggerReason: params.triggerReason,
      }),
    });
    const rawText = await res.text();
    if (!rawText || rawText.trim().startsWith('<')) {
      return {
        ok: false,
        error: 'تعذر الوصول إلى خادم النسخ الاحتياطي لتليجرام.',
      };
    }
    const parsed = JSON.parse(rawText) as {
      ok?: boolean;
      sentAt?: string;
      messageId?: number;
      error?: string;
    };
    if (!res.ok || !parsed.ok) {
      return {
        ok: false,
        error: parsed.error || 'تعذر إرسال النسخة الاحتياطية إلى تليجرام.',
      };
    }
    return {
      ok: true,
      sentAt: parsed.sentAt || new Date().toISOString(),
      messageId: parsed.messageId,
    };
  } catch {
    return {
      ok: false,
      error: 'تعذر الاتصال بخادم النسخ الاحتياطي لتليجرام. تحقق من اتصال الإنترنت.',
    };
  }
}

