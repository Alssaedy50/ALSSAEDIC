import crypto from 'crypto';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const SERVER_HMAC_SECRET =
  process.env.SESSION_SECRET ||
  crypto
    .createHash('sha256')
    .update(`alssaedic-erp-secret-${process.env.GEMINI_API_KEY || 'local-runtime-key'}`)
    .digest('hex');

interface SignedSessionPayload {
  clinicId: string;
  ownerUid: string;
  iat: number;
  exp: number;
}

function normalizeServerlessClinicId(raw: string): string {
  const cleaned = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);
  return cleaned.length >= 3 ? cleaned : `clinic-${cleaned || 'default'}`;
}

function hashPasswordScrypt(password: string, existingSaltHex?: string): string {
  const normalized = String(password || '').trim();
  const salt = existingSaltHex
    ? Buffer.from(existingSaltHex, 'hex')
    : crypto.randomBytes(16);
  const derivedKey = crypto.scryptSync(normalized, salt, 64, {
    N: 16384,
    r: 8,
    p: 1,
  });
  return `scrypt$${salt.toString('hex')}$${derivedKey.toString('hex')}`;
}

function verifyPasswordScrypt(password: string, storedHash: string): boolean {
  try {
    const parts = String(storedHash || '').split('$');
    if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
    const [, saltHex, keyHex] = parts;
    const expectedBuf = Buffer.from(keyHex, 'hex');
    const actualDerived = crypto.scryptSync(
      String(password || '').trim(),
      Buffer.from(saltHex, 'hex'),
      64,
      {
        N: 16384,
        r: 8,
        p: 1,
      }
    );
    if (expectedBuf.length !== actualDerived.length) return false;
    return crypto.timingSafeEqual(expectedBuf, actualDerived);
  } catch {
    return false;
  }
}

function createSignedSessionToken(clinicId: string, ownerUid: string): {
  sessionToken: string;
  expiresAt: string;
} {
  const now = Date.now();
  const exp = now + SESSION_TTL_MS;
  const payload: SignedSessionPayload = {
    clinicId: normalizeServerlessClinicId(clinicId),
    ownerUid: String(ownerUid || '').trim().slice(0, 128),
    iat: now,
    exp,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
  const signature = crypto
    .createHmac('sha256', SERVER_HMAC_SECRET)
    .update(encodedPayload)
    .digest('base64url');
  return {
    sessionToken: `${encodedPayload}.${signature}`,
    expiresAt: new Date(exp).toISOString(),
  };
}

function verifySignedSessionToken(token: string): SignedSessionPayload | null {
  try {
    const raw = String(token || '').trim();
    const dotIndex = raw.indexOf('.');
    if (dotIndex <= 0) return null;
    const encodedPayload = raw.slice(0, dotIndex);
    const providedSig = raw.slice(dotIndex + 1);
    const expectedSig = crypto
      .createHmac('sha256', SERVER_HMAC_SECRET)
      .update(encodedPayload)
      .digest('base64url');

    const providedBuf = Buffer.from(providedSig, 'utf-8');
    const expectedBuf = Buffer.from(expectedSig, 'utf-8');
    if (providedBuf.length !== expectedBuf.length) return null;
    if (!crypto.timingSafeEqual(providedBuf, expectedBuf)) return null;

    const payload = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf-8')
    ) as SignedSessionPayload;
    if (!payload || typeof payload.exp !== 'number' || payload.exp <= Date.now()) {
      return null;
    }
    if (!payload.clinicId || !payload.ownerUid) return null;
    return payload;
  } catch {
    return null;
  }
}

const rateBuckets = new Map<string, number[]>();

function checkRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const timestamps = (rateBuckets.get(key) || []).filter((t) => now - t < windowMs);
  if (timestamps.length >= maxRequests) {
    rateBuckets.set(key, timestamps);
    return false;
  }
  timestamps.push(now);
  rateBuckets.set(key, timestamps);
  return true;
}

const MODEL_LABELS: Record<string, string> = {
  'gemini-3.1-flash-lite': 'Gemini 3.1 Flash Lite',
  'gemini-3.8-flash': 'Gemini 3.8 Flash',
  'gemini-flash-latest': 'Gemini Flash Latest',
  'local-clinical-engine': 'المحرك السريري المدمج',
};

const TEXT_MODEL_POOL = [
  'gemini-3.1-flash-lite',
  'gemini-3.8-flash',
] as const;

const VISION_MODEL_POOL = [
  'gemini-3.8-flash',
  'gemini-3.1-flash-lite',
] as const;

const modelCooldownUntil = new Map<string, number>();

function getGenAIClientsPool(): GoogleGenAI[] {
  const rawKeys = [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY_3,
    process.env.GOOGLE_API_KEY,
  ];
  const uniqueKeys = Array.from(
    new Set(
      rawKeys
        .map((k) => String(k || '').trim())
        .filter((k) => k.length > 0)
    )
  );

  return uniqueKeys.map(
    (apiKey) =>
      new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      })
  );
}

