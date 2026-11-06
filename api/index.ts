import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';

function getGenAIClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
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
  const candidateModels = ['gemini-3.1-flash-lite', 'gemini-3.8-flash', 'gemini-flash-latest'];
  let lastErr: unknown = null;

  for (const modelName of candidateModels) {
    try {
      const isSeries3 = modelName.startsWith('gemini-3');
      const response = await ai.models.generateContent({
        model: modelName,
        contents: payload.contents as string,
        config: {
          ...payload.config,
          ...(isSeries3 ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}),
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

  // 1. كشف ديون المرضى بالتفصيل
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

  // 2. تقرير نواقص المخزون الطبي / جرد المخزون
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

  // 3. ملخص صافي الأرباح والمصروفات / التقرير المالي
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
      return `📊 التقرير المالي التنفيذي للعيادة:\n\n${blocks.join('\n\n')}\n\n💡 التوصيات الإدارية:\n1. تعزيز تحصيل الذمم المتأخرة لرفع السيولة النقدية.\n2. ربط المشتريات الطبية بسجل المصروفات لضبط التكاليف التشغيلية.\n3. مراجعة الخدمات الأكثر طلباً وتوفير مستلزماتها بكميات اقتصادية.`;
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

  // 4. تعليمات بعد خلع الضرس
  if (p.includes('خلع') || p.includes('ضرس') || p.includes('جراح')) {
    return `🦷 تعليمات طبية للمريض بعد خلع الضرس:\n1. العضّ جيداً على قطعة الشاش المعقم لمدة 45 إلى 60 دقيقة لوقف النزيف وتكوين الخثرة الدموية.\n2. تجنب المضمضة القوية أو البصق أو استخدام المصاصة (الشفاط) خلال أول 24 ساعة.\n3. الامتناع التام عن التدخين والمشروبات الساخنة في اليوم الأول.\n4. تناول أطعمة لينة وباردة أو فاترة (مثل الزبادي، العصائر الطبيعية، الشوربة الفاترة) على الجهة الأخرى.\n5. الالتزام بالمسكنات والمضاد الحيوي الموصوف من الدكتور صلاح الدين السعيدي في مواعيدها.\n6. بعد مرور 24 ساعة، يُنصح بالمضمضة اللطيفة بماء دافئ وملح 3 مرات يومياً.`;
  }

  // 5. خطة علاج عصب
  if (p.includes('عصب') || p.includes('جذور') || p.includes('16') || p.includes('سن')) {
    return `🦷 البروتوكول الإكلينيكي وخطة علاج العصب (Root Canal Therapy):\n1. التشخيص والأشعة: أخذ صورة أشعة ذروية (Periapical X-Ray) لتحديد عدد القنوات وشكل الجذور ووجود أي التهاب ذروي.\n2. التخدير والعزل: إعطاء التخدير الموضعي (Lidocaine 2%) وعزل السن وفتح حجرة اللب (Access Cavity).\n3. استئصال اللب وتحديد الطول: إزالة الأنسجة اللبية وتحديد الطول العامل للقنوات (Working Length) عبر جهاز Apex Locator.\n4. التنظيف والتشكيل (Cleaning & Shaping): تحضير القنوات بالمبارد الدوارة (Rotary Files) مع الإرواء المستمر بمحلول هيبوكلوريت الصوديوم (NaOCl).\n5. الحشو النهائي والتعويض: تجفيف القنوات وحشوها بأقماع Gutta-Percha مع Sealer، ثم وضع الحشوة النهائية أو التوصية بتركيب تاج خزفي (Crown) لحماية السن من الكسر.`;
  }

  // Default comprehensive clinic status summary
  const fin = ctx.financialSummary || {};
  return `مرحباً بك في المساعد الطبي والمالي الذكي (${ctx.identity?.clinicAr || 'عيادة السعيدي'}):\n\n📌 ملخص السجلات الحالية:\n• إجمالي السندات: ${fin.totalReceipts || 0} سند\n• الإيرادات المقبوضة: ${Number(fin.totalCollected || 0).toLocaleString()} ${defaultCurr}\n• الديون المتبقية: ${Number(fin.totalPendingDebts || 0).toLocaleString()} ${defaultCurr}\n• المصروفات: ${Number(fin.totalExpenses || 0).toLocaleString()} ${defaultCurr}\n\nيمكنك الاستفسار عن: "كشف ديون المرضى بالتفصيل"، "تقرير نواقص المخزون الطبي"، "ملخص صافي الأرباح والمصروفات"، أو طلب أي بروتوكول علاجي.`;
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
    paymentMethod: raw.includes('تحويل') || raw.includes('محفظة') ? 'تحويل بنكي / محفظة' : 'نقداً (Cash)',
    notes: '',
  };
}

export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'OPTIONS') {
    return res.status(200).json({ ok: true });
  }

  const url = String(req.url || '');
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};

  try {
    // 1. Parse Receipt Endpoint
    if (url.includes('/parse-receipt')) {
      const { text, availableServices = [], defaultCurrency = 'ريال يمني' } = body;
      if (!text || typeof text !== 'string' || !text.trim()) {
        return res.status(400).json({ error: 'يرجى إدخال نص السند للتحليل.' });
      }

      const ai = getGenAIClient();
      if (!ai) {
        const fallbackResult = parseReceiptHeuristicServer(
          text.trim(),
          availableServices,
          defaultCurrency
        );
        return res.status(200).json({ result: fallbackResult, mode: 'local' });
      }

      const serviceNames = Array.isArray(availableServices)
        ? availableServices
            .map((s: { name?: string; price?: number }) => `${s.name} (${s.price || 0})`)
            .join('، ')
        : '';

      try {
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
          text.trim(),
          availableServices,
          defaultCurrency
        );
        return res.status(200).json({ result: fallbackResult, mode: 'local' });
      }
    }

    // 2. Assistant / Reports Endpoint
    if (url.includes('/assistant')) {
      const {
        prompt,
        clinicContext,
        history = [],
        attachment = null,
        taskType = 'chat',
      } = body;

      if (!prompt || typeof prompt !== 'string') {
        return res.status(400).json({ error: 'الرسالة مطلوبة.' });
      }

      const ai = getGenAIClient();
      if (!ai) {
        const localReply = buildLocalIntelligentReply(prompt, clinicContext);
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

      try {
        const { response, modelName } = await generateWithFastFallback(ai, {
          contents: { parts },
          config: {
            systemInstruction,
          },
        });

        return res.status(200).json({
          reply: response.text || buildLocalIntelligentReply(prompt, clinicContext),
          model: modelName,
        });
      } catch {
        const localReply = buildLocalIntelligentReply(prompt, clinicContext);
        return res.status(200).json({
          reply: localReply,
          model: 'local-clinical-engine',
        });
      }
    }

    // 3. Cloud Sync Endpoints on Serverless
    if (url.includes('/cloud/')) {
      const clinicId = String(body.clinicId || 'alssaedy-clinic')
        .trim()
        .toLowerCase();
      return res.status(200).json({
        ok: true,
        status: 'authenticated',
        clinicId,
        updatedAt: new Date().toISOString(),
        data: body.data || body.initialData || null,
      });
    }

    return res.status(200).json({ ok: true });
  } catch (error: unknown) {
    const fallbackReply = buildLocalIntelligentReply(body?.prompt || '', body?.clinicContext);
    return res.status(200).json({
      reply: fallbackReply,
      error: error instanceof Error ? error.message : 'حدث خطأ غير متوقع',
    });
  }
}
