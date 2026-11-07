import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';
import { generateLocalClinicalResponse } from './src/utils/aiClient';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Strict payload size limit (1MB max) to prevent DoS and oversized payloads
app.use(express.json({ limit: '1mb' }));

// Security response headers
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// ==================== CRYPTOGRAPHIC PASSWORD HASHING (scrypt) & SESSION TOKENS ====================
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const SERVER_HMAC_SECRET =
  process.env.SESSION_SECRET ||
  crypto
    .createHash('sha256')
    .update(`alssaedic-erp-secret-${process.env.GEMINI_API_KEY || 'local-runtime-key'}`)
    .digest('hex');

export function hashPasswordScrypt(password: string, existingSaltHex?: string): string {
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

export function verifyPasswordScrypt(password: string, storedHash: string): boolean {
  try {
    const parts = String(storedHash || '').split('$');
    if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
    const [, saltHex, keyHex] = parts;
    const expectedBuf = Buffer.from(keyHex, 'hex');
    const actualDerived = crypto.scryptSync(String(password || '').trim(), Buffer.from(saltHex, 'hex'), 64, {
      N: 16384,
      r: 8,
      p: 1,
    });
    if (expectedBuf.length !== actualDerived.length) return false;
    return crypto.timingSafeEqual(expectedBuf, actualDerived);
  } catch {
    return false;
  }
}

export interface SignedSessionPayload {
  clinicId: string;
  ownerUid: string;
  iat: number;
  exp: number;
}

export function createSignedSessionToken(clinicId: string, ownerUid: string): {
  sessionToken: string;
  expiresAt: string;
} {
  const now = Date.now();
  const exp = now + SESSION_TTL_MS;
  const payload: SignedSessionPayload = {
    clinicId: normalizeClinicId(clinicId),
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

export function verifySignedSessionToken(token: string): SignedSessionPayload | null {
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

function normalizeClinicId(raw: string): string {
  const cleaned = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);
  return cleaned.length >= 3 ? cleaned : `clinic-${cleaned || 'default'}`;
}

// ==================== SLIDING-WINDOW RATE LIMITER ====================
interface RateBucket {
  timestamps: number[];
}

const rateBuckets = new Map<string, RateBucket>();

function checkRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(key) || { timestamps: [] };
  bucket.timestamps = bucket.timestamps.filter((t) => now - t < windowMs);
  if (bucket.timestamps.length >= maxRequests) {
    rateBuckets.set(key, bucket);
    return false;
  }
  bucket.timestamps.push(now);
  rateBuckets.set(key, bucket);
  return true;
}

function getClientIdentifier(req: Request): string {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.ip || 'unknown-ip';
}

// ==================== AUTHENTICATION & CLINIC OWNERSHIP MIDDLEWARE ====================
function requireAuthenticatedClinic(req: Request, res: Response, next: NextFunction): void {
  const clientIp = getClientIdentifier(req);
  if (!checkRateLimit(`api:${clientIp}`, 40, 60_000)) {
    res.status(429).json({
      ok: false,
      error: 'تم تجاوز الحد المسموح للطلبات في الدقيقة. يرجى الانتظار قليلاً والمحاولة مجدداً.',
    });
    return;
  }

  const authHeader = String(req.headers.authorization || '').trim();
  const bearerToken = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : '';
  const sessionHeader = String(req.headers['x-clinic-session'] || '').trim();
  const rawToken = bearerToken || sessionHeader;

  if (!rawToken) {
    res.status(401).json({
      ok: false,
      error: 'غير مصرح بالوصول. يرجى تسجيل الدخول إلى حساب العيادة أولاً.',
    });
    return;
  }

  const verifiedSession = verifySignedSessionToken(rawToken);
  if (!verifiedSession) {
    res.status(401).json({
      ok: false,
      error: 'انتهت صلاحية الجلسة الأمنية أو أن الرمز غير صالح. يرجى إعادة تسجيل الدخول.',
    });
    return;
  }

  const headerClinicId = String(req.headers['x-clinic-id'] || '').trim();
  if (headerClinicId && normalizeClinicId(headerClinicId) !== verifiedSession.clinicId) {
    res.status(403).json({
      ok: false,
      error: 'رفض الوصول: لا تملك صلاحية الوصول إلى بيانات عيادة أخرى.',
    });
    return;
  }

  const headerOwnerUid = String(req.headers['x-clinic-owner'] || '').trim();
  if (headerOwnerUid && headerOwnerUid !== verifiedSession.ownerUid) {
    res.status(403).json({
      ok: false,
      error: 'رفض الوصول: عدم تطابق ملكية حساب العيادة.',
    });
    return;
  }

  (req as Request & { clinicSession?: SignedSessionPayload }).clinicSession = verifiedSession;
  next();
}

// ==================== SESSION ISSUANCE & PASSWORD VERIFICATION ENDPOINT ====================
app.post('/api/auth/session', (req: Request, res: Response) => {
  const clientIp = getClientIdentifier(req);
  if (!checkRateLimit(`auth:${clientIp}`, 20, 60_000)) {
    res.status(429).json({
      ok: false,
      error: 'محاولات كثيرة جداً. يرجى الانتظار دقيقة قبل المحاولة مرة أخرى.',
    });
    return;
  }

  try {
    const { clinicId: rawClinicId, ownerUid: rawOwnerUid, password, storedPasswordVerifier } =
      req.body || {};

    const clinicId = normalizeClinicId(rawClinicId || 'default-clinic');
    const ownerUid = String(rawOwnerUid || '')
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 128);

    if (!ownerUid || ownerUid.length < 3) {
      res.status(400).json({
        ok: false,
        error: 'معرّف ملكية الحساب (ownerUid) غير صالح.',
      });
      return;
    }

    let passwordVerifier: string | undefined;
    if (password && typeof password === 'string' && password.trim().length >= 4) {
      if (storedPasswordVerifier && typeof storedPasswordVerifier === 'string') {
        const isValid = verifyPasswordScrypt(password, storedPasswordVerifier);
        if (!isValid) {
          res.status(401).json({
            ok: false,
            error: 'كلمة المرور غير صحيحة لهذا الحساب.',
          });
          return;
        }
        passwordVerifier = storedPasswordVerifier;
      } else {
        passwordVerifier = hashPasswordScrypt(password);
      }
    }

    const { sessionToken, expiresAt } = createSignedSessionToken(clinicId, ownerUid);
    res.json({
      ok: true,
      clinicId,
      ownerUid,
      sessionToken,
      expiresAt,
      passwordVerifier,
    });
  } catch {
    res.status(500).json({
      ok: false,
      error: 'تعذر إنشاء جلسة الأمان.',
    });
  }
});

// Reject legacy unverified file-based cloud endpoints so /tmp or local files are never used as fake cloud storage
app.post('/api/cloud/:action', (_req: Request, res: Response) => {
  res.status(410).json({
    ok: false,
    error:
      'تم إيقاف التخزين المؤقت غير الآمن. يتم الحفظ والمزامنة حصرياً عبر قاعدة بيانات Firebase Firestore الموثقة.',
  });
});

// ==================== MULTI-MODEL LOAD BALANCER & SMART FAILOVER ENGINE ====================
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

  // Rotate starting model for balanced quota consumption across all models
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

function rateLimitAiEndpoint(req: Request, res: Response, next: NextFunction): void {
  const clientIp = getClientIdentifier(req);
  if (!checkRateLimit(`ai:${clientIp}`, 60, 60_000)) {
    res.status(429).json({
      ok: false,
      error: 'تم تجاوز الحد المسموح للطلبات في الدقيقة. يرجى الانتظار قليلاً والمحاولة مجدداً.',
    });
    return;
  }
  next();
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
    paymentMethod:
      raw.includes('تحويل') || raw.includes('محفظة') ? 'تحويل بنكي / محفظة' : 'نقداً (Cash)',
    notes: '',
  };
}

