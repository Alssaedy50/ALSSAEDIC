import { initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  User,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getFirestore,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import {
  ClinicSettings,
  CurrencyCode,
  DentalServiceItem,
  ExpenseRecord,
  InventoryItem,
  ReceiptRecord,
} from './types/clinic';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

// Validate connection to Firestore on boot
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
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

// ==================== DEFENSIVE SANITIZATION HELPERS ====================
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

// ==================== AUTHENTICATION ====================
export async function signInWithGoogleAccount(): Promise<User> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const result = await signInWithPopup(auth, provider);
  return result.user;
}

export async function signOutAccount(): Promise<void> {
  await signOut(auth);
}

export { onAuthStateChanged };
export type { User };

// ==================== CLOUD FIRESTORE OPERATIONS ====================

export async function ensureClinicDocumentInCloud(
  uid: string,
  settings: ClinicSettings
): Promise<void> {
  const safeUid = sanitizeId(uid);
  const clinicPath = `clinics/${safeUid}`;
  const ref = doc(db, 'clinics', safeUid);

  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        ownerId: safeUid,
        clinicAr: sanitizeStr(settings.identity.clinicAr, 160, 'عيادة السعيدي لطب وجراحة الفم والأسنان'),
        doctorAr: sanitizeStr(settings.identity.doctorAr, 160, 'د. صلاح الدين السعيدي'),
        specialtyAr: sanitizeStr(settings.identity.specialtyAr, 200, 'طب وجراحة الفم والأسنان وتجميل الابتسامة'),
        clinicEn: sanitizeStr(settings.identity.clinicEn, 160, 'ALSSAEDY CLINIC FOR DENTISTRY'),
        doctorEn: sanitizeStr(settings.identity.doctorEn, 160, 'Dr. Salahaldeen Alssaedy'),
        address: sanitizeStr(settings.identity.address, 250, 'ريمة - كسمة - عزلة الضبارة'),
        phones: sanitizeStr(settings.identity.phones, 200, '+967 775 956 520'),
        defaultCurrency: sanitizeStr(settings.identity.defaultCurrency, 40, 'ريال يمني'),
        primaryColor: sanitizeStr(settings.appearance.primaryColor, 20, '#0B2545'),
        watermarkOpacity: sanitizeNum(settings.appearance.watermarkOpacity, 0, 30),
        autoInventory: Boolean(settings.features.autoInventory),
        showQrCode: Boolean(settings.features.showQrCode),
        customLogoDataUrl: sanitizeStr(settings.appearance.customLogoDataUrl, 350000, ''),
        permanentAccountantSig: sanitizeStr(settings.appearance.permanentAccountantSig, 250000, ''),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, clinicPath);
  }
}

