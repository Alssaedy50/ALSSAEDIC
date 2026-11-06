import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { jsPDF } from 'jspdf';
import { Download, FileDown, Loader2, Printer, Share2 } from 'lucide-react';
import { ClinicSettings, PaperFormat } from '../types/clinic';
import { DEFAULT_CLINIC_LOGO_DATA_URI } from '../data/defaultData';

export interface ReceiptDisplayData {
  receiptNo: number;
  date: string;
  patientName: string;
  patientPhone: string;
  services: string[];
  toothFDI: string;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  currency: string;
  paymentMethod: string;
  notes: string;
  amountWords: string;
  accountantSig: string;
  receiverSig: string;
  paperFormat: PaperFormat;
}

interface OfficialReceiptCardProps {
  data: ReceiptDisplayData;
  settings: ClinicSettings;
  onPaperFormatChange?: (format: PaperFormat) => void;
  notify: (message: string, type?: 'success' | 'warning' | 'error' | 'info') => void;
  showToolbar?: boolean;
}

export const OfficialReceiptCard: React.FC<OfficialReceiptCardProps> = ({
  data,
  settings,
  onPaperFormatChange,
  notify,
  showToolbar = true,
}) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const servicesText =
    data.services && data.services.length > 0
      ? data.services.join(' + ')
      : data.notes || 'كشف وخدمات علاجية للأسنان';

  useEffect(() => {
    if (!settings.features.showQrCode) {
      setQrDataUrl('');
      return;
    }
    const qrPayload = [
      settings.identity.clinicAr,
      `سند قبض #${data.receiptNo}`,
      `التاريخ: ${data.date}`,
      `المريض: ${data.patientName || 'غير محدد'}`,
      `الإجمالي: ${data.totalAmount} ${data.currency}`,
      `المقبوض: ${data.paidAmount} ${data.currency}`,
      `المتبقي: ${data.remainingAmount} ${data.currency}`,
    ].join('\n');

    QRCode.toDataURL(qrPayload, {
      width: 240,
      margin: 1,
      color: {
        dark: '#0B2545',
        light: '#FFFFFF',
      },
    })
      .then((url) => setQrDataUrl(url))
      .catch(() => setQrDataUrl(''));
  }, [
    data.receiptNo,
    data.date,
    data.patientName,
    data.totalAmount,
    data.paidAmount,
    data.remainingAmount,
    data.currency,
    settings.features.showQrCode,
    settings.identity.clinicAr,
  ]);

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

  // Ultra-High-Resolution (3x) Canvas generator that draws the EXACT original DOCAI receipt layout
  const generateHighResReceiptCanvas = async (scale = 3): Promise<HTMLCanvasElement> => {
    if (document.fonts && document.fonts.ready) {
      try {
        await document.fonts.ready;
      } catch {
        // ignore font wait errors
      }
    }

    const canvas = document.createElement('canvas');
    const W = 760;
    const H = data.toothFDI ? 620 : 580;
    canvas.width = W * scale;
    canvas.height = H * scale;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(scale, scale);
    ctx.direction = 'rtl';

    // White paper background + outer border
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = settings.appearance.primaryColor || '#0B2545';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, W - 4, H - 4);

    const logoSrc = settings.appearance.customLogoDataUrl || DEFAULT_CLINIC_LOGO_DATA_URI;
    const [logoImg, qrImg, accSigImg, recSigImg] = await Promise.all([
      loadImg(logoSrc),
      loadImg(qrDataUrl),
      loadImg(data.accountantSig),
      loadImg(data.receiverSig),
    ]);

    // Watermark centered in the body area above the QR row so it never overlaps the QR code
    if (logoImg) {
      ctx.save();
      ctx.globalAlpha = (settings.appearance.watermarkOpacity || 6) / 100;
      ctx.drawImage(logoImg, (W - 180) / 2, 175, 180, 180);
      ctx.restore();
    }

    // 1. Tri-zone Header
    ctx.textAlign = 'right';
    ctx.fillStyle = '#0F172A';
    ctx.font = '900 18px "Tajawal", sans-serif';
    ctx.fillText(settings.identity.doctorAr, W - 24, 42);
    ctx.fillStyle = '#075985';
    ctx.font = '800 13px "Tajawal", sans-serif';
    ctx.fillText(settings.identity.specialtyAr, W - 24, 64);

    // Center Logo & Capsule
    if (logoImg) {
      ctx.drawImage(logoImg, (W - 48) / 2, 16, 48, 48);
    }
    ctx.fillStyle = '#0F172A';
    ctx.beginPath();
    ctx.roundRect((W - 220) / 2, 70, 220, 26, 13);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.font = '900 12px "Tajawal", sans-serif';
    ctx.fillText('سند قبض مالي | RECEIPT VOUCHER', W / 2, 87);

    // Left English Identity
    ctx.save();
    ctx.direction = 'ltr';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#0F172A';
    ctx.font = '900 13px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(settings.identity.clinicEn, 24, 42);
    ctx.fillStyle = '#075985';
    ctx.font = '700 12px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(settings.identity.doctorEn, 24, 62);
    ctx.restore();

    // Header bottom line
    ctx.strokeStyle = '#1E293B';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(24, 108);
    ctx.lineTo(W - 24, 108);
    ctx.stroke();

    // 2. Meta Strip (Receipt No, Date, Payment Method)
    ctx.fillStyle = '#F1F5F9';
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(24, 120, W - 48, 38, 10);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = 'right';
    ctx.font = '800 13px "Tajawal", sans-serif';
    ctx.fillStyle = '#64748B';
    ctx.fillText('رقم السند:', W - 38, 144);
    ctx.fillStyle = '#BE123C';
    ctx.font = '900 14px "Tajawal", sans-serif';
    ctx.fillText(`#${data.receiptNo}`, W - 105, 144);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#64748B';
    ctx.font = '800 13px "Tajawal", sans-serif';
    ctx.fillText(`التاريخ: ${data.date}`, W / 2, 144);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#0F172A';
    ctx.fillText(`الدفع: ${data.paymentMethod}`, 38, 144);

    // 3. Patient & Services Rows
    let y = 186;
    const drawDashedLine = (lineY: number) => {
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = '#CBD5E1';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(24, lineY);
      ctx.lineTo(W - 24, lineY);
      ctx.stroke();
      ctx.restore();
    };

    ctx.textAlign = 'right';
    ctx.fillStyle = '#475569';
    ctx.font = '700 14px "Tajawal", sans-serif';
    ctx.fillText('استلمنا من /', W - 24, y);
    ctx.fillStyle = '#020617';
    ctx.font = '900 15px "Tajawal", sans-serif';
    ctx.fillText(`${data.patientName || '....................'} المحترم`, W - 110, y);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#475569';
    ctx.font = '700 13px "Tajawal", sans-serif';
    ctx.fillText(`هاتف: ${data.patientPhone || '—'}`, 24, y);
    drawDashedLine(y + 12);

    y += 38;
    ctx.textAlign = 'right';
    ctx.fillStyle = '#475569';
    ctx.font = '700 14px "Tajawal", sans-serif';
    ctx.fillText('وذلك مقابل (الخدمات العلاجية):', W - 24, y);
    ctx.fillStyle = '#0C4A6E';
    ctx.font = '800 14px "Tajawal", sans-serif';
    ctx.fillText(servicesText, W - 220, y);
    drawDashedLine(y + 12);

    if (data.toothFDI) {
      y += 38;
      ctx.textAlign = 'right';
      ctx.fillStyle = '#475569';
      ctx.font = '700 14px "Tajawal", sans-serif';
      ctx.fillText('أرقام الأسنان (FDI):', W - 24, y);
      ctx.fillStyle = '#0C4A6E';
      ctx.font = '800 14px "Tajawal", sans-serif';
      ctx.fillText(data.toothFDI, W - 165, y);
      drawDashedLine(y + 12);
    }

    y += 38;
    ctx.textAlign = 'right';
    ctx.fillStyle = '#475569';
    ctx.font = '700 14px "Tajawal", sans-serif';
    ctx.fillText('مبلغاً وقدره كتابةً:', W - 24, y);
    ctx.fillStyle = '#0F172A';
    ctx.font = '800 14px "Tajawal", sans-serif';
    ctx.fillText(data.amountWords, W - 155, y);
    drawDashedLine(y + 12);

    // 4. Three Financial Boxes
    y += 26;
    const boxW = (W - 48 - 24) / 3;
    const boxH = 62;

    // Box 1 (Right): Total
    const b1X = W - 24 - boxW;
    ctx.fillStyle = '#F1F5F9';
    ctx.strokeStyle = '#CBD5E1';
    ctx.beginPath();
    ctx.roundRect(b1X, y, boxW, boxH, 12);
    ctx.fill();
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#475569';
    ctx.font = '700 12px "Tajawal", sans-serif';
    ctx.fillText('إجمالي قيمة العلاج', b1X + boxW / 2, y + 22);
    ctx.fillStyle = '#0F172A';
    ctx.font = '900 16px "Tajawal", sans-serif';
    ctx.fillText(`${Number(data.totalAmount).toLocaleString()} ${data.currency}`, b1X + boxW / 2, y + 46);

    // Box 2 (Middle): Paid
    const b2X = b1X - 12 - boxW;
    ctx.fillStyle = '#ECFDF5';
    ctx.strokeStyle = '#6EE7B7';
    ctx.beginPath();
    ctx.roundRect(b2X, y, boxW, boxH, 12);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#047857';
    ctx.font = '700 12px "Tajawal", sans-serif';
    ctx.fillText('المبلغ المقبوض', b2X + boxW / 2, y + 22);
    ctx.fillStyle = '#065F46';
    ctx.font = '900 16px "Tajawal", sans-serif';
    ctx.fillText(`${Number(data.paidAmount).toLocaleString()} ${data.currency}`, b2X + boxW / 2, y + 46);

    // Box 3 (Left): Remaining
    const b3X = 24;
    const hasDebt = Number(data.remainingAmount) > 0;
    ctx.fillStyle = hasDebt ? '#FFF1F2' : '#ECFDF5';
    ctx.strokeStyle = hasDebt ? '#FDA4AF' : '#6EE7B7';
    ctx.beginPath();
    ctx.roundRect(b3X, y, boxW, boxH, 12);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = hasDebt ? '#9F1239' : '#047857';
    ctx.font = '700 12px "Tajawal", sans-serif';
    ctx.fillText('المتبقي على المريض', b3X + boxW / 2, y + 22);
    ctx.font = '900 16px "Tajawal", sans-serif';
    ctx.fillText(`${Number(data.remainingAmount).toLocaleString()} ${data.currency}`, b3X + boxW / 2, y + 46);

    // 5. Signatures & QR Row
    y += boxH + 18;
    ctx.strokeStyle = '#CBD5E1';
    ctx.beginPath();
    ctx.moveTo(24, y);
    ctx.lineTo(W - 24, y);
    ctx.stroke();

    y += 14;
    // Right signature: Accountant
    ctx.fillStyle = '#334155';
    ctx.font = '800 12px "Tajawal", sans-serif';
    ctx.fillText('توقيع الطبيب / المحاسب', b1X + boxW / 2, y + 10);
    ctx.fillStyle = '#F8FAFC';
    ctx.strokeStyle = '#CBD5E1';
    ctx.beginPath();
    ctx.roundRect(b1X, y + 18, boxW, 56, 8);
    ctx.fill();
    ctx.stroke();
    if (accSigImg) {
      ctx.drawImage(accSigImg, b1X + 20, y + 22, boxW - 40, 48);
    } else {
      ctx.fillStyle = '#94A3B8';
      ctx.font = '600 11px "Tajawal", sans-serif';
      ctx.fillText('التوقيع والختم', b1X + boxW / 2, y + 50);
    }

    // Center QR & Notes
    if (qrImg) {
      ctx.fillStyle = '#FFFFFF';
      ctx.strokeStyle = '#E2E8F0';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(W / 2 - 40, y + 2, 80, 76, 8);
      ctx.fill();
      ctx.stroke();
      ctx.drawImage(qrImg, W / 2 - 35, y + 5, 70, 70);
    }
    ctx.fillStyle = '#475569';
    ctx.font = '700 11px "Tajawal", sans-serif';
    ctx.fillText(
      data.notes || 'نتمنى لكم دوام الصحة والابتسامة المشرقة',
      W / 2,
      y + 90
    );

    // Left signature: Receiver
    ctx.fillStyle = '#334155';
    ctx.font = '800 12px "Tajawal", sans-serif';
    ctx.fillText('توقيع المريض / المستلم', b3X + boxW / 2, y + 10);
    ctx.fillStyle = '#F8FAFC';
    ctx.strokeStyle = '#CBD5E1';
    ctx.beginPath();
    ctx.roundRect(b3X, y + 18, boxW, 56, 8);
    ctx.fill();
    ctx.stroke();
    if (recSigImg) {
      ctx.drawImage(recSigImg, b3X + 20, y + 22, boxW - 40, 48);
    } else {
      ctx.fillStyle = '#94A3B8';
      ctx.font = '600 11px "Tajawal", sans-serif';
      ctx.fillText('توقيع المستلم', b3X + boxW / 2, y + 50);
    }

    // 6. Footer Address & Phones
    const footerY = H - 34;
    ctx.strokeStyle = '#1E293B';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(24, footerY);
    ctx.lineTo(W - 24, footerY);
    ctx.stroke();

    ctx.textAlign = 'right';
    ctx.fillStyle = '#334155';
    ctx.font = '700 12px "Tajawal", sans-serif';
    ctx.fillText(`العنوان: ${settings.identity.address}`, W - 24, footerY + 20);

    ctx.save();
    ctx.direction = 'ltr';
    ctx.textAlign = 'left';
    ctx.font = '700 12px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(settings.identity.phones, 24, footerY + 20);
    ctx.restore();

    return canvas;
  };

  const canvasToBlob = (canvas: HTMLCanvasElement): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Failed to create PNG blob'));
        },
        'image/png',
        1.0
      );
    });
  };

  const generatePDFBlob = async (): Promise<Blob> => {
    const canvas = await generateHighResReceiptCanvas(3);
    const imgDataUrl = canvas.toDataURL('image/png', 1.0);
    const isThermal = data.paperFormat === 'thermal80';

    if (isThermal) {
      const pdfW = 80;
      const pdfH = Math.round((canvas.height / canvas.width) * pdfW);
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: [pdfW, pdfH],
      });
      pdf.addImage(imgDataUrl, 'PNG', 0, 0, pdfW, pdfH, undefined, 'FAST');
      return pdf.output('blob');
    } else {
      // Standard A5 Landscape (210mm x 148mm)
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a5',
      });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      pdf.addImage(imgDataUrl, 'PNG', 0, 0, pageW, pageH, undefined, 'FAST');
      return pdf.output('blob');
    }
  };

  const triggerBlobDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const getCleanBaseFileName = () => {
    const cleanPatient = (data.patientName || 'Patient')
      .trim()
      .replace(/[^\u0600-\u06FFa-zA-Z0-9_-]+/g, '_');
    return `Receipt_${data.receiptNo}_${cleanPatient}`;
  };

  // 1. Download Ultra-HD PNG Image
  const handleDownloadHDImage = async () => {
    setBusyAction('png');
    try {
      const canvas = await generateHighResReceiptCanvas(3);
      const blob = await canvasToBlob(canvas);
      const fileName = `${getCleanBaseFileName()}.png`;
      triggerBlobDownload(blob, fileName);
      notify(`تم تحميل صورة السند #${data.receiptNo} بجودة فائقة (3x HD)`, 'success');
    } catch {
      notify('تعذر تحميل صورة السند', 'error');
    } finally {
      setBusyAction(null);
    }
  };

  // 2. Download Official High-Resolution PDF File directly
  const handleDownloadPDFFile = async () => {
    setBusyAction('pdf');
    try {
      const pdfBlob = await generatePDFBlob();
      const fileName = `${getCleanBaseFileName()}.pdf`;
      triggerBlobDownload(pdfBlob, fileName);
      notify(`تم تحميل ملف السند #${data.receiptNo} بصيغة PDF عالية الجودة`, 'success');
    } catch {
      notify('تعذر إنشاء ملف PDF للسند', 'error');
    } finally {
      setBusyAction(null);
    }
  };

  // 3. Share Receipt directly as High-Res Image or PDF file to Client (WhatsApp / Telegram / System Share)
  const handleShareFileWithClient = async (format: 'png' | 'pdf') => {
    setBusyAction(`share_${format}`);
    try {
      const baseName = getCleanBaseFileName();
      let file: File;
      if (format === 'pdf') {
        const pdfBlob = await generatePDFBlob();
        file = new File([pdfBlob], `${baseName}.pdf`, { type: 'application/pdf' });
      } else {
        const canvas = await generateHighResReceiptCanvas(3);
        const pngBlob = await canvasToBlob(canvas);
        file = new File([pngBlob], `${baseName}.png`, { type: 'image/png' });
      }

      const shareCaption = [
        `${settings.identity.clinicAr} — ${settings.identity.doctorAr}`,
        `سند قبض مالي رقم #${data.receiptNo}`,
        `المريض: ${data.patientName || 'غير محدد'}`,
        `المبلغ المقبوض: ${Number(data.paidAmount).toLocaleString()} ${data.currency}`,
        `المتبقي: ${Number(data.remainingAmount).toLocaleString()} ${data.currency}`,
      ].join('\n');

      // Check if Web Share API with files is supported on the user's phone
      if (
        typeof navigator !== 'undefined' &&
        typeof navigator.share === 'function' &&
        (!navigator.canShare || navigator.canShare({ files: [file] }))
      ) {
        await navigator.share({
          title: `سند قبض #${data.receiptNo} - ${settings.identity.clinicAr}`,
          text: shareCaption,
          files: [file],
        });
        notify('تمت مشاركة ملف السند بنجاح', 'success');
        return;
      }

      // Fallback if inside restricted desktop/iframe that blocks navigator.share:
      // Download the file directly AND copy caption to clipboard
      triggerBlobDownload(file, file.name);
      await navigator.clipboard?.writeText(shareCaption).catch(() => {});
      notify(
        `تم حفظ ملف السند (${format.toUpperCase()}) بجودة فائقة ونسخ التفاصيل لإرساله للعميل`,
        'success'
      );
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // User closed the share sheet
        return;
      }
      notify('تم تجهيز السند للمشاركة', 'info');
    } finally {
      setBusyAction(null);
    }
  };

  const handlePrintDirect = () => {
    if (data.paperFormat === 'thermal80') {
      document.body.classList.add('thermal-80mm-mode');
    } else {
      document.body.classList.remove('thermal-80mm-mode');
    }
    window.print();
  };

  const logoSrc = settings.appearance.customLogoDataUrl || DEFAULT_CLINIC_LOGO_DATA_URI;
  const hasRemaining = (Number(data.remainingAmount) || 0) > 0;

  return (
    <div className="w-full max-w-full space-y-3">
      {/* High-Resolution Download & Client Share Toolbar */}
      {showToolbar && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 space-y-2.5 no-print">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                صيغة الورق:
              </span>
              <select
                value={data.paperFormat}
                onChange={(e) => onPaperFormatChange?.(e.target.value as PaperFormat)}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 text-xs font-bold text-slate-900 dark:text-slate-100"
              >
                <option value="a5">قياس A5 قياسي</option>
                <option value="thermal80">حراري 80mm</option>
              </select>
            </div>

            <button
              type="button"
              onClick={handlePrintDirect}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>طباعة مباشرة</span>
            </button>
          </div>

          {/* 4 Action Buttons: Download PNG, Download PDF, Share PNG, Share PDF */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={handleDownloadHDImage}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-black transition-colors"
            >
              {busyAction === 'png' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5 shrink-0" />
              )}
              <span>تحميل صورة HD</span>
            </button>

            <button
              type="button"
              disabled={busyAction !== null}
              onClick={handleDownloadPDFFile}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-black transition-colors"
            >
              {busyAction === 'pdf' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <FileDown className="w-3.5 h-3.5 shrink-0" />
              )}
              <span>تحميل ملف PDF</span>
            </button>

            <button
              type="button"
              disabled={busyAction !== null}
              onClick={() => handleShareFileWithClient('png')}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-black transition-colors"
            >
              {busyAction === 'share_png' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Share2 className="w-3.5 h-3.5 shrink-0" />
              )}
              <span>مشاركة كصورة</span>
            </button>

            <button
              type="button"
              disabled={busyAction !== null}
              onClick={() => handleShareFileWithClient('pdf')}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white text-xs font-black transition-colors"
            >
              {busyAction === 'share_pdf' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Share2 className="w-3.5 h-3.5 shrink-0" />
              )}
              <span>مشاركة كملف PDF</span>
            </button>
          </div>
        </div>
      )}

      {/* ==================== EXACT ORIGINAL DOCAI RECEIPT CARD ==================== */}
      <div
        id="receipt-capture-area"
        style={{ borderColor: settings.appearance.primaryColor || '#0B2545' }}
        className={`receipt-paper rounded-2xl p-3.5 sm:p-6 shadow-xl relative overflow-hidden border-2 mx-auto ${
          data.paperFormat === 'thermal80' ? 'max-w-[360px]' : 'w-full'
        }`}
      >
        {/* العلامة المائية في الخلفية */}
        <img
          src={logoSrc}
          alt=""
          aria-hidden="true"
          referrerPolicy="no-referrer"
          className="pointer-events-none select-none absolute top-32 left-1/2 -translate-x-1/2 w-44 h-44 sm:w-52 sm:h-52 object-contain"
          style={{ opacity: (settings.appearance.watermarkOpacity || 6) / 100 }}
        />

        {/* ترويسة السند الثلاثية */}
        <div className="relative z-10 flex flex-col sm:flex-row items-center justify-between border-b-2 border-slate-800 pb-3.5 mb-3.5 gap-2.5 text-center sm:text-right">
          {/* يمين: بيانات العيادة بالعربية */}
          <div className="space-y-0.5 sm:text-right">
            <div className="text-base sm:text-lg font-black text-slate-900">
              {settings.identity.doctorAr}
            </div>
            <div className="text-xs font-extrabold text-sky-800">
              {settings.identity.specialtyAr}
            </div>
            <div className="text-[11px] font-bold text-slate-600">
              {settings.identity.clinicAr}
            </div>
          </div>

          {/* وسط: الشعار وعنوان السند */}
          <div className="flex flex-col items-center shrink-0">
            <img
              src={logoSrc}
              alt="Clinic Logo"
              referrerPolicy="no-referrer"
              className="w-12 h-12 sm:w-14 sm:h-14 object-contain mb-1 rounded-lg"
            />
            <div className="px-3 sm:px-4 py-1 rounded-full bg-slate-900 text-white text-[10px] sm:text-xs font-black">
              سند قبض مالي | RECEIPT VOUCHER
            </div>
          </div>

          {/* يسار: بيانات العيادة بالإنجليزية */}
          <div className="sm:text-left space-y-0.5" dir="ltr">
            <div className="text-xs sm:text-sm font-black text-slate-900">
              {settings.identity.clinicEn}
            </div>
            <div className="text-xs font-bold text-sky-800">
              {settings.identity.doctorEn}
            </div>
          </div>
        </div>

        {/* شريط رقم السند والتاريخ وطريقة الدفع */}
        <div className="relative z-10 grid grid-cols-3 gap-1.5 sm:gap-2 bg-slate-100 border border-slate-300 rounded-xl p-2 sm:p-2.5 mb-3.5 text-[11px] sm:text-xs">
          <div className="truncate">
            <span className="text-slate-500 font-bold">رقم السند:</span>
            <span className="font-black text-rose-700 mr-1 font-mono tabular-nums">
              #{data.receiptNo}
            </span>
          </div>
          <div className="text-center truncate">
            <span className="text-slate-500 font-bold">التاريخ:</span>
            <span className="font-extrabold text-slate-900 mr-1 font-mono tabular-nums">
              {data.date}
            </span>
          </div>
          <div className="text-left truncate">
            <span className="text-slate-500 font-bold">الدفع:</span>
            <span className="font-extrabold text-slate-900 mr-1">
              {data.paymentMethod}
            </span>
          </div>
        </div>

        {/* تفاصيل المريض والخدمات */}
        <div className="relative z-10 space-y-2.5 text-xs sm:text-sm mb-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-dashed border-slate-300 pb-2">
            <div className="min-w-0">
              <span className="font-bold text-slate-600">استلمنا من /</span>
              <span className="font-black text-slate-950 mr-1 break-words">
                {data.patientName || '....................'}
              </span>
              <span className="font-bold text-slate-600 mr-1">المحترم</span>
            </div>
            <div className="shrink-0">
              <span className="font-bold text-slate-600">هاتف:</span>
              <span dir="ltr" className="font-bold text-slate-800 mr-1 font-mono tabular-nums">
                {data.patientPhone || '—'}
              </span>
            </div>
          </div>

          <div className="border-b border-dashed border-slate-300 pb-2">
            <span className="font-bold text-slate-600">وذلك مقابل (الخدمات العلاجية):</span>
            <span className="font-extrabold text-sky-900 mr-2 break-words">
              {servicesText}
            </span>
          </div>

          {data.toothFDI && (
            <div className="border-b border-dashed border-slate-300 pb-2">
              <span className="font-bold text-slate-600">أرقام الأسنان (FDI):</span>
              <span dir="ltr" className="font-extrabold text-sky-900 mr-2 font-mono tabular-nums">
                {data.toothFDI}
              </span>
            </div>
          )}

          <div className="border-b border-dashed border-slate-300 pb-2">
            <span className="font-bold text-slate-600">مبلغاً وقدره كتابةً:</span>
            <span className="font-extrabold text-slate-900 mr-2 break-words">
              {data.amountWords}
            </span>
          </div>
        </div>

        {/* الصناديق المالية الثلاثة */}
        <div className="relative z-10 grid grid-cols-3 gap-2 sm:gap-3 mb-3.5 text-center">
          <div className="bg-slate-100 border border-slate-300 rounded-xl p-2 sm:p-2.5">
            <div className="text-[10px] sm:text-[11px] font-bold text-slate-600">
              إجمالي قيمة العلاج
            </div>
            <div className="text-xs sm:text-base font-black text-slate-900 mt-0.5 font-mono tabular-nums">
              {Number(data.totalAmount).toLocaleString()} {data.currency}
            </div>
          </div>

          <div className="bg-emerald-50 border border-emerald-300 rounded-xl p-2 sm:p-2.5">
            <div className="text-[10px] sm:text-[11px] font-bold text-emerald-700">
              المبلغ المقبوض
            </div>
            <div className="text-xs sm:text-base font-black text-emerald-800 mt-0.5 font-mono tabular-nums">
              {Number(data.paidAmount).toLocaleString()} {data.currency}
            </div>
          </div>

          <div
            className={`rounded-xl p-2 sm:p-2.5 border ${
              hasRemaining
                ? 'bg-rose-50 border-rose-300 text-rose-800'
                : 'bg-emerald-50 border-emerald-300 text-emerald-800'
            }`}
          >
            <div className="text-[10px] sm:text-[11px] font-bold">المتبقي على المريض</div>
            <div className="text-xs sm:text-base font-black mt-0.5 font-mono tabular-nums">
              {Number(data.remainingAmount).toLocaleString()} {data.currency}
            </div>
          </div>
        </div>

        {/* ملاحظات + التوقيعات + رمز QR */}
        <div className="relative z-10 grid grid-cols-12 gap-2 sm:gap-3 items-center pt-2 border-t border-slate-300">
          <div className="col-span-4 text-center">
            <div className="text-[10px] sm:text-[11px] font-extrabold text-slate-700 mb-1">
              توقيع الطبيب / المحاسب
            </div>
            <div className="h-14 border border-dashed border-slate-300 rounded-lg flex items-center justify-center bg-slate-50 overflow-hidden">
              {data.accountantSig ? (
                <img
                  src={data.accountantSig}
                  className="max-h-12 object-contain"
                  alt="Accountant Signature"
                />
              ) : (
                <span className="text-[10px] text-slate-400">التوقيع والختم</span>
              )}
            </div>
          </div>

          <div className="col-span-4 flex flex-col items-center justify-center">
            {settings.features.showQrCode && qrDataUrl && (
              <div className="p-1 bg-white border border-slate-200 rounded-lg flex items-center justify-center">
                <img
                  src={qrDataUrl}
                  alt="QR Code"
                  className="w-16 h-16 sm:w-20 sm:h-20 object-contain block"
                />
              </div>
            )}
            <div className="text-[9px] sm:text-[10px] font-bold text-slate-600 text-center mt-1 leading-tight">
              {data.notes || 'نتمنى لكم دوام الصحة والابتسامة المشرقة'}
            </div>
          </div>

          <div className="col-span-4 text-center">
            <div className="text-[10px] sm:text-[11px] font-extrabold text-slate-700 mb-1">
              توقيع المريض / المستلم
            </div>
            <div className="h-14 border border-dashed border-slate-300 rounded-lg flex items-center justify-center bg-slate-50 overflow-hidden">
              {data.receiverSig ? (
                <img
                  src={data.receiverSig}
                  className="max-h-12 object-contain"
                  alt="Receiver Signature"
                />
              ) : (
                <span className="text-[10px] text-slate-400">توقيع المستلم</span>
              )}
            </div>
          </div>
        </div>

        {/* تذييل العنوان وأرقام الهواتف */}
        <div className="relative z-10 mt-3.5 pt-2.5 border-t-2 border-slate-800 flex flex-col sm:flex-row items-center justify-between text-[10px] sm:text-[11px] font-bold text-slate-700 gap-1 text-center sm:text-right">
          <div>
            العنوان: <span>{settings.identity.address}</span>
          </div>
          <div dir="ltr" className="font-mono tabular-nums">
            {settings.identity.phones}
          </div>
        </div>
      </div>
    </div>
  );
};
