import type {
  ConsumedMaterialEntry,
  DentalServiceItem,
  InventoryItem,
  ReceiptRecord,
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

export function isServiceAlreadyBilledForPatient(
  serviceName: string,
  toothFDI: string,
  previousReceipts: ReceiptRecord[]
): { isAlreadyBilled: boolean; unbilledTeeth: string[] } {
  const cleanName = String(serviceName || '').trim();
  const currentTeeth = parseFDIToothNumbers(toothFDI).values;

  if (!cleanName || !Array.isArray(previousReceipts) || previousReceipts.length === 0) {
    return {
      isAlreadyBilled: false,
      unbilledTeeth: currentTeeth,
    };
  }

  // Find all previous receipts of this patient that included this service name
  const matchingPrevious = previousReceipts.filter((r) =>
    (Array.isArray(r.services) ? r.services : []).some(
      (s) => s.trim() === cleanName || cleanName.includes(s.trim()) || s.trim().includes(cleanName)
    )
  );

  if (matchingPrevious.length === 0) {
    return {
      isAlreadyBilled: false,
      unbilledTeeth: currentTeeth,
    };
  }

  // Collect all teeth previously treated for this service
  const previouslyTreatedTeeth = new Set<string>();
  let previousHadNoTeeth = false;

  for (const prev of matchingPrevious) {
    const prevTeeth = parseFDIToothNumbers(prev.toothFDI || '').values;
    if (prevTeeth.length === 0) {
      previousHadNoTeeth = true;
    } else {
      prevTeeth.forEach((t) => previouslyTreatedTeeth.add(t));
    }
  }

  // Case 1: Current receipt has no teeth specified
  if (currentTeeth.length === 0) {
    return { isAlreadyBilled: true, unbilledTeeth: [] };
  }

  // Case 2: Previous had general package without tooth numbers
  if (previousHadNoTeeth && previouslyTreatedTeeth.size === 0) {
    return { isAlreadyBilled: true, unbilledTeeth: [] };
  }

  // Case 3: Filter current teeth to those not treated previously
  const unbilledTeeth = currentTeeth.filter((t) => !previouslyTreatedTeeth.has(t));
  if (unbilledTeeth.length === 0) {
    return { isAlreadyBilled: true, unbilledTeeth: [] };
  }

  return { isAlreadyBilled: false, unbilledTeeth };
}

export function calculateReceiptMaterialsConsumption(
  servicesNames: string[],
  toothFDI: string,
  servicesCatalog: DentalServiceItem[],
  inventory: InventoryItem[],
  patientPreviousReceipts: ReceiptRecord[] = []
): ConsumedMaterialEntry[] {
  const validInventoryIds = new Set(inventory.map((i) => i.id));
  const fullTeethAnalysis = analyzeFDITeethForConsumption(toothFDI);

  // 1. Identify which services are newly billable for this patient
  interface ServiceToDeductInfo {
    serviceItem: DentalServiceItem;
    unbilledTeeth: string[];
    teethAnalysis: FDITeethConsumptionAnalysis;
    totalSessions: number;
  }

  const servicesToDeduct: ServiceToDeductInfo[] = [];

  const flattenedServices: string[] = [];
  for (const raw of servicesNames) {
    if (typeof raw === 'string') {
      const parts = raw
        .split(/\s*(?:[-–—+]|،|,|\band\b)\s*/)
        .map((p) => p.trim())
        .filter(Boolean);
      if (parts.length > 0) {
        flattenedServices.push(...parts);
      } else if (raw.trim()) {
        flattenedServices.push(raw.trim());
      }
    }
  }

  for (const cleanName of flattenedServices) {
    if (!cleanName) continue;

    // Check if already billed in previous receipts for this patient
    const check = isServiceAlreadyBilledForPatient(cleanName, toothFDI, patientPreviousReceipts);
    if (check.isAlreadyBilled) {
      // Service was already billed in a previous receipt for this patient => 0 deduction!
      continue;
    }

    const matchedService = servicesCatalog.find(
      (s) =>
        s.name.trim() === cleanName ||
        cleanName.includes(s.name.trim()) ||
        s.name.trim().includes(cleanName)
    );

    const teethForThisService =
      check.unbilledTeeth.length > 0 ? check.unbilledTeeth : fullTeethAnalysis.teeth;

    const analysisForThisService =
      check.unbilledTeeth.length > 0
        ? analyzeFDITeethForConsumption(check.unbilledTeeth.join(' - '))
        : fullTeethAnalysis;

    const totalSessions = Math.max(
      1,
      Number((matchedService as any)?.sessionsCount) ||
        Number(matchedService?.totalSessions) ||
        1
    );

    if (matchedService) {
      servicesToDeduct.push({
        serviceItem: matchedService,
        unbilledTeeth: teethForThisService,
        teethAnalysis: analysisForThisService,
        totalSessions,
      });
    } else {
      servicesToDeduct.push({
        serviceItem: {
          id: `tmp_${cleanName}`,
          name: cleanName,
          price: 0,
          category: 'عام',
          keywords: [cleanName],
        },
        unbilledTeeth: teethForThisService,
        teethAnalysis: analysisForThisService,
        totalSessions: 1,
      });
    }
  }

  if (servicesToDeduct.length === 0) {
    return [];
  }

  // 2. Prevent duplication of shared materials:
  // - per_session materials: take the maximum across services (based on highest session requirement)
  // - per_arch materials: take max qtyFixed * actual affected arches (calculated once per actual arch)
  // - by_tooth_type & per_tooth_unit: tooth-specific, summed for each new service

  const perSessionMaxByMaterial = new Map<string, number>();
  const perArchMaxFixedByMaterial = new Map<string, number>();
  const directTotalsByMaterial = new Map<string, number>();
  const coveredByRecipeServiceNames = new Set<string>();

  for (const info of servicesToDeduct) {
    const srv = info.serviceItem;
    const recipe = srv.materialsRecipe || [];
    const analysis = info.teethAnalysis;
    const totalSessions = info.totalSessions;

    if (recipe.length > 0) {
      coveredByRecipeServiceNames.add(srv.name.trim());
      for (const rule of recipe) {
        if (!rule || !rule.materialId || !validInventoryIds.has(rule.materialId)) continue;

        // How many times does this rule execute across the service sessions?
        // If sessionNumber === 'all', it runs every session (= totalSessions times).
        // If sessionNumber is a specific number (e.g. 1, 2), it runs 1 time for that specific session.
        const sessionMultiplier = rule.sessionNumber === 'all' ? totalSessions : 1;

        if (rule.consumptionType === 'per_session') {
          const serviceQtyForThisMaterial =
            (Math.max(0, Number(rule.qtyFixed) || 0)) * sessionMultiplier;
          const currentMax = perSessionMaxByMaterial.get(rule.materialId) || 0;
          perSessionMaxByMaterial.set(
            rule.materialId,
            Math.max(currentMax, serviceQtyForThisMaterial)
          );
        } else if (rule.consumptionType === 'per_arch') {
          const ruleFixed = (Math.max(0, Number(rule.qtyFixed) || 0)) * sessionMultiplier;
          const currentMaxFixed = perArchMaxFixedByMaterial.get(rule.materialId) || 0;
          perArchMaxFixedByMaterial.set(
            rule.materialId,
            Math.max(currentMaxFixed, ruleFixed)
          );
        } else if (rule.consumptionType === 'by_tooth_type') {
          const qtyAnt = Math.max(0, Number(rule.qtyAnterior) || 0);
          const qtyMol = Math.max(0, Number(rule.qtyMolar) || 0);
          let ruleAmount = 0;
          if (analysis.totalTeeth > 0) {
            ruleAmount =
              (analysis.anteriorCount * qtyAnt + analysis.molarCount * qtyMol) *
              sessionMultiplier;
          } else {
            ruleAmount = (qtyMol > 0 ? qtyMol : qtyAnt) * sessionMultiplier;
          }
          const prev = directTotalsByMaterial.get(rule.materialId) || 0;
          directTotalsByMaterial.set(rule.materialId, +(prev + ruleAmount).toFixed(4));
        } else if (rule.consumptionType === 'per_tooth_unit') {
          const qtyPerUnit = Math.max(0, Number(rule.qtyFixed) || 0);
          const unitsCount = Math.max(1, analysis.totalTeeth);
          const ruleAmount = unitsCount * qtyPerUnit * sessionMultiplier;
          const prev = directTotalsByMaterial.get(rule.materialId) || 0;
          directTotalsByMaterial.set(rule.materialId, +(prev + ruleAmount).toFixed(4));
        }
      }
    }
  }

  // Combine results into final deductions map
  const finalMap = new Map<string, number>();

  // Add per_session materials
  for (const [matId, maxAmount] of perSessionMaxByMaterial.entries()) {
    if (maxAmount > 0) {
      finalMap.set(matId, +((finalMap.get(matId) || 0) + maxAmount).toFixed(4));
    }
  }

  // Add per_arch materials (once per actual affected arch)
  const actualAffectedArches = Math.max(1, fullTeethAnalysis.affectedArches);
  for (const [matId, maxFixed] of perArchMaxFixedByMaterial.entries()) {
    if (maxFixed > 0) {
      const archAmount = +(maxFixed * actualAffectedArches).toFixed(4);
      finalMap.set(matId, +((finalMap.get(matId) || 0) + archAmount).toFixed(4));
    }
  }

  // Add direct totals (by_tooth_type and per_tooth_unit)
  for (const [matId, amount] of directTotalsByMaterial.entries()) {
    if (amount > 0) {
      finalMap.set(matId, +((finalMap.get(matId) || 0) + amount).toFixed(4));
    }
  }

  // Legacy fallback: if an inventory item has `linkedService` matching any newly billed service
  for (const info of servicesToDeduct) {
    const srvName = info.serviceItem.name.trim();
    if (!coveredByRecipeServiceNames.has(srvName)) {
      for (const invItem of inventory) {
        if (invItem.linkedService && invItem.linkedService.trim() === srvName) {
          finalMap.set(invItem.id, +((finalMap.get(invItem.id) || 0) + 1).toFixed(4));
        }
      }
    }
  }

  return Array.from(finalMap.entries())
    .map(([materialId, amountDeducted]) => ({
      materialId,
      amountDeducted: +amountDeducted.toFixed(3),
    }))
    .filter((e) => e.amountDeducted > 0);
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
