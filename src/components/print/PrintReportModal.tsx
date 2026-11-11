'use client';

import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { usePrintReport } from '@/context/PrintReportContext';
import { StandardTemplateCenter } from './StandardTemplateCenter';

export const PrintReportModal: React.FC = () => {
  const { isPrintModalOpen, closePrintModal } = usePrintReport();

  useEffect(() => {
    if (!isPrintModalOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closePrintModal();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [isPrintModalOpen, closePrintModal]);

  if (!isPrintModalOpen) return null;

  return (
    <>
      {/* Print Specific CSS to isolate printable paper */}
      <style jsx global>{`
        #printable-report-area th {
          text-align: center !important;
          white-space: nowrap !important;
        }
        #printable-report-area td {
          vertical-align: middle;
          word-break: keep-all;
        }
        @media print {
          html,
          body {
            width: 100% !important;
            height: auto !important;
            min-height: 0 !important;
            overflow: visible !important;
            background: #ffffff !important;
            margin: 0 !important;
            padding: 0 !important;
            display: block !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body * {
            visibility: hidden !important;
          }
          #print-modal-backdrop,
          #print-modal-shell,
          #printable-report-area,
          #printable-report-area * {
            visibility: visible !important;
          }
          #print-modal-backdrop {
            position: static !important;
            inset: auto !important;
            width: 100% !important;
            height: auto !important;
            min-height: 0 !important;
            max-height: none !important;
            overflow: visible !important;
            display: block !important;
            background: #ffffff !important;
            backdrop-filter: none !important;
            -webkit-backdrop-filter: none !important;
            transform: none !important;
            animation: none !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          #print-modal-shell {
            position: static !important;
            width: 100% !important;
            max-width: none !important;
            height: auto !important;
            min-height: 0 !important;
            max-height: none !important;
            overflow: visible !important;
            display: block !important;
            background: #ffffff !important;
            border: none !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          #printable-report-area {
            position: static !important;
            width: 100% !important;
            max-width: none !important;
            min-height: 0 !important;
            height: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            box-shadow: none !important;
            border: none !important;
          }
          .no-print {
            display: none !important;
          }
          #printable-report-area thead {
            display: table-header-group !important;
          }
          #printable-report-area tfoot {
            display: table-footer-group !important;
          }
          #printable-report-area tr {
            break-inside: avoid !important;
          }
          #printable-report-area .label-card {
            break-inside: avoid !important;
            box-shadow: none !important;
          }
          @page {
            size: A4 portrait;
            margin: 10mm 10mm 10mm 10mm;
          }
        }
      `}</style>

      <div
        id="print-modal-backdrop"
        className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-2xs flex items-center justify-center p-3 select-none print:static print:block print:p-0 print:bg-white animate-in fade-in duration-150"
      >
        <div
          id="print-modal-shell"
          className="bg-[#f1f5f9] w-full max-w-[1400px] h-[92vh] max-h-[92vh] rounded-2xl shadow-2xl border border-slate-700 flex flex-col overflow-hidden print:w-full print:max-w-none print:rounded-none print:shadow-none print:border-0 print:max-h-none print:h-auto print:overflow-visible print:block relative"
        >
          {/* Close button on absolute top-right */}
          <button
            type="button"
            onClick={closePrintModal}
            className="absolute top-3.5 right-4 z-50 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer no-print"
            title="닫기 (ESC)"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Master Standard Documents & Pipeline Center */}
          <StandardTemplateCenter onClose={closePrintModal} />
        </div>
      </div>
    </>
  );
};
