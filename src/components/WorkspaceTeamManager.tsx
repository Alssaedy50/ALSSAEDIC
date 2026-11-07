import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Copy, Link2, RefreshCw, Shield, UserPlus, Users, X } from 'lucide-react';
import { User } from 'firebase/auth';
import {
  ROLE_PRESETS,
  WORKSPACE_PERMISSION_KEYS,
  WorkspaceInvitation,
  WorkspaceMembership,
  WorkspacePermission,
  WorkspacePermissions,
  WorkspaceRole,
  acceptWorkspaceInvitation,
  cancelWorkspaceInvitation,
  createWorkspaceInvitation,
  listMyWorkspaceMemberships,
  listWorkspaceInvitations,
  listWorkspaceMembers,
  revokeWorkspaceMember,
  updateWorkspaceMember,
} from '../workspaces';

interface Props {
  user: User;
  activeOwnerUid: string;
  onSelectWorkspace: (ownerUid: string) => void;
  notify: (message: string, type?: 'success' | 'warning' | 'error' | 'info') => void;
}

const ROLE_LABELS: Record<WorkspaceRole, string> = {
  owner: 'المالك الرئيسي',
  doctor: 'طبيب',
  accountant: 'محاسب',
  receptionist: 'موظف استقبال',
  viewer: 'مشاهد',
};

const PERMISSION_LABELS: Record<WorkspacePermission, string> = {
  settings_read: 'عرض إعدادات العيادة',
  settings_manage: 'تعديل إعدادات العيادة',
  services_read: 'عرض الخدمات والأسعار',
  services_write: 'إضافة وتعديل الخدمات',
  services_delete: 'حذف الخدمات',
  receipts_read: 'عرض السندات وبيانات المرضى',
  receipts_create: 'إنشاء سندات',
  receipts_update: 'تعديل السندات وتسوية الديون',
  receipts_delete: 'حذف السندات',
  inventory_read: 'عرض المخزون',
  inventory_write: 'إضافة وتعديل المخزون',
  inventory_delete: 'حذف أصناف المخزون',
  expenses_read: 'عرض المصروفات',
  expenses_write: 'إضافة وتعديل المصروفات',
  expenses_delete: 'حذف المصروفات',
  reports_read: 'عرض التقارير المالية',
  team_manage: 'إدارة أعضاء الفريق',
};

const emptyPermissions = (): WorkspacePermissions =>
  Object.fromEntries(WORKSPACE_PERMISSION_KEYS.map((key) => [key, false])) as WorkspacePermissions;

