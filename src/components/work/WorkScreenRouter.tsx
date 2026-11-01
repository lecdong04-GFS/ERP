'use client';

import React from 'react';
import { TabItem } from '@/types/erp';
import { ErpWorkspace } from '@/components/common/ErpWorkspace';
import { NoticeView } from './screens/NoticeView';

interface WorkScreenRouterProps {
  tab: TabItem;
}

export const WorkScreenRouter: React.FC<WorkScreenRouterProps> = ({ tab }) => {
  switch (tab.menuId) {
    case 'work-notice':
      return <NoticeView />;
    default:
      return <ErpWorkspace tab={tab} />;
  }
};
