import {
  AIProviderConfig,
  ClinicSettings,
  CurrencyFinancialSummary,
  DEFAULT_AI_CONFIG,
  DentalServiceItem,
  ExpenseRecord,
  InventoryItem,
  ReceiptRecord,
} from '../types/clinic';

export const AI_CONFIG_STORAGE_KEY = 'docai_ai_providers_config_v1';

export const GEMINI_CANDIDATE_MODELS = [
  'gemini-2.5-flash',
  'gemini-3-flash-preview',
  'gemini-3.1-flash-lite-preview',
  'gemini-flash-latest',
  'gemini-2.5-pro',
] as const;

export const GROQ_TEXT_MODELS = [
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'meta-llama/llama-4-maverick-17b-128e-instruct',
] as const;

export const GROQ_VISION_MODELS = [
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'meta-llama/llama-4-maverick-17b-128e-instruct',
] as const;

export const GROQ_WHISPER_MODELS = [
  'whisper-large-v3',
  'whisper-large-v3-turbo',
] as const;

export const OPENROUTER_MODELS = [
  'google/gemini-2.5-flash',
  'deepseek/deepseek-chat',
  'meta-llama/llama-3.3-70b-instruct',
  'openrouter/free',
  'openrouter/auto',
] as const;

export const MODEL_DISPLAY_LABELS: Record<string, string> = {
  'gemini-2.5-flash': 'Google Gemini 2.5 Flash (موصى به)',
  'gemini-3-flash-preview': 'Google Gemini 3 Flash',
  'gemini-3.1-flash-lite-preview': 'Google Gemini 3.1 Flash Lite',
  'gemini-flash-latest': 'Google Gemini Flash Latest',
  'gemini-2.5-pro': 'Google Gemini 2.5 Pro',
  'gemini-1.5-flash': 'Google Gemini 2.5 Flash',
  'gemini-2.0-flash': 'Google Gemini 2.5 Flash',
  'gemini-1.5-pro': 'Google Gemini 2.5 Pro',
  'llama-3.3-70b-versatile': 'Groq Llama 3.3 70B Versatile (موصى به)',
  'llama-3.1-8b-instant': 'Groq Llama 3.1 8B Instant (فائق السرعة)',
  'meta-llama/llama-4-scout-17b-16e-instruct': 'Groq Llama 4 Scout 17B (نصوص ورؤية)',
  'meta-llama/llama-4-maverick-17b-128e-instruct': 'Groq Llama 4 Maverick 17B',
  'whisper-large-v3': 'Groq Whisper Large v3',
  'whisper-large-v3-turbo': 'Groq Whisper Large v3 Turbo',
  'google/gemini-2.5-flash': 'OpenRouter Gemini 2.5 Flash (موصى به)',
  'deepseek/deepseek-chat': 'OpenRouter DeepSeek V3',
  'meta-llama/llama-3.3-70b-instruct': 'OpenRouter Llama 3.3 70B',
  'openrouter/free': 'OpenRouter Free Router (مجاني تلقائي)',
  'openrouter/auto': 'OpenRouter Auto Router (ذكي تلقائي)',
  'local-clinical-engine': 'المحرك السريري المدمج (خادم العيادة)',
};

export function formatModelDisplayLabel(modelName?: string | null): string {
  const clean = String(modelName || '').trim();
  if (!clean) return 'Google Gemini 2.5 Flash';
  return MODEL_DISPLAY_LABELS[clean] || clean;
}

export function sanitizeGeminiModel(model?: string | null): string {
  const m = String(model || '').trim();
  if (
    !m ||
    m.includes('1.5') ||
    m.includes('2.0') ||
    m === 'gemini-3.8-flash' ||
    m === 'gemini-3.1-flash-lite'
  ) {
    return 'gemini-2.5-flash';
  }
  return m;
}

export function sanitizeGroqTextModel(model?: string | null): string {
  const m = String(model || '').trim();
  if (
    !m ||
    m === 'llama3-70b-8192' ||
    m === 'mixtral-8x7b-32768' ||
    m === 'llama3-8b-8192' ||
    m === 'gemma-7b-it' ||
    m.includes('llama-3.2-')
  ) {
    return 'llama-3.3-70b-versatile';
  }
  return m;
}

export function sanitizeGroqVisionModel(model?: string | null): string {
  const m = String(model || '').trim();
  if (!m || m.includes('llama-3.2-')) {
    return 'meta-llama/llama-4-scout-17b-16e-instruct';
  }
  return m;
}

export function sanitizeOpenRouterModel(model?: string | null): string {
  const m = String(model || '').trim();
  if (!m || m === 'google/gemini-flash-1.5' || m === 'anthropic/claude-3.5-sonnet') {
    return 'google/gemini-2.5-flash';
  }
  return m;
}

export function loadAIProviderConfig(): AIProviderConfig {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return DEFAULT_AI_CONFIG;
    }
    const raw = window.localStorage.getItem(AI_CONFIG_STORAGE_KEY);
    if (!raw) return DEFAULT_AI_CONFIG;
    const parsed = JSON.parse(raw) as Partial<AIProviderConfig>;

    const geminiModel = sanitizeGeminiModel(parsed.geminiModel || DEFAULT_AI_CONFIG.geminiModel);
    const groqTextModel = sanitizeGroqTextModel(parsed.groqTextModel || DEFAULT_AI_CONFIG.groqTextModel);
    const groqVisionModel = sanitizeGroqVisionModel(parsed.groqVisionModel || DEFAULT_AI_CONFIG.groqVisionModel);
    const openrouterModel = sanitizeOpenRouterModel(parsed.openrouterModel || DEFAULT_AI_CONFIG.openrouterModel);

    const config: AIProviderConfig = {
      geminiApiKey: String(parsed.geminiApiKey || '').trim(),
      geminiModel,
      enableWebGrounding: parsed.enableWebGrounding !== false,

      groqApiKey: String(parsed.groqApiKey || '').trim(),
      groqTextModel,
      groqVisionModel,
      groqWhisperModel: String(parsed.groqWhisperModel || DEFAULT_AI_CONFIG.groqWhisperModel).trim(),

      openrouterApiKey: String(parsed.openrouterApiKey || '').trim(),
      openrouterModel,

      sttEngine: parsed.sttEngine === 'groq' ? 'groq' : 'browser',
      customPriority: Array.isArray(parsed.customPriority) && parsed.customPriority.length > 0
        ? parsed.customPriority
        : DEFAULT_AI_CONFIG.customPriority,
    };

    // Auto-heal localStorage if obsolete models were stored
    if (
      parsed.geminiModel !== geminiModel ||
      parsed.groqTextModel !== groqTextModel ||
      parsed.groqVisionModel !== groqVisionModel ||
      parsed.openrouterModel !== openrouterModel
    ) {
      try {
        window.localStorage.setItem(AI_CONFIG_STORAGE_KEY, JSON.stringify(config));
      } catch {
        // Ignore
      }
    }

    return config;
  } catch {
    return DEFAULT_AI_CONFIG;
  }
}

