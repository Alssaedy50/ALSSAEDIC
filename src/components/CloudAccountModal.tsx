import React, { useEffect, useState } from 'react';
import { AlertCircle, ArrowRight, Cloud, Eye, EyeOff, LogIn, LogOut, RefreshCw, ShieldCheck, UserPlus } from 'lucide-react';
import { User } from '../firebase';
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
interface Props {
  isOpen: boolean;
  onClose: () => void;
  isFirstOpenGate?: boolean;
  user: User | null;
  directSession: DirectClinicSession | null;
  defaultClinicName?: string;
  defaultDoctorName?: string;
  isSyncing: boolean;
  onSignInGoogle: () => Promise<boolean>;
  onEmailLogin: (email: string, password: string) => Promise<boolean>;
  onEmailRegister: (email: string, password: string) => Promise<boolean>;
  onResendVerification: () => Promise<void>;
  onRefreshVerification: () => Promise<void>;
  onDirectLogin?: (clinicId: string, password: string, options?: DirectAuthOptions) => Promise<boolean>;
  onSignOut: () => Promise<void>;
  onForceSyncNow: () => Promise<void>;
  receiptsCount: number;
  inventoryCount: number;
  expensesCount: number;
  notify: (message: string, type?: 'success' | 'warning' | 'error' | 'info') => void;
}

