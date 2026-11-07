import React, { useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Copy,
  Download,
  HelpCircle,
  Share2,
  Smartphone,
  WifiOff,
} from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  compact?: boolean;
  notify?: (message: string, type?: 'success' | 'warning' | 'error' | 'info') => void;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ compact = false, notify }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);

  if (isInstalled) {
    return null;
  }

  const liveUrl =
    typeof window !== 'undefined'
      ? window.location.origin
      : 'https://ais-dev-nupdn4nefn3vfcmrfhiw54-958880361441.europe-west2.run.app';

  const handleInstallClick = async () => {
    if (isInstallable) {
      const accepted = await install();
      if (accepted) {
        notify?.('تم تثبيت التطبيق بنجاح', 'success');
      }
      return;
    }
    setShowGuideModal(true);
  };

  const handleCopyAppUrl = () => {
    navigator.clipboard
      ?.writeText(liveUrl)
      .then(() => {
        notify?.('تم نسخ رابط التطبيق', 'success');
      })
      .catch(() => {
        notify?.('انسخ الرابط المعروض لفتحه في المتصفح', 'info');
      });
  };

  const handleShareUrl = async () => {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: 'عيادة السعيدي',
          text: 'رابط نظام عيادة السعيدي:',
          url: liveUrl,
        });
        return;
      } catch {
        // fallback
      }
    }
    handleCopyAppUrl();
  };

  return (
    <>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={handleInstallClick}
          className={
            compact
              ? 'inline-flex items-center gap-1.5 px-2.5 py-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-xs font-bold transition-colors shrink-0'
              : 'flex-1 flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black shadow-xs transition-colors'
          }
          title="تثبيت التطبيق"
        >
          <Download className="w-4 h-4 shrink-0" />
          <span>{compact ? 'تثبيت' : 'تثبيت التطبيق'}</span>
        </button>

        {!compact && (
          <button
            type="button"
            onClick={() => setShowGuideModal(true)}
            className="inline-flex items-center gap-1 px-2.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold shrink-0 transition-colors"
            title="كيفية التثبيت"
          >
            <HelpCircle className="w-3.5 h-3.5 text-sky-500 shrink-0" />
            <span>كيفية التثبيت</span>
          </button>
        )}
      </div>

      {showGuideModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
          onClick={() => setShowGuideModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-sm max-h-[88vh] flex flex-col overflow-hidden shadow-2xl"
          >
            {/* Header */}
            <div className="shrink-0 px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 bg-slate-50 dark:bg-slate-950">
              <div className="flex items-center gap-2 min-w-0">
                <Smartphone className="w-4 h-4 text-emerald-500 shrink-0" />
                <h3 className="text-sm font-black text-slate-900 dark:text-slate-100 truncate">
                  كيفية التثبيت
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-bold shrink-0"
              >
                <ArrowRight className="w-3.5 h-3.5" />
                <span>رجوع</span>
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 text-xs">
              <div
                dir="ltr"
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950 px-3 py-2 text-[11px] font-mono text-sky-700 dark:text-sky-300 break-all select-all"
              >
                {liveUrl}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleCopyAppUrl}
                  className="py-2 px-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-black text-xs flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Copy className="w-3.5 h-3.5 shrink-0" />
                  <span>نسخ الرابط</span>
                </button>

                <button
                  type="button"
                  onClick={handleShareUrl}
                  className="py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Share2 className="w-3.5 h-3.5 shrink-0" />
                  <span>مشاركة</span>
                </button>
              </div>

              {isIOS ? (
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 space-y-1.5">
                  <div className="font-black text-slate-900 dark:text-slate-100">
                    iPhone / iPad (Safari):
                  </div>
                  <ol className="list-decimal list-inside space-y-1 text-slate-700 dark:text-slate-300 font-medium">
                    <li>افتح الرابط في متصفح <strong>Safari</strong>.</li>
                    <li>اضغط على زر <strong>المشاركة</strong>.</li>
                    <li>اختر <strong>إضافة إلى الشاشة الرئيسية</strong>.</li>
                  </ol>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 space-y-1.5">
                  <div className="font-black text-slate-900 dark:text-slate-100">
                    أندرويد (Chrome):
                  </div>
                  <ol className="list-decimal list-inside space-y-1 text-slate-700 dark:text-slate-300 font-medium">
                    <li>افتح الرابط في متصفح <strong>Chrome</strong>.</li>
                    <li>اضغط على القائمة <strong>(⋮)</strong> أعلى المتصفح.</li>
                    <li>اختر <strong>تثبيت التطبيق</strong> أو <strong>إضافة إلى الشاشة الرئيسية</strong>.</li>
                  </ol>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="shrink-0 p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex justify-end">
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-black"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>إغلاق</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-16 left-4 right-4 sm:right-auto z-40 flex items-center gap-2 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-bold text-white shadow-lg no-print">
      <WifiOff className="w-4 h-4 shrink-0" />
      <span>وضع عدم الاتصال — يتم الحفظ محلياً والمزامنة فور عودة الإنترنت</span>
    </div>
  );
};
