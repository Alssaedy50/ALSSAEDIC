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
  'qwen/qwen3.8-27b',
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'allam-2-7b',
  'openai/gpt-oss-safeguard-20b',
  'llama-3.3-70b-versatile',
  'meta-llama/llama-4-maverick-17b-128e-instruct',
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'qwen/qwen3-32b',
  'deepseek-r1-distill-llama-70b',
  'qwen-qwq-32b',
  'mistral-saba-24b',
  'compound-beta',
  'llama-3.1-8b-instant',
  'gemma2-9b-it',
] as const;

// Dedicated Vision Models (At least 4 models per provider reserved for image analysis)
export const GROQ_VISION_MODELS = [
  'qwen/qwen3.8-27b',
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
  'canopylabs/orpheus-arabic-saudi',
  'canopylabs/orpheus-v1-english',
  'gemini-2.5-flash-preview-tts',
  'browser-ar-tts',
] as const;

// Dedicated High-Precision Models for Direct Data Entry (Receipts & Inventory)
export const DIRECT_DATA_ENTRY_MODELS = [
  'openai/gpt-oss-120b',
  'qwen/qwen3.8-27b',
  'openai/gpt-oss-20b',
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
  // Gemini
  'gemini-2.5-flash': 'Gemini 2.5 Flash',
  'gemini-3-flash-preview': 'Gemini 3 Flash',
  'gemini-3.1-pro-preview': 'Gemini 3.1 Pro',
  'gemini-2.5-pro': 'Gemini 2.5 Pro',
  'gemini-3.1-flash-lite-preview': 'Gemini 3.1 Lite',
  'gemini-2.5-flash-lite': 'Gemini 2.5 Lite',
  'gemini-flash-latest': 'Gemini Flash',
  'gemini-2.0-flash': 'Gemini 2.0 Flash',
  'gemini-2.0-flash-lite': 'Gemini 2.0 Lite',
  'gemini-1.5-pro': 'Gemini 1.5 Pro',
  'gemini-1.5-flash': 'Gemini 1.5 Flash',
  'gemini-1.5-flash-8b': 'Gemini 1.5 8B',

  // Groq
  'qwen/qwen3.8-27b': 'Qwen 3.8 27B',
  'openai/gpt-oss-120b': 'GPT-OSS 120B',
  'openai/gpt-oss-20b': 'GPT-OSS 20B',
  'allam-2-7b': 'ALLaM 2 7B (عربي)',
  'openai/gpt-oss-safeguard-20b': 'GPT-OSS Safe 20B',
  'llama-3.3-70b-versatile': 'Llama 3.3 70B',
  'meta-llama/llama-4-maverick-17b-128e-instruct': 'Llama 4 Maverick',
  'meta-llama/llama-4-scout-17b-16e-instruct': 'Llama 4 Scout',
  'qwen/qwen3-32b': 'Qwen 3 32B',
  'deepseek-r1-distill-llama-70b': 'DeepSeek R1 70B',
  'qwen-qwq-32b': 'Qwen QwQ 32B',
  'mistral-saba-24b': 'Mistral Saba 24B',
  'compound-beta': 'Compound Beta',
  'compound-beta-mini': 'Compound Mini',
  'llama-3.1-8b-instant': 'Llama 3.1 8B',
  'gemma2-9b-it': 'Gemma 2 9B',
  'llama-3.2-90b-vision-preview': 'Llama 3.2 90B Vision',
  'llama-3.2-11b-vision-preview': 'Llama 3.2 11B Vision',

  // Audio & TTS
  'whisper-large-v3-turbo': 'Whisper v3 Turbo',
  'whisper-large-v3': 'Whisper v3 Large',
  'distil-whisper-large-v3-en': 'Distil Whisper v3',
  'canopylabs/orpheus-arabic-saudi': 'Orpheus عربي',
  'canopylabs/orpheus-v1-english': 'Orpheus V1',
  'playai-tts-arabic': 'Orpheus عربي',
  'playai-tts': 'Orpheus V1',
  'gemini-2.5-flash-preview-tts': 'Gemini 2.5 TTS',
  'browser-ar-tts': 'قارئ المتصفح',

  // OpenRouter
  'google/gemini-2.5-flash': 'OR Gemini 2.5 Flash',
  'deepseek/deepseek-chat-v3-0324:free': 'OR DeepSeek V3',
  'deepseek/deepseek-r1:free': 'OR DeepSeek R1',
  'meta-llama/llama-3.3-70b-instruct:free': 'OR Llama 3.3 70B',
  'meta-llama/llama-4-maverick:free': 'OR Llama 4 Maverick',
  'meta-llama/llama-4-scout:free': 'OR Llama 4 Scout',
  'qwen/qwen3-235b-a22b:free': 'OR Qwen 3 235B',
  'qwen/qwen3-32b:free': 'OR Qwen 3 32B',
  'google/gemini-2.0-flash-exp:free': 'OR Gemini 2.0 Flash',
  'mistralai/mistral-small-3.1-24b-instruct:free': 'OR Mistral 3.1 24B',
  'google/gemma-3-27b-it:free': 'OR Gemma 3 27B',
  'qwen/qwen-2.5-72b-instruct:free': 'OR Qwen 2.5 72B',
  'qwen/qwen2.5-vl-72b-instruct:free': 'OR Qwen 2.5 VL',
  'deepseek/deepseek-chat': 'OR DeepSeek Chat',
  'meta-llama/llama-3.3-70b-instruct': 'OR Llama 3.3 70B',
  'openrouter/free': 'OR تلقائي مجاني',
  'openrouter/auto': 'OR تلقائي ذكي',
  'local-clinical-engine': 'المحرك المحلي',
};

