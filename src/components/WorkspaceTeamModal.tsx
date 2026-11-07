import React, { useEffect, useState } from 'react';
import {
  ArrowUpCircle,
  Building2,
  Check,
  Crown,
  KeyRound,
  Mail,
  Plus,
  RefreshCw,
  Shield,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import {
  DEFAULT_ROLE_PERMISSIONS,
  WorkspaceMember,
  WorkspacePermissions,
  WorkspaceRole,
} from '../types/clinic';
import {
  RegisteredClinicSummary,
  addWorkspaceMemberInCloud,
  auth,
  fetchRegisteredSystemDirectory,
  isValidRealEmail,
  loadLocalWorkspaceMembers,
  removeWorkspaceMemberFromCloud,
  subscribeToWorkspaceMembers,
  updateWorkspaceMemberRoleInCloud,
} from '../firebase';

export interface WorkspaceTeamPanelProps {
  workspaceId: string;
  ownerUid: string;
  isOwner?: boolean;
  currentRole?: WorkspaceRole;
  members?: WorkspaceMember[];
  notify: (message: string, type?: 'success' | 'warning' | 'error' | 'info') => void;
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
  const [showClinicsList, setShowClinicsList] = useState<boolean>(false);

  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(() => auth.currentUser?.email || null);

  useEffect(() => {
    const unsubAuth = auth.onAuthStateChanged((user) => {
      setCurrentUserEmail(user?.email || null);
    });
    return () => unsubAuth();
  }, []);

  const isDeveloperSuperAdmin = Boolean(
    currentUserEmail &&
    currentUserEmail.toLowerCase() === 'alssaedy50@gmail.com'
  );

  const refreshSystemDirectory = async () => {
    if (!isDeveloperSuperAdmin) return;
    setDirectoryLoading(true);
    try {
      const dir = await fetchRegisteredSystemDirectory(effectiveWsId);
      setRegisteredClinics(dir.clinics);
      setTotalRegisteredAccountsCount(Math.max(1, dir.accounts.length));
    } catch {
      // ignore
    } finally {
      setDirectoryLoading(false);
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
  }, [effectiveWsId, isDeveloperSuperAdmin]);

  const effectiveIsOwner = isOwner !== undefined ? isOwner : !currentRole || currentRole === 'owner';
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
      {/* Live System Clinics & Accounts Counter Card - DEVELOPER ONLY (alssaedy50@gmail.com) */}
      {isDeveloperSuperAdmin && (
        <section className="rounded-xl border border-amber-500/30 dark:border-amber-500/20 bg-amber-500/5 dark:bg-amber-950/20 p-3.5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <div>
                <h4 className="text-xs font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <span>إحصائيات العيادات والحسابات المسجلة في النظام</span>
                  <span className="text-[10px] bg-amber-500/20 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded font-mono font-normal">
                    لوحة المطور فقط
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
                {registeredClinics.length}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5">
              <div className="text-[11px] font-bold text-slate-500">إجمالي الحسابات</div>
              <div className="text-base font-black text-sky-600 dark:text-sky-400 font-mono mt-0.5">
                {totalRegisteredAccountsCount}
              </div>
            </div>

            <div className="col-span-2 sm:col-span-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 flex flex-col justify-center">
              <button
                type="button"
                onClick={() => setShowClinicsList((p) => !p)}
                className="text-xs font-black text-amber-600 dark:text-amber-400 hover:underline"
              >
                {showClinicsList ? 'إخفاء سجل العيادات ▲' : 'عرض العيادات المسجلة ▼'}
              </button>
            </div>
          </div>

          {showClinicsList && (
            <div className="space-y-1.5 pt-2 border-t border-slate-200 dark:border-slate-800">
              {registeredClinics.length === 0 ? (
                <div className="text-[11px] font-bold text-slate-500 text-center py-2">
                  لا توجد عيادات مسجلة أخرى بعد أو جاري المزامنة.
                </div>
              ) : (
                registeredClinics.map((c, idx) => (
                  <div
                    key={c.id}
                    className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap items-center justify-between gap-2 text-xs"
                  >
                    <div className="space-y-0.5">
                      <div className="font-black text-slate-900 dark:text-slate-100">
                        {idx + 1}. {c.clinicAr}
                      </div>
                      <div className="text-[11px] font-bold text-slate-500">
                        {c.doctorAr} {c.address ? `— ${c.address}` : ''}
                      </div>
                    </div>
                    <div className="text-[11px] font-mono text-slate-500" dir="ltr">
                      {c.phones || c.updatedAt}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </section>
      )}

      {/* Add Member Form */}
      {effectiveIsOwner ? (
        <section className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-3.5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-sky-600 dark:text-sky-400" />
              <h4 className="text-xs font-black text-slate-900 dark:text-slate-100">
                إضافة حساب جديد (محاسب / طبيب / موظف)
              </h4>
            </div>
          </div>

          <form onSubmit={handleAddMember} className="space-y-2.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                  البريد الإلكتروني للحساب
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
                  اسم الموظف / الصفة (اختياري)
                </label>
                <input
                  type="text"
                  value={newDisplayName}
                  onChange={(e) => setNewDisplayName(e.target.value)}
                  placeholder="مثال: أحمد (محاسب العيادة)"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-bold text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                اختر نوع الحساب (الدور والصلاحيات):
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
              <span>إضافة وتفعيل حساب ({ROLES_INFO[selectedRole].label})</span>
            </button>
          </form>
        </section>
      ) : (
        <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs text-slate-600 dark:text-slate-400 font-bold">
          أنت عضو في مساحة العمل هذه. المالك فقط يمكنه إضافة أو ترقية الأعضاء.
        </div>
      )}

      {/* Members List */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-black text-slate-700 dark:text-slate-300 px-1">
          <span>الحسابات المضافة ({displayMembers.length})</span>
          <span className="text-[10px] text-emerald-600 dark:text-emerald-400">
            حفظ محلي وسحابي فوري
          </span>
        </div>

        {displayMembers.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
            لا توجد حسابات مضافة بعد. أضف حساب محاسب أو طبيب من النموذج أعلاه.
          </div>
        ) : (
          displayMembers.map((m) => {
            const RoleIcon = ROLES_INFO[m.role]?.icon || Users;
            return (
              <div
                key={m.uid || m.email}
                className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
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
                    <div className="text-[10px] font-bold text-sky-600 dark:text-sky-400 flex items-center gap-1.5 mt-0.5">
                      <span>الرتبة الحالية: {ROLES_INFO[m.role]?.label || m.role}</span>
                      <span className="text-slate-400">·</span>
                      <span className="text-emerald-600 dark:text-emerald-400">مفعّل</span>
                    </div>
                  </div>
                </div>

                {effectiveIsOwner && (
                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    {/* Direct 1-Click Role Promotion / Upgrade Selector */}
                    <div className="flex items-center gap-1 bg-white dark:bg-slate-900 border border-sky-500/40 rounded-lg px-2 py-1">
                      <ArrowUpCircle className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                      <span className="text-[10px] font-bold text-slate-500">ترقية:</span>
                      <select
                        value={m.role}
                        disabled={loading}
                        onChange={(e) =>
                          handleQuickRoleUpgrade(m, e.target.value as WorkspaceRole)
                        }
                        className="bg-transparent text-[11px] font-black text-sky-600 dark:text-sky-400 focus:outline-none cursor-pointer"
                        aria-label="ترقية أو تغيير الدور"
                      >
                        {ALL_ROLES.map((r) => (
                          <option
                            key={r}
                            value={r}
                            className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                          >
                            {ROLES_INFO[r].label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setEditingMember(m);
                        setCustomPermissions({
                          ...(DEFAULT_ROLE_PERMISSIONS[m.role] || DEFAULT_ROLE_PERMISSIONS.viewer),
                          ...m.permissions,
                        });
                      }}
                      className="px-2.5 py-1.5 text-[11px] font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-sky-500 text-slate-700 dark:text-slate-300"
                    >
                      الصلاحيات
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
                        className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-500/10"
                        title="إزالة"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )}
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
                <span>حفظ الترقية والصلاحيات</span>
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
