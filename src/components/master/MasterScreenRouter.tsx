'use client';

import React from 'react';
import { TabItem } from '@/types/erp';
import { BaseCodeView } from './screens/BaseCodeView';
import { PartnerMgmtView } from './screens/PartnerMgmtView';
import { ProductRegView } from './screens/ProductRegView';
import { ProductUnitView } from './screens/ProductUnitView';
import { ProductPriceView } from './screens/ProductPriceView';
import { PackagingMgmtView } from './screens/PackagingMgmtView';
import { BomNormalView } from './screens/BomNormalView';
import { BomExplosionView } from './screens/BomExplosionView';
import { CvsMgmtView } from './screens/CvsMgmtView';
import { StockLookupView } from './screens/StockLookupView';
import { ErpWorkspace } from '../common/ErpWorkspace';

interface MasterScreenRouterProps {
  tab: TabItem;
}

export const MasterScreenRouter: React.FC<MasterScreenRouterProps> = ({ tab }) => {
  switch (tab.menuId) {
    case 'master-base-code':
      return <BaseCodeView />;
    case 'master-partner-mgmt':
      return <PartnerMgmtView />;
    case 'master-product-reg':
      return <ProductRegView />;
    case 'master-product-unit':
      return <ProductUnitView />;
    case 'master-product-price':
      return <ProductPriceView />;
    case 'master-pack-spec':
      return <PackagingMgmtView />;
    case 'master-bom-normal':
      return <BomNormalView />;
    case 'master-bom-deploy':
      return <BomExplosionView />;
    case 'master-cvs-mgmt':
      return <CvsMgmtView />;
    case 'master-repr-prod-reg':
    case 'master-repr-prod-status':
      return <ProductRegView />;
    case 'master-stock-lookup':
    case 'inv-lookup':
      return <StockLookupView />;
    default:
      return <ErpWorkspace tab={tab} />;
  }
};

