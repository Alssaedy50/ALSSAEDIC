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
    .split(/[,،;/\s-]+/)
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

/**
 * Parses a service label that may contain embedded tooth numbers,
 * e.g. "علاج عصب وجذور (سن: 12 / 14)" -> { serviceName: "علاج عصب وجذور", teeth: ["12", "14"] }
 */
export function parseServiceWithTeeth(rawService: string): {
  serviceName: string;
  teeth: string[];
} {
  const raw = String(rawService || '').trim();
  if (!raw) return { serviceName: '', teeth: [] };

  const match = raw.match(/^(.*?)\s*\(\s*(?:سن|أسنان|اسنان|FDI)\s*[:：]?\s*([^)]+)\)\s*$/i);
  if (match) {
    const serviceName = match[1].trim();
    const teeth = parseFDIToothNumbers(match[2]).values;
    return { serviceName: serviceName || raw, teeth };
  }

  return { serviceName: raw, teeth: [] };
}

/**
 * Formats a base service name with its assigned FDI teeth so each service retains its exact tooth numbers.
 */
export function formatServiceWithTeeth(serviceName: string, teeth: string[]): string {
  const baseName = parseServiceWithTeeth(serviceName).serviceName;
  if (!baseName) return '';
  const validTeeth = parseFDIToothNumbers((teeth || []).join(' / ')).values;
  if (validTeeth.length === 0) return baseName;
  return `${baseName} (سن: ${validTeeth.join(' / ')})`;
}

/**
 * Splits a raw service string or array into individual service entries without breaking parenthesized tooth lists.
 */
export function splitServiceEntriesPreservingTeeth(servicesInput: string[] | string): string[] {
  const rawList = Array.isArray(servicesInput) ? servicesInput : [servicesInput];
  const result: string[] = [];

  for (const item of rawList) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (!trimmed) continue;

    // Split on '+' or commas ONLY when outside parentheses
    let current = '';
    let depth = 0;
    for (let i = 0; i < trimmed.length; i++) {
      const ch = trimmed[i];
      if (ch === '(') depth++;
      else if (ch === ')' && depth > 0) depth--;

      if (depth === 0 && (ch === '+' || ch === '،' || ch === ',')) {
        if (current.trim()) result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    if (current.trim()) {
      result.push(current.trim());
    }
  }

  return result;
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
    return +rawSub.toFixed(4);
  }
  const safeQty = Math.max(0, Number(item.qty) || 0);
  return +(safeQty * pkgSize).toFixed(4);
}

