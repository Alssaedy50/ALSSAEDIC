import { ClinicSettings, ExpenseRecord, InventoryItem, ReceiptRecord } from '../types/clinic';

export const DEFAULT_CLINIC_LOGO_DATA_URI =
  'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2224%22%20fill%3D%22%230B2545%22%2F%3E%3Cpath%20d%3D%22M39%2022c-13%200-22%2010-22%2025%200%2017%209%2025%2013%2039%203%2012%206%2023%2013%2023%208%200%208-15%2013-24%203-5%205-5%208%200%205%209%205%2024%2013%2024%207%200%2010-11%2013-23%204-14%2013-22%2013-39%200-15-9-25-22-25-9%200-14%205-20%205s-11-5-22-5z%22%20fill%3D%22%23fff%22%2F%3E%3Cpath%20d%3D%22M43%2034c-6%200-11%205-12%2012M85%2034c6%200%2011%205%2012%2012%22%20fill%3D%22none%22%20stroke%3D%22%230284c7%22%20stroke-width%3D%226%22%20stroke-linecap%3D%22round%22%2F%3E%3C%2Fsvg%3E';

export const INVENTORY_UNITS = [
  { value: 'عدد', label: 'عدد / حبة (Piece)' },
  { value: 'علبة', label: 'علبة (Box)' },
  { value: 'أمبولة', label: 'أمبولة (Ampoule)' },
  { value: 'جرام', label: 'وزن بالجرام (g)' },
  { value: 'كيلوجرام', label: 'وزن بالكيلوجرام (kg)' },
  { value: 'مل', label: 'حجم بالمليلتر (ml)' },
  { value: 'طقم', label: 'طقم متكامل (Kit)' },
  { value: 'عبوة', label: 'عبوة / أنبوب (Tube)' },
];

export const PAYMENT_METHODS = [
  'نقداً (Cash)',
  'تحويل بنكي / محفظة إلكترونية',
  'بطاقة دفع إلكتروني',
  'آجل / ذمم مرضى',
];

export const CURRENCIES = ['ريال يمني', 'ريال سعودي', 'دولار أمريكي'] as const;

export const DEFAULT_SETTINGS: ClinicSettings = {
  identity: {
    systemTitleAr: 'نظام السعيدي الطبي الذكي — DOCAI ERP',
    clinicAr: 'عيادة السعيدي لطب وجراحة الفم والأسنان',
    doctorAr: 'د. صلاح الدين السعيدي',
    specialtyAr: 'طب وجراحة الفم والأسنان وتجميل الابتسامة',
    clinicEn: 'ALSSAEDY CLINIC FOR DENTISTRY',
    doctorEn: 'Dr. Salahaldeen Alssaedy',
    address: 'ريمة - كسمة - عزلة الضبارة',
    phones: '+967 716 339 366 | +967 739 550 138 | +967 775 956 520',
    defaultCurrency: 'ريال يمني',
    ownerEmail: 'alssaedy50@gmail.com',
  },
  appearance: {
    primaryColor: '#0B2545',
    accentColor: '#0284C7',
    customLogoDataUrl: DEFAULT_CLINIC_LOGO_DATA_URI,
    watermarkOpacity: 5,
    permanentAccountantSig: '',
  },
  features: {
    autoPrice: true,
    showQrCode: true,
    debtAlert: true,
    autoInventory: true,
  },
  services: [
    {
      id: 'srv_exam',
      name: 'كشف ومعاينة',
      price: 2000,
      category: 'تشخيص',
      keywords: ['كشف', 'معاينة', 'فحص', 'استشارة'],
    },
    {
      id: 'srv_fill',
      name: 'حشوات وتجميل',
      price: 8000,
      category: 'علاجي وتجميلي',
      keywords: ['حشو', 'حشوة', 'حشوات', 'تجميل', 'كومبوزيت'],
    },
    {
      id: 'srv_endo',
      name: 'علاج عصب وجذور',
      price: 15000,
      category: 'علاج جذور',
      keywords: ['عصب', 'جذور', 'سحب عصب', 'حشو عصب'],
    },
    {
      id: 'srv_extr',
      name: 'خلع وجراحة',
      price: 5000,
      category: 'جراحة',
      keywords: ['خلع', 'قلع', 'جراحة', 'ضرس العقل'],
    },
    {
      id: 'srv_scal',
      name: 'تنظيف وتقليح اللثة',
      price: 10000,
      category: 'وقائي ولثة',
      keywords: ['تنظيف', 'تقليح', 'تقليح اللثة', 'لثة', 'إزالة جير', 'تلميع'],
    },
    {
      id: 'srv_pros',
      name: 'تركيبات أسنان',
      price: 35000,
      category: 'تعويضات سنية',
      keywords: ['تركيب', 'تركيبات', 'تلبيس', 'زيركون', 'بورسلين', 'تاج'],
    },
    {
      id: 'srv_orth',
      name: 'تقويم أسنان',
      price: 150000,
      category: 'تقويم',
      keywords: ['تقويم', 'شد تقويم', 'حاصرات'],
    },
    {
      id: 'srv_xray',
      name: 'أشعة تشخيصية',
      price: 3000,
      category: 'تشخيص',
      keywords: ['أشعة', 'اشعة', 'بانوراما', 'تصوير'],
    },
  ],
  telegramBackup: {
    enabled: false,
    autoBackupOnReceipt: true,
    botToken: '',
    chatId: '',
  },
};

