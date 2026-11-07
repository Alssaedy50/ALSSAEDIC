import React, { useState } from 'react';
import {
  Copy,
  Download,
  Share2,
  Smartphone,
  WifiOff,
  X,
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
      <button
        type="button"
        onClick={handleInstallClick}
        className={
          compact
            ? 'inline-flex items-center gap-1.5 px-2.5 py-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-xs font-bold transition-colors shrink-0'
            : 'w-full flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-xs transition-colors'
        }
        title="تثبيت التطبيق"
      >
        <Download className="w-4 h-4 shrink-0" />
        <span>تثبيت التطبيق</span>
      </button>

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
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                  تثبيت التطبيق
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title="إغلاق"
              >
                <X className="w-4 h-4" />
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
                  className="py-2 px-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Copy className="w-3.5 h-3.5 shrink-0" />
                  <span>نسخ الرابط</span>
                </button>

                <button
                  type="button"
                  onClick={handleShareUrl}
                  className="py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Share2 className="w-3.5 h-3.5 shrink-0" />
                  <span>مشاركة</span>
                </button>
              </div>

              {isIOS ? (
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 space-y-1.5">
                  <div className="font-bold text-slate-900 dark:text-slate-100">
                    iPhone / iPad (Safari):
                  </div>
                  <ol className="list-decimal list-inside space-y-1 text-slate-700 dark:text-slate-300">
                    <li>افتح الرابط في متصفح <strong>Safari</strong>.</li>
                    <li>اضغط على زر <strong>المشاركة</strong>.</li>
                    <li>اختر <strong>إضافة إلى الشاشة الرئيسية</strong>.</li>
                  </ol>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 space-y-1.5">
                  <div className="font-bold text-slate-900 dark:text-slate-100">
                    أندرويد (Chrome):
                  </div>
                  <ol className="list-decimal list-inside space-y-1 text-slate-700 dark:text-slate-300">
                    <li>افتح الرابط في متصفح <strong>Chrome</strong>.</li>
                    <li>اضغط على القائمة <strong>(⋮)</strong> أعلى المتصفح.</li>
                    <li>اختر <strong>تثبيت التطبيق</strong> أو <strong>إضافة إلى الشاشة الرئيسية</strong>.</li>
                  </ol>
                </div>
              )}
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
    <div className="fixed bottom-4 left-4 right-4 sm:right-auto z-40 flex items-center gap-2 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-bold text-white shadow-lg no-print">
      <WifiOff className="w-4 h-4 shrink-0" />
      <span>وضع عدم الاتصال (حفظ محلي)</span>
    </div>
  );
};
