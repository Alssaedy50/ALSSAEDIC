import {
  ClinicSettings,
  CurrencyFinancialSummary,
  DentalServiceItem,
  ExpenseRecord,
  InventoryItem,
  ReceiptRecord,
} from '../types/clinic';

export const GEMINI_CANDIDATE_MODELS = [
  'gemini-3.1-flash-lite',
  'gemini-3.8-flash',
  'gemini-flash-latest',
] as const;

export const MODEL_DISPLAY_LABELS: Record<string, string> = {
  'gemini-3.1-flash-lite': 'Gemini 3.1 Flash Lite',
  'gemini-3.8-flash': 'Gemini 3.8 Flash',
  'gemini-flash-latest': 'Gemini Flash Latest',
  'local-clinical-engine': 'المحرك السريري المدمج',
};

export function formatModelDisplayLabel(modelName?: string | null): string {
  const clean = String(modelName || '').trim();
  if (!clean) return 'Gemini 3.8 Flash';
  return MODEL_DISPLAY_LABELS[clean] || clean;
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
}

export function isInstantClinicQuery(
  prompt: string,
  clinicContext?: Record<string, unknown> | null
): boolean {
  const p = String(prompt || '').trim();
  if (!p) return false;

  const fastKeywords = [
    'ديون',
    'مديون',
    'متبقي',
    'آجل',
    'اجل',
    'ذمم',
    'مخزون',
    'نواقص',
    'جرد',
    'أصناف',
    'اصناف',
    'مستودع',
    'أرباح',
    'ارباح',
    'مصروفات',
    'مالي',
    'إيراد',
    'ايراد',
    'تقرير',
    'محاسب',
    'ميزان',
    'دخل',
    'أسعار',
    'اسعار',
    'قائمة الخدمات',
    'مضاد',
    'مسكن',
    'وصفة',
    'روشيتة',
    'خلع',
    'قلع',
    'ضرس',
    'عصب',
    'جذور',
    'زيركون',
    'إيماكس',
    'ايماكس',
    'فينير',
    'تركيب',
    'زراعة',
    'تقويم',
    'لثة',
    'تخدير',
    'بنج',
  ];

  if (fastKeywords.some((kw) => p.includes(kw))) {
    return true;
  }

  const recList = Array.isArray((clinicContext as Record<string, unknown>)?.recentReceipts)
    ? ((clinicContext as Record<string, unknown>).recentReceipts as Array<Record<string, unknown>>)
    : [];
  return recList.some(
    (r) =>
      (typeof r.patientName === 'string' &&
        r.patientName.trim().length >= 3 &&
        p.includes(r.patientName.trim())) ||
      (typeof r.patientPhone === 'string' &&
        r.patientPhone.trim().length >= 6 &&
        p.includes(r.patientPhone.trim()))
  );
}

export async function queryClinicAssistantDetailed(
  payload: AssistantRequestPayload,
  externalSignal?: AbortSignal
): Promise<AssistantDetailedResponse> {
  // Call server endpoint (/api/gemini/assistant) so real Gemini AI answers with full clinic context
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
      const model = String(parsed.data.model || 'gemini-3.8-flash').trim();
      const modelLabel =
        String(parsed.data.modelLabel || '').trim() || formatModelDisplayLabel(model);
      return {
        reply: String(parsed.data.reply).trim(),
        model,
        modelLabel,
      };
    }
  } catch (err: unknown) {
    clearTimeout(timer);
    // ONLY rethrow if the user actually clicked stop/aborted externally
    if (externalSignal?.aborted) {
      throw new DOMException('Aborted by user', 'AbortError');
    }
    // Server route unreachable, rate-limited, or timed out; fall back cleanly to local clinical engine
  }

  if (externalSignal?.aborted) {
    throw new DOMException('Aborted by user', 'AbortError');
  }

  // Fallback to Local Clinical Intelligence Engine only if server/network is completely unreachable
  return {
    reply: generateLocalClinicalResponse(payload.prompt, payload.clinicContext),
    model: 'local-clinical-engine',
    modelLabel: formatModelDisplayLabel('local-clinical-engine'),
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

  // Call authenticated server endpoint (/api/gemini/parse-receipt) using safe text->JSON reader
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
    // Fall back to caller's local deterministic parser
  }

  return null;
}
