import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  ArrowRight,
  Cloud,
  Copy,
  ExternalLink,
  KeyRound,
  LogIn,
  LogOut,
  RefreshCw,
  Share2,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import { User } from '../firebase';
import { PWAInstallButton } from './PWAInstallButton';

export interface DirectClinicSession {
  clinicId: string;
  password: string;
  updatedAt?: string;
}

interface CloudAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  directSession: DirectClinicSession | null;
  isSyncing: boolean;
  onSignInGoogle: () => Promise<void>;
  onDirectLogin: (clinicId: string, password: string) => Promise<boolean>;
  onSignOut: () => Promise<void>;
  onForceSyncNow: () => Promise<void>;
  receiptsCount: number;
  inventoryCount: number;
  expensesCount: number;
  notify: (message: string, type?: 'success' | 'warning' | 'error' | 'info') => void;
}

export const CloudAccountModal: React.FC<CloudAccountModalProps> = ({
  isOpen,
  onClose,
  user,
  directSession,
  isSyncing,
  onSignInGoogle,
  onDirectLogin,
  onSignOut,
  onForceSyncNow,
  receiptsCount,
  inventoryCount,
  expensesCount,
  notify,
}) => {
  const [clinicIdInput, setClinicIdInput] = useState(
    directSession?.clinicId || 'alssaedy-clinic'
  );
  const [passwordInput, setPasswordInput] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [appQrUrl, setAppQrUrl] = useState('');

  // Always use the live active origin so it never points to an unpublished URL
  const liveAppUrl =
    typeof window !== 'undefined'
      ? window.location.origin
      : 'https://ais-dev-nupdn4nefn3vfcmrfhiw54-958880361441.europe-west2.run.app';

  useEffect(() => {
    if (!isOpen) return;
    QRCode.toDataURL(liveAppUrl, {
      width: 180,
      margin: 1,
      color: {
        dark: '#0B2545',
        light: '#FFFFFF',
      },
    })
      .then((url) => setAppQrUrl(url))
      .catch(() => setAppQrUrl(''));
  }, [isOpen, liveAppUrl]);

  if (!isOpen) return null;

  const isConnected = Boolean(user || directSession);
  const activeAccountLabel = directSession
    ? `معرّف العيادة: ${directSession.clinicId}`
    : user?.email || '';

  const handleDirectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    try {
      await onDirectLogin(clinicIdInput, passwordInput);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setAuthLoading(true);
    try {
      await onSignInGoogle();
    } finally {
      setAuthLoading(false);
    }
  };

  const handleCopyLiveLink = () => {
    navigator.clipboard
      ?.writeText(liveAppUrl)
      .then(() => {
        notify('تم نسخ رابط التطبيق المباشر لفتحه في متصفح الهاتف', 'success');
      })
      .catch(() => {
        notify('انسخ الرابط المعروض أمامك لفتحه في متصفح Chrome', 'info');
      });
  };

  const handleShareLiveLink = async () => {
    const shareText = `تطبيق نظام عيادة السعيدي لطب وجراحة الفم والأسنان:\n${liveAppUrl}`;
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: 'نظام عيادة السعيدي الطبي',
          text: shareText,
          url: liveAppUrl,
        });
        return;
      } catch {
        // fallback to clipboard
      }
    }
    await navigator.clipboard?.writeText(shareText).catch(() => {});
    notify('تم نسخ رابط التطبيق لإرساله عبر واتساب', 'success');
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-2.5 sm:p-4 no-print"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md max-h-[88vh] flex flex-col overflow-hidden shadow-2xl"
      >
        {/* Sticky Top Header with explicit Back button */}
        <div className="shrink-0 px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 bg-slate-50 dark:bg-slate-950">
          <div className="flex items-center gap-2 min-w-0">
            <Cloud className="w-4 h-4 text-sky-500 shrink-0" />
            <h3 className="text-sm font-black text-slate-900 dark:text-slate-100 truncate">
              الحساب السحابي والتثبيت
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold shrink-0"
          >
            <ArrowRight className="w-3.5 h-3.5" />
            <span>رجوع</span>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* SECTION 1: CLOUD ACCOUNT & MULTI-PHONE SYNC */}
          {isConnected ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <ShieldCheck className="w-5 h-5 text-emerald-500 shrink-0" />
                    <span className="text-xs sm:text-sm font-black text-emerald-900 dark:text-emerald-200 truncate">
                      حساب العيادة السحابي نشط
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-bold shrink-0">
                    متصل
                  </span>
                </div>
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200 break-all">
                  {activeAccountLabel}
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-400">
                  افتح النظام من أي هاتف آخر وسجّل الدخول بنفس المعرّف وكلمة المرور لتظهر جميع السندات والديون والمخزون فوراً.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-2">
                  <div className="text-[11px] font-bold text-slate-500">السندات</div>
                  <div className="text-sm font-black text-slate-900 dark:text-slate-100 font-mono mt-0.5">
                    {receiptsCount}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-2">
                  <div className="text-[11px] font-bold text-slate-500">المخزون</div>
                  <div className="text-sm font-black text-slate-900 dark:text-slate-100 font-mono mt-0.5">
                    {inventoryCount}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-2">
                  <div className="text-[11px] font-bold text-slate-500">المصروفات</div>
                  <div className="text-sm font-black text-slate-900 dark:text-slate-100 font-mono mt-0.5">
                    {expensesCount}
                  </div>
                </div>
              </div>

              <button
                type="button"
                disabled={isSyncing}
                onClick={onForceSyncNow}
                className="w-full py-2.5 px-4 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-black flex items-center justify-center gap-2 transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>{isSyncing ? 'جاري المزامنة السحابية...' : 'مزامنة البيانات مع السحابة الآن'}</span>
              </button>

              <button
                type="button"
                onClick={onSignOut}
                className="w-full py-2 px-4 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-bold flex items-center justify-center gap-2 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>تسجيل الخروج من الحساب</span>
              </button>
            </div>
          ) : (
            <form onSubmit={handleDirectSubmit} className="space-y-3">
              <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-3 space-y-1">
                <div className="text-xs font-black text-sky-900 dark:text-sky-200 flex items-center gap-1.5">
                  <KeyRound className="w-4 h-4 text-sky-500 shrink-0" />
                  <span>تسجيل / دخول موحد لحساب العيادة من أي هاتف</span>
                </div>
                <p className="text-[11px] text-slate-700 dark:text-slate-300 leading-relaxed">
                  أدخل معرّف العيادة (أو رقم الهاتف) وكلمة مرور خاصة بك. عند الدخول بنفس البيانات من أي هاتف آخر ستتم مزامنة كافة السندات والديون والمخزون تلقائياً ومجاناً.
                </p>
              </div>

              <div className="space-y-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    معرّف العيادة أو رقم الهاتف
                  </label>
                  <input
                    type="text"
                    required
                    dir="ltr"
                    value={clinicIdInput}
                    onChange={(e) => setClinicIdInput(e.target.value)}
                    placeholder="alssaedy-clinic أو 775956520"
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-bold text-slate-900 dark:text-slate-100 text-left font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    كلمة مرور حساب العيادة
                  </label>
                  <input
                    type="password"
                    required
                    dir="ltr"
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    placeholder="أدخل 4 أرقام أو أحرف على الأقل"
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-bold text-slate-900 dark:text-slate-100 text-left font-mono"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={authLoading}
                className="w-full py-2.5 px-4 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-black flex items-center justify-center gap-2 shadow-sm transition-colors"
              >
                <LogIn className="w-4 h-4" />
                <span>
                  {authLoading
                    ? 'جاري الاتصال بالسحابة...'
                    : 'تسجيل / دخول ومزامنة حساب العيادة'}
                </span>
              </button>

              <button
                type="button"
                disabled={authLoading}
                onClick={handleGoogleLogin}
                className="w-full py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold flex items-center justify-center gap-2 transition-colors"
              >
                <Cloud className="w-3.5 h-3.5 text-sky-500" />
                <span>أو الربط عبر حساب Google (Firebase Cloud)</span>
              </button>
            </form>
          )}

          {/* SECTION 2: LIVE APP LINK, QR & FREE PLATFORMS */}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-black text-slate-900 dark:text-slate-100">
                <Smartphone className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>رابط التشغيل المباشر والتثبيت على الهاتف</span>
              </div>
              <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[10px] font-black">
                نشط الآن
              </span>
            </div>

            <div
              dir="ltr"
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950 px-3 py-2 text-[11px] font-mono text-sky-700 dark:text-sky-300 break-all select-all"
            >
              {liveAppUrl}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleCopyLiveLink}
                className="py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black flex items-center justify-center gap-1.5 transition-colors"
              >
                <Copy className="w-3.5 h-3.5 shrink-0" />
                <span>نسخ الرابط الفعال</span>
              </button>

              <button
                type="button"
                onClick={handleShareLiveLink}
                className="py-2.5 px-3 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-black flex items-center justify-center gap-1.5 transition-colors"
              >
                <Share2 className="w-3.5 h-3.5 shrink-0" />
                <span>مشاركة الرابط</span>
              </button>
            </div>

            {appQrUrl && (
              <div className="flex flex-col items-center justify-center pt-1">
                <div className="p-2 bg-white rounded-xl border border-slate-200 shadow-xs">
                  <img
                    src={appQrUrl}
                    alt="App QR Code"
                    className="w-28 h-28 object-contain"
                  />
                </div>
                <span className="text-[10px] font-bold text-slate-500 mt-1">
                  رمز QR لرابط التطبيق المباشر
                </span>
              </div>
            )}

            <PWAInstallButton notify={notify} />

            {/* Guide for permanent free external hosting (Render / Firebase / GitHub) */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 space-y-1.5 text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
              <div className="font-black text-slate-900 dark:text-slate-200 flex items-center gap-1.5">
                <ExternalLink className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                <span>كيف تنشره كرابط عام دائم ومجاني لأي هاتف؟</span>
              </div>
              <ul className="list-disc list-inside space-y-1">
                <li>
                  <strong>الطريقة 1 (من داخل AI Studio):</strong> اضغط على أيقونة المشاركة/النشر (Share / Deploy) أعلى واجهة AI Studio لتفعيل الرابط العام الدائم مجاناً.
                </li>
                <li>
                  <strong>الطريقة 2 (عبر GitHub + Render أو Vercel مجاناً):</strong> تم تجهيز المشروع بملفات <code>render.yaml</code> و <code>vercel.json</code> و <code>firebase.json</code>، فقط ارفعه لحسابك في GitHub واربطه بمنصة <strong>Render.com</strong> (الخطة المجانية Free) ليعمل 24 ساعة مجاناً على جميع الهواتف.
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
