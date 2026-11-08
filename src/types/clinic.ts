declare module '*.css';

export type CurrencyCode = 'ريال يمني' | 'ريال سعودي' | 'دولار أمريكي';

export type PaperFormat = 'a5' | 'thermal80';

export interface DentalServiceItem {
  id: string;
  name: string;
  price: number;
  category: string;
  keywords: string[];
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
}

export interface TelegramBackupSettings {
  enabled: boolean;
  autoBackupOnReceipt: boolean;
  botToken: string;
  chatId: string;
  lastBackupAt?: string;
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
}

export interface AIProviderConfig {
  geminiApiKey: string;
  geminiModel: string;
  enableWebGrounding: boolean;

  groqApiKey: string;
  groqTextModel: string;
  groqVisionModel: string;
  groqWhisperModel: string;

  openrouterApiKey: string;
  openrouterModel: string;

  sttEngine: 'browser' | 'groq';
  customPriority: ('gemini' | 'groq' | 'openrouter')[];
}

export const DEFAULT_AI_CONFIG: AIProviderConfig = {
  geminiApiKey: '',
  geminiModel: 'gemini-1.5-flash',
  enableWebGrounding: true,

  groqApiKey: '',
  groqTextModel: 'llama-3.1-8b-instant',
  groqVisionModel: 'llama-3.2-11b-vision-preview',
  groqWhisperModel: 'whisper-large-v3',

  openrouterApiKey: '',
  openrouterModel: 'deepseek/deepseek-chat',

  sttEngine: 'browser',
  customPriority: ['gemini', 'groq', 'openrouter'],
};

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
  attachmentPreview?: string;
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


