import React, { useEffect, useMemo, useState } from 'react';
import { jsPDF } from 'jspdf';
import {
  AlertCircle,
  Archive,
  ArchiveRestore,
  ArrowRight,
  Calendar,
  Check,
  CheckCircle2,
  CreditCard,
  Edit3,
  Eye,
  FileDown,
  FileSpreadsheet,
  FileText,
  Loader2,
  MessageCircle,
  Phone,
  Plus,
  RotateCcw,
  Search,
  Send,
  Share2,
  Trash2,
  User,
  Users,
  X,
} from 'lucide-react';
import { ClinicSettings, PaperFormat, ReceiptRecord } from '../types/clinic';
import { DEFAULT_CLINIC_LOGO_DATA_URI } from '../data/defaultData';
import {
  PatientAccountSummary,
  buildPatientAccountsFromReceipts,
  isReceiptReturnVisit,
  sendPatientAccountPdfToTelegram,
  stripArchiveMarkerFromNotes,
} from '../utils/aiClient';
import { OfficialReceiptCard } from './OfficialReceiptCard';

interface RecordsLedgerProps {
  settings: ClinicSettings;
  receipts: ReceiptRecord[];
  defaultCurrency: string;
  initialSettleReceiptId?: string | null;
  initialSelectedAccountKey?: string | null;
  onClearInitialSettle?: () => void;
  onClearInitialAccount?: () => void;
  onEditReceipt: (receipt: ReceiptRecord) => void;
  onSettleDebt: (receiptId: string, amountPaidNow: number) => void;
  onSettlePatientAccountDebt?: (accountKey: string, amountPaidNow: number) => void;
  onArchivePatientAccount?: (accountKey: string, archive: boolean) => void;
  onDeletePatientAccount?: (accountKey: string) => void;
  onDeleteReceipt: (receiptId: string) => void;
  onGoToNewReceipt: (prefill?: {
    patientName: string;
    patientPhone: string;
    isReturnVisit?: boolean;
  }) => void;
  notify: (message: string, type?: 'success' | 'warning' | 'error' | 'info') => void;
}

