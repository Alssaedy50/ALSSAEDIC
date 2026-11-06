import React, { useState } from 'react';
import { ArrowRight, Check, RotateCcw, X } from 'lucide-react';

interface FdiToothModalProps {
  isOpen: boolean;
  selectedTeeth: string[];
  onClose: () => void;
  onApply: (teeth: string[]) => void;
}

const ADULT_UPPER_RIGHT = ['18', '17', '16', '15', '14', '13', '12', '11'];
const ADULT_UPPER_LEFT = ['21', '22', '23', '24', '25', '26', '27', '28'];
const ADULT_LOWER_RIGHT = ['48', '47', '46', '45', '44', '43', '42', '41'];
const ADULT_LOWER_LEFT = ['31', '32', '33', '34', '35', '36', '37', '38'];

const CHILD_UPPER_RIGHT = ['55', '54', '53', '52', '51'];
const CHILD_UPPER_LEFT = ['61', '62', '63', '64', '65'];
const CHILD_LOWER_RIGHT = ['85', '84', '83', '82', '81'];
const CHILD_LOWER_LEFT = ['71', '72', '73', '74', '75'];

const TOOTH_NAMES: Record<string, string> = {
  '1': 'ثنية مركزية',
  '2': 'رباعية جانبية',
  '3': 'ناب',
  '4': 'ضاحك أول',
  '5': 'ضاحك ثاني',
  '6': 'رحى أولى',
  '7': 'رحى ثانية',
  '8': 'ضرس العقل',
};

export const FdiToothModal: React.FC<FdiToothModalProps> = ({
  isOpen,
  selectedTeeth,
  onClose,
  onApply,
}) => {
  const [chartType, setChartType] = useState<'adult' | 'child'>('adult');
  const [currentSelection, setCurrentSelection] = useState<string[]>(selectedTeeth);

  React.useEffect(() => {
    if (isOpen) {
      setCurrentSelection(selectedTeeth);
    }
  }, [isOpen, selectedTeeth]);

  if (!isOpen) return null;

  const toggleTooth = (code: string) => {
    setCurrentSelection((prev) =>
      prev.includes(code) ? prev.filter((item) => item !== code) : [...prev, code]
    );
  };

  const renderArchSection = (
    rightTeeth: string[],
    leftTeeth: string[],
    archTitle: string
  ) => (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 space-y-2.5">
      <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 dark:text-slate-400">
        <span>يمين المريض</span>
        <span className="text-slate-900 dark:text-slate-100">{archTitle}</span>
        <span>يسار المريض</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5" dir="ltr">
        {/* Right Quadrant */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-2">
          <div className="text-[10px] text-slate-400 text-center mb-1.5" dir="rtl">
            الربع الأيمن
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {rightTeeth.map((tooth) => {
              const active = currentSelection.includes(tooth);
              const pos = tooth[1];
              return (
                <button
                  key={tooth}
                  type="button"
                  title={`سن ${tooth} — ${TOOTH_NAMES[pos] || ''}`}
                  onClick={() => toggleTooth(tooth)}
                  className={`h-10 rounded-lg border text-xs font-mono tabular-nums font-bold flex items-center justify-center transition-colors ${
                    active
                      ? 'bg-sky-600 border-sky-500 text-white shadow-xs'
                      : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 hover:border-sky-400'
                  }`}
                >
                  {tooth}
                </button>
              );
            })}
          </div>
        </div>

        {/* Left Quadrant */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-2">
          <div className="text-[10px] text-slate-400 text-center mb-1.5" dir="rtl">
            الربع الأيسر
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {leftTeeth.map((tooth) => {
              const active = currentSelection.includes(tooth);
              const pos = tooth[1];
              return (
                <button
                  key={tooth}
                  type="button"
                  title={`سن ${tooth} — ${TOOTH_NAMES[pos] || ''}`}
                  onClick={() => toggleTooth(tooth)}
                  className={`h-10 rounded-lg border text-xs font-mono tabular-nums font-bold flex items-center justify-center transition-colors ${
                    active
                      ? 'bg-sky-600 border-sky-500 text-white shadow-xs'
                      : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 hover:border-sky-400'
                  }`}
                >
                  {tooth}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-3 sm:p-4 no-print"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl max-h-[88vh] flex flex-col rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky Top Header with explicit Back/Close button */}
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
          <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
            مخطط الأسنان (FDI)
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 text-xs font-bold transition-colors"
          >
            <ArrowRight className="w-3.5 h-3.5" />
            <span>رجوع</span>
          </button>
        </div>

        {/* Scrollable Middle Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
          {/* 2-Column Segmented Switcher (Never overflows mobile width) */}
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
            <button
              type="button"
              onClick={() => setChartType('adult')}
              className={`py-2 px-2 text-xs font-bold rounded-lg transition-colors text-center ${
                chartType === 'adult'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              أسنان البالغين (11–48)
            </button>
            <button
              type="button"
              onClick={() => setChartType('child')}
              className={`py-2 px-2 text-xs font-bold rounded-lg transition-colors text-center ${
                chartType === 'child'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              أسنان الأطفال (51–85)
            </button>
          </div>

          <div className="flex items-center justify-between text-xs bg-sky-50/70 dark:bg-sky-950/30 border border-sky-200/70 dark:border-sky-900/60 rounded-lg px-3 py-2">
            <span className="text-slate-600 dark:text-slate-300">
              المحدد ({currentSelection.length}):{' '}
              <strong className="font-mono text-sky-600 dark:text-sky-400">
                {currentSelection.length > 0 ? currentSelection.join(', ') : 'لا يوجد'}
              </strong>
            </span>
            {currentSelection.length > 0 && (
              <button
                type="button"
                onClick={() => setCurrentSelection([])}
                className="inline-flex items-center gap-1 text-xs font-bold text-rose-600 dark:text-rose-400"
              >
                <RotateCcw className="w-3 h-3" />
                <span>مسح</span>
              </button>
            )}
          </div>

          {chartType === 'adult' ? (
            <div className="space-y-3">
              {renderArchSection(ADULT_UPPER_RIGHT, ADULT_UPPER_LEFT, 'الفك العلوي الدائم')}
              {renderArchSection(ADULT_LOWER_RIGHT, ADULT_LOWER_LEFT, 'الفك السفلي الدائم')}
            </div>
          ) : (
            <div className="space-y-3">
              {renderArchSection(CHILD_UPPER_RIGHT, CHILD_UPPER_LEFT, 'الفك العلوي اللبني')}
              {renderArchSection(CHILD_LOWER_RIGHT, CHILD_LOWER_LEFT, 'الفك السفلي اللبني')}
            </div>
          )}
        </div>

        {/* Sticky Bottom Footer */}
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1 px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-xl"
          >
            <X className="w-4 h-4" />
            <span>إغلاق</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onApply(currentSelection);
              onClose();
            }}
            className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-sky-600 hover:bg-sky-500 rounded-xl"
          >
            <Check className="w-4 h-4" />
            <span>اعتماد الأسنان ({currentSelection.length})</span>
          </button>
        </div>
      </div>
    </div>
  );
};