function buildTargetedClinicContext(
  prompt: string,
  ctx: Record<string, unknown> | null | undefined,
  hasAttachment = false,
  taskType = 'chat'
): Record<string, unknown> {
  if (!ctx || typeof ctx !== 'object') return {};
  const p = String(prompt || '').toLowerCase();
  const clone: Record<string, unknown> = {};

  // 1. Basic Clinic Identity (Always Included)
  if (ctx.identity && typeof ctx.identity === 'object') {
    const id = ctx.identity as Record<string, unknown>;
    clone.identity = {
      clinicAr: id.clinicAr,
      doctorAr: id.doctorAr,
      defaultCurrency: id.defaultCurrency,
    };
  }

  // 2. Intelligent Intent Classification
  const asksPatientsOrReceipts =
    /مرضى|مريض|مريضة|سند|سندات|دين|ديون|مديون|ذمم|متبقي|تحصيل|فاتورة|فواتير|كشف حساب|دفع|سداد|تسديد/i.test(
      p
    );

  const asksInventory =
    taskType === 'inventory_analysis' ||
    /مخزون|نواقص|جرد|أصناف|اصناف|صنف|مواد|مستلزمات|توريد|تزويد|استهلاك|مستودع|شراء مخزون/i.test(
      p
    );

  const asksFinance =
    taskType === 'financial_report' ||
    /مالي|مالية|إيراد|ايراد|إيرادات|ايرادات|مصروف|مصاريف|مصروفات|ربح|أرباح|ارباح|صافي|دخل|ميزان|خزينة|صندوق/i.test(
      p
    );

  const asksComprehensive =
    /شامل|تقرير عام|وضع العيادة|ملخص العيادة|كل البيانات|كل التقارير|إحصائيات|احصائيات/i.test(p) ||
    (!asksPatientsOrReceipts &&
      !asksInventory &&
      !asksFinance &&
      !hasAttachment &&
      /تقرير|ملخص|العيادة/i.test(p));

  const isPureClinical =
    hasAttachment ||
    (!asksPatientsOrReceipts && !asksInventory && !asksFinance && !asksComprehensive);

  // If asking pure clinical/medical/dental protocol or uploading an X-ray image:
  // Do NOT send receipts, debts, inventory, or expenses! Total privacy and minimal token consumption.
  if (isPureClinical) {
    if (Array.isArray(ctx.servicesCatalog)) {
      clone.servicesCatalog = ctx.servicesCatalog.map((s: Record<string, unknown>) => ({
        name: s.name,
        price: s.price,
      }));
    }
    return clone;
  }

  // Domain A: Patients & Receipts & Debts (Full unsliced data fidelity)
  if (asksPatientsOrReceipts || asksComprehensive) {
    const rawReceipts = Array.isArray(ctx.allReceipts)
      ? ctx.allReceipts
      : Array.isArray(ctx.recentReceipts)
        ? ctx.recentReceipts
        : [];

    clone.allReceipts = rawReceipts.map((r: Record<string, unknown>) => ({
      receiptNo: r.receiptNo,
      date: r.date,
      patientName: r.patientName,
      patientPhone: r.patientPhone || undefined,
      services: r.services,
      toothFDI: r.toothFDI || undefined,
      totalAmount: r.totalAmount,
      paidAmount: r.paidAmount,
      remainingAmount: r.remainingAmount,
      currency: r.currency,
      paymentMethod: r.paymentMethod,
      notes: r.notes || undefined,
    }));

    const rawDebts = Array.isArray(ctx.pendingDebtsPatients)
      ? ctx.pendingDebtsPatients
      : rawReceipts
          .filter((r: Record<string, unknown>) => (Number(r.remainingAmount) || 0) > 0)
          .map((r: Record<string, unknown>) => ({
            receiptNo: r.receiptNo,
            patientName: r.patientName,
            phone: r.patientPhone,
            remainingAmount: r.remainingAmount,
            currency: r.currency,
            date: r.date,
          }));

    clone.pendingDebtsPatients = rawDebts;
    clone.totalReceiptsCount = rawReceipts.length;
    clone.totalDebtorsCount = rawDebts.length;
  }

  // Domain B: Inventory & Medical Supplies (Full unsliced data fidelity)
  if (asksInventory || asksComprehensive) {
    const rawInventory = Array.isArray(ctx.allInventory)
      ? ctx.allInventory
      : Array.isArray(ctx.inventoryStatus)
        ? ctx.inventoryStatus
        : Array.isArray(ctx.inventory)
          ? ctx.inventory
          : [];

    clone.inventory = rawInventory.map((i: Record<string, unknown>) => ({
      name: i.name,
      qty: i.qty,
      minQty: i.minQty,
      unit: i.unit,
      unitPrice: i.unitPrice,
      totalCost: i.totalCost,
      linkedService: i.linkedService || undefined,
    }));

    const rawLowStock = Array.isArray(ctx.lowStockAlerts)
      ? ctx.lowStockAlerts
      : rawInventory.filter((i: Record<string, unknown>) => Number(i.qty) <= Number(i.minQty));

    clone.lowStockAlerts = rawLowStock;
    clone.totalInventoryItemsCount = rawInventory.length;
    clone.lowStockCount = rawLowStock.length;
  }

  // Domain C: Finance, Expenses, Revenue, Net Profit (Full unsliced data fidelity)
  if (asksFinance || asksComprehensive) {
    if (Array.isArray(ctx.currencySummaries)) {
      clone.currencySummaries = ctx.currencySummaries;
    }

    const rawExpenses = Array.isArray(ctx.allExpenses)
      ? ctx.allExpenses
      : Array.isArray(ctx.recentExpenses)
        ? ctx.recentExpenses
        : Array.isArray(ctx.expenses)
          ? ctx.expenses
          : [];

    clone.allExpenses = rawExpenses.map((e: Record<string, unknown>) => ({
      title: e.title,
      amount: e.amount,
      currency: e.currency,
      category: e.category,
      date: e.date,
    }));

    if (ctx.financialSummary && typeof ctx.financialSummary === 'object') {
      clone.financialSummary = ctx.financialSummary;
    }
  }

  // Services Catalog if inquiring about dental fees or prices
  if (
    Array.isArray(ctx.servicesCatalog) &&
    (/سعر|أسعار|اسعار|خدمة|خدمات|قائمة/i.test(p) || asksComprehensive)
  ) {
    clone.servicesCatalog = ctx.servicesCatalog.map((s: Record<string, unknown>) => ({
      name: s.name,
      price: s.price,
    }));
  }

  return clone;
}

function withModelTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('MODEL_TIMEOUT'));
    }, timeoutMs);
    promise
      .then((val) => {
        clearTimeout(timer);
        resolve(val);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

async function generateWithMultiModelLoadBalancer(
  clients: GoogleGenAI[],
  payload: {
    contents: unknown;
    config?: Record<string, unknown>;
    hasAttachment?: boolean;
  }
) {
  const basePool = payload.hasAttachment ? [...VISION_MODEL_POOL] : [...TEXT_MODEL_POOL];

  const now = Date.now();
  const healthyTargets: Array<{ client: GoogleGenAI; clientIdx: number; modelName: string }> = [];
  const cooldownTargets: Array<{ client: GoogleGenAI; clientIdx: number; modelName: string }> = [];

  basePool.forEach((modelName) => {
    clients.forEach((client, clientIdx) => {
      const slotKey = `${clientIdx}:${modelName}`;
      const cooldownExp = modelCooldownUntil.get(slotKey) || 0;
      if (cooldownExp <= now) {
        healthyTargets.push({ client, clientIdx, modelName });
      } else {
        cooldownTargets.push({ client, clientIdx, modelName });
      }
    });
  });

  const orderedTargets = [...healthyTargets, ...cooldownTargets];
  let lastErr: unknown = null;

  for (const target of orderedTargets) {
    const slotKey = `${target.clientIdx}:${target.modelName}`;
    try {
      const modelConfig: Record<string, unknown> = {
        ...payload.config,
      };
      if (target.modelName === 'gemini-3.8-flash') {
        modelConfig.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
      }

      const response = await withModelTimeout(
        target.client.models.generateContent({
          model: target.modelName,
          contents: payload.contents as string,
          config: modelConfig,
        }),
        20_000
      );
      modelCooldownUntil.delete(slotKey);
      return {
        response,
        modelName: target.modelName,
        modelLabel: MODEL_LABELS[target.modelName] || target.modelName,
      };
    } catch (err: unknown) {
      lastErr = err;
      const errMsg = String(err instanceof Error ? err.message : err || '').toLowerCase();
      const isNotFound = errMsg.includes('404') || errMsg.includes('not_found');
      const isTimeout = errMsg.includes('model_timeout');
      const isQuotaOrTransient =
        errMsg.includes('429') ||
        errMsg.includes('resource_exhausted') ||
        errMsg.includes('quota') ||
        errMsg.includes('rate') ||
        errMsg.includes('503') ||
        errMsg.includes('overloaded');

      if (isNotFound) {
        modelCooldownUntil.set(slotKey, Date.now() + 10 * 60_000);
      } else if (isTimeout) {
        modelCooldownUntil.set(slotKey, Date.now() + 5 * 60_000);
      } else if (isQuotaOrTransient) {
        modelCooldownUntil.set(slotKey, Date.now() + 60_000);
      } else {
        modelCooldownUntil.set(slotKey, Date.now() + 15_000);
      }
    }
  }
  throw lastErr;
}

function buildLocalIntelligentReply(
  prompt: string,
  clinicContext: Record<string, unknown> | null | undefined
): string {
  const p = String(prompt || '').trim();
  const ctx = (clinicContext || {}) as {
    identity?: {
      clinicAr?: string;
      doctorAr?: string;
      defaultCurrency?: string;
    };
    servicesCatalog?: Array<{
      name?: string;
      price?: number;
    }>;
    financialSummary?: {
      totalReceipts?: number;
      totalBilled?: number;
      totalCollected?: number;
      totalPendingDebts?: number;
      totalExpenses?: number;
    };
    pendingDebtsPatients?: Array<{
      receiptNo?: number;
      patientName?: string;
      phone?: string;
      remainingAmount?: number;
      currency?: string;
      date?: string;
    }>;
    allReceipts?: Array<{
      receiptNo?: number;
      date?: string;
      patientName?: string;
      patientPhone?: string;
      services?: string[];
      toothFDI?: string;
      totalAmount?: number;
      paidAmount?: number;
      remainingAmount?: number;
      currency?: string;
    }>;
    recentReceipts?: Array<{
      receiptNo?: number;
      date?: string;
      patientName?: string;
      patientPhone?: string;
      services?: string[];
      toothFDI?: string;
      totalAmount?: number;
      paidAmount?: number;
      remainingAmount?: number;
      currency?: string;
    }>;
    allInventory?: Array<{
      name?: string;
      qty?: number;
      minQty?: number;
      unit?: string;
      unitPrice?: number;
    }>;
    inventoryStatus?: Array<{
      name?: string;
      qty?: number;
      minQty?: number;
      unit?: string;
      unitPrice?: number;
    }>;
    lowStockAlerts?: Array<{
      name?: string;
      qty?: number;
      minQty?: number;
      unit?: string;
      unitPrice?: number;
    }>;
    inventory?: Array<{
      name?: string;
      qty?: number;
      minQty?: number;
      unit?: string;
      unitPrice?: number;
    }>;
    allExpenses?: Array<{
      title?: string;
      amount?: number;
      currency?: string;
      category?: string;
      date?: string;
    }>;
    currencySummaries?: Array<{
      currency?: string;
      totalBilledAmount?: number;
      totalCollectedRevenue?: number;
      totalPendingDebts?: number;
      totalExpenses?: number;
      netCashProfit?: number;
      receiptsCount?: number;
      debtorsCount?: number;
    }>;
    defaultCurrency?: string;
  };

  const defaultCurr = ctx.identity?.defaultCurrency || ctx.defaultCurrency || 'ريال يمني';
  const clinicName = ctx.identity?.clinicAr || 'عيادة طب وجراحة الفم والأسنان';
  const doctorName = ctx.identity?.doctorAr || 'الطبيب المعالج';

  const recList = Array.isArray(ctx.allReceipts)
    ? ctx.allReceipts
    : Array.isArray(ctx.recentReceipts)
      ? ctx.recentReceipts
      : [];
  const matchedReceipts = recList.filter(
    (r) =>
      (r.patientName && r.patientName.trim().length >= 3 && p.includes(r.patientName.trim())) ||
      (r.patientPhone && r.patientPhone.trim().length >= 6 && p.includes(r.patientPhone.trim())) ||
      (r.receiptNo && p.includes(String(r.receiptNo)))
  );

  if (matchedReceipts.length > 0) {
    const details = matchedReceipts
      .map(
        (r) =>
          `• سند #${r.receiptNo} (${r.date}) — المريض: ${r.patientName}\n  الخدمات: ${(r.services || []).join(' + ') || '—'}${r.toothFDI ? ` | الأسنان: ${r.toothFDI}` : ''}\n  الإجمالي: ${Number(r.totalAmount).toLocaleString()} | المدفوع: ${Number(r.paidAmount).toLocaleString()} | المتبقي: ${Number(r.remainingAmount).toLocaleString()} ${r.currency}`
      )
      .join('\n\n');
    return `🔍 نتائج البحث في سجلات المرضى والسندات (${clinicName}):\n\n${details}`;
  }

  if (
    p.includes('ديون') ||
    p.includes('مديون') ||
    p.includes('متبقي') ||
    p.includes('آجل') ||
    p.includes('اجل') ||
    p.includes('ذمم')
  ) {
    const debtors = Array.isArray(ctx.pendingDebtsPatients) ? ctx.pendingDebtsPatients : [];
    if (debtors.length === 0) {
      return `✅ لا توجد أي ديون متبقية على المرضى حالياً في سجلات ${clinicName}.\nجميع السندات المسجلة مسددة بالكامل.`;
    }
    const totalDebt = debtors.reduce((s, d) => s + (Number(d.remainingAmount) || 0), 0);
    const lines = debtors.map(
      (d, idx) =>
        `${idx + 1}. ${d.patientName || 'مريض'} — سند #${d.receiptNo || '—'} (${d.date || ''})\n   • المتبقي: ${Number(d.remainingAmount || 0).toLocaleString()} ${d.currency || defaultCurr}${d.phone ? ` | هاتف: ${d.phone}` : ''}`
    );
    return `📋 كشف ديون المرضى بالتفصيل (${debtors.length} حالة آجلة):\n\n${lines.join('\n\n')}\n\n💰 إجمالي الديون المتبقية: ${totalDebt.toLocaleString()} ${defaultCurr}\n💡 التوصية: متابعة تحصيل المبالغ الآجلة عبر إشعارات واتساب من قسم "سجل السندات".`;
  }

  if (
    p.includes('مخزون') ||
    p.includes('نواقص') ||
    p.includes('جرد') ||
    p.includes('أصناف') ||
    p.includes('اصناف') ||
    p.includes('مستودع')
  ) {
    const allItems = Array.isArray(ctx.allInventory)
      ? ctx.allInventory
      : Array.isArray(ctx.inventoryStatus)
        ? ctx.inventoryStatus
        : Array.isArray(ctx.inventory)
          ? ctx.inventory
          : [];
    const lowList = Array.isArray(ctx.lowStockAlerts)
      ? ctx.lowStockAlerts
      : allItems.filter((i) => Number(i.qty || 0) <= Number(i.minQty || 0));

    const totalVal = allItems.reduce(
      (s, i) => s + (Number(i.qty) || 0) * (Number(i.unitPrice) || 0),
      0
    );

    if (allItems.length === 0) {
      return `📦 لا توجد أصناف مسجلة حالياً في مخزون ${clinicName}.\nيمكنك إضافة المواد والمستلزمات الطبية من قسم "المخزون".`;
    }

    if (lowList.length === 0) {
      return `📦 تقرير حالة المخزون الطبي (${clinicName}):\n• إجمالي الأصناف المسجلة: ${allItems.length} صنف\n• القيمة الإجمالية للمخزون: ${totalVal.toLocaleString()} ${defaultCurr}\n• النواقص الحالية: 0 (جميع المواد متوفرة فوق الحد الأدنى ✅).`;
    }

    const lowLines = lowList.map((item, idx) => {
      const needed = Math.max(5, (Number(item.minQty) || 5) * 2 - (Number(item.qty) || 0));
      const estCost = needed * (Number(item.unitPrice) || 0);
      return `${idx + 1}. ${item.name}: المتبقي (${item.qty} ${item.unit || ''}) | الحد الأدنى (${item.minQty} ${item.unit || ''}) — يُنصح بطلب ${needed} ${item.unit || ''} (بتكلفة تقديرية ${estCost.toLocaleString()} ${defaultCurr})`;
    });

    return `⚠️ تقرير نواقص وجرد المخزون الطبي (${clinicName}):\n• إجمالي الأصناف: ${allItems.length} صنف (بقيمة ${totalVal.toLocaleString()} ${defaultCurr})\n• أصناف وصلت لحد النقص (${lowList.length}):\n\n${lowLines.join('\n')}\n\n💡 التوصية: سرعة تزويد الأصناف الحرجة لضمان استمرارية الجلسات العلاجية دون توقف.`;
  }

  if (
    p.includes('أرباح') ||
    p.includes('ارباح') ||
    p.includes('مصروفات') ||
    p.includes('مالي') ||
    p.includes('إيراد') ||
    p.includes('ايراد') ||
    p.includes('تقرير') ||
    p.includes('محاسب')
  ) {
    if (Array.isArray(ctx.currencySummaries) && ctx.currencySummaries.length > 0) {
      const blocks = ctx.currencySummaries.map((c) => {
        const rate =
          (c.totalBilledAmount || 0) > 0
            ? Math.round(((c.totalCollectedRevenue || 0) / (c.totalBilledAmount || 1)) * 100)
            : 100;
        return `💵 عملة (${c.currency}):\n• إجمالي المفوتر: ${Number(c.totalBilledAmount || 0).toLocaleString()} (${c.receiptsCount || 0} سند)\n• الإيراد المقبوض نقداً: ${Number(c.totalCollectedRevenue || 0).toLocaleString()} (نسبة التحصيل: ${rate}%)\n• الديون الآجلة: ${Number(c.totalPendingDebts || 0).toLocaleString()} (${c.debtorsCount || 0} حالة)\n• المصروفات: ${Number(c.totalExpenses || 0).toLocaleString()}\n• صافي الربح النقدي: ${Number(c.netCashProfit || 0).toLocaleString()} ${c.currency}`;
      });
      return `📊 التقرير المالي التنفيذي (${clinicName}):\n\n${blocks.join('\n\n')}`;
    }

    const fin = ctx.financialSummary || {};
    const billed = Number(fin.totalBilled || 0);
    const collected = Number(fin.totalCollected || 0);
    const debts = Number(fin.totalPendingDebts || 0);
    const expenses = Number(fin.totalExpenses || 0);
    const net = collected - expenses;
    const rate = billed > 0 ? Math.round((collected / billed) * 100) : 100;

    return `📊 ملخص الأداء المالي وصافي الأرباح (${clinicName}):\n• عدد السندات المصدرة: ${fin.totalReceipts || 0} سند\n• إجمالي قيمة العلاج المفوتر: ${billed.toLocaleString()} ${defaultCurr}\n• الإيراد المقبوض فعلياً: ${collected.toLocaleString()} ${defaultCurr} (نسبة التحصيل ${rate}%)\n• إجمالي ديون المرضى: ${debts.toLocaleString()} ${defaultCurr}\n• إجمالي المصروفات التشغيلية: ${expenses.toLocaleString()} ${defaultCurr}\n• صافي الربح النقدي: ${net.toLocaleString()} ${defaultCurr}`;
  }

  if (
    p.includes('أسعار') ||
    p.includes('اسعار') ||
    p.includes('سعر') ||
    p.includes('تكلفة') ||
    p.includes('خدمات العيادة')
  ) {
    const services = Array.isArray(ctx.servicesCatalog) ? ctx.servicesCatalog : [];
    if (services.length > 0) {
      const list = services
        .map((s, idx) => `${idx + 1}. ${s.name}: ${Number(s.price || 0).toLocaleString()} ${defaultCurr}`)
        .join('\n');
      return `🦷 قائمة الخدمات العلاجية وأسعارها المعتمدة في (${clinicName}):\n\n${list}`;
    }
  }

  if (
    p.includes('مضاد') ||
    p.includes('دواء') ||
    p.includes('أدوية') ||
    p.includes('ادوية') ||
    p.includes('مسكن') ||
    p.includes('وصفة') ||
    p.includes('اموكسيسيلين') ||
    p.includes('أموكسيسيلين') ||
    p.includes('اوجمنتين') ||
    p.includes('فلاجيل') ||
    p.includes('بروفين') ||
    p.includes('جرعة')
  ) {
    return `💊 دليل البروتوكول الدوائي في عيادة الأسنان (${clinicName}):

1. المضادات الحيوية (تُوصف عند وجود انتفاخ منتشر، خراج حاد، أو أعراض جهازية):
   • الخط الأول (البالغين): Amoxicillin 500mg كل 8 ساعات لمدة 5–7 أيام، أو Augmentin 1g كل 12 ساعة لمدة 5–7 أيام.
   • في التهابات اللاهوائيات الشديدة أو الخراج الحاد: يُضاف Metronidazole (Flagyl) 500mg كل 8 ساعات لمدة 5 أيام.
   • في حال حساسية البنسلين: Clindamycin 300mg كل 6–8 ساعات أو Azithromycin 500mg مرة يومياً لمدة 3–5 أيام.

2. المسكنات ومضادات الالتهاب (NSAIDs):
   • للألم المتوسط إلى الشديد: Ibuprofen 400mg–600mg كل 8 ساعات بعد الأكل، أو Diclofenac Potassium 50mg كل 8–12 ساعة.
   • لمرضى القرحة المعدية أو الربو أو الحوامل: Paracetamol 500mg–1000mg كل 6–8 ساعات.

3. الغسولات الفموية:
   • Chlorhexidine Gluconate 0.12% مضمضة مرتين يومياً لمدة 7–10 أيام.`;
  }

  if (
    p.includes('خلع') ||
    p.includes('قلع') ||
    p.includes('ضرس') ||
    p.includes('جراح') ||
    p.includes('نزيف') ||
    p.includes('تعليمات')
  ) {
    return `🦷 تعليمات طبية للمريض بعد خلع الضرس (${clinicName}):
1. العضّ جيداً على قطعة الشاش المعقم لمدة 45 إلى 60 دقيقة لوقف النزيف وتكوين الخثرة الدموية.
2. تجنب المضمضة القوية أو البصق أو استخدام المصاصة خلال أول 24 ساعة.
3. الامتناع التام عن التدخين والمشروبات الساخنة في اليوم الأول لتفادي التهاب السنخ الجاف (Dry Socket).
4. تناول أطعمة لينة وباردة أو فاترة، والمضمضة اللطيفة بماء دافئ وملح بدءاً من اليوم الثاني.
5. الالتزام بالمسكنات والمضاد الحيوي الموصوف من ${doctorName} في مواعيدها.`;
  }

  if (
    p.includes('عصب') ||
    p.includes('جذور') ||
    p.includes('حشو') ||
    p.includes('ألم') ||
    p.includes('الم') ||
    p.includes('وجع') ||
    p.includes('خراج') ||
    p.includes('سن') ||
    /\b([1-4][1-8]|[5-8][1-5])\b/.test(p)
  ) {
    const toothMatch = p.match(/\b([1-4][1-8]|[5-8][1-5])\b/);
    const toothLabel = toothMatch ? ` للسن رقم (${toothMatch[1]}) بنظام FDI` : '';
    return `🦷 البروتوكول الإكلينيكي وخطة علاج العصب (Root Canal Therapy)${toothLabel}:
1. التشخيص والأشعة: أخذ صورة أشعة ذروية (Periapical X-Ray) لتقييم الجذور والنسج حول الذروية.
2. التخدير والعزل: إعطاء التخدير الموضعي وعزل السن بالحاجز المطاطي (Rubber Dam) وفتح حجرة اللب.
3. استئصال اللب وتحديد الطول العامل بدقة عبر جهاز Apex Locator.
4. التنظيف والتشكيل بالمبارد الدوارة (Rotary NiTi Files) مع الإرواء المكثف بمحلول NaOCl 5.25% و EDTA.
5. التجفيف والحشو النهائي بأقماع Gutta-Percha مع Bioceramic/Resin Sealer ووضع التعويض النهائي.`;
  }

  if (
    p.includes('تركيب') ||
    p.includes('زيركون') ||
    p.includes('إيماكس') ||
    p.includes('ايماكس') ||
    p.includes('فينير') ||
    p.includes('تاج') ||
    p.includes('جسر') ||
    p.includes('زراعة') ||
    p.includes('تقويم') ||
    p.includes('لثة') ||
    p.includes('تنظيف') ||
    p.includes('تبييض') ||
    p.includes('أطفال') ||
    p.includes('اطفال') ||
    p.includes('تخدير') ||
    p.includes('بنج')
  ) {
    return `🦷 الدليل الإكلينيكي المتخصص (${clinicName} — ${doctorName}):

• التركيبات التجميلية (Zirconia / E-max): تحضير خط إنهاء واضح (Chamfer / Shoulder)، أخذ طبعة دقيقة (Addition Silicone / Scanner)، واستخدام Resin Cement في الإلصاق النهائي.
• علاج اللثة والتقليح (Scaling): إزالة التكلسات بجهاز Ultrasonic Scaler، صقل السطوح (Polishing)، ووصف غسول Chlorhexidine 0.12%.
• زراعة الأسنان (Dental Implants): تقييم العظم بأشعة CBCT، الغرس الجراحي بعزم ثبات أولي (35–45 Ncm)، والانتظار 3–4 أشهر للاندماج العظمي.
• التخدير الموضعي: Lidocaine 2% with Epinephrine 1:100,000، ولمرضى الضغط/القلب غير المسيطر عليه يُستخدم Mepivacaine 3% Plain.`;
  }

  const fin = ctx.financialSummary || {};
  return `مرحباً بك في المساعد الطبي والمالي الذكي (${clinicName}):

بخصوص استفسارك: "${p.slice(0, 120)}"

📌 ملخص السجلات الحية للعيادة:
• إجمالي السندات: ${fin.totalReceipts || 0} سند
• الإيرادات المقبوضة: ${Number(fin.totalCollected || 0).toLocaleString()} ${defaultCurr}
• الديون المتبقية: ${Number(fin.totalPendingDebts || 0).toLocaleString()} ${defaultCurr}
• المصروفات: ${Number(fin.totalExpenses || 0).toLocaleString()} ${defaultCurr}

💡 يمكنك سؤالي مباشرة عن: ديون المرضى، نواقص المخزون، صافي الأرباح، البحث عن مريض، أو أي استشارة طبية ودوائية في طب وجراحة الفم والأسنان.`;
}

function parseReceiptHeuristicServer(
  raw: string,
  availableServices: Array<{ name?: string; price?: number; keywords?: string[] }>,
  defaultCurrency: string
) {
  let extractedName = '';
  const nameMatch = raw.match(
    /(?:للمريض|مريض|باسم|الأخ|الاخ|المريضة)\s+([^\d،,]+?)(?=\s+(?:خدمة|علاج|حشو|خلع|عصب|تنظيف|تركيب|تقويم|كشف|أشعة|اشعة|بمبلغ|مبلغ|إجمالي|اجمالي|دفع|سدد|رقم|هاتف|جوال|سن|$))/i
  );
  if (nameMatch?.[1]) {
    extractedName = nameMatch[1].trim();
  } else {
    const words = raw
      .replace(/سند|قبض|جديد|للمريض|مريض/g, '')
      .trim()
      .split(/\s+/)
      .slice(0, 3)
      .join(' ');
    if (words && !/\d/.test(words)) extractedName = words;
  }

  const phoneMatch = raw.match(/(?:\+?967|0)?(7\d{8})/);
  const extractedPhone = phoneMatch ? phoneMatch[0] : '';

  const matchedServices: string[] = [];
  let calculatedPrice = 0;
  if (Array.isArray(availableServices)) {
    availableServices.slice(0, 50).forEach((srv) => {
      const allTerms = [srv.name || '', ...(srv.keywords || [])];
      if (allTerms.some((term) => term && raw.includes(term))) {
        if (srv.name) matchedServices.push(srv.name);
        calculatedPrice += Number(srv.price) || 0;
      }
    });
  }

  const fdiMatches = raw.match(/\b([1-4][1-8]|[5-8][1-5])\b/g);
  const toothFDI = fdiMatches ? Array.from(new Set(fdiMatches)).join(', ') : '';

  const totalMatch = raw.match(/(?:بمبلغ|مبلغ|إجمالي|اجمالي)\s*(\d+)/);
  const paidMatch = raw.match(/(?:دفع|سدد|المدفوع|استلمنا)\s*(\d+)/);

  const totalAmount = Math.max(0, totalMatch ? Number(totalMatch[1]) : calculatedPrice);
  const paidAmount = Math.min(totalAmount, Math.max(0, paidMatch ? Number(paidMatch[1]) : totalAmount));

  return {
    patientName: (extractedName || 'مريض').slice(0, 160),
    patientPhone: extractedPhone.slice(0, 50),
    services: matchedServices.slice(0, 25),
    toothFDI: toothFDI.slice(0, 200),
    totalAmount,
    paidAmount,
    currency: String(defaultCurrency || 'ريال يمني').slice(0, 40),
    paymentMethod: raw.includes('تحويل') || raw.includes('محفظة') ? 'تحويل بنكي / محفظة' : 'نقداً (Cash)',
    notes: '',
  };
}

export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');

  if (req.method === 'OPTIONS') {
    return res.status(200).json({ ok: true });
  }

  const clientIp =
    String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim() || 'serverless-ip';
  const url = String(req.url || '');

  const rawBodyStr = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
  if (rawBodyStr.length > 5_000_000) {
    return res.status(413).json({
      ok: false,
      error: 'حجم الطلب يتجاوز الحد الأقصى المسموح به (5MB).',
    });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};

  try {
    // 1. Session Issuance & Scrypt Password Verification Endpoint
    if (url.includes('/auth/session')) {
      if (!checkRateLimit(`auth:${clientIp}`, 20, 60_000)) {
        return res.status(429).json({
          ok: false,
          error: 'محاولات كثيرة جداً. يرجى الانتظار دقيقة قبل المحاولة مرة أخرى.',
        });
      }

      const clinicId = normalizeServerlessClinicId(body.clinicId || 'default-clinic');
      const ownerUid = String(body.ownerUid || '')
        .trim()
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .slice(0, 128);

      if (!ownerUid || ownerUid.length < 3) {
        return res.status(400).json({
          ok: false,
          error: 'معرّف ملكية الحساب غير صالح.',
        });
      }

      let passwordVerifier: string | undefined;
      if (body.password && typeof body.password === 'string' && body.password.trim().length >= 4) {
        if (body.storedPasswordVerifier && typeof body.storedPasswordVerifier === 'string') {
          if (!verifyPasswordScrypt(body.password, body.storedPasswordVerifier)) {
            return res.status(401).json({
              ok: false,
              error: 'كلمة المرور غير صحيحة لهذا الحساب.',
            });
          }
          passwordVerifier = body.storedPasswordVerifier;
        } else {
          passwordVerifier = hashPasswordScrypt(body.password);
        }
      }

      const { sessionToken, expiresAt } = createSignedSessionToken(clinicId, ownerUid);
      return res.status(200).json({
        ok: true,
        clinicId,
        ownerUid,
        sessionToken,
        expiresAt,
        passwordVerifier,
      });
    }

    // Reject legacy /tmp cloud routes so Vercel /tmp is never used as fake persistence
    if (url.includes('/cloud/')) {
      return res.status(410).json({
        ok: false,
        error:
          'تم إيقاف التخزين المؤقت غير الآمن. يتم الحفظ والمزامنة حصرياً عبر قاعدة بيانات Firebase Firestore الموثقة.',
      });
    }

    // Telegram Cloud Backup Endpoint (/api/backup/telegram)
    if (url.includes('/backup/telegram')) {
      if (!checkRateLimit(`telegram_backup:${clientIp}`, 20, 60_000)) {
        return res.status(429).json({
          ok: false,
          error: 'تم تجاوز الحد المسموح لإرسال النسخ الاحتياطية في الدقيقة. يرجى الانتظار قليلاً.',
        });
      }

      const botToken = String(body.botToken || process.env.TELEGRAM_BOT_TOKEN || '').trim();
      const chatId = String(body.chatId || process.env.TELEGRAM_CHAT_ID || '').trim();
      const backupPayload = body.backupPayload;
      const triggerReason = String(body.triggerReason || 'نسخ احتياطي يدوي');

      if (!botToken || !/^\d+:[A-Za-z0-9_-]{20,}$/.test(botToken)) {
        return res.status(400).json({
          ok: false,
          error: 'رمز بوت تليجرام (Bot Token) غير صالح. يرجى التأكد من الرمز المنسوخ من @BotFather.',
        });
      }

      if (!chatId || !/^-?\d+$|^@[A-Za-z0-9_]{4,}$/.test(chatId)) {
        return res.status(400).json({
          ok: false,
          error: 'معرّف المحادثة أو القناة (Chat ID) غير صالح. يرجى إدخال رقم المعرّف الصحيح.',
        });
      }

      if (!backupPayload || typeof backupPayload !== 'object') {
        return res.status(400).json({
          ok: false,
          error: 'بيانات النسخة الاحتياطية غير مكتملة.',
        });
      }

      const payloadObj = backupPayload as {
        settings?: {
          identity?: {
            clinicAr?: string;
            doctorAr?: string;
            defaultCurrency?: string;
          };
        };
        receipts?: Array<{
          paidAmount?: number;
          remainingAmount?: number;
        }>;
        inventory?: unknown[];
        expenses?: unknown[];
      };

      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const fileStamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
      const fileName = `DOCAI-Backup-${fileStamp}.json`;

      const clinicAr = payloadObj.settings?.identity?.clinicAr || 'عيادة السعيدي لطب الأسنان';
      const doctorAr = payloadObj.settings?.identity?.doctorAr || 'د. صلاح الدين السعيدي';
      const defaultCurrency = payloadObj.settings?.identity?.defaultCurrency || 'ريال يمني';

      const receiptsList = Array.isArray(payloadObj.receipts) ? payloadObj.receipts : [];
      const inventoryList = Array.isArray(payloadObj.inventory) ? payloadObj.inventory : [];
      const expensesList = Array.isArray(payloadObj.expenses) ? payloadObj.expenses : [];

      const totalPaid = receiptsList.reduce((sum, r) => sum + (Number(r?.paidAmount) || 0), 0);
      const totalRemaining = receiptsList.reduce(
        (sum, r) => sum + (Number(r?.remainingAmount) || 0),
        0
      );

      const formattedTime = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
      const caption = [
        `🏥 نسخة احتياطية مشفرة — ${clinicAr}`,
        `👨‍⚕️ الطبيب: ${doctorAr}`,
        `📌 السبب: ${triggerReason.slice(0, 120)}`,
        `🕒 التاريخ والتوقيت: ${formattedTime}`,
        `━━━━━━━━━━━━━━`,
        `📄 إجمالي السندات: ${receiptsList.length} سند`,
        `📦 أصناف المخزون: ${inventoryList.length} صنف`,
        `💸 سجلات المصروفات: ${expensesList.length} سجل`,
        `━━━━━━━━━━━━━━`,
        `✅ إجمالي المقبوضات: ${totalPaid.toLocaleString()} ${defaultCurrency}`,
        `⚠️ إجمالي الديون المتبقية: ${totalRemaining.toLocaleString()} ${defaultCurrency}`,
      ]
        .join('\n')
        .slice(0, 1020);

      const jsonContent = JSON.stringify(backupPayload, null, 2);
      const formData = new FormData();
      formData.append('chat_id', chatId);
      formData.append('caption', caption);
      const fileBlob = new Blob([jsonContent], { type: 'application/json' });
      formData.append('document', fileBlob, fileName);

      const tgResponse = await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, {
        method: 'POST',
        body: formData,
      });

      const tgJson = (await tgResponse.json().catch(() => ({}))) as {
        ok?: boolean;
        description?: string;
        result?: { message_id?: number };
      };

      if (!tgResponse.ok || !tgJson.ok) {
        const desc = String(tgJson.description || '').toLowerCase();
        let arabicError = 'تعذر إرسال النسخة الاحتياطية إلى تليجرام. تحقق من إعدادات البوت.';
        if (desc.includes('unauthorized') || tgResponse.status === 401) {
          arabicError = 'رمز بوت تليجرام (Bot Token) غير صحيح أو غير مفعل.';
        } else if (desc.includes('chat not found') || desc.includes('bad request')) {
          arabicError =
            'معرّف المحادثة (Chat ID) غير صحيح، أو لم تقم بالضغط على Start داخل محادثة البوت في تليجرام.';
        }
        return res.status(400).json({
          ok: false,
          error: arabicError,
        });
      }

      return res.status(200).json({
        ok: true,
        messageId: tgJson.result?.message_id || Date.now(),
        sentAt: now.toISOString(),
      });
    }

    // Rate-limit AI endpoints
    if (!checkRateLimit(`api:${clientIp}`, 60, 60_000)) {
      return res.status(429).json({
        ok: false,
        error: 'تم تجاوز الحد المسموح للطلبات في الدقيقة.',
      });
    }

    // 2. Parse Receipt Endpoint
    if (url.includes('/parse-receipt')) {
      const { text, availableServices = [], defaultCurrency = 'ريال يمني' } = body;
      if (!text || typeof text !== 'string' || !text.trim()) {
        return res.status(400).json({ error: 'يرجى إدخال نص السند للتحليل.' });
      }
      const cleanText = text.trim().slice(0, 2000);

      const clients = getGenAIClientsPool();
      if (clients.length === 0) {
        const fallbackResult = parseReceiptHeuristicServer(
          cleanText,
          availableServices,
          defaultCurrency
        );
        return res.status(200).json({
          result: fallbackResult,
          mode: 'local',
          model: 'local-clinical-engine',
          modelLabel: MODEL_LABELS['local-clinical-engine'],
        });
      }

      const serviceNames = Array.isArray(availableServices)
        ? availableServices
            .slice(0, 50)
            .map((s: { name?: string; price?: number }) => `${s.name} (${s.price || 0})`)
            .join('، ')
        : '';

      try {
        const { response, modelName, modelLabel } = await generateWithMultiModelLoadBalancer(
          clients,
          {
            contents: `حلل النص الطبي والمحاسبي التالي واستخرج بيانات سند القبض لعيادة الأسنان بدقة عالية:
النص المدخل: "${cleanText}"
الخدمات المعتمدة في العيادة وأسعارها الافتراضية: ${serviceNames || 'كشف ومعاينة، حشوات وتجميل، علاج عصب وجذور، خلع وجراحة، تنظيف وتجليح لثة، تركيبات أسنان، تقويم أسنان، أشعة تشخيصية'}
العملة الافتراضية: ${String(defaultCurrency).slice(0, 40)}`,
            config: {
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  patientName: { type: Type.STRING },
                  patientPhone: { type: Type.STRING },
                  services: { type: Type.ARRAY, items: { type: Type.STRING } },
                  toothFDI: { type: Type.STRING },
                  totalAmount: { type: Type.NUMBER },
                  paidAmount: { type: Type.NUMBER },
                  currency: { type: Type.STRING },
                  paymentMethod: { type: Type.STRING },
                  notes: { type: Type.STRING },
                },
                required: ['patientName', 'services', 'totalAmount', 'paidAmount', 'currency'],
              },
            },
          }
        );

        const rawJson = (response.text ?? '{}').trim();
        const parsed = JSON.parse(rawJson);
        return res.status(200).json({ result: parsed, model: modelName, modelLabel });
      } catch {
        const fallbackResult = parseReceiptHeuristicServer(
          cleanText,
          availableServices,
          defaultCurrency
        );
        return res.status(200).json({
          result: fallbackResult,
          mode: 'local',
          model: 'local-clinical-engine',
          modelLabel: MODEL_LABELS['local-clinical-engine'],
        });
      }
    }

    // 3. Assistant / Reports Endpoint
    if (url.includes('/assistant')) {
      const {
        prompt,
        clinicContext,
        history = [],
        attachment = null,
        taskType = 'chat',
      } = body;

      if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
        return res.status(400).json({ error: 'الرسالة مطلوبة.' });
      }
      const cleanPrompt = prompt.trim().slice(0, 4000);

      const clients = getGenAIClientsPool();
      if (clients.length === 0) {
        const localReply = buildLocalIntelligentReply(cleanPrompt, clinicContext);
        return res.status(200).json({
          reply: localReply,
          model: 'local-clinical-engine',
          modelLabel: MODEL_LABELS['local-clinical-engine'],
        });
      }

      const systemBaselineResult = buildLocalIntelligentReply(cleanPrompt, clinicContext);
      const cleanContext = buildTargetedClinicContext(
        cleanPrompt,
        clinicContext,
        Boolean(attachment),
        taskType
      );
      const identity = (cleanContext.identity || {}) as {
        clinicAr?: string;
        doctorAr?: string;
      };
      const clinicName = identity.clinicAr || 'عيادة طب وجراحة الفم والأسنان';
      const doctorName = identity.doctorAr || 'الطبيب المعالج';

      const systemInstruction = `أنت "DOCAI Gemini" — المستشار والمدير التنفيذي الطبي والمالي الذكي المدمج في نظام إدارة "${clinicName}" (${doctorName}).

=======================================================
المبدأ المعماري المعتمد (Hybrid Intelligence Architecture):
1. دور النظام المدمج (Built-in Deterministic Engine):
   - النظام المدمج هو المرجع المحاسبي والرياضي القطعي الذي يتولى حساب الأرقام والحقائق بدقة 100% (السندات، مبالغ الديون وأسماء المدينين، كميات النواقص وتكاليفها، الإيرادات والمصروفات وصافي الربح).
   - "نتيجة النظام المدمج المحسوبة بدقة" المرفقة أدناه هي الأساس والواقع المعتمد قطعياً.

2. دور نموذج الذكاء الاصطناعي السحابي (Your Role as Gemini):
   - اقرأ نتيجة النظام المدمج واعتمد أرقامها وحقائقها بدقة كأساس للجواب دون تحريف.
   - القاعدة الذهبية: أجب بدقة على قدر السؤال تماماً وبشكل مناسب ومباشر، بدون أي مقدمات أو حشو أو شرح غير ضروري أو كلام زائد.
   - إذا سأل المستخدم عن رقم أو مريض أو صنف أو إحصائية معينة، اذكر الجواب الصريح والموجز فوراً.
   - لا تضف أي مقترحات أو شروحات إضافية إلا إذا طلب المستخدم صراحة "اقتراحات" أو "توصيات" أو "ماذا تنصحني؟" أو "تقرير شامل".
   - تجنب المجاملات الإنشائية الطويلة (مثل "مرحباً دكتور، يسعدني مساعدتك..."). ادخل في صلب الجواب مباشرة.
   - للاستشارات الطبية والدوائية: قدم البروتوكول والجرعة المعتمدة بدقة في نقاط محددة وموجزة.
=======================================================

نتيجة النظام المدمج المحسوبة بدقة (System Computed Baseline):
${systemBaselineResult}

سياق بيانات العيادة المرتبطة بالطلب (JSON):
${JSON.stringify(cleanContext)}`;

      const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];
      let hasAttachment = false;

      if (attachment && attachment.base64Data && attachment.mimeType) {
        const rawBase64 = String(attachment.base64Data);
        if (rawBase64.length <= 5_000_000) {
          const cleanBase64 = rawBase64.includes(',')
            ? rawBase64.slice(rawBase64.indexOf(',') + 1)
            : rawBase64;

          parts.push({
            inlineData: {
              mimeType: String(attachment.mimeType).slice(0, 64),
              data: cleanBase64,
            },
          });
          hasAttachment = true;
        }
      }

      const historyText =
        Array.isArray(history) && history.length > 0
          ? 'سجل المحادثة السابق:\n' +
            history
              .slice(-6)
              .map(
                (m: { role: string; text: string }) =>
                  `${m.role === 'user' ? 'المستخدم' : 'المساعد'}: ${String(m.text || '').slice(0, 1000)}`
              )
              .join('\n') +
            '\n\n'
          : '';

      parts.push({
        text: `${historyText}الطلب الحالي (${String(taskType).slice(0, 20)}):\n${cleanPrompt}`,
      });

      try {
        const { response, modelName, modelLabel } = await generateWithMultiModelLoadBalancer(
          clients,
          {
            contents: { parts },
            config: {
              systemInstruction,
            },
            hasAttachment,
          }
        );

        return res.status(200).json({
          reply: response.text || buildLocalIntelligentReply(cleanPrompt, clinicContext),
          model: modelName,
          modelLabel,
        });
      } catch {
        const localReply = buildLocalIntelligentReply(cleanPrompt, clinicContext);
        return res.status(200).json({
          reply: localReply,
          model: 'local-clinical-engine',
          modelLabel: MODEL_LABELS['local-clinical-engine'],
        });
      }
    }

    return res.status(404).json({ ok: false, error: 'المسار غير موجود.' });
  } catch {
    return res.status(500).json({
      ok: false,
      error: 'حدث خطأ داخلي في الخادم.',
    });
  }
}
