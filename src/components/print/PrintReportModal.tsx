'use client';

import React from 'react';
import { X } from 'lucide-react';
import { usePrintReport } from '@/context/PrintReportContext';
import { StandardTemplateCenter } from './StandardTemplateCenter';

export const PrintReportModal: React.FC = () => {
  const { isPrintModalOpen, closePrintModal } = usePrintReport();

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
          body * {
            visibility: hidden !important;
          }
          #printable-report-area,
          #printable-report-area * {
            visibility: visible !important;
          }
          #printable-report-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
            box-shadow: none !important;
            border: none !important;
          }
          .no-print {
            display: none !important;
          }
          #printable-report-area thead {
            display: table-header-group !important;
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
            margin: 12mm 10mm 12mm 10mm;
          }
        }
      `}</style>

      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-2xs flex items-center justify-center p-3 select-none print:static print:block print:p-0 print:bg-white animate-in fade-in duration-150">
        <div className="bg-[#f1f5f9] w-full max-w-[1400px] h-[92vh] max-h-[92vh] rounded-2xl shadow-2xl border border-slate-700 flex flex-col overflow-hidden print:w-full print:max-w-none print:rounded-none print:shadow-none print:border-0 print:max-h-none print:overflow-visible print:block relative">
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