export async function saveClinicSettingsToCloud(
  uid: string,
  settings: ClinicSettings
): Promise<void> {
  const safeUid = sanitizeId(uid);
  const clinicPath = `clinics/${safeUid}`;
  const ref = doc(db, 'clinics', safeUid);

  try {
    const snap = await getDoc(ref);
    const payload = {
      clinicAr: sanitizeStr(settings.identity.clinicAr, 160, 'عيادة السعيدي لطب وجراحة الفم والأسنان'),
      doctorAr: sanitizeStr(settings.identity.doctorAr, 160, 'د. صلاح الدين السعيدي'),
      specialtyAr: sanitizeStr(settings.identity.specialtyAr, 200, 'طب وجراحة الفم والأسنان وتجميل الابتسامة'),
      clinicEn: sanitizeStr(settings.identity.clinicEn, 160, 'ALSSAEDY CLINIC FOR DENTISTRY'),
      doctorEn: sanitizeStr(settings.identity.doctorEn, 160, 'Dr. Salahaldeen Alssaedy'),
      address: sanitizeStr(settings.identity.address, 250, 'ريمة - كسمة - عزلة الضبارة'),
      phones: sanitizeStr(settings.identity.phones, 200, '+967 775 956 520'),
      defaultCurrency: sanitizeStr(settings.identity.defaultCurrency, 40, 'ريال يمني'),
      primaryColor: sanitizeStr(settings.appearance.primaryColor, 20, '#0B2545'),
      watermarkOpacity: sanitizeNum(settings.appearance.watermarkOpacity, 0, 30),
      autoInventory: Boolean(settings.features.autoInventory),
      showQrCode: Boolean(settings.features.showQrCode),
      customLogoDataUrl: sanitizeStr(settings.appearance.customLogoDataUrl, 350000, ''),
      permanentAccountantSig: sanitizeStr(settings.appearance.permanentAccountantSig, 250000, ''),
      updatedAt: serverTimestamp(),
    };

    if (snap.exists()) {
      await updateDoc(ref, payload);
    } else {
      await setDoc(ref, {
        ownerId: safeUid,
        ...payload,
        createdAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, clinicPath);
  }
}

export async function saveServiceToCloud(
  uid: string,
  service: DentalServiceItem
): Promise<void> {
  const safeUid = sanitizeId(uid);
  const docId = sanitizeId(`${safeUid}_${service.id}`);
  const path = `services/${docId}`;
  const ref = doc(db, 'services', docId);

  const safeName = sanitizeStr(service.name, 140, 'خدمة علاجية');
  const safeCategory = sanitizeStr(service.category, 100, 'علاجات سنية');
  const safeKeywords = (Array.isArray(service.keywords) && service.keywords.length > 0
    ? service.keywords
    : [safeName]
  )
    .slice(0, 20)
    .map((k) => sanitizeStr(k, 80, safeName));

  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, {
        name: safeName,
        price: sanitizeNum(service.price, 0, 100000000),
        category: safeCategory,
        keywords: safeKeywords,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        ownerId: safeUid,
        name: safeName,
        price: sanitizeNum(service.price, 0, 100000000),
        category: safeCategory,
        keywords: safeKeywords,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteServiceFromCloud(uid: string, serviceId: string): Promise<void> {
  const safeUid = sanitizeId(uid);
  const docId = sanitizeId(`${safeUid}_${serviceId}`);
  const path = `services/${docId}`;
  try {
    await deleteDoc(doc(db, 'services', docId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function saveReceiptToCloud(
  uid: string,
  receipt: ReceiptRecord
): Promise<void> {
  const safeUid = sanitizeId(uid);
  const docId = sanitizeId(`${safeUid}_${receipt.id}`);
  const path = `receipts/${docId}`;
  const ref = doc(db, 'receipts', docId);

  const boundedServices = (Array.isArray(receipt.services) ? receipt.services : [])
    .slice(0, 25)
    .map((s) => sanitizeStr(s, 140, 'كشف'));

  try {
    const snap = await getDoc(ref);
    const mutableFields = {
      receiptNo: sanitizeNum(receipt.receiptNo, 1, 99999999),
      date: sanitizeStr(receipt.date, 30, new Date().toISOString().slice(0, 10)),
      patientName: sanitizeStr(receipt.patientName, 160, 'مريض'),
      patientPhone: sanitizeStr(receipt.patientPhone, 50, ''),
      services: boundedServices,
      toothFDI: sanitizeStr(receipt.toothFDI, 200, ''),
      totalAmount: sanitizeNum(receipt.totalAmount, 0, 1000000000),
      paidAmount: sanitizeNum(receipt.paidAmount, 0, 1000000000),
      remainingAmount: sanitizeNum(receipt.remainingAmount, 0, 1000000000),
      currency: sanitizeStr(receipt.currency, 40, 'ريال يمني'),
      paymentMethod: sanitizeStr(receipt.paymentMethod, 80, 'نقداً (Cash)'),
      notes: sanitizeStr(receipt.notes, 500, ''),
      amountWords: sanitizeStr(receipt.amountWords, 300, 'فقط صفر ريال يمني لا غير'),
      accountantSig: sanitizeStr(receipt.accountantSig, 250000, ''),
      receiverSig: sanitizeStr(receipt.receiverSig, 250000, ''),
      paperFormat: receipt.paperFormat === 'thermal80' ? 'thermal80' : 'a5',
      updatedAt: serverTimestamp(),
    };

    if (snap.exists()) {
      await updateDoc(ref, mutableFields);
    } else {
      await setDoc(ref, {
        ownerId: safeUid,
        ...mutableFields,
        createdAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteReceiptFromCloud(uid: string, receiptId: string): Promise<void> {
  const safeUid = sanitizeId(uid);
  const docId = sanitizeId(`${safeUid}_${receiptId}`);
  const path = `receipts/${docId}`;
  try {
    await deleteDoc(doc(db, 'receipts', docId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function saveInventoryItemToCloud(
  uid: string,
  item: InventoryItem
): Promise<void> {
  const safeUid = sanitizeId(uid);
  const docId = sanitizeId(`${safeUid}_${item.id}`);
  const path = `inventory/${docId}`;
  const ref = doc(db, 'inventory', docId);

  try {
    const snap = await getDoc(ref);
    const mutableFields = {
      name: sanitizeStr(item.name, 160, 'صنف طبي'),
      category: sanitizeStr(item.notes, 160, ''),
      qty: sanitizeNum(item.qty, 0, 1000000),
      minQty: sanitizeNum(item.minQty, 0, 1000000),
      unit: sanitizeStr(item.unit, 50, 'قطعة'),
      unitPrice: sanitizeNum(item.unitPrice, 0, 100000000),
      totalCost: sanitizeNum(item.totalCost, 0, 1000000000),
      linkedService: sanitizeStr(item.linkedService, 140, ''),
      updatedAt: serverTimestamp(),
    };

    if (snap.exists()) {
      await updateDoc(ref, mutableFields);
    } else {
      await setDoc(ref, {
        ownerId: safeUid,
        ...mutableFields,
        createdAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteInventoryItemFromCloud(uid: string, itemId: string): Promise<void> {
  const safeUid = sanitizeId(uid);
  const docId = sanitizeId(`${safeUid}_${itemId}`);
  const path = `inventory/${docId}`;
  try {
    await deleteDoc(doc(db, 'inventory', docId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function saveExpenseToCloud(
  uid: string,
  expense: ExpenseRecord
): Promise<void> {
  const safeUid = sanitizeId(uid);
  const docId = sanitizeId(`${safeUid}_${expense.id}`);
  const path = `expenses/${docId}`;
  const ref = doc(db, 'expenses', docId);

  try {
    const snap = await getDoc(ref);
    const mutableFields = {
      title: sanitizeStr(expense.title, 200, 'مصروف عيادة'),
      amount: sanitizeNum(expense.amount, 0, 1000000000),
      category: sanitizeStr(expense.category, 100, 'تشغيل'),
      currency: sanitizeStr(expense.currency, 40, 'ريال يمني'),
      date: sanitizeStr(expense.date, 30, new Date().toISOString().slice(0, 10)),
      updatedAt: serverTimestamp(),
    };

    if (snap.exists()) {
      await updateDoc(ref, mutableFields);
    } else {
      await setDoc(ref, {
        ownerId: safeUid,
        ...mutableFields,
        createdAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteExpenseFromCloud(uid: string, expenseId: string): Promise<void> {
  const safeUid = sanitizeId(uid);
  const docId = sanitizeId(`${safeUid}_${expenseId}`);
  const path = `expenses/${docId}`;
  try {
    await deleteDoc(doc(db, 'expenses', docId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
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
  await ensureClinicDocumentInCloud(safeUid, settings);

  // Check if cloud already has receipts for this user
  const receiptsQuery = query(collection(db, 'receipts'), where('ownerId', '==', safeUid));
  let existingReceiptCount = 0;
  try {
    const snap = await getDocs(receiptsQuery);
    existingReceiptCount = snap.size;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'receipts');
  }

  if (existingReceiptCount === 0 || forcePushAll) {
    await saveClinicSettingsToCloud(safeUid, settings);
    for (const srv of settings.services) {
      await saveServiceToCloud(safeUid, srv);
    }
    for (const rec of receipts) {
      await saveReceiptToCloud(safeUid, rec);
    }
    for (const inv of inventory) {
      await saveInventoryItemToCloud(safeUid, inv);
    }
    for (const exp of expenses) {
      await saveExpenseToCloud(safeUid, exp);
    }
  }
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
    doc(db, 'clinics', safeUid),
    (snap) => {
      if (!snap.exists()) return;
      const d = snap.data();
      const rawCurrency = String(d.defaultCurrency || 'ريال يمني');
      const validCurrency: CurrencyCode =
        rawCurrency === 'ريال سعودي' || rawCurrency === 'دولار أمريكي'
          ? rawCurrency
          : 'ريال يمني';

      callbacks.onSettingsUpdate({
        identity: {
          systemTitleAr: String(d.clinicAr || 'عيادة السعيدي لطب وجراحة الفم والأسنان'),
          clinicAr: String(d.clinicAr || ''),
          doctorAr: String(d.doctorAr || ''),
          specialtyAr: String(d.specialtyAr || ''),
          clinicEn: String(d.clinicEn || ''),
          doctorEn: String(d.doctorEn || ''),
          address: String(d.address || ''),
          phones: String(d.phones || ''),
          defaultCurrency: validCurrency,
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
      });
    },
    (err) => handleFirestoreError(err, OperationType.GET, `clinics/${safeUid}`)
  );

  const unsubServices = onSnapshot(
    query(collection(db, 'services'), where('ownerId', '==', safeUid)),
    (snap) => {
      const items: DentalServiceItem[] = snap.docs.map((docSnap) => {
        const d = docSnap.data();
        const name = String(d.name || '');
        const rawKeywords = Array.isArray(d.keywords)
          ? d.keywords.map((k: unknown) => String(k || '').trim()).filter(Boolean)
          : [];
        return {
          id: stripPrefix(docSnap.id),
          name,
          price: Number(d.price || 0),
          category: String(d.category || 'علاجات سنية'),
          keywords: rawKeywords.length > 0 ? rawKeywords : [name],
        };
      });
      callbacks.onServicesUpdate(items);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'services')
  );

  const unsubReceipts = onSnapshot(
    query(collection(db, 'receipts'), where('ownerId', '==', safeUid)),
    (snap) => {
      const items: ReceiptRecord[] = snap.docs
        .map((docSnap) => {
          const d = docSnap.data();
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
            currency: String(d.currency || 'ريال يمني'),
            paymentMethod: String(d.paymentMethod || 'نقداً (Cash)'),
            notes: String(d.notes || ''),
            amountWords: String(d.amountWords || ''),
            accountantSig: String(d.accountantSig || ''),
            receiverSig: String(d.receiverSig || ''),
            paperFormat: (d.paperFormat === 'thermal80' ? 'thermal80' : 'a5') as 'a5' | 'thermal80',
            createdAt: d.createdAt?.toDate ? d.createdAt.toDate().toISOString() : new Date().toISOString(),
          };
        })
        .sort((a, b) => b.receiptNo - a.receiptNo);
      callbacks.onReceiptsUpdate(items);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'receipts')
  );

  const unsubInventory = onSnapshot(
    query(collection(db, 'inventory'), where('ownerId', '==', safeUid)),
    (snap) => {
      const items: InventoryItem[] = snap.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: stripPrefix(docSnap.id),
          name: String(d.name || ''),
          notes: String(d.category || ''),
          qty: Number(d.qty || 0),
          minQty: Number(d.minQty || 0),
          unit: String(d.unit || 'قطعة'),
          unitPrice: Number(d.unitPrice || 0),
          totalCost: Number(d.totalCost || 0),
          linkedService: String(d.linkedService || ''),
          updatedAt: d.updatedAt?.toDate
            ? d.updatedAt.toDate().toISOString().slice(0, 10)
            : new Date().toISOString().slice(0, 10),
        };
      });
      callbacks.onInventoryUpdate(items);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'inventory')
  );

  const unsubExpenses = onSnapshot(
    query(collection(db, 'expenses'), where('ownerId', '==', safeUid)),
    (snap) => {
      const items: ExpenseRecord[] = snap.docs
        .map((docSnap) => {
          const d = docSnap.data();
          return {
            id: stripPrefix(docSnap.id),
            title: String(d.title || ''),
            amount: Number(d.amount || 0),
            category: String(d.category || 'تشغيل'),
            currency: String(d.currency || 'ريال يمني'),
            date: String(d.date || ''),
          };
        })
        .sort((a, b) => b.date.localeCompare(a.date));
      callbacks.onExpensesUpdate(items);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'expenses')
  );

  return () => {
    unsubClinic();
    unsubServices();
    unsubReceipts();
    unsubInventory();
    unsubExpenses();
  };
}

// ==================== DIRECT CLINIC WORKSPACE (clinic_workspaces/{clinicId}) ====================

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

export async function hashClinicPassword(password: string): Promise<string> {
  const normalized = String(password || '').trim();
  if (typeof window !== 'undefined' && window.crypto?.subtle) {
    try {
      const msgBuffer = new TextEncoder().encode(normalized);
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch {
      // Fallback below if subtle crypto is unavailable in non-secure context
    }
  }
  // Pure deterministic 64-char hex fallback
  let h1 = 0xdeadbeef ^ normalized.length;
  let h2 = 0x41c6ce57 ^ normalized.length;
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const baseHex =
    (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
  return baseHex.repeat(4).slice(0, 64);
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
  initialData: DirectWorkspacePayload
): Promise<{
  ok: boolean;
  status?: 'authenticated' | 'created';
  clinicId: string;
  updatedAt: string;
  error?: string;
  data?: DirectWorkspacePayload;
}> {
  const safeId = normalizeClinicWorkspaceId(clinicId);
  const passwordHash = await hashClinicPassword(password);
  const nowIso = new Date().toISOString();
  const ref = doc(db, 'clinic_workspaces', safeId);

  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const d = snap.data();
      if (d.passwordHash && d.passwordHash !== passwordHash) {
        return {
          ok: false,
          clinicId: safeId,
          updatedAt: nowIso,
          error: 'كلمة المرور غير صحيحة لمعرّف العيادة هذا',
        };
      }
      const updatedAt = d.updatedAt?.toDate ? d.updatedAt.toDate().toISOString() : nowIso;
      return {
        ok: true,
        status: 'authenticated',
        clinicId: safeId,
        updatedAt,
        data: {
          settings: (d.settings as ClinicSettings) || initialData.settings,
          receipts: Array.isArray(d.receipts) ? (d.receipts as ReceiptRecord[]) : initialData.receipts,
          inventory: Array.isArray(d.inventory) ? (d.inventory as InventoryItem[]) : initialData.inventory,
          expenses: Array.isArray(d.expenses) ? (d.expenses as ExpenseRecord[]) : initialData.expenses,
        },
      };
    }

    await setDoc(ref, {
      clinicId: safeId,
      passwordHash,
      settings: initialData.settings,
      receipts: (initialData.receipts || []).slice(0, 500),
      inventory: (initialData.inventory || []).slice(0, 500),
      expenses: (initialData.expenses || []).slice(0, 500),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return {
      ok: true,
      status: 'created',
      clinicId: safeId,
      updatedAt: nowIso,
      data: initialData,
    };
  } catch {
    // Fallback to server API if remote Firestore rules reject unauthenticated workspace access
    try {
      const res = await fetch('/api/cloud/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinicId: safeId,
          password,
          initialData,
        }),
      });
      const text = await res.text();
      if (text && !text.trim().startsWith('<')) {
        const parsed = JSON.parse(text);
        if (!res.ok) {
          return {
            ok: false,
            clinicId: safeId,
            updatedAt: nowIso,
            error: parsed.error || 'تعذر تسجيل الدخول لحساب العيادة',
          };
        }
        return {
          ok: true,
          status: parsed.status === 'authenticated' ? 'authenticated' : 'created',
          clinicId: parsed.clinicId || safeId,
          updatedAt: parsed.updatedAt || nowIso,
          data: parsed.data || initialData,
        };
      }
    } catch {
      // Ignore network fallback failure
    }
    return {
      ok: true,
      status: 'created',
      clinicId: safeId,
      updatedAt: nowIso,
      data: initialData,
    };
  }
}

export async function pushDirectWorkspaceToCloud(
  clinicId: string,
  password: string,
  data: DirectWorkspacePayload
): Promise<string> {
  const safeId = normalizeClinicWorkspaceId(clinicId);
  const passwordHash = await hashClinicPassword(password);
  const nowIso = new Date().toISOString();
  const ref = doc(db, 'clinic_workspaces', safeId);

  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, {
        settings: data.settings,
        receipts: (data.receipts || []).slice(0, 500),
        inventory: (data.inventory || []).slice(0, 500),
        expenses: (data.expenses || []).slice(0, 500),
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        clinicId: safeId,
        passwordHash,
        settings: data.settings,
        receipts: (data.receipts || []).slice(0, 500),
        inventory: (data.inventory || []).slice(0, 500),
        expenses: (data.expenses || []).slice(0, 500),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch {
    // Also mirror to /api/cloud/push as backup
    try {
      await fetch('/api/cloud/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinicId: safeId,
          password,
          data,
        }),
      });
    } catch {
      // Offline
    }
  }

  return nowIso;
}

export function subscribeToDirectWorkspaceInCloud(
  clinicId: string,
  password: string,
  onUpdate: (payload: DirectWorkspacePayload & { updatedAt: string }) => void
): () => void {
  const safeId = normalizeClinicWorkspaceId(clinicId);
  let unsubFirestore: (() => void) | null = null;
  let cancelled = false;

  const pullFromBackupApi = async () => {
    if (cancelled) return;
    try {
      const res = await fetch('/api/cloud/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinicId: safeId, password }),
      });
      const text = await res.text();
      if (!text || text.trim().startsWith('<')) return;
      const json = JSON.parse(text);
      if (json?.ok && json?.data) {
        onUpdate({
          settings: json.data.settings,
          receipts: Array.isArray(json.data.receipts) ? json.data.receipts : [],
          inventory: Array.isArray(json.data.inventory) ? json.data.inventory : [],
          expenses: Array.isArray(json.data.expenses) ? json.data.expenses : [],
          updatedAt: String(json.updatedAt || new Date().toISOString()),
        });
      }
    } catch {
      // Ignore offline errors
    }
  };

  hashClinicPassword(password).then((passwordHash) => {
    if (cancelled) return;
    const ref = doc(db, 'clinic_workspaces', safeId);
    unsubFirestore = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) return;
        const d = snap.data();
        if (d.passwordHash && d.passwordHash !== passwordHash) return;
        const updatedAt = d.updatedAt?.toDate
          ? d.updatedAt.toDate().toISOString()
          : new Date().toISOString();
        onUpdate({
          settings: d.settings as ClinicSettings,
          receipts: Array.isArray(d.receipts) ? (d.receipts as ReceiptRecord[]) : [],
          inventory: Array.isArray(d.inventory) ? (d.inventory as InventoryItem[]) : [],
          expenses: Array.isArray(d.expenses) ? (d.expenses as ExpenseRecord[]) : [],
          updatedAt,
        });
      },
      () => {
        // If Firestore listener is blocked by remote rules, pull once now and on reconnect
        pullFromBackupApi();
      }
    );
  });

  const handleOnline = () => {
    pullFromBackupApi();
  };
  window.addEventListener('online', handleOnline);

  return () => {
    cancelled = true;
    window.removeEventListener('online', handleOnline);
    if (unsubFirestore) unsubFirestore();
  };
}

