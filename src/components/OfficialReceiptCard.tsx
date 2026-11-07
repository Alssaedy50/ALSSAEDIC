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
    let raw = String(data.amountWords || '').trim();
    if (!raw || raw === '—') return '—';
    // Strip any trailing duplicate 'فقط لا غير' or 'لا غير' or 'فقط' to prevent repetition
    raw = raw.replace(/(?:\s*فقط\s*لا\s*غير|\s*لا\s*غير|\s*فقط)+\s*$/g, '').trim();
    if (!raw) return '—';
    return raw.startsWith('فقط') ? `${raw} لا غير` : `فقط ${raw} لا غير`;
  }, [data.amountWords]);

  const hasRemaining = (Number(data.remainingAmount) || 0) > 0;

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

  // Ultra-High-Resolution (3x) Canvas Generator with A5 Portrait & Thermal 80mm support
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

    // ==================== OFFICIAL A5 PORTRAIT RECEIPT (عمودي A5 متناسق بدون فراغات) ====================
    const W = 560; // Standard A5 Portrait Width (148mm : 210mm ratio -> ~560 x 792)
    const padX = 20;
    const innerW = W - padX * 2; // 520px
    const labelColW = 148;
    const valColW = innerW - labelColW; // 372px
    const textMaxW = valColW - 24; // 348px

    // Measure wrapped lines for dynamic table rows
    measureCtx.font = '900 14px "Tajawal", "IBM Plex Sans Arabic", sans-serif';
    const patientFullText = `${data.patientName || '....................'} المحترم/ة`;
    const patientLines = wrapCanvasText(measureCtx, patientFullText, textMaxW);

    measureCtx.font = '800 13.5px "Tajawal", "IBM Plex Sans Arabic", sans-serif';
    const serviceLines = wrapCanvasText(measureCtx, servicesText, textMaxW);
    const wordsLines = wrapCanvasText(measureCtx, amountWordsFormatted, textMaxW);

    measureCtx.font = '800 13px "JetBrains Mono", monospace';
    const fdiLines = data.toothFDI ? wrapCanvasText(measureCtx, data.toothFDI, textMaxW - 16) : [];

    measureCtx.font = '700 11.5px "Tajawal", "IBM Plex Sans Arabic", sans-serif';
    const noteText = data.notes || 'مع تمنياتنا لكم بدوام الصحة والعافية والابتسامة المشرقة';
    const notesLines = wrapCanvasText(measureCtx, noteText, innerW - 32);

    // Compute exact heights of each structured table row
    const rowPatientH = Math.max(38, patientLines.length * 22 + 16);
    const rowPhoneH = 36;
    const rowServicesH = Math.max(40, serviceLines.length * 22 + 16);
    const rowFdiH = data.toothFDI ? Math.max(38, fdiLines.length * 20 + 16) : 0;
    const rowWordsH = Math.max(40, wordsLines.length * 22 + 16);

    const tableTotalH = rowPatientH + rowPhoneH + rowServicesH + rowFdiH + rowWordsH;
    const noteBoxH = Math.max(32, notesLines.length * 18 + 14);

    // Header (112) + Meta (52) + Gap (12) + Table (tableTotalH) + Gap (14) + Cards (68) + Gap (14) + Signatures/QR (96) + Gap (10) + NoteBanner (noteBoxH) + Gap (14) + Footer (54)
    const calculatedH = 112 + 52 + 12 + tableTotalH + 14 + 68 + 14 + 96 + 10 + noteBoxH + 14 + 54;
    const H = Math.max(780, calculatedH);

    canvas.width = W * scale;
    canvas.height = H * scale;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(scale, scale);
    ctx.direction = 'rtl';

    // 1. Crisp White Paper Background & Double Official Security Frame
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = settings.appearance.primaryColor || '#0B2545';
    ctx.lineWidth = 3.5;
    ctx.strokeRect(3, 3, W - 6, H - 6);

    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 1;
    ctx.strokeRect(8, 8, W - 16, H - 16);

    // 2. Subtle Centered Watermark inside the Table Area
    if (logoImg) {
      ctx.save();
      ctx.globalAlpha = Math.min(settings.appearance.watermarkOpacity || 4, 4.5) / 100;
      ctx.drawImage(logoImg, (W - 150) / 2, 220, 150, 150);
      ctx.restore();
    }

    // 3. Official Header (Right: Arabic Info, Center: Logo, Left: English Info + Centered Title Pill)
    ctx.textAlign = 'right';
    ctx.fillStyle = '#0F172A';
    ctx.font = '900 16.5px "Tajawal", "IBM Plex Sans Arabic", sans-serif';
    ctx.fillText(settings.identity.doctorAr, W - padX, 34);

    ctx.fillStyle = '#075985';
    ctx.font = '800 12.5px "Tajawal", "IBM Plex Sans Arabic", sans-serif';
    ctx.fillText(settings.identity.specialtyAr, W - padX, 53);

    ctx.fillStyle = '#475569';
    ctx.font = '700 11.5px "Tajawal", "IBM Plex Sans Arabic", sans-serif';
    ctx.fillText(settings.identity.clinicAr, W - padX, 71);

    // Center Logo
    if (logoImg) {
      ctx.save();
      ctx.fillStyle = '#F8FAFC';
      ctx.strokeStyle = '#E2E8F0';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect((W - 52) / 2, 14, 52, 52, 12);
      ctx.fill();
      ctx.stroke();
      ctx.drawImage(logoImg, (W - 44) / 2, 18, 44, 44);
      ctx.restore();
    }

    // Left: English Clinic & Doctor Info
    ctx.save();
    ctx.direction = 'ltr';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#0F172A';
    ctx.font = '900 12px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(settings.identity.clinicEn, padX, 36);
    ctx.fillStyle = '#075985';
    ctx.font = '700 11px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(settings.identity.doctorEn, padX, 54);
    ctx.restore();

    // Header Line + Centered Voucher Title Badge on the Line
    const headerLineY = 90;
    ctx.strokeStyle = '#1E293B';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padX, headerLineY);
    ctx.lineTo(W - padX, headerLineY);
    ctx.stroke();

    const badgeW = 246;
    const badgeH = 26;
    ctx.fillStyle = settings.appearance.primaryColor || '#0B2545';
    ctx.beginPath();
    ctx.roundRect((W - badgeW) / 2, headerLineY - badgeH / 2, badgeW, badgeH, 13);
    ctx.fill();

    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.font = '900 11.5px "Tajawal", "IBM Plex Sans Arabic", sans-serif';
    ctx.fillText('سند قبض مالي معتمد | RECEIPT VOUCHER', W / 2, headerLineY + 4);

    // 4. 3-Column Divided Metadata Bar (Receipt No | Date | Payment Method)
    let y = 112;
    const metaH = 48;
    ctx.fillStyle = '#F8FAFC';
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(padX, y, innerW, metaH, 10);
    ctx.fill();
    ctx.stroke();

    const colW = innerW / 3;
    // Vertical dividers between the 3 metadata columns
    ctx.beginPath();
    ctx.moveTo(padX + colW, y + 6);
    ctx.lineTo(padX + colW, y + metaH - 6);
    ctx.moveTo(padX + colW * 2, y + 6);
    ctx.lineTo(padX + colW * 2, y + metaH - 6);
    ctx.strokeStyle = '#CBD5E1';
    ctx.stroke();

    // Column 1 (Right): Receipt No
    const col1Center = W - padX - colW / 2;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#64748B';
    ctx.font = '800 11px "Tajawal", "IBM Plex Sans Arabic", sans-serif';
    ctx.fillText('رقم السند', col1Center, y + 18);
    ctx.save();
    ctx.direction = 'ltr';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#BE123C';
    ctx.font = '900 14px "JetBrains Mono", monospace';
    ctx.fillText(`#${data.receiptNo}`, col1Center, y + 38);
    ctx.restore();

    // Column 2 (Center): Date
    const col2Center = W / 2;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#64748B';
    ctx.font = '800 11px "Tajawal", "IBM Plex Sans Arabic", sans-serif';
    ctx.fillText('تاريخ التحرير', col2Center, y + 18);
    ctx.save();
    ctx.direction = 'ltr';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#0F172A';
    ctx.font = '800 13px "JetBrains Mono", monospace';
    ctx.fillText(data.date, col2Center, y + 38);
    ctx.restore();

    // Column 3 (Left): Payment Method
    const col3Center = padX + colW / 2;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#64748B';
    ctx.font = '800 11px "Tajawal", "IBM Plex Sans Arabic", sans-serif';
    ctx.fillText('طريقة السداد', col3Center, y + 18);
    ctx.fillStyle = '#0F172A';
    ctx.font = '900 12.5px "Tajawal", "IBM Plex Sans Arabic", sans-serif';
    ctx.fillText(data.paymentMethod, col3Center, y + 38);

    // 5. Structured Patient & Clinical Details Table (Eliminates all dead spaces & overlaps)
    y += metaH + 12;
    const tableTopY = y;
    const labelColRightX = W - padX;
    const dividerX = W - padX - labelColW; // X coordinate separating right label column from left value column

    // Outer table container background & border
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.roundRect(padX, tableTopY, innerW, tableTotalH, 10);
    ctx.fill();

    // Right label column tint
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(padX, tableTopY, innerW, tableTotalH, 10);
    ctx.clip();
    ctx.fillStyle = '#F8FAFC';
    ctx.fillRect(dividerX, tableTopY, labelColW, tableTotalH);
    ctx.restore();

    const drawTableRow = (
      rowHeight: number,
      label: string,
      renderValue: (rowTop: number, valueRightX: number) => void,
      isLast = false
    ) => {
      // Label text in the right column
      ctx.textAlign = 'right';
      ctx.fillStyle = '#334155';
      ctx.font = '800 12.5px "Tajawal", "IBM Plex Sans Arabic", sans-serif';
      ctx.fillText(label, labelColRightX - 12, y + 24);

      // Value content in the left column (aligned flush right next to dividerX)
      renderValue(y, dividerX - 12);

      y += rowHeight;
      if (!isLast) {
        ctx.strokeStyle = '#E2E8F0';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padX, y);
        ctx.lineTo(W - padX, y);
        ctx.stroke();
      }
    };

    // Row 1: Patient Name
    drawTableRow(rowPatientH, 'وصلنا من الأخ/ت:', (rowTop, valRightX) => {
      ctx.textAlign = 'right';
      ctx.fillStyle = '#020617';
      ctx.font = '900 14px "Tajawal", "IBM Plex Sans Arabic", sans-serif';
      patientLines.forEach((line, idx) => {
        ctx.fillText(line, valRightX, rowTop + 24 + idx * 22);
      });
    });

    // Row 2: Patient Contact Phone + Currency Badge
    drawTableRow(rowPhoneH, 'رقم التواصل:', (rowTop, valRightX) => {
      ctx.save();
      ctx.direction = 'ltr';
      ctx.textAlign = 'right';
      ctx.fillStyle = '#0F172A';
      ctx.font = '800 13px "JetBrains Mono", monospace';
      ctx.fillText(data.patientPhone || '—', valRightX, rowTop + 23);
      ctx.restore();

      // Currency tag neatly on the far left of the phone row
      ctx.textAlign = 'left';
      ctx.fillStyle = '#475569';
      ctx.font = '800 11.5px "Tajawal", "IBM Plex Sans Arabic", sans-serif';
      ctx.fillText(`عملة السند: ${data.currency}`, padX + 14, rowTop + 23);
    });

    // Row 3: Medical Services
    drawTableRow(rowServicesH, 'الخدمات العلاجية:', (rowTop, valRightX) => {
      ctx.textAlign = 'right';
      ctx.fillStyle = '#0C4A6E';
      ctx.font = '800 13.5px "Tajawal", "IBM Plex Sans Arabic", sans-serif';
      serviceLines.forEach((line, idx) => {
        ctx.fillText(line, valRightX, rowTop + 24 + idx * 22);
      });
    });

    // Row 4: Tooth FDI Numbers (if any)
    if (data.toothFDI) {
      drawTableRow(rowFdiH, 'أرقام الأسنان (FDI):', (rowTop, valRightX) => {
        ctx.save();
        ctx.direction = 'ltr';
        ctx.textAlign = 'right';
        ctx.fillStyle = '#0369A1';
        ctx.font = '800 13px "JetBrains Mono", monospace';
        fdiLines.forEach((line, idx) => {
          ctx.fillText(line, valRightX, rowTop + 24 + idx * 20);
        });
        ctx.restore();
      });
    }

    // Row 5: Amount in Words (Tafqeet)
    drawTableRow(
      rowWordsH,
      'المبلغ بالحروف:',
      (rowTop, valRightX) => {
        ctx.textAlign = 'right';
        ctx.fillStyle = '#0F172A';
        ctx.font = '800 13.5px "Tajawal", "IBM Plex Sans Arabic", sans-serif';
        wordsLines.forEach((line, idx) => {
          ctx.fillText(line, valRightX, rowTop + 24 + idx * 22);
        });
      },
      true
    );

    // Draw vertical column divider & outer table border
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(dividerX, tableTopY);
    ctx.lineTo(dividerX, tableTopY + tableTotalH);
    ctx.stroke();

    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(padX, tableTopY, innerW, tableTotalH, 10);
    ctx.stroke();

    // 6. Three Financial Highlight Cards (Equal Widths across 520px)
    y += 14;
    const boxGap = 10;
    const boxW = (innerW - boxGap * 2) / 3; // 166.67px
    const boxH = 66;

    // Card 1 (Right): Total
    const b1X = W - padX - boxW;
    ctx.fillStyle = '#F8FAFC';
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(b1X, y, boxW, boxH, 10);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#475569';
    ctx.font = '800 11.5px "Tajawal", "IBM Plex Sans Arabic", sans-serif';
    ctx.fillText('إجمالي الحساب / العلاج', b1X + boxW / 2, y + 23);
    ctx.fillStyle = '#0F172A';
    ctx.font = '900 14.5px "Tajawal", "IBM Plex Sans Arabic", sans-serif';
    ctx.fillText(
      `${Number(data.totalAmount).toLocaleString()} ${data.currency}`,
      b1X + boxW / 2,
      y + 48
    );

    // Card 2 (Center): Paid
    const b2X = b1X - boxGap - boxW;
    ctx.fillStyle = '#ECFDF5';
    ctx.strokeStyle = '#6EE7B7';
    ctx.beginPath();
    ctx.roundRect(b2X, y, boxW, boxH, 10);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#047857';
    ctx.font = '800 11.5px "Tajawal", "IBM Plex Sans Arabic", sans-serif';
    ctx.fillText('المبلغ المدفوع (المقبوض)', b2X + boxW / 2, y + 23);
    ctx.fillStyle = '#065F46';
    ctx.font = '900 14.5px "Tajawal", "IBM Plex Sans Arabic", sans-serif';
    ctx.fillText(
      `${Number(data.paidAmount).toLocaleString()} ${data.currency}`,
      b2X + boxW / 2,
      y + 48
    );

    // Card 3 (Left): Remaining Balance
    const b3X = padX;
    ctx.fillStyle = hasRemaining ? '#FFF1F2' : '#ECFDF5';
    ctx.strokeStyle = hasRemaining ? '#FDA4AF' : '#6EE7B7';
    ctx.beginPath();
    ctx.roundRect(b3X, y, boxW, boxH, 10);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = hasRemaining ? '#9F1239' : '#047857';
    ctx.font = '800 11.5px "Tajawal", "IBM Plex Sans Arabic", sans-serif';
    ctx.fillText(hasRemaining ? 'المتبقي (رصيد آجل)' : 'حالة الحساب', b3X + boxW / 2, y + 23);
    ctx.font = '900 14px "Tajawal", "IBM Plex Sans Arabic", sans-serif';
    ctx.fillText(
      hasRemaining
        ? `${Number(data.remainingAmount).toLocaleString()} ${data.currency}`
        : 'خالص ومسدد بالكامل ✓',
      b3X + boxW / 2,
      y + 48
    );

    // 7. Signatures & Digital QR Verification Row
    y += boxH + 14;
    const sigBoxW = 192;
    const sigBoxH = 68;

    // Right Signature: Doctor / Accountant
    const rightSigX = W - padX - sigBoxW;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#334155';
    ctx.font = '800 11.5px "Tajawal", "IBM Plex Sans Arabic", sans-serif';
    ctx.fillText('توقيع المحاسب / الطبيب المعالج', rightSigX + sigBoxW / 2, y + 12);

    ctx.fillStyle = '#F8FAFC';
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(rightSigX, y + 20, sigBoxW, sigBoxH, 10);
    ctx.fill();
    ctx.stroke();

    if (accSigImg) {
      ctx.drawImage(accSigImg, rightSigX + 16, y + 25, sigBoxW - 32, sigBoxH - 10);
    } else {
      ctx.fillStyle = '#94A3B8';
      ctx.font = '700 11px "Tajawal", "IBM Plex Sans Arabic", sans-serif';
      ctx.fillText('التوقيع والختم المعتمد', rightSigX + sigBoxW / 2, y + 58);
    }

    // Center QR Code Frame
    if (qrImg) {
      const qrBoxSize = 78;
      const qrBoxX = (W - qrBoxSize) / 2;
      const qrBoxY = y + 10;
      ctx.fillStyle = '#FFFFFF';
      ctx.strokeStyle = '#CBD5E1';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(qrBoxX, qrBoxY, qrBoxSize, qrBoxSize, 10);
      ctx.fill();
      ctx.stroke();
      ctx.drawImage(qrImg, qrBoxX + 5, qrBoxY + 5, qrBoxSize - 10, qrBoxSize - 10);
    }

    // Left Signature: Patient / Receiver
    const leftSigX = padX;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#334155';
    ctx.font = '800 11.5px "Tajawal", "IBM Plex Sans Arabic", sans-serif';
    ctx.fillText('توقيع المريض / المستلم', leftSigX + sigBoxW / 2, y + 12);

    ctx.fillStyle = '#F8FAFC';
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(leftSigX, y + 20, sigBoxW, sigBoxH, 10);
    ctx.fill();
    ctx.stroke();

    if (recSigImg) {
      ctx.drawImage(recSigImg, leftSigX + 16, y + 25, sigBoxW - 32, sigBoxH - 10);
    } else {
      ctx.fillStyle = '#94A3B8';
      ctx.font = '700 11px "Tajawal", "IBM Plex Sans Arabic", sans-serif';
      ctx.fillText('توقيع المستلم', leftSigX + sigBoxW / 2, y + 58);
    }

    // 8. Dedicated Full-Width Note / Clinic Wish Banner (Prevents cramped text under QR)
    y += 96;
    ctx.fillStyle = '#F8FAFC';
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(padX, y, innerW, noteBoxH, 8);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#475569';
    ctx.font = '700 11.5px "Tajawal", "IBM Plex Sans Arabic", sans-serif';
    notesLines.forEach((line, idx) => {
      ctx.fillText(line, W / 2, y + 20 + idx * 18);
    });

    // 9. Balanced 2-Line Official Footer (Address on Line 1, LTR Phones on Line 2 — Zero Overlap)
    const footerTopY = H - 52;
    ctx.strokeStyle = '#1E293B';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padX, footerTopY);
    ctx.lineTo(W - padX, footerTopY);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#334155';
    ctx.font = '800 11.5px "Tajawal", "IBM Plex Sans Arabic", sans-serif';
    ctx.fillText(`العنوان: ${settings.identity.address || '—'}`, W / 2, footerTopY + 18);

    if (phoneItems.length > 0) {
      ctx.save();
      ctx.direction = 'ltr';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#0F172A';
      ctx.font = '800 11.5px "JetBrains Mono", monospace';
      ctx.fillText(phoneItems.join('   |   '), W / 2, footerTopY + 37);
      ctx.restore();
    }

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
      // Standard A5 Portrait (148mm x 210mm) preserving exact proportions
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a5',
      });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgRatio = canvas.height / canvas.width;
      let renderW = pageW;
      let renderH = pageW * imgRatio;
      if (renderH > pageH) {
        renderH = pageH;
        renderW = pageH / imgRatio;
      }
      const offsetX = (pageW - renderW) / 2;
      const offsetY = (pageH - renderH) / 2;
      pdf.addImage(imgDataUrl, 'PNG', offsetX, offsetY, renderW, renderH, undefined, 'FAST');
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
      notify(`تم حفظ صورة السند #${data.receiptNo} (A5 عمودي) بدقة عالية`, 'success');
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
      notify(`تم حفظ ملف PDF للسند #${data.receiptNo} (A5 عمودي)`, 'success');
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
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 sm:p-3 shadow-xs no-print max-w-[560px] mx-auto">
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
                <option value="a5">A5 عمودي معتمد (قياسي)</option>
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
                title="حفظ السند كصورة PNG عمودية عالية الدقة (300 DPI)"
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
                title="حفظ السند كملف PDF عمودي A5 قابل للطباعة والمشاركة"
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

      {/* ==================== OFFICIAL A5 PORTRAIT MEDICAL RECEIPT CARD ==================== */}
      <div
        id="receipt-capture-area"
        style={{ borderColor: settings.appearance.primaryColor || '#0B2545' }}
        className={`receipt-paper rounded-2xl p-3.5 sm:p-5 shadow-xl relative overflow-hidden border-[3px] mx-auto bg-white transition-all ${
          data.paperFormat === 'thermal80' ? 'max-w-[360px]' : 'max-w-[560px]'
        }`}
      >
        {/* Inner Subtle Security Frame */}
        <div className="pointer-events-none absolute inset-1.5 rounded-xl border border-slate-200/90" />

        {/* Subtle Watermark centered cleanly inside the body area */}
        <img
          src={logoSrc}
          alt=""
          aria-hidden="true"
          referrerPolicy="no-referrer"
          className="pointer-events-none select-none absolute top-44 left-1/2 -translate-x-1/2 w-36 h-36 sm:w-40 sm:h-40 object-contain"
          style={{ opacity: Math.min(settings.appearance.watermarkOpacity || 4, 4.5) / 100 }}
        />

        {/* 1. Official Header (3-Column Top + Centered Title Badge on Divider Line) */}
        <div className="relative z-10 pb-3.5 mb-3">
          <div className="grid grid-cols-12 items-center gap-2">
            {/* Right: Arabic Clinic & Doctor Info */}
            <div className="col-span-5 text-right space-y-0.5 min-w-0">
              <div className="text-sm sm:text-base font-black text-slate-900 leading-tight truncate">
                {settings.identity.doctorAr}
              </div>
              <div className="text-[11px] sm:text-xs font-extrabold text-sky-800 leading-tight truncate">
                {settings.identity.specialtyAr}
              </div>
              <div className="text-[10px] sm:text-[11px] font-bold text-slate-600 leading-tight truncate">
                {settings.identity.clinicAr}
              </div>
            </div>

            {/* Center: Clinic Logo */}
            <div className="col-span-2 flex justify-center">
              <div className="w-12 h-12 sm:w-13 sm:h-13 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center p-1 shadow-2xs">
                <img
                  src={logoSrc}
                  alt="Clinic Logo"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-contain"
                />
              </div>
            </div>

            {/* Left: English Clinic & Doctor Info */}
            <div className="col-span-5 text-left space-y-0.5 min-w-0" dir="ltr">
              <div className="text-[11px] sm:text-xs font-black text-slate-900 leading-tight truncate">
                {settings.identity.clinicEn}
              </div>
              <div className="text-[10px] sm:text-[11px] font-bold text-sky-800 leading-tight truncate">
                {settings.identity.doctorEn}
              </div>
            </div>
          </div>

          {/* Divider Line with Centered Official Title Badge */}
          <div className="relative mt-3 flex items-center justify-center">
            <div className="w-full border-t-2 border-slate-800" />
            <div
              style={{ backgroundColor: settings.appearance.primaryColor || '#0B2545' }}
              className="absolute px-3.5 py-1 rounded-full text-white text-[10px] sm:text-[11px] font-black tracking-wide whitespace-nowrap shadow-2xs"
            >
              سند قبض مالي معتمد | RECEIPT VOUCHER
            </div>
          </div>
        </div>

        {/* 2. 3-Column Divided Metadata Strip */}
        <div className="relative z-10 grid grid-cols-3 divide-x divide-x-reverse divide-slate-200 bg-slate-50 border border-slate-300 rounded-xl py-2 mb-3 text-center">
          <div className="px-2">
            <div className="text-[10px] font-bold text-slate-500">رقم السند</div>
            <div
              dir="ltr"
              className="text-xs sm:text-sm font-black text-rose-700 font-mono tabular-nums mt-0.5"
            >
              #{data.receiptNo}
            </div>
          </div>

          <div className="px-2">
            <div className="text-[10px] font-bold text-slate-500">تاريخ التحرير</div>
            <div
              dir="ltr"
              className="text-xs sm:text-sm font-extrabold text-slate-900 font-mono tabular-nums mt-0.5"
            >
              {data.date}
            </div>
          </div>

          <div className="px-2">
            <div className="text-[10px] font-bold text-slate-500">طريقة السداد</div>
            <div className="text-xs sm:text-sm font-black text-slate-900 mt-0.5 truncate">
              {data.paymentMethod}
            </div>
          </div>
        </div>

        {/* 3. Structured Bordered Details Table (Zero Empty Gaps or Overlaps) */}
        <div className="relative z-10 rounded-xl border border-slate-300 overflow-hidden divide-y divide-slate-200 mb-3 text-xs sm:text-sm bg-white">
          {/* Row 1: Patient Name */}
          <div className="flex items-stretch">
            <div className="w-28 sm:w-36 shrink-0 bg-slate-50 px-2.5 sm:px-3 py-2 font-extrabold text-slate-700 border-l border-slate-200 flex items-center text-[11px] sm:text-xs">
              وصلنا من الأخ/ت:
            </div>
            <div className="flex-1 px-2.5 sm:px-3 py-2 font-black text-slate-950 break-words flex items-center justify-between gap-2">
              <span>
                {data.patientName || '....................'}{' '}
                <span className="font-bold text-slate-500 text-xs">المحترم/ة</span>
              </span>
            </div>
          </div>

          {/* Row 2: Contact Phone & Currency */}
          <div className="flex items-stretch">
            <div className="w-28 sm:w-36 shrink-0 bg-slate-50 px-2.5 sm:px-3 py-2 font-extrabold text-slate-700 border-l border-slate-200 flex items-center text-[11px] sm:text-xs">
              رقم التواصل:
            </div>
            <div className="flex-1 px-2.5 sm:px-3 py-2 flex items-center justify-between gap-2 flex-wrap">
              <span
                dir="ltr"
                className="font-mono font-extrabold text-slate-900 tabular-nums text-xs sm:text-sm"
              >
                {data.patientPhone || '—'}
              </span>
              <span className="text-[10px] sm:text-[11px] font-bold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md">
                العملة: {data.currency}
              </span>
            </div>
          </div>

          {/* Row 3: Medical Services Rendered */}
          <div className="flex items-stretch">
            <div className="w-28 sm:w-36 shrink-0 bg-slate-50 px-2.5 sm:px-3 py-2 font-extrabold text-slate-700 border-l border-slate-200 flex items-center text-[11px] sm:text-xs">
              الخدمات العلاجية:
            </div>
            <div className="flex-1 px-2.5 sm:px-3 py-2 font-extrabold text-sky-950 break-words leading-relaxed flex items-center">
              {servicesText}
            </div>
          </div>

          {/* Row 4: FDI Teeth (if specified) */}
          {data.toothFDI && (
            <div className="flex items-stretch">
              <div className="w-28 sm:w-36 shrink-0 bg-slate-50 px-2.5 sm:px-3 py-2 font-extrabold text-slate-700 border-l border-slate-200 flex items-center text-[11px] sm:text-xs">
                أرقام الأسنان (FDI):
              </div>
              <div className="flex-1 px-2.5 sm:px-3 py-2 flex items-center">
                <span
                  dir="ltr"
                  className="inline-flex items-center font-mono font-extrabold text-sky-800 bg-sky-50 border border-sky-200 px-2.5 py-0.5 rounded-lg text-xs tabular-nums"
                >
                  {data.toothFDI}
                </span>
              </div>
            </div>
          )}

          {/* Row 5: Amount in Words (Tafqeet) */}
          <div className="flex items-stretch">
            <div className="w-28 sm:w-36 shrink-0 bg-slate-50 px-2.5 sm:px-3 py-2 font-extrabold text-slate-700 border-l border-slate-200 flex items-center text-[11px] sm:text-xs">
              المبلغ بالحروف:
            </div>
            <div className="flex-1 px-2.5 sm:px-3 py-2 font-extrabold text-slate-900 break-words leading-relaxed flex items-center">
              {amountWordsFormatted}
            </div>
          </div>
        </div>

        {/* 4. Three Crisp Financial Highlight Cards */}
        <div
          className={`relative z-10 grid gap-2 mb-3 text-center ${
            data.paperFormat === 'thermal80' ? 'grid-cols-1' : 'grid-cols-3'
          }`}
        >
          {/* Box 1: Total Amount */}
          <div className="bg-slate-50 border border-slate-300 rounded-xl p-2 sm:p-2.5 flex flex-col justify-center">
            <div className="text-[10px] sm:text-[11px] font-extrabold text-slate-600">
              إجمالي الحساب / العلاج
            </div>
            <div className="text-xs sm:text-sm font-black text-slate-900 mt-1 font-mono tabular-nums">
              {Number(data.totalAmount).toLocaleString()} {data.currency}
            </div>
          </div>

          {/* Box 2: Paid Amount */}
          <div className="bg-emerald-50/90 border border-emerald-300 rounded-xl p-2 sm:p-2.5 flex flex-col justify-center">
            <div className="text-[10px] sm:text-[11px] font-extrabold text-emerald-700">
              المبلغ المدفوع (المقبوض)
            </div>
            <div className="text-xs sm:text-sm font-black text-emerald-900 mt-1 font-mono tabular-nums">
              {Number(data.paidAmount).toLocaleString()} {data.currency}
            </div>
          </div>

          {/* Box 3: Remaining Balance with Status Badge */}
          <div
            className={`rounded-xl p-2 sm:p-2.5 border flex flex-col justify-center ${
              hasRemaining
                ? 'bg-rose-50/90 border-rose-300 text-rose-900'
                : 'bg-emerald-50/90 border-emerald-300 text-emerald-900'
            }`}
          >
            <div className="text-[10px] sm:text-[11px] font-extrabold">
              {hasRemaining ? 'المتبقي (رصيد آجل)' : 'حالة الحساب'}
            </div>
            <div className="text-xs sm:text-sm font-black mt-1 font-mono tabular-nums">
              {hasRemaining ? (
                `${Number(data.remainingAmount).toLocaleString()} ${data.currency}`
              ) : (
                <span className="inline-flex items-center justify-center gap-1 text-emerald-800 text-[11px] sm:text-xs font-black">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>خالص ومسدد بالكامل</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* 5. Signatures & Digital QR Verification Row */}
        <div className="relative z-10 grid grid-cols-12 gap-2 items-center mb-2.5">
          {/* Doctor / Accountant Signature */}
          <div
            className={
              data.paperFormat === 'thermal80'
                ? 'col-span-6 text-center'
                : 'col-span-5 text-center'
            }
          >
            <div className="text-[10px] sm:text-[11px] font-extrabold text-slate-700 mb-1">
              توقيع المحاسب / الطبيب المعالج
            </div>
            <div className="h-14 sm:h-16 border border-slate-300 rounded-xl flex items-center justify-center bg-slate-50/80 overflow-hidden p-1">
              {data.accountantSig ? (
                <img
                  src={data.accountantSig}
                  className="max-h-12 sm:max-h-14 object-contain"
                  alt="Doctor / Accountant Signature"
                />
              ) : (
                <span className="text-[10px] text-slate-400 font-bold">التوقيع والختم المعتمد</span>
              )}
            </div>
          </div>

          {/* Center: Digital QR Code */}
          <div
            className={
              data.paperFormat === 'thermal80'
                ? 'col-span-12 order-last flex flex-col items-center justify-center pt-1'
                : 'col-span-2 flex flex-col items-center justify-center'
            }
          >
            {settings.features.showQrCode && qrDataUrl && (
              <div className="p-1 bg-white border border-slate-300 rounded-xl shadow-2xs flex items-center justify-center">
                <img
                  src={qrDataUrl}
                  alt="Official Verification QR Code"
                  className="w-16 h-16 sm:w-18 sm:h-18 object-contain block"
                />
              </div>
            )}
          </div>

          {/* Patient / Recipient Signature */}
          <div
            className={
              data.paperFormat === 'thermal80'
                ? 'col-span-6 text-center'
                : 'col-span-5 text-center'
            }
          >
            <div className="text-[10px] sm:text-[11px] font-extrabold text-slate-700 mb-1">
              توقيع المريض / المستلم
            </div>
            <div className="h-14 sm:h-16 border border-slate-300 rounded-xl flex items-center justify-center bg-slate-50/80 overflow-hidden p-1">
              {data.receiverSig ? (
                <img
                  src={data.receiverSig}
                  className="max-h-12 sm:max-h-14 object-contain"
                  alt="Patient Signature"
                />
              ) : (
                <span className="text-[10px] text-slate-400 font-bold">توقيع المستلم</span>
              )}
            </div>
          </div>
        </div>

        {/* 6. Dedicated Full-Width Note / Warm Clinic Wish Bar */}
        <div className="relative z-10 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-center mb-2.5">
          <div className="text-[10px] sm:text-[11px] font-bold text-slate-700 leading-snug break-words">
            {data.notes || 'مع تمنياتنا لكم بدوام الصحة والعافية والابتسامة المشرقة'}
          </div>
        </div>

        {/* 7. Balanced 2-Row Official Footer (Address + LTR Phones without overlap) */}
        <div className="relative z-10 pt-2 border-t-2 border-slate-800 flex flex-col items-center justify-center text-[10px] sm:text-[11px] font-bold text-slate-700 gap-1 text-center">
          <div>
            <span className="text-slate-500">العنوان:</span>{' '}
            <span className="font-extrabold text-slate-900">{settings.identity.address || '—'}</span>
          </div>

          {phoneItems.length > 0 && (
            <div className="flex flex-wrap items-center justify-center gap-y-0.5">
              {phoneItems.map((phone, idx) => (
                <React.Fragment key={idx}>
                  {idx > 0 && <span className="mx-1.5 text-slate-300">|</span>}
                  <span
                    dir="ltr"
                    className="inline-block whitespace-nowrap font-mono font-extrabold tabular-nums text-slate-900"
                  >
                    {phone}
                  </span>
                </React.Fragment>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