export function saveAIProviderConfig(config: AIProviderConfig): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const sanitized: AIProviderConfig = {
        ...config,
        geminiApiKey: String(config.geminiApiKey || '').trim(),
        groqApiKey: String(config.groqApiKey || '').trim(),
        openrouterApiKey: String(config.openrouterApiKey || '').trim(),
        geminiModel: sanitizeGeminiModel(config.geminiModel),
        groqTextModel: sanitizeGroqTextModel(config.groqTextModel),
        groqVisionModel: sanitizeGroqVisionModel(config.groqVisionModel),
        openrouterModel: sanitizeOpenRouterModel(config.openrouterModel),
      };
      window.localStorage.setItem(AI_CONFIG_STORAGE_KEY, JSON.stringify(sanitized));
    }
  } catch {
    // Ignore storage quota errors
  }
}

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

export const SESSION_STORAGE_KEY = 'docai_direct_cloud_session_v1';
export const LOCAL_API_SESSION_KEY = 'docai_api_session_v1';

export function getStoredSessionAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  try {
    if (typeof window === 'undefined') return headers;
    const aiCfg = loadAIProviderConfig();
    if (aiCfg.geminiApiKey.trim()) {
      headers['X-Gemini-Api-Key'] = aiCfg.geminiApiKey.trim();
    }
    const rawLocal = window.sessionStorage?.getItem(LOCAL_API_SESSION_KEY);
    const rawCloud = window.localStorage?.getItem(SESSION_STORAGE_KEY);
    const raw = rawLocal || rawCloud;
    if (!raw) return headers;
    const parsed = JSON.parse(raw) as {
      clinicId?: string;
      ownerUid?: string;
      sessionToken?: string;
      expiresAt?: string;
    };
    if (parsed?.expiresAt && Date.parse(parsed.expiresAt) <= Date.now()) {
      if (rawCloud) window.localStorage?.removeItem(SESSION_STORAGE_KEY);
      if (rawLocal) window.sessionStorage?.removeItem(LOCAL_API_SESSION_KEY);
      return headers;
    }
    if (parsed?.sessionToken) {
      headers['Authorization'] = `Bearer ${parsed.sessionToken}`;
      headers['X-Clinic-Session'] = parsed.sessionToken;
    }
    if (parsed?.clinicId) {
      headers['X-Clinic-Id'] = parsed.clinicId;
    }
    if (parsed?.ownerUid) {
      headers['X-Clinic-Owner'] = parsed.ownerUid;
    }
  } catch {
    // Ignore storage read errors
  }
  return headers;
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
    allReceipts?: ReceiptRecord[];
    recentReceipts?: ReceiptRecord[];
    allInventory?: InventoryItem[];
    inventoryStatus?: InventoryItem[];
    lowStockAlerts?: InventoryItem[];
    inventory?: InventoryItem[];
    allExpenses?: ExpenseRecord[];
    recentExpenses?: ExpenseRecord[];
    expenses?: ExpenseRecord[];
    currencySummaries?: CurrencyFinancialSummary[];
    defaultCurrency?: string;
  };

  const defaultCurr = ctx.identity?.defaultCurrency || ctx.defaultCurrency || 'ريال يمني';
  const clinicName = ctx.identity?.clinicAr || 'عيادة طب وجراحة الفم والأسنان';
  const doctorName = ctx.identity?.doctorAr || 'الطبيب المعالج';

  // 1. البحث عن مريض معين أو سند معين بالاسم أو الهاتف أو رقم السند
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

  // 2. كشف ديون المرضى بالتفصيل
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

    return `📋 كشف ديون المرضى بالتفصيل (${debtors.length} حالة آجلة):\n\n${lines.join('\n\n')}\n\n💰 إجمالي الديون المستحقة للتحصيل (حسب كل عملة): ${totalsSummary}\n💡 يمكنك تسديد أي دفعة مباشرة أو إرسال مطالبة واتساب من قسم "السندات".`;
  }

  // 3. تقرير نواقص المخزون الطبي / جرد المخزون
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
      const topItems = allItems
        .slice(0, 6)
        .map((i, idx) => `${idx + 1}. ${i.name}: متوفر (${i.qty} ${i.unit})`)
        .join('\n');

      return `📦 تقرير حالة المخزون (${clinicName}):\n• إجمالي الأصناف المسجلة: ${allItems.length} صنف\n• القيمة الإجمالية للمخزون: ${totalVal.toLocaleString()} ${defaultCurr}\n• النواقص الحالية: 0 (جميع الأصناف متوفرة فوق الحد الأدنى ✅)\n\nأبرز المواد المتوفرة:\n${topItems}`;
    }

    let totalRestockCost = 0;
    const lowLines = lowList.map((item, idx) => {
      const needed = Math.max(5, (Number(item.minQty) || 5) * 2 - (Number(item.qty) || 0));
      const estCost = needed * (Number(item.unitPrice) || 0);
      totalRestockCost += estCost;
      return `${idx + 1}. ${item.name}\n   • المتبقي حالياً: ${item.qty} ${item.unit} (الحد الأدنى: ${item.minQty} ${item.unit})\n   • الكمية المقترح شراؤها: ${needed} ${item.unit} (بتكلفة تقديرية: ${estCost.toLocaleString()} ${defaultCurr})`;
    });

    return `⚠️ تقرير نواقص وتحليل المخزون (${clinicName}):\n• إجمالي الأصناف في العيادة: ${allItems.length} صنف (بقيمة ${totalVal.toLocaleString()} ${defaultCurr})\n• عدد الأصناف التي وصلت لحد النقص: ${lowList.length} صنف\n\n${lowLines.join('\n\n')}\n\n💰 التكلفة التقديرية لإعادة التزويد: ${totalRestockCost.toLocaleString()} ${defaultCurr}\n💡 التوصية: سرعة توفير الأصناف أعلاه لضمان عدم توقف الجلسات العلاجية المرتبطة بها.`;
  }

  // 4. ملخص صافي الأرباح والمصروفات / التقرير المالي
  if (
    p.includes('أرباح') ||
    p.includes('ارباح') ||
    p.includes('مصروفات') ||
    p.includes('مالي') ||
    p.includes('إيراد') ||
    p.includes('ايراد') ||
    p.includes('تقرير') ||
    p.includes('محاسب') ||
    p.includes('ميزان') ||
    p.includes('دخل')
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

  // 5. قائمة أسعار وخدمات العيادة
  if (
    p.includes('أسعار') ||
    p.includes('اسعار') ||
    p.includes('سعر') ||
    p.includes('تكلفة') ||
    p.includes('خدمات العيادة') ||
    p.includes('قائمة الخدمات')
  ) {
    const services = Array.isArray(ctx.servicesCatalog) ? ctx.servicesCatalog : [];
    if (services.length > 0) {
      const list = services
        .map((s, idx) => `${idx + 1}. ${s.name}: ${Number(s.price || 0).toLocaleString()} ${defaultCurr}`)
        .join('\n');
      return `🦷 قائمة الخدمات العلاجية وأسعارها المعتمدة في (${clinicName}):\n\n${list}\n\n💡 يمكنك تعديل الأسعار أو إضافة خدمات جديدة من قسم "الإعدادات > الخدمات".`;
    }
  }

  // 6. الأدوية، المضادات الحيوية، والمسكنات في طب الأسنان
  if (
    p.includes('مضاد') ||
    p.includes('دواء') ||
    p.includes('أدوية') ||
    p.includes('ادوية') ||
    p.includes('مسكن') ||
    p.includes('وصفة') ||
    p.includes('روشيتة') ||
    p.includes('اموكسيسيلين') ||
    p.includes('أموكسيسيلين') ||
    p.includes('اوجمنتين') ||
    p.includes('أوجمنتين') ||
    p.includes('فلاجيل') ||
    p.includes('ميترونيدازول') ||
    p.includes('بروفين') ||
    p.includes('جرعة')
  ) {
    return `💊 دليل البروتوكول الدوائي في عيادة الأسنان (${clinicName}):

1. المضادات الحيوية (تُوصف عند وجود انتفاخ منتشر، خراج حاد، أو أعراض جهازية كالحمى):
   • الخط الأول (البالغين): Amoxicillin 500mg كبسولة كل 8 ساعات لمدة 5–7 أيام، أو Augmentin 1g قرص كل 12 ساعة لمدة 5–7 أيام.
   • في التهابات اللاهوائيات الشديدة أو الخراج اللثوي/الذروي: يُضاف Metronidazole (Flagyl) 500mg كل 8 ساعات لمدة 5 أيام.
   • في حال حساسية البنسلين: Clindamycin 300mg كل 6–8 ساعات أو Azithromycin 500mg مرة يومياً لمدة 3–5 أيام.

2. المسكنات ومضادات الالتهاب (NSAIDs):
   • للألم المتوسط إلى الشديد: Ibuprofen 400mg–600mg كل 8 ساعات بعد الأكل، أو Diclofenac Potassium (Cataflam) 50mg كل 8–12 ساعة.
   • لمرضى القرحة المعدية أو الربو أو الحوامل: Paracetamol 500mg–1000mg كل 6–8 ساعات (الحد الأقصى 4g يومياً).

3. الغسولات الفموية المطهرة:
   • Chlorhexidine Gluconate 0.12% مضمضة مرتين يومياً لمدة 7–10 أيام (تُستخدم بعد ساعة من تفريش الأسنان).

⚠️ تنبيه سريري: يجب مراجعة التاريخ المرضي للمريض (الحمل، الرضاعة، أمراض الكبد والكلى، السيولة، والحساسية الدوائية) قبل صرف أي وصفة.`;
  }

  // 7. تعليمات بعد خلع الضرس أو الجراحة الفموية
  if (
    p.includes('خلع') ||
    p.includes('قلع') ||
    p.includes('ضرس العقل') ||
    p.includes('جراح') ||
    p.includes('نزيف') ||
    p.includes('تعليمات')
  ) {
    return `🦷 تعليمات طبية للمريض بعد خلع الضرس أو الجراحة الفموية (${clinicName}):

1. إيقاف النزيف: العضّ بثبات على قطعة الشاش المعقم الموضوعة مكان الخلع لمدة 45 إلى 60 دقيقة متواصلة.
2. الحفاظ على الخثرة الدموية: تجنب المضمضة القوية أو البصق المتكرر أو الشرب بالمصاصة خلال أول 24 ساعة.
3. التغذية: تناول أطعمة لينة وباردة أو فاترة (زبادي، عصير طبيعي، شوربة فاترة) والابتعاد التام عن المشروبات الساخنة والأطعمة القاسية.
4. الامتناع التام عن التدخين لمدة 48 ساعة على الأقل لتفادي التهاب السنخ الجاف (Dry Socket / Alveolar Osteitis).
5. الكمادات: وضع كمادات باردة على الخد من الخارج (15 دقيقة وضع و15 دقيقة راحة) خلال أول 6 ساعات بعد الخلع الجراحي لتقليل التورم.
6. العناية والنظافة: بدءاً من اليوم الثاني، المضمضة اللطيفة بماء دافئ وملح 3 مرات يومياً بعد الوجبات.
7. الأدوية: الالتزام الدقيق بمواعيد المسكنات والمضاد الحيوي الموصوف من ${doctorName}.`;
  }

  // 8. خطة علاج العصب والجذور أو ألم السن الحاد
  if (
    p.includes('عصب') ||
    p.includes('جذور') ||
    p.includes('حشو') ||
    p.includes('ألم') ||
    p.includes('الم') ||
    p.includes('وجع') ||
    p.includes('خراج') ||
    p.includes('تورم') ||
    p.includes('انتفاخ') ||
    /\b([1-4][1-8]|[5-8][1-5])\b/.test(p)
  ) {
    const toothMatch = p.match(/\b([1-4][1-8]|[5-8][1-5])\b/);
    const toothLabel = toothMatch ? ` للسن رقم (${toothMatch[1]}) بنظام FDI` : '';
    return `🦷 البروتوكول الإكلينيكي لتشخيص الألم وخطة علاج العصب والجذور${toothLabel}:

1. التفريق التشخيصي السريع:
   • التهاب اللب الردود (Reversible Pulpitis): ألم لحظي مع البارد أو الحلو يزول فوراً بزوال المؤثر -> العلاج: إزالة التسوس، تبطين السن إن لزم، وحشوة تجميلية (Composite).
   • التهاب اللب غير الردود (Irreversible Pulpitis): ألم تلقائي نابض يزداد ليلاً أو مع الساخن ويستمر بعد زوال المؤثر -> العلاج: سحب عصب كامل (RCT).
   • التهاب النسج حول الذروية / الخراج الحاد: ألم شديد عند المضغ والقرع العمودي (Percussion +) -> العلاج: فتح السن لتصريف القيح أو تخفيف الإطباق وبدء علاج الجذور.

2. خطوات علاج الجذور المعتمد (Root Canal Therapy):
   • أخذ صورة أشعة ذروية (Periapical X-Ray) لتقييم عدد القنوات وانحناءاتها.
   • إعطاء التخدير الموضعي وعزل السن بالحاجز المطاطي (Rubber Dam) ثم فتح حجرة اللب (Access Cavity).
   • استئصال اللب وتحديد الطول العامل بدقة عبر جهاز (Apex Locator).
   • التحضير الميكانيكي بالمبارد الدوارة (Rotary NiTi Files) مع الإرواء المكثف بمحلول (NaOCl 5.25%) و (EDTA 17%).
   • التجفيف والحشو النهائي بأقماع (Gutta-Percha) مع (Bioceramic / Resin Sealer)، ثم وضع الحشوة النهائية والتاج الخزفي (Crown).`;
  }

  // 9. التركيبات الثابتة والمتحركة (زيركون، إيماكس، فينير، جسور)
  if (
    p.includes('تركيب') ||
    p.includes('زيركون') ||
    p.includes('إيماكس') ||
    p.includes('ايماكس') ||
    p.includes('فينير') ||
    p.includes('تاج') ||
    p.includes('طربوش') ||
    p.includes('جسر') ||
    p.includes('طقم')
  ) {
    return `👑 بروتوكول التركيبات الثابتة والتجميلية (Zirconia / E-max / Veneers):

1. التقييم والتحضير (Tooth Preparation):
   • التأكد من سلامة المعالجة اللبية واللثوية للدعامات، وترك أثر الطوق العاجي (Ferrule Effect) لا يقل عن 1.5 - 2 ملم.
   • تحضير خط إنهاء واضح ومصقول (Chamfer أو Rounded Shoulder) مع تخفيض إطباقي يتراوح بين 1.5 إلى 2 ملم.

2. الطبعات والتجربة (Impression & Try-in):
   • استخدام خيوط تبعيد اللثة (Retraction Cord) وأخذ طبعة دقيقة بمادة (Addition Silicone / PVS) أو ماسح رقمي (Intraoral Scanner).
   • فحص انطباق الحواف (Marginal Fit)، نقاط التماس الجانبية، والإطباق الساكن والوظيفي قبل الإلصاق النهائي.

3. الإلصاق النهائي (Cementation):
   • تيجان الزيركون: تنظيف السطح الداخلي، Sandblasting، واستخدام (Resin-Modified Glass Ionomer أو Self-Adhesive Resin Cement).
   • تيجان وعدسات E-max: تخريش بحمض الهيدروفلوريك (HF 5% لمدة 20 ثانية)، وضع Silane، وإلصاق بـ Adhesive Resin Cement.`;
  }

  // 10. زراعة الأسنان أو تقويم الأسنان أو اللثة أو الأطفال أو التخدير أو التعقيم
  if (
    p.includes('زراعة') ||
    p.includes('زرعة') ||
    p.includes('تقويم') ||
    p.includes('لثة') ||
    p.includes('تنظيف') ||
    p.includes('جير') ||
    p.includes('تبييض') ||
    p.includes('أطفال') ||
    p.includes('اطفال') ||
    p.includes('تخدير') ||
    p.includes('بنج') ||
    p.includes('تعقيم')
  ) {
    return `🦷 الدليل الإكلينيكي المتخصص (${clinicName} — ${doctorName}):

• علاج اللثة والتقليح (Scaling & Periodontics): إزالة التكلسات فوق وتحت اللثوية بجهاز Ultrasonic Scaler، صقل السطوح (Polishing)، ووصف مضمضة Chlorhexidine 0.12% مع تعليمات التفريش السليم.
• زراعة الأسنان (Dental Implants): تقييم كثافة وأبعاد العظم عبر أشعة (CBCT)، التأكد من ضبط السكري التراكمي (HbA1c < 7%)، الغرس الجراحي العقيم بعزم ثبات أولي (35–45 Ncm)، والانتظار 3–4 أشهر للاندماج العظمي قبل التركيب.
• طب أسنان الأطفال (Pedodontics): بتر اللب الحيوي (Pulpotomy) للأسنان المؤقتة باستخدام MTA أو Formocresol وتغطيتها بتاج معدن غير قابل للصدأ (Stainless Steel Crown)، أو الحفاظ على المسافة بـ (Space Maintainer) عند الخلع المبكر.
• التخدير الموضعي الآمن: Lidocaine 2% with Epinephrine 1:100,000 (الجرعة القصوى 4.4–7 ملغ/كغ). لمرضى الضغط والقلب غير المسيطر عليه يُفضّل Mepivacaine 3% Plain بدون قابض وعائي أو تقليل الأدرينالين إلى أقصى حد (بحد أقصى كربولتين 1:100,000 مع السحب المسبق Aspiration).`;
  }

  // 11. إجابة ذكية شاملة تتفاعل مع رسالة المستخدم وتعرض ملخص العيادة
  const debtorsCount = Array.isArray(ctx.pendingDebtsPatients) ? ctx.pendingDebtsPatients.length : 0;
  const lowCount = Array.isArray(ctx.lowStockAlerts) ? ctx.lowStockAlerts.length : 0;
  const fin = ctx.financialSummary || {};

  let financialBlock = '';
  if (Array.isArray(ctx.currencySummaries) && ctx.currencySummaries.length > 0) {
    financialBlock = ctx.currencySummaries
      .map(
        (c) =>
          `• عملة ${c.currency}: المقبوض ${Number(c.totalCollectedRevenue || 0).toLocaleString()} | الديون ${Number(c.totalPendingDebts || 0).toLocaleString()} | الصافي ${Number(c.netCashProfit || 0).toLocaleString()}`
      )
      .join('\n');
  } else {
    financialBlock = `• إجمالي السندات: ${fin.totalReceipts || 0} سند\n• المقبوض: ${Number(fin.totalCollected || 0).toLocaleString()} ${defaultCurr}\n• الديون المتبقية: ${Number(fin.totalPendingDebts || 0).toLocaleString()} ${defaultCurr} (${debtorsCount} مريض)\n• المصروفات: ${Number(fin.totalExpenses || 0).toLocaleString()} ${defaultCurr}`;
  }

  return `مرحباً بك في المساعد الطبي والمالي الذكي المدمج في (${clinicName}):

بخصوص استفسارك: "${p.slice(0, 120)}"

📌 المؤشرات الحية لعيادتك الآن:
${financialBlock}
• نواقص المخزون الطبي: ${lowCount} صنف

💡 كيف يمكنني مساعدتك فوراً؟ يمكنك كتابة أي طلب مثل:
1. "كشف ديون المرضى بالتفصيل" أو البحث باسم مريض أو رقم سند.
2. "تقرير نواقص المخزون" أو "ملخص صافي الأرباح والمصروفات".
3. استشارات طبية: "وصفة مضاد حيوي ومسكن لخراج سني"، "خطة علاج عصب للسن 16"، "تعليمات بعد خلع ضرس العقل"، أو "بروتوكول تحضير وإلصاق الزيركون".`;
}

