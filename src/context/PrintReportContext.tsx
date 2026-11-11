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

export interface WorkOrderPrintRow {
  workSeq: number;
  productName: string;
  warehouseName: string;
  spec: string;
  unit: string;
  orderQty: number;
  timeRange: string;
  lossRate?: number;
  yieldRate?: number;
  status: string;
  assignee: string;
}

export interface WorkOrderPrintPayload {
  lineName: string;
  workDate: string;
  shift: string;
  rows: WorkOrderPrintRow[];
}

export interface PurchaseOrderPrintPayload {
  orderNo: string;
  orderDate: string;
  deliveryDate?: string;
  supplierName: string;
  manager?: string;
  tel?: string;
  email?: string;
  remark?: string;
  totalAmount: number;
  items: {
    no: number;
    name: string;
    spec: string;
    unit: string;
    qty: number;
    price: number;
    amt: number;
    recvDate?: string;
    remark?: string;
  }[];
}

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
  workOrderPayload: WorkOrderPrintPayload | null;
  setWorkOrderPayload: (payload: WorkOrderPrintPayload | null) => void;
  poPayload: PurchaseOrderPrintPayload | null;
  setPoPayload: (payload: PurchaseOrderPrintPayload | null) => void;
  poPayloadList: PurchaseOrderPrintPayload[] | null;
  setPoPayloadList: (payload: PurchaseOrderPrintPayload[] | null) => void;
}

const PrintReportContext = createContext<PrintReportContextType | null>(null);

export const PrintReportProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [activeDocType, setActiveDocType] = useState<PrintDocumentType>('WORK_ORDER');
  const [printPayload, setPrintPayload] = useState<DeliveryStatementPayload | null>(null);
  const [boxPayload, setBoxPayload] = useState<DeliveryBoxLabelData[] | null>(null);
  const [matReqPayload, setMatReqPayload] = useState<MatReqPrintPayload | null>(null);
  const [workOrderPayload, setWorkOrderPayload] = useState<WorkOrderPrintPayload | null>(null);
  const [poPayload, setPoPayload] = useState<PurchaseOrderPrintPayload | null>(null);
  const [poPayloadList, setPoPayloadList] = useState<PurchaseOrderPrintPayload[] | null>(null);

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
    setWorkOrderPayload(null);
    setPoPayload(null);
    setPoPayloadList(null);
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
        workOrderPayload,
        setWorkOrderPayload,
        poPayload,
        setPoPayload,
        poPayloadList,
        setPoPayloadList,
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

