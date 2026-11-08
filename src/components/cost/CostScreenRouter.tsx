'use client';

import React from 'react';
import { TabItem } from '@/types/erp';
import { OverheadRegView } from './screens/OverheadRegView';
import { ProdPlStatusView } from './screens/ProdPlStatusView';
import { RecipeCostRateView } from './screens/RecipeCostRateView';
import { ErpWorkspace } from '../common/ErpWorkspace';

interface CostScreenRouterProps {
  tab: TabItem;
}

export const CostScreenRouter: React.FC<CostScreenRouterProps> = ({ tab }) => {
  switch (tab.menuId) {
    case 'cost-overhead-reg':
      return <OverheadRegView />;
    case 'cost-prod-pl-status':
    case 'cost-monthly-pl-status':
      return <ProdPlStatusView />;
    case 'cost-recipe-rate':
      return <RecipeCostRateView />;
    default:
      return <ErpWorkspace tab={tab} />;
  }
};

