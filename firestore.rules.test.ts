/**
 * Adversarial Security Rules Test Suite ("The Dirty Dozen")
 * Verifies that all 12 attack vectors defined in security_spec.md are rejected with PERMISSION_DENIED.
 */

export interface DirtyDozenTestCase {
  id: number;
  name: string;
  collection: string;
  docId: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  auth: { uid: string; email_verified: boolean } | null;
  payload?: Record<string, unknown>;
  expectedOutcome: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_TESTS: DirtyDozenTestCase[] = [
  {
    id: 1,
    name: 'Shadow Field Injection on Receipt Create',
    collection: 'receipts',
    docId: 'rec_1',
    operation: 'create',
    auth: { uid: 'user_1', email_verified: true },
    payload: { ownerId: 'user_1', isAdmin: true },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Unverified Email Write on Clinic Create',
    collection: 'clinics',
    docId: 'user_1',
    operation: 'create',
    auth: { uid: 'user_1', email_verified: false },
    payload: { ownerId: 'user_1' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Cross-Tenant PII Read on Receipt',
    collection: 'receipts',
    docId: 'rec_user_1',
    operation: 'get',
    auth: { uid: 'user_2', email_verified: true },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Unscoped List Query Scraping on Receipts',
    collection: 'receipts',
    docId: '*',
    operation: 'list',
    auth: { uid: 'user_2', email_verified: true },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Owner Hijacking on Receipt Create',
    collection: 'receipts',
    docId: 'rec_2',
    operation: 'create',
    auth: { uid: 'user_1', email_verified: true },
    payload: { ownerId: 'user_2' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Owner Mutation on Receipt Update',
    collection: 'receipts',
    docId: 'rec_1',
    operation: 'update',
    auth: { uid: 'user_1', email_verified: true },
    payload: { ownerId: 'user_2' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Timestamp Forgery on Create',
    collection: 'expenses',
    docId: 'exp_1',
    operation: 'create',
    auth: { uid: 'user_1', email_verified: true },
    payload: { ownerId: 'user_1', createdAt: '1999-01-01T00:00:00Z' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Immutable createdAt Tampering on Update',
    collection: 'inventory',
    docId: 'inv_1',
    operation: 'update',
    auth: { uid: 'user_1', email_verified: true },
    payload: { ownerId: 'user_1', createdAt: '2026-01-01T00:00:00Z' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'ID Poisoning Attack with Special Characters',
    collection: 'receipts',
    docId: 'rec$bad!id',
    operation: 'create',
    auth: { uid: 'user_1', email_verified: true },
    payload: { ownerId: 'user_1' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Denial-of-Wallet String Overflow on patientName',
    collection: 'receipts',
    docId: 'rec_1',
    operation: 'update',
    auth: { uid: 'user_1', email_verified: true },
    payload: { patientName: 'A'.repeat(10000) },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Unbounded Array Injection on services',
    collection: 'receipts',
    docId: 'rec_1',
    operation: 'create',
    auth: { uid: 'user_1', email_verified: true },
    payload: { services: new Array(50).fill('خدمة') },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Orphaned Record Creation without Parent Clinic',
    collection: 'services',
    docId: 'srv_1',
    operation: 'create',
    auth: { uid: 'user_without_clinic', email_verified: true },
    payload: { ownerId: 'user_without_clinic', name: 'كشف', price: 3000 },
    expectedOutcome: 'PERMISSION_DENIED',
  },
];