export function isServiceAlreadyBilledForPatient(
  serviceName: string,
  toothFDI: string,
  previousReceipts: ReceiptRecord[]
): { isAlreadyBilled: boolean; unbilledTeeth: string[] } {
  const parsedCurrent = parseServiceWithTeeth(serviceName);
  const cleanName = parsedCurrent.serviceName;
  const currentTeeth =
    parsedCurrent.teeth.length > 0
      ? parsedCurrent.teeth
      : parseFDIToothNumbers(toothFDI).values;

  if (!cleanName || !Array.isArray(previousReceipts) || previousReceipts.length === 0) {
    return {
      isAlreadyBilled: false,
      unbilledTeeth: currentTeeth,
    };
  }

  // Find all previous receipts of this patient that included this service name
  const matchingPrevious = previousReceipts.filter((r) =>
    splitServiceEntriesPreservingTeeth(Array.isArray(r.services) ? r.services : []).some((s) => {
      const prevBase = parseServiceWithTeeth(s).serviceName;
      return (
        prevBase === cleanName ||
        cleanName.includes(prevBase) ||
        prevBase.includes(cleanName)
      );
    })
  );

  if (matchingPrevious.length === 0) {
    return {
      isAlreadyBilled: false,
      unbilledTeeth: currentTeeth,
    };
  }

  // Collect all teeth previously treated for this specific service
  const previouslyTreatedTeeth = new Set<string>();
  let previousHadNoTeeth = false;

  for (const prev of matchingPrevious) {
    const prevServices = splitServiceEntriesPreservingTeeth(
      Array.isArray(prev.services) ? prev.services : []
    );
    let foundSpecificServiceTeeth = false;
    for (const rawSrv of prevServices) {
      const parsedPrev = parseServiceWithTeeth(rawSrv);
      if (
        parsedPrev.serviceName === cleanName ||
        cleanName.includes(parsedPrev.serviceName) ||
        parsedPrev.serviceName.includes(cleanName)
      ) {
        if (parsedPrev.teeth.length > 0) {
          parsedPrev.teeth.forEach((t) => previouslyTreatedTeeth.add(t));
          foundSpecificServiceTeeth = true;
        }
      }
    }

    if (!foundSpecificServiceTeeth) {
      const prevTeeth = parseFDIToothNumbers(prev.toothFDI || '').values;
      if (prevTeeth.length === 0) {
        previousHadNoTeeth = true;
      } else {
        prevTeeth.forEach((t) => previouslyTreatedTeeth.add(t));
      }
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

export interface CalculateConsumptionOptions {
  /**
   * When true (return visit / installment), services already billed on the same teeth in earlier receipts are skipped.
   * When false or omitted (new primary receipt), ALL selected services deduct materials for their assigned teeth.
   */
  isReturnVisit?: boolean;
  /**
   * Optional explicit mapping from base service name to its assigned FDI tooth numbers.
   */
  serviceTeethMap?: Record<string, string[]>;
}

export function calculateReceiptMaterialsConsumption(
  servicesNames: string[],
  toothFDI: string,
  servicesCatalog: DentalServiceItem[],
  inventory: InventoryItem[],
  patientPreviousReceipts: ReceiptRecord[] = [],
  options?: CalculateConsumptionOptions
): ConsumedMaterialEntry[] {
  const validInventoryIds = new Set(inventory.map((i) => i.id));
  const fullTeethAnalysis = analyzeFDITeethForConsumption(toothFDI);
  const isReturnVisit = Boolean(options?.isReturnVisit);
  const explicitServiceTeethMap = options?.serviceTeethMap || {};

  interface ServiceToDeductInfo {
    serviceItem: DentalServiceItem;
    assignedTeeth: string[];
    teethAnalysis: FDITeethConsumptionAnalysis;
    totalSessions: number;
  }

  const servicesToDeduct: ServiceToDeductInfo[] = [];
  const flattenedServices = splitServiceEntriesPreservingTeeth(servicesNames);

  for (const rawEntry of flattenedServices) {
    const parsed = parseServiceWithTeeth(rawEntry);
    const cleanName = parsed.serviceName;
    if (!cleanName) continue;

    // Determine specific teeth assigned to this service:
    // 1. Explicit serviceTeethMap passed from UI
    // 2. Embedded teeth in the service string e.g. "علاج عصب وجذور (سن: 12)"
    // 3. General receipt toothFDI
    const mappedTeeth = explicitServiceTeethMap[cleanName];
    const initialServiceTeeth =
      Array.isArray(mappedTeeth) && mappedTeeth.length > 0
        ? parseFDIToothNumbers(mappedTeeth.join(' / ')).values
        : parsed.teeth.length > 0
          ? parsed.teeth
          : fullTeethAnalysis.teeth;

    let finalTeethForService = initialServiceTeeth;

    // Only skip previously billed services if this receipt is a Return Visit / Follow-up
    if (isReturnVisit && patientPreviousReceipts.length > 0) {
      const check = isServiceAlreadyBilledForPatient(
        cleanName,
        initialServiceTeeth.join(' - '),
        patientPreviousReceipts
      );
      if (check.isAlreadyBilled) {
        continue;
      }
      if (check.unbilledTeeth.length > 0) {
        finalTeethForService = check.unbilledTeeth;
      }
    }

    // Match service in catalog (exact match first, then case-insensitive, then substring)
    const matchedService =
      servicesCatalog.find((s) => s.name.trim() === cleanName) ||
      servicesCatalog.find((s) => s.name.trim().toLowerCase() === cleanName.toLowerCase()) ||
      servicesCatalog.find(
        (s) =>
          cleanName.includes(s.name.trim()) ||
          s.name.trim().includes(cleanName)
      );

    const analysisForThisService =
      finalTeethForService.length > 0
        ? analyzeFDITeethForConsumption(finalTeethForService.join(' - '))
        : fullTeethAnalysis;

    const totalSessions = Math.max(
      1,
      Number((matchedService as { sessionsCount?: number } | undefined)?.sessionsCount) ||
        Number(matchedService?.totalSessions) ||
        1
    );

    if (matchedService) {
      servicesToDeduct.push({
        serviceItem: matchedService,
        assignedTeeth: finalTeethForService,
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
        assignedTeeth: finalTeethForService,
        teethAnalysis: analysisForThisService,
        totalSessions: 1,
      });
    }
  }

  if (servicesToDeduct.length === 0) {
    return [];
  }

  const perSessionMaxByMaterial = new Map<string, number>();
  const perArchMaxFixedByMaterial = new Map<string, number>();
  const directTotalsByMaterial = new Map<string, number>();

  for (const info of servicesToDeduct) {
    const srv = info.serviceItem;
    const recipe = Array.isArray(srv.materialsRecipe) ? srv.materialsRecipe : [];
    const analysis = info.teethAnalysis;
    const totalSessions = info.totalSessions;
    const DeductedMaterialsForThisService = new Set<string>();

    if (recipe.length > 0) {
      for (const rule of recipe) {
        if (!rule || !rule.materialId) continue;

        let resolvedMaterialId = rule.materialId;
        if (!validInventoryIds.has(resolvedMaterialId)) {
          // Fallback: if materialId was recreated, try matching by materialName if present
          const ruleMatName = String((rule as { materialName?: string }).materialName || '').trim();
          const matchedInv = ruleMatName
            ? inventory.find((i) => i.name.trim() === ruleMatName)
            : undefined;
          if (matchedInv) {
            resolvedMaterialId = matchedInv.id;
          } else {
            continue;
          }
        }

        const sessionMultiplier = rule.sessionNumber === 'all' ? totalSessions : 1;
        const fallbackFixed = Math.max(
          0,
          Number(rule.qtyFixed) || Number(rule.qtyMolar) || Number(rule.qtyAnterior) || 1
        );

        if (rule.consumptionType === 'per_session') {
          const serviceQtyForThisMaterial = +(fallbackFixed * sessionMultiplier).toFixed(4);
          const currentMax = perSessionMaxByMaterial.get(resolvedMaterialId) || 0;
          perSessionMaxByMaterial.set(
            resolvedMaterialId,
            Math.max(currentMax, serviceQtyForThisMaterial)
          );
          DeductedMaterialsForThisService.add(resolvedMaterialId);
        } else if (rule.consumptionType === 'per_arch') {
          const ruleFixed = +(fallbackFixed * sessionMultiplier).toFixed(4);
          const currentMaxFixed = perArchMaxFixedByMaterial.get(resolvedMaterialId) || 0;
          perArchMaxFixedByMaterial.set(
            resolvedMaterialId,
            Math.max(currentMaxFixed, ruleFixed)
          );
          DeductedMaterialsForThisService.add(resolvedMaterialId);
        } else if (rule.consumptionType === 'by_tooth_type') {
          const rawAnt = Math.max(0, Number(rule.qtyAnterior) || Number(rule.qtyFixed) || 0);
          const rawMol = Math.max(0, Number(rule.qtyMolar) || Number(rule.qtyFixed) || 0);
          const qtyAnt = rawAnt === 0 && rawMol === 0 ? 1 : rawAnt;
          const qtyMol = rawAnt === 0 && rawMol === 0 ? 1 : rawMol;
          let ruleAmount = 0;
          if (analysis.totalTeeth > 0) {
            ruleAmount =
              (analysis.anteriorCount * qtyAnt + analysis.molarCount * qtyMol) *
              sessionMultiplier;
          } else {
            ruleAmount = (qtyMol > 0 ? qtyMol : qtyAnt) * sessionMultiplier;
          }
          const prev = directTotalsByMaterial.get(resolvedMaterialId) || 0;
          directTotalsByMaterial.set(resolvedMaterialId, +(prev + ruleAmount).toFixed(4));
          DeductedMaterialsForThisService.add(resolvedMaterialId);
        } else if (rule.consumptionType === 'per_tooth_unit') {
          const unitsCount = Math.max(1, analysis.totalTeeth);
          const ruleAmount = unitsCount * fallbackFixed * sessionMultiplier;
          const prev = directTotalsByMaterial.get(resolvedMaterialId) || 0;
          directTotalsByMaterial.set(resolvedMaterialId, +(prev + ruleAmount).toFixed(4));
          DeductedMaterialsForThisService.add(resolvedMaterialId);
        }
      }
    }

    // Also check any inventory item explicitly linked to this service via `linkedService`
    const srvName = srv.name.trim();
    for (const invItem of inventory) {
      if (
        invItem.linkedService &&
        (invItem.linkedService.trim() === srvName ||
          srvName.includes(invItem.linkedService.trim()) ||
          invItem.linkedService.trim().includes(srvName)) &&
        !DeductedMaterialsForThisService.has(invItem.id)
      ) {
        const unitsCount = Math.max(1, analysis.totalTeeth);
        const prev = directTotalsByMaterial.get(invItem.id) || 0;
        directTotalsByMaterial.set(invItem.id, +(prev + unitsCount).toFixed(4));
        DeductedMaterialsForThisService.add(invItem.id);
      }
    }
  }

  // Combine results into final deductions map
  const finalMap = new Map<string, number>();

  for (const [matId, maxAmount] of perSessionMaxByMaterial.entries()) {
    if (maxAmount > 0) {
      finalMap.set(matId, +((finalMap.get(matId) || 0) + maxAmount).toFixed(4));
    }
  }

  const actualAffectedArches = Math.max(1, fullTeethAnalysis.affectedArches);
  for (const [matId, maxFixed] of perArchMaxFixedByMaterial.entries()) {
    if (maxFixed > 0) {
      const archAmount = +(maxFixed * actualAffectedArches).toFixed(4);
      finalMap.set(matId, +((finalMap.get(matId) || 0) + archAmount).toFixed(4));
    }
  }

  for (const [matId, amount] of directTotalsByMaterial.entries()) {
    if (amount > 0) {
      finalMap.set(matId, +((finalMap.get(matId) || 0) + amount).toFixed(4));
    }
  }

  return Array.from(finalMap.entries())
    .map(([materialId, amountDeducted]) => ({
      materialId,
      amountDeducted: +amountDeducted.toFixed(4),
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
    deltaByMaterialId.set(
      entry.materialId,
      +((deltaByMaterialId.get(entry.materialId) || 0) + amt).toFixed(4)
    );
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
        ? Math.max(0, +(currentSubUnits - deltaSubUnits).toFixed(4))
        : +(currentSubUnits + deltaSubUnits).toFixed(4);

    const nextQty = Math.max(0, +(nextSubUnits / pkgSize).toFixed(4));
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