// 1. Smart Receipt Natural Language Parser (Multi-Model Load Balanced)
app.post(
  '/api/gemini/parse-receipt',
  rateLimitAiEndpoint,
  async (req: Request, res: Response) => {
    const { text, availableServices = [], defaultCurrency = 'ريال يمني' } = req.body || {};
    if (!text || typeof text !== 'string' || !text.trim()) {
      res.status(400).json({ error: 'يرجى إدخال نص السند للتحليل.' });
      return;
    }
    const cleanText = text.trim().slice(0, 2000);

    try {
      const clients = getGenAIClientsPool();
      if (clients.length === 0) {
        res.json({
          result: parseReceiptHeuristicServer(cleanText, availableServices, defaultCurrency),
          model: 'local-clinical-engine',
          modelLabel: MODEL_LABELS['local-clinical-engine'],
        });
        return;
      }

      const serviceNames = Array.isArray(availableServices)
        ? availableServices
            .slice(0, 50)
            .map((s: { name?: string; price?: number }) => `${s.name} (${s.price || 0})`)
            .join('، ')
        : '';

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
                patientName: { type: Type.STRING, description: 'اسم المريض' },
                patientPhone: { type: Type.STRING, description: 'رقم هاتف المريض إن وجد' },
                services: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: 'قائمة الخدمات العلاجية المستخرجة',
                },
                toothFDI: { type: Type.STRING, description: 'أرقام الأسنان بنظام FDI مثل 14, 21' },
                totalAmount: { type: Type.NUMBER, description: 'إجمالي المبلغ' },
                paidAmount: { type: Type.NUMBER, description: 'المبلغ المدفوع' },
                currency: { type: Type.STRING, description: 'العملة' },
                paymentMethod: { type: Type.STRING, description: 'طريقة الدفع' },
                notes: { type: Type.STRING, description: 'ملاحظات إضافية حول الجلسة العلاجية' },
              },
              required: ['patientName', 'services', 'totalAmount', 'paidAmount', 'currency'],
            },
          },
        }
      );

      const rawJson = (response.text ?? '{}').trim();
      const parsed = JSON.parse(rawJson);
      res.json({ result: parsed, model: modelName, modelLabel });
    } catch {
      res.json({
        result: parseReceiptHeuristicServer(cleanText, availableServices, defaultCurrency),
        model: 'local-clinical-engine',
        modelLabel: MODEL_LABELS['local-clinical-engine'],
      });
    }
  }
);

