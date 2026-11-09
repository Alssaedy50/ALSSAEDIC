import type {
  ConsumedMaterialEntry,
  DentalServiceItem,
  InventoryItem,
} from '../types/clinic';

function convertUnderThousand(n: number): string {
  const ones = [
    '',
    'واحد',
    'اثنان',
    'ثلاثة',
    'أربعة',
    'خمسة',
    'ستة',
    'سبعة',
    'ثمانية',
    'تسعة',
    'عشرة',
    'أحد عشر',
    'اثنا عشر',
    'ثلاثة عشر',
    'أربعة عشر',
    'خمسة عشر',
    'ستة عشر',
    'سبعة عشر',
    'ثمانية عشر',
    'تسعة عشر',
  ];
  const tens = [
    '',
    '',
    'عشرون',
    'ثلاثون',
    'أربعون',
    'خمسون',
    'ستون',
    'سبعون',
    'ثمانون',
    'تسعون',
  ];
  const hundreds = [
    '',
    'مائة',
    'مائتان',
    'ثلاثمائة',
    'أربعمائة',
    'خمسمائة',
    'ستمائة',
    'سبعمائة',
    'ثمانمائة',
    'تسعمائة',
  ];

  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const rem = n % 100;

  if (h > 0) parts.push(hundreds[h]);
  if (rem > 0) {
    if (rem < 20) {
      parts.push(ones[rem]);
    } else {
      const u = rem % 10;
      const t = Math.floor(rem / 10);
      parts.push(u > 0 ? `${ones[u]} و${tens[t]}` : tens[t]);
    }
  }
  return parts.join(' و');
}

export function numberToArabicWords(amount: number, currency = 'ريال يمني'): string {
  const curr = currency || 'ريال يمني';
  const num = Math.floor(Math.abs(Number(amount) || 0));
  if (num === 0) return `صفر ${curr} فقط لا غير`;

  const mil = Math.floor(num / 1000000);
  const tho = Math.floor((num % 1000000) / 1000);
  const rem = num % 1000;

  const segments: string[] = [];
  if (mil > 0) {
    if (mil === 1) segments.push('مليون');
    else if (mil === 2) segments.push('مليونان');
    else if (mil >= 3 && mil <= 10) segments.push(`${convertUnderThousand(mil)} ملايين`);
    else segments.push(`${convertUnderThousand(mil)} مليون`);
  }

  if (tho > 0) {
    if (tho === 1) segments.push('ألف');
    else if (tho === 2) segments.push('ألفان');
    else if (tho >= 3 && tho <= 10) segments.push(`${convertUnderThousand(tho)} آلاف`);
    else segments.push(`${convertUnderThousand(tho)} ألف`);
  }

  if (rem > 0) {
    segments.push(convertUnderThousand(rem));
  }

  return `${segments.join(' و')} ${curr} فقط لا غير`;
}

export function parseFDIToothNumbers(value: string): { values: string[]; invalid: string[] } {
  const tokens = String(value || '')
    .trim()
    .split(/[,،;\s-]+/)
    .filter(Boolean);
  const valid = new Set<string>();
  [11, 21, 31, 41, 51, 61, 71, 81].forEach((start) => {
    const max = start >= 51 ? 5 : 8;
    for (let n = 1; n <= max; n++) {
      valid.add(String(start + n - 1));
    }
  });
  const unique = [...new Set(tokens)];
  return {
    values: unique.filter((n) => valid.has(n)),
    invalid: unique.filter((n) => !valid.has(n)),
  };
}

export interface FDITeethConsumptionAnalysis {
  teeth: string[];
  anteriorCount: number;
  molarCount: number;
  totalTeeth: number;
  hasUpperArch: boolean;
  hasLowerArch: boolean;
  affectedArches: number;
}

export function analyzeFDITeethForConsumption(toothFDI: string): FDITeethConsumptionAnalysis {
  const { values } = parseFDIToothNumbers(toothFDI);
  let anteriorCount = 0;
  let molarCount = 0;
  let hasUpperArch = false;
  let hasLowerArch = false;

  for (const tooth of values) {
    if (tooth.length < 2) continue;
    const quadrant = tooth[0];
    const position = tooth[tooth.length - 1];

    if (quadrant === '1' || quadrant === '2' || quadrant === '5' || quadrant === '6') {
      hasUpperArch = true;
    } else if (quadrant === '3' || quadrant === '4' || quadrant === '7' || quadrant === '8') {
      hasLowerArch = true;
    }

    if (position === '1' || position === '2' || position === '3') {
      anteriorCount += 1;
    } else if (
      position === '4' ||
      position === '5' ||
      position === '6' ||
      position === '7' ||
      position === '8'
    ) {
      molarCount += 1;
    }
  }

  const totalTeeth = anteriorCount + molarCount;
  const affectedArches = (hasUpperArch ? 1 : 0) + (hasLowerArch ? 1 : 0);

  return {
    teeth: values,
    anteriorCount,
    molarCount,
    totalTeeth,
    hasUpperArch,
    hasLowerArch,
    affectedArches,
  };
}

export function getEffectivePackageSize(item: Pick<InventoryItem, 'packageSize'>): number {
  const raw = Number(item.packageSize);
  return Number.isFinite(raw) && raw > 0 ? raw : 1;
}

export function getEffectiveRemainingSubUnits(
  item: Pick<InventoryItem, 'qty' | 'packageSize' | 'remainingSubUnits'>
): number {
  const pkgSize = getEffectivePackageSize(item);
  const rawSub = Number(item.remainingSubUnits);
  if (Number.isFinite(rawSub) && rawSub >= 0) {
    return +rawSub.toFixed(3);
  }
  const safeQty = Math.max(0, Number(item.qty) || 0);
  return +(safeQty * pkgSize).toFixed(3);
}

