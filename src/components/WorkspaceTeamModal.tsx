import React, { useEffect, useState } from 'react';
import {
  ArrowUpCircle,
  Building2,
  Check,
  CheckCircle2,
  Copy,
  Crown,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Mail,
  Plus,
  RefreshCw,
  Save,
  Shield,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import {
  AIProviderConfig,
  DEFAULT_AI_CONFIG,
  DEFAULT_ROLE_PERMISSIONS,
  WorkspaceMember,
  WorkspacePermissions,
  WorkspaceRole,
} from '../types/clinic';
import {
  RegisteredClinicSummary,
  addWorkspaceMemberInCloud,
  auth,
  deleteClinicByDeveloper,
  fetchRegisteredSystemDirectory,
  isSuperAdminEmail,
  isValidRealEmail,
  loadLocalWorkspaceMembers,
  removeWorkspaceMemberFromCloud,
  subscribeToWorkspaceMembers,
  updateClinicAiConfigByDeveloper,
  updateWorkspaceMemberRoleInCloud,
} from '../firebase';
import {
  AI_TTS_MODELS,
  DIRECT_DATA_ENTRY_MODELS,
  GEMINI_CANDIDATE_MODELS,
  GROQ_TEXT_MODELS,
  GROQ_VISION_MODELS,
  GROQ_WHISPER_MODELS,
  OPENROUTER_MODELS,
  formatModelDisplayLabel,
  loadAIProviderConfig,
} from '../utils/aiClient';

export interface WorkspaceTeamPanelProps {
  workspaceId: string;
  ownerUid: string;
  isOwner?: boolean;
  currentRole?: WorkspaceRole;
  members?: WorkspaceMember[];
  notify: (message: string, type?: 'success' | 'warning' | 'error' | 'info') => void;
  ownerEmail?: string | null;
  doctorName?: string | null;
  clinicName?: string | null;
}

export interface WorkspaceTeamModalProps extends WorkspaceTeamPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ROLES_INFO: Record<
  WorkspaceRole,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  owner: {
    label: 'مالك / مدير',
    icon: Crown,
  },
  doctor: {
    label: 'طبيب أسنان',
    icon: Shield,
  },
  accountant: {
    label: 'محاسب',
    icon: KeyRound,
  },
  receptionist: {
    label: 'موظف استقبال',
    icon: UserCheck,
  },
  viewer: {
    label: 'مشاهد',
    icon: Users,
  },
};

const ALL_ROLES: WorkspaceRole[] = ['accountant', 'doctor', 'receptionist', 'viewer', 'owner'];

export const PERMISSION_LABELS: Record<keyof WorkspacePermissions, string> = {
  canCreateReceipt: 'سند جديد',
  canEditReceipt: 'تعديل السندات',
  canDeleteReceipt: 'حذف السندات',
  canSettleDebt: 'تسوية الديون',
  canManageInventory: 'إدارة المخزون',
  canConsumeInventory: 'خصم المخزون',
  canManageExpenses: 'المصروفات',
  canViewFinances: 'التقارير المالية',
  canManageSettings: 'الإعدادات والأسعار',
  canManageTeam: 'إدارة الفريق',
  canUseAiAssistant: 'المساعد',
};

