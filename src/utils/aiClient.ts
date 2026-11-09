import {
  AIProviderConfig,
  ClinicSettings,
  CurrencyFinancialSummary,
  DEFAULT_AI_CONFIG,
  DentalServiceItem,
  ExpenseRecord,
  InventoryItem,
  PendingDataEntryProposal,
  PendingInventoryEntryData,
  PendingReceiptEntryData,
  ReceiptRecord,
} from '../types/clinic';

export const AI_CONFIG_STORAGE_KEY = 'docai_ai_providers_config_v1';

// ==================== 12 TO 15 MODELS PER PROVIDER (ORDERED STRONGEST & FASTEST) ====================
export const GEMINI_CANDIDATE_MODELS = [
  'gemini-2.5-flash',
  'gemini-3-flash-preview',
  'gemini-3.1-pro-preview',
  'gemini-2.5-pro',
  'gemini-3.1-flash-lite-preview',
  'gemini-2.5-flash-lite',
  'gemini-flash-latest',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-pro',
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b',
] as const;

export const GROQ_TEXT_MODELS = [
  'llama-3.3-70b-versatile',
  'meta-llama/llama-4-maverick-17b-128e-instruct',
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'qwen/qwen3-32b',
  'deepseek-r1-distill-llama-70b',
  'qwen-qwq-32b',
  'mistral-saba-24b',
  'compound-beta',
  'compound-beta-mini',
  'llama-3.1-8b-instant',
  'gemma2-9b-it',
  'allam-2-7b',
  'llama3-70b-8192',
  'llama3-8b-8192',
] as const;

// Dedicated Vision Models (At least 3-4 models per provider reserved for image analysis)
export const GROQ_VISION_MODELS = [
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'meta-llama/llama-4-maverick-17b-128e-instruct',
  'llama-3.2-90b-vision-preview',
  'llama-3.2-11b-vision-preview',
] as const;

export const GEMINI_VISION_MODELS = [
  'gemini-2.5-flash',
  'gemini-3-flash-preview',
  'gemini-2.5-pro',
  'gemini-2.0-flash',
] as const;

export const OPENROUTER_VISION_MODELS = [
  'google/gemini-2.5-flash',
  'meta-llama/llama-4-maverick:free',
  'meta-llama/llama-4-scout:free',
  'qwen/qwen2.5-vl-72b-instruct:free',
  'google/gemma-3-27b-it:free',
] as const;

// Dedicated Audio STT Models
export const GROQ_WHISPER_MODELS = [
  'whisper-large-v3-turbo',
  'whisper-large-v3',
  'distil-whisper-large-v3-en',
] as const;

// Dedicated Audio Reading (TTS) Models
export const AI_TTS_MODELS = [
  'playai-tts-arabic',
  'playai-tts',
  'gemini-2.5-flash-preview-tts',
  'browser-ar-tts',
] as const;

// Dedicated High-Precision Models for Direct Data Entry (Receipts & Inventory)
export const DIRECT_DATA_ENTRY_MODELS = [
  'llama-3.3-70b-versatile',
  'meta-llama/llama-4-maverick-17b-128e-instruct',
  'qwen/qwen3-32b',
  'gemini-2.5-flash',
  'gemini-3-flash-preview',
  'gemini-2.5-pro',
  'deepseek/deepseek-chat-v3-0324:free',
  'google/gemini-2.5-flash',
] as const;

export const OPENROUTER_MODELS = [
  'google/gemini-2.5-flash',
  'deepseek/deepseek-chat-v3-0324:free',
  'deepseek/deepseek-r1:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'meta-llama/llama-4-maverick:free',
  'meta-llama/llama-4-scout:free',
  'qwen/qwen3-235b-a22b:free',
  'qwen/qwen3-32b:free',
  'google/gemini-2.0-flash-exp:free',
  'mistralai/mistral-small-3.1-24b-instruct:free',
  'google/gemma-3-27b-it:free',
  'qwen/qwen-2.5-72b-instruct:free',
  'deepseek/deepseek-chat',
  'openrouter/free',
  'openrouter/auto',
] as const;