export function calculateReceiptMaterialsConsumption(
  servicesNames: string[],
  toothFDI: string,
  servicesCatalog: DentalServiceItem[],
  inventory: InventoryItem[]
): ConsumedMaterialEntry[] {
  const analysis = analyzeFDITeethForConsumption(toothFDI);
  const totalsByMaterialId = new Map<string, number>();
  const validInventoryIds = new Set(inventory.map((i) => i.id));

  const addDeduction = (materialId: string, amount: number) => {
    if (!materialId || !validInventoryIds.has(materialId)) return;
    const numeric = Number(amount);
    if (!Number.isFinite(numeric) || numeric <= 0) return;
    const prev = totalsByMaterialId.get(materialId) || 0;
    totalsByMaterialId.set(materialId, +(prev + numeric).toFixed(4));
  };

  for (const rawSrvName of servicesNames) {
    const cleanName = String(rawSrvName || '').trim();
    if (!cleanName) continue;

    const matchedService = servicesCatalog.find(
      (s) => s.name.trim() === cleanName || cleanName.includes(s.name.trim())
    );

    const recipe = matchedService?.materialsRecipe || [];
    const coveredByRecipeIds = new Set<string>();

    if (recipe.length > 0) {
      for (const rule of recipe) {
        if (!rule || !rule.materialId) continue;
        coveredByRecipeIds.add(rule.materialId);

        let amountToDeduct = 0;
        if (rule.consumptionType === 'per_session') {
          amountToDeduct = Math.max(0, Number(rule.qtyFixed) || 0);
        } else if (rule.consumptionType === 'by_tooth_type') {
          const qtyAnt = Math.max(0, Number(rule.qtyAnterior) || 0);
          const qtyMol = Math.max(0, Number(rule.qtyMolar) || 0);
          if (analysis.totalTeeth > 0) {
            amountToDeduct = analysis.anteriorCount * qtyAnt + analysis.molarCount * qtyMol;
          } else {
            // Fallback when doctor did not enter FDI teeth: assume 1 tooth (prefer molar rate or anterior rate)
            amountToDeduct = qtyMol > 0 ? qtyMol : qtyAnt;
          }
        } else if (rule.consumptionType === 'per_tooth_unit') {
          const qtyPerUnit = Math.max(0, Number(rule.qtyFixed) || 0);
          const unitsCount = Math.max(1, analysis.totalTeeth);
          amountToDeduct = unitsCount * qtyPerUnit;
        } else if (rule.consumptionType === 'per_arch') {
          const qtyPerArch = Math.max(0, Number(rule.qtyFixed) || 0);
          const archesCount = Math.max(1, analysis.affectedArches);
          amountToDeduct = archesCount * qtyPerArch;
        }

        addDeduction(rule.materialId, amountToDeduct);
      }
    }

    // Legacy fallback: if an inventory item has `linkedService` matching this service and wasn't in `materialsRecipe`
    for (const invItem of inventory) {
      if (
        invItem.linkedService &&
        invItem.linkedService.trim() === cleanName &&
        !coveredByRecipeIds.has(invItem.id)
      ) {
        addDeduction(invItem.id, 1);
      }
    }
  }

  return Array.from(totalsByMaterialId.entries()).map(([materialId, amountDeducted]) => ({
    materialId,
    amountDeducted: +amountDeducted.toFixed(3),
  }));
}

export function applyMaterialDeductionsToInventory(
  inventory: InventoryItem[],
  entries: ConsumedMaterialEntry[],
  mode: 'deduct' | 'restore',
  updatedAtDate: string
): { nextInventory: InventoryItem[]; touchedItems: InventoryItem[] } {
  if (!Array.isArray(entries) || entries.length === 0) {
    return { nextInventory: inventory, touchedItems: [] };
  }

  const deltaByMaterialId = new Map<string, number>();
  for (const entry of entries) {
    if (!entry?.materialId) continue;
    const amt = Number(entry.amountDeducted);
    if (!Number.isFinite(amt) || amt <= 0) continue;
    deltaByMaterialId.set(entry.materialId, (deltaByMaterialId.get(entry.materialId) || 0) + amt);
  }

  if (deltaByMaterialId.size === 0) {
    return { nextInventory: inventory, touchedItems: [] };
  }

  const touchedItems: InventoryItem[] = [];
  const nextInventory = inventory.map((item) => {
    const deltaSubUnits = deltaByMaterialId.get(item.id);
    if (!deltaSubUnits) return item;

    const pkgSize = getEffectivePackageSize(item);
    const currentSubUnits = getEffectiveRemainingSubUnits(item);
    const nextSubUnits =
      mode === 'deduct'
        ? Math.max(0, +(currentSubUnits - deltaSubUnits).toFixed(3))
        : +(currentSubUnits + deltaSubUnits).toFixed(3);

    const nextQty = Math.max(0, +(nextSubUnits / pkgSize).toFixed(2));
    const nextTotalCost = +(nextQty * Number(item.unitPrice || 0)).toFixed(2);

    const updatedItem: InventoryItem = {
      ...item,
      packageSize: pkgSize,
      usageUnit: item.usageUnit || item.unit || 'قطعة',
      remainingSubUnits: nextSubUnits,
      qty: nextQty,
      totalCost: nextTotalCost,
      updatedAt: updatedAtDate,
    };
    touchedItems.push(updatedItem);
    return updatedItem;
  });

  return { nextInventory, touchedItems };
}
