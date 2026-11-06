import React, { useState } from 'react';
import { ArrowRight, CheckCircle2, Copy, Download, Share2, Smartphone, WifiOff } from 'lucide-react';
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
        notify?.('تم تثبيت تطبيق عيادة السعيدي على جهازك بنجاح', 'success');
      }
      return;
    }
    setShowGuideModal(true);
  };

  const handleCopyAppUrl = () => {
    navigator.clipboard
      ?.writeText(liveUrl)
      .then(() => {
        notify?.('تم نسخ رابط التطبيق المباشر لفتحه وتثبيته في متصفح الهاتف', 'success');
      })
      .catch(() => {
        notify?.('انسخ الرابط المعروض لفتحه في متصفح الهاتف', 'info');
      });
  };

  const handleShareUrl = async () => {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: 'نظام عيادة السعيدي الطبي',
          text: 'الرابط المباشر لتثبيت نظام عيادة السعيدي على الهاتف:',
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
            : 'w-full flex items-center justify-between px-3.5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-black shadow-xs transition-colors'
        }
        title="تثبيت البرنامج على الهاتف"
      >
        <div className="flex items-center gap-2">
          <Download className="w-4 h-4 shrink-0" />
          <span>{compact ? 'تثبيت' : 'تثبيت التطبيق على الهاتف'}</span>
        </div>
        {!compact && (
          <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-md font-mono">PWA</span>
        )}
      </button>

      {showGuideModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-2.5 sm:p-4"
          onClick={() => setShowGuideModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md max-h-[88vh] flex flex-col overflow-hidden shadow-2xl"
          >
            {/* Sticky Header */}
            <div className="shrink-0 px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 bg-slate-50 dark:bg-slate-950">
              <div className="flex items-center gap-2 min-w-0">
                <Smartphone className="w-4 h-4 text-emerald-500 shrink-0" />
                <h3 className="text-sm font-black text-slate-900 dark:text-slate-100 truncate">
                  تثبيت التطبيق على الهاتف
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

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 text-xs sm:text-sm">
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-emerald-900 dark:text-emerald-200 font-bold leading-relaxed">
                البرنامج مجهز بالكامل بتقنية <strong>PWA</strong> ليعمل كتطبيق مستقل على شاشة الهاتف الرئيسية:
              </div>

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
                  className="py-2.5 px-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-black text-xs flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Copy className="w-3.5 h-3.5 shrink-0" />
                  <span>نسخ الرابط الفعال</span>
                </button>

                <button
                  type="button"
                  onClick={handleShareUrl}
                  className="py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Share2 className="w-3.5 h-3.5 shrink-0" />
                  <span>مشاركة الرابط</span>
                </button>
              </div>

              {isIOS ? (
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3.5 space-y-2">
                  <div className="font-black text-slate-900 dark:text-slate-100">
                    خطوات التثبيت على iPhone / iPad (متصفح Safari):
                  </div>
                  <ol className="list-decimal list-inside space-y-1.5 text-slate-700 dark:text-slate-300 font-medium">
                    <li>انسخ الرابط أعلاه وافتحه في متصفح <strong>Safari</strong>.</li>
                    <li>اضغط على زر <strong>المشاركة (Share)</strong> أسفل المتصفح.</li>
                    <li>اختر <strong>إضافة إلى الشاشة الرئيسية (Add to Home Screen)</strong>.</li>
                  </ol>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3.5 space-y-2">
                  <div className="font-black text-slate-900 dark:text-slate-100">
                    خطوات التثبيت على هواتف أندرويد (Chrome):
                  </div>
                  <ol className="list-decimal list-inside space-y-1.5 text-slate-700 dark:text-slate-300 font-medium">
                    <li>انسخ الرابط الفعال أعلاه وافتحه في تبويب جديد في <strong>Google Chrome</strong>.</li>
                    <li>اضغط على قائمة المتصفح العلوية <strong>(⋮)</strong> في الزاوية.</li>
                    <li>اختر <strong>تثبيت التطبيق (Install App)</strong> أو <strong>إضافة إلى الشاشة الرئيسية</strong>.</li>
                  </ol>
                </div>
              )}
            </div>

            {/* Sticky Footer */}
            <div className="shrink-0 p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex justify-end">
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-black"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>حسناً، فهمت</span>
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
      <span>وضع عدم الاتصال — يتم الحفظ محلياً وستتم المزامنة تلقائياً فور عودة الإنترنت</span>
    </div>
  );
};
