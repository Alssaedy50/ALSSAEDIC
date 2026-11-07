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
  isValidRealEmail,
  loginWithEmailAndPassword,
  registerWithEmailAndPassword,
  reloadAndCheckEmailVerified,
  requestPasswordReset,
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
  onAccountCreated?: () => void;
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
  onAccountCreated,
  notify,
}) => {
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [email, setEmail] = useState(user?.email ? user.email : '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authInfo, setAuthInfo] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [isOpNotAllowed, setIsOpNotAllowed] = useState(false);

  const [isEmailVerifiedState, setIsEmailVerifiedState] = useState<boolean>(
    Boolean(user?.emailVerified)
  );
  const [checkingVerification, setCheckingVerification] = useState<boolean>(false);

  useEffect(() => {
    setIsEmailVerifiedState(Boolean(user?.emailVerified));
  }, [user]);

  useEffect(() => {
    if (!isOpen) return;
    setAuthError(null);
    setAuthInfo(null);
    setIsOpNotAllowed(false);
    if (user?.email && !user.email.endsWith('@clinic.alssaedic.local')) {
      setEmail(user.email);
      if (!user.emailVerified) {
        reloadAndCheckEmailVerified()
          .then((verified) => {
            if (verified) {
              setIsEmailVerifiedState(true);
            }
          })
          .catch(() => {});
      }
    }
  }, [isOpen, user]);

  if (!isOpen) return null;

  const isConnected = Boolean(user);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthInfo(null);
    setIsOpNotAllowed(false);

    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();

    if (!cleanEmail) {
      setAuthError('يرجى إدخال البريد الإلكتروني.');
      return;
    }

    if (!isValidRealEmail(cleanEmail)) {
      setAuthError('يرجى إدخال بريد إلكتروني حقيقي وصحيح (مثال: example@gmail.com).');
      return;
    }

    // 1. Password Reset Mode
    if (authMode === 'forgot') {
      setAuthLoading(true);
      try {
        await requestPasswordReset(cleanEmail);
        setAuthInfo(`تم إرسال رابط استعادة كلمة المرور إلى البريد: ${cleanEmail}`);
        notify('تم إرسال رابط استعادة كلمة المرور إلى بريدك الإلكتروني', 'success');
      } catch (err: unknown) {
        setAuthError(err instanceof Error ? err.message : 'تعذر إرسال رابط الاستعادة.');
      } finally {
        setAuthLoading(false);
      }
      return;
    }

    if (cleanPassword.length < 6) {
      setAuthError('كلمة المرور يجب أن لا تقل عن 6 خانات.');
      return;
    }

    // 2. Register Mode: Strictly Real Email + Password
    if (authMode === 'register') {
      setAuthLoading(true);
      try {
        const { verificationSent } = await registerWithEmailAndPassword(cleanEmail, cleanPassword);
        if (verificationSent) {
          notify('تم إنشاء الحساب بنجاح! أدخل بيانات عيادتك الخاصة الآن ثم اضغط حفظ.', 'success');
        } else {
          notify('تم إنشاء الحساب بنجاح! أدخل بيانات عيادتك الخاصة الآن ثم اضغط حفظ.', 'success');
        }
        setPassword('');
        onAccountCreated?.();
        onClose();
        return;
      } catch (err: unknown) {
        const code = (err as { code?: string })?.code || '';
        const rawErr = err instanceof Error ? err.message : String(err);
        let msg = 'حدث خطأ أثناء إنشاء الحساب.';
        if (code === 'auth/operation-not-allowed' || rawErr.includes('operation-not-allowed')) {
          setIsOpNotAllowed(true);
          msg = 'تسجيل الحساب بالبريد وكلمة المرور غير مفعّل في Firebase. يرجى استخدام زر الدخول الفوري عبر Google.';
        } else if (code === 'auth/email-already-in-use') {
          msg = 'هذا البريد الإلكتروني مسجل مسبقاً. اضغط أدناه للانتقال إلى "دخول".';
        } else if (code === 'auth/invalid-email') {
          msg = 'صيغة البريد الإلكتروني غير صالحة.';
        } else if (code === 'auth/weak-password') {
          msg = 'كلمة المرور ضعيفة. يرجى اختيار كلمة مرور لا تقل عن 6 خانات.';
        } else if (err instanceof Error) {
          msg = err.message;
        }
        setAuthError(msg);
      } finally {
        setAuthLoading(false);
      }
      return;
    }

    // 3. Login Mode: Strictly Real Email + Password
    setAuthLoading(true);
    try {
      await loginWithEmailAndPassword(cleanEmail, cleanPassword);
      notify('تم تسجيل الدخول بنجاح', 'success');
      setPassword('');
      onClose();
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      const rawErr = err instanceof Error ? err.message : String(err);
      let msg = 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
      if (code === 'auth/operation-not-allowed' || rawErr.includes('operation-not-allowed')) {
        setIsOpNotAllowed(true);
        msg = 'تسجيل الدخول بالبريد وكلمة المرور غير مفعّل في Firebase. يرجى استخدام الدخول الفوري عبر Google أدناه.';
      } else if (code === 'auth/user-not-found' || code === 'auth/invalid-credential') {
        msg = 'البريد الإلكتروني أو كلمة المرور غير صحيحة، أو الحساب غير مسجل بعد.';
      } else if (code === 'auth/wrong-password') {
        msg = 'كلمة المرور غير صحيحة.';
      } else if (code === 'auth/too-many-requests') {
        msg = 'تم حظر المحاولات مؤقتاً بسبب التكرار. يرجى الانتظار دقيقة.';
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
        setAuthError('تعذر الدخول عبر Google. يمكنك الدخول بالبريد الإلكتروني وكلمة المرور.');
      }
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      const rawErr = err instanceof Error ? err.message : String(err);
      if (code === 'auth/unauthorized-domain' || rawErr.includes('unauthorized-domain')) {
        const host = typeof window !== 'undefined' ? window.location.hostname : 'الموقع الحالي';
        setAuthError(
          `النطاق (${host}) غير مضاف بعد في قائمة النطاقات المصرح بها (Authorized domains) داخل إعدادات Firebase Authentication.`
        );
      } else if (code === 'auth/popup-blocked' || rawErr.includes('popup-blocked')) {
        setAuthError('قام المتصفح بحظر نافذة Google المنبثقة. يرجى السماح بالنوافذ المنبثقة.');
      } else if (code === 'auth/popup-closed-by-user' || rawErr.includes('popup-closed-by-user')) {
        setAuthError('تم إغلاق نافذة تسجيل الدخول عبر Google قبل إكمال العملية.');
      } else {
        setAuthError('تعذر الدخول عبر Google. يرجى التحقق من الاتصال والمحاولة مرة أخرى.');
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
                      <span className="text-slate-500">البريد الإلكتروني:</span>
                      <span dir="ltr" className="font-mono text-slate-900 dark:text-slate-100 break-all">
                        {user.email}
                      </span>
                      {isEmailVerifiedState && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[10px] font-black">
                          <CheckCircle2 className="w-3 h-3" />
                          موثّق
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {user &&
                  user.email &&
                  !isEmailVerifiedState && (
                    <div className="mt-2 pt-2 border-t border-amber-500/30 text-amber-800 dark:text-amber-300 text-[11px] font-bold space-y-2">
                      <div className="flex items-center gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-500" />
                        <span>إذا قمت بالضغط على رابط التوثيق في بريدك، اضغط "تحقق الآن" لتحديث الحالة.</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={checkingVerification}
                          onClick={async () => {
                            setCheckingVerification(true);
                            try {
                              const verified = await reloadAndCheckEmailVerified();
                              if (verified) {
                                setIsEmailVerifiedState(true);
                                notify('تم توثيق البريد الإلكتروني بنجاح!', 'success');
                              } else {
                                notify(
                                  'لم يتم تأكيد الرابط بعد. يرجى فتح الرسالة في بريدك (أو الرسائل غير المرغوب فيها Spam) والضغط على الرابط.',
                                  'info'
                                );
                              }
                            } finally {
                              setCheckingVerification(false);
                            }
                          }}
                          className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-black transition-colors disabled:opacity-50"
                        >
                          {checkingVerification ? 'جارٍ التحقق...' : 'تحقق الآن (تم التوثيق)'}
                        </button>
                        {onResendVerification && (
                          <button
                            type="button"
                            onClick={async () => {
                              const alreadyVerified = await reloadAndCheckEmailVerified();
                              if (alreadyVerified) {
                                setIsEmailVerifiedState(true);
                                notify('بريدك الإلكتروني موثّق بالفعل!', 'success');
                                return;
                              }
                              await onResendVerification();
                            }}
                            className="px-2.5 py-1 rounded-lg border border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300 hover:bg-sky-500/20 text-[10px] font-black transition-colors"
                          >
                            إعادة إرسال الرابط
                          </button>
                        )}
                      </div>
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
              {/* Primary Instant Google Login Button */}
              <div className="space-y-1">
                <button
                  type="button"
                  disabled={authLoading}
                  onClick={handleGoogleLogin}
                  className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 disabled:opacity-50 text-white text-xs font-black flex items-center justify-center gap-2 shadow-sm hover:shadow transition-all"
                >
                  <Cloud className="w-4 h-4 shrink-0 text-white" />
                  <span>تسجيل الدخول الفوري عبر Google</span>
                </button>
                <div className="text-[10px] text-center font-bold text-slate-500 dark:text-slate-400">
                  مفعل تلقائياً لمزامنة البيانات السحابية بضغطة زر
                </div>
              </div>

              <div className="relative flex items-center justify-center my-1">
                <div className="border-t border-slate-200 dark:border-slate-800 w-full" />
                <span className="bg-white dark:bg-slate-900 px-2.5 text-[10px] font-bold text-slate-400 shrink-0">
                  أو بالبريد الإلكتروني وكلمة المرور
                </span>
                <div className="border-t border-slate-200 dark:border-slate-800 w-full" />
              </div>

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
                    البريد الإلكتروني
                  </label>
                  <div className="relative">
                    <input
                      type="email"
                      required
                      dir="ltr"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="example@gmail.com"
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 pl-3 pr-9 py-2.5 text-xs font-bold text-slate-900 dark:text-slate-100 font-mono"
                    />
                    <Mail className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                  </div>
                </div>

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
                  <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-[11px] font-bold text-rose-600 dark:text-rose-300 space-y-2">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span className="leading-relaxed">{authError}</span>
                    </div>

                    {isOpNotAllowed ? (
                      <button
                        type="button"
                        onClick={handleGoogleLogin}
                        className="w-full py-2 px-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-black text-xs flex items-center justify-center gap-2 shadow-xs transition-colors"
                      >
                        <Cloud className="w-4 h-4 shrink-0" />
                        <span>متابعة الدخول الفوري عبر Google الآن ←</span>
                      </button>
                    ) : (
                      <>
                        {authMode === 'register' && (
                          <button
                            type="button"
                            onClick={() => {
                              setAuthMode('login');
                              setAuthError(null);
                            }}
                            className="text-sky-600 dark:text-sky-400 underline font-black block pr-6 text-xs hover:text-sky-500"
                          >
                            اضغط هنا لتسجيل الدخول بهذا البريد الإلكتروني ←
                          </button>
                        )}
                        {authMode === 'login' && (
                          <button
                            type="button"
                            onClick={() => {
                              setAuthMode('register');
                              setAuthError(null);
                            }}
                            className="text-emerald-600 dark:text-emerald-400 underline font-black block pr-6 text-xs hover:text-emerald-500"
                          >
                            حساب جديد؟ اضغط هنا لإنشاء حساب الآن ←
                          </button>
                        )}
                      </>
                    )}
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
