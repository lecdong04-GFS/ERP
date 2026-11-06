'use client';

import React from 'react';
import { TabItem } from '@/types/erp';
import { WorkOrderStatusView } from './screens/WorkOrderStatusView';
import { InputResultRegView } from './screens/InputResultRegView';
import { DiscardRegGsrView } from './screens/DiscardRegGsrView';
import { FoodWasteRegView } from './screens/FoodWasteRegView';
import { ProductionResultStatusView } from './screens/ProductionResultStatusView';
import { ExtraProductionView } from './screens/ExtraProductionView';
import { ProductionSeqRegView } from './screens/ProductionSeqRegView';
import { ErpWorkspace } from '../common/ErpWorkspace';

interface ProductionScreenRouterProps {
  tab: TabItem;
}

export const ProductionScreenRouter: React.FC<ProductionScreenRouterProps> = ({ tab }) => {
  switch (tab.menuId) {
    case 'prod-work-order-status':
    case 'work-order-status':
      return <WorkOrderStatusView />;
    case 'prod-input-result-reg':
      return <InputResultRegView />;
    case 'prod-discard-reg':
      return <DiscardRegGsrView />;
    case 'prod-food-waste-reg':
      return <FoodWasteRegView />;
    case 'prod-result-status':
      return <ProductionResultStatusView />;
    case 'prod-extra-prod':
      return <ExtraProductionView />;
    case 'prod-seq-reg':
      return <ProductionSeqRegView />;
    default:
      return <ErpWorkspace tab={tab} />;
  }
};

