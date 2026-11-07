import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Cloud,
  Eye,
  EyeOff,
  LogIn,
  LogOut,
  RefreshCw,
  ShieldCheck,
  UserPlus,
  Users,
  Mail,
} from 'lucide-react';
import { User } from '../firebase';
import { WorkspaceRole } from '../types/clinic';
import { PWAInstallButton } from './PWAInstallButton';

export interface DirectClinicSession {
  clinicId: string;
  ownerUid: string;
  sessionToken: string;
  expiresAt: string;
  updatedAt?: string;
}

export interface DirectAuthOptions {
  mode: 'login' | 'register';
  clinicNameAr?: string;
  doctorNameAr?: string;
}

interface CloudAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  isFirstOpenGate?: boolean;
  user: User | null;
  directSession: DirectClinicSession | null;
  currentRole?: WorkspaceRole;
  canManageTeam?: boolean;
  onOpenTeamModal?: () => void;
  onOpenEmailAuth?: () => void;
  onResendVerification?: () => Promise<void>;
  defaultClinicName?: string;
  defaultDoctorName?: string;
  isSyncing: boolean;
  onSignInGoogle: () => Promise<boolean>;
  onDirectLogin: (
    clinicId: string,
    password: string,
    options?: DirectAuthOptions
  ) => Promise<boolean>;
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
  isFirstOpenGate = false,
  user,
  directSession,
  currentRole = 'owner',
  canManageTeam = true,
  onOpenTeamModal,
  onOpenEmailAuth,
  onResendVerification,
  defaultClinicName = 'عيادة السعيدي لطب وجراحة الفم والأسنان',
  defaultDoctorName = 'د. صلاح الدين السعيدي',
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
  const [authTab, setAuthTab] = useState<'login' | 'register'>('login');
  const [clinicIdInput, setClinicIdInput] = useState(
    directSession?.clinicId || 'alssaedy-clinic'
  );
  const [passwordInput, setPasswordInput] = useState('');
  const [clinicNameInput, setClinicNameInput] = useState(defaultClinicName);
  const [doctorNameInput, setDoctorNameInput] = useState(defaultDoctorName);
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  useEffect(() => {
    setClinicNameInput(defaultClinicName);
    setDoctorNameInput(defaultDoctorName);
  }, [defaultClinicName, defaultDoctorName]);

  useEffect(() => {
    if (!isOpen) return;
    setAuthError(null);
  }, [isOpen]);

  if (!isOpen) return null;

  const isConnected = Boolean(user || directSession);
  const derivedClinicId =
    directSession?.clinicId ||
    (user?.email?.endsWith('@clinic.alssaedic.local')
      ? user.email.replace('@clinic.alssaedic.local', '')
      : null);

  const handleDirectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    const trimmedId = clinicIdInput.trim();
    const trimmedPass = passwordInput.trim();

    if (trimmedId.length < 3) {
      setAuthError('يرجى إدخال معرّف العيادة أو رقم الهاتف (3 أحرف على الأقل).');
      return;
    }
    if (trimmedPass.length < 4) {
      setAuthError('يرجى إدخال كلمة مرور مكونة من 4 أحرف أو أرقام على الأقل.');
      return;
    }

    setAuthLoading(true);
    try {
      const ok = await onDirectLogin(trimmedId, trimmedPass, {
        mode: authTab,
        clinicNameAr: authTab === 'register' ? clinicNameInput.trim() : undefined,
        doctorNameAr: authTab === 'register' ? doctorNameInput.trim() : undefined,
      });
      if (ok) {
        setPasswordInput('');
        onClose();
      } else {
        setAuthError(
          authTab === 'register'
            ? 'تعذر إنشاء الحساب بهذا المعرّف. إذا كان مسجلاً مسبقاً بكلمة مرور أخرى، اختر "تسجيل الدخول".'
            : 'معرّف العيادة أو كلمة المرور غير صحيحة.'
        );
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setAuthError(null);
    setAuthLoading(true);
    try {
      const ok = await onSignInGoogle();
      if (ok) {
        onClose();
      } else {
        setAuthError(
          'تعذر الدخول عبر Google على هذا النطاق. يمكنك الدخول مباشرة بمعرّف العيادة وكلمة المرور أعلاه.'
        );
      }
    } finally {
      setAuthLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 no-print"
      onClick={() => {
        if (!isFirstOpenGate || isConnected) onClose();
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-sm max-h-[90vh] flex flex-col overflow-hidden shadow-2xl"
      >
        {/* Header */}
        <div className="shrink-0 px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 bg-slate-50 dark:bg-slate-950">
          <div className="flex items-center gap-2 min-w-0">
            <Cloud className="w-4 h-4 text-sky-500 shrink-0" />
            <h3 className="text-sm font-black text-slate-900 dark:text-slate-100 truncate">
              الحساب السحابي
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold shrink-0"
          >
            <ArrowRight className="w-3.5 h-3.5" />
            <span>{isConnected ? 'رجوع' : 'تخطي'}</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {isConnected ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <ShieldCheck className="w-5 h-5 text-emerald-500 shrink-0" />
                    <span className="text-xs sm:text-sm font-black text-emerald-900 dark:text-emerald-200 truncate">
                      الحساب السحابي نشط
                    </span>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-black shrink-0">
                    {currentRole === 'owner'
                      ? 'مالك العيادة'
                      : currentRole === 'doctor'
                        ? 'طبيب'
                        : currentRole === 'accountant'
                          ? 'محاسب'
                          : currentRole === 'receptionist'
                            ? 'استقبال'
                            : 'مشاهد'}
                  </span>
                </div>
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 flex-wrap">
                  {derivedClinicId ? (
                    <>
                      <span>معرّف العيادة:</span>
                      <span dir="ltr" className="font-mono text-emerald-700 dark:text-emerald-300">
                        {derivedClinicId}
                      </span>
                    </>
                  ) : (
                    <span dir="ltr" className="font-mono break-all">
                      {user?.email || ''}
                    </span>
                  )}
                </div>

                {user && !user.emailVerified && (
                  <div className="mt-2 pt-2 border-t border-amber-500/30 text-amber-800 dark:text-amber-300 text-[11px] font-bold space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-500" />
                      <span>البريد الإلكتروني غير مؤكد بعد.</span>
                    </div>
                    {onResendVerification && (
                      <button
                        type="button"
                        onClick={onResendVerification}
                        className="text-[10px] underline text-sky-600 dark:text-sky-400 hover:text-sky-500"
                      >
                        إعادة إرسال رابط التحقق إلى البريد
                      </button>
                    )}
                  </div>
                )}
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

              {canManageTeam && onOpenTeamModal && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenTeamModal();
                  }}
                  className="w-full py-2.5 px-4 rounded-xl border border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 text-xs font-black flex items-center justify-center gap-2 transition-colors"
                >
                  <Users className="w-4 h-4 shrink-0 text-indigo-500" />
                  <span>فريق العمل والصلاحيات (مساحة العمل)</span>
                </button>
              )}

              <button
                type="button"
                disabled={isSyncing}
                onClick={onForceSyncNow}
                className="w-full py-2.5 px-4 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-black flex items-center justify-center gap-2 transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>{isSyncing ? 'جاري المزامنة...' : 'مزامنة الآن'}</span>
              </button>

              <button
                type="button"
                onClick={onSignOut}
                className="w-full py-2 px-4 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-bold flex items-center justify-center gap-2 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>تسجيل الخروج</span>
              </button>
            </div>
          ) : (
            <div className="space-y-3.5">
              {/* Mode Switcher: Login vs Register */}
              <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setAuthTab('login');
                    setAuthError(null);
                  }}
                  className={`py-2 px-3 rounded-lg text-xs font-black flex items-center justify-center gap-1.5 transition-all ${
                    authTab === 'login'
                      ? 'bg-sky-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  <LogIn className="w-3.5 h-3.5 shrink-0" />
                  <span>تسجيل الدخول</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthTab('register');
                    setAuthError(null);
                  }}
                  className={`py-2 px-3 rounded-lg text-xs font-black flex items-center justify-center gap-1.5 transition-all ${
                    authTab === 'register'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  <UserPlus className="w-3.5 h-3.5 shrink-0" />
                  <span>حساب جديد</span>
                </button>
              </div>

              <form onSubmit={handleDirectSubmit} className="space-y-3">
                {authTab === 'register' && (
                  <div className="space-y-2.5">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        اسم العيادة
                      </label>
                      <input
                        type="text"
                        required
                        value={clinicNameInput}
                        onChange={(e) => setClinicNameInput(e.target.value)}
                        placeholder="عيادة السعيدي لطب وجراحة الفم والأسنان"
                        className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-bold text-slate-900 dark:text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        اسم الطبيب
                      </label>
                      <input
                        type="text"
                        required
                        value={doctorNameInput}
                        onChange={(e) => setDoctorNameInput(e.target.value)}
                        placeholder="د. صلاح الدين السعيدي"
                        className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-bold text-slate-900 dark:text-slate-100"
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-2.5">
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
                      placeholder="alssaedy-clinic"
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2.5 text-xs font-bold text-slate-900 dark:text-slate-100 text-left font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      كلمة المرور
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        dir="ltr"
                        value={passwordInput}
                        onChange={(e) => setPasswordInput(e.target.value)}
                        placeholder="4 أحرف أو أرقام على الأقل"
                        className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 pl-9 pr-3 py-2.5 text-xs font-bold text-slate-900 dark:text-slate-100 text-left font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                {authError && (
                  <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[11px] font-bold text-rose-600 dark:text-rose-300 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{authError}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={authLoading}
                  className={`w-full py-2.5 px-4 rounded-xl disabled:opacity-50 text-white text-xs font-black flex items-center justify-center gap-2 shadow-sm transition-colors ${
                    authTab === 'register'
                      ? 'bg-emerald-600 hover:bg-emerald-500'
                      : 'bg-sky-600 hover:bg-sky-500'
                  }`}
                >
                  {authTab === 'register' ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  ) : (
                    <LogIn className="w-4 h-4 shrink-0" />
                  )}
                  <span>
                    {authLoading
                      ? 'جاري الاتصال...'
                      : authTab === 'register'
                        ? 'إنشاء حساب'
                        : 'تسجيل الدخول'}
                  </span>
                </button>

                <button
                  type="button"
                  disabled={authLoading}
                  onClick={handleGoogleLogin}
                  className="w-full py-2.5 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold flex items-center justify-center gap-2 transition-colors"
                >
                  <Cloud className="w-4 h-4 text-sky-500 shrink-0" />
                  <span>الدخول عبر Google</span>
                </button>

                {onOpenEmailAuth && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenEmailAuth();
                    }}
                    className="w-full py-2.5 px-3 rounded-xl border border-sky-500/30 bg-sky-500/10 hover:bg-sky-500/20 text-sky-700 dark:text-sky-300 text-xs font-black flex items-center justify-center gap-2 transition-colors"
                  >
                    <Mail className="w-4 h-4 text-sky-500 shrink-0" />
                    <span>التسجيل / الدخول بالبريد واستعادة كلمة المرور</span>
                  </button>
                )}

                {isFirstOpenGate && (
                  <button
                    type="button"
                    onClick={onClose}
                    className="w-full py-1.5 px-3 rounded-xl text-[11px] font-bold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
                  >
                    المتابعة بدون مزامنة
                  </button>
                )}
              </form>
            </div>
          )}

          {/* Compact PWA Install & Help Action */}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
            <PWAInstallButton notify={notify} />
          </div>
        </div>
      </div>
    </div>
  );
};
