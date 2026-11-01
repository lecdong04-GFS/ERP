'use client';

import React from 'react';
import { TabItem } from '@/types/erp';
import { ErpWorkspace } from '@/components/common/ErpWorkspace';
import { NoticeView } from './screens/NoticeView';
import { ContactView } from './screens/ContactView';
import { ScheduleView } from './screens/ScheduleView';

interface WorkScreenRouterProps {
  tab: TabItem;
}

export const WorkScreenRouter: React.FC<WorkScreenRouterProps> = ({ tab }) => {
  switch (tab.menuId) {
    case 'work-notice':
      return <NoticeView />;
    case 'work-contact':
      return <ContactView />;
    case 'work-schedule':
      return <ScheduleView />;
    default:
      return <ErpWorkspace tab={tab} />;
  }
};
