# Security Specification (`security_spec.md`)

## 1. Data Invariants
1. **Strict Ownership (`ownerId == request.auth.uid`)**: Every document in `/clinics/{clinicId}`, `/services/{serviceId}`, `/receipts/{receiptId}`, `/inventory/{itemId}`, and `/expenses/{expenseId}` belongs exclusively to its authenticated, email-verified creator (`request.auth.uid` with `request.auth.token.email_verified == true`).
2. **Relational Existence (`exists(/databases/$(database)/documents/clinics/$(incoming().ownerId))`)**: Child domain records (`services`, `receipts`, `inventory`, `expenses`) require the parent clinic document `/clinics/$(incoming().ownerId)` to exist.
3. **Immutable Ownership & Creation Time**: `ownerId` and `createdAt` can never be mutated during an `update` operation (`incoming().ownerId == existing().ownerId && incoming().createdAt == existing().createdAt`).
4. **Server-Side Temporal Integrity**: All `createdAt` (on create) and `updatedAt` (on create and update) timestamps must strictly match `request.time`.
5. **Strict Key Allowlisting & Volumetric Boundaries**: Every `create` and `update` operation enforces exact `hasAll` / `hasOnly` keys, `isValidId()` regex guards on path IDs, bounded string lengths, and bounded list sizes.
6. **Zero Client Query Trust**: Every `allow list` rule enforces `resource.data.ownerId == request.auth.uid` without `get()` or `exists()` calls inside `list`.

## 2. The "Dirty Dozen" Payloads (Adversarial Test Vectors)
1. **Shadow Field Injection**: Creating a `/receipts/rec_1` document with an extra undeclared field `"isAdmin": true`. -> `PERMISSION_DENIED`
2. **Unverified Email Write**: Creating a `/clinics/user_1` document when `email_verified == false`. -> `PERMISSION_DENIED`
3. **Cross-Tenant PII Read**: Authenticated `user_2` attempting `get` on `/receipts/rec_owned_by_user_1` (which contains `patientName` and `patientPhone`). -> `PERMISSION_DENIED`
4. **Unscoped List Query Scraping**: Authenticated `user_2` running an unfiltered `list` query across `/receipts`. -> `PERMISSION_DENIED`
5. **Owner Hijacking on Create**: Authenticated `user_1` creating a receipt with `ownerId: "user_2"`. -> `PERMISSION_DENIED`
6. **Owner Mutation on Update**: Authenticated `user_1` updating `ownerId` on an existing receipt to `"user_2"`. -> `PERMISSION_DENIED`
7. **Timestamp Forgery on Create**: Authenticated `user_1` supplying a past or future `createdAt` timestamp not equal to `request.time`. -> `PERMISSION_DENIED`
8. **Immutable `createdAt` Tampering on Update**: Authenticated `user_1` modifying `createdAt` during a receipt update. -> `PERMISSION_DENIED`
9. **ID Poisoning Attack**: Creating a document with an invalid ID containing spaces or special characters (`rec$bad!id`). -> `PERMISSION_DENIED`
10. **Denial-of-Wallet String Overflow**: Updating `patientName` with a 10,000-character string (exceeding `maxLength: 160`). -> `PERMISSION_DENIED`
11. **Unbounded Array Injection**: Creating a receipt with 50 items in `services` (exceeding max 25 items) or non-string first element. -> `PERMISSION_DENIED`
12. **Orphaned Record Creation**: Creating a `/receipts/rec_1` document before `/clinics/$(request.auth.uid)` exists. -> `PERMISSION_DENIED`
