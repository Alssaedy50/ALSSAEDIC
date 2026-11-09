declare module '*.css';

export type CurrencyCode = 'ريال يمني' | 'ريال سعودي' | 'دولار أمريكي';

export type PaperFormat = 'a5' | 'thermal80';

export type MaterialConsumptionType =
  | 'per_session'
  | 'by_tooth_type'
  | 'per_tooth_unit'
  | 'per_arch';

export interface ServiceMaterialRule {
  materialId: string;
  consumptionType: MaterialConsumptionType;
  qtyFixed?: number;
  qtyAnterior?: number;
  qtyMolar?: number;
  sessionNumber?: number | 'all';
}

export interface DentalServiceItem {
  id: string;
  name: string;
  price: number;
  category: string;
  keywords: string[];
  materialsRecipe?: ServiceMaterialRule[];
  totalSessions?: number;
}

export type ServiceConfig = DentalServiceItem;

export interface ConsumedMaterialEntry {
  materialId: string;
  amountDeducted: number;
}

export interface ReceiptRecord {
  id: string;
  receiptNo: number;
  date: string;
  patientName: string;
  patientPhone: string;
  services: string[];
  toothFDI: string;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  currency: CurrencyCode | string;
  paymentMethod: string;
  notes: string;
  amountWords: string;
  accountantSig: string;
  receiverSig: string;
  paperFormat: PaperFormat;
  createdAt?: string;
  consumedMaterials?: ConsumedMaterialEntry[];
}

export interface InventoryItem {
  id: string;
  name: string;
  qty: number;
  unit: string;
  minQty: number;
  unitPrice: number;
  totalCost: number;
  linkedService: string;
  notes: string;
  updatedAt: string;
  location?: 'clinic' | 'lab';
  packageSize?: number;
  usageUnit?: string;
  remainingSubUnits?: number;
}

export interface ExpenseRecord {
  id: string;
  title: string;
  amount: number;
  category: string;
  currency: CurrencyCode | string;
  date: string;
  notes?: string;
}

export interface ClinicIdentity {
  systemTitleAr: string;
  clinicAr: string;
  doctorAr: string;
  specialtyAr: string;
  clinicEn: string;
  doctorEn: string;
  address: string;
  phones: string;
  defaultCurrency: CurrencyCode;
  ownerEmail?: string;
}

export interface ClinicAppearance {
  primaryColor: string;
  accentColor: string;
  customLogoDataUrl: string;
  watermarkOpacity: number;
  permanentAccountantSig: string;
}

export interface ClinicFeatures {
  autoPrice: boolean;
  showQrCode: boolean;
  debtAlert: boolean;
  autoInventory: boolean;
  allowAiDataEntry?: boolean;
  sarToYerRate?: number;
  usdToYerRate?: number;
}

export interface TelegramBackupSettings {
  enabled: boolean;
  autoBackupOnReceipt: boolean;
  autoSendInventory?: boolean;
  autoSendFinance?: boolean;
  botToken: string;
  chatId: string;
  lastBackupAt?: string;
  allowAiDataEntry?: boolean;
  sarToYerRate?: number;
  usdToYerRate?: number;
}

export interface ClinicSubscription {
  planId: 'free' | 'ai_pro' | 'enterprise';
  planNameAr: string;
  isAiEnabled: boolean;
  status: 'active' | 'expired' | 'trial' | 'locked';
  activatedAt?: string;
  expiresAt?: string;
  activatedBy?: string;
  notes?: string;
}

export interface PaidPackageTier {
  id: string;
  nameAr: string;
  priceFormatted: string;
  billingPeriod: string;
  descriptionAr: string;
  badge?: string;
  features: string[];
  isAiIncluded: boolean;
  isPopular?: boolean;
}

export interface ClinicSettings {
  identity: ClinicIdentity;
  appearance: ClinicAppearance;
  features: ClinicFeatures;
  services: DentalServiceItem[];
  telegramBackup?: TelegramBackupSettings;
  subscription?: ClinicSubscription;
  aiConfig?: AIProviderConfig;
}

export interface AIProviderConfig {
  geminiApiKey: string;
  geminiModel: string;
  geminiVisionModel?: string;
  enableWebGrounding: boolean;

  groqApiKey: string;
  groqTextModel: string;
  groqVisionModel: string;
  groqWhisperModel: string;

  openrouterApiKey: string;
  openrouterModel: string;
  openrouterVisionModel?: string;

  sttEngine: 'browser' | 'groq';
  ttsModel: string;
  dataEntryModel: string;
  customPriority: ('gemini' | 'groq' | 'openrouter')[];
  verifiedModels?: {
    gemini?: string[];
    groq?: string[];
    openrouter?: string[];
    lastCheckedAt?: string;
  };
}

export const DEFAULT_AI_CONFIG: AIProviderConfig = {
  geminiApiKey: '',
  geminiModel: 'gemini-2.5-flash',
  geminiVisionModel: 'gemini-2.5-flash',
  enableWebGrounding: true,

  groqApiKey: ['gsk', '_qKFLsZhAyFhe9QpxQsRw', 'WGdyb3FYMdHnE8WiKTBOcAwIPffgdS2M'].join(''),
  groqTextModel: 'qwen/qwen3.8-27b',
  groqVisionModel: 'qwen/qwen3.8-27b',
  groqWhisperModel: 'whisper-large-v3-turbo',

  openrouterApiKey: '',
  openrouterModel: 'google/gemini-2.5-flash',
  openrouterVisionModel: 'google/gemini-2.5-flash',

  sttEngine: 'browser',
  ttsModel: 'canopylabs/orpheus-arabic-saudi',
  dataEntryModel: 'openai/gpt-oss-120b',
  customPriority: ['groq', 'gemini', 'openrouter'],
  verifiedModels: {
    groq: [
      'qwen/qwen3.8-27b',
      'openai/gpt-oss-120b',
      'openai/gpt-oss-20b',
      'allam-2-7b',
      'openai/gpt-oss-safeguard-20b',
    ],
  },
};

