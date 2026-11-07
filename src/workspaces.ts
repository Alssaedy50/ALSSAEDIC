import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { User } from 'firebase/auth';
import { auth, db } from './firebase';

export type WorkspaceRole = 'owner' | 'doctor' | 'accountant' | 'receptionist' | 'viewer';

export const WORKSPACE_PERMISSION_KEYS = [
  'settings_read',
  'settings_manage',
  'services_read',
  'services_write',
  'services_delete',
  'receipts_read',
  'receipts_create',
  'receipts_update',
  'receipts_delete',
  'inventory_read',
  'inventory_write',
  'inventory_delete',
  'expenses_read',
  'expenses_write',
  'expenses_delete',
  'reports_read',
  'team_manage',
] as const;

export type WorkspacePermission = (typeof WORKSPACE_PERMISSION_KEYS)[number];
export type WorkspacePermissions = Record<WorkspacePermission, boolean>;

const allPermissions = (): WorkspacePermissions =>
  Object.fromEntries(WORKSPACE_PERMISSION_KEYS.map((key) => [key, true])) as WorkspacePermissions;

export const ROLE_PRESETS: Record<Exclude<WorkspaceRole, 'owner'>, WorkspacePermissions> = {
  doctor: {
    settings_read: true, settings_manage: false,
    services_read: true, services_write: false, services_delete: false,
    receipts_read: true, receipts_create: true, receipts_update: true, receipts_delete: false,
    inventory_read: true, inventory_write: false, inventory_delete: false,
    expenses_read: false, expenses_write: false, expenses_delete: false,
    reports_read: false, team_manage: false,
  },
  accountant: {
    settings_read: true, settings_manage: false,
    services_read: true, services_write: false, services_delete: false,
    receipts_read: true, receipts_create: false, receipts_update: true, receipts_delete: false,
    inventory_read: true, inventory_write: false, inventory_delete: false,
    expenses_read: true, expenses_write: true, expenses_delete: false,
    reports_read: true, team_manage: false,
  },
  receptionist: {
    settings_read: true, settings_manage: false,
    services_read: true, services_write: false, services_delete: false,
    receipts_read: true, receipts_create: true, receipts_update: false, receipts_delete: false,
    inventory_read: false, inventory_write: false, inventory_delete: false,
    expenses_read: false, expenses_write: false, expenses_delete: false,
    reports_read: false, team_manage: false,
  },
  viewer: {
    settings_read: true, settings_manage: false,
    services_read: true, services_write: false, services_delete: false,
    receipts_read: true, receipts_create: false, receipts_update: false, receipts_delete: false,
    inventory_read: true, inventory_write: false, inventory_delete: false,
    expenses_read: true, expenses_write: false, expenses_delete: false,
    reports_read: true, team_manage: false,
  },
};

export interface WorkspaceMembership {
  id: string;
  ownerUid: string;
  memberUid: string;
  email: string;
  displayName: string;
  role: WorkspaceRole;
  permissions: WorkspacePermissions;
  status: 'active' | 'revoked';
  invitationId?: string;
}

export interface WorkspaceInvitation {
  id: string;
  ownerUid: string;
  email: string;
  role: Exclude<WorkspaceRole, 'owner'>;
  permissions: WorkspacePermissions;
  status: 'pending' | 'accepted' | 'cancelled';
  expiresAt?: { toDate?: () => Date };
}

const membershipId = (ownerUid: string, memberUid: string) => `${ownerUid}_${memberUid}`;

