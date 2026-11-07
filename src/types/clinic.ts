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

export interface ClinicSettings {
  identity: ClinicIdentity;
  appearance: ClinicAppearance;
  features: ClinicFeatures;
  services: DentalServiceItem[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
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

export default null;