export const MODEL_DISPLAY_LABELS: Record<string, string> = {
  // Gemini (12 models)
  'gemini-2.5-flash': 'Gemini 2.5 Flash (الأسرع والأقوى - موصى به)',
  'gemini-3-flash-preview': 'Gemini 3 Flash Preview (الجيل الثالث السريع)',
  'gemini-3.1-pro-preview': 'Gemini 3.1 Pro Preview (تحليل معمق)',
  'gemini-2.5-pro': 'Gemini 2.5 Pro (دقة فائقة للبيانات)',
  'gemini-3.1-flash-lite-preview': 'Gemini 3.1 Flash Lite (خفيف وفوري)',
  'gemini-2.5-flash-lite': 'Gemini 2.5 Flash Lite (استجابة لحظية)',
  'gemini-flash-latest': 'Gemini Flash Latest (تحديث تلقائي)',
  'gemini-2.0-flash': 'Gemini 2.0 Flash',
  'gemini-2.0-flash-lite': 'Gemini 2.0 Flash Lite',
  'gemini-1.5-pro': 'Gemini 1.5 Pro',
  'gemini-1.5-flash': 'Gemini 1.5 Flash',
  'gemini-1.5-flash-8b': 'Gemini 1.5 Flash 8B',

  // Groq (14 Text + 4 Vision + 3 Audio)
  'llama-3.3-70b-versatile': 'Groq Llama 3.3 70B Versatile (الأقوى والأسرع - موصى به)',
  'meta-llama/llama-4-maverick-17b-128e-instruct': 'Groq Llama 4 Maverick 17B (الجيل الرابع - نصوص وصور)',
  'meta-llama/llama-4-scout-17b-16e-instruct': 'Groq Llama 4 Scout 17B (فائق السرعة - نصوص وصور)',
  'qwen/qwen3-32b': 'Groq Qwen 3 32B (ممتاز للعربية والحسابات)',
  'deepseek-r1-distill-llama-70b': 'Groq DeepSeek R1 70B (استنتاج وتحليل عميق)',
  'qwen-qwq-32b': 'Groq Qwen QwQ 32B (منطق ومعالجة بيانات)',
  'mistral-saba-24b': 'Groq Mistral Saba 24B (مخصص للغة العربية)',
  'compound-beta': 'Groq Compound Beta (نموذج مركب ذكي)',
  'compound-beta-mini': 'Groq Compound Beta Mini (مركب سريع)',
  'llama-3.1-8b-instant': 'Groq Llama 3.1 8B Instant (استجابة لحظية)',
  'gemma2-9b-it': 'Groq Gemma 2 9B IT (كفاءة واستقرار)',
  'allam-2-7b': 'Groq ALLaM 2 7B (النموذج العربي المتخصص)',
  'llama3-70b-8192': 'Groq Llama 3 70B',
  'llama3-8b-8192': 'Groq Llama 3 8B',
  'llama-3.2-90b-vision-preview': 'Groq Llama 3.2 90B Vision (تحليل صور دقيق)',
  'llama-3.2-11b-vision-preview': 'Groq Llama 3.2 11B Vision (تحليل صور سريع)',

  // Audio & TTS
  'whisper-large-v3-turbo': 'Groq Whisper Large v3 Turbo (تفريغ صوتي فائق السرعة)',
  'whisper-large-v3': 'Groq Whisper Large v3 (أعلى دقة صوتية للعربية)',
  'distil-whisper-large-v3-en': 'Groq Distil Whisper v3',
  'playai-tts-arabic': 'Groq PlayAI Arabic TTS (قارئ صوتي عربي ذكي)',
  'playai-tts': 'Groq PlayAI Multilingual TTS (قارئ صوتي متعدد اللغات)',
  'gemini-2.5-flash-preview-tts': 'Gemini 2.5 Flash Audio TTS (قارئ جوجل الصوتي)',
  'browser-ar-tts': 'محرك النطق الصوتي الفوري للمتصفح (بدون إنترنت)',

  // OpenRouter (15 models)
  'google/gemini-2.5-flash': 'OpenRouter Gemini 2.5 Flash (موصى به)',
  'deepseek/deepseek-chat-v3-0324:free': 'OpenRouter DeepSeek V3 0324 (مجاني وسريع)',
  'deepseek/deepseek-r1:free': 'OpenRouter DeepSeek R1 (مجاني - تحليل عميق)',
  'meta-llama/llama-3.3-70b-instruct:free': 'OpenRouter Llama 3.3 70B (مجاني)',
  'meta-llama/llama-4-maverick:free': 'OpenRouter Llama 4 Maverick (مجاني - نصوص وصور)',
  'meta-llama/llama-4-scout:free': 'OpenRouter Llama 4 Scout (مجاني - نصوص وصور)',
  'qwen/qwen3-235b-a22b:free': 'OpenRouter Qwen 3 235B (مجاني - عملاق)',
  'qwen/qwen3-32b:free': 'OpenRouter Qwen 3 32B (مجاني)',
  'google/gemini-2.0-flash-exp:free': 'OpenRouter Gemini 2.0 Flash (مجاني)',
  'mistralai/mistral-small-3.1-24b-instruct:free': 'OpenRouter Mistral Small 3.1 24B (مجاني)',
  'google/gemma-3-27b-it:free': 'OpenRouter Gemma 3 27B (مجاني - نصوص وصور)',
  'qwen/qwen-2.5-72b-instruct:free': 'OpenRouter Qwen 2.5 72B (مجاني)',
  'qwen/qwen2.5-vl-72b-instruct:free': 'OpenRouter Qwen 2.5 VL 72B Vision (مجاني للصور)',
  'deepseek/deepseek-chat': 'OpenRouter DeepSeek V3',
  'meta-llama/llama-3.3-70b-instruct': 'OpenRouter Llama 3.3 70B',
  'openrouter/free': 'OpenRouter Free Router (توجيه مجاني تلقائي)',
  'openrouter/auto': 'OpenRouter Auto Router (توجيه ذكي تلقائي)',
  'local-clinical-engine': 'المحرك السريري المدمج (خادم العيادة)',
};

