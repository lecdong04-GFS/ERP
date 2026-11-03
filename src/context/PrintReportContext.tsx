'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';
import type { DeliveryBoxLabelData } from '@/components/print/labels/DeliveryBoxLabel';

export type PrintDocumentType =
  | 'WORK_ORDER'
  | 'HACCP_INSPECTION'
  | 'MATERIAL_LEDGER'
  | 'COST_SHEET'
  | 'DELIVERY_STATEMENT'
  | 'PURCHASE_ORDER'
  | 'LOT_LABEL'
  | 'DELIVERY_BOX_LABEL'
  | 'MATERIAL_REQUIREMENT';

export interface MatReqPrintPayload {
  date: string;
  shift: string;
  gyeName: string;
  totalFinishedOrderQty?: number;
  rows: {
    id: number;
    partCategory: string;
    partCode: string;
    partName: string;
    partSpec: string;
    partUnit: string;
    gyeName: string;
    reqCalcQty: number;
    currentStock: number;
    shortageQty: number;
    orderQty: number;
    orderUnit: string;
    supplier: string;
    remark: string;
  }[];
}

export interface DeliveryStatementPayload {
  deliveryNo: string;
  deliveryDate: string;
  centerCode: string;
  shift: string;
  items: {
    code: string;
    name: string;
    spec: string;
    unit: string;
    qty: number;
    price: number;
  }[];
}

interface PrintReportContextType {
  isPrintModalOpen: boolean;
  activeDocType: PrintDocumentType;
  openPrintModal: (docType?: PrintDocumentType) => void;
  closePrintModal: () => void;
  setActiveDocType: (docType: PrintDocumentType) => void;
  printPayload: DeliveryStatementPayload | null;
  setPrintPayload: (payload: DeliveryStatementPayload | null) => void;
  boxPayload: DeliveryBoxLabelData[] | null;
  setBoxPayload: (payload: DeliveryBoxLabelData[] | null) => void;
  matReqPayload: MatReqPrintPayload | null;
  setMatReqPayload: (payload: MatReqPrintPayload | null) => void;
}

const PrintReportContext = createContext<PrintReportContextType | null>(null);

export const PrintReportProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [activeDocType, setActiveDocType] = useState<PrintDocumentType>('WORK_ORDER');
  const [printPayload, setPrintPayload] = useState<DeliveryStatementPayload | null>(null);
  const [boxPayload, setBoxPayload] = useState<DeliveryBoxLabelData[] | null>(null);
  const [matReqPayload, setMatReqPayload] = useState<MatReqPrintPayload | null>(null);

  const openPrintModal = (docType?: PrintDocumentType) => {
    if (docType) {
      setActiveDocType(docType);
    }
    setIsPrintModalOpen(true);
  };

  const closePrintModal = () => {
    setIsPrintModalOpen(false);
    setPrintPayload(null);
    setBoxPayload(null);
    setMatReqPayload(null);
  };

  return (
    <PrintReportContext.Provider
      value={{
        isPrintModalOpen,
        activeDocType,
        openPrintModal,
        closePrintModal,
        setActiveDocType,
        printPayload,
        setPrintPayload,
        boxPayload,
        setBoxPayload,
        matReqPayload,
        setMatReqPayload,
      }}
    >
      {children}
    </PrintReportContext.Provider>
  );
};

export const usePrintReport = () => {
  const context = useContext(PrintReportContext);
  if (!context) {
    throw new Error('usePrintReport must be used within a PrintReportProvider');
  }
  return context;
};