export const CloudAccountModal: React.FC<Props> = ({
  isOpen, onClose, isFirstOpenGate = false, user, directSession, isSyncing,
  onSignInGoogle, onEmailLogin, onEmailRegister, onResendVerification, onRefreshVerification, onDirectLogin,
  onSignOut, onForceSyncNow, receiptsCount, inventoryCount, expensesCount, notify,
}) => {
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showLegacy, setShowLegacy] = useState(false);
  const [legacyId, setLegacyId] = useState('');
  const [legacyPassword, setLegacyPassword] = useState('');

  useEffect(() => { if (isOpen) setError(''); }, [isOpen]);
  if (!isOpen) return null;

  const isLegacy = Boolean(user?.email?.endsWith('@clinic.alssaedic.local'));
  const isGoogle = Boolean(user?.providerData?.some((p) => p.providerId === 'google.com'));
  const needsVerification = Boolean(user?.email && !user.emailVerified && !isGoogle && !isLegacy);
  const connected = Boolean(user || directSession);

  const submitEmail = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (!email.trim() || !password) { setError('أدخل البريد الإلكتروني وكلمة المرور.'); return; }
    if (password.length < 6) { setError('كلمة المرور يجب أن تتكون من 6 أحرف على الأقل.'); return; }
    setBusy(true);
    try {
      const ok = tab === 'register'
        ? await onEmailRegister(email.trim(), password)
        : await onEmailLogin(email.trim(), password);
      if (ok) {
        setPassword('');
        if (tab === 'register') {
          notify('تم إنشاء الحساب. افتح رسالة التحقق في بريدك ثم اضغط تحديث حالة التحقق هنا.', 'success');
        } else {
          onClose();
        }
      } else {
        setError('تعذر إكمال العملية. تحقق من البريد وكلمة المرور وحالة الحساب.');
      }
    } finally { setBusy(false); }
  };

  const googleLogin = async () => {
    setBusy(true); setError('');
    try {
      if (await onSignInGoogle()) onClose();
      else setError('تعذر تسجيل الدخول عبر Google. تحقق من تفعيل Google في Firebase وإضافة نطاق الموقع إلى Authorized domains.');
    } finally { setBusy(false); }
  };

  const legacyLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!onDirectLogin) return;
    setBusy(true); setError('');
    try {
      const ok = await onDirectLogin(legacyId.trim(), legacyPassword, { mode: 'login' });
      if (ok) { setLegacyPassword(''); onClose(); }
      else setError('تعذر الدخول بالحساب القديم. تحقق من المعرّف وكلمة المرور.');
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 no-print" onClick={() => { if (!isFirstOpenGate || connected) onClose(); }}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-sm max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
        <div className="shrink-0 px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 bg-slate-50 dark:bg-slate-950">
          <div className="flex items-center gap-2"><Cloud className="w-4 h-4 text-sky-500" /><h3 className="text-sm font-black">الحساب السحابي</h3></div>
          <button type="button" onClick={onClose} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-xs font-bold"><ArrowRight className="w-3.5 h-3.5" />{connected ? 'رجوع' : 'تخطي'}</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {connected ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 space-y-2">
                <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-200 font-black text-sm"><ShieldCheck className="w-5 h-5" />{needsVerification ? 'بانتظار تأكيد البريد' : 'الحساب السحابي نشط'}</div>
                <div dir="ltr" className="text-xs break-all font-mono text-slate-700 dark:text-slate-200">{user?.email || directSession?.clinicId || ''}</div>
                {needsVerification && <div className="space-y-2">
                  <button type="button" onClick={async () => { try { await onResendVerification(); notify('أرسلنا رسالة تحقق جديدة إلى بريدك.', 'success'); } catch { notify('تعذر إرسال رسالة التحقق.', 'error'); } }} className="w-full rounded-lg bg-amber-500 text-white py-2 text-xs font-bold">إعادة إرسال رسالة التحقق</button>
                  <button type="button" onClick={async () => { try { await onRefreshVerification(); } catch (error) { notify(error instanceof Error ? error.message : 'تعذر تحديث حالة الحساب.', 'error'); } }} className="w-full rounded-lg border border-slate-300 dark:border-slate-700 py-2 text-xs font-bold">تم تأكيد البريد — تحديث الحالة</button>
                </div>}
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                {[['السندات', receiptsCount], ['المخزون', inventoryCount], ['المصروفات', expensesCount]].map(([label, count]) => <div key={String(label)} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-2"><div className="text-[11px] text-slate-500 font-bold">{label}</div><div className="text-sm font-black mt-0.5">{count}</div></div>)}
              </div>
              <button type="button" disabled={isSyncing || needsVerification} onClick={onForceSyncNow} className="w-full py-2.5 rounded-xl bg-sky-600 disabled:opacity-50 text-white text-xs font-black flex items-center justify-center gap-2"><RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />{isSyncing ? 'جاري المزامنة...' : 'مزامنة الآن'}</button>
              <button type="button" onClick={onSignOut} className="w-full py-2 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-600 text-xs font-bold flex items-center justify-center gap-2"><LogOut className="w-3.5 h-3.5" />تسجيل الخروج</button>
            </div>
          ) : (
            <div className="space-y-3.5">
              <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <button type="button" onClick={() => { setTab('login'); setError(''); }} className={`py-2 rounded-lg text-xs font-black flex items-center justify-center gap-1.5 ${tab === 'login' ? 'bg-sky-600 text-white' : 'text-slate-500'}`}><LogIn className="w-3.5 h-3.5" />تسجيل الدخول</button>
                <button type="button" onClick={() => { setTab('register'); setError(''); }} className={`py-2 rounded-lg text-xs font-black flex items-center justify-center gap-1.5 ${tab === 'register' ? 'bg-emerald-600 text-white' : 'text-slate-500'}`}><UserPlus className="w-3.5 h-3.5" />حساب جديد</button>
              </div>
              <form onSubmit={submitEmail} className="space-y-3">
                <div><label className="block text-xs font-bold mb-1">البريد الإلكتروني الحقيقي</label><input type="email" required autoComplete="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2.5 text-xs text-left" /></div>
                <div><label className="block text-xs font-bold mb-1">كلمة المرور</label><div className="relative"><input type={showPassword ? 'text' : 'password'} required minLength={6} autoComplete={tab === 'register' ? 'new-password' : 'current-password'} dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 pl-10 pr-3 py-2.5 text-xs text-left" /><button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">{showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button></div></div>
                {error && <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[11px] font-bold text-rose-600 flex items-start gap-2"><AlertCircle className="w-4 h-4 shrink-0" />{error}</div>}
                <button type="submit" disabled={busy} className={`w-full py-2.5 rounded-xl text-white text-xs font-black disabled:opacity-50 ${tab === 'register' ? 'bg-emerald-600' : 'bg-sky-600'}`}>{busy ? 'يرجى الانتظار...' : tab === 'register' ? 'إنشاء الحساب وإرسال التحقق' : 'تسجيل الدخول بالبريد'}</button>
              </form>
              <button type="button" disabled={busy} onClick={() => void googleLogin()} className="w-full py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-black flex items-center justify-center gap-2 disabled:opacity-50"><span className="font-black text-base">G</span> المتابعة باستخدام Google</button>
              {onDirectLogin && <div className="border-t border-slate-200 dark:border-slate-800 pt-3"><button type="button" onClick={() => setShowLegacy(!showLegacy)} className="text-[11px] text-slate-500 underline">لدي حساب قديم بمعرّف العيادة</button>{showLegacy && <form onSubmit={legacyLogin} className="mt-2 space-y-2"><input value={legacyId} onChange={(e) => setLegacyId(e.target.value)} placeholder="معرّف العيادة القديم" className="w-full rounded-lg border bg-transparent px-3 py-2 text-xs" /><input type="password" value={legacyPassword} onChange={(e) => setLegacyPassword(e.target.value)} placeholder="كلمة المرور القديمة" className="w-full rounded-lg border bg-transparent px-3 py-2 text-xs" /><button disabled={busy} className="w-full rounded-lg bg-slate-700 text-white py-2 text-xs font-bold">دخول الحساب القديم</button></form>}</div>}
              <p className="text-[10px] text-slate-500 leading-relaxed">كل حساب جديد ينشئ مساحة عمل مستقلة ويصبح مالكها الرئيسي. يمكنه دعوة أعضاء آخرين وإدارة أدوارهم وصلاحياتهم من إعدادات التطبيق.</p>
            </div>
          )}
          <div className="pt-2"><PWAInstallButton /></div>
        </div>
      </div>
    </div>
  );
};
