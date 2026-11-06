import { GoogleGenAI, Type } from '@google/genai';
import {
  ClinicSettings,
  CurrencyFinancialSummary,
  DentalServiceItem,
  ExpenseRecord,
  InventoryItem,
  ReceiptRecord,
} from '../types/clinic';

export const GEMINI_CANDIDATE_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash'] as const;

export interface AssistantRequestPayload {
  prompt: string;
  clinicContext?: Record<string, unknown>;
  history?: Array<{ role: string; text: string }>;
  attachment?: {
    name: string;
    mimeType: string;
    base64Data: string;
  } | null;
  taskType?: 'chat' | 'report';
}

export interface SmartReceiptParseResult {
  patientName?: string;
  patientPhone?: string;
  services?: string[];
  toothFDI?: string;
  totalAmount?: number;
  paidAmount?: number;
  currency?: string;
  paymentMethod?: string;
  notes?: string;
}

export async function safeParseJsonResponse<T = Record<string, unknown>>(
  response: Response
): Promise<{ ok: boolean; status: number; data: T | null }> {
  const status = response.status;
  try {
    const rawText = await response.text();
    if (!rawText || !rawText.trim()) {
      return { ok: false, status, data: null };
    }
    const trimmed = rawText.trim();
    if (
      trimmed.toLowerCase().startsWith('<!doctype') ||
      trimmed.toLowerCase().startsWith('<html') ||
      trimmed.startsWith('<')
    ) {
      return { ok: false, status, data: null };
    }
    const parsed = JSON.parse(trimmed) as T;
    return { ok: response.ok, status, data: parsed };
  } catch {
    return { ok: false, status, data: null };
  }
}

