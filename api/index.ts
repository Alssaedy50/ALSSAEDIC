import crypto from 'crypto';
import { GoogleGenAI, Type } from '@google/genai';

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
  'gemini-3.8-flash': 'Gemini 3.8 Flash',
  'gemini-flash-latest': 'Gemini Flash Latest',
  'gemini-3.1-flash-lite': 'Gemini 3.1 Flash Lite',
  'gemini-2.5-flash': 'Gemini 2.5 Flash',
  'local-clinical-engine': 'المحرك السريري المدمج',
};

const TEXT_MODEL_POOL = [
  'gemini-3.8-flash',
  'gemini-flash-latest',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash',
] as const;

const VISION_MODEL_POOL = [
  'gemini-3.8-flash',
  'gemini-flash-latest',
  'gemini-2.5-flash',
  'gemini-3.1-flash-lite',
] as const;

const modelCooldownUntil = new Map<string, number>();
let roundRobinCounter = 0;

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

function sanitizeClinicContextForPrompt(ctx: Record<string, unknown> | null | undefined) {
  if (!ctx || typeof ctx !== 'object') return {};
  const clone: Record<string, unknown> = { ...ctx };

  if (Array.isArray(clone.recentReceipts)) {
    clone.recentReceipts = clone.recentReceipts.slice(0, 12).map((r: Record<string, unknown>) => ({
      receiptNo: r.receiptNo,
      date: r.date,
      patientName: r.patientName,
      patientPhone: r.patientPhone,
      services: r.services,
      toothFDI: r.toothFDI,
      totalAmount: r.totalAmount,
      paidAmount: r.paidAmount,
      remainingAmount: r.remainingAmount,
      currency: r.currency,
      paymentMethod: r.paymentMethod,
      notes: r.notes,
    }));
  }
  return clone;
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
  const startIdx = roundRobinCounter % basePool.length;
  roundRobinCounter = (roundRobinCounter + 1) % 10_000;

  const rotatedModels = [
    ...basePool.slice(startIdx),
    ...basePool.slice(0, startIdx),
  ];

  const now = Date.now();
  const healthyTargets: Array<{ client: GoogleGenAI; clientIdx: number; modelName: string }> = [];
  const cooldownTargets: Array<{ client: GoogleGenAI; clientIdx: number; modelName: string }> = [];

  clients.forEach((client, clientIdx) => {
    rotatedModels.forEach((modelName) => {
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
      const response = await target.client.models.generateContent({
        model: target.modelName,
        contents: payload.contents as string,
        config: {
          ...payload.config,
        },
      });
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
      const isQuotaOrTransient =
        errMsg.includes('429') ||
        errMsg.includes('resource_exhausted') ||
        errMsg.includes('quota') ||
        errMsg.includes('rate') ||
        errMsg.includes('503') ||
        errMsg.includes('overloaded');

      if (isNotFound) {
        modelCooldownUntil.set(slotKey, Date.now() + 10 * 60_000);
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

  const recList = Array.isArray(ctx.recentReceipts) ? ctx.recentReceipts : [];
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
    const allItems = Array.isArray(ctx.inventoryStatus)
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
  if (rawBodyStr.length > 1_000_000) {
    return res.status(413).json({
      ok: false,
      error: 'حجم الطلب يتجاوز الحد الأقصى المسموح به (1MB).',
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

      const cleanContext = sanitizeClinicContextForPrompt(clinicContext);
      const identity = (cleanContext.identity || {}) as {
        clinicAr?: string;
        doctorAr?: string;
      };
      const clinicName = identity.clinicAr || 'عيادة طب وجراحة الفم والأسنان';
      const doctorName = identity.doctorAr || 'الطبيب المعالج';

      const systemInstruction = `أنت "DOCAI Gemini" — المساعد الطبي والمالي الذكي المدمج في نظام إدارة "${clinicName}" (${doctorName}).
تتحدث بلغة عربية احترافية، واضحة، سريعة، ودقيقة:
1. عند السؤال عن بيانات العيادة (المرضى، السندات، الديون، المخزون، الإيرادات، والمصروفات): اعتمد حصرياً على البيانات الحقيقية المرفقة في سياق قاعدة بيانات العيادة أدناه ولا تخترع أرقاماً غير موجودة.
2. عند السؤال عن استشارات طب وجراحة الفم والأسنان (التشخيص، خطط العلاج، الأدوية والمضادات الحيوية، الجرعات، الجراحة، علاج العصب، التركيبات، التقويم، طب أسنان الأطفال، أو تعليمات ما بعد العلاج): قدم إجابة إكلينيكية علمية مفصلة ومنظمة تساعد طبيب الأسنان.
3. عند تحليل صورة أشعة سنية أو تقرير طبي أو فاتورة مرفقة: قدم قراءة إكلينيكية/تشخيصية أولية منظمة ومفصلة مع تذكير مهني بأن القرار النهائي يعود للفحص السريري المباشر للطبيب المعالج.

سياق قاعدة بيانات العيادة الحالية (JSON):
${JSON.stringify(cleanContext)}`;

      const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];
      let hasAttachment = false;

      if (attachment && attachment.base64Data && attachment.mimeType) {
        const rawBase64 = String(attachment.base64Data);
        if (rawBase64.length <= 800_000) {
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
