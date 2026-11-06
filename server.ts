import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';
import { generateLocalClinicalResponse } from './src/utils/aiClient';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '20mb' }));

// ==================== PERSISTENT CLOUD WORKSPACE STORAGE ====================
const CLOUD_STORE_PATH = path.join(__dirname, '.cloud_workspaces.json');

interface CloudWorkspaceRecord {
  clinicId: string;
  passwordHash: string;
  updatedAt: string;
  data: {
    settings?: unknown;
    receipts?: unknown[];
    inventory?: unknown[];
    expenses?: unknown[];
  };
}

function readCloudStore(): Record<string, CloudWorkspaceRecord> {
  try {
    if (fs.existsSync(CLOUD_STORE_PATH)) {
      const raw = fs.readFileSync(CLOUD_STORE_PATH, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('Error reading cloud store:', e);
  }
  return {};
}

function writeCloudStore(store: Record<string, CloudWorkspaceRecord>): void {
  try {
    fs.writeFileSync(CLOUD_STORE_PATH, JSON.stringify(store, null, 2), 'utf-8');
  } catch (e) {
    console.error('Error writing cloud store:', e);
  }
}

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(String(password).trim()).digest('hex');
}

function normalizeClinicId(raw: string): string {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_\-\u0600-\u06FF]/g, '')
    .slice(0, 64);
}

app.post('/api/cloud/auth', (req, res) => {
  try {
    const { clinicId: rawId, password, mode = 'auto', initialData } = req.body || {};
    const clinicId = normalizeClinicId(rawId);
    if (!clinicId || clinicId.length < 3) {
      res.status(400).json({
        ok: false,
        error: 'يرجى إدخال معرّف العيادة أو رقم الهاتف (3 أحرف أو أرقام على الأقل).',
      });
      return;
    }
    if (!password || String(password).trim().length < 4) {
      res.status(400).json({
        ok: false,
        error: 'يرجى إدخال كلمة مرور مكونة من 4 أحرف أو أرقام على الأقل.',
      });
      return;
    }

    const store = readCloudStore();
    const passHash = hashPassword(password);
    const existing = store[clinicId];

    if (!existing) {
      const newRecord: CloudWorkspaceRecord = {
        clinicId,
        passwordHash: passHash,
        updatedAt: new Date().toISOString(),
        data: initialData || {},
      };
      store[clinicId] = newRecord;
      writeCloudStore(store);
      res.json({
        ok: true,
        status: mode === 'login' ? 'authenticated' : 'created',
        clinicId,
        updatedAt: newRecord.updatedAt,
        data: newRecord.data,
      });
      return;
    }

    if (existing.passwordHash !== passHash) {
      res.status(401).json({
        ok: false,
        error:
          mode === 'register'
            ? 'معرّف العيادة هذا مسجل مسبقاً بكلمة مرور مختلفة. اختر "تسجيل الدخول" أو استخدم معرّفاً آخر.'
            : 'كلمة المرور غير صحيحة لهذا الحساب السحابي.',
      });
      return;
    }

    // If registering with same credentials and cloud record had empty data, update it with initialData
    if (
      mode === 'register' &&
      initialData &&
      (!existing.data || Object.keys(existing.data).length === 0)
    ) {
      existing.data = initialData;
      existing.updatedAt = new Date().toISOString();
      store[clinicId] = existing;
      writeCloudStore(store);
    }

    res.json({
      ok: true,
      status: 'authenticated',
      clinicId,
      updatedAt: existing.updatedAt,
      data: existing.data,
    });
  } catch {
    res.status(500).json({ ok: false, error: 'تعذر الاتصال بالخادم السحابي.' });
  }
});

app.post('/api/cloud/push', (req, res) => {
  try {
    const { clinicId: rawId, password, data } = req.body || {};
    const clinicId = normalizeClinicId(rawId);
    if (!clinicId || !password) {
      res.status(400).json({ ok: false, error: 'بيانات الحساب السحابي غير مكتملة.' });
      return;
    }

    const store = readCloudStore();
    const passHash = hashPassword(password);
    const existing = store[clinicId];

    if (existing && existing.passwordHash !== passHash) {
      res.status(401).json({ ok: false, error: 'كلمة المرور غير صحيحة.' });
      return;
    }

    const updatedAt = new Date().toISOString();
    store[clinicId] = {
      clinicId,
      passwordHash: passHash,
      updatedAt,
      data: data || {},
    };
    writeCloudStore(store);

    res.json({ ok: true, clinicId, updatedAt });
  } catch {
    res.status(500).json({ ok: false, error: 'تعذر حفظ البيانات في السحابة.' });
  }
});

