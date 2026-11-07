# Implementation Plan - Refactoring Vouchers ("السندات") Mobile RTL UI/UX

## User Requirements
1. **Remove Redundant Bottom Navigation Bar:**
   - Delete the fixed mobile bottom navigation bar in `App.tsx` ("سند جديد", "السندات", "المخزون", "المالية", "المساعد").
   - Remove bottom padding/margin (`pb-24` / `pb-20`) from the main container in `App.tsx` that was reserved for the bottom bar.
2. **Redesign Voucher Cards into Compact Patient Rows:**
   - In `RecordsLedger.tsx`, replace the multi-section card layout with a clean, compact single-row card layout (RTL flex container with `justify-between` and `items-center`).
   - Right Side: Patient Name in bold, and below it in `text-xs` status badge ("عليه دين: {remaining} ريال يمني" in red or "مسدد بالكامل" in green), plus voucher `#ID` or summary.
   - Left Side: Single clean action button ("بيانات العميل" / "التفاصيل" with an eye icon). Remove 5 inline action buttons from the card face.
3. **Create Dedicated Client Details & Actions Modal:**
   - Clicking the left button opens a responsive modal showing:
     - Header: Patient Name, Voucher Number (`#1003`), Date, Phone (with `dir="ltr"`), Currency badge.
     - Medical/Dental Details: Services and Teeth numbers (`dir="ltr"`).
     - Financial Summary: Total, Paid, Remaining.
     - Action Buttons Grid: "معاينة", "واتساب", conditional "تسديد", "تعديل", "حذف" in a responsive grid.

## Proposed Changes

### 1. `src/App.tsx`
- Remove the mobile bottom navigation `<nav>` element (lines ~1610-1666).
- Adjust main container bottom padding from `pb-24 md:pb-6` to `pb-6`.

### 2. `src/components/RecordsLedger.tsx`
- Redesign mobile card view (currently lines ~513-560) into compact single-row patient rows with patient name, debt/paid status badge, and single "التفاصيل" button.
- Add `selectedClientReceipt` state to manage the dedicated client details and actions modal.
- Implement the comprehensive Client Details & Actions Modal with all required details, `dir="ltr"` phone and tooth formatting, and the action buttons grid ("معاينة", "واتساب", "تسديد", "تعديل", "حذف").

## Verification Plan
- Compile and lint using `compile_applet` and `lint_applet`.
- Run production build with `npm run build`.
