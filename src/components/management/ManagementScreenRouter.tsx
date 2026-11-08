'use client';

import React from 'react';
import { TabItem } from '@/types/erp';
import { ProvisionalSalesStatusView } from './screens/ProvisionalSalesStatusView';
import { KpiRegView } from './screens/KpiRegView';
import { KpiStatusView } from './screens/KpiStatusView';
import { CostScreenRouter } from '../cost/CostScreenRouter';
import { ErpWorkspace } from '../common/ErpWorkspace';

interface ManagementScreenRouterProps {
  tab: TabItem;
}

export const ManagementScreenRouter: React.FC<ManagementScreenRouterProps> = ({ tab }) => {
  if (tab.menuId.startsWith('cost-')) {
    return <CostScreenRouter tab={tab} />;
  }

  switch (tab.menuId) {
    case 'mgmt-sales-pur-status':
    case 'mgmt-provisional-sales-status':
      return <ProvisionalSalesStatusView />;
    case 'mgmt-kpi-reg':
      return <KpiRegView />;
    case 'mgmt-kpi-status':
      return <KpiStatusView />;
    default:
      return <ErpWorkspace tab={tab} />;
  }
};