app.post('/api/cloud/pull', (req, res) => {
  try {
    const { clinicId: rawId, password } = req.body || {};
    const clinicId = normalizeClinicId(rawId);
    if (!clinicId || !password) {
      res.status(400).json({ ok: false, error: 'بيانات الحساب السحابي غير مكتملة.' });
      return;
    }

    const store = readCloudStore();
    const passHash = hashPassword(password);
    const existing = store[clinicId];

    if (!existing) {
      res.status(404).json({ ok: false, error: 'لم يتم العثور على الحساب السحابي.' });
      return;
    }

    if (existing.passwordHash !== passHash) {
      res.status(401).json({ ok: false, error: 'كلمة المرور غير صحيحة.' });
      return;
    }

    res.json({
      ok: true,
      clinicId,
      updatedAt: existing.updatedAt,
      data: existing.data,
    });
  } catch {
    res.status(500).json({ ok: false, error: 'تعذر جلب البيانات من السحابة.' });
  }
});

// ==================== ULTRA-FAST GEMINI AI ENGINE ====================
function getGenAIClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Strips base64 images/signatures from clinicContext so the prompt stays tiny (~2KB) and fast
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

// Calls gemini-2.5-flash with automatic fallback to gemini-2.0-flash
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
    availableServices.forEach((srv) => {
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

  const totalAmount = totalMatch ? Number(totalMatch[1]) : calculatedPrice;
  const paidAmount = paidMatch ? Number(paidMatch[1]) : totalAmount;

  return {
    patientName: extractedName || 'مريض',
    patientPhone: extractedPhone,
    services: matchedServices,
    toothFDI,
    totalAmount,
    paidAmount,
    currency: defaultCurrency || 'ريال يمني',
    paymentMethod:
      raw.includes('تحويل') || raw.includes('محفظة') ? 'تحويل بنكي / محفظة' : 'نقداً (Cash)',
    notes: '',
  };
}

// 1. Smart Receipt Natural Language Parser (Fast ~1s Structured JSON)
app.post('/api/gemini/parse-receipt', async (req, res) => {
  const { text, availableServices = [], defaultCurrency = 'ريال يمني' } = req.body || {};
  if (!text || typeof text !== 'string' || !text.trim()) {
    res.status(400).json({ error: 'يرجى إدخال نص السند للتحليل.' });
    return;
  }

  try {
    const ai = getGenAIClient();
    if (!ai) {
      res.json({
        result: parseReceiptHeuristicServer(text.trim(), availableServices, defaultCurrency),
      });
      return;
    }

    const serviceNames = Array.isArray(availableServices)
      ? availableServices
          .map((s: { name?: string; price?: number }) => `${s.name} (${s.price || 0})`)
          .join('، ')
      : '';

    const { response } = await generateWithFastFallback(ai, {
      contents: `حلل النص الطبي والمحاسبي التالي واستخرج بيانات سند القبض لعيادة الأسنان بدقة عالية:
النص المدخل: "${text.trim()}"
الخدمات المعتمدة في العيادة وأسعارها الافتراضية: ${serviceNames || 'كشف ومعاينة، حشوات وتجميل، علاج عصب وجذور، خلع وجراحة، تنظيف وتجليح لثة، تركيبات أسنان، تقويم أسنان، أشعة تشخيصية'}
العملة الافتراضية: ${defaultCurrency}`,
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
    });

    const rawJson = (response.text ?? '{}').trim();
    const parsed = JSON.parse(rawJson);
    res.json({ result: parsed });
  } catch {
    res.json({
      result: parseReceiptHeuristicServer(text.trim(), availableServices, defaultCurrency),
    });
  }
});

// 2. Context-Aware Clinic Assistant, Vision (X-Ray / Prescription / Invoice) & Executive Reports
app.post('/api/gemini/assistant', async (req, res) => {
  const {
    prompt,
    clinicContext,
    history = [],
    attachment = null,
    taskType = 'chat',
  } = req.body || {};

  if (!prompt || typeof prompt !== 'string') {
    res.status(400).json({ error: 'الرسالة مطلوبة.' });
    return;
  }

  try {
    const ai = getGenAIClient();
    if (!ai) {
      res.json({
        reply: generateLocalClinicalResponse(prompt, clinicContext),
        model: 'local-clinical-engine',
      });
      return;
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
      const cleanBase64 = String(attachment.base64Data).includes(',')
        ? String(attachment.base64Data).slice(String(attachment.base64Data).indexOf(',') + 1)
        : String(attachment.base64Data);

      parts.push({
        inlineData: {
          mimeType: String(attachment.mimeType),
          data: cleanBase64,
        },
      });
    }

    const historyText =
      Array.isArray(history) && history.length > 0
        ? 'سجل المحادثة السابق:\n' +
          history
            .slice(-6)
            .map(
              (m: { role: string; text: string }) =>
                `${m.role === 'user' ? 'المستخدم' : 'المساعد'}: ${m.text}`
            )
            .join('\n') +
          '\n\n'
        : '';

    parts.push({
      text: `${historyText}الطلب الحالي (${taskType}):\n${prompt}`,
    });

    const { response, modelName } = await generateWithFastFallback(ai, {
      contents: { parts },
      config: {
        systemInstruction,
      },
    });

    res.json({
      reply: response.text || generateLocalClinicalResponse(prompt, clinicContext),
      model: modelName,
    });
  } catch {
    res.json({
      reply: generateLocalClinicalResponse(prompt, clinicContext),
      model: 'local-clinical-engine',
    });
  }
});

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