export const SEED_DEMO_IDS = {
  receipts: new Set(['rec_seed_1', 'rec_seed_2', 'rec_seed_3']),
  inventory: new Set(['inv_1', 'inv_2', 'inv_3', 'inv_4', 'inv_5']),
  expenses: new Set(['exp_seed_1', 'exp_seed_2']),
};

export const DEFAULT_INVENTORY: InventoryItem[] = [];

export const DEFAULT_RECEIPTS: ReceiptRecord[] = [];

export const DEFAULT_EXPENSES: ExpenseRecord[] = [];

export function createInitialClinicSettingsForUser(
  email?: string | null,
  displayName?: string | null
): ClinicSettings {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail || cleanEmail === 'alssaedy50@gmail.com') {
    return {
      ...DEFAULT_SETTINGS,
      identity: { ...DEFAULT_SETTINGS.identity },
      appearance: { ...DEFAULT_SETTINGS.appearance },
      features: { ...DEFAULT_SETTINGS.features },
      services: DEFAULT_SETTINGS.services.map((s) => ({ ...s, keywords: [...s.keywords] })),
      telegramBackup: DEFAULT_SETTINGS.telegramBackup
        ? { ...DEFAULT_SETTINGS.telegramBackup }
        : { enabled: false, autoBackupOnReceipt: true, botToken: '', chatId: '' },
    };
  }

  const cleanName = String(displayName || '').trim();
  const initialClinicName = cleanName
    ? `عيادة ${cleanName} لطب الأسنان`
    : 'عيادة طب وجراحة الفم والأسنان';

  return {
    identity: {
      systemTitleAr: initialClinicName,
      clinicAr: initialClinicName,
      doctorAr: cleanName,
      specialtyAr: 'طب وجراحة الفم والأسنان',
      clinicEn: '',
      doctorEn: '',
      address: '',
      phones: '',
      defaultCurrency: 'ريال يمني',
      ownerEmail: cleanEmail || '',
    },
    appearance: {
      primaryColor: '#0B2545',
      accentColor: '#0284C7',
      customLogoDataUrl: DEFAULT_CLINIC_LOGO_DATA_URI,
      watermarkOpacity: 5,
      permanentAccountantSig: '',
    },
    features: {
      autoPrice: true,
      showQrCode: true,
      debtAlert: true,
      autoInventory: true,
    },
    services: DEFAULT_SETTINGS.services.map((s) => ({ ...s, keywords: [...s.keywords] })),
    telegramBackup: {
      enabled: false,
      autoBackupOnReceipt: true,
      botToken: '',
      chatId: '',
    },
  };
}


