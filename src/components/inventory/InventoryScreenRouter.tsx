'use client';

import React from 'react';
import { TabItem } from '@/types/erp';
import { WarehouseMoveView } from './screens/WarehouseMoveView';
import { MatExtraIssueRegView } from './screens/MatExtraIssueRegView';
import { RawMatStocktakeView } from './screens/RawMatStocktakeView';
import { SafetyStockMgmtView } from './screens/SafetyStockMgmtView';
import { MatLedgerView } from './screens/MatLedgerView';
import { DailyStockAmountView } from './screens/DailyStockAmountView';
import { ReturnStatusView } from './screens/ReturnStatusView';
import { DiscontinuedStatusView } from './screens/DiscontinuedStatusView';
import { StockLookupView } from '../master/screens/StockLookupView';
import { ErpWorkspace } from '../common/ErpWorkspace';

interface InventoryScreenRouterProps {
  tab: TabItem;
}

export const InventoryScreenRouter: React.FC<InventoryScreenRouterProps> = ({ tab }) => {
  switch (tab.menuId) {
    case 'inv-lookup':
      return <StockLookupView />;
    case 'inv-warehouse-move':
      return <WarehouseMoveView />;
    case 'inv-mat-extra-issue-reg':
      return <MatExtraIssueRegView />;
    case 'inv-raw-mat-stocktake':
      return <RawMatStocktakeView />;
    case 'inv-safety-stock-mgmt':
      return <SafetyStockMgmtView />;
    case 'inv-mat-ledger':
      return <MatLedgerView />;
    case 'inv-daily-stock-amount':
      return <DailyStockAmountView />;
    case 'inv-return-status':
      return <ReturnStatusView />;
    case 'inv-discontinued-status':
      return <DiscontinuedStatusView />;
    default:
      return <ErpWorkspace tab={tab} />;
  }
};