export function sanitizeApiKeyInput(rawKey?: string | null): string {
  return String(rawKey || '')
    .replace(/^Bearer\s+/i, '')
    .replace(/["'`\s\r\n]/g, '')
    .trim();
}

export function formatModelDisplayLabel(modelName?: string | null): string {
  const clean = String(modelName || '').trim();
  if (!clean) return 'Qwen 3.8 27B';
  return MODEL_DISPLAY_LABELS[clean] || clean;
}

export function sanitizeGeminiModel(model?: string | null): string {
  const m = String(model || '').trim();
  if (!m || m === 'gemini-3.8-flash' || m === 'gemini-3.1-flash-lite') {
    return 'gemini-2.5-flash';
  }
  return m;
}

const LEGACY_GROQ_MODELS = new Set([
  'mixtral-8x7b-32768',
  'gemma-7b-it',
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'meta-llama/llama-4-maverick-17b-128e-instruct',
  'llama-3.2-90b-vision-preview',
  'llama-3.2-11b-vision-preview',
  'llama3-70b-8192',
  'llama3-8b-8192',
]);

export function sanitizeGroqTextModel(model?: string | null): string {
  const m = String(model || '').trim();
  if (!m || LEGACY_GROQ_MODELS.has(m)) {
    return 'qwen/qwen3.8-27b';
  }
  return m;
}

export function sanitizeGroqVisionModel(model?: string | null): string {
  const m = String(model || '').trim();
  if (!m || LEGACY_GROQ_MODELS.has(m)) {
    return 'qwen/qwen3.8-27b';
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

    const rawTts = String(parsed.ttsModel || DEFAULT_AI_CONFIG.ttsModel || 'canopylabs/orpheus-arabic-saudi').trim();
    const ttsModel =
      rawTts === 'playai-tts-arabic'
        ? 'canopylabs/orpheus-arabic-saudi'
        : rawTts === 'playai-tts'
          ? 'canopylabs/orpheus-v1-english'
          : rawTts;

    const rawDataEntry = String(parsed.dataEntryModel || DEFAULT_AI_CONFIG.dataEntryModel || 'openai/gpt-oss-120b').trim();
    const dataEntryModel = LEGACY_GROQ_MODELS.has(rawDataEntry)
      ? 'openai/gpt-oss-120b'
      : rawDataEntry;

    const config: AIProviderConfig = {
      geminiApiKey: sanitizeApiKeyInput(parsed.geminiApiKey),
      geminiModel,
      geminiVisionModel: String(parsed.geminiVisionModel || DEFAULT_AI_CONFIG.geminiVisionModel || 'gemini-2.5-flash').trim(),
      enableWebGrounding: parsed.enableWebGrounding !== false,

      groqApiKey: sanitizeApiKeyInput(parsed.groqApiKey) || DEFAULT_AI_CONFIG.groqApiKey,
      groqTextModel,
      groqVisionModel,
      groqWhisperModel: String(parsed.groqWhisperModel || DEFAULT_AI_CONFIG.groqWhisperModel).trim(),

      openrouterApiKey: sanitizeApiKeyInput(parsed.openrouterApiKey),
      openrouterModel,
      openrouterVisionModel: String(parsed.openrouterVisionModel || DEFAULT_AI_CONFIG.openrouterVisionModel || 'google/gemini-2.5-flash').trim(),

      sttEngine: parsed.sttEngine === 'browser' ? 'browser' : 'groq',
      ttsModel,
      dataEntryModel,
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
        ttsModel: String(config.ttsModel || DEFAULT_AI_CONFIG.ttsModel || 'canopylabs/orpheus-arabic-saudi').trim(),
        dataEntryModel: String(config.dataEntryModel || DEFAULT_AI_CONFIG.dataEntryModel || 'openai/gpt-oss-120b').trim(),
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

interface DiscoveredGroqCatalog {
  endpointOk: boolean;
  authInvalid: boolean;
  allIds: string[];
  textModels: string[];
  visionModels: string[];
  audioSttModels: string[];
  audioTtsModels: string[];
}

const groqCatalogMemoryCache = new Map<
  string,
  { timestamp: number; catalog: DiscoveredGroqCatalog }
>();
const GROQ_CATALOG_TTL_MS = 30 * 60 * 1000; // 30 minutes

export async function discoverLiveGroqModels(
  apiKey: string,
  forceRefresh = false
): Promise<DiscoveredGroqCatalog> {
  const cleanKey = sanitizeApiKeyInput(apiKey);
  const emptyResult: DiscoveredGroqCatalog = {
    endpointOk: false,
    authInvalid: false,
    allIds: [],
    textModels: [],
    visionModels: [],
    audioSttModels: [],
    audioTtsModels: [],
  };
  if (!cleanKey) return emptyResult;

  if (!forceRefresh) {
    const cached = groqCatalogMemoryCache.get(cleanKey);
    if (cached && Date.now() - cached.timestamp < GROQ_CATALOG_TTL_MS) {
      return cached.catalog;
    }
  }

  try {
    const res = await fetch('https://api.groq.com/openai/v1/models', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${cleanKey}`,
      },
    });

    if (res.status === 401 || res.status === 403) {
      return { ...emptyResult, authInvalid: true };
    }

    if (!res.ok) return emptyResult;

    const json = await res.json();
    const dataArr: Array<Record<string, unknown>> = Array.isArray(json?.data) ? json.data : [];
    const activeItems = dataArr.filter(
      (item) => typeof item?.id === 'string' && item.active !== false
    );

    const allIds = activeItems.map((item) => String(item.id));
    const rawText: string[] = [];
    const rawVision: string[] = [];
    const rawStt: string[] = [];
    const rawTts: string[] = [];

    for (const item of activeItems) {
      const id = String(item.id);
      const lower = id.toLowerCase();
      const inMods = Array.isArray(item.input_modalities)
        ? item.input_modalities.map((m) => String(m).toLowerCase())
        : [];
      const outMods = Array.isArray(item.output_modalities)
        ? item.output_modalities.map((m) => String(m).toLowerCase())
        : [];

      if (inMods.includes('audio') || outMods.includes('transcription') || lower.includes('whisper')) {
        rawStt.push(id);
        continue;
      }
      if (outMods.includes('speech') || lower.includes('orpheus') || lower.includes('tts')) {
        rawTts.push(id);
        continue;
      }
      if (lower.includes('prompt-guard')) {
        continue;
      }
      if (inMods.includes('image') || lower.includes('vision') || lower.includes('qwen3.8')) {
        rawVision.push(id);
      }
      if (outMods.length === 0 || outMods.includes('text')) {
        rawText.push(id);
      }
    }

    const preferredOrder = [
      'qwen/qwen3.8-27b',
      'openai/gpt-oss-120b',
      'openai/gpt-oss-20b',
      'allam-2-7b',
      'openai/gpt-oss-safeguard-20b',
      ...GROQ_TEXT_MODELS,
    ];

    const rankedText = Array.from(
      new Set([
        ...preferredOrder.filter((m) => rawText.includes(m)),
        ...rawText,
      ])
    );

    const rankedVision = Array.from(
      new Set([
        ...['qwen/qwen3.8-27b', ...GROQ_VISION_MODELS].filter((m) => rawVision.includes(m)),
        ...rawVision,
      ])
    );

    const catalog: DiscoveredGroqCatalog = {
      endpointOk: true,
      authInvalid: false,
      allIds,
      textModels: rankedText,
      visionModels: rankedVision,
      audioSttModels: rawStt,
      audioTtsModels: rawTts,
    };
    groqCatalogMemoryCache.set(cleanKey, { timestamp: Date.now(), catalog });
    return catalog;
  } catch {
    return emptyResult;
  }
}

// 2. Groq Cloud Direct (Single-Hop Fast Inference + Dynamic On-404 Recovery)
async function callGroqDirect(
  payload: AssistantRequestPayload,
  config: AIProviderConfig,
  hasImage: boolean,
  signal?: AbortSignal
): Promise<AssistantDetailedResponse> {
  const apiKey = sanitizeApiKeyInput(config.groqApiKey);
  if (!apiKey) throw new Error('مفتاح Groq Cloud API غير مدخل.');

  const cachedVerified = (config.verifiedModels?.groq || []).filter(
    (m) => !LEGACY_GROQ_MODELS.has(m)
  );

  let candidateModels = hasImage
    ? Array.from(
        new Set([
          sanitizeGroqVisionModel(config.groqVisionModel),
          'qwen/qwen3.8-27b',
          ...GROQ_VISION_MODELS.filter((m) => !LEGACY_GROQ_MODELS.has(m)),
        ])
      )
    : Array.from(
        new Set([
          sanitizeGroqTextModel(config.groqTextModel),
          ...cachedVerified,
          'qwen/qwen3.8-27b',
          'openai/gpt-oss-120b',
          'openai/gpt-oss-20b',
          'allam-2-7b',
          'openai/gpt-oss-safeguard-20b',
        ])
      );

  const systemPrompt = buildClinicalSystemPrompt(payload.clinicContext, payload.prompt);
  const messages: Array<Record<string, unknown>> = [
    { role: 'system', content: systemPrompt },
  ];

  if (Array.isArray(payload.history)) {
    for (const h of payload.history.slice(-4)) {
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
  let didRefreshCatalogOn404 = false;

  for (let i = 0; i < candidateModels.length; i++) {
    const targetModel = candidateModels[i];
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
        temperature: 0.25,
        max_tokens: 1024,
      }),
      signal,
    });

    if (res.ok) {
      const data = await res.json();
      let reply = String(data?.choices?.[0]?.message?.content || '').trim();
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
      if (res.status === 404 && !didRefreshCatalogOn404) {
        didRefreshCatalogOn404 = true;
        const discovered = await discoverLiveGroqModels(apiKey, true);
        if (discovered.endpointOk) {
          const freshList = hasImage ? discovered.visionModels : discovered.textModels;
          if (freshList.length > 0) {
            candidateModels = [...candidateModels.slice(0, i + 1), ...freshList.filter((m) => !candidateModels.slice(0, i + 1).includes(m))];
          }
        }
      }
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

// 4B. Dedicated Audio / TTS Reading Dispatcher (Groq Orpheus Arabic Saudi TTS / Gemini TTS / Browser Speech Fallback)
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

  const ttsModel = config.ttsModel || 'canopylabs/orpheus-arabic-saudi';
  const groqKey = sanitizeApiKeyInput(config.groqApiKey);

  // 1. Try Groq Orpheus Arabic Saudi / V1 TTS if selected and key exists
  if (
    (ttsModel === 'canopylabs/orpheus-arabic-saudi' ||
      ttsModel === 'canopylabs/orpheus-v1-english' ||
      ttsModel === 'playai-tts-arabic' ||
      ttsModel === 'playai-tts') &&
    groqKey
  ) {
    const modelsToTry =
      ttsModel === 'canopylabs/orpheus-v1-english' || ttsModel === 'playai-tts'
        ? [
            { model: 'canopylabs/orpheus-v1-english', voice: 'tara' },
            { model: 'canopylabs/orpheus-arabic-saudi', voice: 'fahad' },
          ]
        : [
            { model: 'canopylabs/orpheus-arabic-saudi', voice: 'fahad' },
            { model: 'canopylabs/orpheus-v1-english', voice: 'tara' },
          ];

    for (const item of modelsToTry) {
      try {
        const res = await fetch('https://api.groq.com/openai/v1/audio/speech', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${groqKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: item.model,
            input: cleanText.slice(0, 600),
            voice: item.voice,
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
          ...(discoveredGeminiModels.length > 0
            ? [
                ...(discoveredGeminiModels.includes(sanitizeGeminiModel(config.geminiModel))
                  ? [sanitizeGeminiModel(config.geminiModel)]
                  : []),
                ...GEMINI_CANDIDATE_MODELS.filter((m) => discoveredGeminiModels.includes(m)),
                ...discoveredGeminiModels,
              ]
            : [sanitizeGeminiModel(config.geminiModel), ...GEMINI_CANDIDATE_MODELS]),
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

      // Step A: Dynamically query https://api.groq.com/openai/v1/models and classify active modalities
      const discovered = await discoverLiveGroqModels(apiKey);
      if (discovered.authInvalid) {
        return {
          ok: false,
          latencyMs: Date.now() - start,
          error: 'مفتاح Groq API غير صالح أو منتهي الصلاحية (تأكد من نسخه كاملاً ويبدأ بـ gsk_)',
        };
      }

      // Strictly use discovered active text models when /models succeeds so we NEVER probe a 404 model
      const cleanSelectedText = sanitizeGroqTextModel(config.groqTextModel);
      const prioritizedLivePool =
        discovered.endpointOk && discovered.textModels.length > 0
          ? Array.from(
              new Set([
                ...(discovered.textModels.includes(cleanSelectedText) ? [cleanSelectedText] : []),
                ...discovered.textModels,
              ])
            ).slice(0, 15)
          : Array.from(new Set([cleanSelectedText, ...GROQ_TEXT_MODELS])).slice(0, 15);

      // Auto-sync best available Vision, Whisper STT, and TTS models from live account catalog
      if (discovered.visionModels.length > 0) {
        if (!discovered.visionModels.includes(config.groqVisionModel)) {
          config.groqVisionModel = discovered.visionModels[0];
        }
      } else {
        config.groqVisionModel = sanitizeGroqVisionModel(config.groqVisionModel);
      }

      if (
        discovered.audioSttModels.length > 0 &&
        !discovered.audioSttModels.includes(config.groqWhisperModel)
      ) {
        config.groqWhisperModel = discovered.audioSttModels[0];
      }

      let lastStatus = 0;
      let lastErrText = '';

      // Probe top active candidates to measure real completion speed & lock in fastest working model
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
              activeModelsCount: discovered.allIds.length || finalPool.length,
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

      // If /models succeeded (valid key + active models discovered), mark success even if rate-limited
      if (discovered.endpointOk && prioritizedLivePool.length > 0) {
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
          activeModelsCount: discovered.allIds.length || prioritizedLivePool.length,
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

// ==================== 6. STRICT DIRECT DATA-ENTRY GOVERNANCE & FAST PARSER ====================
export function isDestructiveSystemIntent(promptText: string): boolean {
  const norm = String(promptText || '').trim();
  if (!norm) return false;
  return /(احذف سند|حذف سند|امسح سند|مسح سند|إلغاء سند|الغاء سند|احذف مريض|حذف مريض|احذف من المخزون|حذف صنف|امسح المخزون|تصفير السندات|تصفير الحسابات|حذف كل البيانات|مسح كل البيانات|تغيير إعدادات النظام)/i.test(
    norm
  );
}

export function isDirectDataEntryIntent(
  promptText: string,
  options?: { allowReceipt?: boolean; allowInventory?: boolean }
): 'receipt' | 'inventory' | null {
  const norm = String(promptText || '').trim();
  if (!norm) return null;

  // Never trigger data entry on destructive/deletion commands or read-only report queries
  if (isDestructiveSystemIntent(norm)) return null;
  if (
    /(كشف|تقرير|ملخص|كم عدد|اعرض|استعلام|بحث عن|ما هي|قائمة|هل يوجد|كيف)/i.test(norm) &&
    !/^(سجل|أضف|اضف|ادخل|أدخل|اصدر|أصدر|انشئ|أنشئ|توريد|تزويد|خصم من المخزون|صرف من المخزون)/i.test(norm)
  ) {
    return null;
  }

  const receiptActionRegex =
    /^(سجل سند|أضف سند|اضف سند|إصدار سند|اصدر سند|أصدر سند|انشئ سند|أنشئ سند|سند قبض للمريض|سند جديد للمريض|ادخل سند|أدخل سند|فاتورة للمريض|سند للمريض)/i;
  const inventoryActionRegex =
    /^(أضف للمخزون|اضف للمخزون|إضافة للمخزون|اضافة للمخزون|أضف صنف|اضف صنف|ادخل في المخزون|أدخل في المخزون|توريد مخزون|تزويد مخزون|سحب من المخزون|خصم من المخزون|صرف من المخزون)/i;

  if (options?.allowInventory !== false && inventoryActionRegex.test(norm)) {
    return 'inventory';
  }
  if (options?.allowReceipt !== false && receiptActionRegex.test(norm)) {
    return 'receipt';
  }

  return null;
}

export async function parseDirectDataEntryProposal(
  promptText: string,
  settings: ClinicSettings,
  inventory: InventoryItem[],
  attachment?: { name: string; mimeType: string; base64Data: string } | null,
  forcedType?: 'receipt' | 'inventory',
  governanceOptions?: {
    allowReceipt?: boolean;
    allowInventory?: boolean;
    strictCatalogValidation?: boolean;
  }
): Promise<PendingDataEntryProposal | null> {
  const detectedType =
    forcedType ||
    isDirectDataEntryIntent(promptText, {
      allowReceipt: governanceOptions?.allowReceipt,
      allowInventory: governanceOptions?.allowInventory,
    });
  if (!detectedType) return null;

  if (detectedType === 'receipt' && governanceOptions?.allowReceipt === false) return null;
  if (detectedType === 'inventory' && governanceOptions?.allowInventory === false) return null;

  const strictValidation = governanceOptions?.strictCatalogValidation !== false;
  const config = loadAIProviderConfig();
  const preferredModel = sanitizeGroqTextModel(config.dataEntryModel || 'openai/gpt-oss-120b');
  const defaultCurrency = settings.identity.defaultCurrency || 'ريال يمني';

  const servicesCatalogStr = settings.services
    .map((s) => `${s.name} (${s.price} ${defaultCurrency})`)
    .join('، ');
  const inventoryCatalogStr = inventory
    .map((i) => `${i.name} [المتوفر: ${i.qty} ${i.unit}، السعر: ${i.unitPrice}]`)
    .join('، ');

  const extractionPrompt =
    detectedType === 'receipt'
      ? `استخرج بيانات سند القبض من النص التالي بدقة صارمة بصيغة JSON فقط دون تأليف أي بيانات غير مذكورة:
النص: "${promptText}"
خدمات العيادة المعتمدة: ${servicesCatalogStr}
العملة: ${defaultCurrency}
قواعد صارمة: إذا لم يُذكر اسم المريض اجعل patientName نصاً فارغاً "". اختر الخدمة المطابقة من خدمات العيادة.
JSON المطلوب فقط:
{"type":"receipt","patientName":"","patientPhone":"","services":[],"toothFDI":"","totalAmount":0,"paidAmount":0,"currency":"${defaultCurrency}","paymentMethod":"نقداً","notes":""}`
      : `استخرج بيانات عملية المخزون من النص التالي بدقة صارمة بصيغة JSON فقط دون تأليف أي بيانات غير مذكورة:
النص: "${promptText}"
أصناف المخزون الحالية: ${inventoryCatalogStr || 'لا توجد أصناف'}
قواعد صارمة: operation إما "add_new" أو "restock" أو "consume". يُمنع الحذف نهائياً.
JSON المطلوب فقط:
{"type":"inventory","operation":"add_new","name":"","qty":1,"unit":"علبة","minQty":5,"unitPrice":0,"linkedService":"","recordAsExpense":true,"notes":""}`;

  let modelUsedLabel = formatModelDisplayLabel(preferredModel);
  let rawJsonReply = '';

  try {
    const groqKey = sanitizeApiKeyInput(config.groqApiKey);
    if (groqKey && !attachment?.base64Data) {
      // Ultra-fast single-hop Groq extraction (~180ms)
      const modelsToTry = Array.from(
        new Set([preferredModel, 'qwen/qwen3.8-27b', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b'])
      );
      for (const m of modelsToTry) {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${groqKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: m,
            messages: [{ role: 'user', content: extractionPrompt }],
            temperature: 0.05,
            max_tokens: 320,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          const content = String(data?.choices?.[0]?.message?.content || '')
            .replace(/<think>[\s\S]*?<\/think>/gi, '')
            .trim();
          if (content.includes('{')) {
            rawJsonReply = content;
            modelUsedLabel = formatModelDisplayLabel(m);
            break;
          }
        }
      }
    }

    if (!rawJsonReply) {
      const aiRes = await queryClinicAssistantDetailed({
        prompt: extractionPrompt,
        attachment,
        taskType: 'chat',
      });
      rawJsonReply = aiRes.reply;
      modelUsedLabel = aiRes.modelLabel || modelUsedLabel;
    }

    const jsonMatch = rawJsonReply.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
      const warnings: string[] = [];

      if (detectedType === 'receipt') {
        const rawServices = Array.isArray(parsed.services)
          ? parsed.services.map((s) => String(s).trim()).filter(Boolean)
          : [];

        // Strict catalog matching
        const catalogMatched = settings.services
          .filter(
            (srv) =>
              rawServices.some((rs) => rs.includes(srv.name) || srv.name.includes(rs)) ||
              promptText.includes(srv.name)
          )
          .map((srv) => srv.name);

        const finalServices =
          catalogMatched.length > 0
            ? catalogMatched
            : !strictValidation && rawServices.length > 0
              ? rawServices
              : [settings.services[0]?.name || 'كشفية طبية'];

        if (strictValidation && catalogMatched.length === 0 && rawServices.length > 0) {
          warnings.push('تم ربط الخدمة بأقرب بند معتمد في قائمة خدمات العيادة لمنع إدخال مسميات غير مطابقة.');
        }

        const catalogSum = finalServices.reduce((sum, sName) => {
          const found = settings.services.find((srv) => srv.name === sName);
          return sum + (found ? Number(found.price) || 0 : 0);
        }, 0);

        const parsedTotal = Math.max(0, Number(parsed.totalAmount) || 0);
        const totalAmount = parsedTotal > 0 ? parsedTotal : catalogSum;
        if (totalAmount <= 0) {
          warnings.push('يرجى تحديد المبلغ الإجمالي للسند قبل الاعتماد.');
        }

        const rawPaid =
          parsed.paidAmount !== undefined && Number(parsed.paidAmount) >= 0
            ? Number(parsed.paidAmount)
            : totalAmount;
        const paidAmount = Math.min(totalAmount, Math.max(0, rawPaid));
        const remainingAmount = Math.max(0, +(totalAmount - paidAmount).toFixed(2));

        let cleanPatientName = String(parsed.patientName || '').trim();
        if (
          cleanPatientName === 'اسم المريض' ||
          cleanPatientName === 'مريض جديد' ||
          cleanPatientName === 'غير محدد'
        ) {
          cleanPatientName = '';
        }
        if (cleanPatientName.length < 2) {
          warnings.push('اسم المريض مطلوب — يرجى كتابة اسم المريض في البطاقة قبل الحفظ.');
        }

        const receiptData: PendingReceiptEntryData = {
          patientName: cleanPatientName,
          patientPhone: String(parsed.patientPhone || '').replace(/[^\d+]/g, '').slice(0, 20),
          services: finalServices,
          toothFDI: String(parsed.toothFDI || '').trim().slice(0, 20),
          totalAmount,
          paidAmount,
          remainingAmount,
          currency: String(parsed.currency || defaultCurrency).trim(),
          paymentMethod: String(parsed.paymentMethod || 'نقداً').trim(),
          notes: String(parsed.notes || 'إدخال مراجع عبر المساعد').trim().slice(0, 200),
        };

        return {
          id: 'prop_rec_' + Date.now(),
          type: 'receipt',
          status: 'pending',
          modelUsed: modelUsedLabel,
          validationWarnings: warnings.length > 0 ? warnings : undefined,
          summaryText: `مسودة سند قبض جاهزة للمراجعة (${receiptData.patientName || 'يرجى إدخال اسم المريض'}) — لن يتم حفظ أي بيانات في النظام إلا بعد مراجعتك وموافقتك:`,
          receiptData,
        };
      } else {
        const rawItemName = String(parsed.name || '').trim();
        const existingItem = inventory.find(
          (i) =>
            (rawItemName &&
              (i.name.trim().toLowerCase() === rawItemName.toLowerCase() ||
                rawItemName.includes(i.name.trim()))) ||
            promptText.includes(i.name.trim())
        );

        const opRaw = String(parsed.operation || '').toLowerCase();
        const operation: 'add_new' | 'restock' | 'consume' =
          opRaw === 'consume' || /(سحب|خصم|صرف|استهلاك)/.test(promptText)
            ? 'consume'
            : existingItem || opRaw === 'restock' || /(توريد|تزويد|إضافة كمية)/.test(promptText)
              ? 'restock'
              : 'add_new';

        const qty = Math.min(10000, Math.max(1, Number(parsed.qty) || 1));
        const unitPrice = Math.max(
          0,
          Number(parsed.unitPrice) > 0
            ? Number(parsed.unitPrice)
            : existingItem?.unitPrice || 0
        );

        const finalName = existingItem ? existingItem.name : rawItemName;
        if (!finalName || finalName.length < 2) {
          warnings.push('يرجى تحديد اسم الصنف بدقة قبل الاعتماد.');
        }
        if (operation === 'consume' && !existingItem) {
          warnings.push('تنبيه: هذا الصنف غير موجود حالياً في المخزون، لا يمكن صرف كمية منه.');
        } else if (operation === 'consume' && existingItem && qty > existingItem.qty) {
          warnings.push(
            `تنبيه: الكمية المطلوب صرفها (${qty}) أكبر من الرصيد المتوفر حالياً (${existingItem.qty} ${existingItem.unit}).`
          );
        }

        const inventoryData: PendingInventoryEntryData = {
          operation,
          existingItemId: existingItem?.id,
          name: finalName,
          qty,
          unit: String(parsed.unit || existingItem?.unit || 'علبة').trim(),
          minQty: Math.max(1, Number(parsed.minQty) || existingItem?.minQty || 5),
          unitPrice,
          totalCost: +(qty * unitPrice).toFixed(2),
          linkedService: String(parsed.linkedService || existingItem?.linkedService || '').trim(),
          recordAsExpense: Boolean(parsed.recordAsExpense ?? (operation !== 'consume')),
          notes: String(parsed.notes || 'إدخال مراجع عبر المساعد').trim().slice(0, 200),
        };

        const opLabel =
          operation === 'consume'
            ? 'صرف من المخزون'
            : operation === 'restock'
              ? 'توريد للمخزون'
              : 'إضافة صنف جديد';

        return {
          id: 'prop_inv_' + Date.now(),
          type: 'inventory',
          status: 'pending',
          modelUsed: modelUsedLabel,
          validationWarnings: warnings.length > 0 ? warnings : undefined,
          summaryText: `مسودة عملية مخزون (${opLabel}) جاهزة للمراجعة — لن يتم تعديل المخزون إلا بعد موافقتك:`,
          inventoryData,
        };
      }
    }
  } catch {
    // Fallback to deterministic parser below
  }

  return null;
}

