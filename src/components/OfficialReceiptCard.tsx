import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { jsPDF } from 'jspdf';
import {
  Check,
  CheckCircle2,
  ChevronDown,
  Download,
  FileDown,
  Image as ImageIcon,
  Loader2,
  MessageCircle,
  Printer,
  Share2,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
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
  const [isShareMenuOpen, setIsShareMenuOpen] = useState<boolean>(false);

  const servicesText = useMemo(() => {
    if (data.services && data.services.length > 0) {
      return data.services.join(' + ');
    }
    return data.notes || 'كشف واستشارات وخدمات علاجية للأسنان';
  }, [data.services, data.notes]);

  const amountWordsFormatted = useMemo(() => {
    const raw = String(data.amountWords || '').trim();
    if (!raw) return '—';
    if (raw.endsWith('فقط لا غير') || raw.endsWith('فقط')) {
      return raw;
    }
    return `${raw} فقط لا غير`;
  }, [data.amountWords]);

  const hasRemaining = (Number(data.remainingAmount) || 0) > 0;
  const isFullyPaid = (Number(data.remainingAmount) || 0) <= 0 && (Number(data.totalAmount) || 0) > 0;

  useEffect(() => {
    if (!settings.features.showQrCode) {
      setQrDataUrl('');
      return;
    }
    const qrPayload = [
      settings.identity.clinicAr,
      `${settings.identity.doctorAr} — ${settings.identity.specialtyAr}`,
      `سند قبض مالي معتمد #${data.receiptNo}`,
      `التاريخ: ${data.date}`,
      `المريض/ة: ${data.patientName || 'غير محدد'}`,
      `الإجمالي: ${Number(data.totalAmount).toLocaleString()} ${data.currency}`,
      `المقبوض: ${Number(data.paidAmount).toLocaleString()} ${data.currency}`,
      `المتبقي: ${Number(data.remainingAmount).toLocaleString()} ${data.currency}`,
      `طريقة السداد: ${data.paymentMethod}`,
      `التحقق: سند إلكتروني موثق من نظام العيادة`,
    ].join('\n');

    QRCode.toDataURL(qrPayload, {
      width: 260,
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
    data.paymentMethod,
    settings.features.showQrCode,
    settings.identity.clinicAr,
    settings.identity.doctorAr,
    settings.identity.specialtyAr,
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

  const phoneItems = useMemo(() => {
    return String(settings.identity.phones || '')
      .split(/\s*(?:[,،|/]|\s-\s)\s*/)
      .map((p) => p.trim())
      .filter(Boolean);
  }, [settings.identity.phones]);

  // Ultra-High-Resolution (3x) Canvas Generator with refined dynamic mathematical layout
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
      const W = 360;
      measureCtx.font = '800 13px "Tajawal", "IBM Plex Sans Arabic", sans-serif';
      const serviceLines = wrapCanvasText(measureCtx, servicesText, W - 44);
      const wordsLines = wrapCanvasText(measureCtx, amountWordsFormatted, W - 44);
      const notesLines = wrapCanvasText(
        measureCtx,
        data.notes || 'مع تمنياتنا لكم بدوام الصحة والعافية والابتسامة المشرقة',
        W - 44
      );

      const dynamicContentHeight =
        serviceLines.length * 20 +
        wordsLines.length * 20 +
        notesLines.length * 18 +
        (data.toothFDI ? 32 : 0) +
        (qrImg ? 92 : 0);

      const H = 580 + dynamicContentHeight;

      canvas.width = W * scale;
      canvas.height = H * scale;
      const ctx = canvas.getContext('2d')!;
      ctx.scale(scale, scale);
      ctx.direction = 'rtl';

      // Background
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = settings.appearance.primaryColor || '#0B2545';
      ctx.lineWidth = 3;
      ctx.strokeRect(3, 3, W - 6, H - 6);

      let y = 18;
      if (logoImg) {
        ctx.drawImage(logoImg, (W - 44) / 2, y, 44, 44);
        y += 50;
      }

      ctx.textAlign = 'center';
      ctx.fillStyle = '#0F172A';
      ctx.font = '900 15px "Tajawal", "IBM Plex Sans Arabic", sans-serif';
      ctx.fillText(settings.identity.clinicAr, W / 2, y);
      y += 20;

      ctx.fillStyle = '#075985';
      ctx.font = '800 13px "Tajawal", "IBM Plex Sans Arabic", sans-serif';
      ctx.fillText(settings.identity.doctorAr, W / 2, y);
      y += 18;

      ctx.fillStyle = '#475569';
      ctx.font = '700 11px "Tajawal", "IBM Plex Sans Arabic", sans-serif';
      ctx.fillText(settings.identity.specialtyAr, W / 2, y);
      y += 16;

      // Header Tag
      ctx.fillStyle = '#0B2545';
      ctx.beginPath();
      ctx.roundRect((W - 220) / 2, y, 220, 24, 12);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '900 11px "Tajawal", "IBM Plex Sans Arabic", sans-serif';
      ctx.fillText('سند قبض مالي معتمد | RECEIPT', W / 2, y + 16);
      y += 34;

      // Meta Box
      ctx.fillStyle = '#F8FAFC';
      ctx.strokeStyle = '#CBD5E1';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(14, y, W - 28, 44, 8);
      ctx.fill();
      ctx.stroke();

      ctx.textAlign = 'right';
      ctx.fillStyle = '#64748B';
      ctx.font = '800 11px "Tajawal", "IBM Plex Sans Arabic", sans-serif';
      ctx.fillText('رقم السند:', W - 24, y + 18);
      ctx.save();
      ctx.direction = 'ltr';
      ctx.textAlign = 'right';
      ctx.fillStyle = '#BE123C';
      ctx.font = '900 13px "JetBrains Mono", monospace';
      ctx.fillText(`#${data.receiptNo}`, W - 80, y + 18);
      ctx.restore();

      ctx.textAlign = 'left';
      ctx.fillStyle = '#0F172A';
      ctx.font = '800 11px "JetBrains Mono", monospace';
      ctx.fillText(data.date, 24, y + 18);

      ctx.textAlign = 'center';
      ctx.fillStyle = '#334155';
      ctx.font = '800 11px "Tajawal", "IBM Plex Sans Arabic", sans-serif';
      ctx.fillText(`طريقة السداد: ${data.paymentMethod}`, W / 2, y + 36);
      y += 56;

      // Patient Info
      ctx.textAlign = 'right';
      ctx.fillStyle = '#475569';
      ctx.font = '700 12px "Tajawal", "IBM Plex Sans Arabic", sans-serif';
      ctx.fillText('وصلنا من الأخ/ت:', W - 16, y);
      ctx.fillStyle = '#020617';
      ctx.font = '900 13px "Tajawal", "IBM Plex Sans Arabic", sans-serif';
      ctx.fillText(`${data.patientName || '....................'} المحترم/ة`, W - 105, y);
      y += 22;

      if (data.patientPhone) {
        ctx.fillStyle = '#475569';
        ctx.font = '700 12px "Tajawal", "IBM Plex Sans Arabic", sans-serif';
        ctx.fillText('رقم التواصل:', W - 16, y);
        ctx.save();
        ctx.direction = 'ltr';
        ctx.textAlign = 'right';
        ctx.fillStyle = '#0F172A';
        ctx.font = '800 12px "JetBrains Mono", monospace';
        ctx.fillText(data.patientPhone, W - 90, y);
        ctx.restore();
        y += 22;
      }

      // Services
      ctx.fillStyle = '#475569';
      ctx.font = '700 12px "Tajawal", "IBM Plex Sans Arabic", sans-serif';
      ctx.fillText('الخدمات الطبية والعلاجية:', W - 16, y);
      y += 18;
      ctx.fillStyle = '#0C4A6E';
      ctx.font = '800 12px "Tajawal", "IBM Plex Sans Arabic", sans-serif';
      for (const line of serviceLines) {
        ctx.fillText(line, W - 16, y);
        y += 18;
      }

      if (data.toothFDI) {
        ctx.textAlign = 'right';
        ctx.fillStyle = '#475569';
        ctx.font = '700 12px "Tajawal", "IBM Plex Sans Arabic", sans-serif';
        ctx.fillText('أرقام الأسنان المعالجة (FDI):', W - 16, y);
        ctx.save();
        ctx.direction = 'ltr';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#0C4A6E';
        ctx.font = '800 12px "JetBrains Mono", monospace';
        ctx.fillText(data.toothFDI, 24, y);
        ctx.restore();
        y += 22;
      }

      // Amount in words
      ctx.fillStyle = '#475569';
      ctx.font = '700 12px "Tajawal", "IBM Plex Sans Arabic", sans-serif';
      ctx.fillText('المبلغ بالحروف وقدره:', W - 16, y);
      y += 18;
      ctx.fillStyle = '#0F172A';
      ctx.font = '800 12px "Tajawal", "IBM Plex Sans Arabic", sans-serif';
      for (const line of wordsLines) {
        ctx.fillText(line, W - 16, y);
        y += 18;
      }
      y += 8;

      // 3 Financial Boxes
      const drawThermalRow = (
        title: string,
        val: string,
        bg: string,
        stroke: string,
        textColor: string
      ) => {
        ctx.fillStyle = bg;
        ctx.strokeStyle = stroke;
        ctx.beginPath();
        ctx.roundRect(14, y, W - 28, 34, 8);
        ctx.fill();
        ctx.stroke();

        ctx.textAlign = 'right';
        ctx.fillStyle = textColor;
        ctx.font = '800 12px "Tajawal", "IBM Plex Sans Arabic", sans-serif';
        ctx.fillText(title, W - 24, y + 22);

        ctx.textAlign = 'left';
        ctx.font = '900 13px "Tajawal", "IBM Plex Sans Arabic", sans-serif';
        ctx.fillText(val, 24, y + 22);
        y += 40;
      };

      drawThermalRow(
        'إجمالي الحساب / العلاج:',
        `${Number(data.totalAmount).toLocaleString()} ${data.currency}`,
        '#F8FAFC',
        '#CBD5E1',
        '#0F172A'
      );
      drawThermalRow(
        'المبلغ المدفوع (المقبوض):',
        `${Number(data.paidAmount).toLocaleString()} ${data.currency}`,
        '#ECFDF5',
        '#6EE7B7',
        '#065F46'
      );
      drawThermalRow(
        hasRemaining ? 'المتبقي (رصيد آجل):' : 'حالة الحساب:',
        hasRemaining
          ? `${Number(data.remainingAmount).toLocaleString()} ${data.currency}`
          : 'خالص ومسدد بالكامل ✓',
        hasRemaining ? '#FFF1F2' : '#ECFDF5',
        hasRemaining ? '#FDA4AF' : '#6EE7B7',
        hasRemaining ? '#9F1239' : '#065F46'
      );

      // Signatures
      y += 6;
      const sigW = (W - 36) / 2;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#334155';
      ctx.font = '800 11px "Tajawal", "IBM Plex Sans Arabic", sans-serif';
      ctx.fillText('توقيع الطبيب / المحاسب', W - 14 - sigW / 2, y + 10);
      ctx.fillText('توقيع المريض / المستلم', 14 + sigW / 2, y + 10);

      ctx.fillStyle = '#F8FAFC';
      ctx.strokeStyle = '#CBD5E1';
      ctx.beginPath();
      ctx.roundRect(W - 14 - sigW, y + 16, sigW, 46, 6);
      ctx.roundRect(14, y + 16, sigW, 46, 6);
      ctx.fill();
      ctx.stroke();

      if (accSigImg) {
        ctx.drawImage(accSigImg, W - 14 - sigW + 10, y + 20, sigW - 20, 38);
      }
      if (recSigImg) {
        ctx.drawImage(recSigImg, 24, y + 20, sigW - 20, 38);
      }
      y += 72;

      if (qrImg) {
        ctx.drawImage(qrImg, (W - 74) / 2, y, 74, 74);
        y += 82;
      }

      ctx.textAlign = 'center';
      ctx.fillStyle = '#475569';
      ctx.font = '700 11px "Tajawal", "IBM Plex Sans Arabic", sans-serif';
      for (const line of notesLines) {
        ctx.fillText(line, W / 2, y);
        y += 16;
      }
      y += 8;

      ctx.strokeStyle = '#1E293B';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(14, y);
      ctx.lineTo(W - 14, y);
      ctx.stroke();
      y += 16;

      ctx.fillStyle = '#334155';
      ctx.font = '700 11px "Tajawal", "IBM Plex Sans Arabic", sans-serif';
      ctx.fillText(settings.identity.address, W / 2, y);
      y += 16;
      ctx.save();
      ctx.direction = 'ltr';
      ctx.font = '700 11px "JetBrains Mono", monospace';
      ctx.fillText(phoneItems.join(' | '), W / 2, y);
      ctx.restore();

      return canvas;
    }

    // ==================== STANDARD A5 LANDSCAPE RECEIPT (EXECUTIVE LUXURY) ====================
    const W = 840;
    measureCtx.font = '800 14px "Tajawal", "IBM Plex Sans Arabic", sans-serif';
    const serviceLines = wrapCanvasText(measureCtx, servicesText, W - 260);
    const wordsLines = wrapCanvasText(measureCtx, amountWordsFormatted, W - 220);
    measureCtx.font = '700 11px "Tajawal", "IBM Plex Sans Arabic", sans-serif';
    const notesLines = wrapCanvasText(
      measureCtx,
      data.notes || 'مع تمنياتنا لكم بدوام الصحة والعافية والابتسامة المشرقة',
      250
    );

    const extraServiceH = Math.max(0, serviceLines.length - 1) * 22;
    const extraWordsH = Math.max(0, wordsLines.length - 1) * 22;
    const extraNotesH = Math.max(0, notesLines.length - 1) * 16;
    const fdiExtraH = data.toothFDI ? 36 : 0;

    const H = 600 + extraServiceH + extraWordsH + extraNotesH + fdiExtraH;

    canvas.width = W * scale;
    canvas.height = H * scale;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(scale, scale);
    ctx.direction = 'rtl';

    // 1. Premium Paper Background & Double Security Frame
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, W, H);

    // Primary Outer Border
    ctx.strokeStyle = settings.appearance.primaryColor || '#0B2545';
    ctx.lineWidth = 3.5;
    ctx.strokeRect(3, 3, W - 6, H - 6);

    // Elegant Inner Inset Border
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1;
    ctx.strokeRect(8, 8, W - 16, H - 16);

    // 2. Subtle Watermark centered cleanly in the upper body area without covering text
    if (logoImg) {
      ctx.save();
      ctx.globalAlpha = Math.min(settings.appearance.watermarkOpacity || 4, 4.5) / 100;
      ctx.drawImage(logoImg, (W - 140) / 2, 160, 140, 140);
      ctx.restore();
    }

    // 3. Official Tri-zone Header
    // Right Zone: Arabic Clinic & Doctor Info
    ctx.textAlign = 'right';
    ctx.fillStyle = '#0F172A';
    ctx.font = '900 18px "Tajawal", "IBM Plex Sans Arabic", sans-serif';
    ctx.fillText(settings.identity.doctorAr, W - 28, 38);
    ctx.fillStyle = '#075985';
    ctx.font = '800 13px "Tajawal", "IBM Plex Sans Arabic", sans-serif';
    ctx.fillText(settings.identity.specialtyAr, W - 28, 59);
    ctx.fillStyle = '#475569';
    ctx.font = '700 12px "Tajawal", "IBM Plex Sans Arabic", sans-serif';
    ctx.fillText(settings.identity.clinicAr, W - 28, 78);

    // Center Zone: Clinic Logo & Official Title Ribbon
    if (logoImg) {
      ctx.drawImage(logoImg, (W - 48) / 2, 14, 48, 48);
    }
    ctx.fillStyle = '#0B2545';
    ctx.beginPath();
    ctx.roundRect((W - 250) / 2, 68, 250, 26, 13);
    ctx.fill();

    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.font = '900 12px "Tajawal", "IBM Plex Sans Arabic", sans-serif';
    ctx.fillText('سند قبض مالي معتمد | RECEIPT VOUCHER', W / 2, 85);

    // Left Zone: English Identity
    ctx.save();
    ctx.direction = 'ltr';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#0F172A';
    ctx.font = '900 13px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(settings.identity.clinicEn, 28, 40);
    ctx.fillStyle = '#075985';
    ctx.font = '700 12px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(settings.identity.doctorEn, 28, 60);
    ctx.restore();

    // Header Separator Line
    ctx.strokeStyle = '#1E293B';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(24, 104);
    ctx.lineTo(W - 24, 104);
    ctx.stroke();

    // 4. Metadata Strip (Receipt No, Date, Payment Method)
    ctx.fillStyle = '#F8FAFC';
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(24, 114, W - 48, 38, 10);
    ctx.fill();
    ctx.stroke();

    // Right: Receipt Number
    ctx.textAlign = 'right';
    ctx.font = '800 13px "Tajawal", "IBM Plex Sans Arabic", sans-serif';
    ctx.fillStyle = '#64748B';
    const noLabel = 'رقم السند:';
    ctx.fillText(noLabel, W - 40, 138);
    const noLabelW = ctx.measureText(noLabel).width;
    ctx.save();
    ctx.direction = 'ltr';
    ctx.textAlign = 'right';
    ctx.fillStyle = '#BE123C';
    ctx.font = '900 14px "JetBrains Mono", monospace';
    ctx.fillText(`#${data.receiptNo}`, W - 40 - noLabelW - 8, 138);
    ctx.restore();

    // Center: Date
    ctx.font = '800 13px "Tajawal", "IBM Plex Sans Arabic", sans-serif';
    const dateLabel = 'تاريخ التحرير:';
    const dateLabelW = ctx.measureText(dateLabel).width;
    ctx.font = '800 13px "JetBrains Mono", monospace';
    const dateValW = ctx.measureText(data.date).width;
    const totalDateW = dateLabelW + 8 + dateValW;
    const dateRight = W / 2 + totalDateW / 2;

    ctx.textAlign = 'right';
    ctx.fillStyle = '#64748B';
    ctx.font = '800 13px "Tajawal", "IBM Plex Sans Arabic", sans-serif';
    ctx.fillText(dateLabel, dateRight, 138);

    ctx.save();
    ctx.direction = 'ltr';
    ctx.textAlign = 'right';
    ctx.fillStyle = '#0F172A';
    ctx.font = '800 13px "JetBrains Mono", monospace';
    ctx.fillText(data.date, dateRight - dateLabelW - 8, 138);
    ctx.restore();

    // Left: Payment Method
    ctx.textAlign = 'left';
    ctx.fillStyle = '#0F172A';
    ctx.font = '800 13px "Tajawal", "IBM Plex Sans Arabic", sans-serif';
    ctx.fillText(`طريقة السداد: ${data.paymentMethod}`, 40, 138);

    // 5. Patient Information & Medical Services Rows
    let y = 182;
    const drawRowDivider = (lineY: number) => {
      ctx.save();
      ctx.strokeStyle = '#E2E8F0';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(24, lineY);
      ctx.lineTo(W - 24, lineY);
      ctx.stroke();
      ctx.restore();
    };

    // Patient Name + Phone
    ctx.textAlign = 'right';
    ctx.fillStyle = '#475569';
    ctx.font = '700 14px "Tajawal", "IBM Plex Sans Arabic", sans-serif';
    const pLabel = 'وصلنا من الأخ/ت:';
    ctx.fillText(pLabel, W - 24, y);
    const pLabelW = ctx.measureText(pLabel).width;
    ctx.fillStyle = '#020617';
    ctx.font = '900 15px "Tajawal", "IBM Plex Sans Arabic", sans-serif';
    ctx.fillText(`${data.patientName || '....................'} المحترم/ة`, W - 24 - pLabelW - 10, y);

    // Phone on Left
    const phoneVal = data.patientPhone || '—';
    ctx.save();
    ctx.direction = 'ltr';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#0F172A';
    ctx.font = '800 13px "JetBrains Mono", monospace';
    ctx.fillText(phoneVal, 24, y);
    const phoneValW = ctx.measureText(phoneVal).width;
    ctx.restore();

    ctx.textAlign = 'left';
    ctx.fillStyle = '#475569';
    ctx.font = '700 13px "Tajawal", "IBM Plex Sans Arabic", sans-serif';
    ctx.fillText('رقم التواصل:', 24 + phoneValW + 10, y);

    drawRowDivider(y + 12);

    // Medical Services
    y += 36;
    ctx.textAlign = 'right';
    ctx.fillStyle = '#475569';
    ctx.font = '700 14px "Tajawal", "IBM Plex Sans Arabic", sans-serif';
    const sLabel = 'وذلك عن (الخدمات الطبية والعلاجية):';
    ctx.fillText(sLabel, W - 24, y);
    const sLabelW = ctx.measureText(sLabel).width;
    ctx.fillStyle = '#0C4A6E';
    ctx.font = '800 14px "Tajawal", "IBM Plex Sans Arabic", sans-serif';
    serviceLines.forEach((line, idx) => {
      ctx.fillText(line, W - 24 - sLabelW - 10, y + idx * 22);
    });
    y += extraServiceH;
    drawRowDivider(y + 12);

    // Optional Tooth FDI
    if (data.toothFDI) {
      y += 36;
      ctx.textAlign = 'right';
      ctx.fillStyle = '#475569';
      ctx.font = '700 14px "Tajawal", "IBM Plex Sans Arabic", sans-serif';
      const fLabel = 'أرقام الأسنان المعالجة (FDI):';
      ctx.fillText(fLabel, W - 24, y);
      const fLabelW = ctx.measureText(fLabel).width;
      ctx.save();
      ctx.direction = 'ltr';
      ctx.textAlign = 'right';
      ctx.fillStyle = '#0C4A6E';
      ctx.font = '800 13px "JetBrains Mono", monospace';
      ctx.fillText(data.toothFDI, W - 24 - fLabelW - 10, y);
      ctx.restore();
      drawRowDivider(y + 12);
    }

    // Amount in Words
    y += 36;
    ctx.textAlign = 'right';
    ctx.fillStyle = '#475569';
    ctx.font = '700 14px "Tajawal", "IBM Plex Sans Arabic", sans-serif';
    const wLabel = 'المبلغ بالحروف وقدره:';
    ctx.fillText(wLabel, W - 24, y);
    const wLabelW = ctx.measureText(wLabel).width;
    ctx.fillStyle = '#0F172A';
    ctx.font = '800 14px "Tajawal", "IBM Plex Sans Arabic", sans-serif';
    wordsLines.forEach((line, idx) => {
      ctx.fillText(line, W - 24 - wLabelW - 10, y + idx * 22);
    });
    y += extraWordsH;
    drawRowDivider(y + 12);

    // 6. Three Financial Highlight Cards
    y += 24;
    const boxGap = 12;
    const boxW = (W - 48 - boxGap * 2) / 3;
    const boxH = 64;

    // Card 1 (Right): Total
    const b1X = W - 24 - boxW;
    ctx.fillStyle = '#F8FAFC';
    ctx.strokeStyle = '#CBD5E1';
    ctx.beginPath();
    ctx.roundRect(b1X, y, boxW, boxH, 12);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#475569';
    ctx.font = '700 12px "Tajawal", "IBM Plex Sans Arabic", sans-serif';
    ctx.fillText('إجمالي الحساب / العلاج', b1X + boxW / 2, y + 22);
    ctx.fillStyle = '#0F172A';
    ctx.font = '900 16px "Tajawal", "IBM Plex Sans Arabic", sans-serif';
    ctx.fillText(`${Number(data.totalAmount).toLocaleString()} ${data.currency}`, b1X + boxW / 2, y + 48);

    // Card 2 (Middle): Paid
    const b2X = b1X - boxGap - boxW;
    ctx.fillStyle = '#ECFDF5';
    ctx.strokeStyle = '#6EE7B7';
    ctx.beginPath();
    ctx.roundRect(b2X, y, boxW, boxH, 12);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#047857';
    ctx.font = '700 12px "Tajawal", "IBM Plex Sans Arabic", sans-serif';
    ctx.fillText('المبلغ المدفوع (المقبوض)', b2X + boxW / 2, y + 22);
    ctx.fillStyle = '#065F46';
    ctx.font = '900 16px "Tajawal", "IBM Plex Sans Arabic", sans-serif';
    ctx.fillText(`${Number(data.paidAmount).toLocaleString()} ${data.currency}`, b2X + boxW / 2, y + 48);

    // Card 3 (Left): Remaining Balance
    const b3X = 24;
    ctx.fillStyle = hasRemaining ? '#FFF1F2' : '#ECFDF5';
    ctx.strokeStyle = hasRemaining ? '#FDA4AF' : '#6EE7B7';
    ctx.beginPath();
    ctx.roundRect(b3X, y, boxW, boxH, 12);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = hasRemaining ? '#9F1239' : '#047857';
    ctx.font = '700 12px "Tajawal", "IBM Plex Sans Arabic", sans-serif';
    ctx.fillText(hasRemaining ? 'المتبقي (رصيد آجل)' : 'حالة الحساب', b3X + boxW / 2, y + 22);
    ctx.font = '900 16px "Tajawal", "IBM Plex Sans Arabic", sans-serif';
    ctx.fillText(
      hasRemaining
        ? `${Number(data.remainingAmount).toLocaleString()} ${data.currency}`
        : 'خالص ومسدد بالكامل ✓',
      b3X + boxW / 2,
      y + 48
    );

    // 7. Signatures & Digital Verification Row
    y += boxH + 18;
    ctx.strokeStyle = '#CBD5E1';
    ctx.beginPath();
    ctx.moveTo(24, y);
    ctx.lineTo(W - 24, y);
    ctx.stroke();

    y += 12;
    // Right signature: Accountant
    ctx.fillStyle = '#334155';
    ctx.font = '800 12px "Tajawal", "IBM Plex Sans Arabic", sans-serif';
    ctx.fillText('توقيع المحاسب / الطبيب المعالج', b1X + boxW / 2, y + 10);
    ctx.fillStyle = '#F8FAFC';
    ctx.strokeStyle = '#CBD5E1';
    ctx.beginPath();
    ctx.roundRect(b1X, y + 18, boxW, 58, 8);
    ctx.fill();
    ctx.stroke();
    if (accSigImg) {
      ctx.drawImage(accSigImg, b1X + 20, y + 22, boxW - 40, 50);
    } else {
      ctx.fillStyle = '#94A3B8';
      ctx.font = '600 11px "Tajawal", "IBM Plex Sans Arabic", sans-serif';
      ctx.fillText('التوقيع والختم المعتمد', b1X + boxW / 2, y + 50);
    }

    // Center QR & Notes
    if (qrImg) {
      ctx.fillStyle = '#FFFFFF';
      ctx.strokeStyle = '#E2E8F0';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(W / 2 - 36, y + 6, 72, 70, 8);
      ctx.fill();
      ctx.stroke();
      ctx.drawImage(qrImg, W / 2 - 31, y + 9, 62, 62);
    }
    ctx.fillStyle = '#475569';
    ctx.font = '700 11px "Tajawal", "IBM Plex Sans Arabic", sans-serif';
    notesLines.forEach((line, idx) => {
      ctx.fillText(line, W / 2, y + 90 + idx * 16);
    });

    // Left signature: Receiver
    ctx.fillStyle = '#334155';
    ctx.font = '800 12px "Tajawal", "IBM Plex Sans Arabic", sans-serif';
    ctx.fillText('توقيع المريض / المستلم', b3X + boxW / 2, y + 10);
    ctx.fillStyle = '#F8FAFC';
    ctx.strokeStyle = '#CBD5E1';
    ctx.beginPath();
    ctx.roundRect(b3X, y + 18, boxW, 58, 8);
    ctx.fill();
    ctx.stroke();
    if (recSigImg) {
      ctx.drawImage(recSigImg, b3X + 20, y + 22, boxW - 40, 50);
    } else {
      ctx.fillStyle = '#94A3B8';
      ctx.font = '600 11px "Tajawal", "IBM Plex Sans Arabic", sans-serif';
      ctx.fillText('توقيع المستلم', b3X + boxW / 2, y + 50);
    }

    // 8. Footer Address & Phones
    const footerY = H - 32;
    ctx.strokeStyle = '#1E293B';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(24, footerY);
    ctx.lineTo(W - 24, footerY);
    ctx.stroke();

    ctx.textAlign = 'right';
    ctx.fillStyle = '#334155';
    ctx.font = '700 12px "Tajawal", "IBM Plex Sans Arabic", sans-serif';
    ctx.fillText(`العنوان: ${settings.identity.address}`, W - 24, footerY + 18);

    ctx.save();
    ctx.direction = 'ltr';
    ctx.textAlign = 'left';
    ctx.font = '700 12px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(phoneItems.join(' | '), 24, footerY + 18);
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
    return `سند_قبض_${data.receiptNo}_${cleanPatient}`;
  };

  // 1. Download Ultra-HD PNG Image (حفظ كصورة)
  const handleDownloadHDImage = async () => {
    setBusyAction('png');
    try {
      const canvas = await generateHighResReceiptCanvas(3);
      const blob = await canvasToBlob(canvas);
      const fileName = `${getCleanBaseFileName()}.png`;
      triggerBlobDownload(blob, fileName);
      notify(`تم حفظ صورة السند #${data.receiptNo} بدقة عالية`, 'success');
    } catch {
      notify('تعذر إنشاء صورة السند، يرجى المحاولة مرة أخرى', 'error');
    } finally {
      setBusyAction(null);
    }
  };

  // 2. Download Official High-Resolution PDF File (حفظ كملف PDF)
  const handleDownloadPDFFile = async () => {
    setBusyAction('pdf');
    try {
      const pdfBlob = await generatePDFBlob();
      const fileName = `${getCleanBaseFileName()}.pdf`;
      triggerBlobDownload(pdfBlob, fileName);
      notify(`تم حفظ ملف PDF للسند #${data.receiptNo}`, 'success');
    } catch {
      notify('تعذر إنشاء ملف PDF للسند', 'error');
    } finally {
      setBusyAction(null);
    }
  };

  // 3. Share Receipt via Web Share API as File (Image or PDF)
  const handleShareFileWithClient = async (format: 'png' | 'pdf') => {
    setBusyAction(`share_${format}`);
    setIsShareMenuOpen(false);
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
        `*${settings.identity.clinicAr}*`,
        `${settings.identity.doctorAr} — ${settings.identity.specialtyAr}`,
        `━━━━━━━━━━━━━━━━━━━━`,
        `📄 *سند قبض مالي معتمد رقم:* #${data.receiptNo}`,
        `📅 *تاريخ التحرير:* ${data.date}`,
        `👤 *المريض/ة:* ${data.patientName || 'غير محدد'}`,
        `💰 *المبلغ المقبوض:* ${Number(data.paidAmount).toLocaleString()} ${data.currency}`,
        hasRemaining
          ? `📌 *المتبقي (آجل):* ${Number(data.remainingAmount).toLocaleString()} ${data.currency}`
          : `✅ *الحالة:* خالص ومسدد بالكامل`,
        `━━━━━━━━━━━━━━━━━━━━`,
        `مع تمنياتنا لكم بدوام الصحة والابتسامة المشرقة ✨`,
      ].join('\n');

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
        notify('تمت مشاركة السند بنجاح', 'success');
        return;
      }

      // Fallback: download the file and copy the summary
      triggerBlobDownload(file, file.name);
      await navigator.clipboard?.writeText(shareCaption).catch(() => {});
      notify(`تم تحميل السند (${format.toUpperCase()}) ونسخ بياناته للمشاركة`, 'success');
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      notify('تم تجهيز السند وتنزيله للمشاركة', 'info');
    } finally {
      setBusyAction(null);
    }
  };

  // 4. Share Direct to Patient WhatsApp with Formatted Voucher Details
  const handleShareWhatsApp = () => {
    setIsShareMenuOpen(false);
    const rawDigits = String(data.patientPhone || '').replace(/\D/g, '');
    let intlPhone = rawDigits;
    if (rawDigits.length === 9 && rawDigits.startsWith('7')) {
      intlPhone = `967${rawDigits}`;
    } else if (rawDigits.length === 10 && rawDigits.startsWith('07')) {
      intlPhone = `967${rawDigits.slice(1)}`;
    }

    const remainingText = hasRemaining
      ? `📌 *المتبقي على المريض (آجل):* ${Number(data.remainingAmount).toLocaleString()} ${data.currency}`
      : `✅ *حالة الحساب:* خالص ومسدد بالكامل`;

    const lines = [
      `*${settings.identity.clinicAr}*`,
      `${settings.identity.doctorAr} — ${settings.identity.specialtyAr}`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `📄 *سند قبض مالي معتمد رقم:* #${data.receiptNo}`,
      `📅 *تاريخ التحرير:* ${data.date}`,
      `👤 *المريض/ة:* ${data.patientName || 'غير محدد'} المحترم/ة`,
      `🦷 *الخدمات الطبية:* ${servicesText}`,
      data.toothFDI ? `🦷 *أرقام الأسنان (FDI):* ${data.toothFDI}` : '',
      `💵 *المبلغ بالحروف:* ${amountWordsFormatted}`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `💳 *إجمالي الحساب:* ${Number(data.totalAmount).toLocaleString()} ${data.currency}`,
      `💰 *المبلغ المقبوض:* ${Number(data.paidAmount).toLocaleString()} ${data.currency}`,
      remainingText,
      `━━━━━━━━━━━━━━━━━━━━`,
      `مع تمنياتنا لكم بدوام الصحة والعافية والابتسامة المشرقة ✨`,
      settings.identity.address ? `📍 ${settings.identity.address}` : '',
    ].filter(Boolean);

    const encoded = encodeURIComponent(lines.join('\n'));
    const url = intlPhone ? `https://wa.me/${intlPhone}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
    window.open(url, '_blank');
    notify('تم فتح تطبيق واتساب لإرسال السند للمريض', 'success');
  };

  // 5. Direct Print
  const handlePrintDirect = () => {
    if (data.paperFormat === 'thermal80') {
      document.body.classList.add('thermal-80mm-mode');
    } else {
      document.body.classList.remove('thermal-80mm-mode');
    }
    window.print();
  };

  const logoSrc = settings.appearance.customLogoDataUrl || DEFAULT_CLINIC_LOGO_DATA_URI;

  return (
    <div className="w-full max-w-full space-y-3">
      {/* High-Resolution Download & Client Share Toolbar */}
      {showToolbar && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 sm:p-3 shadow-xs no-print">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* Paper Format Selector */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                المقاس:
              </span>
              <select
                value={data.paperFormat}
                onChange={(e) => onPaperFormatChange?.(e.target.value as PaperFormat)}
                className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:border-sky-500"
              >
                <option value="a5">A5 أفقي معتمد (قياسي)</option>
                <option value="thermal80">حراري 80mm (طابعة إيصالات)</option>
              </select>
            </div>

            {/* Action Buttons: Save Image, Save PDF, Share Menu, Print */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {/* 1. Save as Image */}
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={handleDownloadHDImage}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/60 hover:bg-sky-100 dark:hover:bg-sky-900/50 text-sky-700 dark:text-sky-300 text-xs font-bold transition-colors disabled:opacity-50 shadow-2xs"
                title="حفظ السند كصورة PNG عالية الدقة (300 DPI)"
              >
                {busyAction === 'png' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <ImageIcon className="w-3.5 h-3.5 shrink-0" />
                )}
                <span>حفظ صورة</span>
              </button>

              {/* 2. Save as PDF File */}
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={handleDownloadPDFFile}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition-colors disabled:opacity-50 shadow-2xs"
                title="حفظ السند كملف PDF رسمي قابل للطباعة والمشاركة"
              >
                {busyAction === 'pdf' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <FileDown className="w-3.5 h-3.5 shrink-0" />
                )}
                <span>حفظ PDF</span>
              </button>

              {/* 3. Share Dropdown / Popover */}
              <div className="relative">
                <button
                  type="button"
                  disabled={busyAction !== null}
                  onClick={() => setIsShareMenuOpen((prev) => !prev)}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors disabled:opacity-50 shadow-2xs"
                  title="خيارات مشاركة السند مع المريض"
                >
                  {busyAction?.startsWith('share_') ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Share2 className="w-3.5 h-3.5 shrink-0" />
                  )}
                  <span>مشاركة</span>
                  <ChevronDown className="w-3 h-3 opacity-80" />
                </button>

                {isShareMenuOpen && (
                  <div
                    className="absolute left-0 mt-1.5 w-52 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl p-1.5 z-30 space-y-1 animate-in fade-in zoom-in-95 duration-100"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => handleShareFileWithClient('png')}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs font-bold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-right transition-colors"
                    >
                      <ImageIcon className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                      <span>مشاركة صورة السند (PNG)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleShareFileWithClient('pdf')}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs font-bold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-right transition-colors"
                    >
                      <FileDown className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                      <span>مشاركة ملف السند (PDF)</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleShareWhatsApp}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/60 rounded-lg text-right transition-colors"
                    >
                      <MessageCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>إرسال واتساب للمريض</span>
                    </button>
                  </div>
                )}
              </div>

              {/* 4. Direct Print */}
              <button
                type="button"
                onClick={handlePrintDirect}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold transition-colors shadow-2xs"
                title="طباعة السند فوراً"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>طباعة</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== THE REDESIGNED LUXURY MEDICAL RECEIPT CARD ==================== */}
      <div
        id="receipt-capture-area"
        style={{ borderColor: settings.appearance.primaryColor || '#0B2545' }}
        className={`receipt-paper rounded-2xl p-4 sm:p-6 shadow-xl relative overflow-hidden border-[3px] mx-auto bg-white transition-all ${
          data.paperFormat === 'thermal80' ? 'max-w-[360px]' : 'w-full'
        }`}
      >
        {/* Subtle Watermark placed cleanly in the upper center background with low opacity */}
        <img
          src={logoSrc}
          alt=""
          aria-hidden="true"
          referrerPolicy="no-referrer"
          className="pointer-events-none select-none absolute top-32 left-1/2 -translate-x-1/2 w-40 h-40 sm:w-48 sm:h-48 object-contain"
          style={{ opacity: Math.min(settings.appearance.watermarkOpacity || 4, 4.5) / 100 }}
        />

        {/* 1. Tri-Zone Official Header */}
        <div className="relative z-10 flex flex-col sm:flex-row items-center justify-between border-b-2 border-slate-800 pb-3 mb-3.5 gap-2 text-center sm:text-right">
          {/* Right: Arabic Clinic & Doctor Info */}
          <div className="space-y-0.5 sm:text-right min-w-0">
            <div className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
              {settings.identity.doctorAr}
            </div>
            <div className="text-xs font-extrabold text-sky-800">
              {settings.identity.specialtyAr}
            </div>
            <div className="text-[11px] font-bold text-slate-600">
              {settings.identity.clinicAr}
            </div>
          </div>

          {/* Center: Official Clinic Logo & Title Ribbon */}
          <div className="flex flex-col items-center shrink-0 my-1 sm:my-0">
            <img
              src={logoSrc}
              alt="Clinic Logo"
              referrerPolicy="no-referrer"
              className="w-12 h-12 sm:w-13 sm:h-13 object-contain mb-1 rounded-xl shadow-2xs border border-slate-100"
            />
            <div className="px-3.5 py-1 rounded-full bg-slate-900 text-white text-[10px] sm:text-xs font-black tracking-wide shadow-2xs">
              سند قبض مالي معتمد | RECEIPT VOUCHER
            </div>
          </div>

          {/* Left: English Clinic & Doctor Info */}
          <div className="sm:text-left space-y-0.5 min-w-0" dir="ltr">
            <div className="text-xs sm:text-sm font-black text-slate-900 tracking-tight">
              {settings.identity.clinicEn}
            </div>
            <div className="text-xs font-bold text-sky-800">
              {settings.identity.doctorEn}
            </div>
          </div>
        </div>

        {/* 2. Structured Metadata Bar */}
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 mb-3.5 text-xs">
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-slate-500 font-bold">رقم السند:</span>
            <span
              dir="ltr"
              className="inline-block font-black text-rose-700 font-mono tabular-nums whitespace-nowrap text-sm"
            >
              #{data.receiptNo}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-slate-500 font-bold">تاريخ التحرير:</span>
            <span
              dir="ltr"
              className="inline-block font-extrabold text-slate-900 font-mono tabular-nums whitespace-nowrap"
            >
              {data.date}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-slate-500 font-bold">طريقة السداد:</span>
            <span className="font-extrabold text-slate-900 bg-white border border-slate-200 px-2 py-0.5 rounded-md">
              {data.paymentMethod}
            </span>
          </div>
        </div>

        {/* 3. Patient & Treatment Information Statement */}
        <div className="relative z-10 space-y-2.5 text-xs sm:text-sm mb-3.5">
          {/* Patient Name & Phone Row */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
            <div className="min-w-0">
              <span className="font-bold text-slate-500">وصلنا من الأخ/ت:</span>
              <span className="font-black text-slate-950 mr-1.5 text-sm sm:text-base break-words">
                {data.patientName || '....................'}
              </span>
              <span className="font-bold text-slate-500 mr-1">المحترم/ة</span>
            </div>

            <div className="shrink-0 flex items-center gap-1.5">
              <span className="font-bold text-slate-500">رقم التواصل:</span>
              <span
                dir="ltr"
                className="inline-block whitespace-nowrap font-bold text-slate-900 font-mono tabular-nums"
              >
                {data.patientPhone || '—'}
              </span>
            </div>
          </div>

          {/* Medical Services Rendered */}
          <div className="border-b border-slate-200 pb-2 flex flex-col sm:flex-row sm:items-start gap-1">
            <span className="font-bold text-slate-500 shrink-0">
              وذلك عن (الخدمات الطبية والعلاجية):
            </span>
            <span className="font-extrabold text-sky-950 break-words leading-relaxed sm:mr-1">
              {servicesText}
            </span>
          </div>

          {/* FDI Teeth (if dental teeth specified) */}
          {data.toothFDI && (
            <div className="border-b border-slate-200 pb-2 flex items-center gap-2">
              <span className="font-bold text-slate-500 shrink-0">
                أرقام الأسنان المعالجة (FDI):
              </span>
              <span
                dir="ltr"
                className="inline-flex items-center gap-1 font-mono font-extrabold text-sky-800 bg-sky-50 border border-sky-200 px-2.5 py-0.5 rounded-lg text-xs"
              >
                {data.toothFDI}
              </span>
            </div>
          )}

          {/* Amount in Formal Arabic Words (Tafqeet) */}
          <div className="border-b border-slate-200 pb-2 flex flex-col sm:flex-row sm:items-baseline gap-1">
            <span className="font-bold text-slate-500 shrink-0">المبلغ بالحروف وقدره:</span>
            <span className="font-extrabold text-slate-900 sm:mr-1 break-words leading-relaxed">
              {amountWordsFormatted}
            </span>
          </div>
        </div>

        {/* 4. Three Crisp Financial Highlight Cards */}
        <div
          className={`relative z-10 grid gap-2.5 sm:gap-3 mb-3.5 text-center ${
            data.paperFormat === 'thermal80' ? 'grid-cols-1' : 'grid-cols-3'
          }`}
        >
          {/* Box 1: Total Amount */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 sm:p-3">
            <div className="text-[11px] font-bold text-slate-500">إجمالي الحساب / العلاج</div>
            <div className="text-sm sm:text-base font-black text-slate-900 mt-0.5 font-mono tabular-nums">
              {Number(data.totalAmount).toLocaleString()} {data.currency}
            </div>
          </div>

          {/* Box 2: Paid Amount */}
          <div className="bg-emerald-50/80 border border-emerald-300 rounded-xl p-2.5 sm:p-3">
            <div className="text-[11px] font-bold text-emerald-700">المبلغ المدفوع (المقبوض)</div>
            <div className="text-sm sm:text-base font-black text-emerald-900 mt-0.5 font-mono tabular-nums">
              {Number(data.paidAmount).toLocaleString()} {data.currency}
            </div>
          </div>

          {/* Box 3: Remaining Balance with Status Badge */}
          <div
            className={`rounded-xl p-2.5 sm:p-3 border ${
              hasRemaining
                ? 'bg-rose-50/80 border-rose-300 text-rose-900'
                : 'bg-emerald-50/80 border-emerald-300 text-emerald-900'
            }`}
          >
            <div className="text-[11px] font-bold flex items-center justify-center gap-1">
              <span>{hasRemaining ? 'المتبقي (رصيد آجل)' : 'حالة الحساب'}</span>
            </div>
            <div className="text-sm sm:text-base font-black mt-0.5 font-mono tabular-nums">
              {hasRemaining ? (
                `${Number(data.remainingAmount).toLocaleString()} ${data.currency}`
              ) : (
                <span className="inline-flex items-center gap-1 text-emerald-800 text-xs sm:text-sm font-black">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>خالص ومسدد بالكامل</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* 5. Signatures, Digital QR Verification & Warm Wish */}
        <div className="relative z-10 grid grid-cols-12 gap-2 sm:gap-3 items-center pt-2 border-t border-slate-200">
          {/* Doctor / Accountant Signature */}
          <div
            className={
              data.paperFormat === 'thermal80'
                ? 'col-span-6 text-center'
                : 'col-span-4 text-center'
            }
          >
            <div className="text-[10px] sm:text-[11px] font-extrabold text-slate-700 mb-1">
              توقيع المحاسب / الطبيب المعالج
            </div>
            <div className="h-14 sm:h-16 border border-slate-300 rounded-xl flex items-center justify-center bg-slate-50/80 overflow-hidden">
              {data.accountantSig ? (
                <img
                  src={data.accountantSig}
                  className="max-h-12 sm:max-h-14 object-contain"
                  alt="Doctor / Accountant Signature"
                />
              ) : (
                <span className="text-[10px] text-slate-400 font-medium">التوقيع والختم المعتمد</span>
              )}
            </div>
          </div>

          {/* Center: Digital QR & Warm Clinic Wish */}
          <div
            className={
              data.paperFormat === 'thermal80'
                ? 'col-span-12 order-last flex flex-col items-center justify-center pt-1'
                : 'col-span-4 flex flex-col items-center justify-center'
            }
          >
            {settings.features.showQrCode && qrDataUrl && (
              <div className="p-1 bg-white border border-slate-200 rounded-xl shadow-2xs flex items-center justify-center">
                <img
                  src={qrDataUrl}
                  alt="Official Verification QR Code"
                  className="w-16 h-16 sm:w-18 sm:h-18 object-contain block"
                />
              </div>
            )}
            <div className="text-[9px] sm:text-[10px] font-bold text-slate-600 text-center mt-1.5 leading-snug break-words">
              {data.notes || 'مع تمنياتنا لكم بدوام الصحة والعافية والابتسامة المشرقة'}
            </div>
            <div className="text-[8px] sm:text-[9px] font-medium text-slate-400 text-center mt-0.5">
              سند رسمي صادر إلكترونياً وموثق
            </div>
          </div>

          {/* Patient / Recipient Signature */}
          <div
            className={
              data.paperFormat === 'thermal80'
                ? 'col-span-6 text-center'
                : 'col-span-4 text-center'
            }
          >
            <div className="text-[10px] sm:text-[11px] font-extrabold text-slate-700 mb-1">
              توقيع المريض / المستلم
            </div>
            <div className="h-14 sm:h-16 border border-slate-300 rounded-xl flex items-center justify-center bg-slate-50/80 overflow-hidden">
              {data.receiverSig ? (
                <img
                  src={data.receiverSig}
                  className="max-h-12 sm:max-h-14 object-contain"
                  alt="Patient Signature"
                />
              ) : (
                <span className="text-[10px] text-slate-400 font-medium">توقيع المستلم</span>
              )}
            </div>
          </div>
        </div>

        {/* 6. Footer: Clinic Address & Verified Contact Phones */}
        <div className="relative z-10 mt-3 pt-2.5 border-t-2 border-slate-800 flex flex-col sm:flex-row items-center justify-between text-[10px] sm:text-[11px] font-bold text-slate-600 gap-1.5 text-center sm:text-right">
          <div>
            <span>العنوان:</span>{' '}
            <span className="text-slate-900">{settings.identity.address || '—'}</span>
          </div>

          <div className="flex flex-wrap items-center justify-center sm:justify-end gap-y-1">
            {phoneItems.map((phone, idx) => (
              <React.Fragment key={idx}>
                {idx > 0 && <span className="mx-1.5 text-slate-300">|</span>}
                <span
                  dir="ltr"
                  className="inline-block whitespace-nowrap font-mono tabular-nums text-slate-900"
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