export const RecordsLedger: React.FC<RecordsLedgerProps> = ({
  settings,
  receipts,
  defaultCurrency,
  initialSettleReceiptId,
  initialSelectedAccountKey,
  onClearInitialSettle,
  onClearInitialAccount,
  onEditReceipt,
  onSettleDebt,
  onSettlePatientAccountDebt,
  onArchivePatientAccount,
  onDeletePatientAccount,
  onDeleteReceipt,
  onGoToNewReceipt,
  notify,
}) => {
  const [viewMode, setViewMode] = useState<'accounts' | 'receipts'>('accounts');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'debt' | 'paid' | 'archived'>('all');

  const [selectedAccountKey, setSelectedAccountKey] = useState<string | null>(null);
  const [settlingId, setSettlingId] = useState<string | null>(null);
  const [settleAmount, setSettleAmount] = useState<string>('');
  const [isSettlingAccount, setIsSettlingAccount] = useState<boolean>(false);
  const [accountSettleAmount, setAccountSettleAmount] = useState<string>('');
  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState<boolean>(false);

  const [previewReceipt, setPreviewReceipt] = useState<ReceiptRecord | null>(null);
  const [previewFormat, setPreviewFormat] = useState<PaperFormat>('a5');
  const [busyPdfAction, setBusyPdfAction] = useState<'download' | 'share' | 'telegram' | null>(
    null
  );

  const patientAccounts = useMemo(
    () => buildPatientAccountsFromReceipts(receipts, defaultCurrency),
    [receipts, defaultCurrency]
  );

  const selectedAccount = useMemo(
    () =>
      selectedAccountKey
        ? patientAccounts.find((a) => a.accountKey === selectedAccountKey) || null
        : null,
    [patientAccounts, selectedAccountKey]
  );

  // Automatically open account or receipt settlement if navigated from ReceiptStudio
  useEffect(() => {
    if (initialSelectedAccountKey) {
      setSelectedAccountKey(initialSelectedAccountKey);
      if (onClearInitialAccount) onClearInitialAccount();
    }
  }, [initialSelectedAccountKey, onClearInitialAccount]);

  useEffect(() => {
    if (initialSettleReceiptId) {
      const target = receipts.find((r) => r.id === initialSettleReceiptId);
      if (target) {
        const matchedAcc = patientAccounts.find((a) =>
          a.receipts.some((r) => r.id === target.id)
        );
        if (matchedAcc) {
          setSelectedAccountKey(matchedAcc.accountKey);
        }
        setSettlingId(target.id);
        setSettleAmount(String(target.remainingAmount || ''));
      }
      if (onClearInitialSettle) {
        onClearInitialSettle();
      }
    }
  }, [initialSettleReceiptId, receipts, patientAccounts, onClearInitialSettle]);

  // If selected account was deleted, return to accounts list
  useEffect(() => {
    if (selectedAccountKey && !selectedAccount) {
      setSelectedAccountKey(null);
      setConfirmDeleteAccount(false);
    }
  }, [selectedAccountKey, selectedAccount]);

  const filteredAccounts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return patientAccounts.filter((acc) => {
      if (statusFilter === 'archived') {
        if (!acc.isArchived) return false;
      } else {
        if (acc.isArchived) return false;
        if (statusFilter === 'debt' && !acc.hasDebt) return false;
        if (statusFilter === 'paid' && acc.hasDebt) return false;
      }

      if (!q) return true;
      return (
        acc.patientName.toLowerCase().includes(q) ||
        acc.patientPhone.toLowerCase().includes(q) ||
        acc.allServices.some((s) => s.toLowerCase().includes(q)) ||
        acc.receipts.some((r) => String(r.receiptNo).includes(q))
      );
    });
  }, [patientAccounts, searchQuery, statusFilter]);

  const filteredReceipts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return receipts.filter((r) => {
      const rem = Number(r.remainingAmount) || 0;
      const archived = String(r.notes || '').includes('[مؤرشف]');
      if (statusFilter === 'archived') {
        if (!archived) return false;
      } else {
        if (archived) return false;
        if (statusFilter === 'debt' && rem <= 0) return false;
        if (statusFilter === 'paid' && rem > 0) return false;
      }
      if (!q) return true;
      return (
        r.patientName.toLowerCase().includes(q) ||
        (r.patientPhone || '').toLowerCase().includes(q) ||
        String(r.receiptNo).includes(q) ||
        (r.services || []).join(' ').toLowerCase().includes(q) ||
        (r.notes || '').toLowerCase().includes(q)
      );
    });
  }, [receipts, searchQuery, statusFilter]);

  const summaryCounts = useMemo(() => {
    const activeAccounts = patientAccounts.filter((a) => !a.isArchived);
    const archivedAccounts = patientAccounts.filter((a) => a.isArchived);
    const debtAccounts = activeAccounts.filter((a) => a.hasDebt);
    const paidAccounts = activeAccounts.filter((a) => !a.hasDebt);
    const totalDebtSum = debtAccounts.reduce((s, a) => s + a.totalRemaining, 0);
    return {
      allActive: activeAccounts.length,
      debtCount: debtAccounts.length,
      paidCount: paidAccounts.length,
      archivedCount: archivedAccounts.length,
      totalDebtSum,
    };
  }, [patientAccounts]);

  const confirmSettle = (rec: ReceiptRecord) => {
    const val = Number(settleAmount);
    if (!val || val <= 0) {
      notify('أدخل مبلغ التسديد بشكل صحيح', 'warning');
      return;
    }
    if (val > rec.remainingAmount) {
      notify('مبلغ التسديد أكبر من المتبقي على هذا السند', 'warning');
      return;
    }
    onSettleDebt(rec.id, val);
    setSettlingId(null);
    setSettleAmount('');
  };

  const handleSettleWholeAccount = (acc: PatientAccountSummary) => {
    const val = Number(accountSettleAmount);
    if (!val || val <= 0) {
      notify('أدخل مبلغ الدفعة بشكل صحيح', 'warning');
      return;
    }
    if (val > acc.totalRemaining) {
      notify('مبلغ الدفعة أكبر من إجمالي الدين المتبقي على الحساب', 'warning');
      return;
    }
    if (onSettlePatientAccountDebt) {
      onSettlePatientAccountDebt(acc.accountKey, val);
    } else {
      // Fallback: settle oldest unpaid receipt first
      let left = val;
      const unpaidAsc = [...acc.receipts]
        .filter((r) => (Number(r.remainingAmount) || 0) > 0)
        .sort((a, b) => String(a.date).localeCompare(String(b.date)));
      for (const r of unpaidAsc) {
        if (left <= 0) break;
        const payHere = Math.min(left, Number(r.remainingAmount) || 0);
        if (payHere > 0) {
          onSettleDebt(r.id, payHere);
          left -= payHere;
        }
      }
    }
    setIsSettlingAccount(false);
    setAccountSettleAmount('');
  };

  // ==================== HIGH-RES PATIENT ACCOUNT STATEMENT PDF GENERATOR ====================
  const generatePatientAccountCanvas = async (
    acc: PatientAccountSummary,
    pixelRatio = 3
  ): Promise<HTMLCanvasElement> => {
    if (document.fonts && document.fonts.ready) {
      try {
        await document.fonts.ready;
      } catch {
        // ignore
      }
    }

    const loadImg = (src: string): Promise<HTMLImageElement | null> => {
      if (!src) return Promise.resolve(null);
      return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = src;
      });
    };

    const logoSrc = settings.appearance.customLogoDataUrl || DEFAULT_CLINIC_LOGO_DATA_URI;
    const logoImg = await loadImg(logoSrc);

    const W = 794; // A4 width at 96 DPI
    const rowHeight = 36;
    const rowsCount = Math.max(1, acc.receipts.length);
    const H = Math.max(620, 340 + rowsCount * rowHeight + 90);

    const canvas = document.createElement('canvas');
    canvas.width = W * pixelRatio;
    canvas.height = H * pixelRatio;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(pixelRatio, pixelRatio);
    ctx.direction = 'rtl';

    // White sheet background & crisp border
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = settings.appearance.primaryColor || '#0B2545';
    ctx.lineWidth = 3;
    ctx.strokeRect(14, 14, W - 28, H - 28);

    // Header Banner
    ctx.fillStyle = '#0F172A';
    ctx.beginPath();
    ctx.roundRect(26, 26, W - 52, 86, 12);
    ctx.fill();

    if (logoImg) {
      ctx.drawImage(logoImg, W - 104, 37, 64, 64);
    }

    ctx.textAlign = 'right';
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '900 20px "Tajawal", sans-serif';
    ctx.fillText(settings.identity.clinicAr, W - 120, 58);

    ctx.fillStyle = '#38BDF8';
    ctx.font = '800 14px "Tajawal", sans-serif';
    ctx.fillText(
      `${settings.identity.doctorAr} — ${settings.identity.specialtyAr}`,
      W - 120,
      82
    );

    ctx.fillStyle = '#94A3B8';
    ctx.font = '700 11px "Tajawal", sans-serif';
    ctx.fillText(
      `${settings.identity.address || ''} | هاتف: ${settings.identity.phones || ''}`,
      W - 120,
      101
    );

    // Title Badge on Left of Header
    ctx.fillStyle = '#0284C7';
    ctx.beginPath();
    ctx.roundRect(42, 46, 175, 42, 10);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '900 14px "Tajawal", sans-serif';
    ctx.fillText('كشف حساب مريض معتمد', 42 + 87.5, 72);

    // Patient Info & Financial Summary Strip
    let y = 128;
    ctx.fillStyle = '#F8FAFC';
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(26, y, W - 52, 74, 10);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = 'right';
    ctx.fillStyle = '#0F172A';
    ctx.font = '900 16px "Tajawal", sans-serif';
    ctx.fillText(`اسم المريض: ${acc.patientName}`, W - 42, y + 28);

    ctx.fillStyle = '#475569';
    ctx.font = '800 12px "Tajawal", sans-serif';
    ctx.fillText(
      `رقم الهاتف: ${acc.patientPhone || '—'}   |   عدد السندات والزيارات: ${acc.visitsCount} (العودات: ${acc.returnVisitsCount})   |   تاريخ الكشف: ${new Date().toISOString().slice(0, 10)}`,
      W - 42,
      y + 54
    );

    // Status Tag
    ctx.fillStyle = acc.hasDebt ? '#BE123C' : '#059669';
    ctx.beginPath();
    ctx.roundRect(40, y + 18, 170, 36, 8);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '900 12px "Tajawal", sans-serif';
    ctx.fillText(
      acc.hasDebt
        ? `عليه دين: ${acc.totalRemaining.toLocaleString()} ${acc.currency}`
        : 'مسدد بالكامل',
      40 + 85,
      y + 41
    );

    y += 90;

    // 3 Financial Summary Boxes
    const boxW = (W - 52 - 20) / 3;
    const summaryBoxes = [
      {
        label: 'إجمالي قيمة العلاجات',
        value: `${acc.totalBilled.toLocaleString()} ${acc.currency}`,
        bg: '#F1F5F9',
        border: '#CBD5E1',
        color: '#0F172A',
      },
      {
        label: 'إجمالي المبالغ المسددة',
        value: `${acc.totalPaid.toLocaleString()} ${acc.currency}`,
        bg: '#ECFDF5',
        border: '#6EE7B7',
        color: '#047857',
      },
      {
        label: 'المتبقي (الدين الحالي)',
        value: `${acc.totalRemaining.toLocaleString()} ${acc.currency}`,
        bg: acc.hasDebt ? '#FFF1F2' : '#F8FAFC',
        border: acc.hasDebt ? '#FDA4AF' : '#CBD5E1',
        color: acc.hasDebt ? '#BE123C' : '#475569',
      },
    ];

    summaryBoxes.forEach((b, idx) => {
      const bx = W - 26 - (idx + 1) * boxW - idx * 10;
      ctx.fillStyle = b.bg;
      ctx.strokeStyle = b.border;
      ctx.beginPath();
      ctx.roundRect(bx, y, boxW, 56, 8);
      ctx.fill();
      ctx.stroke();

      ctx.textAlign = 'center';
      ctx.fillStyle = '#64748B';
      ctx.font = '800 11px "Tajawal", sans-serif';
      ctx.fillText(b.label, bx + boxW / 2, y + 20);

      ctx.fillStyle = b.color;
      ctx.font = '900 15px "JetBrains Mono", "Tajawal", sans-serif';
      ctx.fillText(b.value, bx + boxW / 2, y + 43);
    });

    y += 72;

    // Table Header
    ctx.fillStyle = '#0F172A';
    ctx.beginPath();
    ctx.roundRect(26, y, W - 52, 34, 6);
    ctx.fill();

    ctx.fillStyle = '#FFFFFF';
    ctx.font = '900 12px "Tajawal", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('السند', W - 38, y + 22);
    ctx.fillText('التاريخ', W - 105, y + 22);
    ctx.fillText('النوع', W - 195, y + 22);
    ctx.fillText('الخدمات والأسنان (FDI)', W - 275, y + 22);
    ctx.fillText('الإجمالي', 250, y + 22);
    ctx.fillText('المسدد', 165, y + 22);
    ctx.fillText('المتبقي', 85, y + 22);

    y += 38;

    // Table Rows
    acc.receipts.forEach((rec, idx) => {
      ctx.fillStyle = idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
      ctx.fillRect(26, y, W - 52, rowHeight);
      ctx.strokeStyle = '#E2E8F0';
      ctx.beginPath();
      ctx.moveTo(26, y + rowHeight);
      ctx.lineTo(W - 26, y + rowHeight);
      ctx.stroke();

      const isRet = isReceiptReturnVisit(rec);
      const srvStr =
        (rec.services || []).join(' + ') + (rec.toothFDI ? ` [سن: ${rec.toothFDI}]` : '');

      ctx.textAlign = 'right';
      ctx.fillStyle = '#0284C7';
      ctx.font = '900 12px "JetBrains Mono", monospace';
      ctx.fillText(`#${rec.receiptNo}`, W - 38, y + 22);

      ctx.fillStyle = '#334155';
      ctx.font = '700 11px "JetBrains Mono", monospace';
      ctx.fillText(rec.date, W - 105, y + 22);

      ctx.fillStyle = isRet ? '#4F46E5' : '#0F172A';
      ctx.font = '800 11px "Tajawal", sans-serif';
      ctx.fillText(isRet ? 'عودة' : 'سند', W - 195, y + 22);

      ctx.fillStyle = '#0F172A';
      ctx.font = '700 11px "Tajawal", sans-serif';
      ctx.fillText(srvStr.slice(0, 42), W - 275, y + 22);

      ctx.fillStyle = '#0F172A';
      ctx.font = '800 11px "JetBrains Mono", monospace';
      ctx.fillText(Number(rec.totalAmount || 0).toLocaleString(), 250, y + 22);

      ctx.fillStyle = '#047857';
      ctx.fillText(Number(rec.paidAmount || 0).toLocaleString(), 165, y + 22);

      const rem = Number(rec.remainingAmount || 0);
      ctx.fillStyle = rem > 0 ? '#BE123C' : '#64748B';
      ctx.fillText(rem > 0 ? rem.toLocaleString() : '0', 85, y + 22);

      y += rowHeight;
    });

    // Footer
    ctx.textAlign = 'center';
    ctx.fillStyle = '#64748B';
    ctx.font = '700 11px "Tajawal", sans-serif';
    ctx.fillText(
      `تم إصدار كشف الحساب آلياً من نظام ${settings.identity.clinicAr} — جميع الحقوق محفوظة`,
      W / 2,
      H - 26
    );

    return canvas;
  };

  const buildPatientAccountPdfBlob = async (
    acc: PatientAccountSummary
  ): Promise<{ blob: Blob; fileName: string }> => {
    const canvas = await generatePatientAccountCanvas(acc, 3);
    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    const pdfWidthMm = 210;
    const pdfHeightMm = Math.round((canvas.height / canvas.width) * pdfWidthMm);

    const pdf = new jsPDF({
      orientation: pdfHeightMm > pdfWidthMm ? 'portrait' : 'landscape',
      unit: 'mm',
      format: [pdfWidthMm, pdfHeightMm],
    });
    pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidthMm, pdfHeightMm, undefined, 'FAST');
    const blob = pdf.output('blob');
    const safeName = acc.patientName.replace(/\s+/g, '_').slice(0, 40);
    const fileName = `كشف_حساب_${safeName}_${new Date().toISOString().slice(0, 10)}.pdf`;
    return { blob, fileName };
  };

  const handleDownloadAccountPdf = async (acc: PatientAccountSummary) => {
    if (busyPdfAction) return;
    setBusyPdfAction('download');
    try {
      const { blob, fileName } = await buildPatientAccountPdfBlob(acc);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      notify(`تم تحميل ملف كشف الحساب PDF للمريض (${acc.patientName})`, 'success');
    } catch {
      notify('تعذر إنشاء ملف PDF حالياً', 'error');
    } finally {
      setBusyPdfAction(null);
    }
  };

  const handleShareAccountPdf = async (acc: PatientAccountSummary) => {
    if (busyPdfAction) return;
    setBusyPdfAction('share');
    try {
      const { blob, fileName } = await buildPatientAccountPdfBlob(acc);
      const file = new File([blob], fileName, { type: 'application/pdf' });
      const nav = navigator as Navigator & {
        canShare?: (data?: ShareData) => boolean;
      };
      if (nav.share && (!nav.canShare || nav.canShare({ files: [file] }))) {
        await nav.share({
          title: `كشف حساب: ${acc.patientName}`,
          text: `كشف حساب المريض ${acc.patientName} — ${settings.identity.clinicAr}\nإجمالي الحساب: ${acc.totalBilled.toLocaleString()} ${acc.currency}\nالمسدد: ${acc.totalPaid.toLocaleString()} ${acc.currency}\nالمتبقي: ${acc.totalRemaining.toLocaleString()} ${acc.currency}`,
          files: [file],
        });
        notify('تمت مشاركة ملف كشف الحساب PDF بنجاح', 'success');
      } else {
        // Fallback: download the PDF and copy summary text
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        notify('تم تنزيل ملف كشف الحساب PDF لمشاركته', 'info');
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        // user cancelled share sheet
      } else {
        notify('تعذر مشاركة ملف PDF حالياً', 'warning');
      }
    } finally {
      setBusyPdfAction(null);
    }
  };

  const handleSendAccountPdfToTelegram = async (acc: PatientAccountSummary) => {
    if (busyPdfAction) return;
    const tg = settings.telegramBackup;
    if (!tg?.botToken?.trim() || !tg?.chatId?.trim()) {
      notify(
        'يرجى إدخال رمز البوت (Bot Token) ومعرّف قناة الأرشيف (Chat ID) في الإعدادات > النسخ الاحتياطي أولاً.',
        'warning'
      );
      return;
    }

    setBusyPdfAction('telegram');
    try {
      const { blob, fileName } = await buildPatientAccountPdfBlob(acc);
      const statusText = acc.hasDebt
        ? `عليه دين: ${acc.totalRemaining.toLocaleString()} ${acc.currency}`
        : 'مسدد بالكامل';
      const caption =
        `📄 <b>كشف حساب مريض — ${settings.identity.clinicAr}</b>\n` +
        `👤 <b>المريض:</b> ${acc.patientName}\n` +
        `📞 <b>الهاتف:</b> ${acc.patientPhone || '—'}\n` +
        `📊 <b>الحالة:</b> ${statusText}\n` +
        `🔢 <b>عدد الزيارات:</b> ${acc.visitsCount} (العودات: ${acc.returnVisitsCount})\n` +
        `💰 <b>الإجمالي:</b> ${acc.totalBilled.toLocaleString()} ${acc.currency}\n` +
        `✅ <b>المسدد:</b> ${acc.totalPaid.toLocaleString()} ${acc.currency}\n` +
        `📌 <b>المتبقي:</b> ${acc.totalRemaining.toLocaleString()} ${acc.currency}`;

      const res = await sendPatientAccountPdfToTelegram({
        botToken: tg.botToken,
        chatId: tg.chatId,
        pdfBlob: blob,
        fileName,
        caption,
      });

      if (res.ok) {
        notify(`تم إرسال كشف حساب (${acc.patientName}) PDF إلى قناة الأرشيف بنجاح`, 'success');
      } else {
        notify(res.error || 'تعذر إرسال ملف PDF إلى قناة الأرشيف', 'error');
      }
    } catch {
      notify('حدث خطأ أثناء إرسال ملف PDF إلى قناة تليجرام', 'error');
    } finally {
      setBusyPdfAction(null);
    }
  };

  // ==================== DEDICATED PATIENT ACCOUNT PAGE VIEW ====================
  if (selectedAccount) {
    return (
      <div className="space-y-4">
        {/* 1. Top Navigation & Account Identity Card */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => {
                setSelectedAccountKey(null);
                setConfirmDeleteAccount(false);
                setIsSettlingAccount(false);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold transition-colors"
            >
              <ArrowRight className="w-4 h-4 text-sky-500" />
              <span>رجوع لحسابات المرضى</span>
            </button>

            <div className="flex flex-wrap items-center gap-1.5">
              {selectedAccount.isArchived && (
                <span className="px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 text-xs font-bold">
                  حساب مؤرشف
                </span>
              )}
              <span
                className={`px-3 py-1 rounded-lg text-xs font-black border ${
                  selectedAccount.hasDebt
                    ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30'
                    : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                }`}
              >
                {selectedAccount.hasDebt
                  ? `عليه دين: ${selectedAccount.totalRemaining.toLocaleString()} ${selectedAccount.currency}`
                  : 'مسدد كامل'}
              </span>
            </div>
          </div>

          {/* Patient Name & Metadata */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-sky-600/10 border border-sky-500/30 flex items-center justify-center text-sky-600 dark:text-sky-400 shrink-0">
                  <User className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-slate-100">
                    {selectedAccount.patientName}
                  </h2>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                    {selectedAccount.patientPhone && (
                      <span dir="ltr" className="inline-flex items-center gap-1 font-mono font-bold">
                        <Phone className="w-3.5 h-3.5 text-sky-500" />
                        {selectedAccount.patientPhone}
                      </span>
                    )}
                    <span>إجمالي السندات: {selectedAccount.visitsCount}</span>
                    <span>العودات / المراجعات: {selectedAccount.returnVisitsCount}</span>
                    <span>آخر زيارة: {selectedAccount.lastVisitDate}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Primary Add Receipt / Return Visit Buttons for this Account */}
            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() =>
                  onGoToNewReceipt({
                    patientName: selectedAccount.patientName,
                    patientPhone: selectedAccount.patientPhone,
                    isReturnVisit: false,
                  })
                }
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>سند جديد</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  onGoToNewReceipt({
                    patientName: selectedAccount.patientName,
                    patientPhone: selectedAccount.patientPhone,
                    isReturnVisit: true,
                  })
                }
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>تسجيل عودة</span>
              </button>
            </div>
          </div>

          {/* 3 Financial Summary Cards */}
          <div className="grid grid-cols-3 gap-2.5 pt-1">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3">
              <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                إجمالي الحساب
              </div>
              <div className="text-sm sm:text-base font-mono tabular-nums font-black text-slate-900 dark:text-slate-100 mt-0.5">
                {selectedAccount.totalBilled.toLocaleString()}{' '}
                <span className="text-[10px] font-sans font-bold text-slate-500">
                  {selectedAccount.currency}
                </span>
              </div>
            </div>

            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
              <div className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                إجمالي المسدد
              </div>
              <div className="text-sm sm:text-base font-mono tabular-nums font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
                {selectedAccount.totalPaid.toLocaleString()}{' '}
                <span className="text-[10px] font-sans font-bold">
                  {selectedAccount.currency}
                </span>
              </div>
            </div>

            <div
              className={`rounded-xl border p-3 ${
                selectedAccount.hasDebt
                  ? 'border-rose-500/30 bg-rose-500/5'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950'
              }`}
            >
              <div
                className={`text-[11px] font-bold ${
                  selectedAccount.hasDebt
                    ? 'text-rose-700 dark:text-rose-400'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                المتبقي (الدين)
              </div>
              <div
                className={`text-sm sm:text-base font-mono tabular-nums font-black mt-0.5 ${
                  selectedAccount.hasDebt
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {selectedAccount.totalRemaining.toLocaleString()}{' '}
                <span className="text-[10px] font-sans font-bold">
                  {selectedAccount.currency}
                </span>
              </div>
            </div>
          </div>

          {/* Account-Level Action Bar (PDF, Telegram Archive, Share, Settle, Archive, Delete) */}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {/* Send PDF to Telegram Archive Channel */}
              <button
                type="button"
                disabled={busyPdfAction !== null}
                onClick={() => handleSendAccountPdfToTelegram(selectedAccount)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-60 text-white text-xs font-bold transition-colors"
              >
                {busyPdfAction === 'telegram' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                <span>إرسال PDF لقناة الأرشيف</span>
              </button>

              {/* Share PDF */}
              <button
                type="button"
                disabled={busyPdfAction !== null}
                onClick={() => handleShareAccountPdf(selectedAccount)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-xs font-bold transition-colors"
              >
                {busyPdfAction === 'share' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Share2 className="w-3.5 h-3.5" />
                )}
                <span>مشاركة PDF</span>
              </button>

              {/* Download PDF */}
              <button
                type="button"
                disabled={busyPdfAction !== null}
                onClick={() => handleDownloadAccountPdf(selectedAccount)}
                className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 text-slate-700 dark:text-slate-200 text-xs font-bold transition-colors"
              >
                {busyPdfAction === 'download' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <FileDown className="w-3.5 h-3.5 text-sky-500" />
                )}
                <span>تحميل PDF</span>
              </button>

              {/* Settle Account Debt */}
              {selectedAccount.hasDebt && (
                <button
                  type="button"
                  onClick={() => {
                    setIsSettlingAccount((v) => !v);
                    setAccountSettleAmount(String(selectedAccount.totalRemaining));
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition-colors"
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>تسديد دفعة</span>
                </button>
              )}
            </div>

            {/* Right-side Account Management: Archive & Delete */}
            <div className="flex items-center gap-1.5">
              {onArchivePatientAccount && (
                <button
                  type="button"
                  onClick={() =>
                    onArchivePatientAccount(
                      selectedAccount.accountKey,
                      !selectedAccount.isArchived
                    )
                  }
                  className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 text-slate-700 dark:text-slate-300 text-xs font-bold transition-colors"
                >
                  {selectedAccount.isArchived ? (
                    <>
                      <ArchiveRestore className="w-3.5 h-3.5 text-emerald-500" />
                      <span>استعادة الحساب</span>
                    </>
                  ) : (
                    <>
                      <Archive className="w-3.5 h-3.5 text-amber-500" />
                      <span>أرشفة الحساب</span>
                    </>
                  )}
                </button>
              )}

              {onDeletePatientAccount && (
                <button
                  type="button"
                  onClick={() => setConfirmDeleteAccount((v) => !v)}
                  className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-bold transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>حذف الحساب</span>
                </button>
              )}
            </div>
          </div>

          {/* Inline Account Debt Settlement Form */}
          {isSettlingAccount && selectedAccount.hasDebt && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-bold text-amber-900 dark:text-amber-200">
                تسديد دفعة من حساب ({selectedAccount.patientName}) — المتبقي:{' '}
                <span className="font-mono font-black">
                  {selectedAccount.totalRemaining.toLocaleString()} {selectedAccount.currency}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={accountSettleAmount}
                  onChange={(e) => setAccountSettleAmount(e.target.value)}
                  className="w-32 rounded-lg border border-amber-400 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100"
                  placeholder="0"
                />
                <button
                  type="button"
                  onClick={() => handleSettleWholeAccount(selectedAccount)}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold"
                >
                  تأكيد التسديد
                </button>
                <button
                  type="button"
                  onClick={() => setIsSettlingAccount(false)}
                  className="p-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Inline Account Deletion Confirmation */}
          {confirmDeleteAccount && onDeletePatientAccount && (
            <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-bold text-rose-800 dark:text-rose-200">
                تأكيد حذف حساب المريض ({selectedAccount.patientName}) وجميع سنداته ({selectedAccount.visitsCount} سند) نهائياً؟
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    const keyToDelete = selectedAccount.accountKey;
                    setConfirmDeleteAccount(false);
                    setSelectedAccountKey(null);
                    onDeletePatientAccount(keyToDelete);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold"
                >
                  نعم، احذف الحساب
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDeleteAccount(false)}
                  className="px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold"
                >
                  إلغاء
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 2. Chronological List of All Receipts & Return Visits (السندات والعودات) */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h3 className="text-sm font-black text-slate-900 dark:text-slate-100">
              سجل السندات والعودات ({selectedAccount.receipts.length})
            </h3>
            {selectedAccount.allTeethFDI.length > 0 && (
              <span className="text-xs font-mono font-bold text-sky-600 dark:text-sky-400">
                الأسنان المعالجة (FDI): {selectedAccount.allTeethFDI.join(' - ')}
              </span>
            )}
          </div>

          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {selectedAccount.receipts.map((rec) => {
              const rem = Number(rec.remainingAmount) || 0;
              const isSettlingThis = settlingId === rec.id;
              const isReturn = isReceiptReturnVisit(rec);
              const cleanNotes = stripArchiveMarkerFromNotes(rec.notes);

              return (
                <div
                  key={rec.id}
                  className="p-4 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors space-y-2.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        dir="ltr"
                        className="px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-600 dark:text-sky-400 font-mono tabular-nums font-black text-xs"
                      >
                        #{rec.receiptNo}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${
                          isReturn
                            ? 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {isReturn ? 'عودة / مراجعة' : 'سند أساسي'}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs font-mono tabular-nums text-slate-500">
                        <Calendar className="w-3.5 h-3.5" />
                        {rec.date}
                      </span>
                      {rec.toothFDI && (
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-xs font-mono font-bold text-slate-700 dark:text-slate-300">
                          سن FDI: {rec.toothFDI}
                        </span>
                      )}
                    </div>

                    {/* Financial Badges for this Receipt */}
                    <div className="flex flex-wrap items-center gap-2 text-xs font-mono tabular-nums">
                      <span className="text-slate-600 dark:text-slate-400">
                        الإجمالي: <strong>{Number(rec.totalAmount).toLocaleString()}</strong>
                      </span>
                      <span className="text-emerald-600 dark:text-emerald-400">
                        المسدد: <strong>{Number(rec.paidAmount).toLocaleString()}</strong>
                      </span>
                      {rem > 0 ? (
                        <span className="px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-600 dark:text-rose-400 font-bold">
                          المتبقي: {rem.toLocaleString()} {rec.currency}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-sans font-bold text-[11px]">
                          مسدد
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Services & Notes */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200">
                        {(rec.services || []).join(' + ') || 'كشف ومعاينة'}
                      </div>
                      {cleanNotes && (
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          ملاحظات: {cleanNotes}
                        </div>
                      )}
                    </div>

                    {/* Per-Receipt Actions */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setPreviewReceipt(rec);
                          setPreviewFormat(rec.paperFormat || 'a5');
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 text-xs font-bold"
                        title="معاينة السند"
                      >
                        <Eye className="w-3.5 h-3.5 text-sky-500" />
                        <span>السند</span>
                      </button>

                      {rem > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setSettlingId(isSettlingThis ? null : rec.id);
                            setSettleAmount(String(rem));
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-300 text-xs font-bold"
                        >
                          تسديد
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => onEditReceipt(rec)}
                        className="p-1.5 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400 hover:bg-sky-500/20"
                        title="تعديل السند"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => onDeleteReceipt(rec.id)}
                        className="p-1.5 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20"
                        title="حذف السند"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Inline Single-Receipt Settle Input */}
                  {isSettlingThis && (
                    <div className="pt-2 flex items-center gap-1.5">
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={settleAmount}
                        onChange={(e) => setSettleAmount(e.target.value)}
                        className="w-32 rounded-lg border border-amber-400 bg-white dark:bg-slate-900 px-2.5 py-1 text-xs font-mono tabular-nums font-bold"
                        placeholder="0"
                      />
                      <button
                        type="button"
                        onClick={() => confirmSettle(rec)}
                        className="px-3 py-1 rounded-lg bg-emerald-600 text-white text-xs font-bold"
                      >
                        تأكيد
                      </button>
                      <button
                        type="button"
                        onClick={() => setSettlingId(null)}
                        className="p-1 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-600"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Receipt Preview Modal */}
        {previewReceipt && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-xs overflow-y-auto no-print">
            <div className="relative w-full max-w-3xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-2xl my-auto max-h-[92vh] overflow-y-auto space-y-4">
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
                <div className="text-sm font-black text-slate-900 dark:text-slate-100">
                  معاينة السند #{previewReceipt.receiptNo} — {previewReceipt.patientName}
                </div>
                <button
                  type="button"
                  onClick={() => setPreviewReceipt(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <OfficialReceiptCard
                data={{
                  receiptNo: previewReceipt.receiptNo,
                  date: previewReceipt.date,
                  patientName: previewReceipt.patientName,
                  patientPhone: previewReceipt.patientPhone,
                  services: previewReceipt.services || [],
                  toothFDI: previewReceipt.toothFDI || '',
                  totalAmount: previewReceipt.totalAmount,
                  paidAmount: previewReceipt.paidAmount,
                  remainingAmount: previewReceipt.remainingAmount,
                  currency: String(previewReceipt.currency || defaultCurrency),
                  paymentMethod: previewReceipt.paymentMethod || 'نقداً',
                  notes: stripArchiveMarkerFromNotes(previewReceipt.notes || ''),
                  amountWords: previewReceipt.amountWords || '',
                  accountantSig:
                    previewReceipt.accountantSig ||
                    settings.appearance.permanentAccountantSig ||
                    '',
                  receiverSig: previewReceipt.receiverSig || '',
                  paperFormat: previewFormat,
                }}
                settings={settings}
                onPaperFormatChange={setPreviewFormat}
                notify={notify}
                showToolbar={true}
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  // ==================== MAIN ACCOUNTS & RECEIPTS LEDGER VIEW ====================
  return (
    <div className="space-y-4">
      {/* Top Controls Card */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Segmented View Switcher: حسابات المرضى vs كل السندات */}
          <div className="inline-flex rounded-xl p-1 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setViewMode('accounts')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                viewMode === 'accounts'
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>حسابات المرضى ({summaryCounts.allActive})</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode('receipts')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                viewMode === 'receipts'
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>كل السندات ({receipts.length})</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => onGoToNewReceipt()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-sky-600 hover:bg-sky-500 rounded-xl transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>سند جديد</span>
          </button>
        </div>

        {/* Search Input & Status Filter Tabs */}
        <div className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث باسم المريض، رقم الهاتف، أو رقم السند..."
              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 pr-9 pl-3 py-2 text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:border-sky-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-4 gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 shrink-0">
            {[
              { id: 'all', label: `الكل (${summaryCounts.allActive})` },
              { id: 'debt', label: `عليه دين (${summaryCounts.debtCount})` },
              { id: 'paid', label: `مسدد (${summaryCounts.paidCount})` },
              { id: 'archived', label: `الأرشيف (${summaryCounts.archivedCount})` },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() =>
                  setStatusFilter(tab.id as 'all' | 'debt' | 'paid' | 'archived')
                }
                className={`px-2.5 py-1.5 rounded-md text-[11px] font-bold transition-colors whitespace-nowrap ${
                  statusFilter === tab.id
                    ? 'bg-sky-600 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* VIEW 1: GROUPED PATIENT ACCOUNTS (حسابات المرضى) */}
      {viewMode === 'accounts' ? (
        filteredAccounts.length === 0 ? (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center space-y-3">
            <Users className="w-9 h-9 text-slate-400 mx-auto" />
            <div className="text-sm font-bold text-slate-700 dark:text-slate-300">
              لا توجد حسابات مرضى مطابقة للبحث
            </div>
            <button
              type="button"
              onClick={() => onGoToNewReceipt()}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-sky-600 hover:bg-sky-500 rounded-lg"
            >
              <Plus className="w-4 h-4" />
              <span>إنشاء سند جديد</span>
            </button>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden divide-y divide-slate-200 dark:divide-slate-800">
            {filteredAccounts.map((acc) => (
              <div
                key={acc.accountKey}
                onClick={() => setSelectedAccountKey(acc.accountKey)}
                className="p-3.5 sm:p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer flex items-center justify-between gap-3"
              >
                {/* Right: Patient Name + Visits & Services Summary */}
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm sm:text-base font-black text-slate-900 dark:text-slate-100 hover:text-sky-600 dark:hover:text-sky-400 transition-colors">
                      {acc.patientName}
                    </span>
                    {acc.patientPhone && (
                      <span
                        dir="ltr"
                        className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400"
                      >
                        {acc.patientPhone}
                      </span>
                    )}
                    {acc.isArchived && (
                      <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[10px] font-bold">
                        مؤرشف
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5 text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-bold text-slate-700 dark:text-slate-300">
                      السندات: {acc.visitsCount}
                    </span>
                    {acc.returnVisitsCount > 0 && (
                      <span className="text-indigo-600 dark:text-indigo-400 font-bold">
                        العودات: {acc.returnVisitsCount}
                      </span>
                    )}
                    <span>آخر زيارة: {acc.lastVisitDate}</span>
                    {acc.allServices.length > 0 && (
                      <span className="truncate max-w-xs text-slate-400">
                        • {acc.allServices.slice(0, 3).join(' + ')}
                      </span>
                    )}
                  </div>
                </div>

                {/* Left: Simple Clear Debt / Paid Status Badge */}
                <div className="flex items-center gap-2 shrink-0">
                  {acc.hasDebt ? (
                    <div className="text-left px-3 py-1.5 rounded-xl bg-rose-500/10 border border-rose-500/30">
                      <div className="text-[11px] font-black text-rose-600 dark:text-rose-400">
                        عليه دين
                      </div>
                      <div className="text-xs font-mono tabular-nums font-black text-rose-700 dark:text-rose-300">
                        {acc.totalRemaining.toLocaleString()} {acc.currency}
                      </div>
                    </div>
                  ) : (
                    <div className="px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs font-black text-emerald-700 dark:text-emerald-300">
                      مسدد كامل
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        /* VIEW 2: ALL INDIVIDUAL RECEIPTS TABLE */
        filteredReceipts.length === 0 ? (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center space-y-3">
            <FileSpreadsheet className="w-9 h-9 text-slate-400 mx-auto" />
            <div className="text-sm font-bold text-slate-700 dark:text-slate-300">
              لا توجد سندات مطابقة للبحث
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-[11px] font-bold text-slate-500">
                    <th className="py-3 px-3">رقم</th>
                    <th className="py-3 px-3">المريض</th>
                    <th className="py-3 px-3">الخدمات</th>
                    <th className="py-3 px-3">الإجمالي</th>
                    <th className="py-3 px-3">الحالة</th>
                    <th className="py-3 px-3 text-center">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                  {filteredReceipts.map((r) => {
                    const rem = Number(r.remainingAmount) || 0;
                    const matchedAcc = patientAccounts.find((a) =>
                      a.receipts.some((rec) => rec.id === r.id)
                    );
                    return (
                      <tr
                        key={r.id}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="py-3 px-3 font-mono tabular-nums font-bold text-sky-600 dark:text-sky-400">
                          <span dir="ltr" className="inline-block">
                            #{r.receiptNo}
                          </span>
                          <div className="text-[10px] text-slate-400">{r.date}</div>
                        </td>
                        <td className="py-3 px-3">
                          <button
                            type="button"
                            onClick={() => {
                              if (matchedAcc) {
                                setSelectedAccountKey(matchedAcc.accountKey);
                              }
                            }}
                            className="font-bold text-slate-900 dark:text-slate-100 hover:text-sky-600 dark:hover:text-sky-400 text-right"
                          >
                            {r.patientName}
                          </button>
                          {r.patientPhone && (
                            <div dir="ltr" className="text-[10px] font-mono text-slate-400 text-right">
                              {r.patientPhone}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3 max-w-[180px] truncate text-slate-600 dark:text-slate-300">
                          {(r.services || []).join(' + ') || '—'}
                        </td>
                        <td className="py-3 px-3 font-mono tabular-nums font-bold">
                          {Number(r.totalAmount).toLocaleString()} {r.currency}
                        </td>
                        <td className="py-3 px-3">
                          {rem > 0 ? (
                            <span className="px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-600 dark:text-rose-400 font-bold">
                              عليه دين: {rem.toLocaleString()}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold">
                              مسدد كامل
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex items-center justify-center gap-1">
                            {matchedAcc && (
                              <button
                                type="button"
                                onClick={() => setSelectedAccountKey(matchedAcc.accountKey)}
                                className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold text-[11px]"
                              >
                                الحساب
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => onEditReceipt(r)}
                              className="p-1.5 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400"
                              title="تعديل"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteReceipt(r.id)}
                              className="p-1.5 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400"
                              title="حذف"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}
    </div>
  );
};