export interface AssistantDetailedResponse {
  reply: string;
  model: string;
  modelLabel: string;
  providerUsed?: 'gemini' | 'groq' | 'openrouter' | 'server' | 'local';
  isFallbackApplied?: boolean;
  webSources?: Array<{ title: string; uri: string }>;
}

export function buildClinicalSystemPrompt(
  clinicContext?: Record<string, unknown> | null,
  prompt?: string
): string {
  const ctx = (clinicContext || {}) as Record<string, unknown>;
  const id = (ctx.identity || {}) as Record<string, unknown>;
  const clinicName = String(id.clinicAr || 'عيادة السعيدي لطب وجراحة الفم والأسنان');
  const doctorName = String(id.doctorAr || 'د. صلاح الدين السعيدي');
  const specialty = String(id.specialtyAr || 'طب وجراحة الفم والأسنان');
  const defaultCurr = String(id.defaultCurrency || 'ريال يمني');

  let contextSnippet = '';
  if (ctx.financialSummary) {
    const fin = ctx.financialSummary as Record<string, unknown>;
    contextSnippet += `\n- إجمالي السندات: ${fin.totalReceipts || 0} | الديون الآجلة: ${fin.totalDebtors || 0} مريض`;
  }
  if (Array.isArray(ctx.pendingDebtsPatients) && ctx.pendingDebtsPatients.length > 0) {
    const topDebts = ctx.pendingDebtsPatients
      .slice(0, 8)
      .map((d: Record<string, unknown>) => `${d.patientName}: ${Number(d.remainingAmount).toLocaleString()} ${d.currency || defaultCurr}`)
      .join('، ');
    contextSnippet += `\n- أبرز حالات الذمم الآجلة: ${topDebts}`;
  }
  if (Array.isArray(ctx.lowStockAlerts) && ctx.lowStockAlerts.length > 0) {
    const lowNames = ctx.lowStockAlerts
      .slice(0, 6)
      .map((i: Record<string, unknown>) => `${i.name} (المتبقي: ${i.qty})`)
      .join('، ');
    contextSnippet += `\n- نواقص المخزون: ${lowNames}`;
  }
  if (Array.isArray(ctx.servicesCatalog) && ctx.servicesCatalog.length > 0) {
    const srvNames = ctx.servicesCatalog
      .slice(0, 10)
      .map((s: Record<string, unknown>) => `${s.name}: ${Number(s.price).toLocaleString()} ${defaultCurr}`)
      .join(' | ');
    contextSnippet += `\n- خدمات العيادة وأسعارها: ${srvNames}`;
  }

  return `أنت المساعد الذكي المعتمد والمتخصص لعيادة "${clinicName}" — ${specialty}.
الطبيب المعالج والمالك: ${doctorName}.
العملة الافتراضية: ${defaultCurr}.

بيانات العيادة الحالية المتاحة لديك:
${contextSnippet || '- لا توجد بيانات إضافية محددة.'}

إرشادات العمل:
1. قدّم إجابات إكلينيكية، مالية، ومحاسبية دقيقة واحترافية باللغة العربية.
2. عند الاستفسار عن بروتوكولات الأدوية (المضادات، المسكنات، التخدير)، اذكر الجرعات المعتمدة علمياً والاحتياطات وموانع الاستعمال.
3. عند تحليل صور الأشعة أو الحالات السريرية المرفقة، بيّن الملاحظات التشخيصية وخطة العلاج التقديرية بدقة.
4. حافظ على الأسلوب المباشر والمهني والمنسق بنقاط واضحة دون حشو.`;
}

