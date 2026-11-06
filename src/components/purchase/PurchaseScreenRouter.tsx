'use client';

import React from 'react';
import { TabItem } from '@/types/erp';
import { OrderPrintView } from './screens/OrderPrintView';
import { OrderCancelStatusView } from './screens/OrderCancelStatusView';
import { ReceivingRegGsrView } from './screens/ReceivingRegGsrView';
import { ReceivingStatusEditView } from './screens/ReceivingStatusEditView';
import { ReceivingCancelStatusView } from './screens/ReceivingCancelStatusView';
import { ExpiryStatusView } from './screens/ExpiryStatusView';
import { ExpiryEditView } from './screens/ExpiryEditView';
import { OrderSimulationView } from './screens/OrderSimulationView';
import { MatReqPrintView } from './screens/MatReqPrintView';
import { OrderReqConfirmView } from './screens/OrderReqConfirmView';
import { MatOrderDayView } from './screens/MatOrderDayView';
import { MatOrderNormalView } from './screens/MatOrderNormalView';
import { MatOrderSimulView } from './screens/MatOrderSimulView';
import { OrderStatusEditView } from './screens/OrderStatusEditView';
import { ErpWorkspace } from '../common/ErpWorkspace';

interface PurchaseScreenRouterProps {
  tab: TabItem;
}

export const PurchaseScreenRouter: React.FC<PurchaseScreenRouterProps> = ({ tab }) => {
  switch (tab.menuId) {
    case 'pur-order-print':
      return <OrderPrintView />;
    case 'pur-order-cancel-status':
      return <OrderCancelStatusView />;
    case 'pur-receiving-reg':
      return <ReceivingRegGsrView />;
    case 'pur-receiving-status-edit':
      return <ReceivingStatusEditView />;
    case 'pur-receiving-cancel-status':
      return <ReceivingCancelStatusView />;
    case 'pur-expiry-status':
      return <ExpiryStatusView />;
    case 'pur-expiry-edit':
      return <ExpiryEditView />;
    case 'pur-order-simulation':
      return <OrderSimulationView />;
    case 'pur-mat-req-print':
      return <MatReqPrintView />;
    case 'pur-order-req-confirm':
      return <OrderReqConfirmView />;
    case 'pur-mat-order-day':
    case 'pur-gfs-smart-order': // 자재발주(요일별)로 일원화 (구버전 탭 자동 승계)
      return <MatOrderDayView />;
    case 'pur-mat-order-normal':
      return <MatOrderNormalView />;
    case 'pur-mat-order-simul':
      return <MatOrderSimulView />;
    case 'pur-order-status-edit':
      return <OrderStatusEditView />;
    default:
      return <ErpWorkspace tab={tab} />;
  }
};