function getBrowserGenAIClient(): GoogleGenAI | null {
  try {
    const envKey =
      (typeof process !== 'undefined' && process.env && process.env.GEMINI_API_KEY) || '';
    if (!envKey || !String(envKey).trim()) {
      return null;
    }
    return new GoogleGenAI({ apiKey: String(envKey).trim() });
  } catch {
    return null;
  }
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

export function generateLocalClinicalResponse(
  prompt: string,
  clinicContext?: Record<string, unknown> | null
): string {
  const p = String(prompt || '').trim();
  const ctx = (clinicContext || {}) as {
    identity?: ClinicSettings['identity'];
    servicesCatalog?: DentalServiceItem[];
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
    recentReceipts?: ReceiptRecord[];
    inventoryStatus?: InventoryItem[];
    lowStockAlerts?: InventoryItem[];
    inventory?: InventoryItem[];
    recentExpenses?: ExpenseRecord[];
    expenses?: ExpenseRecord[];
    currencySummaries?: CurrencyFinancialSummary[];
    defaultCurrency?: string;
  };

  const defaultCurr = ctx.identity?.defaultCurrency || ctx.defaultCurrency || 'ريال يمني';
  const clinicName = ctx.identity?.clinicAr || 'عيادة السعيدي لطب وجراحة الفم والأسنان';
  const doctorName = ctx.identity?.doctorAr || 'د. صلاح الدين السعيدي';

  // 1. كشف ديون المرضى بالتفصيل
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
      return `✅ كشف ديون المرضى في ${clinicName}:\n\nلا توجد أي مبالغ متبقية أو ديون آجلة حالياً.\nجميع السندات المسجلة مسددة بالكامل.`;
    }

    const byCurrency = new Map<string, number>();
    const lines = debtors.map((d, idx) => {
      const curr = String(d.currency || defaultCurr);
      const amt = Number(d.remainingAmount || 0);
      byCurrency.set(curr, (byCurrency.get(curr) || 0) + amt);
      return `${idx + 1}. ${d.patientName || 'مريض'} — سند #${d.receiptNo || '—'} (${d.date || ''})\n   • المبلغ المتبقي: ${amt.toLocaleString()} ${curr}${d.phone ? ` | جوال: ${d.phone}` : ''}`;
    });

    const totalsSummary = Array.from(byCurrency.entries())
      .map(([curr, sum]) => `${sum.toLocaleString()} ${curr}`)
      .join(' + ');

    return `📋 كشف ديون المرضى بالتفصيل (${debtors.length} حالة آجلة):\n\n${lines.join('\n\n')}\n\n💰 إجمالي الديون المستحقة للتحصيل (حسب كل عملة): ${totalsSummary}\n💡 يمكنك تسديد أي دفعة مباشرة أو إرسال مطالبة واتساب رسمية للمريض من قسم "سجل السندات".`;
  }

  // 2. تقرير نواقص المخزون الطبي / جرد المخزون
  if (
    p.includes('مخزون') ||
    p.includes('نواقص') ||
    p.includes('جرد') ||
    p.includes('أصناف') ||
    p.includes('اصناف') ||
    p.includes('مواد')
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
      return `📦 لا توجد أصناف مسجلة حالياً في المخزون الطبي.\nيمكنك إضافة المواد الطبية من قسم "المخزون الطبي".`;
    }

    if (lowList.length === 0) {
      const topItems = allItems
        .slice(0, 6)
        .map((i, idx) => `${idx + 1}. ${i.name}: متوفر (${i.qty} ${i.unit})`)
        .join('\n');

      return `📦 تقرير حالة المخزون الطبي (${clinicName}):\n• إجمالي الأصناف المسجلة: ${allItems.length} صنف\n• القيمة الإجمالية للمخزون: ${totalVal.toLocaleString()} ${defaultCurr}\n• النواقص الحالية: 0 (جميع الأصناف متوفرة فوق الحد الأدنى ✅)\n\nأبرز المواد المتوفرة:\n${topItems}`;
    }

    let totalRestockCost = 0;
    const lowLines = lowList.map((item, idx) => {
      const needed = Math.max(5, (Number(item.minQty) || 5) * 2 - (Number(item.qty) || 0));
      const estCost = needed * (Number(item.unitPrice) || 0);
      totalRestockCost += estCost;
      return `${idx + 1}. ${item.name}\n   • المتبقي حالياً: ${item.qty} ${item.unit} (الحد الأدنى: ${item.minQty} ${item.unit})\n   • الكمية المقترح شراؤها: ${needed} ${item.unit} (بتكلفة تقديرية: ${estCost.toLocaleString()} ${defaultCurr})`;
    });

    return `⚠️ تقرير نواقص وجرد المخزون الطبي:\n• إجمالي الأصناف في العيادة: ${allItems.length} صنف (بقيمة ${totalVal.toLocaleString()} ${defaultCurr})\n• عدد الأصناف التي وصلت لحد النقص: ${lowList.length} صنف\n\n${lowLines.join('\n\n')}\n\n💰 التكلفة التقديرية لإعادة التزويد: ${totalRestockCost.toLocaleString()} ${defaultCurr}\n💡 التوصية: سرعة توفير الأصناف أعلاه لضمان عدم توقف الجلسات العلاجية المرتبطة بها.`;
  }

  // 3. ملخص صافي الأرباح والمصروفات / التقرير المالي
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
        return `💵 عملة (${c.currency}):\n• إجمالي المفوتر: ${Number(c.totalBilledAmount || 0).toLocaleString()} (${c.receiptsCount || 0} سند)\n• الإيراد المقبوض نقداً: ${Number(c.totalCollectedRevenue || 0).toLocaleString()} (نسبة التحصيل: ${rate}%)\n• الديون الآجلة على المرضى: ${Number(c.totalPendingDebts || 0).toLocaleString()} (${c.debtorsCount || 0} حالة)\n• إجمالي المصروفات: ${Number(c.totalExpenses || 0).toLocaleString()}\n• صافي الربح النقدي: ${Number(c.netCashProfit || 0).toLocaleString()} ${c.currency}`;
      });

      return `📊 التقرير المالي التنفيذي (${clinicName}):\n\n${blocks.join('\n\n')}\n\n💡 التوصيات المالية والتشغيلية:\n1. متابعة تحصيل الذمم الآجلة لرفع نسبة السيولة النقدية.\n2. ضبط المصروفات التشغيلية وربط مشتريات المواد بالمخزون تلقائياً.\n3. التركيز على الخدمات العلاجية ذات العائد الأعلى وتوفير مستلزماتها مسبقاً.`;
    }

    const fin = ctx.financialSummary || {};
    const billed = Number(fin.totalBilled || 0);
    const collected = Number(fin.totalCollected || 0);
    const debts = Number(fin.totalPendingDebts || 0);
    const expensesTotal = Number(fin.totalExpenses || 0);
    const net = collected - expensesTotal;
    const rate = billed > 0 ? Math.round((collected / billed) * 100) : 100;

    const expList = Array.isArray(ctx.recentExpenses) ? ctx.recentExpenses.slice(0, 5) : [];
    const expText =
      expList.length > 0
        ? `\n\n📌 آخر المصروفات المسجلة:\n` +
          expList
            .map((e, i) => `${i + 1}. ${e.title} (${e.category}): ${Number(e.amount).toLocaleString()} ${e.currency}`)
            .join('\n')
        : '';

    return `📊 ملخص صافي الأرباح والمصروفات (${clinicName}):\n\n• إجمالي السندات المصدرة: ${fin.totalReceipts || 0} سند\n• إجمالي قيمة العلاجات المفوترة: ${billed.toLocaleString()} ${defaultCurr}\n• الإيراد المقبوض فعلياً: ${collected.toLocaleString()} ${defaultCurr} (نسبة التحصيل: ${rate}%)\n• ديون المرضى المتبقية: ${debts.toLocaleString()} ${defaultCurr}\n• إجمالي المصروفات: ${expensesTotal.toLocaleString()} ${defaultCurr}\n• صافي الربح النقدي الفعلي: ${net.toLocaleString()} ${defaultCurr}${expText}`;
  }

  // 4. تعليمات بعد خلع الضرس أو الجراحة
  if (p.includes('خلع') || p.includes('ضرس') || p.includes('جراح') || p.includes('تعليمات')) {
    return `🦷 تعليمات طبية للمريض بعد خلع الضرس (${clinicName}):\n\n1. إيقاف النزيف: العضّ بثبات على قطعة الشاش المعقم الموضوعة مكان الخلع لمدة 45 إلى 60 دقيقة.\n2. الحفاظ على الخثرة الدموية: عدم المضمضة القوية أو البصق المتكرر أو الشرب بالمصاصة خلال أول 24 ساعة.\n3. التغذية: تناول أطعمة لينة وباردة أو فاترة (زبادي، عصير طبيعي، شوربة فاترة) والابتعاد عن المشروبات الساخنة والأطعمة القاسية.\n4. الامتناع التام عن التدخين لمدة 48 ساعة على الأقل لتفادي التهاب السنخ الجاف (Dry Socket).\n5. العناية والنظافة: بدءاً من اليوم التالي، المضمضة اللطيفة بماء دافئ وملح 3 مرات يومياً بعد الوجبات.\n6. الأدوية: الالتزام الدقيق بمواعيد المسكنات والمضاد الحيوي الموصوف من ${doctorName}.`;
  }

  // 5. خطة علاج عصب للسن
  if (p.includes('عصب') || p.includes('جذور') || p.includes('حشو') || /\b[1-8][1-8]\b/.test(p)) {
    const toothMatch = p.match(/\b([1-4][1-8]|[5-8][1-5])\b/);
    const toothLabel = toothMatch ? ` للسن رقم (${toothMatch[1]}) بنظام FDI` : '';
    return `🦷 خطة علاج العصب والجذور (Endodontic Treatment Plan)${toothLabel}:\n\n1. الفحص والتشخيص الشعاعي: أخذ صورة أشعة ذروية (Periapical X-Ray) لتقييم عدد القنوات الجذرية، انحناءاتها، وحالة الأنسجة حول الذروية.\n2. التخدير والعزل: إعطاء التخدير الموضعي وعزل السن بالحاجز المطاطي (Rubber Dam) ثم فتح حجرة اللب (Access Cavity Preparation).\n3. تحديد الطول العامل: استئصال النسيج اللبي وتحديد الطول الدقيق للقنوات باستخدام جهاز (Apex Locator) مع تأكيده شعاعياً.\n4. التحضير الكيميائي والميكانيكي: توسيع وتشكيل القنوات بنظام المبارد الدوارة (Rotary NiTi Files) مع الإرواء المكثف بمحلول هيبوكلوريت الصوديوم (NaOCl 5.25%) و EDTA.\n5. الحشو النهائي والتعويض: تجفيف القنوات بأقماع ورقية وحشوها بمادة (Gutta-Percha) مع (Bioceramic / Resin Sealer)، ثم وضع الحشوة التجميلية النهائية أو التوصية بتركيب تاج خزفي (Crown) لحماية السن.`;
  }

  // 6. البحث عن مريض معين أو سند معين في السجلات
  const recList = Array.isArray(ctx.recentReceipts) ? ctx.recentReceipts : [];
  const matchedReceipts = recList.filter(
    (r) =>
      (r.patientName && p.includes(r.patientName)) ||
      (r.patientPhone && p.includes(r.patientPhone)) ||
      (r.receiptNo && p.includes(String(r.receiptNo)))
  );

  if (matchedReceipts.length > 0) {
    const details = matchedReceipts
      .map(
        (r) =>
          `• سند #${r.receiptNo} (${r.date}) — المريض: ${r.patientName}\n  الخدمات: ${(r.services || []).join(' + ') || '—'}${r.toothFDI ? ` | الأسنان: ${r.toothFDI}` : ''}\n  الإجمالي: ${Number(r.totalAmount).toLocaleString()} | المدفوع: ${Number(r.paidAmount).toLocaleString()} | المتبقي: ${Number(r.remainingAmount).toLocaleString()} ${r.currency}`
      )
      .join('\n\n');
    return `🔍 نتائج البحث في سجلات المرضى والسندات:\n\n${details}`;
  }

  // 7. إجابة شاملة افتراضية من واقع بيانات العيادة (مفصولة حسب كل عملة)
  const debtorsCount = Array.isArray(ctx.pendingDebtsPatients) ? ctx.pendingDebtsPatients.length : 0;
  const lowCount = Array.isArray(ctx.lowStockAlerts) ? ctx.lowStockAlerts.length : 0;

  if (Array.isArray(ctx.currencySummaries) && ctx.currencySummaries.length > 0) {
    const currLines = ctx.currencySummaries
      .map(
        (c) =>
          `• عملة ${c.currency}: المقبوض ${Number(c.totalCollectedRevenue || 0).toLocaleString()} | الديون ${Number(c.totalPendingDebts || 0).toLocaleString()} | الصافي ${Number(c.netCashProfit || 0).toLocaleString()}`
      )
      .join('\n');
    return `مرحباً بك في المساعد الطبي والمالي الذكي لـ ${clinicName} (${doctorName}):\n\n📌 الملخص المباشر لقاعدة بيانات العيادة الآن (حسب كل عملة):\n${currLines}\n• تنبيهات نواقص المخزون: ${lowCount} صنف\n\nيمكنك الضغط على أي من الأزرار السريعة بالأعلى للحصول على:\n- كشف ديون المرضى بالتفصيل\n- تقرير نواقص المخزون الطبي\n- ملخص صافي الأرباح والمصروفات\n- أو كتابة اسم مريض أو استشارة علاجية مباشرة.`;
  }

  const fin = ctx.financialSummary || {};
  return `مرحباً بك في المساعد الطبي والمالي الذكي لـ ${clinicName} (${doctorName}):\n\n📌 الملخص المباشر لقاعدة بيانات العيادة الآن:\n• السندات المسجلة: ${fin.totalReceipts || 0} سند\n• الإيرادات المقبوضة: ${Number(fin.totalCollected || 0).toLocaleString()} ${defaultCurr}\n• الديون المتبقية على المرضى: ${Number(fin.totalPendingDebts || 0).toLocaleString()} ${defaultCurr} (${debtorsCount} مريض)\n• المصروفات المسجلة: ${Number(fin.totalExpenses || 0).toLocaleString()} ${defaultCurr}\n• تنبيهات نواقص المخزون: ${lowCount} صنف\n\nيمكنك الضغط على أي من الأزرار السريعة بالأعلى للحصول على:\n- كشف ديون المرضى بالتفصيل\n- تقرير نواقص المخزون الطبي\n- ملخص صافي الأرباح والمصروفات\n- أو كتابة اسم مريض أو استشارة علاجية مباشرة.`;
}