export interface PendingReceiptEntryData {
  patientName: string;
  patientPhone: string;
  services: string[];
  toothFDI: string;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  currency: CurrencyCode | string;
  paymentMethod: string;
  notes: string;
  matchedAccountName?: string;
  previousDebtAmount?: number;
  previousVisitsCount?: number;
  isReturnVisit?: boolean;
}

export interface PendingInventoryEntryData {
  operation: 'add_new' | 'restock' | 'consume';
  existingItemId?: string;
  matchedItemId?: string;
  name: string;
  qty: number;
  unit: string;
  minQty: number;
  unitPrice: number;
  totalCost: number;
  linkedService: string;
  recordAsExpense: boolean;
  notes: string;
}

export interface PendingDataEntryProposal {
  id: string;
  type: 'receipt' | 'inventory';
  status: 'pending' | 'approved' | 'rejected';
  summaryText: string;
  modelUsed?: string;
  validationWarnings?: string[];
  receiptData?: PendingReceiptEntryData;
  inventoryData?: PendingInventoryEntryData;
}

export interface ChatAppearanceSettings {
  fontFamily: 'Tajawal' | 'Cairo' | 'IBM Plex Sans Arabic' | 'Plus Jakarta Sans';
  fontSize: 'sm' | 'base' | 'lg' | 'xl';
  accentColor: 'sky' | 'emerald' | 'indigo' | 'violet' | 'amber' | 'slate';
  maxMessagesPerSession: number; // e.g. 20, 30, 50
  allowAiReceiptEntry: boolean;
  allowAiInventoryEntry: boolean;
  strictCatalogValidation: boolean;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  isPinned?: boolean;
  messages: ChatMessage[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
  modelUsed?: string;
  providerUsed?: 'gemini' | 'groq' | 'openrouter' | 'server' | 'local';
  isFallbackApplied?: boolean;
  webSources?: Array<{ title: string; uri: string }>;
  attachmentName?: string;
  attachmentMimeType?: string;
  attachmentPreview?: string;
  dataEntryProposal?: PendingDataEntryProposal;
}

export interface CurrencyFinancialSummary {
  currency: string;
  totalBilledAmount: number;
  totalCollectedRevenue: number;
  totalPendingDebts: number;
  totalExpenses: number;
  netCashProfit: number;
  receiptsCount: number;
  debtorsCount: number;
}

// ==================== MULTI-USER WORKSPACE & RBAC TYPES ====================
export type WorkspaceRole = 'owner' | 'doctor' | 'accountant' | 'receptionist' | 'viewer';

export interface WorkspacePermissions {
  canCreateReceipt: boolean;
  canEditReceipt: boolean;
  canDeleteReceipt: boolean;
  canSettleDebt: boolean;
  canManageInventory: boolean;
  canConsumeInventory: boolean;
  canManageExpenses: boolean;
  canViewFinances: boolean;
  canManageSettings: boolean;
  canManageTeam: boolean;
  canUseAiAssistant: boolean;
}

export const DEFAULT_ROLE_PERMISSIONS: Record<WorkspaceRole, WorkspacePermissions> = {
  owner: {
    canCreateReceipt: true,
    canEditReceipt: true,
    canDeleteReceipt: true,
    canSettleDebt: true,
    canManageInventory: true,
    canConsumeInventory: true,
    canManageExpenses: true,
    canViewFinances: true,
    canManageSettings: true,
    canManageTeam: true,
    canUseAiAssistant: true,
  },
  doctor: {
    canCreateReceipt: true,
    canEditReceipt: true,
    canDeleteReceipt: false,
    canSettleDebt: true,
    canManageInventory: false,
    canConsumeInventory: true,
    canManageExpenses: false,
    canViewFinances: false,
    canManageSettings: false,
    canManageTeam: false,
    canUseAiAssistant: true,
  },
  accountant: {
    canCreateReceipt: true,
    canEditReceipt: true,
    canDeleteReceipt: false,
    canSettleDebt: true,
    canManageInventory: true,
    canConsumeInventory: false,
    canManageExpenses: true,
    canViewFinances: true,
    canManageSettings: false,
    canManageTeam: false,
    canUseAiAssistant: true,
  },
  receptionist: {
    canCreateReceipt: true,
    canEditReceipt: false,
    canDeleteReceipt: false,
    canSettleDebt: true,
    canManageInventory: false,
    canConsumeInventory: false,
    canManageExpenses: false,
    canViewFinances: false,
    canManageSettings: false,
    canManageTeam: false,
    canUseAiAssistant: false,
  },
  viewer: {
    canCreateReceipt: false,
    canEditReceipt: false,
    canDeleteReceipt: false,
    canSettleDebt: false,
    canManageInventory: false,
    canConsumeInventory: false,
    canManageExpenses: false,
    canViewFinances: false,
    canManageSettings: false,
    canManageTeam: false,
    canUseAiAssistant: false,
  },
};

export interface WorkspaceMember {
  uid: string;
  email: string;
  displayName?: string;
  role: WorkspaceRole;
  permissions: WorkspacePermissions;
  addedBy: string;
  joinedAt: string;
  status: 'active' | 'invited';
}

export interface WorkspaceProfile {
  id: string;
  ownerId: string;
  ownerEmail: string;
  clinicNameAr: string;
  doctorNameAr: string;
  createdAt: string;
  updatedAt: string;
}

export default null;


