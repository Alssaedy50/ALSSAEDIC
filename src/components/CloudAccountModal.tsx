import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Cloud,
  Eye,
  EyeOff,
  Lock,
  LogIn,
  LogOut,
  Mail,
  RefreshCw,
  Send,
  ShieldCheck,
  UserPlus,
  X,
} from 'lucide-react';
import {
  User,
  loginWithEmailAndPassword,
  registerWithEmailAndPassword,
  requestPasswordReset,
  resolveEmailFromIdentifier,
} from '../firebase';
import { WorkspaceRole } from '../types/clinic';

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
  user: User | null;
  directSession: DirectClinicSession | null;
  currentRole?: WorkspaceRole;
  onResendVerification?: () => Promise<void>;
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

const ROLE_LABELS: Record<WorkspaceRole, string> = {
  owner: 'مالك العيادة',
  doctor: 'طبيب أسنان',
  accountant: 'محاسب',
  receptionist: 'موظف استقبال',
  viewer: 'مشاهد',
};

export const CloudAccountModal: React.FC<CloudAccountModalProps> = ({
  isOpen,
  onClose,
  user,
  directSession,
  currentRole = 'owner',
  onResendVerification,
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
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [identifier, setIdentifier] = useState(
    directSession?.clinicId || (user?.email ? user.email : '')
  );
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authInfo, setAuthInfo] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  const [registeredIdentifier, setRegisteredIdentifier] = useState<string | null>(null);
  const [customRegisterIdentifier, setCustomRegisterIdentifier] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setAuthError(null);
    setAuthInfo(null);
    setRegisteredIdentifier(null);
    if (user?.email) {
      setIdentifier(user.email);
    } else if (directSession?.clinicId) {
      setIdentifier(directSession.clinicId);
    }
  }, [isOpen, directSession, user]);

  if (!isOpen) return null;

  const isConnected = Boolean(user || directSession);
  const derivedClinicId =
    registeredIdentifier ||
    directSession?.clinicId ||
    (user?.email
      ? user.email.endsWith('@clinic.alssaedic.local')
        ? user.email.replace('@clinic.alssaedic.local', '')
        : user.email.split('@')[0]
      : null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthInfo(null);

    const cleanIdentifier = identifier.trim();
    const cleanPassword = password.trim();

    if (!cleanIdentifier) {
      setAuthError(authMode === 'register' ? 'يرجى إدخال البريد الإلكتروني.' : 'يرجى إدخال البريد أو المعرّف.');
      return;
    }

    // 1. Password Reset Mode
    if (authMode === 'forgot') {
      let resetEmail = cleanIdentifier;
      if (!resetEmail.includes('@')) {
        const resolved = await resolveEmailFromIdentifier(resetEmail);
        if (resolved) {
          resetEmail = resolved;
        } else {
          setAuthError('المعرّف غير مسجل. يرجى إدخال بريدك الإلكتروني لاستعادة كلمة المرور.');
          return;
        }
      }
      setAuthLoading(true);
      try {
        await requestPasswordReset(resetEmail);
        setAuthInfo(`تم إرسال رابط استعادة كلمة المرور إلى البريد: ${resetEmail}`);
        notify('تم إرسال رابط استعادة كلمة المرور', 'success');
      } catch (err: unknown) {
        setAuthError(err instanceof Error ? err.message : 'تعذر إرسال رابط الاستعادة.');
      } finally {
        setAuthLoading(false);
      }
      return;
    }

    // 2. Registration is EXCLUSIVELY via Email
    if (authMode === 'register') {
      if (!cleanIdentifier.includes('@') || !cleanIdentifier.includes('.')) {
        setAuthError('إنشاء الحساب حصري عبر البريد الإلكتروني. يرجى كتابة بريد إلكتروني صالح (مثال: doctor@example.com).');
        return;
      }
      if (cleanPassword.length < 6) {
        setAuthError('كلمة المرور يجب أن لا تقل عن 6 خانات لتأمين الحساب.');
        return;
      }

      setAuthLoading(true);
      try {
        const { user: newUser, verificationSent, assignedIdentifier } = await registerWithEmailAndPassword(
          cleanIdentifier,
          cleanPassword,
          customRegisterIdentifier.trim() || undefined
        );
        setRegisteredIdentifier(assignedIdentifier);
        setAuthInfo(`تم إنشاء الحساب بنجاح! تم تعيين المعرّف الخاص بك: [ ${assignedIdentifier} ]. ${
          verificationSent ? 'تم إرسال رابط تأكيد البريد الإلكتروني لتأمين مساحة العمل.' : ''
        }`);
        notify(`تم إنشاء الحساب بنجاح، معرّفك هو: ${assignedIdentifier}`, 'success');
        setAuthMode('login');
      } catch (err: unknown) {
        const code = (err as { code?: string })?.code || '';
        let msg = 'حدث خطأ أثناء إنشاء الحساب.';
        if (code === 'auth/email-already-in-use') {
          msg = 'هذا البريد مسجل بالفعل. يرجى اختيار "دخول" أو استعادة كلمة المرور.';
        } else if (code === 'auth/invalid-email') {
          msg = 'صيغة البريد الإلكتروني غير صالحة.';
        } else if (code === 'auth/weak-password') {
          msg = 'كلمة المرور ضعيفة. يرجى اختيار كلمة مرور أقوى.';
        } else if (err instanceof Error) {
          msg = err.message;
        }
        setAuthError(msg);
      } finally {
        setAuthLoading(false);
      }
      return;
    }

    // 3. Login Mode: Accepts either Email or Identifier
    if (cleanPassword.length < 4) {
      setAuthError('كلمة المرور يجب أن لا تقل عن 4 خانات.');
      return;
    }

    setAuthLoading(true);
    try {
      // First try standard email or bound identifier through loginWithEmailAndPassword
      try {
        const loggedInUser = await loginWithEmailAndPassword(cleanIdentifier, cleanPassword);
        if (!loggedInUser.emailVerified) {
          notify('يرجى تأكيد البريد الإلكتروني عبر الرابط المرسل', 'warning');
        } else {
          notify('تم تسجيل الدخول بنجاح', 'success');
        }
        setPassword('');
        onClose();
        return;
      } catch (firstErr: unknown) {
        // If not found in email/bound identifiers and doesn't contain @, check legacy direct workspace auth
        if (!cleanIdentifier.includes('@')) {
          const directOk = await onDirectLogin(cleanIdentifier, cleanPassword, {
            mode: 'login',
          });
          if (directOk) {
            setPassword('');
            onClose();
            return;
          }
        }
        throw firstErr;
      }
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      let msg = 'البريد أو المعرّف أو كلمة المرور غير صحيحة.';
      if (code === 'auth/too-many-requests') {
        msg = 'تم حظر المحاولات مؤقتاً بسبب التكرار. يرجى الانتظار قليلاً.';
      } else if (err instanceof Error) {
        msg = err.message;
      }
      setAuthError(msg);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setAuthError(null);
    setAuthInfo(null);
    setAuthLoading(true);
    try {
      const ok = await onSignInGoogle();
      if (ok) {
        onClose();
      } else {
        setAuthError('تعذر الدخول عبر Google. يمكنك الدخول بالبريد أو المعرّف.');
      }
    } finally {
      setAuthLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 no-print"
      onClick={onClose}
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
              الحساب
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
            aria-label="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
          {isConnected ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <ShieldCheck className="w-5 h-5 text-emerald-500 shrink-0" />
                    <span className="text-xs sm:text-sm font-black text-emerald-900 dark:text-emerald-200 truncate">
                      الحساب نشط
                    </span>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-black shrink-0">
                    {ROLE_LABELS[currentRole] || currentRole}
                  </span>
                </div>
                <div className="space-y-1 text-xs font-bold text-slate-800 dark:text-slate-200">
                  {user?.email && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-slate-500">البريد:</span>
                      <span dir="ltr" className="font-mono text-slate-900 dark:text-slate-100 break-all">
                        {user.email}
                      </span>
                    </div>
                  )}
                  {derivedClinicId && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-slate-500">المعرّف:</span>
                      <span dir="ltr" className="font-mono text-emerald-700 dark:text-emerald-300">
                        {derivedClinicId}
                      </span>
                    </div>
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
                        إعادة إرسال التحقق
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
              {/* Segmented Switcher: دخول vs حساب جديد */}
              {authMode !== 'forgot' && (
                <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('login');
                      setAuthError(null);
                      setAuthInfo(null);
                    }}
                    className={`py-2 px-3 rounded-lg text-xs font-black flex items-center justify-center gap-1.5 transition-all ${
                      authMode === 'login'
                        ? 'bg-sky-600 text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    <LogIn className="w-3.5 h-3.5 shrink-0" />
                    <span>دخول</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('register');
                      setAuthError(null);
                      setAuthInfo(null);
                    }}
                    className={`py-2 px-3 rounded-lg text-xs font-black flex items-center justify-center gap-1.5 transition-all ${
                      authMode === 'register'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    <UserPlus className="w-3.5 h-3.5 shrink-0" />
                    <span>حساب جديد</span>
                  </button>
                </div>
              )}

              {authMode === 'forgot' && (
                <div className="text-center pb-1">
                  <h4 className="text-xs font-black text-slate-900 dark:text-slate-100">
                    استعادة كلمة المرور
                  </h4>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {authMode === 'register' ? 'البريد الإلكتروني' : 'البريد أو المعرّف'}
                  </label>
                  <div className="relative">
                    <input
                      type={authMode === 'register' || authMode === 'forgot' ? 'email' : 'text'}
                      required
                      dir="ltr"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder={authMode === 'register' ? 'doctor@example.com' : 'doctor@example.com أو المعرّف'}
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 pl-3 pr-9 py-2.5 text-xs font-bold text-slate-900 dark:text-slate-100 font-mono"
                    />
                    <Mail className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                  </div>
                </div>

                {authMode === 'register' && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                        معرّف الحساب (اختياري)
                      </label>
                      <span className="text-[10px] text-slate-400">لتسجيل الدخول السريع</span>
                    </div>
                    <div className="relative">
                      <input
                        type="text"
                        dir="ltr"
                        value={customRegisterIdentifier}
                        onChange={(e) => setCustomRegisterIdentifier(e.target.value)}
                        placeholder="alssaedy-clinic (تلقائي إن ترك فارغاً)"
                        className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-bold text-slate-900 dark:text-slate-100 font-mono"
                      />
                    </div>
                  </div>
                )}

                {authMode !== 'forgot' && (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      كلمة المرور
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        dir="ltr"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••"
                        className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 pl-9 pr-9 py-2.5 text-xs font-bold text-slate-900 dark:text-slate-100 font-mono"
                      />
                      <Lock className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                      <button
                        type="button"
                        onClick={() => setShowPassword((p) => !p)}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        aria-label={showPassword ? 'إخفاء' : 'إظهار'}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>

                    {authMode === 'login' && (
                      <div className="pt-1 text-left">
                        <button
                          type="button"
                          onClick={() => {
                            setAuthMode('forgot');
                            setAuthError(null);
                            setAuthInfo(null);
                          }}
                          className="text-[11px] font-bold text-sky-600 dark:text-sky-400 hover:underline"
                        >
                          نسيت كلمة المرور؟
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {authError && (
                  <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-2.5 text-[11px] font-bold text-rose-600 dark:text-rose-300 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{authError}</span>
                  </div>
                )}

                {authInfo && (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{authInfo}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={authLoading}
                  className={`w-full py-2.5 px-4 rounded-xl disabled:opacity-50 text-white text-xs font-black flex items-center justify-center gap-2 shadow-sm transition-colors ${
                    authMode === 'register'
                      ? 'bg-emerald-600 hover:bg-emerald-500'
                      : 'bg-sky-600 hover:bg-sky-500'
                  }`}
                >
                  {authLoading ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : authMode === 'register' ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  ) : authMode === 'forgot' ? (
                    <Send className="w-4 h-4 shrink-0" />
                  ) : (
                    <LogIn className="w-4 h-4 shrink-0" />
                  )}
                  <span>
                    {authLoading
                      ? 'جاري التنفيذ...'
                      : authMode === 'register'
                        ? 'إنشاء حساب'
                        : authMode === 'forgot'
                          ? 'إرسال رابط الاستعادة'
                          : 'دخول'}
                  </span>
                </button>

                {authMode !== 'forgot' && (
                  <button
                    type="button"
                    disabled={authLoading}
                    onClick={handleGoogleLogin}
                    className="w-full py-2.5 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold flex items-center justify-center gap-2 transition-colors"
                  >
                    <Cloud className="w-4 h-4 text-sky-500 shrink-0" />
                    <span>Google</span>
                  </button>
                )}

                {authMode === 'forgot' && (
                  <div className="text-center pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('login');
                        setAuthError(null);
                        setAuthInfo(null);
                      }}
                      className="text-xs font-bold text-sky-600 dark:text-sky-400 hover:underline"
                    >
                      العودة لتسجيل الدخول
                    </button>
                  </div>
                )}
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