function extractCleanBase64(dataUrl: string): { base64: string; mimeType: string } {
  const match = String(dataUrl || '').match(/^data:([^;]+);base64,(.+)$/);
  if (match) {
    return { mimeType: match[1], base64: match[2] };
  }
  return { mimeType: 'image/jpeg', base64: dataUrl };
}

// 1. Google Gemini Direct (BYOK with automatic multi-model & grounding failover)
async function callGeminiDirect(
  payload: AssistantRequestPayload,
  config: AIProviderConfig,
  signal?: AbortSignal
): Promise<AssistantDetailedResponse> {
  const apiKey = config.geminiApiKey.trim();
  if (!apiKey) throw new Error('مفتاح Gemini API غير مدخل.');

  const primaryModel = sanitizeGeminiModel(config.geminiModel);
  const candidateModels = Array.from(
    new Set([
      primaryModel,
      'gemini-2.5-flash',
      'gemini-3-flash-preview',
      'gemini-flash-latest',
      'gemini-3.1-flash-lite-preview',
    ])
  );

  const systemPrompt = buildClinicalSystemPrompt(payload.clinicContext, payload.prompt);

  const contents: Array<Record<string, unknown>> = [];

  if (Array.isArray(payload.history)) {
    for (const h of payload.history.slice(-6)) {
      if (h.text && h.text.trim()) {
        contents.push({
          role: h.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: h.text.trim() }],
        });
      }
    }
  }

  const userParts: Array<Record<string, unknown>> = [];
  const hasAttachment = Boolean(payload.attachment && payload.attachment.base64Data);
  if (hasAttachment && payload.attachment) {
    const { base64, mimeType } = extractCleanBase64(payload.attachment.base64Data);
    userParts.push({
      inlineData: {
        mimeType: payload.attachment.mimeType || mimeType,
        data: base64,
      },
    });
  }
  userParts.push({
    text: payload.prompt || 'يرجى تقديم المشورة الطبية والمالية بناءً على سياق العيادة.',
  });

  contents.push({
    role: 'user',
    parts: userParts,
  });

  const baseBody: Record<string, unknown> = {
    systemInstruction: {
      parts: [{ text: systemPrompt }],
    },
    contents,
    generationConfig: {
      temperature: 0.3,
    },
  };

  let lastStatus = 0;
  let lastErrorText = '';

  for (const targetModel of candidateModels) {
    if (signal?.aborted) {
      throw new DOMException('Aborted by user', 'AbortError');
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(targetModel)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const bodyWithGrounding: Record<string, unknown> =
      config.enableWebGrounding && !hasAttachment
        ? { ...baseBody, tools: [{ googleSearch: {} }] }
        : baseBody;

    let res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyWithGrounding),
      signal,
    });

    // If web search grounding tool caused a 400 error on this key/model, retry immediately without tools
    if (!res.ok && res.status === 400 && bodyWithGrounding.tools) {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(baseBody),
        signal,
      });
    }

    if (res.ok) {
      const data = await res.json();
      const candidate = data?.candidates?.[0];
      const replyParts = candidate?.content?.parts || [];
      const textReply = replyParts
        .map((p: Record<string, unknown>) => (typeof p.text === 'string' ? p.text : ''))
        .filter(Boolean)
        .join('\n\n')
        .trim();

      if (textReply) {
        if (targetModel !== config.geminiModel) {
          config.geminiModel = targetModel;
          saveAIProviderConfig(config);
        }

        const webSources: Array<{ title: string; uri: string }> = [];
        const groundingChunks = candidate?.groundingMetadata?.groundingChunks || [];
        for (const chunk of groundingChunks) {
          if (chunk?.web?.uri) {
            webSources.push({
              title: chunk.web.title || chunk.web.uri,
              uri: chunk.web.uri,
            });
          }
        }

        return {
          reply: textReply,
          model: targetModel,
          modelLabel: formatModelDisplayLabel(targetModel),
          providerUsed: 'gemini',
          webSources: webSources.length > 0 ? webSources : undefined,
        };
      }
    } else {
      lastStatus = res.status;
      lastErrorText = await res.text().catch(() => '');
      // If key itself is invalid (401/403 API_KEY_INVALID), stop trying other Gemini models
      if (
        (res.status === 400 || res.status === 401 || res.status === 403) &&
        lastErrorText.includes('API_KEY_INVALID')
      ) {
        break;
      }
    }
  }

  throw new Error(`Gemini API Error (${lastStatus}): ${lastErrorText.slice(0, 180)}`);
}

