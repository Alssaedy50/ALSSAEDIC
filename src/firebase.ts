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

  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, {
        name: sanitizeStr(service.name, 140, 'خدمة علاجية'),
        price: sanitizeNum(service.price, 0, 100000000),
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        ownerId: safeUid,
        name: sanitizeStr(service.name, 140, 'خدمة علاجية'),
        price: sanitizeNum(service.price, 0, 100000000),
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
      if (snap.empty) return;
      const items: DentalServiceItem[] = snap.docs.map((docSnap) => {
        const d = docSnap.data();
        const name = String(d.name || '');
        return {
          id: stripPrefix(docSnap.id),
          name,
          price: Number(d.price || 0),
          category: 'علاجات سنية',
          keywords: [name],
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
