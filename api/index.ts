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

const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'active-branch-w83d0';
let firebaseJwksCache: { keys: any[]; expiresAt: number } | null = null;

async function verifyFirebaseIdToken(idToken: string): Promise<{ uid: string; email?: string } | null> {
  try {
    const parts = String(idToken || '').split('.');
    if (parts.length !== 3) return null;
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (
      header.alg !== 'RS256' ||
      typeof header.kid !== 'string' ||
      claims.aud !== FIREBASE_PROJECT_ID ||
      claims.iss !== `https://securetoken.google.com/${FIREBASE_PROJECT_ID}` ||
      typeof claims.sub !== 'string' ||
      claims.sub.length < 1 ||
      claims.sub.length > 128 ||
      typeof claims.exp !== 'number' ||
      claims.exp <= Math.floor(Date.now() / 1000) ||
      typeof claims.iat !== 'number' ||
      claims.iat > Math.floor(Date.now() / 1000) + 60
    ) return null;

    if (!firebaseJwksCache || firebaseJwksCache.expiresAt <= Date.now()) {
      const response = await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com');
      if (!response.ok) return null;
      const body = await response.json() as { keys?: any[] };
      if (!Array.isArray(body.keys)) return null;
      firebaseJwksCache = { keys: body.keys, expiresAt: Date.now() + 50 * 60 * 1000 };
    }
    const jwk = firebaseJwksCache.keys.find((key) => key.kid === header.kid);
    if (!jwk) return null;
    const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
    const valid = crypto.verify(
      'RSA-SHA256',
      Buffer.from(`${parts[0]}.${parts[1]}`),
      publicKey,
      Buffer.from(parts[2], 'base64url')
    );
    if (!valid) return null;
    return { uid: claims.sub, email: typeof claims.email === 'string' ? claims.email : undefined };
  } catch {
    return null;
  }
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

function getGenAIClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !apiKey.trim()) return null;
  return new GoogleGenAI({
    apiKey: apiKey.trim(),
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
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

async function generateWithFastFallback(
  ai: GoogleGenAI,
  payload: {
    contents: unknown;
    config?: Record<string, unknown>;
  }
) {
  const candidateModels = ['gemini-2.5-flash', 'gemini-2.0-flash'];
  let lastErr: unknown = null;

  for (const modelName of candidateModels) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: payload.contents as string,
        config: {
          ...payload.config,
        },
      });
      return { response, modelName };
    } catch (err) {
      lastErr = err;
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

  if (p.includes('ديون') || p.includes('مديون') || p.includes('متبقي') || p.includes('آجل')) {
    const debtors = Array.isArray(ctx.pendingDebtsPatients) ? ctx.pendingDebtsPatients : [];
    if (debtors.length === 0) {
      return `✅ لا توجد أي ديون متبقية على المرضى حالياً في سجلات العيادة.\nجميع السندات المسجلة مسددة بالكامل.`;
    }
    const totalDebt = debtors.reduce((s, d) => s + (Number(d.remainingAmount) || 0), 0);
    const lines = debtors.map(
      (d, idx) =>
        `${idx + 1}. ${d.patientName || 'مريض'} — سند #${d.receiptNo || '—'} (${d.date || ''})\n   • المتبقي: ${Number(d.remainingAmount || 0).toLocaleString()} ${d.currency || defaultCurr}${d.phone ? ` | هاتف: ${d.phone}` : ''}`
    );
    return `📋 كشف ديون المرضى بالتفصيل (${debtors.length} حالة آجلة):\n\n${lines.join('\n\n')}\n\n💰 إجمالي الديون المتبقية: ${totalDebt.toLocaleString()} ${defaultCurr}\n💡 التوصية: متابعة تحصيل المبالغ الآجلة عبر إشعارات واتساب من قسم "سجل السندات".`;
  }

  if (p.includes('مخزون') || p.includes('نواقص') || p.includes('جرد') || p.includes('أصناف')) {
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

    if (lowList.length === 0) {
      return `📦 تقرير حالة المخزون الطبي:\n• إجمالي الأصناف المسجلة: ${allItems.length} صنف\n• القيمة الإجمالية للمخزون: ${totalVal.toLocaleString()} ${defaultCurr}\n• النواقص الحالية: 0 (جميع المواد متوفرة فوق الحد الأدنى ✅).`;
    }

    const lowLines = lowList.map((item, idx) => {
      const needed = Math.max(5, (Number(item.minQty) || 5) * 2 - (Number(item.qty) || 0));
      const estCost = needed * (Number(item.unitPrice) || 0);
      return `${idx + 1}. ${item.name}: المتبقي (${item.qty} ${item.unit || ''}) | الحد الأدنى (${item.minQty} ${item.unit || ''}) — يُنصح بطلب ${needed} ${item.unit || ''} (بتكلفة تقديرية ${estCost.toLocaleString()} ${defaultCurr})`;
    });

    return `⚠️ تقرير نواقص وجرد المخزون الطبي:\n• إجمالي الأصناف: ${allItems.length} صنف (بقيمة ${totalVal.toLocaleString()} ${defaultCurr})\n• أصناف وصلت لحد النقص (${lowList.length}):\n\n${lowLines.join('\n')}\n\n💡 التوصية: سرعة تزويد الأصناف الحرجة لضمان استمرارية الجلسات العلاجية دون توقف.`;
  }

  if (
    p.includes('أرباح') ||
    p.includes('ارباح') ||
    p.includes('مصروفات') ||
    p.includes('مالي') ||
    p.includes('إيراد') ||
    p.includes('تقرير')
  ) {
    if (Array.isArray(ctx.currencySummaries) && ctx.currencySummaries.length > 0) {
      const blocks = ctx.currencySummaries.map((c) => {
        const rate =
          (c.totalBilledAmount || 0) > 0
            ? Math.round(((c.totalCollectedRevenue || 0) / (c.totalBilledAmount || 1)) * 100)
            : 100;
        return `💵 عملة (${c.currency}):\n• إجمالي المفوتر: ${Number(c.totalBilledAmount || 0).toLocaleString()} (${c.receiptsCount || 0} سند)\n• الإيراد المقبوض نقداً: ${Number(c.totalCollectedRevenue || 0).toLocaleString()} (نسبة التحصيل: ${rate}%)\n• الديون الآجلة: ${Number(c.totalPendingDebts || 0).toLocaleString()} (${c.debtorsCount || 0} حالة)\n• المصروفات: ${Number(c.totalExpenses || 0).toLocaleString()}\n• صافي الربح النقدي: ${Number(c.netCashProfit || 0).toLocaleString()} ${c.currency}`;
      });
      return `📊 التقرير المالي التنفيذي للعيادة:\n\n${blocks.join('\n\n')}`;
    }

    const fin = ctx.financialSummary || {};
    const billed = Number(fin.totalBilled || 0);
    const collected = Number(fin.totalCollected || 0);
    const debts = Number(fin.totalPendingDebts || 0);
    const expenses = Number(fin.totalExpenses || 0);
    const net = collected - expenses;
    const rate = billed > 0 ? Math.round((collected / billed) * 100) : 100;

    return `📊 ملخص الأداء المالي وصافي الأرباح:\n• عدد السندات المصدرة: ${fin.totalReceipts || 0} سند\n• إجمالي قيمة العلاج المفوتر: ${billed.toLocaleString()} ${defaultCurr}\n• الإيراد المقبوض فعلياً: ${collected.toLocaleString()} ${defaultCurr} (نسبة التحصيل ${rate}%)\n• إجمالي ديون المرضى: ${debts.toLocaleString()} ${defaultCurr}\n• إجمالي المصروفات التشغيلية: ${expenses.toLocaleString()} ${defaultCurr}\n• صافي الربح النقدي: ${net.toLocaleString()} ${defaultCurr}`;
  }

  if (p.includes('خلع') || p.includes('ضرس') || p.includes('جراح')) {
    return `🦷 تعليمات طبية للمريض بعد خلع الضرس:\n1. العضّ جيداً على قطعة الشاش المعقم لمدة 45 إلى 60 دقيقة لوقف النزيف وتكوين الخثرة الدموية.\n2. تجنب المضمضة القوية أو البصق أو استخدام المصاصة خلال أول 24 ساعة.\n3. الامتناع التام عن التدخين والمشروبات الساخنة في اليوم الأول.\n4. تناول أطعمة لينة وباردة أو فاترة.\n5. الالتزام بالمسكنات والمضاد الحيوي الموصوف من الدكتور صلاح الدين السعيدي في مواعيدها.`;
  }

  if (p.includes('عصب') || p.includes('جذور') || p.includes('16') || p.includes('سن')) {
    return `🦷 البروتوكول الإكلينيكي وخطة علاج العصب (Root Canal Therapy):\n1. التشخيص والأشعة: أخذ صورة أشعة ذروية (Periapical X-Ray).\n2. التخدير والعزل: إعطاء التخدير الموضعي وعزل السن وفتح حجرة اللب.\n3. استئصال اللب وتحديد الطول العامل عبر جهاز Apex Locator.\n4. التنظيف والتشكيل بالمبارد الدوارة (Rotary Files) مع الإرواء بمحلول NaOCl.\n5. الحشو النهائي بأقماع Gutta-Percha مع Sealer ووضع التعويض النهائي.`;
  }

  const fin = ctx.financialSummary || {};
  return `مرحباً بك في المساعد الطبي والمالي الذكي (${ctx.identity?.clinicAr || 'عيادة السعيدي'}):\n\n📌 ملخص السجلات الحالية:\n• إجمالي السندات: ${fin.totalReceipts || 0} سند\n• الإيرادات المقبوضة: ${Number(fin.totalCollected || 0).toLocaleString()} ${defaultCurr}\n• الديون المتبقية: ${Number(fin.totalPendingDebts || 0).toLocaleString()} ${defaultCurr}\n• المصروفات: ${Number(fin.totalExpenses || 0).toLocaleString()} ${defaultCurr}`;
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
    // 1. Issue a server session only after cryptographically verifying a Firebase ID token.
    if (url.includes('/auth/session')) {
      if (!checkRateLimit(`auth:${clientIp}`, 20, 60_000)) {
        return res.status(429).json({
          ok: false,
          error: 'محاولات كثيرة جداً. يرجى الانتظار دقيقة قبل المحاولة مرة أخرى.',
        });
      }

      const verifiedUser = await verifyFirebaseIdToken(String(body.idToken || ''));
      if (!verifiedUser) {
        return res.status(401).json({
          ok: false,
          error: 'تعذر التحقق من هوية Firebase. يرجى تسجيل الدخول مجدداً.',
        });
      }

      const clinicId = normalizeServerlessClinicId(body.clinicId || verifiedUser.uid);
      const { sessionToken, expiresAt } = createSignedSessionToken(clinicId, verifiedUser.uid);
      return res.status(200).json({
        ok: true,
        clinicId,
        ownerUid: verifiedUser.uid,
        sessionToken,
        expiresAt,
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

    // Authenticate & Authorize all sensitive AI endpoints
    if (!checkRateLimit(`api:${clientIp}`, 40, 60_000)) {
      return res.status(429).json({
        ok: false,
        error: 'تم تجاوز الحد المسموح للطلبات في الدقيقة.',
      });
    }

    const authHeader = String(req.headers?.authorization || '').trim();
    const bearerToken = authHeader.toLowerCase().startsWith('bearer ')
      ? authHeader.slice(7).trim()
      : '';
    const sessionHeader = String(req.headers?.['x-clinic-session'] || '').trim();
    const rawToken = bearerToken || sessionHeader;

    const verifiedSession = rawToken ? verifySignedSessionToken(rawToken) : null;
    if (!verifiedSession) {
      return res.status(401).json({
        ok: false,
        error: 'غير مصرح بالوصول. يرجى تسجيل الدخول إلى حساب العيادة.',
      });
    }

    const headerClinicId = String(req.headers?.['x-clinic-id'] || '').trim();
    if (
      headerClinicId &&
      normalizeServerlessClinicId(headerClinicId) !== verifiedSession.clinicId
    ) {
      return res.status(403).json({
        ok: false,
        error: 'رفض الوصول: لا تملك صلاحية الوصول إلى بيانات عيادة أخرى.',
      });
    }

    const headerOwnerUid = String(req.headers?.['x-clinic-owner'] || '').trim();
    if (headerOwnerUid && headerOwnerUid !== verifiedSession.ownerUid) {
      return res.status(403).json({
        ok: false,
        error: 'رفض الوصول: عدم تطابق ملكية حساب العيادة.',
      });
    }

    // 2. Parse Receipt Endpoint
    if (url.includes('/parse-receipt')) {
      const { text, availableServices = [], defaultCurrency = 'ريال يمني' } = body;
      if (!text || typeof text !== 'string' || !text.trim()) {
        return res.status(400).json({ error: 'يرجى إدخال نص السند للتحليل.' });
      }
      const cleanText = text.trim().slice(0, 2000);

      const ai = getGenAIClient();
      if (!ai) {
        const fallbackResult = parseReceiptHeuristicServer(
          cleanText,
          availableServices,
          defaultCurrency
        );
        return res.status(200).json({ result: fallbackResult, mode: 'local' });
      }

      const serviceNames = Array.isArray(availableServices)
        ? availableServices
            .slice(0, 50)
            .map((s: { name?: string; price?: number }) => `${s.name} (${s.price || 0})`)
            .join('، ')
        : '';

      try {
        const { response } = await generateWithFastFallback(ai, {
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
        });

        const rawJson = (response.text ?? '{}').trim();
        const parsed = JSON.parse(rawJson);
        return res.status(200).json({ result: parsed });
      } catch {
        const fallbackResult = parseReceiptHeuristicServer(
          cleanText,
          availableServices,
          defaultCurrency
        );
        return res.status(200).json({ result: fallbackResult, mode: 'local' });
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

      const ai = getGenAIClient();
      if (!ai) {
        const localReply = buildLocalIntelligentReply(cleanPrompt, clinicContext);
        return res.status(200).json({
          reply: localReply,
          model: 'local-clinical-engine',
        });
      }

      const cleanContext = sanitizeClinicContextForPrompt(clinicContext);
      const systemInstruction = `أنت "DOCAI Gemini" — المساعد الطبي والمالي الذكي المدمج في نظام إدارة عيادة السعيدي لطب وجراحة الفم والأسنان (د. صلاح الدين السعيدي).
تتحدث بلغة عربية احترافية، واضحة، سريعة، ودقيقة، وتعتمد حصرياً على البيانات الحقيقية للعيادة المرفقة في السياق أدناه عند الإجابة عن المرضى، السندات، الديون، المخزون، والمصروفات.
لا تخترع أرقاماً غير موجودة في السياق، وقدم إجابات منظمة ومباشرة للطبيب أو المحاسب.
عند تحليل صورة أشعة سنية أو تقرير طبي أو فاتورة مرفقة، قدم قراءة إكلينيكية/تشخيصية أولية منظمة ومفصلة مع تذكير مهني بأن القرار النهائي يعود للفحص السريري المباشر للطبيب المعالج.

سياق قاعدة بيانات العيادة الحالية (JSON):
${JSON.stringify(cleanContext)}`;

      const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];

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
        const { response, modelName } = await generateWithFastFallback(ai, {
          contents: { parts },
          config: {
            systemInstruction,
          },
        });

        return res.status(200).json({
          reply: response.text || buildLocalIntelligentReply(cleanPrompt, clinicContext),
          model: modelName,
        });
      } catch {
        const localReply = buildLocalIntelligentReply(cleanPrompt, clinicContext);
        return res.status(200).json({
          reply: localReply,
          model: 'local-clinical-engine',
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
