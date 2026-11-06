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
  if (num === 0) return `صفر ${curr} لا غير`;

  const mil = Math.floor(num / 1000000);
  const tho = Math.floor((num % 1000000) / 1000);
  const rem = num % 1000;

  const segments: string[] = [];
  if (mil > 0) {
    if (mil === 1) segments.push('مليون');
    else if (mil === 2) segments.push('مليونان');
    else if (mil >= 3 && mil <= 10) segments.push(`${convertUnderThousand(mil)} ملايين`);
    else segments.push(`${convertUnderThousand(mil)} مليوناً`);
  }

  if (tho > 0) {
    if (tho === 1) segments.push('ألف');
    else if (tho === 2) segments.push('ألفان');
    else if (tho >= 3 && tho <= 10) segments.push(`${convertUnderThousand(tho)} آلاف`);
    else segments.push(`${convertUnderThousand(tho)} ألفاً`);
  }

  if (rem > 0) {
    segments.push(convertUnderThousand(rem));
  }

  return `فقط ${segments.join(' و')} ${curr} لا غير`;
}

export function parseFDIToothNumbers(value: string): { values: string[]; invalid: string[] } {
  const tokens = String(value || '')
    .trim()
    .split(/[,،;\s]+/)
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
