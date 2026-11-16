'use client';

import React from 'react';
import { TabItem } from '@/types/erp';
import { OrderPrintView } from './screens/OrderPrintView';
import { ReceivingStatusEditView } from './screens/ReceivingStatusEditView';
import { ExpiryStatusView } from './screens/ExpiryStatusView';
import { MatReqPrintView } from './screens/MatReqPrintView';
import { MatOrderDayView } from './screens/MatOrderDayView';
import { OrderStatusEditView } from './screens/OrderStatusEditView';
import { ErpWorkspace } from '../common/ErpWorkspace';

interface PurchaseScreenRouterProps {
  tab: TabItem;
}

export const PurchaseScreenRouter: React.FC<PurchaseScreenRouterProps> = ({ tab }) => {
  switch (tab.menuId) {
    case 'pur-order-print':
      return <OrderPrintView />;
    case 'pur-receiving-status-edit':
      return <ReceivingStatusEditView />;
    case 'pur-expiry-status':
      return <ExpiryStatusView />;
    case 'pur-mat-req-print':
      return <MatReqPrintView />;
    case 'pur-mat-order-day':
    case 'pur-gfs-smart-order': // 자재발주(요일별)로 일원화 (구버전 탭 자동 승계)
      return <MatOrderDayView />;
    case 'pur-order-status-edit':
      return <OrderStatusEditView />;
    default:
      return <ErpWorkspace tab={tab} />;
  }
};

