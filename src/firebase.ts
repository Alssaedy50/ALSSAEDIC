import { initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  User,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDocFromServer,
  getDocs,
  initializeFirestore,
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
  WorkspaceRole,
  WorkspacePermissions,
  WorkspaceMember,
  DEFAULT_ROLE_PERMISSIONS,
} from './types/clinic';
import { numberToArabicWords } from './utils/arabicTafqeet';

const app = initializeApp(firebaseConfig);
export const db = initializeFirestore(
  app,
  {
    experimentalAutoDetectLongPolling: true,
  },
  firebaseConfig.firestoreDatabaseId
);
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
      // Do not retry permanent permission or authentication errors
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

export function validateAndNormalizeReceipt(receipt: ReceiptRecord): ReceiptRecord {
  const rawTotal = Number(receipt.totalAmount);
  const rawPaid = Number(receipt.paidAmount);
  if (!Number.isFinite(rawTotal) || rawTotal < 0) {
    throw new Error('قيمة إجمالي السند المالي غير صالحة.');
  }
  if (!Number.isFinite(rawPaid) || rawPaid < 0) {
    throw new Error('قيمة المبلغ المدفوع في السند غير صالحة.');
  }
  const totalAmount = sanitizeNum(rawTotal, 0, 1000000000);
  const paidAmount = sanitizeNum(Math.min(totalAmount, rawPaid), 0, totalAmount);
  const remainingAmount = Math.max(0, +(totalAmount - paidAmount).toFixed(2));
  const currency = sanitizeStr(receipt.currency, 40, 'ريال يمني') as CurrencyCode;
  const patientName = sanitizeStr(receipt.patientName, 160, '');
  if (!patientName) {
    throw new Error('اسم المريض مطلوب لحفظ السند المالي.');
  }

  return {
    ...receipt,
    id: sanitizeId(receipt.id || `rec_${Date.now()}`),
    receiptNo: sanitizeNum(receipt.receiptNo, 1, 99999999),
    date: sanitizeStr(receipt.date, 30, new Date().toISOString().slice(0, 10)),
    patientName,
    patientPhone: sanitizeStr(receipt.patientPhone, 50, ''),
    services: (Array.isArray(receipt.services) ? receipt.services : [])
      .slice(0, 25)
      .map((s) => sanitizeStr(s, 140, 'كشف')),
    toothFDI: sanitizeStr(receipt.toothFDI, 200, ''),
    totalAmount,
    paidAmount,
    remainingAmount,
    currency,
    paymentMethod: sanitizeStr(receipt.paymentMethod, 80, 'نقداً (Cash)'),
    notes: sanitizeStr(receipt.notes, 500, ''),
    amountWords: sanitizeStr(
      receipt.amountWords || numberToArabicWords(paidAmount, currency),
      300,
      'فقط صفر ريال يمني لا غير'
    ),
    accountantSig: sanitizeStr(receipt.accountantSig, 250000, ''),
    receiverSig: sanitizeStr(receipt.receiverSig, 250000, ''),
    paperFormat: receipt.paperFormat === 'thermal80' ? 'thermal80' : 'a5',
    createdAt: sanitizeStr(receipt.createdAt, 40, new Date().toISOString()),
  };
}