export async function ensureOwnerWorkspaceMembership(user: User): Promise<void> {
  if (!user.email || (!user.emailVerified && !user.email.endsWith('@clinic.alssaedic.local'))) {
    throw new Error('يجب تأكيد البريد الإلكتروني قبل تفعيل مساحة العمل السحابية.');
  }
  const id = membershipId(user.uid, user.uid);
  const ref = doc(db, 'clinic_memberships', id);
  const snap = await getDoc(ref);
  if (snap.exists()) return;
  await setDoc(ref, {
    ownerUid: user.uid,
    memberUid: user.uid,
    email: user.email.toLowerCase(),
    displayName: user.displayName || user.email,
    role: 'owner',
    permissions: allPermissions(),
    status: 'active',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function listMyWorkspaceMemberships(userUid: string): Promise<WorkspaceMembership[]> {
  const snap = await getDocs(query(
    collection(db, 'clinic_memberships'),
    where('memberUid', '==', userUid),
    where('status', '==', 'active')
  ));
  return snap.docs.map((item) => ({ id: item.id, ...item.data() }) as WorkspaceMembership);
}

export async function listWorkspaceMembers(ownerUid: string): Promise<WorkspaceMembership[]> {
  const snap = await getDocs(query(
    collection(db, 'clinic_memberships'),
    where('ownerUid', '==', ownerUid)
  ));
  return snap.docs.map((item) => ({ id: item.id, ...item.data() }) as WorkspaceMembership);
}

export async function listWorkspaceInvitations(ownerUid: string): Promise<WorkspaceInvitation[]> {
  const snap = await getDocs(query(
    collection(db, 'clinic_invitations'),
    where('ownerUid', '==', ownerUid),
    where('status', '==', 'pending')
  ));
  return snap.docs.map((item) => ({ id: item.id, ...item.data() }) as WorkspaceInvitation);
}

export async function createWorkspaceInvitation(
  ownerUid: string,
  email: string,
  role: Exclude<WorkspaceRole, 'owner'>,
  permissions: WorkspacePermissions
): Promise<string> {
  if (!auth.currentUser || auth.currentUser.uid !== ownerUid) {
    throw new Error('إدارة أعضاء مساحة العمل متاحة للمالك الرئيسي فقط.');
  }
  const normalizedEmail = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new Error('أدخل بريداً إلكترونياً صحيحاً.');
  }
  if (role === 'owner') throw new Error('لا يمكن منح دور المالك عبر الدعوة.');
  const id = crypto.randomUUID().replace(/-/g, '');
  await setDoc(doc(db, 'clinic_invitations', id), {
    ownerUid,
    email: normalizedEmail,
    role,
    permissions,
    status: 'pending',
    createdBy: ownerUid,
    createdAt: serverTimestamp(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });
  return id;
}

export async function acceptWorkspaceInvitation(invitationId: string): Promise<string> {
  const user = auth.currentUser;
  if (!user?.email || !user.emailVerified) {
    throw new Error('سجّل الدخول ببريد إلكتروني مؤكد لقبول الدعوة.');
  }
  const inviteRef = doc(db, 'clinic_invitations', invitationId.trim());
  const inviteSnap = await getDoc(inviteRef);
  if (!inviteSnap.exists()) throw new Error('رابط الدعوة غير صالح أو لم يعد موجوداً.');
  const invite = inviteSnap.data();
  if (invite.status !== 'pending' || String(invite.email).toLowerCase() !== user.email.toLowerCase()) {
    throw new Error('الدعوة لا تخص هذا البريد أو سبق استخدامها.');
  }
  if (invite.expiresAt?.toDate && invite.expiresAt.toDate().getTime() <= Date.now()) {
    throw new Error('انتهت صلاحية الدعوة. اطلب من المالك إرسال دعوة جديدة.');
  }
  const id = membershipId(String(invite.ownerUid), user.uid);
  await setDoc(doc(db, 'clinic_memberships', id), {
    ownerUid: String(invite.ownerUid),
    memberUid: user.uid,
    email: user.email.toLowerCase(),
    displayName: user.displayName || user.email,
    role: invite.role,
    permissions: invite.permissions,
    status: 'active',
    invitationId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await updateDoc(inviteRef, {
    status: 'accepted',
    acceptedByUid: user.uid,
    acceptedAt: serverTimestamp(),
  });
  return String(invite.ownerUid);
}

export async function updateWorkspaceMember(
  ownerUid: string,
  memberUid: string,
  role: Exclude<WorkspaceRole, 'owner'>,
  permissions: WorkspacePermissions
): Promise<void> {
  if (!auth.currentUser || auth.currentUser.uid !== ownerUid || memberUid === ownerUid) {
    throw new Error('لا تملك صلاحية تعديل هذا العضو.');
  }
  await updateDoc(doc(db, 'clinic_memberships', membershipId(ownerUid, memberUid)), {
    role,
    permissions,
    updatedAt: serverTimestamp(),
  });
}

export async function revokeWorkspaceMember(ownerUid: string, memberUid: string): Promise<void> {
  if (!auth.currentUser || auth.currentUser.uid !== ownerUid || memberUid === ownerUid) {
    throw new Error('لا تملك صلاحية إزالة هذا العضو.');
  }
  await deleteDoc(doc(db, 'clinic_memberships', membershipId(ownerUid, memberUid)));
}

export async function cancelWorkspaceInvitation(ownerUid: string, invitationId: string): Promise<void> {
  if (!auth.currentUser || auth.currentUser.uid !== ownerUid) {
    throw new Error('لا تملك صلاحية إلغاء هذه الدعوة.');
  }
  await updateDoc(doc(db, 'clinic_invitations', invitationId), {
    status: 'cancelled',
    updatedAt: serverTimestamp(),
  });
}
