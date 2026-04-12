'use client';

import { useCallback, useState } from 'react';
import { ANALYTICS_EVENTS } from 'shared/constants';
import { trackClientEvent } from '@/lib/analytics';

type PdfStatus = 'idle' | 'generating' | 'done' | 'error';

export function useExportPdf(nodeRef: React.RefObject<HTMLElement | null>) {
  const [status, setStatus] = useState<PdfStatus>('idle');

  const exportPdf = useCallback(async () => {
    if (!nodeRef.current) {
      setStatus('error');
      return;
    }

    setStatus('generating');

    try {
      // dynamic imports keep the bundle lean — jspdf + html2canvas are ~200KB
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ]);

      const canvas = await html2canvas(nodeRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: null,
        logging: false,
      });

      const imgWidth = 190; // A4 width minus margins (210 - 10 - 10)
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      const pageHeight = 277; // A4 height minus margins (297 - 10 - 10)

      const pdf = new jsPDF('p', 'mm', 'a4');
      let yOffset = 10;
      let remainingHeight = imgHeight;
      const imgData = canvas.toDataURL('image/png');

      // first page
      pdf.addImage(imgData, 'PNG', 10, yOffset, imgWidth, imgHeight);
      remainingHeight -= pageHeight;

      // additional pages if content overflows
      while (remainingHeight > 0) {
        pdf.addPage();
        yOffset = -(imgHeight - remainingHeight) + 10;
        pdf.addImage(imgData, 'PNG', 10, yOffset, imgWidth, imgHeight);
        remainingHeight -= pageHeight;
      }

      pdf.save('tellsight-report.pdf');
      setStatus('done');
      trackClientEvent(ANALYTICS_EVENTS.INSIGHT_EXPORTED, { format: 'pdf' });
    } catch {
      setStatus('error');
    }
  }, [nodeRef]);

  return { status, exportPdf };
}