export function validateAndNormalizeInventoryItem(item: InventoryItem): InventoryItem {
  const name = sanitizeStr(item.name, 160, '');
  if (!name) {
    throw new Error('اسم الصنف الطبي مطلوب.');
  }
  const qty = sanitizeNum(item.qty, 0, 1000000);
  const minQty = sanitizeNum(item.minQty, 0, 1000000);
  const unitPrice = sanitizeNum(item.unitPrice, 0, 100000000);
  const totalCost = sanitizeNum(+(qty * unitPrice).toFixed(2), 0, 1000000000);

  return {
    ...item,
    id: sanitizeId(item.id || `inv_${Date.now()}`),
    name,
    notes: sanitizeStr(item.notes, 160, ''),
    qty,
    minQty,
    unit: sanitizeStr(item.unit, 50, 'قطعة'),
    unitPrice,
    totalCost,
    linkedService: sanitizeStr(item.linkedService, 140, ''),
    updatedAt: sanitizeStr(item.updatedAt, 30, new Date().toISOString().slice(0, 10)),
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
export async function signInWithGoogleAccount(): Promise<User> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const result = await signInWithPopup(auth, provider);
  return result.user;
}

export async function registerWithEmailAndPassword(
  email: string,
  pass: string,
  customIdentifier?: string
): Promise<{ user: User; verificationSent: boolean; assignedIdentifier: string }> {
  const cleanEmail = email.trim().toLowerCase();
  const cred = await createUserWithEmailAndPassword(auth, cleanEmail, pass);
  let verificationSent = false;
  try {
    await sendEmailVerification(cred.user);
    verificationSent = true;
  } catch (e) {
    console.warn('Could not send email verification immediately:', e);
  }

  // Derive unique identifier if not provided
  let candidate = normalizeClinicWorkspaceId(
    customIdentifier || cleanEmail.split('@')[0] || `user-${cred.user.uid.slice(0, 6)}`
  );

  // Check if identifier is already taken, if so append random digits
  try {
    const identDoc = await getDocFromServer(doc(db, 'account_identifiers', candidate));
    if (identDoc.exists() && identDoc.data()?.uid !== cred.user.uid) {
      candidate = `${candidate}-${Math.floor(100 + Math.random() * 900)}`;
    }
  } catch {
    // continue
  }

  // Save the identifier binding in Firestore
  try {
    await setDoc(doc(db, 'account_identifiers', candidate), {
      identifier: candidate,
      email: cleanEmail,
      uid: cred.user.uid,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn('Could not save account identifier link:', err);
  }

  return { user: cred.user, verificationSent, assignedIdentifier: candidate };
}

export async function resolveEmailFromIdentifier(identifier: string): Promise<string | null> {
  const safeId = normalizeClinicWorkspaceId(identifier);
  if (!safeId) return null;
  try {
    const snap = await getDocFromServer(doc(db, 'account_identifiers', safeId));
    if (snap.exists()) {
      const email = snap.data()?.email;
      if (typeof email === 'string' && email.includes('@')) {
        return email;
      }
    }
  } catch (err) {
    console.warn('Identifier lookup notice:', err);
  }
  return null;
}

export async function bindAccountIdentifier(uid: string, email: string, identifier: string): Promise<string> {
  const safeId = normalizeClinicWorkspaceId(identifier);
  const cleanEmail = email.trim().toLowerCase();
  await setDoc(doc(db, 'account_identifiers', safeId), {
    identifier: safeId,
    email: cleanEmail,
    uid,
    createdAt: serverTimestamp(),
  });
  return safeId;
}

export async function loginWithEmailAndPassword(
  emailOrIdentifier: string,
  pass: string
): Promise<User> {
  let effectiveEmail = emailOrIdentifier.trim();
  if (!effectiveEmail.includes('@')) {
    const resolved = await resolveEmailFromIdentifier(effectiveEmail);
    if (!resolved) {
      throw new Error('المعرّف غير مسجل أو غير مرتبط بأي حساب. يرجى إدخال البريد الإلكتروني.');
    }
    effectiveEmail = resolved;
  }
  const cred = await signInWithEmailAndPassword(auth, effectiveEmail, pass);
  return cred.user;
}

export async function requestPasswordReset(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email.trim());
}

export async function resendVerificationEmail(): Promise<void> {
  if (auth.currentUser) {
    await sendEmailVerification(auth.currentUser);
  } else {
    throw new Error('لا يوجد مستخدم مسجل لإرسال رابط التحقق إليه.');
  }
}

export async function signOutAccount(): Promise<void> {
  await signOut(auth);
}

export { onAuthStateChanged, sendEmailVerification, sendPasswordResetEmail };
export type { User };

// Helper to check document existence using ownerId query (allow list)
// Avoids triggering allow get evaluation on null resource when document does not exist yet
async function checkDocExistsByOwner(
  collectionName: string,
  ownerUid: string,
  targetDocId: string
): Promise<boolean> {
  const q = query(collection(db, collectionName), where('ownerId', '==', ownerUid));
  const snap = await getDocs(q);
  return snap.docs.some((d) => d.id === targetDocId);
}

// Helper to determine if the active session is authorized to read/write for target clinic
export function isCurrentSessionAuthorizedForClinic(targetOwnerUid: string): boolean {
  if (!auth.currentUser) return false;
  if (auth.currentUser.uid === targetOwnerUid) return true;
  return Boolean(auth.currentUser.email);
}

// ==================== AUTHORITATIVE CLOUD FIRESTORE OPERATIONS ====================

export async function ensureClinicDocumentInCloud(
  uid: string,
  settings: ClinicSettings
): Promise<void> {
  const safeUid = sanitizeId(uid);
  if (!isCurrentSessionAuthorizedForClinic(safeUid)) {
    throw new Error('يجب تسجيل الدخول بحساب العيادة الموثق قبل الكتابة في السحابة.');
  }
  const clinicPath = `clinics/${safeUid}`;
  const ref = doc(db, 'clinics', safeUid);

  try {
    await withCloudRetry(async () => {
      const exists = await checkDocExistsByOwner('clinics', safeUid, safeUid);
      if (!exists) {
        await setDoc(ref, {
          ownerId: safeUid,
          clinicAr: sanitizeStr(
            settings.identity.clinicAr,
            160,
            'عيادة السعيدي لطب وجراحة الفم والأسنان'
          ),
          doctorAr: sanitizeStr(settings.identity.doctorAr, 160, 'د. صلاح الدين السعيدي'),
          specialtyAr: sanitizeStr(
            settings.identity.specialtyAr,
            200,
            'طب وجراحة الفم والأسنان وتجميل الابتسامة'
          ),
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
          permanentAccountantSig: sanitizeStr(
            settings.appearance.permanentAccountantSig,
            250000,
            ''
          ),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, clinicPath);
  }
}

export async function saveClinicSettingsToCloud(
  uid: string,
  settings: ClinicSettings
): Promise<void> {
  const safeUid = sanitizeId(uid);
  if (!auth.currentUser || auth.currentUser.uid !== safeUid) {
    throw new Error('غير مصرح بتعديل إعدادات عيادة أخرى.');
  }
  const clinicPath = `clinics/${safeUid}`;
  const ref = doc(db, 'clinics', safeUid);

  try {
    await withCloudRetry(async () => {
      const exists = await checkDocExistsByOwner('clinics', safeUid, safeUid);
      const payload = {
        clinicAr: sanitizeStr(
          settings.identity.clinicAr,
          160,
          'عيادة السعيدي لطب وجراحة الفم والأسنان'
        ),
        doctorAr: sanitizeStr(settings.identity.doctorAr, 160, 'د. صلاح الدين السعيدي'),
        specialtyAr: sanitizeStr(
          settings.identity.specialtyAr,
          200,
          'طب وجراحة الفم والأسنان وتجميل الابتسامة'
        ),
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
        permanentAccountantSig: sanitizeStr(
          settings.appearance.permanentAccountantSig,
          250000,
          ''
        ),
        updatedAt: serverTimestamp(),
      };

      if (exists) {
        await updateDoc(ref, payload);
      } else {
        await setDoc(ref, {
          ownerId: safeUid,
          ...payload,
          createdAt: serverTimestamp(),
        });
      }
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, clinicPath);
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
    await withCloudRetry(async () => {
      const exists = await checkDocExistsByOwner('services', safeUid, docId);
      if (exists) {
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
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteServiceFromCloud(uid: string, serviceId: string): Promise<void> {
  const safeUid = sanitizeId(uid);
  if (!isCurrentSessionAuthorizedForClinic(safeUid)) {
    throw new Error('غير مصرح بحذف خدمات لعيادة أخرى.');
  }
  const docId = sanitizeId(`${safeUid}_${serviceId}`);
  const path = `services/${docId}`;
  try {
    await withCloudRetry(() => deleteDoc(doc(db, 'services', docId)));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function saveReceiptToCloud(
  uid: string,
  receipt: ReceiptRecord
): Promise<void> {
  const safeUid = sanitizeId(uid);
  if (!isCurrentSessionAuthorizedForClinic(safeUid)) {
    throw new Error('غير مصرح بحفظ سندات لعيادة أخرى.');
  }
  const validated = validateAndNormalizeReceipt(receipt);
  const docId = sanitizeId(`${safeUid}_${validated.id}`);
  const path = `receipts/${docId}`;
  const ref = doc(db, 'receipts', docId);

  try {
    await withCloudRetry(async () => {
      const exists = await checkDocExistsByOwner('receipts', safeUid, docId);
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
        notes: validated.notes,
        amountWords: validated.amountWords,
        accountantSig: validated.accountantSig,
        receiverSig: validated.receiverSig,
        paperFormat: validated.paperFormat,
        updatedAt: serverTimestamp(),
      };

      if (exists) {
        await updateDoc(ref, mutableFields);
      } else {
        await setDoc(ref, {
          ownerId: safeUid,
          ...mutableFields,
          createdAt: serverTimestamp(),
        });
      }
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteReceiptFromCloud(uid: string, receiptId: string): Promise<void> {
  const safeUid = sanitizeId(uid);
  if (!isCurrentSessionAuthorizedForClinic(safeUid)) {
    throw new Error('غير مصرح بحذف سندات لعيادة أخرى.');
  }
  const docId = sanitizeId(`${safeUid}_${receiptId}`);
  const path = `receipts/${docId}`;
  try {
    await withCloudRetry(() => deleteDoc(doc(db, 'receipts', docId)));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function saveInventoryItemToCloud(
  uid: string,
  item: InventoryItem
): Promise<void> {
  const safeUid = sanitizeId(uid);
  if (!isCurrentSessionAuthorizedForClinic(safeUid)) {
    throw new Error('غير مصرح بتعديل مخزون عيادة أخرى.');
  }
  const validated = validateAndNormalizeInventoryItem(item);
  const docId = sanitizeId(`${safeUid}_${validated.id}`);
  const path = `inventory/${docId}`;
  const ref = doc(db, 'inventory', docId);

  try {
    await withCloudRetry(async () => {
      const exists = await checkDocExistsByOwner('inventory', safeUid, docId);
      const mutableFields = {
        name: validated.name,
        category: validated.notes,
        qty: validated.qty,
        minQty: validated.minQty,
        unit: validated.unit,
        unitPrice: validated.unitPrice,
        totalCost: validated.totalCost,
        linkedService: validated.linkedService,
        updatedAt: serverTimestamp(),
      };

      if (exists) {
        await updateDoc(ref, mutableFields);
      } else {
        await setDoc(ref, {
          ownerId: safeUid,
          ...mutableFields,
          createdAt: serverTimestamp(),
        });
      }
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteInventoryItemFromCloud(uid: string, itemId: string): Promise<void> {
  const safeUid = sanitizeId(uid);
  if (!isCurrentSessionAuthorizedForClinic(safeUid)) {
    throw new Error('غير مصرح بحذف أصناف مخزون لعيادة أخرى.');
  }
  const docId = sanitizeId(`${safeUid}_${itemId}`);
  const path = `inventory/${docId}`;
  try {
    await withCloudRetry(() => deleteDoc(doc(db, 'inventory', docId)));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function saveExpenseToCloud(
  uid: string,
  expense: ExpenseRecord
): Promise<void> {
  const safeUid = sanitizeId(uid);
  if (!isCurrentSessionAuthorizedForClinic(safeUid)) {
    throw new Error('غير مصرح بحفظ مصروفات لعيادة أخرى.');
  }
  const validated = validateAndNormalizeExpense(expense);
  const docId = sanitizeId(`${safeUid}_${validated.id}`);
  const path = `expenses/${docId}`;
  const ref = doc(db, 'expenses', docId);

  try {
    await withCloudRetry(async () => {
      const exists = await checkDocExistsByOwner('expenses', safeUid, docId);
      const mutableFields = {
        title: validated.title,
        amount: validated.amount,
        category: validated.category,
        currency: validated.currency,
        date: validated.date,
        updatedAt: serverTimestamp(),
      };

      if (exists) {
        await updateDoc(ref, mutableFields);
      } else {
        await setDoc(ref, {
          ownerId: safeUid,
          ...mutableFields,
          createdAt: serverTimestamp(),
        });
      }
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteExpenseFromCloud(uid: string, expenseId: string): Promise<void> {
  const safeUid = sanitizeId(uid);
  if (!isCurrentSessionAuthorizedForClinic(safeUid)) {
    throw new Error('غير مصرح بحذف مصروفات لعيادة أخرى.');
  }
  const docId = sanitizeId(`${safeUid}_${expenseId}`);
  const path = `expenses/${docId}`;
  try {
    await withCloudRetry(() => deleteDoc(doc(db, 'expenses', docId)));
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

  const receiptsQuery = query(collection(db, 'receipts'), where('ownerId', '==', safeUid));
  let existingReceiptCount = 0;
  try {
    const snap = await withCloudRetry(() => getDocs(receiptsQuery));
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

  let nextSettings = fallbackData.settings;
  if (!clinicsSnap.empty) {
    const d = clinicsSnap.docs[0].data();
    const rawCurrency = String(d.defaultCurrency || 'ريال يمني');
    const validCurrency: CurrencyCode =
      rawCurrency === 'ريال سعودي' || rawCurrency === 'دولار أمريكي'
        ? rawCurrency
        : 'ريال يمني';

    nextSettings = {
      ...nextSettings,
      identity: {
        systemTitleAr: String(d.clinicAr || nextSettings.identity.systemTitleAr),
        clinicAr: String(d.clinicAr || nextSettings.identity.clinicAr),
        doctorAr: String(d.doctorAr || nextSettings.identity.doctorAr),
        specialtyAr: String(d.specialtyAr || nextSettings.identity.specialtyAr),
        clinicEn: String(d.clinicEn || nextSettings.identity.clinicEn),
        doctorEn: String(d.doctorEn || nextSettings.identity.doctorEn),
        address: String(d.address || nextSettings.identity.address),
        phones: String(d.phones || nextSettings.identity.phones),
        defaultCurrency: validCurrency,
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
    };
  }

  if (!servicesSnap.empty) {
    const cloudServices: DentalServiceItem[] = servicesSnap.docs.map((docSnap) => {
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
    nextSettings = {
      ...nextSettings,
      services: mergeByIdPreservingExisting(cloudServices, fallbackData.settings.services),
    };
  }

  const cloudReceipts: ReceiptRecord[] = receiptsSnap.docs.map((docSnap) => {
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
      currency: String(d.currency || 'ريال يمني') as CurrencyCode,
      paymentMethod: String(d.paymentMethod || 'نقداً (Cash)'),
      notes: String(d.notes || ''),
      amountWords: String(d.amountWords || ''),
      accountantSig: String(d.accountantSig || ''),
      receiverSig: String(d.receiverSig || ''),
      paperFormat: (d.paperFormat === 'thermal80' ? 'thermal80' : 'a5') as 'a5' | 'thermal80',
      createdAt: d.createdAt?.toDate ? d.createdAt.toDate().toISOString() : new Date().toISOString(),
    };
  });

  const cloudInventory: InventoryItem[] = inventorySnap.docs.map((docSnap) => {
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

  const cloudExpenses: ExpenseRecord[] = expensesSnap.docs.map((docSnap) => {
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

  return {
    settings: nextSettings,
    receipts: mergeByIdPreservingExisting(cloudReceipts, fallbackData.receipts).sort(
      (a, b) => b.receiptNo - a.receiptNo
    ),
    inventory: mergeByIdPreservingExisting(cloudInventory, fallbackData.inventory),
    expenses: mergeByIdPreservingExisting(cloudExpenses, fallbackData.expenses).sort((a, b) =>
      b.date.localeCompare(a.date)
    ),
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
      const d = snap.docs[0].data();
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
    (err) => {
      console.warn('Firestore clinics listener notice:', err);
    }
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
      if (items.length > 0) {
        callbacks.onServicesUpdate(items);
      }
    },
    (err) => {
      console.warn('Firestore services listener notice:', err);
    }
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
            currency: String(d.currency || 'ريال يمني') as CurrencyCode,
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
      if (items.length > 0) {
        callbacks.onReceiptsUpdate(items);
      }
    },
    (err) => {
      console.warn('Firestore receipts listener notice:', err);
    }
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
      if (items.length > 0) {
        callbacks.onInventoryUpdate(items);
      }
    },
    (err) => {
      console.warn('Firestore inventory listener notice:', err);
    }
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
            currency: String(d.currency || 'ريال يمني') as CurrencyCode,
            date: String(d.date || ''),
          };
        })
        .sort((a, b) => b.date.localeCompare(a.date));
      if (items.length > 0) {
        callbacks.onExpensesUpdate(items);
      }
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
  // Ensure Firebase Auth >= 6 character requirement while binding to clinicId
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
          // If the user selected "حساب جديد" for an already-registered clinic ID, seamlessly sign in if password matches
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

  // 3. Fetch and merge existing cloud collections (uses allow list, always succeeds for authenticated owner)
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

    const wsExists = await checkDocExistsByOwner('clinic_workspaces', ownerUid, safeId);
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

  if (!auth.currentUser || auth.currentUser.uid !== safeUid) {
    throw new Error('غير مصرح بالمزامنة السحابية: الجلسة غير موثقة.');
  }

  // Validate and persist individual collections so no document ever exceeds Firestore's 1MB limit
  await syncLocalDataToCloud(
    safeUid,
    data.settings,
    data.receipts,
    data.inventory,
    data.expenses,
    true
  );

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
      const exists = await checkDocExistsByOwner('clinic_workspaces', safeUid, safeId);
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

  return new Date().toISOString();
}

// ==================== WORKSPACE TEAM & MEMBERSHIP (MULTI-USER RBAC) ====================

export function normalizeEmailKey(email: string): string {
  return String(email || '')
    .trim()
    .toLowerCase()
    .slice(0, 128);
}

export async function addWorkspaceMemberInCloud(
  workspaceId: string,
  ownerUid: string,
  memberEmail: string,
  role: WorkspaceRole,
  permissions?: WorkspacePermissions
): Promise<WorkspaceMember> {
  const safeWsId = normalizeClinicWorkspaceId(workspaceId);
  const cleanEmail = String(memberEmail || '').trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    throw new Error('يرجى إدخال بريد إلكتروني صالح للعضو الجديد.');
  }

  const effectivePermissions = permissions || DEFAULT_ROLE_PERMISSIONS[role];
  const memberKey = normalizeEmailKey(cleanEmail);
  const nowIso = new Date().toISOString();

  const memberData: WorkspaceMember = {
    uid: memberKey,
    email: cleanEmail,
    role,
    permissions: effectivePermissions,
    addedBy: ownerUid,
    joinedAt: nowIso,
    status: 'active',
  };

  const memberRef = doc(db, 'clinic_workspaces', safeWsId, 'members', memberKey);
  const indexRef = doc(db, 'user_workspaces', memberKey);

  await withCloudRetry(async () => {
    // 1. Add to workspace subcollection
    await setDoc(memberRef, {
      uid: memberKey,
      email: cleanEmail,
      role,
      permissions: effectivePermissions,
      addedBy: ownerUid,
      joinedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      status: 'active',
    });

    // 2. Add to user's fast workspace lookup index
    await setDoc(indexRef, {
      workspaceId: safeWsId,
      email: cleanEmail,
      role,
      permissions: effectivePermissions,
      addedBy: ownerUid,
      updatedAt: serverTimestamp(),
    });
  });

  return memberData;
}

export async function updateWorkspaceMemberRoleInCloud(
  workspaceId: string,
  memberEmail: string,
  newRole: WorkspaceRole,
  permissions?: WorkspacePermissions
): Promise<void> {
  const safeWsId = normalizeClinicWorkspaceId(workspaceId);
  const cleanEmail = String(memberEmail || '').trim().toLowerCase();
  const memberKey = normalizeEmailKey(cleanEmail);
  const effectivePermissions = permissions || DEFAULT_ROLE_PERMISSIONS[newRole];

  const memberRef = doc(db, 'clinic_workspaces', safeWsId, 'members', memberKey);
  const indexRef = doc(db, 'user_workspaces', memberKey);

  await withCloudRetry(async () => {
    await updateDoc(memberRef, {
      role: newRole,
      permissions: effectivePermissions,
      updatedAt: serverTimestamp(),
    });
    await updateDoc(indexRef, {
      role: newRole,
      permissions: effectivePermissions,
      updatedAt: serverTimestamp(),
    });
  });
}

export async function removeWorkspaceMemberFromCloud(
  workspaceId: string,
  memberEmail: string
): Promise<void> {
  const safeWsId = normalizeClinicWorkspaceId(workspaceId);
  const cleanEmail = String(memberEmail || '').trim().toLowerCase();
  const memberKey = normalizeEmailKey(cleanEmail);

  const memberRef = doc(db, 'clinic_workspaces', safeWsId, 'members', memberKey);
  const indexRef = doc(db, 'user_workspaces', memberKey);

  await withCloudRetry(async () => {
    await deleteDoc(memberRef);
    await deleteDoc(indexRef);
  });
}

export function subscribeToWorkspaceMembers(
  workspaceId: string,
  onMembersUpdate: (members: WorkspaceMember[]) => void
): () => void {
  const safeWsId = normalizeClinicWorkspaceId(workspaceId);
  const membersCol = collection(db, 'clinic_workspaces', safeWsId, 'members');

  return onSnapshot(
    membersCol,
    (snap) => {
      const items: WorkspaceMember[] = snap.docs.map((docSnap) => {
        const d = docSnap.data();
        const role = (d.role || 'viewer') as WorkspaceRole;
        const perms = d.permissions || DEFAULT_ROLE_PERMISSIONS[role];
        return {
          uid: docSnap.id,
          email: String(d.email || ''),
          displayName: d.displayName ? String(d.displayName) : undefined,
          role,
          permissions: perms,
          addedBy: String(d.addedBy || ''),
          joinedAt: d.joinedAt?.toDate ? d.joinedAt.toDate().toISOString() : new Date().toISOString(),
          status: (d.status === 'invited' ? 'invited' : 'active') as 'active' | 'invited',
        };
      });
      onMembersUpdate(items);
    },
    (err) => {
      console.warn('Workspace members listener notice:', err);
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
  if (!cleanEmail) return null;
  const memberKey = normalizeEmailKey(cleanEmail);
  const ref = doc(db, 'user_workspaces', memberKey);

  try {
    const snap = await getDocFromServer(ref);
    if (!snap.exists()) return null;
    const d = snap.data();
    const role = (d.role || 'viewer') as WorkspaceRole;
    return {
      workspaceId: String(d.workspaceId || ''),
      role,
      permissions: d.permissions || DEFAULT_ROLE_PERMISSIONS[role],
      addedBy: String(d.addedBy || ''),
    };
  } catch (err) {
    console.warn('User workspace lookup error:', err);
    return null;
  }
}


