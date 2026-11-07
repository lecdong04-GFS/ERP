'use client';

import React from 'react';
import { TabItem } from '@/types/erp';
import { ExtraOrderStatusView } from './screens/ExtraOrderStatusView';
import { OrderCancelStatusView } from './screens/OrderCancelStatusView';
import { DeliveryRegistrationView } from './screens/DeliveryRegistrationView';
import { ItemDeliveryStatusView } from './screens/ItemDeliveryStatusView';
import { StatementIssueView } from './screens/StatementIssueView';
import { TagPrintView } from './screens/TagPrintView';
import { UndeliveredStatusView } from './screens/UndeliveredStatusView';
import { OrderUploadGsrView } from './screens/OrderUploadGsrView';
import { OrderExtraRegGsrView } from './screens/OrderExtraRegGsrView';
import { OrderSummaryGsrView } from './screens/OrderSummaryGsrView';
import { OrderStatusCancelView } from './screens/OrderStatusCancelView';
import { ErpWorkspace } from '../common/ErpWorkspace';

interface SalesScreenRouterProps {
  tab: TabItem;
}

export const SalesScreenRouter: React.FC<SalesScreenRouterProps> = ({ tab }) => {
  switch (tab.menuId) {
    case 'sales-extra-order-status':
      return <ExtraOrderStatusView />;
    case 'sales-order-cancel-status':
      return <OrderCancelStatusView />;
    case 'sales-delivery-reg':
    case 'sales-delivery-status-edit':
      return <DeliveryRegistrationView />;
    case 'sales-item-delivery-status':
      return <ItemDeliveryStatusView />;
    case 'sales-statement-issue':
      return <StatementIssueView />;
    case 'sales-tag-print':
      return <TagPrintView />;
    case 'sales-undelivered-status':
      return <UndeliveredStatusView />;
    case 'sales-order-upload':
      return <OrderUploadGsrView />;
    case 'sales-order-extra-reg':
      return <OrderExtraRegGsrView />;
    case 'sales-order-summary-gsr':
      return <OrderSummaryGsrView />;
    case 'sales-order-status-cancel':
      return <OrderStatusCancelView />;
    default:
      return <ErpWorkspace tab={tab} />;
  }
};