async function queryBrowserGeminiFallback(payload: AssistantRequestPayload): Promise<string | null> {
  const ai = getBrowserGenAIClient();
  if (!ai) return null;

  const cleanContext = sanitizeClinicContextForPrompt(payload.clinicContext);
  const systemInstruction = `أنت "DOCAI Gemini" — المساعد الطبي والمالي الذكي المدمج في نظام إدارة عيادة السعيدي لطب وجراحة الفم والأسنان (د. صلاح الدين السعيدي).
تتحدث بلغة عربية احترافية، واضحة، سريعة، ودقيقة، وتعتمد حصرياً على البيانات الحقيقية للعيادة المرفقة في السياق أدناه عند الإجابة عن المرضى، السندات، الديون، المخزون، والمصروفات.
لا تخترع أرقاماً غير موجودة في السياق، وقدم إجابات منظمة ومباشرة للطبيب أو المحاسب.
عند تحليل صورة أشعة سنية أو تقرير طبي أو فاتورة مرفقة، قدم قراءة إكلينيكية/تشخيصية أولية منظمة ومفصلة مع تذكير مهني بأن القرار النهائي يعود للفحص السريري المباشر للطبيب المعالج.

سياق قاعدة بيانات العيادة الحالية (JSON):
${JSON.stringify(cleanContext)}`;

  const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];

  if (payload.attachment && payload.attachment.base64Data && payload.attachment.mimeType) {
    const cleanBase64 = String(payload.attachment.base64Data).includes(',')
      ? String(payload.attachment.base64Data).slice(
          String(payload.attachment.base64Data).indexOf(',') + 1
        )
      : String(payload.attachment.base64Data);

    parts.push({
      inlineData: {
        mimeType: String(payload.attachment.mimeType),
        data: cleanBase64,
      },
    });
  }

  const historyText =
    Array.isArray(payload.history) && payload.history.length > 0
      ? 'سجل المحادثة السابق:\n' +
        payload.history
          .slice(-6)
          .map((m) => `${m.role === 'user' ? 'المستخدم' : 'المساعد'}: ${m.text}`)
          .join('\n') +
        '\n\n'
      : '';

  parts.push({
    text: `${historyText}الطلب الحالي (${payload.taskType || 'chat'}):\n${payload.prompt}`,
  });

  for (const modelName of GEMINI_CANDIDATE_MODELS) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: { parts },
        config: {
          systemInstruction,
        },
      });
      if (response.text && response.text.trim()) {
        return response.text.trim();
      }
    } catch {
      // Try next candidate model
    }
  }

  return null;
}

