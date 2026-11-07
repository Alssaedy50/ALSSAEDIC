import React, { useEffect, useState } from 'react';
import {
  Check,
  Crown,
  KeyRound,
  Mail,
  Plus,
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
  addWorkspaceMemberInCloud,
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
    label: 'مالك العيادة',
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

export const PERMISSION_LABELS: Record<keyof WorkspacePermissions, string> = {
  canCreateReceipt: 'إصدار سند',
  canEditReceipt: 'تعديل السندات',
  canDeleteReceipt: 'حذف السندات',
  canSettleDebt: 'تسوية الديون',
  canManageInventory: 'إدارة المخزون',
  canConsumeInventory: 'خصم المخزون',
  canManageExpenses: 'المصروفات',
  canViewFinances: 'التقارير المالية',
  canManageSettings: 'الإعدادات والأسعار',
  canManageTeam: 'إدارة الفريق',
  canUseAiAssistant: 'المساعد الذكي',
};

export const WorkspaceTeamPanel: React.FC<WorkspaceTeamPanelProps> = ({
  workspaceId,
  ownerUid,
  isOwner,
  currentRole,
  members,
  notify,
}) => {
  const [cloudMembers, setCloudMembers] = useState<WorkspaceMember[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [selectedRole, setSelectedRole] = useState<WorkspaceRole>('doctor');
  const [editingMember, setEditingMember] = useState<WorkspaceMember | null>(null);
  const [customPermissions, setCustomPermissions] = useState<WorkspacePermissions>(
    DEFAULT_ROLE_PERMISSIONS.doctor
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!workspaceId) return;
    const unsub = subscribeToWorkspaceMembers(workspaceId, (list) => {
      setCloudMembers(list);
    });
    return () => {
      unsub();
    };
  }, [workspaceId]);

  const effectiveIsOwner = isOwner !== undefined ? isOwner : currentRole === 'owner';
  const displayMembers = members && members.length > 0 ? members : cloudMembers;

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = newEmail.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      notify('يرجى إدخال بريد إلكتروني صالح', 'warning');
      return;
    }

    setLoading(true);
    try {
      await addWorkspaceMemberInCloud(
        workspaceId,
        ownerUid,
        cleanEmail,
        selectedRole,
        DEFAULT_ROLE_PERMISSIONS[selectedRole]
      );
      notify(`تمت إضافة (${cleanEmail}) كـ ${ROLES_INFO[selectedRole].label}`, 'success');
      setNewEmail('');
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'تعذر إضافة العضو', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveEditedPermissions = async () => {
    if (!editingMember) return;
    setLoading(true);
    try {
      await updateWorkspaceMemberRoleInCloud(
        workspaceId,
        editingMember.email,
        editingMember.role,
        customPermissions
      );
      notify(`تم تحديث صلاحيات (${editingMember.email}) بنجاح`, 'success');
      setEditingMember(null);
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'تعذر تحديث الصلاحيات', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveMember = async (memberEmail: string) => {
    if (!window.confirm(`هل أنت متأكد من إزالة العضو (${memberEmail}) من مساحة العمل؟`)) {
      return;
    }
    setLoading(true);
    try {
      await removeWorkspaceMemberFromCloud(workspaceId, memberEmail);
      notify(`تمت إزالة العضو (${memberEmail})`, 'info');
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'تعذر إزالة العضو', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Add Member Form (Only for Owner) */}
      {effectiveIsOwner ? (
        <section className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-3.5 space-y-3">
          <div className="flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-sky-600 dark:text-sky-400" />
            <h4 className="text-xs font-black text-slate-900 dark:text-slate-100">
              إضافة عضو
            </h4>
          </div>

          <form onSubmit={handleAddMember} className="space-y-2.5">
            <div className="relative">
              <input
                type="email"
                required
                dir="ltr"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="doctor@domain.com"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 pl-3 pr-9 py-2 text-xs font-bold text-slate-900 dark:text-slate-100 font-mono"
              />
              <Mail className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {(['doctor', 'accountant', 'receptionist', 'viewer'] as WorkspaceRole[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setSelectedRole(r)}
                  className={`p-2 rounded-lg border text-center transition-all ${
                    selectedRole === r
                      ? 'bg-sky-600 border-sky-500 text-white shadow-xs'
                      : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <div className="text-xs font-bold">{ROLES_INFO[r].label}</div>
                </button>
              ))}
            </div>

            <button
              type="submit"
              disabled={loading || !newEmail.trim()}
              className="w-full py-2 px-3 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-black flex items-center justify-center gap-1.5 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة</span>
            </button>
          </form>
        </section>
      ) : (
        <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs text-slate-600 dark:text-slate-400 font-bold">
          أنت عضو في مساحة العمل هذه. المالك فقط يمكنه إضافة أو حذف الأعضاء.
        </div>
      )}

      {/* Members List */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-black text-slate-700 dark:text-slate-300 px-1">
          <span>أعضاء الفريق ({displayMembers.length})</span>
          <span className="text-[10px] text-slate-400">مزامنة فورية</span>
        </div>

        {displayMembers.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
            لا يوجد أعضاء مضافون حتى الآن.
          </div>
        ) : (
          displayMembers.map((m) => {
            const RoleIcon = ROLES_INFO[m.role]?.icon || Users;
            return (
              <div
                key={m.uid || m.email}
                className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 flex items-center justify-between gap-2"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
                    <RoleIcon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-900 dark:text-slate-100 font-mono truncate" dir="ltr">
                      {m.email}
                    </div>
                    <div className="text-[10px] font-bold text-sky-600 dark:text-sky-400 flex items-center gap-1.5">
                      <span>{ROLES_INFO[m.role]?.label || m.role}</span>
                      <span className="text-slate-400">·</span>
                      <span className="text-emerald-600 dark:text-emerald-400">نشط</span>
                    </div>
                  </div>
                </div>

                {effectiveIsOwner && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingMember(m);
                        setCustomPermissions({ ...m.permissions });
                      }}
                      className="px-2.5 py-1 text-[11px] font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-sky-500 text-slate-700 dark:text-slate-300"
                    >
                      الصلاحيات
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveMember(m.email)}
                      className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-500/10"
                      title="إزالة"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Permissions Editor Sub-Modal */}
      {editingMember && (
        <div className="fixed inset-0 z-60 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md p-4 space-y-4 shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="min-w-0">
                <h4 className="text-xs sm:text-sm font-black text-slate-900 dark:text-slate-100 truncate">
                  صلاحيات: {editingMember.email}
                </h4>
                <div className="text-[11px] text-sky-600 font-bold mt-0.5">
                  الدور: {ROLES_INFO[editingMember.role]?.label}
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

            {/* Quick Role Switch */}
            <div className="grid grid-cols-4 gap-1">
              {(['doctor', 'accountant', 'receptionist', 'viewer'] as WorkspaceRole[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => {
                    setEditingMember((prev) => (prev ? { ...prev, role: r } : null));
                    setCustomPermissions(DEFAULT_ROLE_PERMISSIONS[r]);
                  }}
                  className={`p-1.5 text-xs font-bold rounded-lg border text-center ${
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