// 2. Context-Aware Clinic Assistant (Multi-Model Load Balanced)
app.post(
  '/api/gemini/assistant',
  rateLimitAiEndpoint,
  async (req: Request, res: Response) => {
    const {
      prompt,
      clinicContext,
      history = [],
      attachment = null,
      taskType = 'chat',
    } = req.body || {};

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      res.status(400).json({ error: 'الرسالة مطلوبة.' });
      return;
    }
    const cleanPrompt = prompt.trim().slice(0, 4000);

    try {
      const clients = getGenAIClientsPool();
      if (clients.length === 0) {
        res.json({
          reply: generateLocalClinicalResponse(cleanPrompt, clinicContext),
          model: 'local-clinical-engine',
          modelLabel: MODEL_LABELS['local-clinical-engine'],
        });
        return;
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

      res.json({
        reply: response.text || generateLocalClinicalResponse(cleanPrompt, clinicContext),
        model: modelName,
        modelLabel,
      });
    } catch {
      res.json({
        reply: generateLocalClinicalResponse(cleanPrompt, clinicContext),
        model: 'local-clinical-engine',
        modelLabel: MODEL_LABELS['local-clinical-engine'],
      });
    }
  }
);

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`DOCAI Dental ERP Server running on http://localhost:${PORT}`);
  });
}

startServer();