export const WorkspaceTeamPanel: React.FC<WorkspaceTeamPanelProps> = ({
  workspaceId,
  ownerUid,
  isOwner,
  currentRole,
  members,
  notify,
  ownerEmail,
  doctorName,
  clinicName,
}) => {
  const effectiveWsId = workspaceId || 'alssaedy-clinic';
  const [cloudMembers, setCloudMembers] = useState<WorkspaceMember[]>(() =>
    loadLocalWorkspaceMembers(effectiveWsId)
  );
  const [newEmailOrId, setNewEmailOrId] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [selectedRole, setSelectedRole] = useState<WorkspaceRole>('accountant');
  const [editingMember, setEditingMember] = useState<WorkspaceMember | null>(null);
  const [confirmRemoveEmail, setConfirmRemoveEmail] = useState<string | null>(null);
  const [customPermissions, setCustomPermissions] = useState<WorkspacePermissions>(
    DEFAULT_ROLE_PERMISSIONS.accountant
  );
  const [loading, setLoading] = useState(false);
  const [registeredClinics, setRegisteredClinics] = useState<RegisteredClinicSummary[]>([]);
  const [totalRegisteredAccountsCount, setTotalRegisteredAccountsCount] = useState<number>(1);
  const [directoryLoading, setDirectoryLoading] = useState<boolean>(false);
  const [showClinicsList, setShowClinicsList] = useState<boolean>(true);
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [busyClinicId, setBusyClinicId] = useState<string | null>(null);
  const [confirmDeleteClinicId, setConfirmDeleteClinicId] = useState<string | null>(null);
  const [editingAiClinicId, setEditingAiClinicId] = useState<string | null>(null);
  const [clinicAiDraft, setClinicAiDraft] = useState<AIProviderConfig>(() => loadAIProviderConfig());
  const [showInlineKeys, setShowInlineKeys] = useState<boolean>(false);

  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(() => auth.currentUser?.email || null);

  useEffect(() => {
    const unsubAuth = auth.onAuthStateChanged((user) => {
      setCurrentUserEmail(user?.email || null);
    });
    return () => unsubAuth();
  }, []);

  const effectiveIsOwner = isOwner !== undefined ? isOwner : !currentRole || currentRole === 'owner';

  const isRealCurrentUserEmail = Boolean(
    currentUserEmail &&
      currentUserEmail.includes('@') &&
      !currentUserEmail.endsWith('@clinic.alssaedic.local')
  );

  // Authoritative clinic owner email resolution:
  // If the signed-in user is the clinic owner with a real Google/email account, show their actual email first
  const effectiveOwnerEmail =
    (effectiveIsOwner && isRealCurrentUserEmail ? currentUserEmail : null) ||
    (ownerEmail && ownerEmail.includes('@') ? ownerEmail : null) ||
    localStorage.getItem(`docai_owner_email_${effectiveWsId}`) ||
    (currentUserEmail && currentUserEmail.includes('@') ? currentUserEmail : null) ||
    (effectiveWsId === 'alssaedy-clinic' ? 'alssaedy50@gmail.com' : 'owner@clinic.local');

  // Cache resolved owner email locally for subsequent renders
  useEffect(() => {
    if (effectiveOwnerEmail && effectiveOwnerEmail.includes('@')) {
      try {
        localStorage.setItem(`docai_owner_email_${effectiveWsId}`, effectiveOwnerEmail);
      } catch {
        // ignore
      }
    }
  }, [effectiveOwnerEmail, effectiveWsId]);

  const isCurrentUserTheOwner = Boolean(
    (currentUserEmail &&
      effectiveOwnerEmail &&
      currentUserEmail.toLowerCase() === effectiveOwnerEmail.toLowerCase()) ||
      (effectiveIsOwner && currentUserEmail?.endsWith('@clinic.alssaedic.local'))
  );

  const effectiveOwnerDoctorName =
    doctorName ||
    auth.currentUser?.displayName ||
    (effectiveWsId === 'alssaedy-clinic' ? 'د. صلاح الدين السعيدي' : 'طبيب ومسؤول العيادة');

  const effectiveClinicTitle =
    clinicName ||
    (effectiveWsId === 'alssaedy-clinic'
      ? 'عيادة السعيدي لطب وجراحة الفم والأسنان'
      : 'عيادة طب وجراحة الفم والأسنان');

  const handleCopyOwnerEmail = () => {
    if (!effectiveOwnerEmail) return;
    navigator.clipboard
      .writeText(effectiveOwnerEmail)
      .then(() => {
        setCopiedEmail(true);
        notify('تم نسخ البريد الإلكتروني لصاحب العيادة بنجاح', 'success');
        setTimeout(() => setCopiedEmail(false), 2000);
      })
      .catch(() => {});
  };

  const isDeveloperSuperAdmin = Boolean(isSuperAdminEmail(currentUserEmail));

  const refreshSystemDirectory = async () => {
    if (!isDeveloperSuperAdmin) return;
    setDirectoryLoading(true);
    const defaultClinicEntry: RegisteredClinicSummary = {
      id: ownerUid || effectiveWsId,
      clinicAr: effectiveClinicTitle,
      doctorAr: effectiveOwnerDoctorName,
      ownerEmail: effectiveOwnerEmail || undefined,
      phones: '',
      address: '',
      updatedAt: new Date().toISOString().slice(0, 10),
      isDeveloperClinic: true,
      aiConfig: loadAIProviderConfig(),
    };
    try {
      const dir = await fetchRegisteredSystemDirectory(effectiveWsId, effectiveOwnerEmail);
      const list = dir.clinics.length > 0 ? dir.clinics : [defaultClinicEntry];
      setRegisteredClinics(list);
      setTotalRegisteredAccountsCount(
        Math.max(list.length, dir.accounts.length, cloudMembers.length + 1, 1)
      );
    } catch {
      setRegisteredClinics([defaultClinicEntry]);
      setTotalRegisteredAccountsCount(Math.max(cloudMembers.length + 1, 1));
    } finally {
      setDirectoryLoading(false);
    }
  };

  const handleOpenClinicAiEditor = (clinic: RegisteredClinicSummary) => {
    if (editingAiClinicId === clinic.id) {
      setEditingAiClinicId(null);
      return;
    }
    setEditingAiClinicId(clinic.id);
    setClinicAiDraft(
      clinic.aiConfig
        ? {
            ...DEFAULT_AI_CONFIG,
            ...clinic.aiConfig,
          }
        : loadAIProviderConfig()
    );
  };

  const handleSaveClinicAiKeys = async (clinic: RegisteredClinicSummary) => {
    setBusyClinicId(clinic.id);
    try {
      const savedConfig = await updateClinicAiConfigByDeveloper(clinic, clinicAiDraft);
      setRegisteredClinics((prev) =>
        prev.map((item) => (item.id === clinic.id ? { ...item, aiConfig: savedConfig } : item))
      );
      setEditingAiClinicId(null);
      notify(`تم حفظ وتفعيل مفاتيح الذكاء الاصطناعي لعيادة (${clinic.clinicAr}) سحابياً بنجاح ✅`, 'success');
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'تعذر حفظ مفاتيح الذكاء الاصطناعي للعيادة', 'error');
    } finally {
      setBusyClinicId(null);
    }
  };

  const handleDeleteRegisteredClinic = async (clinic: RegisteredClinicSummary) => {
    setBusyClinicId(clinic.id);
    try {
      await deleteClinicByDeveloper(clinic);
      setRegisteredClinics((prev) => prev.filter((item) => item.id !== clinic.id));
      setConfirmDeleteClinicId(null);
      notify(`تم حذف العيادة (${clinic.clinicAr}) وبياناتها من السحابة نهائياً`, 'info');
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'تعذر حذف العيادة', 'error');
    } finally {
      setBusyClinicId(null);
    }
  };

  useEffect(() => {
    const unsub = subscribeToWorkspaceMembers(effectiveWsId, (list) => {
      setCloudMembers(list);
    });
    if (isDeveloperSuperAdmin) {
      refreshSystemDirectory();
    }
    return () => {
      unsub();
    };
  }, [effectiveWsId, isDeveloperSuperAdmin, currentUserEmail, effectiveOwnerEmail]);

  const displayMembers = members && members.length > 0 ? members : cloudMembers;

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    const rawEmail = newEmailOrId.trim().toLowerCase();
    if (!rawEmail || !isValidRealEmail(rawEmail)) {
      notify('يرجى إدخال بريد إلكتروني حقيقي وصحيح (مثال: accountant@gmail.com)', 'warning');
      return;
    }

    setLoading(true);
    try {
      const added = await addWorkspaceMemberInCloud(
        effectiveWsId,
        ownerUid,
        rawEmail,
        selectedRole,
        DEFAULT_ROLE_PERMISSIONS[selectedRole],
        newDisplayName.trim() || undefined
      );
      setCloudMembers(loadLocalWorkspaceMembers(effectiveWsId));
      notify(
        `تمت إضافة (${added.displayName || added.email}) بصفة ${ROLES_INFO[selectedRole].label}`,
        'success'
      );
      setNewEmailOrId('');
      setNewDisplayName('');
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'تعذر إضافة الحساب', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickRoleUpgrade = async (member: WorkspaceMember, nextRole: WorkspaceRole) => {
    if (member.role === nextRole) return;
    setLoading(true);
    try {
      await updateWorkspaceMemberRoleInCloud(
        effectiveWsId,
        member.email,
        nextRole,
        DEFAULT_ROLE_PERMISSIONS[nextRole],
        member.displayName
      );
      setCloudMembers(loadLocalWorkspaceMembers(effectiveWsId));
      notify(
        `تمت ترقية وتحديث حساب (${member.displayName || member.email}) إلى: ${ROLES_INFO[nextRole].label}`,
        'success'
      );
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'تعذر ترقية الحساب', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveEditedPermissions = async () => {
    if (!editingMember) return;
    setLoading(true);
    try {
      await updateWorkspaceMemberRoleInCloud(
        effectiveWsId,
        editingMember.email,
        editingMember.role,
        customPermissions,
        editingMember.displayName
      );
      setCloudMembers(loadLocalWorkspaceMembers(effectiveWsId));
      notify(
        `تم حفظ ترقية وصلاحيات (${editingMember.displayName || editingMember.email}) بنجاح`,
        'success'
      );
      setEditingMember(null);
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'تعذر تحديث الصلاحيات', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveMember = async (memberEmail: string) => {
    setLoading(true);
    try {
      await removeWorkspaceMemberFromCloud(effectiveWsId, memberEmail);
      setCloudMembers(loadLocalWorkspaceMembers(effectiveWsId));
      setConfirmRemoveEmail(null);
      notify(`تمت إزالة الحساب (${memberEmail})`, 'info');
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'تعذر إزالة الحساب', 'error');
    } finally {
      setLoading(false);
    }
  };

  const formatVisibleEmail = (email: string) => {
    if (email.endsWith('@clinic.alssaedic.local')) {
      return email.replace('@clinic.alssaedic.local', '');
    }
    return email;
  };

  return (
    <div className="space-y-4">
      {/* Live System Clinics & Accounts Counter Card - DEVELOPER ONLY */}
      {isDeveloperSuperAdmin && (
        <section className="rounded-xl border border-amber-500/40 bg-slate-50 dark:bg-slate-950 p-3.5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <div>
                <h4 className="text-xs font-black text-slate-900 dark:text-slate-100 flex items-center gap-2 flex-wrap">
                  <span>إدارة العيادات</span>
                  <span className="text-[10px] bg-amber-500/20 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded font-mono font-normal">
                    للمطور
                  </span>
                </h4>
              </div>
            </div>
            <button
              type="button"
              disabled={directoryLoading}
              onClick={refreshSystemDirectory}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-[11px] font-bold text-slate-700 dark:text-slate-300 hover:border-amber-500/40"
            >
              <RefreshCw className={`w-3 h-3 ${directoryLoading ? 'animate-spin text-amber-500' : ''}`} />
              <span>تحديث</span>
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-center">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5">
              <div className="text-[11px] font-bold text-slate-500">العيادات المسجلة</div>
              <div className="text-base font-black text-emerald-600 dark:text-emerald-400 font-mono mt-0.5">
                {Math.max(registeredClinics.length, 1)}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5">
              <div className="text-[11px] font-bold text-slate-500">إجمالي الحسابات</div>
              <div className="text-base font-black text-sky-600 dark:text-sky-400 font-mono mt-0.5">
                {Math.max(totalRegisteredAccountsCount, displayMembers.length + 1)}
              </div>
            </div>

            <div className="col-span-2 sm:col-span-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 flex flex-col justify-center">
              <button
                type="button"
                onClick={() => setShowClinicsList((p) => !p)}
                className="text-xs font-black text-amber-600 dark:text-amber-400 hover:underline"
              >
                {showClinicsList ? 'إخفاء العيادات ▲' : 'عرض العيادات ▼'}
              </button>
            </div>
          </div>

          {showClinicsList && (
            <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              {registeredClinics.map((c, idx) => {
                const hasCustomAiKeys = Boolean(
                  c.aiConfig?.geminiApiKey?.trim() ||
                    c.aiConfig?.groqApiKey?.trim() ||
                    c.aiConfig?.openrouterApiKey?.trim()
                );
                const isPrimaryDevClinic = Boolean(
                  c.isDeveloperClinic ||
                    c.id === auth.currentUser?.uid ||
                    c.id === 'alssaedy-clinic'
                );
                const isBusy = busyClinicId === c.id;
                const isEditingAi = editingAiClinicId === c.id;

                return (
                  <div
                    key={c.id}
                    className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2.5 text-xs"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="space-y-0.5 min-w-0">
                        <div className="font-black text-slate-900 dark:text-slate-100 flex items-center gap-1.5 flex-wrap">
                          <span>
                            {idx + 1}. {c.clinicAr}
                          </span>
                          {hasCustomAiKeys && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                              <Sparkles className="w-2.5 h-2.5" />
                              <span>مفعل ✓</span>
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] font-bold text-slate-500">
                          {c.doctorAr} {c.address ? `— ${c.address}` : ''}
                        </div>
                        {c.ownerEmail && (
                          <div className="text-[10px] font-mono text-amber-600 dark:text-amber-400 font-bold" dir="ltr">
                            {c.ownerEmail}
                          </div>
                        )}
                      </div>

                      <div className="text-[11px] font-mono text-slate-500 text-left" dir="ltr">
                        {c.phones || c.updatedAt}
                      </div>
                    </div>

                    {/* Developer Action Bar for this Clinic */}
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleOpenClinicAiEditor(c)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${
                          isEditingAi
                            ? 'bg-sky-600 text-white'
                            : 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/30 hover:bg-sky-600 hover:text-white'
                        }`}
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>{isEditingAi ? 'إغلاق ▲' : 'مفاتيح الذكاء'}</span>
                      </button>

                      {!isPrimaryDevClinic ? (
                        confirmDeleteClinicId === c.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleDeleteRegisteredClinic(c)}
                              className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-black"
                            >
                              تأكيد الحذف
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => setConfirmDeleteClinicId(null)}
                              className="px-2 py-1 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[10px] font-bold"
                            >
                              إلغاء
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => setConfirmDeleteClinicId(c.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-600 hover:text-white text-[11px] font-bold transition-colors"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>حذف</span>
                          </button>
                        )
                      ) : (
                        <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                          <Crown className="w-3 h-3" />
                          <span>عيادة المطور</span>
                        </span>
                      )}
                    </div>

                    {/* Inline Developer AI Keys Editor for this specific clinic */}
                    {isEditingAi && (
                      <div className="mt-2 pt-3 border-t border-sky-500/30 bg-sky-500/5 dark:bg-slate-950/90 rounded-xl p-3 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-black text-sky-700 dark:text-sky-300 text-xs flex items-center gap-1.5">
                            <KeyRound className="w-3.5 h-3.5" />
                            <span>مفاتيح الذكاء: {c.clinicAr}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setShowInlineKeys((s) => !s)}
                            className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                          >
                            {showInlineKeys ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            <span>{showInlineKeys ? 'إخفاء المفاتيح' : 'إظهار المفاتيح'}</span>
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <div>
                            <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                              مفتاح Google Gemini API Key
                            </label>
                            <input
                              type={showInlineKeys ? 'text' : 'password'}
                              dir="ltr"
                              value={clinicAiDraft.geminiApiKey}
                              onChange={(e) =>
                                setClinicAiDraft((prev) => ({ ...prev, geminiApiKey: e.target.value }))
                              }
                              placeholder="AIzaSy..."
                              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-mono text-slate-900 dark:text-slate-100"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                              نموذج Gemini الافتراضي
                            </label>
                            <select
                              value={clinicAiDraft.geminiModel}
                              onChange={(e) =>
                                setClinicAiDraft((prev) => ({ ...prev, geminiModel: e.target.value }))
                              }
                              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-bold text-slate-900 dark:text-slate-100"
                            >
                              {GEMINI_CANDIDATE_MODELS.map((m) => (
                                <option key={m} value={m}>
                                  {formatModelDisplayLabel(m)}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                              مفتاح Groq Cloud API Key
                            </label>
                            <input
                              type={showInlineKeys ? 'text' : 'password'}
                              dir="ltr"
                              value={clinicAiDraft.groqApiKey}
                              onChange={(e) =>
                                setClinicAiDraft((prev) => ({ ...prev, groqApiKey: e.target.value }))
                              }
                              placeholder="gsk_..."
                              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-mono text-slate-900 dark:text-slate-100"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                              نموذج Groq للنصوص
                            </label>
                            <select
                              value={clinicAiDraft.groqTextModel}
                              onChange={(e) =>
                                setClinicAiDraft((prev) => ({ ...prev, groqTextModel: e.target.value }))
                              }
                              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-bold text-slate-900 dark:text-slate-100"
                            >
                              {GROQ_TEXT_MODELS.map((m) => (
                                <option key={m} value={m}>
                                  {formatModelDisplayLabel(m)}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                              مفتاح OpenRouter API Key
                            </label>
                            <input
                              type={showInlineKeys ? 'text' : 'password'}
                              dir="ltr"
                              value={clinicAiDraft.openrouterApiKey}
                              onChange={(e) =>
                                setClinicAiDraft((prev) => ({ ...prev, openrouterApiKey: e.target.value }))
                              }
                              placeholder="sk-or-v1-..."
                              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-mono text-slate-900 dark:text-slate-100"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                              نموذج OpenRouter الافتراضي
                            </label>
                            <select
                              value={clinicAiDraft.openrouterModel}
                              onChange={(e) =>
                                setClinicAiDraft((prev) => ({ ...prev, openrouterModel: e.target.value }))
                              }
                              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-bold text-slate-900 dark:text-slate-100"
                            >
                              {OPENROUTER_MODELS.map((m) => (
                                <option key={m} value={m}>
                                  {formatModelDisplayLabel(m)}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                              نموذج الرؤية (Groq Vision)
                            </label>
                            <select
                              value={clinicAiDraft.groqVisionModel}
                              onChange={(e) =>
                                setClinicAiDraft((prev) => ({ ...prev, groqVisionModel: e.target.value }))
                              }
                              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-bold text-slate-900 dark:text-slate-100"
                            >
                              {GROQ_VISION_MODELS.map((m) => (
                                <option key={m} value={m}>
                                  {formatModelDisplayLabel(m)}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                              محرك التسجيل الصوتي (Voice STT)
                            </label>
                            <select
                              value={clinicAiDraft.sttEngine}
                              onChange={(e) =>
                                setClinicAiDraft((prev) => ({
                                  ...prev,
                                  sttEngine: e.target.value === 'groq' ? 'groq' : 'browser',
                                }))
                              }
                              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-bold text-slate-900 dark:text-slate-100"
                            >
                              <option value="browser">المتصفح المباشر (Web Speech)</option>
                              <option value="groq">Groq Whisper ({GROQ_WHISPER_MODELS[0]})</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                              نموذج القراءة الصوتية (TTS)
                            </label>
                            <select
                              value={clinicAiDraft.ttsModel || 'playai-tts-arabic'}
                              onChange={(e) =>
                                setClinicAiDraft((prev) => ({
                                  ...prev,
                                  ttsModel: e.target.value,
                                }))
                              }
                              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-bold text-slate-900 dark:text-slate-100"
                            >
                              {AI_TTS_MODELS.map((m) => (
                                <option key={m} value={m}>
                                  {formatModelDisplayLabel(m)}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="sm:col-span-2">
                            <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                              نموذج الإدخال المباشر للسندات والمخزون
                            </label>
                            <select
                              value={clinicAiDraft.dataEntryModel || 'llama-3.3-70b-versatile'}
                              onChange={(e) =>
                                setClinicAiDraft((prev) => ({
                                  ...prev,
                                  dataEntryModel: e.target.value,
                                }))
                              }
                              className="w-full rounded-lg border border-emerald-500/40 bg-emerald-500/5 dark:bg-slate-900 px-2.5 py-1.5 text-xs font-bold text-slate-900 dark:text-slate-100"
                            >
                              {DIRECT_DATA_ENTRY_MODELS.map((m) => (
                                <option key={m} value={m}>
                                  {formatModelDisplayLabel(m)}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => setEditingAiClinicId(null)}
                            className="px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-[11px]"
                          >
                            إلغاء
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleSaveClinicAiKeys(c)}
                            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-black text-[11px] shadow-xs transition-colors"
                          >
                            <Save className="w-3.5 h-3.5" />
                            <span>حفظ المفاتيح</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Primary Clinic Owner Card */}
      <section className="rounded-2xl border-2 border-amber-500/40 bg-slate-50 dark:bg-slate-950 p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center shrink-0">
              <Crown className="w-6 h-6 stroke-[2.5]" />
            </div>
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-black text-slate-900 dark:text-slate-100 truncate">
                  {effectiveOwnerDoctorName}
                </h3>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                  <ShieldCheck className="w-3 h-3" />
                  <span>مدير العيادة</span>
                </span>
              </div>

              <div className="text-xs font-bold text-slate-600 dark:text-slate-400 truncate">
                {effectiveClinicTitle}
              </div>

              <div className="flex items-center gap-2 pt-0.5 flex-wrap">
                <div
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-mono font-black text-slate-900 dark:text-slate-100"
                  dir="ltr"
                >
                  <Mail className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <span>{effectiveOwnerEmail}</span>
                </div>

                <button
                  type="button"
                  onClick={handleCopyOwnerEmail}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-[10px] font-bold text-slate-700 dark:text-slate-300 hover:text-amber-600 dark:hover:text-amber-400 hover:border-amber-500/40 transition-colors"
                  title="نسخ البريد الإلكتروني"
                >
                  <Copy className="w-3 h-3" />
                  <span>{copiedEmail ? 'تم النسخ!' : 'نسخ'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Add Member Form */}
      {effectiveIsOwner ? (
        <section className="rounded-xl border border-sky-500/40 bg-slate-50 dark:bg-slate-950 p-3.5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-sky-600 dark:text-sky-400" />
              <h4 className="text-xs font-black text-slate-900 dark:text-slate-100">
                إضافة عضو
              </h4>
            </div>
          </div>

          <form onSubmit={handleAddMember} className="space-y-2.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                  البريد الإلكتروني
                </label>
                <div className="relative">
                  <input
                    type="email"
                    required
                    dir="ltr"
                    value={newEmailOrId}
                    onChange={(e) => setNewEmailOrId(e.target.value)}
                    placeholder="accountant@gmail.com"
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 pl-3 pr-9 py-2 text-xs font-bold text-slate-900 dark:text-slate-100 font-mono"
                  />
                  <Mail className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                  الاسم
                </label>
                <input
                  type="text"
                  value={newDisplayName}
                  onChange={(e) => setNewDisplayName(e.target.value)}
                  placeholder="أحمد"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-bold text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                الدور:
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                {ALL_ROLES.map((r) => {
                  const Icon = ROLES_INFO[r].icon;
                  return (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setSelectedRole(r)}
                      className={`p-2 rounded-lg border text-center transition-all flex items-center justify-center gap-1.5 ${
                        selectedRole === r
                          ? 'bg-sky-600 border-sky-500 text-white shadow-xs'
                          : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-sky-500/40'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5 shrink-0" />
                      <span className="text-xs font-bold">{ROLES_INFO[r].label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !newEmailOrId.trim()}
              className="w-full py-2.5 px-3 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-black flex items-center justify-center gap-1.5 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة عضو</span>
            </button>
          </form>
        </section>
      ) : (
        <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs text-slate-600 dark:text-slate-400 font-bold">
          أنت عضو في مساحة العمل هذه.
        </div>
      )}

      {/* Additional Members List */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-black text-slate-700 dark:text-slate-300 px-1">
          <span>أعضاء الفريق ({displayMembers.length})</span>
        </div>

        {displayMembers.length === 0 ? (
          <div className="p-4 text-center text-xs text-slate-500 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 font-bold">
            لا يوجد أعضاء إضافيون.
          </div>
        ) : (
          displayMembers.map((m) => {
            const RoleIcon = ROLES_INFO[m.role]?.icon || Users;
            return (
              <div
                key={m.uid || m.email}
                className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950"
              >
                <div className="flex items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-sky-600 text-white flex items-center justify-center shrink-0">
                      <RoleIcon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      {m.displayName && (
                        <div className="text-xs font-black text-slate-900 dark:text-slate-100 truncate">
                          {m.displayName}
                        </div>
                      )}
                      <div
                        className="text-xs font-bold text-slate-700 dark:text-slate-300 font-mono truncate"
                        dir="ltr"
                      >
                        {formatVisibleEmail(m.email)}
                      </div>
                      <div className="text-[10px] font-bold text-sky-600 dark:text-sky-400 mt-0.5">
                        {ROLES_INFO[m.role]?.label || m.role}
                      </div>
                    </div>
                  </div>

                  {effectiveIsOwner && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingMember(m);
                          setCustomPermissions({
                            ...(DEFAULT_ROLE_PERMISSIONS[m.role] || DEFAULT_ROLE_PERMISSIONS.viewer),
                            ...m.permissions,
                          });
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold rounded-lg border border-sky-500/40 bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 hover:bg-sky-600 hover:text-white transition-colors"
                      >
                        <ArrowUpCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>الصلاحيات</span>
                      </button>

                      {confirmRemoveEmail === m.email ? (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={loading}
                            onClick={() => handleRemoveMember(m.email)}
                            className="px-2 py-1 rounded-lg bg-rose-600 text-white text-[10px] font-bold"
                          >
                            تأكيد
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmRemoveEmail(null)}
                            className="px-2 py-1 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[10px] font-bold"
                          >
                            إلغاء
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmRemoveEmail(m.email)}
                          className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-rose-500 hover:bg-rose-600 hover:text-white transition-colors"
                          title="حذف"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Permissions & Role Upgrade Editor Sub-Modal */}
      {editingMember && (
        <div className="fixed inset-0 z-60 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md p-4 space-y-4 shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="min-w-0">
                <h4 className="text-xs sm:text-sm font-black text-slate-900 dark:text-slate-100 truncate">
                  ترقية وصلاحيات: {editingMember.displayName || formatVisibleEmail(editingMember.email)}
                </h4>
                <div className="text-[11px] text-sky-600 font-bold mt-0.5">
                  الدور المحدد: {ROLES_INFO[editingMember.role]?.label}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingMember(null)}
                className="p-1 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Role Switch (Includes all 5 roles) */}
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-1">
              {ALL_ROLES.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => {
                    setEditingMember((prev) => (prev ? { ...prev, role: r } : null));
                    setCustomPermissions(DEFAULT_ROLE_PERMISSIONS[r]);
                  }}
                  className={`p-1.5 text-[11px] font-bold rounded-lg border text-center ${
                    editingMember.role === r
                      ? 'bg-sky-600 text-white border-sky-500'
                      : 'bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800'
                  }`}
                >
                  {ROLES_INFO[r].label}
                </button>
              ))}
            </div>

            {/* Permissions Checklist */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {(Object.keys(PERMISSION_LABELS) as Array<keyof WorkspacePermissions>).map((key) => (
                <label
                  key={key}
                  className="flex items-center justify-between p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-800/60 cursor-pointer"
                >
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    {PERMISSION_LABELS[key]}
                  </span>
                  <input
                    type="checkbox"
                    checked={Boolean(customPermissions[key])}
                    onChange={(e) =>
                      setCustomPermissions((prev) => ({
                        ...prev,
                        [key]: e.target.checked,
                      }))
                    }
                    className="w-4 h-4 rounded text-sky-600 focus:ring-sky-500 border-slate-300 dark:border-slate-700"
                  />
                </label>
              ))}
            </div>

            <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                disabled={loading}
                onClick={handleSaveEditedPermissions}
                className="w-full py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-black flex items-center justify-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                <span>حفظ</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const WorkspaceTeamModal: React.FC<WorkspaceTeamModalProps> = ({
  isOpen,
  onClose,
  ...panelProps
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 no-print"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden shadow-2xl"
      >
        {/* Header */}
        <div className="shrink-0 px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 bg-slate-50 dark:bg-slate-950">
          <div className="flex items-center gap-2 min-w-0">
            <Users className="w-4 h-4 text-sky-500 shrink-0" />
            <h3 className="text-sm font-black text-slate-900 dark:text-slate-100 truncate">
              الفريق
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

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          <WorkspaceTeamPanel {...panelProps} />
        </div>
      </div>
    </div>
  );
};