// 2. Groq Cloud Direct (Text, Vision, & High-Speed Reasoning)
async function callGroqDirect(
  payload: AssistantRequestPayload,
  config: AIProviderConfig,
  hasImage: boolean,
  signal?: AbortSignal
): Promise<AssistantDetailedResponse> {
  const apiKey = config.groqApiKey.trim();
  if (!apiKey) throw new Error('مفتاح Groq Cloud API غير مدخل.');

  const candidateModels = hasImage
    ? Array.from(
        new Set([
          sanitizeGroqVisionModel(config.groqVisionModel),
          'meta-llama/llama-4-scout-17b-16e-instruct',
          'meta-llama/llama-4-maverick-17b-128e-instruct',
        ])
      )
    : Array.from(
        new Set([
          sanitizeGroqTextModel(config.groqTextModel),
          'llama-3.3-70b-versatile',
          'llama-3.1-8b-instant',
          'meta-llama/llama-4-scout-17b-16e-instruct',
        ])
      );

  const systemPrompt = buildClinicalSystemPrompt(payload.clinicContext, payload.prompt);
  const messages: Array<Record<string, unknown>> = [
    { role: 'system', content: systemPrompt },
  ];

  if (Array.isArray(payload.history)) {
    for (const h of payload.history.slice(-6)) {
      if (h.text && h.text.trim()) {
        messages.push({
          role: h.role === 'assistant' ? 'assistant' : 'user',
          content: h.text.trim(),
        });
      }
    }
  }

  if (hasImage && payload.attachment?.base64Data) {
    messages.push({
      role: 'user',
      content: [
        { type: 'text', text: payload.prompt || 'تحليل الصورة المرفقة' },
        {
          type: 'image_url',
          image_url: { url: payload.attachment.base64Data },
        },
      ],
    });
  } else {
    messages.push({
      role: 'user',
      content: payload.prompt || 'تحليل السجلات الطبية والمالية للعيادة.',
    });
  }

  let lastStatus = 0;
  let lastErrorText = '';

  for (const targetModel of candidateModels) {
    if (signal?.aborted) {
      throw new DOMException('Aborted by user', 'AbortError');
    }

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: targetModel,
        messages,
        temperature: 0.3,
        max_tokens: 2048,
      }),
      signal,
    });

    if (res.ok) {
      const data = await res.json();
      const reply = String(data?.choices?.[0]?.message?.content || '').trim();
      if (reply) {
        if (!hasImage && targetModel !== config.groqTextModel) {
          config.groqTextModel = targetModel;
          saveAIProviderConfig(config);
        } else if (hasImage && targetModel !== config.groqVisionModel) {
          config.groqVisionModel = targetModel;
          saveAIProviderConfig(config);
        }
        return {
          reply,
          model: targetModel,
          modelLabel: formatModelDisplayLabel(targetModel),
          providerUsed: 'groq',
        };
      }
    } else {
      lastStatus = res.status;
      lastErrorText = await res.text().catch(() => '');
      if (res.status === 401) break;
    }
  }

  throw new Error(`Groq API Error (${lastStatus}): ${lastErrorText.slice(0, 180)}`);
}

