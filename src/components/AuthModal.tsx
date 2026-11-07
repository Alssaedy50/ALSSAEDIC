import React, { useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  KeyRound,
  Lock,
  Mail,
  RefreshCw,
  Send,
  UserCheck,
} from 'lucide-react';
import {
  User,
  loginWithEmailAndPassword,
  registerWithEmailAndPassword,
  requestPasswordReset,
  resendVerificationEmail,
} from '../firebase';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
  onSuccess: (user: User) => void;
  notify: (message: string, type?: 'success' | 'warning' | 'error' | 'info') => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onSuccess,
  notify,
}) => {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [resendingVerification, setResendingVerification] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);

    try {
      if (mode === 'forgot') {
        if (!email.trim() || !email.includes('@')) {
          setError('يرجى إدخال بريد إلكتروني صالح.');
          return;
        }
        await requestPasswordReset(email.trim());
        setInfo('تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك الإلكتروني بنجاح.');
        notify('تم إرسال رابط إعادة تعيين كلمة المرور', 'success');
        return;
      }

      if (mode === 'register') {
        if (password.length < 6) {
          setError('كلمة المرور يجب أن لا تقل عن 6 أحرف أو أرقام.');
          return;
        }
        if (password !== confirmPassword) {
          setError('كلمة المرور وتأكيدها غير متطابقين.');
          return;
        }
        const { user, verificationSent } = await registerWithEmailAndPassword(email, password);
        setInfo(
          verificationSent
            ? 'تم إنشاء الحساب بنجاح وإرسال رابط تأكيد البريد الإلكتروني. يرجى تأكيد بريدك قبل تسجيل الدخول.'
            : 'تم إنشاء الحساب بنجاح.'
        );
        notify('تم إنشاء الحساب، تفقد بريدك الإلكتروني للتأكيد', 'info');
        setMode('login');
        return;
      }

      if (mode === 'login') {
        const user = await loginWithEmailAndPassword(email, password);
        if (!user.emailVerified) {
          setError('يرجى تأكيد بريدك الإلكتروني أولاً عبر الرابط المرسل إلى صندوق الوارد.');
          notify('البريد الإلكتروني لم يتم تأكيده بعد', 'warning');
          return;
        }
        notify(`مرحباً بك (${user.email})`, 'success');
        onSuccess(user);
        onClose();
      }
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      let msg = 'حدث خطأ أثناء المصادقة.';
      if (code === 'auth/email-already-in-use') {
        msg = 'هذا البريد الإلكتروني مسجل بالفعل. يمكنك تسجيل الدخول مباشرة.';
      } else if (code === 'auth/wrong-password' || code === 'auth/invalid-credential' || code === 'auth/user-not-found') {
        msg = 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
      } else if (code === 'auth/too-many-requests') {
        msg = 'تم حظر المحاولات مؤقتاً بسبب تكرار المحاولات الخاطئة. يرجى الانتظار بضع دقائق.';
      } else if (code === 'auth/invalid-email') {
        msg = 'صيغة البريد الإلكتروني غير صحيحة.';
      } else if (err instanceof Error) {
        msg = err.message;
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResendingVerification(true);
    try {
      await resendVerificationEmail();
      notify('تمت إعادة إرسال رابط تأكيد البريد الإلكتروني بنجاح', 'success');
      setInfo('تم إرسال رابط التحقق مجدداً إلى بريدك.');
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'تعذر إعادة إرسال الرابط', 'error');
    } finally {
      setResendingVerification(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 no-print"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-sm max-h-[92vh] flex flex-col overflow-hidden shadow-2xl"
      >
        {/* Header */}
        <div className="shrink-0 px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 bg-slate-50 dark:bg-slate-950">
          <div className="flex items-center gap-2 min-w-0">
            <UserCheck className="w-4 h-4 text-sky-500 shrink-0" />
            <h3 className="text-sm font-black text-slate-900 dark:text-slate-100 truncate">
              {mode === 'login'
                ? 'تسجيل الدخول بالبريد'
                : mode === 'register'
                ? 'إنشاء حساب جديد وتأكيد البريد'
                : 'استعادة كلمة المرور'}
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

        {/* Form Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
          {/* Mode Switcher */}
          {mode !== 'forgot' && (
            <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError(null);
                  setInfo(null);
                }}
                className={`py-2 px-3 rounded-lg text-xs font-black transition-all ${
                  mode === 'login'
                    ? 'bg-sky-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                تسجيل الدخول
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setError(null);
                  setInfo(null);
                }}
                className={`py-2 px-3 rounded-lg text-xs font-black transition-all ${
                  mode === 'register'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                حساب جديد
              </button>
            </div>
          )}

          {currentUser && !currentUser.emailVerified && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 space-y-2 text-xs text-amber-900 dark:text-amber-200">
              <div className="font-bold flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                <span>بريدك الإلكتروني بحاجة لتأكيد:</span>
              </div>
              <div className="text-[11px] font-mono break-all">{currentUser.email}</div>
              <button
                type="button"
                disabled={resendingVerification}
                onClick={handleResend}
                className="w-full py-1.5 px-3 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs flex items-center justify-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${resendingVerification ? 'animate-spin' : ''}`} />
                <span>إعادة إرسال رابط التحقق</span>
              </button>
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
                  placeholder="doctor@alssaedy.com"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 pl-3 pr-9 py-2.5 text-xs font-bold text-slate-900 dark:text-slate-100 font-mono"
                />
                <Mail className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
              </div>
            </div>

            {mode !== 'forgot' && (
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  كلمة المرور
                </label>
                <div className="relative">
                  <input
                    type="password"
                    required
                    dir="ltr"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="6 أحرف أو أرقام على الأقل"
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 pl-3 pr-9 py-2.5 text-xs font-bold text-slate-900 dark:text-slate-100 font-mono"
                  />
                  <Lock className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                </div>
              </div>
            )}

            {mode === 'register' && (
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  تأكيد كلمة المرور
                </label>
                <div className="relative">
                  <input
                    type="password"
                    required
                    dir="ltr"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="أعد إدخال كلمة المرور"
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 pl-3 pr-9 py-2.5 text-xs font-bold text-slate-900 dark:text-slate-100 font-mono"
                  />
                  <KeyRound className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                </div>
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-2.5 text-[11px] font-bold text-rose-600 dark:text-rose-300 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {info && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{info}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className={`w-full py-2.5 px-4 rounded-xl disabled:opacity-50 text-white text-xs font-black flex items-center justify-center gap-2 shadow-sm transition-colors ${
                mode === 'register'
                  ? 'bg-emerald-600 hover:bg-emerald-500'
                  : 'bg-sky-600 hover:bg-sky-500'
              }`}
            >
              {loading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              <span>
                {loading
                  ? 'جاري التنفيذ...'
                  : mode === 'login'
                  ? 'تسجيل الدخول'
                  : mode === 'register'
                  ? 'إنشاء الحساب وإرسال التحقق'
                  : 'إرسال رابط الاستعادة'}
              </span>
            </button>
          </form>

          {/* Links for Forgot Password & Back */}
          <div className="pt-2 flex items-center justify-between text-[11px] font-bold text-slate-500 dark:text-slate-400">
            {mode === 'login' ? (
              <button
                type="button"
                onClick={() => {
                  setMode('forgot');
                  setError(null);
                  setInfo(null);
                }}
                className="hover:text-sky-600 dark:hover:text-sky-400"
              >
                نسيت كلمة المرور؟
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError(null);
                  setInfo(null);
                }}
                className="hover:text-sky-600 dark:hover:text-sky-400"
              >
                العودة لتسجيل الدخول
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
