import React, { useState } from 'react';
import { Check, ChevronDown, Layers, RotateCcw, X } from 'lucide-react';

interface FdiToothModalProps {
  isOpen: boolean;
  selectedTeeth: string[];
  services?: string[];
  serviceTeethMap?: Record<string, string[]>;
  initialActiveService?: string;
  onClose: () => void;
  onApply: (teeth: string[]) => void;
  onApplyServiceTeeth?: (
    nextServiceTeethMap: Record<string, string[]>,
    allUniqueTeeth: string[]
  ) => void;
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
  services = [],
  serviceTeethMap = {},
  initialActiveService,
  onClose,
  onApply,
  onApplyServiceTeeth,
}) => {
  const [chartType, setChartType] = useState<'adult' | 'child'>('adult');
  const [currentSelection, setCurrentSelection] = useState<string[]>(selectedTeeth);
  const [localServiceMap, setLocalServiceMap] = useState<Record<string, string[]>>({});
  const [activeServiceKey, setActiveServiceKey] = useState<string>('__ALL__');

  const hasMultipleServices = services.length > 0;

  React.useEffect(() => {
    if (isOpen) {
      setCurrentSelection(selectedTeeth);
      const nextMap: Record<string, string[]> = {};
      for (const srv of services) {
        const existing = serviceTeethMap[srv];
        if (Array.isArray(existing) && existing.length > 0) {
          nextMap[srv] = [...existing];
        } else if (services.length === 1 && selectedTeeth.length > 0) {
          nextMap[srv] = [...selectedTeeth];
        } else {
          nextMap[srv] = [];
        }
      }
      setLocalServiceMap(nextMap);

      if (initialActiveService && services.includes(initialActiveService)) {
        setActiveServiceKey(initialActiveService);
      } else if (services.length >= 2) {
        setActiveServiceKey(services[0]);
      } else {
        setActiveServiceKey('__ALL__');
      }
    }
  }, [isOpen, selectedTeeth, services, serviceTeethMap, initialActiveService]);

  if (!isOpen) return null;

  const activeTeethList =
    hasMultipleServices && activeServiceKey !== '__ALL__'
      ? localServiceMap[activeServiceKey] || []
      : currentSelection;

  const toggleTooth = (code: string) => {
    if (hasMultipleServices && activeServiceKey !== '__ALL__') {
      setLocalServiceMap((prev) => {
        const currentList = prev[activeServiceKey] || [];
        const nextList = currentList.includes(code)
          ? currentList.filter((item) => item !== code)
          : [...currentList, code];
        const updatedMap = {
          ...prev,
          [activeServiceKey]: nextList,
        };
        // Recompute union of all service teeth + general selection
        const unionSet = new Set<string>();
        Object.values(updatedMap).forEach((arr) => arr.forEach((t) => unionSet.add(t)));
        setCurrentSelection(Array.from(unionSet));
        return updatedMap;
      });
    } else {
      setCurrentSelection((prev) => {
        const next = prev.includes(code)
          ? prev.filter((item) => item !== code)
          : [...prev, code];
        if (services.length > 0) {
          setLocalServiceMap((prevMap) => {
            const updated: Record<string, string[]> = { ...prevMap };
            for (const srv of services) {
              updated[srv] = [...next];
            }
            return updated;
          });
        }
        return next;
      });
    }
  };

  const clearActiveSelection = () => {
    if (hasMultipleServices && activeServiceKey !== '__ALL__') {
      setLocalServiceMap((prev) => {
        const updated = { ...prev, [activeServiceKey]: [] };
        const unionSet = new Set<string>();
        Object.values(updated).forEach((arr) => arr.forEach((t) => unionSet.add(t)));
        setCurrentSelection(Array.from(unionSet));
        return updated;
      });
    } else {
      setCurrentSelection([]);
      setLocalServiceMap({});
    }
  };

  const getServicesUsingTooth = (toothCode: string): string[] => {
    if (!hasMultipleServices) return [];
    return services.filter((srv) => (localServiceMap[srv] || []).includes(toothCode));
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
              const active = activeTeethList.includes(tooth);
              const assignedServices = getServicesUsingTooth(tooth);
              const usedInOtherService =
                !active && assignedServices.length > 0;
              const pos = tooth[1];
              return (
                <button
                  key={tooth}
                  type="button"
                  title={
                    assignedServices.length > 0
                      ? `سن ${tooth} (${TOOTH_NAMES[pos] || ''}) — مخصص لـ: ${assignedServices.join(' + ')}`
                      : `سن ${tooth} — ${TOOTH_NAMES[pos] || ''}`
                  }
                  onClick={() => toggleTooth(tooth)}
                  className={`relative h-10 rounded-lg border text-xs font-mono tabular-nums font-bold flex flex-col items-center justify-center transition-colors ${
                    active
                      ? 'bg-sky-600 border-sky-500 text-white shadow-xs'
                      : usedInOtherService
                        ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-400 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300'
                        : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 hover:border-sky-400'
                  }`}
                >
                  <span>{tooth}</span>
                  {assignedServices.length > 0 && (
                    <span
                      className={`text-[9px] leading-none mt-0.5 px-1 rounded ${
                        active
                          ? 'bg-sky-800/80 text-sky-100'
                          : 'bg-indigo-500/20 text-indigo-700 dark:text-indigo-300'
                      }`}
                    >
                      {assignedServices.length}خ
                    </span>
                  )}
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
              const active = activeTeethList.includes(tooth);
              const assignedServices = getServicesUsingTooth(tooth);
              const usedInOtherService =
                !active && assignedServices.length > 0;
              const pos = tooth[1];
              return (
                <button
                  key={tooth}
                  type="button"
                  title={
                    assignedServices.length > 0
                      ? `سن ${tooth} (${TOOTH_NAMES[pos] || ''}) — مخصص لـ: ${assignedServices.join(' + ')}`
                      : `سن ${tooth} — ${TOOTH_NAMES[pos] || ''}`
                  }
                  onClick={() => toggleTooth(tooth)}
                  className={`relative h-10 rounded-lg border text-xs font-mono tabular-nums font-bold flex flex-col items-center justify-center transition-colors ${
                    active
                      ? 'bg-sky-600 border-sky-500 text-white shadow-xs'
                      : usedInOtherService
                        ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-400 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300'
                        : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 hover:border-sky-400'
                  }`}
                >
                  <span>{tooth}</span>
                  {assignedServices.length > 0 && (
                    <span
                      className={`text-[9px] leading-none mt-0.5 px-1 rounded ${
                        active
                          ? 'bg-sky-800/80 text-sky-100'
                          : 'bg-indigo-500/20 text-indigo-700 dark:text-indigo-300'
                      }`}
                    >
                      {assignedServices.length}خ
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );

  const handleConfirm = () => {
    if (hasMultipleServices && onApplyServiceTeeth) {
      const unionSet = new Set<string>();
      const cleanedMap: Record<string, string[]> = {};
      for (const srv of services) {
        const list = localServiceMap[srv] || [];
        cleanedMap[srv] = list;
        list.forEach((t) => unionSet.add(t));
      }
      if (unionSet.size === 0 && currentSelection.length > 0) {
        currentSelection.forEach((t) => unionSet.add(t));
      }
      const allUnique = Array.from(unionSet);
      onApplyServiceTeeth(cleanedMap, allUnique);
      onApply(allUnique);
    } else {
      onApply(currentSelection);
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-3 sm:p-4 no-print"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl max-h-[90vh] flex flex-col rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header with Close Icon */}
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
              مخطط تحديد الأسنان (FDI)
            </h3>
            {services.length > 1 && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                اختر الخدمة من القائمة المنبثقة ثم حدد أرقام الأسنان الخاصة بها بدقة
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Middle Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
          {/* Dropdown selectors row: Service Selector + Chart Type Selector */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {hasMultipleServices && (
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                  تخصيص الأسنان للخدمة العلاجية:
                </label>
                <div className="relative">
                  <select
                    value={activeServiceKey}
                    onChange={(e) => setActiveServiceKey(e.target.value)}
                    aria-label="اختر الخدمة لتحديد أسنانها"
                    className="w-full appearance-none rounded-xl border border-sky-300 dark:border-sky-800 bg-sky-50/70 dark:bg-sky-950/40 px-3 py-2 pl-8 text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:border-sky-500"
                  >
                    {services.map((srv, idx) => {
                      const assigned = localServiceMap[srv] || [];
                      return (
                        <option key={srv} value={srv}>
                          {idx + 1}. {srv}{' '}
                          {assigned.length > 0 ? `(سن: ${assigned.join(' / ')})` : '(لم يحدد سن)'}
                        </option>
                      );
                    })}
                    {services.length > 1 && (
                      <option value="__ALL__">
                        كل الخدمات المختارة معاً (تحديد مشترك)
                      </option>
                    )}
                  </select>
                  <ChevronDown className="w-4 h-4 text-sky-600 dark:text-sky-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>
            )}

            <div className={hasMultipleServices ? '' : 'sm:col-span-2'}>
              <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                نوع مخطط الأسنان:
              </label>
              <div className="relative">
                <select
                  value={chartType}
                  onChange={(e) => setChartType(e.target.value as 'adult' | 'child')}
                  aria-label="نوع مخطط الأسنان"
                  className="w-full appearance-none rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 pl-8 text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:border-sky-500"
                >
                  <option value="adult">أسنان البالغين الدائمة (11–48)</option>
                  <option value="child">أسنان الأطفال اللبنية (51–85)</option>
                </select>
                <ChevronDown className="w-4 h-4 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Summary of per-service tooth mapping when multiple services exist */}
          {services.length > 1 && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950/60 p-2.5 space-y-1.5">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-300">
                <Layers className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                <span>توزيع الأسنان على الخدمات المختارة:</span>
              </div>
              <div className="grid grid-cols-1 gap-1">
                {services.map((srv) => {
                  const list = localServiceMap[srv] || [];
                  const isCurrent = activeServiceKey === srv;
                  return (
                    <button
                      key={srv}
                      type="button"
                      onClick={() => setActiveServiceKey(srv)}
                      className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-right text-xs transition-colors border ${
                        isCurrent
                          ? 'bg-sky-600/10 dark:bg-sky-500/15 border-sky-500/60 text-sky-900 dark:text-sky-200 font-bold'
                          : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-sky-400'
                      }`}
                    >
                      <span className="truncate">{srv}</span>
                      <span className="font-mono text-[11px] px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-sky-700 dark:text-sky-300 shrink-0">
                        {list.length > 0 ? `سن: ${list.join(' / ')}` : 'اضغط لتحديد السن'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between text-xs bg-sky-50/70 dark:bg-sky-950/30 border border-sky-200/70 dark:border-sky-900/60 rounded-lg px-3 py-2">
            <span className="text-slate-600 dark:text-slate-300">
              {hasMultipleServices && activeServiceKey !== '__ALL__' ? (
                <>
                  أسنان «{activeServiceKey}» ({activeTeethList.length}):{' '}
                </>
              ) : (
                <>المحدد ({activeTeethList.length}): </>
              )}
              <strong className="font-mono text-sky-600 dark:text-sky-400">
                {activeTeethList.length > 0 ? activeTeethList.join(' - ') : 'لا يوجد'}
              </strong>
            </span>
            {activeTeethList.length > 0 && (
              <button
                type="button"
                onClick={clearActiveSelection}
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

        {/* Bottom Footer */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
          <button
            type="button"
            onClick={handleConfirm}
            className="w-full py-2.5 rounded-xl font-bold text-xs text-white bg-sky-600 hover:bg-sky-500 flex items-center justify-center gap-1.5 transition-colors"
          >
            <Check className="w-4 h-4" />
            <span>
              اعتماد الأسنان المحددة (
              {hasMultipleServices
                ? Array.from(
                    new Set(
                      Object.values(localServiceMap).flat().concat(currentSelection)
                    )
                  ).length
                : currentSelection.length}
              )
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