// 3. OpenRouter Direct (Gemini 2.5, DeepSeek, Llama 3.3, Free & Auto Router)
async function callOpenRouterDirect(
  payload: AssistantRequestPayload,
  config: AIProviderConfig,
  hasImage: boolean,
  signal?: AbortSignal
): Promise<AssistantDetailedResponse> {
  const apiKey = config.openrouterApiKey.trim();
  if (!apiKey) throw new Error('مفتاح OpenRouter API غير مدخل.');

  const candidateModels = hasImage
    ? ['google/gemini-2.5-flash', 'openrouter/auto', 'openrouter/free']
    : Array.from(
        new Set([
          sanitizeOpenRouterModel(config.openrouterModel),
          'google/gemini-2.5-flash',
          'deepseek/deepseek-chat',
          'meta-llama/llama-3.3-70b-instruct',
          'openrouter/free',
          'meta-llama/llama-3.3-70b-instruct:free',
          'openrouter/auto',
        ])
      );

  const systemPrompt = buildClinicalSystemPrompt(payload.clinicContext, payload.prompt);
  const messages: Array<Record<string, unknown>> = [
    { role: 'system', content: systemPrompt },
  ];

  if (Array.isArray(payload.history)) {
    for (const h of payload.history.slice(-6)) {
      if (h.text && h.text.trim()) {
        messages.push({
          role: h.role === 'assistant' ? 'assistant' : 'user',
          content: h.text.trim(),
        });
      }
    }
  }

  if (hasImage && payload.attachment?.base64Data) {
    messages.push({
      role: 'user',
      content: [
        { type: 'text', text: payload.prompt || 'تحليل الصورة المرفقة' },
        {
          type: 'image_url',
          image_url: { url: payload.attachment.base64Data },
        },
      ],
    });
  } else {
    messages.push({
      role: 'user',
      content: payload.prompt || 'تحليل السجلات الطبية والمالية للعيادة.',
    });
  }

  let lastStatus = 0;
  let lastErrorText = '';

  for (const targetModel of candidateModels) {
    if (signal?.aborted) {
      throw new DOMException('Aborted by user', 'AbortError');
    }

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'https://saedic.vercel.app',
        'X-Title': 'ALSSAEDIC Dental Clinic ERP',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: targetModel,
        messages,
        temperature: 0.3,
      }),
      signal,
    });

    if (res.ok) {
      const data = await res.json();
      const reply = String(data?.choices?.[0]?.message?.content || '').trim();
      if (reply) {
        if (!hasImage && targetModel !== config.openrouterModel) {
          config.openrouterModel = targetModel;
          saveAIProviderConfig(config);
        }
        return {
          reply,
          model: targetModel,
          modelLabel: formatModelDisplayLabel(targetModel),
          providerUsed: 'openrouter',
        };
      }
    } else {
      lastStatus = res.status;
      lastErrorText = await res.text().catch(() => '');
      if (res.status === 401) break;
    }
  }

  throw new Error(`OpenRouter API Error (${lastStatus}): ${lastErrorText.slice(0, 180)}`);
}

