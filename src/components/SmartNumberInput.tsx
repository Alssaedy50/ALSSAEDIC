import React, { useEffect, useRef, useState } from 'react';

const ARABIC_INDIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const EASTERN_ARABIC_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

/**
 * Normalizes any user-typed numeric string (including Arabic/Persian digits and comma/Arabic decimal separators)
 * into a clean Western numeric string suitable for decimal/integer parsing.
 */
export function normalizeNumericString(
  raw: string,
  options?: { allowDecimal?: boolean; allowNegative?: boolean }
): string {
  const allowDecimal = options?.allowDecimal !== false;
  const allowNegative = options?.allowNegative === true;

  let out = '';
  let hasDot = false;
  let hasMinus = false;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];

    // Check Arabic-Indic digits
    const arIdx = ARABIC_INDIC_DIGITS.indexOf(ch);
    if (arIdx !== -1) {
      out += String(arIdx);
      continue;
    }

    // Check Eastern Arabic / Persian digits
    const faIdx = EASTERN_ARABIC_DIGITS.indexOf(ch);
    if (faIdx !== -1) {
      out += String(faIdx);
      continue;
    }

    // Standard ASCII digits
    if (ch >= '0' && ch <= '9') {
      out += ch;
      continue;
    }

    // Decimal separators: '.', ',', '٫' (U+066B), '،' (U+060C)
    if (allowDecimal && (ch === '.' || ch === ',' || ch === '٫' || ch === '،')) {
      if (!hasDot) {
        out += '.';
        hasDot = true;
      }
      continue;
    }

    // Leading negative sign
    if (allowNegative && ch === '-' && out.length === 0 && !hasMinus) {
      out += '-';
      hasMinus = true;
    }
  }

  return out;
}

export function parseFlexibleNumber(raw: string, fallback = 0): number {
  const normalized = normalizeNumericString(raw, { allowDecimal: true, allowNegative: true });
  if (!normalized || normalized === '.' || normalized === '-' || normalized === '-.') {
    return fallback;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export interface SmartNumberInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  value: number | string | undefined | null;
  onValueChange: (numericValue: number, rawString: string) => void;
  allowDecimal?: boolean;
  allowNegative?: boolean;
  emptyWhenZero?: boolean;
  emptyFallbackValue?: number;
  min?: number;
  max?: number;
  selectOnFocus?: boolean;
}

export const SmartNumberInput: React.FC<SmartNumberInputProps> = ({
  value,
  onValueChange,
  allowDecimal = true,
  allowNegative = false,
  emptyWhenZero = true,
  emptyFallbackValue = 0,
  min,
  max,
  selectOnFocus = false,
  onFocus,
  onBlur,
  className = '',
  placeholder = '0',
  ...rest
}) => {
  const formatPropValue = (v: number | string | undefined | null): string => {
    if (v === undefined || v === null || v === '') return '';
    if (typeof v === 'string') {
      const norm = normalizeNumericString(v, { allowDecimal, allowNegative });
      if (!norm) return '';
      const num = Number(norm);
      if (emptyWhenZero && num === 0 && norm !== '0' && !norm.startsWith('0.')) {
        return '';
      }
      return norm;
    }
    if (!Number.isFinite(v)) return '';
    if (emptyWhenZero && v === 0) return '';
    return String(v);
  };

  const [textValue, setTextValue] = useState<string>(() => formatPropValue(value));
  const isFocusedRef = useRef<boolean>(false);

  useEffect(() => {
    if (isFocusedRef.current) {
      // While focused, only sync if external value changed to a different number than what textValue represents
      const currentParsed = parseFlexibleNumber(textValue, emptyFallbackValue);
      const incomingNum =
        typeof value === 'number'
          ? value
          : value === undefined || value === null || value === ''
            ? emptyFallbackValue
            : parseFlexibleNumber(String(value), emptyFallbackValue);

      if (Math.abs(currentParsed - incomingNum) > 1e-9) {
        setTextValue(formatPropValue(value));
      }
      return;
    }
    setTextValue(formatPropValue(value));
  }, [value, emptyWhenZero, emptyFallbackValue, allowDecimal, allowNegative]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const normalized = normalizeNumericString(raw, { allowDecimal, allowNegative });
    setTextValue(normalized);

    if (normalized === '' || normalized === '.' || normalized === '-' || normalized === '-.') {
      onValueChange(emptyFallbackValue, normalized);
      return;
    }

    let parsed = Number(normalized);
    if (!Number.isFinite(parsed)) {
      parsed = emptyFallbackValue;
    }
    if (min !== undefined && parsed < min) {
      parsed = min;
    }
    if (max !== undefined && parsed > max) {
      parsed = max;
    }

    onValueChange(parsed, normalized);
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    isFocusedRef.current = true;
    if (selectOnFocus) {
      e.currentTarget.select();
    }
    onFocus?.(e);
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    isFocusedRef.current = false;
    const normalized = normalizeNumericString(textValue, { allowDecimal, allowNegative });
    if (!normalized || normalized === '.' || normalized === '-' || normalized === '-.') {
      const fallback = emptyFallbackValue;
      setTextValue(emptyWhenZero && fallback === 0 ? '' : String(fallback));
    } else {
      let num = Number(normalized);
      if (!Number.isFinite(num)) num = emptyFallbackValue;
      if (min !== undefined && num < min) num = min;
      if (max !== undefined && num > max) num = max;
      setTextValue(emptyWhenZero && num === 0 ? '' : String(num));
    }
    onBlur?.(e);
  };

  return (
    <input
      {...rest}
      type="text"
      inputMode={allowDecimal ? 'decimal' : 'numeric'}
      dir="ltr"
      placeholder={placeholder}
      value={textValue}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      className={className}
    />
  );
};