export function sanitizeApiKeyInput(rawKey?: string | null): string {
  return String(rawKey || '')
    .replace(/^Bearer\s+/i, '')
    .replace(/["'`\s\r\n]/g, '')
    .trim();
}

export function formatModelDisplayLabel(modelName?: string | null): string {
  const clean = String(modelName || '').trim();
  if (!clean) return 'Gemini 2.5 Flash';
  return MODEL_DISPLAY_LABELS[clean] || clean;
}

export function sanitizeGeminiModel(model?: string | null): string {
  const m = String(model || '').trim();
  if (!m || m === 'gemini-3.8-flash' || m === 'gemini-3.1-flash-lite') {
    return 'gemini-2.5-flash';
  }
  return m;
}

export function sanitizeGroqTextModel(model?: string | null): string {
  const m = String(model || '').trim();
  if (!m || m === 'mixtral-8x7b-32768' || m === 'gemma-7b-it') {
    return 'llama-3.3-70b-versatile';
  }
  return m;
}

export function sanitizeGroqVisionModel(model?: string | null): string {
  const m = String(model || '').trim();
  if (!m) {
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
      geminiApiKey: sanitizeApiKeyInput(parsed.geminiApiKey),
      geminiModel,
      geminiVisionModel: String(parsed.geminiVisionModel || DEFAULT_AI_CONFIG.geminiVisionModel || 'gemini-2.5-flash').trim(),
      enableWebGrounding: parsed.enableWebGrounding !== false,

      groqApiKey: sanitizeApiKeyInput(parsed.groqApiKey),
      groqTextModel,
      groqVisionModel,
      groqWhisperModel: String(parsed.groqWhisperModel || DEFAULT_AI_CONFIG.groqWhisperModel).trim(),

      openrouterApiKey: sanitizeApiKeyInput(parsed.openrouterApiKey),
      openrouterModel,
      openrouterVisionModel: String(parsed.openrouterVisionModel || DEFAULT_AI_CONFIG.openrouterVisionModel || 'google/gemini-2.5-flash').trim(),

      sttEngine: parsed.sttEngine === 'browser' ? 'browser' : 'groq',
      ttsModel: String(parsed.ttsModel || DEFAULT_AI_CONFIG.ttsModel || 'playai-tts-arabic').trim(),
      dataEntryModel: String(parsed.dataEntryModel || DEFAULT_AI_CONFIG.dataEntryModel || 'llama-3.3-70b-versatile').trim(),
      customPriority:
        Array.isArray(parsed.customPriority) && parsed.customPriority.length > 0
          ? parsed.customPriority
          : DEFAULT_AI_CONFIG.customPriority,
      verifiedModels: parsed.verifiedModels,
    };

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
        geminiApiKey: sanitizeApiKeyInput(config.geminiApiKey),
        groqApiKey: sanitizeApiKeyInput(config.groqApiKey),
        openrouterApiKey: sanitizeApiKeyInput(config.openrouterApiKey),
        geminiModel: sanitizeGeminiModel(config.geminiModel),
        groqTextModel: sanitizeGroqTextModel(config.groqTextModel),
        groqVisionModel: sanitizeGroqVisionModel(config.groqVisionModel),
        openrouterModel: sanitizeOpenRouterModel(config.openrouterModel),
        ttsModel: String(config.ttsModel || DEFAULT_AI_CONFIG.ttsModel || 'playai-tts-arabic').trim(),
        dataEntryModel: String(config.dataEntryModel || DEFAULT_AI_CONFIG.dataEntryModel || 'llama-3.3-70b-versatile').trim(),
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

// 1. Google Gemini Direct (BYOK with automatic 12-model & grounding failover)
async function callGeminiDirect(
  payload: AssistantRequestPayload,
  config: AIProviderConfig,
  signal?: AbortSignal
): Promise<AssistantDetailedResponse> {
  const apiKey = sanitizeApiKeyInput(config.geminiApiKey);
  if (!apiKey) throw new Error('مفتاح Gemini API غير مدخل.');

  const hasImage = Boolean(
    payload.attachment &&
      payload.attachment.mimeType &&
      payload.attachment.mimeType.startsWith('image/')
  );

  const primaryModel = hasImage
    ? sanitizeGeminiModel(config.geminiVisionModel || config.geminiModel)
    : sanitizeGeminiModel(config.geminiModel);

  const verifiedList = config.verifiedModels?.gemini || [];
  const candidateModels = hasImage
    ? Array.from(new Set([primaryModel, ...GEMINI_VISION_MODELS, ...GEMINI_CANDIDATE_MODELS]))
    : Array.from(new Set([primaryModel, ...verifiedList, ...GEMINI_CANDIDATE_MODELS]));

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
  let attemptIdx = 0;

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
        if (!hasImage && targetModel !== config.geminiModel) {
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
          isFallbackApplied: attemptIdx > 0,
          webSources: webSources.length > 0 ? webSources : undefined,
        };
      }
    } else {
      lastStatus = res.status;
      lastErrorText = await res.text().catch(() => '');
      attemptIdx++;
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

// 2. Groq Cloud Direct (14 Ranked Text Models + 4 Dedicated Vision Models with Instant Auto-Failover)
async function callGroqDirect(
  payload: AssistantRequestPayload,
  config: AIProviderConfig,
  hasImage: boolean,
  signal?: AbortSignal
): Promise<AssistantDetailedResponse> {
  const apiKey = sanitizeApiKeyInput(config.groqApiKey);
  if (!apiKey) throw new Error('مفتاح Groq Cloud API غير مدخل.');

  const verifiedList = config.verifiedModels?.groq || [];
  const candidateModels = hasImage
    ? Array.from(
        new Set([
          sanitizeGroqVisionModel(config.groqVisionModel),
          ...GROQ_VISION_MODELS,
        ])
      )
    : Array.from(
        new Set([
          sanitizeGroqTextModel(config.groqTextModel),
          ...verifiedList,
          ...GROQ_TEXT_MODELS,
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
        { type: 'text', text: payload.prompt || 'تحليل الصورة المرفقة بدقة واستخراج كافة التفاصيل الطبية والمالية' },
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
  let attemptIdx = 0;

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
      let reply = String(data?.choices?.[0]?.message?.content || '').trim();
      // Strip <think>...</think> reasoning blocks if returned by DeepSeek R1 / QwQ models
      reply = reply.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
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
          isFallbackApplied: attemptIdx > 0,
        };
      }
    } else {
      lastStatus = res.status;
      lastErrorText = await res.text().catch(() => '');
      attemptIdx++;
      if (res.status === 401) break;
    }
  }

  throw new Error(`Groq API Error (${lastStatus}): ${lastErrorText.slice(0, 180)}`);
}

// 3. OpenRouter Direct (15 Ranked Free & Fast Models + 5 Dedicated Vision Models with Auto-Failover)
async function callOpenRouterDirect(
  payload: AssistantRequestPayload,
  config: AIProviderConfig,
  hasImage: boolean,
  signal?: AbortSignal
): Promise<AssistantDetailedResponse> {
  const apiKey = sanitizeApiKeyInput(config.openrouterApiKey);
  if (!apiKey) throw new Error('مفتاح OpenRouter API غير مدخل.');

  const verifiedList = config.verifiedModels?.openrouter || [];
  const candidateModels = hasImage
    ? Array.from(
        new Set([
          config.openrouterVisionModel || 'google/gemini-2.5-flash',
          ...OPENROUTER_VISION_MODELS,
          'openrouter/auto',
          'openrouter/free',
        ])
      )
    : Array.from(
        new Set([
          sanitizeOpenRouterModel(config.openrouterModel),
          ...verifiedList,
          ...OPENROUTER_MODELS,
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

// 4. Groq Whisper Multi-Model Speech-to-Text Dispatcher (with automatic failover across 3 Whisper models)
export async function transcribeAudioWithGroqWhisper(
  audioBlob: Blob,
  apiKey: string,
  preferredModel = 'whisper-large-v3-turbo'
): Promise<string> {
  const cleanKey = sanitizeApiKeyInput(apiKey);
  if (!cleanKey) {
    throw new Error('مفتاح Groq Cloud API غير مدخل للنسخ الصوتي.');
  }

  const candidateWhisperModels = Array.from(
    new Set([preferredModel, ...GROQ_WHISPER_MODELS])
  );

  let lastErr = '';
  for (const model of candidateWhisperModels) {
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.webm');
    formData.append('model', model);
    if (!model.endsWith('-en')) {
      formData.append('language', 'ar');
    }
    formData.append(
      'prompt',
      'مصطلحات طب الأسنان: تقليح اللثة، زيركون، علاج العصب، إيماكس، خلع ضرس العقل، كشف ديون المرضى، جرد نواقص المخزون، سند قبض'
    );

    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cleanKey}`,
      },
      body: formData,
    });

    if (res.ok) {
      const data = await res.json();
      const text = String(data?.text || '').trim();
      if (text) return text;
    } else {
      const errorText = await res.text().catch(() => '');
      lastErr = `(${res.status}) ${errorText.slice(0, 120)}`;
      if (res.status === 401) break;
    }
  }

  throw new Error(`Groq Whisper Error: ${lastErr}`);
}

// 4B. Dedicated Audio / TTS Reading Dispatcher (Groq PlayAI Arabic TTS / Gemini TTS / Browser Speech Fallback)
let activeAudioElement: HTMLAudioElement | null = null;

export function stopActiveAISpeech(): void {
  try {
    if (activeAudioElement) {
      activeAudioElement.pause();
      activeAudioElement.src = '';
      activeAudioElement = null;
    }
  } catch {
    // Ignore
  }
  try {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  } catch {
    // Ignore
  }
}

export async function speakTextWithAIModel(
  rawText: string,
  config: AIProviderConfig,
  onEnd: () => void
): Promise<void> {
  stopActiveAISpeech();

  const cleanText = String(rawText || '')
    .replace(/[*#_`~>-]/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1200);

  if (!cleanText) {
    onEnd();
    return;
  }

  const ttsModel = config.ttsModel || 'playai-tts-arabic';
  const groqKey = sanitizeApiKeyInput(config.groqApiKey);

  // 1. Try Groq PlayAI Arabic / Multilingual TTS if selected and key exists
  if ((ttsModel === 'playai-tts-arabic' || ttsModel === 'playai-tts') && groqKey) {
    const modelsToTry =
      ttsModel === 'playai-tts-arabic'
        ? ['playai-tts-arabic', 'playai-tts']
        : ['playai-tts', 'playai-tts-arabic'];

    for (const m of modelsToTry) {
      try {
        const voice = m === 'playai-tts-arabic' ? 'Nasser-PlayAI' : 'Arista-PlayAI';
        const res = await fetch('https://api.groq.com/openai/v1/audio/speech', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${groqKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: m,
            input: cleanText.slice(0, 600),
            voice,
            response_format: 'wav',
          }),
        });

        if (res.ok) {
          const blob = await res.blob();
          if (blob.size > 200) {
            const audioUrl = URL.createObjectURL(blob);
            const audio = new Audio(audioUrl);
            activeAudioElement = audio;
            audio.onended = () => {
              URL.revokeObjectURL(audioUrl);
              if (activeAudioElement === audio) activeAudioElement = null;
              onEnd();
            };
            audio.onerror = () => {
              URL.revokeObjectURL(audioUrl);
              if (activeAudioElement === audio) activeAudioElement = null;
              onEnd();
            };
            await audio.play();
            return;
          }
        }
      } catch {
        // Fall through to browser speech synthesis
      }
    }
  }

  // 2. Reliable Browser Arabic Speech Synthesis Fallback
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'ar-SA';
    const voices = window.speechSynthesis.getVoices?.() || [];
    const arabicVoice = voices.find((v) => v.lang && v.lang.toLowerCase().startsWith('ar'));
    if (arabicVoice) {
      utterance.voice = arabicVoice;
    }
    utterance.onend = () => onEnd();
    utterance.onerror = () => onEnd();
    window.speechSynthesis.speak(utterance);
  } else {
    onEnd();
  }
}

export interface ProviderTestResult {
  ok: boolean;
  latencyMs: number;
  testedModel?: string;
  activeModelsCount?: number;
  activeModels?: string[];
  error?: string;
}

// 5. Dynamic Provider API Connection & Model Pool Probing (10-15 Free/Fast High-Quality Models)
export async function testAIProviderConnection(
  provider: 'gemini' | 'groq' | 'openrouter',
  config: AIProviderConfig
): Promise<ProviderTestResult> {
  const start = Date.now();
  try {
    if (provider === 'gemini') {
      const apiKey = sanitizeApiKeyInput(config.geminiApiKey);
      config.geminiApiKey = apiKey;

      if (!apiKey) {
        const srvRes = await fetch('/api/gemini/assistant', {
          method: 'POST',
          headers: getStoredSessionAuthHeaders(),
          body: JSON.stringify({ prompt: 'قل كلمة: متصل', taskType: 'chat' }),
        });
        const latencyMs = Date.now() - start;
        const parsed = await safeParseJsonResponse<{ reply?: string; model?: string }>(srvRes);
        if (parsed.ok && parsed.data?.reply && parsed.data.model !== 'local-clinical-engine') {
          return {
            ok: true,
            latencyMs,
            testedModel: parsed.data.model || 'gemini-2.5-flash',
            activeModelsCount: GEMINI_CANDIDATE_MODELS.length,
            activeModels: [...GEMINI_CANDIDATE_MODELS],
          };
        }
        return {
          ok: false,
          latencyMs,
          error: 'يرجى إدخال مفتاح Gemini API الصحيح من Google AI Studio',
        };
      }

      // Step A: Dynamically fetch available Gemini models on this API key
      let discoveredGeminiModels: string[] = [];
      try {
        const listRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`
        );
        if (listRes.ok) {
          const listData = await listRes.json();
          const rawModels = Array.isArray(listData?.models) ? listData.models : [];
          discoveredGeminiModels = rawModels
            .filter(
              (m: Record<string, unknown>) =>
                typeof m?.name === 'string' &&
                Array.isArray(m?.supportedGenerationMethods) &&
                m.supportedGenerationMethods.includes('generateContent')
            )
            .map((m: Record<string, unknown>) => String(m.name).replace(/^models\//, ''));
        } else if (listRes.status === 400 || listRes.status === 401 || listRes.status === 403) {
          const errTxt = await listRes.text().catch(() => '');
          if (errTxt.includes('API_KEY_INVALID')) {
            return {
              ok: false,
              latencyMs: Date.now() - start,
              error: 'مفتاح Gemini API غير صالح (تأكد من نسخه كاملاً من Google AI Studio)',
            };
          }
        }
      } catch {
        // Continue to direct model probe
      }

      const rankedPool = Array.from(
        new Set([
          sanitizeGeminiModel(config.geminiModel),
          ...GEMINI_CANDIDATE_MODELS.filter(
            (m) => discoveredGeminiModels.length === 0 || discoveredGeminiModels.includes(m)
          ),
          ...GEMINI_CANDIDATE_MODELS,
        ])
      ).slice(0, 15);

      let lastStatus = 0;
      let lastErrText = '';

      for (const candidate of rankedPool) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(candidate)}:generateContent?key=${encodeURIComponent(apiKey)}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: 'OK' }] }],
            generationConfig: { maxOutputTokens: 8 },
          }),
        });

        if (res.ok) {
          const verifiedPool = Array.from(
            new Set([candidate, ...rankedPool.filter((m) => m !== candidate)])
          ).slice(0, 15);
          config.geminiModel = candidate;
          config.verifiedModels = {
            ...(config.verifiedModels || {}),
            gemini: verifiedPool,
            lastCheckedAt: new Date().toISOString(),
          };
          saveAIProviderConfig(config);
          return {
            ok: true,
            latencyMs: Date.now() - start,
            testedModel: candidate,
            activeModelsCount: verifiedPool.length,
            activeModels: verifiedPool,
          };
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

      // If /models list succeeded even though quota was temporarily rate-limited on generateContent
      if (discoveredGeminiModels.length > 0 && lastStatus === 429) {
        const verifiedPool = rankedPool.slice(0, 15);
        config.verifiedModels = {
          ...(config.verifiedModels || {}),
          gemini: verifiedPool,
          lastCheckedAt: new Date().toISOString(),
        };
        saveAIProviderConfig(config);
        return {
          ok: true,
          latencyMs: Date.now() - start,
          testedModel: verifiedPool[0],
          activeModelsCount: verifiedPool.length,
          activeModels: verifiedPool,
        };
      }

      return {
        ok: false,
        latencyMs: Date.now() - start,
        error: `خطأ (${lastStatus}): ${lastErrText.slice(0, 100)}`,
      };
    }

    if (provider === 'groq') {
      const apiKey = sanitizeApiKeyInput(config.groqApiKey);
      config.groqApiKey = apiKey;
      if (!apiKey) {
        return { ok: false, latencyMs: 0, error: 'يرجى إدخال مفتاح Groq API أولاً' };
      }

      // Step A: Dynamically query https://api.groq.com/openai/v1/models to validate the key & discover all active models
      let liveGroqModelIds: string[] = [];
      let modelsEndpointOk = false;
      try {
        const modelsRes = await fetch('https://api.groq.com/openai/v1/models', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        });

        if (modelsRes.status === 401 || modelsRes.status === 403) {
          return {
            ok: false,
            latencyMs: Date.now() - start,
            error: 'مفتاح Groq API غير صالح أو منتهي الصلاحية (تأكد من نسخه كاملاً ويبدأ بـ gsk_)',
          };
        }

        if (modelsRes.ok) {
          modelsEndpointOk = true;
          const modelsJson = await modelsRes.json();
          const dataArr = Array.isArray(modelsJson?.data) ? modelsJson.data : [];
          liveGroqModelIds = dataArr
            .filter((item: Record<string, unknown>) => typeof item?.id === 'string' && item.active !== false)
            .map((item: Record<string, unknown>) => String(item.id));
        }
      } catch {
        // Fallback to direct chat completions probing if /models fetch had network issue
      }

      // Build dynamic 12-15 ranked models pool (Strongest & Fastest first)
      const nonChatKeywords = ['whisper', 'tts', 'guard', 'safeguard', 'orpheus'];
      const liveChatModels = liveGroqModelIds.filter(
        (id) => !nonChatKeywords.some((kw) => id.toLowerCase().includes(kw))
      );

      const prioritizedLivePool = Array.from(
        new Set([
          sanitizeGroqTextModel(config.groqTextModel),
          ...GROQ_TEXT_MODELS.filter(
            (m) => liveChatModels.length === 0 || liveChatModels.includes(m)
          ),
          ...liveChatModels,
          ...GROQ_TEXT_MODELS,
        ])
      ).slice(0, 15);

      // Also auto-verify best available Vision model from live account models
      const availableVision = GROQ_VISION_MODELS.filter(
        (m) => liveGroqModelIds.length === 0 || liveGroqModelIds.includes(m)
      );
      if (availableVision.length > 0 && !availableVision.includes(config.groqVisionModel as never)) {
        config.groqVisionModel = availableVision[0];
      }

      let lastStatus = 0;
      let lastErrText = '';

      // Probe top candidates to verify live generation speed & set fastest active model
      for (const candidate of prioritizedLivePool.slice(0, 6)) {
        try {
          const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: candidate,
              messages: [{ role: 'user', content: 'OK' }],
              max_tokens: 5,
              temperature: 0,
            }),
          });

          if (res.ok) {
            const finalPool = Array.from(
              new Set([candidate, ...prioritizedLivePool.filter((m) => m !== candidate)])
            ).slice(0, 15);
            config.groqTextModel = candidate;
            config.verifiedModels = {
              ...(config.verifiedModels || {}),
              groq: finalPool,
              lastCheckedAt: new Date().toISOString(),
            };
            saveAIProviderConfig(config);
            return {
              ok: true,
              latencyMs: Date.now() - start,
              testedModel: candidate,
              activeModelsCount: finalPool.length,
              activeModels: finalPool,
            };
          }

          lastStatus = res.status;
          lastErrText = await res.text().catch(() => '');
          if (res.status === 401) {
            return {
              ok: false,
              latencyMs: Date.now() - start,
              error: 'مفتاح Groq API غير صالح (تأكد من أنه يبدأ بـ gsk_)',
            };
          }
        } catch (probeErr: unknown) {
          lastErrText = probeErr instanceof Error ? probeErr.message : 'Network error';
        }
      }

      // If /models succeeded (valid key + active models discovered), mark success even if one model was rate-limited
      if (modelsEndpointOk && prioritizedLivePool.length > 0) {
        config.groqTextModel = prioritizedLivePool[0];
        config.verifiedModels = {
          ...(config.verifiedModels || {}),
          groq: prioritizedLivePool,
          lastCheckedAt: new Date().toISOString(),
        };
        saveAIProviderConfig(config);
        return {
          ok: true,
          latencyMs: Date.now() - start,
          testedModel: prioritizedLivePool[0],
          activeModelsCount: prioritizedLivePool.length,
          activeModels: prioritizedLivePool,
        };
      }

      return {
        ok: false,
        latencyMs: Date.now() - start,
        error: `خطأ (${lastStatus}): ${lastErrText.slice(0, 100) || 'تعذر التحقق من نماذج Groq'}`,
      };
    }

    if (provider === 'openrouter') {
      const apiKey = sanitizeApiKeyInput(config.openrouterApiKey);
      config.openrouterApiKey = apiKey;
      if (!apiKey) {
        return { ok: false, latencyMs: 0, error: 'يرجى إدخال مفتاح OpenRouter API أولاً' };
      }

      const rankedPool = Array.from(
        new Set([sanitizeOpenRouterModel(config.openrouterModel), ...OPENROUTER_MODELS])
      ).slice(0, 15);

      let lastStatus = 0;
      let lastErrText = '';

      for (const candidate of rankedPool.slice(0, 6)) {
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
            messages: [{ role: 'user', content: 'OK' }],
            max_tokens: 6,
          }),
        });

        if (res.ok) {
          const finalPool = Array.from(
            new Set([candidate, ...rankedPool.filter((m) => m !== candidate)])
          ).slice(0, 15);
          config.openrouterModel = candidate;
          config.verifiedModels = {
            ...(config.verifiedModels || {}),
            openrouter: finalPool,
            lastCheckedAt: new Date().toISOString(),
          };
          saveAIProviderConfig(config);
          return {
            ok: true,
            latencyMs: Date.now() - start,
            testedModel: candidate,
            activeModelsCount: finalPool.length,
            activeModels: finalPool,
          };
        }

        lastStatus = res.status;
        lastErrText = await res.text().catch(() => '');
        if (res.status === 401) {
          return {
            ok: false,
            latencyMs: Date.now() - start,
            error: 'مفتاح OpenRouter API غير صالح (تأكد من أنه يبدأ بـ sk-or-)',
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

// ==================== 6. DEDICATED DIRECT DATA-ENTRY MODEL PARSER (RECEIPTS & INVENTORY) ====================
export function isDirectDataEntryIntent(promptText: string): 'receipt' | 'inventory' | null {
  const norm = String(promptText || '').trim();
  if (!norm) return null;

  // Avoid triggering data entry if user is asking for a report/summary/list
  if (/(كشف|تقرير|ملخص|كم عدد|اعرض|استعلام|بحث عن|ما هي|قائمة)/i.test(norm) && !/(سجل|أضف|اضف|ادخل|أدخل|اصدر|أصدر|انشئ|أنشئ|توريد|خصم من المخزون)/i.test(norm)) {
    return null;
  }

  const receiptActionRegex = /(سجل سند|أضف سند|اضف سند|إصدار سند|اصدر سند|أصدر سند|انشئ سند|أنشئ سند|سند قبض|سند جديد|ادخل سند|أدخل سند|فاتورة للمريض|سند للمريض)/i;
  const inventoryActionRegex = /(أضف للمخزون|اضف للمخزون|إضافة للمخزون|اضافة للمخزون|أضف صنف|اضف صنف|ادخل في المخزون|أدخل في المخزون|توريد مخزون|تزويد مخزون|سحب من المخزون|خصم من المخزون|تحديث مخزون|صنف جديد)/i;

  if (inventoryActionRegex.test(norm)) return 'inventory';
  if (receiptActionRegex.test(norm)) return 'receipt';

  return null;
}

export async function parseDirectDataEntryProposal(
  promptText: string,
  settings: ClinicSettings,
  inventory: InventoryItem[],
  attachment?: { name: string; mimeType: string; base64Data: string } | null,
  forcedType?: 'receipt' | 'inventory'
): Promise<PendingDataEntryProposal | null> {
  const detectedType = forcedType || isDirectDataEntryIntent(promptText);
  if (!detectedType) return null;

  const config = loadAIProviderConfig();
  const preferredModel = config.dataEntryModel || 'llama-3.3-70b-versatile';
  const defaultCurrency = settings.identity.defaultCurrency || 'ريال يمني';

  const servicesCatalogStr = settings.services
    .map((s) => `${s.name} (${s.price} ${defaultCurrency})`)
    .join('، ');
  const inventoryCatalogStr = inventory
    .map((i) => `${i.name} [المتوفر: ${i.qty} ${i.unit}، السعر: ${i.unitPrice}]`)
    .join('، ');

  const extractionPrompt =
    detectedType === 'receipt'
      ? `أنت النموذج المسؤول عن الإدخال المباشر للسندات المالية في العيادة.
حلل طلب المستخدم التالي واستخرج بيانات سند القبض بدقة تامة بصيغة JSON فقط بدون أي نص إضافي:
طلب المستخدم: "${promptText}"
الخدمات المتاحة وأسعارها: ${servicesCatalogStr}
العملة الافتراضية: ${defaultCurrency}

أعد كائن JSON فقط يحتوي على الحقول التالية:
{
  "type": "receipt",
  "patientName": "اسم المريض",
  "patientPhone": "رقم الهاتف إن وجد أو فارغ",
  "services": ["اسم الخدمة 1"],
  "toothFDI": "رقم السن إن وجد أو فارغ",
  "totalAmount": 0,
  "paidAmount": 0,
  "currency": "${defaultCurrency}",
  "paymentMethod": "نقداً",
  "notes": "ملاحظات السند"
}`
      : `أنت النموذج المسؤول عن الإدخال المباشر للمخزون الطبي في العيادة.
حلل طلب المستخدم التالي واستخرج بيانات عملية المخزون بدقة تامة بصيغة JSON فقط بدون أي نص إضافي:
طلب المستخدم: "${promptText}"
الأصناف الموجودة حالياً في المخزون: ${inventoryCatalogStr || 'لا توجد أصناف بعد'}

أعد كائن JSON فقط يحتوي على الحقول التالية:
{
  "type": "inventory",
  "operation": "add_new أو restock أو consume",
  "name": "اسم الصنف الطبي",
  "qty": 1,
  "unit": "علبة / قطعة / كرتون / أمبولة",
  "minQty": 5,
  "unitPrice": 0,
  "linkedService": "",
  "recordAsExpense": true,
  "notes": "ملاحظات"
}`;

  let modelUsedLabel = formatModelDisplayLabel(preferredModel);

  try {
    // Route through the dedicated Data Entry model first if API key is available
    const tempConfig: AIProviderConfig = {
      ...config,
      groqTextModel: preferredModel.includes('gemini') || preferredModel.includes('/') ? config.groqTextModel : preferredModel,
      geminiModel: preferredModel.startsWith('gemini') ? preferredModel : config.geminiModel,
      openrouterModel: preferredModel.includes('/') && !preferredModel.startsWith('meta-llama/llama-4') ? preferredModel : config.openrouterModel,
    };
    saveAIProviderConfig(tempConfig);

    const aiRes = await queryClinicAssistantDetailed({
      prompt: extractionPrompt,
      attachment,
      taskType: 'chat',
    });

    // Restore user's config selection
    saveAIProviderConfig(config);

    modelUsedLabel = aiRes.modelLabel || modelUsedLabel;
    const jsonMatch = aiRes.reply.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
      if (detectedType === 'receipt') {
        const rawServices = Array.isArray(parsed.services)
          ? parsed.services.map((s) => String(s).trim()).filter(Boolean)
          : [];
        const matchedServices =
          rawServices.length > 0
            ? rawServices
            : settings.services
                .filter((s) => promptText.includes(s.name))
                .map((s) => s.name);
        const finalServices =
          matchedServices.length > 0
            ? matchedServices
            : [settings.services[0]?.name || 'كشف واستشارة'];

        const catalogSum = finalServices.reduce((sum, sName) => {
          const found = settings.services.find((srv) => srv.name === sName);
          return sum + (found ? Number(found.price) || 0 : 0);
        }, 0);

        const totalAmount = Number(parsed.totalAmount) > 0 ? Number(parsed.totalAmount) : catalogSum || 5000;
        const paidAmount =
          parsed.paidAmount !== undefined && Number(parsed.paidAmount) >= 0
            ? Number(parsed.paidAmount)
            : totalAmount;
        const remainingAmount = Math.max(0, totalAmount - paidAmount);

        const receiptData: PendingReceiptEntryData = {
          patientName: String(parsed.patientName || '').trim() || 'مريض جديد',
          patientPhone: String(parsed.patientPhone || '').trim(),
          services: finalServices,
          toothFDI: String(parsed.toothFDI || '').trim(),
          totalAmount,
          paidAmount,
          remainingAmount,
          currency: String(parsed.currency || defaultCurrency).trim(),
          paymentMethod: String(parsed.paymentMethod || 'نقداً').trim(),
          notes: String(parsed.notes || 'إدخال مباشر عبر المساعد الذكي').trim(),
        };

        return {
          id: 'prop_rec_' + Date.now(),
          type: 'receipt',
          status: 'pending',
          modelUsed: modelUsedLabel,
          summaryText: `تم تجهيز مسودة سند قبض للمريض (${receiptData.patientName}) بمبلغ إجمالي ${receiptData.totalAmount.toLocaleString()} ${receiptData.currency}. يرجى مراجعة البيانات أدناه والموافقة عليها للحفظ:`,
          receiptData,
        };
      } else {
        const itemName = String(parsed.name || '').trim() || 'مستلزم طبي';
        const existingItem = inventory.find(
          (i) => i.name.trim() === itemName || itemName.includes(i.name.trim())
        );
        const opRaw = String(parsed.operation || '').toLowerCase();
        const operation: 'add_new' | 'restock' | 'consume' =
          opRaw === 'consume' || /(سحب|خصم|صرف|استهلاك)/.test(promptText)
            ? 'consume'
            : existingItem || opRaw === 'restock' || /(توريد|تزويد|إضافة كمية)/.test(promptText)
              ? 'restock'
              : 'add_new';

        const qty = Math.max(1, Number(parsed.qty) || 1);
        const unitPrice =
          Number(parsed.unitPrice) > 0
            ? Number(parsed.unitPrice)
            : existingItem?.unitPrice || 0;

        const inventoryData: PendingInventoryEntryData = {
          operation,
          existingItemId: existingItem?.id,
          name: existingItem ? existingItem.name : itemName,
          qty,
          unit: String(parsed.unit || existingItem?.unit || 'علبة').trim(),
          minQty: Number(parsed.minQty) || existingItem?.minQty || 5,
          unitPrice,
          totalCost: +(qty * unitPrice).toFixed(2),
          linkedService: String(parsed.linkedService || existingItem?.linkedService || '').trim(),
          recordAsExpense: Boolean(parsed.recordAsExpense ?? (operation !== 'consume')),
          notes: String(parsed.notes || 'إدخال مباشر عبر المساعد الذكي').trim(),
        };

        const opLabel =
          operation === 'consume'
            ? 'خصم/صرف كمية من المخزون'
            : operation === 'restock'
              ? 'توريد كمية إضافية للمخزون'
              : 'إضافة صنف جديد للمخزون';

        return {
          id: 'prop_inv_' + Date.now(),
          type: 'inventory',
          status: 'pending',
          modelUsed: modelUsedLabel,
          summaryText: `تم تجهيز عملية المخزون (${opLabel}): الصنف "${inventoryData.name}" — الكمية: ${inventoryData.qty} ${inventoryData.unit}. يرجى مراجعة البيانات والموافقة عليها للحفظ:`,
          inventoryData,
        };
      }
    }
  } catch {
    saveAIProviderConfig(config);
  }

  // Deterministic Local Fallback Parser if offline or JSON wasn't matched
  if (detectedType === 'receipt') {
    const numbers = (promptText.match(/\d+/g) || []).map(Number);
    const matchedServices = settings.services
      .filter((s) => promptText.includes(s.name) || s.keywords.some((kw) => promptText.includes(kw)))
      .map((s) => s.name);
    const finalServices = matchedServices.length > 0 ? matchedServices : [settings.services[0]?.name || 'كشف واستشارة'];
    const totalAmount = numbers.find((n) => n >= 500) || 10000;
    const paidAmount = numbers.length >= 2 && numbers[1] <= totalAmount ? numbers[1] : totalAmount;
    const nameMatch = promptText.match(/(?:للمريض|باسم|المريض)\s+([\u0600-\u06FF\s]{3,28})/);
    const patientName = nameMatch ? nameMatch[1].trim() : 'مريض جديد';

    const receiptData: PendingReceiptEntryData = {
      patientName,
      patientPhone: '',
      services: finalServices,
      toothFDI: '',
      totalAmount,
      paidAmount,
      remainingAmount: Math.max(0, totalAmount - paidAmount),
      currency: defaultCurrency,
      paymentMethod: 'نقداً',
      notes: 'إدخال مباشر عبر المساعد',
    };

    return {
      id: 'prop_rec_' + Date.now(),
      type: 'receipt',
      status: 'pending',
      modelUsed: modelUsedLabel,
      summaryText: `تم تجهيز مسودة سند قبض للمريض (${receiptData.patientName}). يرجى مراجعة الحقول والموافقة عليها للحفظ:`,
      receiptData,
    };
  } else {
    const numbers = (promptText.match(/\d+/g) || []).map(Number);
    const qty = numbers[0] || 1;
    const unitPrice = numbers[1] || 0;
    const cleanedName = promptText
      .replace(/(أضف للمخزون|اضف للمخزون|أضف صنف|اضف صنف|توريد مخزون|سحب من المخزون|\d+)/g, '')
      .trim()
      .slice(0, 40) || 'صنف مستلزمات طبية';

    const inventoryData: PendingInventoryEntryData = {
      operation: /(سحب|خصم|صرف)/.test(promptText) ? 'consume' : 'add_new',
      name: cleanedName,
      qty,
      unit: 'علبة',
      minQty: 5,
      unitPrice,
      totalCost: qty * unitPrice,
      linkedService: '',
      recordAsExpense: true,
      notes: 'إدخال مباشر عبر المساعد',
    };

    return {
      id: 'prop_inv_' + Date.now(),
      type: 'inventory',
      status: 'pending',
      modelUsed: modelUsedLabel,
      summaryText: `تم تجهيز عملية المخزون للصنف (${inventoryData.name}). يرجى مراجعة البيانات والموافقة عليها للحفظ:`,
      inventoryData,
    };
  }
}