// 4. Groq Whisper Large-v3 Speech-to-Text Dispatcher
export async function transcribeAudioWithGroqWhisper(
  audioBlob: Blob,
  apiKey: string,
  model = 'whisper-large-v3'
): Promise<string> {
  const cleanKey = apiKey.trim();
  if (!cleanKey) {
    throw new Error('مفتاح Groq Cloud API غير مدخل للنسخ الصوتي.');
  }

  const formData = new FormData();
  formData.append('file', audioBlob, 'audio.webm');
  formData.append('model', model || 'whisper-large-v3');
  formData.append('language', 'ar');
  formData.append(
    'prompt',
    'مصطلحات طب الأسنان: تقليح اللثة، زيركون، علاج العصب، إيماكس، خلع ضرس العقل، كشف ديون المرضى، جرد نواقص المخزون'
  );

  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cleanKey}`,
    },
    body: formData,
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new Error(`Groq Whisper Error (${res.status}): ${errorText}`);
  }

  const data = await res.json();
  return String(data?.text || '').trim();
}

// 5. Test Provider API Connection Ping
export async function testAIProviderConnection(
  provider: 'gemini' | 'groq' | 'openrouter',
  config: AIProviderConfig
): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const start = Date.now();
  try {
    if (provider === 'gemini') {
      const apiKey = config.geminiApiKey.trim();
      if (!apiKey) {
        // Test built-in server Gemini if no custom key was typed
        const srvRes = await fetch('/api/gemini/assistant', {
          method: 'POST',
          headers: getStoredSessionAuthHeaders(),
          body: JSON.stringify({ prompt: 'قل كلمة: متصل', taskType: 'chat' }),
        });
        const latencyMs = Date.now() - start;
        const parsed = await safeParseJsonResponse<{ reply?: string; model?: string }>(srvRes);
        if (parsed.ok && parsed.data?.reply && parsed.data.model !== 'local-clinical-engine') {
          return { ok: true, latencyMs };
        }
        return { ok: false, latencyMs, error: 'يرجى إدخال مفتاح Gemini API الصحيح من Google AI Studio' };
      }

      const primaryModel = sanitizeGeminiModel(config.geminiModel);
      const candidates = Array.from(
        new Set([
          primaryModel,
          'gemini-2.5-flash',
          'gemini-3-flash-preview',
          'gemini-flash-latest',
          'gemini-3.1-flash-lite-preview',
        ])
      );

      let lastStatus = 0;
      let lastErrText = '';

      for (const candidate of candidates) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(candidate)}:generateContent?key=${encodeURIComponent(apiKey)}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: 'قل كلمة: متصل' }] }],
            generationConfig: { maxOutputTokens: 12 },
          }),
        });

        if (res.ok) {
          config.geminiModel = candidate;
          saveAIProviderConfig(config);
          return { ok: true, latencyMs: Date.now() - start };
        }

        lastStatus = res.status;
        lastErrText = await res.text().catch(() => '');
        if (
          (res.status === 400 || res.status === 401 || res.status === 403) &&
          lastErrText.includes('API_KEY_INVALID')
        ) {
          return {
            ok: false,
            latencyMs: Date.now() - start,
            error: 'مفتاح Gemini API غير صالح (تأكد من نسخه كاملاً من Google AI Studio)',
          };
        }
      }

      return {
        ok: false,
        latencyMs: Date.now() - start,
        error: `خطأ (${lastStatus}): ${lastErrText.slice(0, 100)}`,
      };
    }

    if (provider === 'groq') {
      const apiKey = config.groqApiKey.trim();
      if (!apiKey) return { ok: false, latencyMs: 0, error: 'يرجى إدخال مفتاح Groq API أولاً' };
      const primaryModel = sanitizeGroqTextModel(config.groqTextModel);
      const candidates = Array.from(
        new Set([
          primaryModel,
          'llama-3.3-70b-versatile',
          'llama-3.1-8b-instant',
          'meta-llama/llama-4-scout-17b-16e-instruct',
        ])
      );

      let lastStatus = 0;
      let lastErrText = '';

      for (const candidate of candidates) {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: candidate,
            messages: [{ role: 'user', content: 'Say OK' }],
            max_tokens: 8,
          }),
        });

        if (res.ok) {
          config.groqTextModel = candidate;
          saveAIProviderConfig(config);
          return { ok: true, latencyMs: Date.now() - start };
        }

        lastStatus = res.status;
        lastErrText = await res.text().catch(() => '');
        if (res.status === 401) {
          return {
            ok: false,
            latencyMs: Date.now() - start,
            error: 'مفتاح Groq API غير صالح (تأكد من يبدأ بـ gsk_)',
          };
        }
      }

      return {
        ok: false,
        latencyMs: Date.now() - start,
        error: `خطأ (${lastStatus}): ${lastErrText.slice(0, 100)}`,
      };
    }

    if (provider === 'openrouter') {
      const apiKey = config.openrouterApiKey.trim();
      if (!apiKey) return { ok: false, latencyMs: 0, error: 'يرجى إدخال مفتاح OpenRouter API أولاً' };
      const primaryModel = sanitizeOpenRouterModel(config.openrouterModel);
      const candidates = Array.from(
        new Set([
          primaryModel,
          'google/gemini-2.5-flash',
          'deepseek/deepseek-chat',
          'meta-llama/llama-3.3-70b-instruct',
          'openrouter/free',
          'meta-llama/llama-3.3-70b-instruct:free',
          'openrouter/auto',
        ])
      );

      let lastStatus = 0;
      let lastErrText = '';

      for (const candidate of candidates) {
        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'https://saedic.vercel.app',
            'X-Title': 'ALSSAEDIC Dental Clinic ERP',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: candidate,
            messages: [{ role: 'user', content: 'Say OK' }],
            max_tokens: 8,
          }),
        });

        if (res.ok) {
          config.openrouterModel = candidate;
          saveAIProviderConfig(config);
          return { ok: true, latencyMs: Date.now() - start };
        }

        lastStatus = res.status;
        lastErrText = await res.text().catch(() => '');
        if (res.status === 401) {
          return {
            ok: false,
            latencyMs: Date.now() - start,
            error: 'مفتاح OpenRouter API غير صالح (تأكد من يبدأ بـ sk-or-)',
          };
        }
      }

      return {
        ok: false,
        latencyMs: Date.now() - start,
        error: `خطأ (${lastStatus}): ${lastErrText.slice(0, 100)}`,
      };
    }
  } catch (err: unknown) {
    const latencyMs = Date.now() - start;
    return {
      ok: false,
      latencyMs,
      error: err instanceof Error ? err.message : 'تعذر الاتصال بالخادم.',
    };
  }
  return { ok: false, latencyMs: 0, error: 'مزود غير معروف' };
}

// ==================== PRIMARY-TO-SECONDARY DYNAMIC FALLBACK ORCHESTRATOR ====================
export async function queryClinicAssistantDetailed(
  payload: AssistantRequestPayload,
  externalSignal?: AbortSignal
): Promise<AssistantDetailedResponse> {
  const config = loadAIProviderConfig();
  const hasImage = Boolean(
    payload.attachment &&
      payload.attachment.mimeType &&
      payload.attachment.mimeType.startsWith('image/')
  );

  const priorityOrder: ('gemini' | 'groq' | 'openrouter')[] =
    Array.isArray(config.customPriority) && config.customPriority.length > 0
      ? config.customPriority
      : ['gemini', 'groq', 'openrouter'];

  let failoverCount = 0;

  // Iterate through configured client-side BYOK providers with automatic failover
  for (const provider of priorityOrder) {
    if (externalSignal?.aborted) {
      throw new DOMException('Aborted by user', 'AbortError');
    }

    if (provider === 'gemini' && config.geminiApiKey.trim()) {
      try {
        const res = await callGeminiDirect(payload, config, externalSignal);
        if (failoverCount > 0) {
          return {
            ...res,
            modelLabel: `${res.modelLabel} — (تم تطبيق التبديل التلقائي)`,
            isFallbackApplied: true,
          };
        }
        return res;
      } catch (err: unknown) {
        if (externalSignal?.aborted) throw err;
        failoverCount++;
      }
    }

    if (provider === 'groq' && config.groqApiKey.trim()) {
      try {
        const res = await callGroqDirect(payload, config, hasImage, externalSignal);
        if (failoverCount > 0) {
          return {
            ...res,
            modelLabel: `${res.modelLabel} — (تم تطبيق التبديل التلقائي)`,
            isFallbackApplied: true,
          };
        }
        return res;
      } catch (err: unknown) {
        if (externalSignal?.aborted) throw err;
        failoverCount++;
      }
    }

    if (provider === 'openrouter' && config.openrouterApiKey.trim()) {
      try {
        const res = await callOpenRouterDirect(payload, config, hasImage, externalSignal);
        if (failoverCount > 0) {
          return {
            ...res,
            modelLabel: `${res.modelLabel} — (تم تطبيق التبديل التلقائي)`,
            isFallbackApplied: true,
          };
        }
        return res;
      } catch (err: unknown) {
        if (externalSignal?.aborted) throw err;
        failoverCount++;
      }
    }
  }

  // Quaternary Fallback: Server Proxy Endpoint (/api/gemini/assistant)
  const controller = new AbortController();
  const timeoutMs = payload.attachment ? 45_000 : 30_000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  if (externalSignal) {
    if (externalSignal.aborted) {
      clearTimeout(timer);
      throw new DOMException('Aborted by user', 'AbortError');
    }
    externalSignal.addEventListener('abort', () => {
      clearTimeout(timer);
      controller.abort();
    });
  }

  try {
    const response = await fetch('/api/gemini/assistant', {
      method: 'POST',
      headers: getStoredSessionAuthHeaders(),
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timer);

    const parsed = await safeParseJsonResponse<{
      reply?: string;
      model?: string;
      modelLabel?: string;
      error?: string;
    }>(response);
    if (parsed.ok && parsed.data?.reply && String(parsed.data.reply).trim()) {
      const model = String(parsed.data.model || 'gemini-2.5-flash').trim();
      const baseLabel =
        String(parsed.data.modelLabel || '').trim() || formatModelDisplayLabel(model);
      const modelLabel =
        failoverCount > 0 ? `${baseLabel} — (خادم العيادة الاحتياطي)` : baseLabel;
      return {
        reply: String(parsed.data.reply).trim(),
        model,
        modelLabel,
        providerUsed: 'server',
        isFallbackApplied: failoverCount > 0,
      };
    }
  } catch {
    clearTimeout(timer);
    if (externalSignal?.aborted) {
      throw new DOMException('Aborted by user', 'AbortError');
    }
  }

  if (externalSignal?.aborted) {
    throw new DOMException('Aborted by user', 'AbortError');
  }

  // Final Ultra-Safe Fallback: Local Clinical Intelligence Engine (Runs purely in browser)
  return {
    reply: generateLocalClinicalResponse(payload.prompt, payload.clinicContext),
    model: 'local-clinical-engine',
    modelLabel:
      failoverCount > 0
        ? `${formatModelDisplayLabel('local-clinical-engine')} — (تبديل سريري آمن)`
        : formatModelDisplayLabel('local-clinical-engine'),
    providerUsed: 'local',
    isFallbackApplied: true,
  };
}

export async function queryClinicAssistant(payload: AssistantRequestPayload): Promise<string> {
  const result = await queryClinicAssistantDetailed(payload);
  return result.reply;
}

export async function parseSmartReceiptWithFallback(
  text: string,
  availableServices: DentalServiceItem[],
  defaultCurrency: string
): Promise<SmartReceiptParseResult | null> {
  const cleanText = String(text || '').trim();
  if (!cleanText) return null;

  // 1. Try server endpoint (/api/gemini/parse-receipt) which also uses X-Gemini-Api-Key header if set
  try {
    const response = await fetch('/api/gemini/parse-receipt', {
      method: 'POST',
      headers: getStoredSessionAuthHeaders(),
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
    // Continue to client-side fallback
  }

  // 2. Client-side fallback using configured Gemini / Groq / OpenRouter keys if server endpoint is unreachable
  try {
    const config = loadAIProviderConfig();
    if (config.geminiApiKey.trim() || config.groqApiKey.trim() || config.openrouterApiKey.trim()) {
      const serviceNames = availableServices
        .slice(0, 50)
        .map((s) => `${s.name} (${s.price || 0})`)
        .join('، ');
      const jsonPrompt = `استخرج بيانات سند القبض من النص التالي بصيغة JSON فقط بدون أي شرح:
النص: "${cleanText}"
الخدمات المتاحة: ${serviceNames}
العملة الافتراضية: ${defaultCurrency}
الحقول المطلوبة في JSON: patientName, patientPhone, services (مصفوفة نصوص), toothFDI, totalAmount (رقم), paidAmount (رقم), currency, paymentMethod, notes.`;

      const res = await queryClinicAssistantDetailed({
        prompt: jsonPrompt,
        taskType: 'chat',
      });
      const jsonMatch = res.reply.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsedObj = JSON.parse(jsonMatch[0]) as SmartReceiptParseResult;
        if (parsedObj && (parsedObj.patientName || (parsedObj.services && parsedObj.services.length > 0))) {
          return parsedObj;
        }
      }
    }
  } catch {
    // Fall back to caller's local deterministic parser
  }

  return null;
}