export async function queryClinicAssistant(payload: AssistantRequestPayload): Promise<string> {
  // 1. Try server endpoint (/api/gemini/assistant) using safe text->JSON reader
  try {
    const response = await fetch('/api/gemini/assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const parsed = await safeParseJsonResponse<{ reply?: string; error?: string }>(response);
    if (parsed.ok && parsed.data?.reply && String(parsed.data.reply).trim()) {
      return String(parsed.data.reply).trim();
    }
  } catch {
    // Server route unreachable or failed; proceed to browser SDK fallback
  }

  // 2. Try direct browser @google/genai fallback if process.env.GEMINI_API_KEY is available
  try {
    const browserReply = await queryBrowserGeminiFallback(payload);
    if (browserReply) {
      return browserReply;
    }
  } catch {
    // Browser SDK fallback unavailable or failed; proceed silently to local clinical engine
  }

  // 3. Silent immediate fallback to Local Clinical Intelligence Engine
  return generateLocalClinicalResponse(payload.prompt, payload.clinicContext);
}

export async function parseSmartReceiptWithFallback(
  text: string,
  availableServices: DentalServiceItem[],
  defaultCurrency: string
): Promise<SmartReceiptParseResult | null> {
  const cleanText = String(text || '').trim();
  if (!cleanText) return null;

  // 1. Try server endpoint (/api/gemini/parse-receipt) using safe text->JSON reader
  try {
    const response = await fetch('/api/gemini/parse-receipt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: cleanText,
        availableServices,
        defaultCurrency,
      }),
    });

    const parsed = await safeParseJsonResponse<{
      result?: SmartReceiptParseResult;
      error?: string;
    }>(response);
    if (parsed.ok && parsed.data?.result) {
      return parsed.data.result;
    }
  } catch {
    // Fall through to browser SDK fallback
  }

  // 2. Try direct browser @google/genai fallback if process.env.GEMINI_API_KEY is available
  const ai = getBrowserGenAIClient();
  if (ai) {
    const serviceNames = Array.isArray(availableServices)
      ? availableServices.map((s) => `${s.name} (${s.price || 0})`).join('، ')
      : '';

    for (const modelName of GEMINI_CANDIDATE_MODELS) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: `حلل النص الطبي والمحاسبي التالي واستخرج بيانات سند القبض لعيادة الأسنان بدقة عالية:
النص المدخل: "${cleanText}"
الخدمات المعتمدة في العيادة وأسعارها الافتراضية: ${serviceNames || 'كشف ومعاينة، حشوات وتجميل، علاج عصب وجذور، خلع وجراحة، تنظيف وتجليح لثة، تركيبات أسنان، تقويم أسنان، أشعة تشخيصية'}
العملة الافتراضية: ${defaultCurrency}`,
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

        const rawJson = (response.text ?? '').trim();
        if (rawJson) {
          return JSON.parse(rawJson) as SmartReceiptParseResult;
        }
      } catch {
        // Try next candidate model
      }
    }
  }

  return null;
}
