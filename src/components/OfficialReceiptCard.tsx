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

  const wrapCanvasText = (
    ctx: CanvasRenderingContext2D,
    text: string,
    maxWidth: number
  ): string[] => {
    const clean = String(text || '').trim();
    if (!clean) return ['—'];
    const words = clean.split(/\s+/);
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      if (ctx.measureText(testLine).width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) lines.push(currentLine);
    return lines.length > 0 ? lines : [clean];
  };

  const phoneItems = String(settings.identity.phones || '')
    .split(/\s*(?:[,،|/]|\s-\s)\s*/)
    .map((p) => p.trim())
    .filter(Boolean);

  // Ultra-High-Resolution (3x) Canvas generator supporting both A5 Landscape and 80mm Thermal Vertical layouts
  const generateHighResReceiptCanvas = async (scale = 3): Promise<HTMLCanvasElement> => {
    if (document.fonts && document.fonts.ready) {
      try {
        await document.fonts.ready;
      } catch {
        // ignore font wait errors
      }
    }

    const logoSrc = settings.appearance.customLogoDataUrl || DEFAULT_CLINIC_LOGO_DATA_URI;
    const [logoImg, qrImg, accSigImg, recSigImg] = await Promise.all([
      loadImg(logoSrc),
      loadImg(qrDataUrl),
      loadImg(data.accountantSig),
      loadImg(data.receiverSig),
    ]);

    const canvas = document.createElement('canvas');
    const measureCtx = canvas.getContext('2d')!;

    // ==================== 80mm THERMAL VERTICAL RECEIPT ====================
    if (data.paperFormat === 'thermal80') {
      const W = 340;
      measureCtx.font = '800 13px "Tajawal", sans-serif';
      const serviceLines = wrapCanvasText(measureCtx, servicesText, W - 40);
      const wordsLines = wrapCanvasText(measureCtx, data.amountWords, W - 40);
      const notesLines = wrapCanvasText(
        measureCtx,
        data.notes || 'نتمنى لكم دوام الصحة والابتسامة المشرقة',
        W - 40
      );

      const H =
        540 +
        serviceLines.length * 20 +
        wordsLines.length * 20 +
        notesLines.length * 18 +
        (data.toothFDI ? 34 : 0) +
        (qrImg ? 96 : 0);

      canvas.width = W * scale;
      canvas.height = H * scale;
      const ctx = canvas.getContext('2d')!;
      ctx.scale(scale, scale);
      ctx.direction = 'rtl';

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = settings.appearance.primaryColor || '#0B2545';
      ctx.lineWidth = 3;
      ctx.strokeRect(2, 2, W - 4, H - 4);

      let y = 20;
      if (logoImg) {
        ctx.drawImage(logoImg, (W - 44) / 2, y, 44, 44);
        y += 52;
      }

      ctx.textAlign = 'center';
      ctx.fillStyle = '#0F172A';
      ctx.font = '900 15px "Tajawal", sans-serif';
      ctx.fillText(settings.identity.clinicAr, W / 2, y);
      y += 20;
      ctx.fillStyle = '#075985';
      ctx.font = '800 13px "Tajawal", sans-serif';
      ctx.fillText(settings.identity.doctorAr, W / 2, y);
      y += 18;
      ctx.fillStyle = '#475569';
      ctx.font = '700 11px "Tajawal", sans-serif';
      ctx.fillText(settings.identity.specialtyAr, W / 2, y);
      y += 16;

      ctx.fillStyle = '#0F172A';
      ctx.beginPath();
      ctx.roundRect((W - 200) / 2, y, 200, 24, 12);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '900 11px "Tajawal", sans-serif';
      ctx.fillText('سند قبض مالي | RECEIPT', W / 2, y + 16);
      y += 34;

      // Meta box
      ctx.fillStyle = '#F1F5F9';
      ctx.strokeStyle = '#CBD5E1';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(14, y, W - 28, 46, 8);
      ctx.fill();
      ctx.stroke();

      ctx.textAlign = 'right';
      ctx.fillStyle = '#64748B';
      ctx.font = '800 12px "Tajawal", sans-serif';
      ctx.fillText('رقم السند:', W - 24, y + 18);
      ctx.save();
      ctx.direction = 'ltr';
      ctx.textAlign = 'right';
      ctx.fillStyle = '#BE123C';
      ctx.font = '900 13px "JetBrains Mono", monospace';
      ctx.fillText(`#${data.receiptNo}`, W - 85, y + 18);
      ctx.restore();

      ctx.textAlign = 'left';
      ctx.fillStyle = '#0F172A';
      ctx.font = '800 12px "JetBrains Mono", monospace';
      ctx.fillText(data.date, 24, y + 18);

      ctx.textAlign = 'center';
      ctx.fillStyle = '#334155';
      ctx.font = '800 11px "Tajawal", sans-serif';
      ctx.fillText(`طريقة الدفع: ${data.paymentMethod}`, W / 2, y + 38);
      y += 62;

      // Patient row
      ctx.textAlign = 'right';
      ctx.fillStyle = '#475569';
      ctx.font = '700 12px "Tajawal", sans-serif';
      ctx.fillText('المريض:', W - 16, y);
      ctx.fillStyle = '#020617';
      ctx.font = '900 13px "Tajawal", sans-serif';
      ctx.fillText(data.patientName || '....................', W - 64, y);
      y += 20;

      if (data.patientPhone) {
        ctx.fillStyle = '#475569';
        ctx.font = '700 12px "Tajawal", sans-serif';
        ctx.fillText('هاتف:', W - 16, y);
        ctx.save();
        ctx.direction = 'ltr';
        ctx.textAlign = 'right';
        ctx.fillStyle = '#0F172A';
        ctx.font = '700 12px "JetBrains Mono", monospace';
        ctx.fillText(data.patientPhone, W - 56, y);
        ctx.restore();
        y += 20;
      }

      // Services
      ctx.fillStyle = '#475569';
      ctx.font = '700 12px "Tajawal", sans-serif';
      ctx.fillText('الخدمات العلاجية:', W - 16, y);
      y += 18;
      ctx.fillStyle = '#0C4A6E';
      ctx.font = '800 13px "Tajawal", sans-serif';
      for (const line of serviceLines) {
        ctx.fillText(line, W - 16, y);
        y += 20;
      }

      if (data.toothFDI) {
        ctx.textAlign = 'right';
        ctx.fillStyle = '#475569';
        ctx.font = '700 12px "Tajawal", sans-serif';
        const fdiLabel = 'أرقام الأسنان (FDI):';
        ctx.fillText(fdiLabel, W - 16, y);
        const fdiLabelW = ctx.measureText(fdiLabel).width;
        ctx.save();
        ctx.direction = 'ltr';
        ctx.textAlign = 'right';
        ctx.fillStyle = '#0C4A6E';
        ctx.font = '800 12px "JetBrains Mono", monospace';
        ctx.fillText(data.toothFDI, W - 16 - fdiLabelW - 8, y);
        ctx.restore();
        y += 22;
      }

      // Amount in words
      ctx.fillStyle = '#475569';
      ctx.font = '700 12px "Tajawal", sans-serif';
      ctx.fillText('المبلغ كتابةً:', W - 16, y);
      y += 18;
      ctx.fillStyle = '#0F172A';
      ctx.font = '800 12px "Tajawal", sans-serif';
      for (const line of wordsLines) {
        ctx.fillText(line, W - 16, y);
        y += 20;
      }
      y += 6;

      // Stacked financial boxes for 80mm thermal
      const drawThermalAmountRow = (
        label: string,
        val: string,
        bg: string,
        border: string,
        color: string
      ) => {
        ctx.fillStyle = bg;
        ctx.strokeStyle = border;
        ctx.beginPath();
        ctx.roundRect(14, y, W - 28, 34, 8);
        ctx.fill();
        ctx.stroke();
        ctx.textAlign = 'right';
        ctx.fillStyle = color;
        ctx.font = '800 12px "Tajawal", sans-serif';
        ctx.fillText(label, W - 24, y + 22);
        ctx.textAlign = 'left';
        ctx.font = '900 13px "Tajawal", sans-serif';
        ctx.fillText(val, 24, y + 22);
        y += 40;
      };

      drawThermalAmountRow(
        'إجمالي العلاج:',
        `${Number(data.totalAmount).toLocaleString()} ${data.currency}`,
        '#F1F5F9',
        '#CBD5E1',
        '#0F172A'
      );
      drawThermalAmountRow(
        'المبلغ المقبوض:',
        `${Number(data.paidAmount).toLocaleString()} ${data.currency}`,
        '#ECFDF5',
        '#6EE7B7',
        '#065F46'
      );
      const hasDebt = Number(data.remainingAmount) > 0;
      drawThermalAmountRow(
        'المتبقي على المريض:',
        `${Number(data.remainingAmount).toLocaleString()} ${data.currency}`,
        hasDebt ? '#FFF1F2' : '#ECFDF5',
        hasDebt ? '#FDA4AF' : '#6EE7B7',
        hasDebt ? '#9F1239' : '#065F46'
      );

      y += 6;
      // Signatures side by side
      const sigW = (W - 36) / 2;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#334155';
      ctx.font = '800 11px "Tajawal", sans-serif';
      ctx.fillText('توقيع الطبيب', W - 14 - sigW / 2, y + 10);
      ctx.fillText('توقيع المريض', 14 + sigW / 2, y + 10);

      ctx.fillStyle = '#F8FAFC';
      ctx.strokeStyle = '#CBD5E1';
      ctx.beginPath();
      ctx.roundRect(W - 14 - sigW, y + 16, sigW, 48, 6);
      ctx.roundRect(14, y + 16, sigW, 48, 6);
      ctx.fill();
      ctx.stroke();

      if (accSigImg) {
        ctx.drawImage(accSigImg, W - 14 - sigW + 10, y + 20, sigW - 20, 40);
      }
      if (recSigImg) {
        ctx.drawImage(recSigImg, 24, y + 20, sigW - 20, 40);
      }
      y += 76;

      if (qrImg) {
        ctx.drawImage(qrImg, (W - 76) / 2, y, 76, 76);
        y += 86;
      }

      ctx.textAlign = 'center';
      ctx.fillStyle = '#475569';
      ctx.font = '700 11px "Tajawal", sans-serif';
      for (const line of notesLines) {
        ctx.fillText(line, W / 2, y);
        y += 16;
      }

      y += 6;
      ctx.strokeStyle = '#1E293B';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(14, y);
      ctx.lineTo(W - 14, y);
      ctx.stroke();
      y += 16;

      ctx.fillStyle = '#334155';
      ctx.font = '700 11px "Tajawal", sans-serif';
      ctx.fillText(settings.identity.address, W / 2, y);
      y += 16;
      ctx.save();
      ctx.direction = 'ltr';
      ctx.font = '700 11px "JetBrains Mono", monospace';
      ctx.fillText(phoneItems.join(' | '), W / 2, y);
      ctx.restore();

      return canvas;
    }

    // ==================== STANDARD A5 LANDSCAPE RECEIPT ====================
    const W = 760;
    measureCtx.font = '800 14px "Tajawal", sans-serif';
    const serviceLines = wrapCanvasText(measureCtx, servicesText, W - 240);
    const wordsLines = wrapCanvasText(measureCtx, data.amountWords, W - 180);
    measureCtx.font = '700 11px "Tajawal", sans-serif';
    const notesLines = wrapCanvasText(
      measureCtx,
      data.notes || 'نتمنى لكم دوام الصحة والابتسامة المشرقة',
      240
    );

    const extraServiceH = Math.max(0, serviceLines.length - 1) * 22;
    const extraWordsH = Math.max(0, wordsLines.length - 1) * 22;
    const extraNotesH = Math.max(0, notesLines.length - 1) * 16;

    const H =
      (data.toothFDI ? 640 : 600) + extraServiceH + extraWordsH + extraNotesH;

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

    // Subtle Watermark centered cleanly in the upper body area so it never overlaps financial boxes or text
    if (logoImg) {
      ctx.save();
      ctx.globalAlpha = Math.min(settings.appearance.watermarkOpacity || 4, 5) / 100;
      ctx.drawImage(logoImg, (W - 140) / 2, 168, 140, 140);
      ctx.restore();
    }

    // 1. Tri-zone Header
    ctx.textAlign = 'right';
    ctx.fillStyle = '#0F172A';
    ctx.font = '900 18px "Tajawal", sans-serif';
    ctx.fillText(settings.identity.doctorAr, W - 24, 38);
    ctx.fillStyle = '#075985';
    ctx.font = '800 13px "Tajawal", sans-serif';
    ctx.fillText(settings.identity.specialtyAr, W - 24, 59);
    ctx.fillStyle = '#475569';
    ctx.font = '700 12px "Tajawal", sans-serif';
    ctx.fillText(settings.identity.clinicAr, W - 24, 79);

    // Center Logo & Capsule
    if (logoImg) {
      ctx.drawImage(logoImg, (W - 48) / 2, 14, 48, 48);
    }
    ctx.fillStyle = '#0F172A';
    ctx.beginPath();
    ctx.roundRect((W - 224) / 2, 68, 224, 26, 13);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.font = '900 12px "Tajawal", sans-serif';
    ctx.fillText('سند قبض مالي | RECEIPT VOUCHER', W / 2, 85);

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
    ctx.moveTo(24, 106);
    ctx.lineTo(W - 24, 106);
    ctx.stroke();

    // 2. Meta Strip (Receipt No, Date, Payment Method)
    ctx.fillStyle = '#F1F5F9';
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(24, 118, W - 48, 38, 10);
    ctx.fill();
    ctx.stroke();

    // Right: Receipt Number
    ctx.textAlign = 'right';
    ctx.font = '800 13px "Tajawal", sans-serif';
    ctx.fillStyle = '#64748B';
    const noLabel = 'رقم السند:';
    ctx.fillText(noLabel, W - 38, 142);
    const noLabelW = ctx.measureText(noLabel).width;
    ctx.save();
    ctx.direction = 'ltr';
    ctx.textAlign = 'right';
    ctx.fillStyle = '#BE123C';
    ctx.font = '900 14px "JetBrains Mono", monospace';
    ctx.fillText(`#${data.receiptNo}`, W - 38 - noLabelW - 8, 142);
    ctx.restore();

    // Center: Date (rendered with LTR direction on the date value so YYYY-MM-DD never reverses)
    ctx.font = '800 13px "Tajawal", sans-serif';
    const dateLabel = 'التاريخ:';
    const dateLabelW = ctx.measureText(dateLabel).width;
    ctx.font = '800 13px "JetBrains Mono", monospace';
    const dateValW = ctx.measureText(data.date).width;
    const totalDateW = dateLabelW + 8 + dateValW;
    const dateStartRight = W / 2 + totalDateW / 2;

    ctx.textAlign = 'right';
    ctx.fillStyle = '#64748B';
    ctx.font = '800 13px "Tajawal", sans-serif';
    ctx.fillText(dateLabel, dateStartRight, 142);
    ctx.save();
    ctx.direction = 'ltr';
    ctx.textAlign = 'right';
    ctx.fillStyle = '#0F172A';
    ctx.font = '800 13px "JetBrains Mono", monospace';
    ctx.fillText(data.date, dateStartRight - dateLabelW - 8, 142);
    ctx.restore();

    // Left: Payment Method
    ctx.textAlign = 'left';
    ctx.fillStyle = '#0F172A';
    ctx.font = '800 13px "Tajawal", sans-serif';
    ctx.fillText(`الدفع: ${data.paymentMethod}`, 38, 142);

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
    const fromLabel = 'استلمنا من /';
    ctx.fillText(fromLabel, W - 24, y);
    const fromLabelW = ctx.measureText(fromLabel).width;
    ctx.fillStyle = '#020617';
    ctx.font = '900 15px "Tajawal", sans-serif';
    ctx.fillText(
      `${data.patientName || '....................'} المحترم`,
      W - 24 - fromLabelW - 10,
      y
    );

    // Left: Patient Phone (LTR number on the left, Arabic label immediately to its right)
    const phoneText = data.patientPhone || '—';
    ctx.save();
    ctx.direction = 'ltr';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#0F172A';
    ctx.font = '800 13px "JetBrains Mono", monospace';
    ctx.fillText(phoneText, 24, y);
    const phoneValW = ctx.measureText(phoneText).width;
    ctx.restore();

    ctx.textAlign = 'left';
    ctx.fillStyle = '#475569';
    ctx.font = '700 13px "Tajawal", sans-serif';
    ctx.fillText('هاتف:', 24 + phoneValW + 8, y);
    drawDashedLine(y + 12);

    // Wrapped Services
    y += 38;
    ctx.textAlign = 'right';
    ctx.fillStyle = '#475569';
    ctx.font = '700 14px "Tajawal", sans-serif';
    const srvLabel = 'وذلك مقابل (الخدمات العلاجية):';
    ctx.fillText(srvLabel, W - 24, y);
    const srvLabelW = ctx.measureText(srvLabel).width;
    ctx.fillStyle = '#0C4A6E';
    ctx.font = '800 14px "Tajawal", sans-serif';
    serviceLines.forEach((line, idx) => {
      ctx.fillText(line, W - 24 - srvLabelW - 10, y + idx * 22);
    });
    y += extraServiceH;
    drawDashedLine(y + 12);

    if (data.toothFDI) {
      y += 38;
      ctx.textAlign = 'right';
      ctx.fillStyle = '#475569';
      ctx.font = '700 14px "Tajawal", sans-serif';
      const fdiLabel = 'أرقام الأسنان (FDI):';
      ctx.fillText(fdiLabel, W - 24, y);
      const fdiLabelW = ctx.measureText(fdiLabel).width;
      ctx.save();
      ctx.direction = 'ltr';
      ctx.textAlign = 'right';
      ctx.fillStyle = '#0C4A6E';
      ctx.font = '800 14px "JetBrains Mono", monospace';
      ctx.fillText(data.toothFDI, W - 24 - fdiLabelW - 10, y);
      ctx.restore();
      drawDashedLine(y + 12);
    }

    // Wrapped Amount in Words (Tafqeet)
    y += 38;
    ctx.textAlign = 'right';
    ctx.fillStyle = '#475569';
    ctx.font = '700 14px "Tajawal", sans-serif';
    const wordsLabel = 'مبلغاً وقدره كتابةً:';
    ctx.fillText(wordsLabel, W - 24, y);
    const wordsLabelW = ctx.measureText(wordsLabel).width;
    ctx.fillStyle = '#0F172A';
    ctx.font = '800 14px "Tajawal", sans-serif';
    wordsLines.forEach((line, idx) => {
      ctx.fillText(line, W - 24 - wordsLabelW - 10, y + idx * 22);
    });
    y += extraWordsH;
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

    // Center QR & Wrapped Notes aligned cleanly with signature boxes
    if (qrImg) {
      ctx.fillStyle = '#FFFFFF';
      ctx.strokeStyle = '#E2E8F0';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(W / 2 - 37, y + 8, 74, 70, 8);
      ctx.fill();
      ctx.stroke();
      ctx.drawImage(qrImg, W / 2 - 32, y + 11, 64, 64);
    }
    ctx.fillStyle = '#475569';
    ctx.font = '700 11px "Tajawal", sans-serif';
    notesLines.forEach((line, idx) => {
      ctx.fillText(line, W / 2, y + 92 + idx * 16);
    });

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
    ctx.fillText(phoneItems.join(' | '), 24, footerY + 20);
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
      notify(`تم تحميل صورة السند #${data.receiptNo}`, 'success');
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
      notify(`تم تحميل ملف PDF للسند #${data.receiptNo}`, 'success');
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
      notify(`تم حفظ السند (${format.toUpperCase()}) ونسخ التفاصيل`, 'success');
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
          className="pointer-events-none select-none absolute top-36 left-1/2 -translate-x-1/2 w-36 h-36 sm:w-44 sm:h-44 object-contain"
          style={{ opacity: Math.min(settings.appearance.watermarkOpacity || 4, 5) / 100 }}
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

        {/* شريط رقم السند والتاريخ وطريقة الدفع (بدون اقتصاص للتاريخ أو الرقم) */}
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 bg-slate-100 border border-slate-300 rounded-xl px-3 py-2 mb-3.5 text-[11px] sm:text-xs">
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-slate-500 font-bold">رقم السند:</span>
            <span
              dir="ltr"
              className="inline-block font-black text-rose-700 font-mono tabular-nums whitespace-nowrap"
            >
              #{data.receiptNo}
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-slate-500 font-bold">التاريخ:</span>
            <span
              dir="ltr"
              className="inline-block font-extrabold text-slate-900 font-mono tabular-nums whitespace-nowrap"
            >
              {data.date}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 font-bold">الدفع:</span>
            <span className="font-extrabold text-slate-900">
              {data.paymentMethod}
            </span>
          </div>
        </div>

        {/* تفاصيل المريض والخدمات */}
        <div className="relative z-10 space-y-2.5 text-xs sm:text-sm mb-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-dashed border-slate-300 pb-2">
            <div className="min-w-0">
              <span className="font-bold text-slate-600">استلمنا من /</span>
              <span className="font-black text-slate-950 mr-1.5 break-words">
                {data.patientName || '....................'}
              </span>
              <span className="font-bold text-slate-600 mr-1">المحترم</span>
            </div>
            <div className="shrink-0 flex items-center gap-1">
              <span className="font-bold text-slate-600">هاتف:</span>
              <span
                dir="ltr"
                className="inline-block whitespace-nowrap font-bold text-slate-800 font-mono tabular-nums"
              >
                {data.patientPhone || '—'}
              </span>
            </div>
          </div>

          <div className="border-b border-dashed border-slate-300 pb-2">
            <span className="font-bold text-slate-600">وذلك مقابل (الخدمات العلاجية):</span>
            <span className="font-extrabold text-sky-900 mr-2 break-words leading-relaxed">
              {servicesText}
            </span>
          </div>

          {data.toothFDI && (
            <div className="border-b border-dashed border-slate-300 pb-2 flex items-center gap-2">
              <span className="font-bold text-slate-600">أرقام الأسنان (FDI):</span>
              <span
                dir="ltr"
                className="inline-block font-extrabold text-sky-900 font-mono tabular-nums"
              >
                {data.toothFDI}
              </span>
            </div>
          )}

          <div className="border-b border-dashed border-slate-300 pb-2">
            <span className="font-bold text-slate-600">مبلغاً وقدره كتابةً:</span>
            <span className="font-extrabold text-slate-900 mr-2 break-words leading-relaxed">
              {data.amountWords}
            </span>
          </div>
        </div>

        {/* الصناديق المالية الثلاثة */}
        <div
          className={`relative z-10 grid gap-2 sm:gap-3 mb-3.5 text-center ${
            data.paperFormat === 'thermal80' ? 'grid-cols-1' : 'grid-cols-3'
          }`}
        >
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
          <div className={data.paperFormat === 'thermal80' ? 'col-span-6 text-center' : 'col-span-4 text-center'}>
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

          <div
            className={
              data.paperFormat === 'thermal80'
                ? 'col-span-12 order-last flex flex-col items-center justify-center pt-1'
                : 'col-span-4 flex flex-col items-center justify-center'
            }
          >
            {settings.features.showQrCode && qrDataUrl && (
              <div className="p-1 bg-white border border-slate-200 rounded-lg flex items-center justify-center">
                <img
                  src={qrDataUrl}
                  alt="QR Code"
                  className="w-16 h-16 sm:w-20 sm:h-20 object-contain block"
                />
              </div>
            )}
            <div className="text-[9px] sm:text-[10px] font-bold text-slate-600 text-center mt-1 leading-tight break-words">
              {data.notes || 'نتمنى لكم دوام الصحة والابتسامة المشرقة'}
            </div>
          </div>

          <div className={data.paperFormat === 'thermal80' ? 'col-span-6 text-center' : 'col-span-4 text-center'}>
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

        {/* تذييل العنوان وأرقام الهواتف (بدون انقسام لأرقام الهواتف) */}
        <div className="relative z-10 mt-3.5 pt-2.5 border-t-2 border-slate-800 flex flex-col sm:flex-row items-center justify-between text-[10px] sm:text-[11px] font-bold text-slate-700 gap-1.5 text-center sm:text-right">
          <div>
            العنوان: <span>{settings.identity.address}</span>
          </div>
          <div className="flex flex-wrap items-center justify-center sm:justify-end gap-y-1">
            {phoneItems.map((phone, idx) => (
              <React.Fragment key={idx}>
                {idx > 0 && <span className="mx-1.5 text-slate-400">|</span>}
                <span
                  dir="ltr"
                  className="inline-block whitespace-nowrap font-mono tabular-nums text-slate-800"
                >
                  {phone}
                </span>
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