export const WorkspaceTeamManager: React.FC<Props> = ({
  user,
  activeOwnerUid,
  onSelectWorkspace,
  notify,
}) => {
  const [workspaces, setWorkspaces] = useState<WorkspaceMembership[]>([]);
  const [members, setMembers] = useState<WorkspaceMembership[]>([]);
  const [invitations, setInvitations] = useState<WorkspaceInvitation[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Exclude<WorkspaceRole, 'owner'>>('doctor');
  const [permissions, setPermissions] = useState<WorkspacePermissions>(ROLE_PRESETS.doctor);
  const [inviteId, setInviteId] = useState(new URLSearchParams(window.location.search).get('invite') || '');
  const [editingMember, setEditingMember] = useState<WorkspaceMembership | null>(null);
  const [editRole, setEditRole] = useState<Exclude<WorkspaceRole, 'owner'>>('doctor');
  const [editPermissions, setEditPermissions] = useState<WorkspacePermissions>(emptyPermissions());
  const [loading, setLoading] = useState(false);

  const isOwner = activeOwnerUid === user.uid;
  const notifyRef = useRef(notify);
  useEffect(() => { notifyRef.current = notify; }, [notify]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const mine = await listMyWorkspaceMemberships(user.uid);
      setWorkspaces(mine);
      if (isOwner) {
        const [team, pending] = await Promise.all([
          listWorkspaceMembers(activeOwnerUid),
          listWorkspaceInvitations(activeOwnerUid),
        ]);
        setMembers(team);
        setInvitations(pending);
      } else {
        setMembers([]);
        setInvitations([]);
      }
    } catch (error) {
      notifyRef.current(error instanceof Error ? error.message : 'تعذر تحميل بيانات الفريق.', 'error');
    } finally {
      setLoading(false);
    }
  }, [activeOwnerUid, isOwner, user.uid]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const makeInvite = async () => {
    try {
      const id = await createWorkspaceInvitation(activeOwnerUid, email, role, permissions);
      const link = new URL(window.location.href);
      link.searchParams.set('invite', id);
      await navigator.clipboard.writeText(link.toString());
      setEmail('');
      notify('تم إنشاء الدعوة ونسخ رابطها. أرسله إلى البريد المدعو.', 'success');
      await refresh();
    } catch (error) {
      notify(error instanceof Error ? error.message : 'تعذر إنشاء الدعوة.', 'error');
    }
  };

  const acceptInvite = async () => {
    try {
      const ownerUid = await acceptWorkspaceInvitation(inviteId);
      onSelectWorkspace(ownerUid);
      notify('تم قبول الدعوة والانتقال إلى مساحة العمل المشتركة.', 'success');
      const url = new URL(window.location.href);
      url.searchParams.delete('invite');
      window.history.replaceState({}, '', url.toString());
      setInviteId('');
      await refresh();
    } catch (error) {
      notify(error instanceof Error ? error.message : 'تعذر قبول الدعوة.', 'error');
    }
  };

  const beginEdit = (member: WorkspaceMembership) => {
    if (member.role === 'owner') return;
    setEditingMember(member);
    setEditRole(member.role);
    setEditPermissions({ ...member.permissions });
  };

  const saveEdit = async () => {
    if (!editingMember) return;
    try {
      await updateWorkspaceMember(activeOwnerUid, editingMember.memberUid, editRole, editPermissions);
      setEditingMember(null);
      notify('تم تحديث دور العضو وصلاحياته.', 'success');
      await refresh();
    } catch (error) {
      notify(error instanceof Error ? error.message : 'تعذر تحديث الصلاحيات.', 'error');
    }
  };

  const togglePermission = (
    setter: React.Dispatch<React.SetStateAction<WorkspacePermissions>>,
    key: WorkspacePermission
  ) => setter((current) => ({ ...current, [key]: !current[key] }));

  return (
    <section className="mb-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-sky-600" />
          <div>
            <h3 className="font-black text-sm text-slate-900 dark:text-slate-100">مساحات العمل والفريق</h3>
            <p className="text-[11px] text-slate-500">مشاركة بيانات العيادة وإدارة صلاحيات الحسابات</p>
          </div>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={loading} className="p-2 rounded-lg border border-slate-200 dark:border-slate-700">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-bold text-slate-600 dark:text-slate-300">مساحة العمل النشطة</label>
        <select
          value={activeOwnerUid}
          onChange={(event) => onSelectWorkspace(event.target.value)}
          className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2.5 text-xs font-bold"
        >
          {workspaces.map((item) => (
            <option key={item.id} value={item.ownerUid}>
              {item.ownerUid === user.uid ? 'مشروعي — المالك الرئيسي' : `مساحة مشتركة — ${ROLE_LABELS[item.role]}`}
            </option>
          ))}
        </select>
      </div>

      {inviteId && (
        <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-3 space-y-2">
          <div className="font-bold text-sm">لديك دعوة للانضمام إلى عيادة</div>
          <p className="text-xs text-slate-500">يجب أن يكون البريد المسجل هو نفس البريد الذي أرسل إليه المالك الدعوة.</p>
          <button type="button" onClick={() => void acceptInvite()} className="w-full rounded-lg bg-sky-600 text-white py-2 text-xs font-bold">قبول الدعوة</button>
        </div>
      )}

      {isOwner ? (
        <>
          <div className="border-t border-slate-200 dark:border-slate-800 pt-3 space-y-3">
            <div className="flex items-center gap-2 font-black text-sm"><Shield className="w-4 h-4 text-emerald-600" /> إدارة الأعضاء</div>
            {members.filter((item) => item.memberUid !== user.uid).map((member) => (
              <div key={member.id} className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-bold truncate">{member.displayName || member.email}</div>
                  <div dir="ltr" className="text-[10px] text-slate-500 truncate">{member.email}</div>
                  <div className="text-[10px] text-sky-600">{ROLE_LABELS[member.role]}</div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button type="button" onClick={() => beginEdit(member)} className="rounded-lg border px-2 py-1.5 text-[10px] font-bold">الصلاحيات</button>
                  <button type="button" onClick={async () => {
                    if (!window.confirm('هل تريد إزالة هذا العضو من مساحة العمل؟')) return;
                    try { await revokeWorkspaceMember(activeOwnerUid, member.memberUid); notify('تمت إزالة العضو.', 'success'); await refresh(); }
                    catch (error) { notify(error instanceof Error ? error.message : 'تعذر إزالة العضو.', 'error'); }
                  }} className="rounded-lg border border-rose-300 text-rose-600 px-2 py-1.5 text-[10px] font-bold">إزالة</button>
                </div>
              </div>
            ))}
            {members.filter((item) => item.memberUid !== user.uid).length === 0 && <p className="text-xs text-slate-500">لا يوجد أعضاء آخرون في مساحة العمل.</p>}
          </div>

          <div className="border-t border-slate-200 dark:border-slate-800 pt-3 space-y-3">
            <div className="font-black text-sm flex items-center gap-2"><UserPlus className="w-4 h-4" /> دعوة عضو جديد</div>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="البريد الإلكتروني للعضو" dir="ltr" className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2.5 text-xs" />
            <select value={role} onChange={(e) => { const next = e.target.value as Exclude<WorkspaceRole, 'owner'>; setRole(next); setPermissions(ROLE_PRESETS[next]); }} className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2.5 text-xs">
              {(['doctor', 'accountant', 'receptionist', 'viewer'] as const).map((value) => <option key={value} value={value}>{ROLE_LABELS[value]}</option>)}
            </select>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {WORKSPACE_PERMISSION_KEYS.map((key) => (
                <label key={key} className="flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-300">
                  <input type="checkbox" checked={permissions[key]} onChange={() => togglePermission(setPermissions, key)} />
                  {PERMISSION_LABELS[key]}
                </label>
              ))}
            </div>
            <button type="button" onClick={() => void makeInvite()} disabled={!email.trim()} className="w-full rounded-xl bg-sky-600 text-white py-2.5 text-xs font-black flex items-center justify-center gap-2 disabled:opacity-50"><Link2 className="w-4 h-4" /> إنشاء رابط الدعوة ونسخه</button>
            <p className="text-[10px] text-slate-500">ينشئ النظام رابط دعوة صالحاً لمدة 7 أيام. انسخه وأرسله للعضو عبر البريد أو وسيلة التواصل المناسبة؛ لا يرسل البريد تلقائياً.</p>
          </div>

          {invitations.length > 0 && (
            <div className="border-t border-slate-200 dark:border-slate-800 pt-3 space-y-2">
              <div className="text-xs font-black">الدعوات المعلقة</div>
              {invitations.map((invite) => (
                <div key={invite.id} className="flex items-center justify-between gap-2 text-xs">
                  <span dir="ltr" className="truncate text-slate-500">{invite.email}</span>
                  <button type="button" onClick={async () => { try { await cancelWorkspaceInvitation(activeOwnerUid, invite.id); await refresh(); } catch (error) { notify(error instanceof Error ? error.message : 'تعذر إلغاء الدعوة.', 'error'); } }} className="text-rose-600 font-bold">إلغاء</button>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="rounded-xl bg-slate-50 dark:bg-slate-950 p-3 text-xs text-slate-500">أنت عضو في مساحة العمل. صلاحياتك يحددها المالك الرئيسي.</p>
      )}

      {editingMember && (
        <div className="fixed inset-0 z-[70] bg-slate-950/70 flex items-center justify-center p-3">
          <div className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-black text-sm">تعديل صلاحيات {editingMember.displayName || editingMember.email}</div>
              <button type="button" onClick={() => setEditingMember(null)}><X className="w-5 h-5" /></button>
            </div>
            <select value={editRole} onChange={(e) => { const next = e.target.value as Exclude<WorkspaceRole, 'owner'>; setEditRole(next); setEditPermissions(ROLE_PRESETS[next]); }} className="w-full rounded-xl border px-3 py-2 text-xs bg-transparent">
              {(['doctor', 'accountant', 'receptionist', 'viewer'] as const).map((value) => <option key={value} value={value}>{ROLE_LABELS[value]}</option>)}
            </select>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {WORKSPACE_PERMISSION_KEYS.map((key) => (
                <label key={key} className="flex items-center gap-2 text-[11px]">
                  <input type="checkbox" checked={editPermissions[key]} onChange={() => togglePermission(setEditPermissions, key)} />
                  {PERMISSION_LABELS[key]}
                </label>
              ))}
            </div>
            <button type="button" onClick={() => void saveEdit()} className="w-full rounded-xl bg-sky-600 text-white py-2.5 text-xs font-black">حفظ الصلاحيات</button>
          </div>
        </div>
      )}
    </section>
  );
};
