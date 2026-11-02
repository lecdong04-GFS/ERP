'use client';

import React from 'react';
import { TabItem } from '@/types/erp';
import { ErpWorkspace } from '@/components/common/ErpWorkspace';
import { NoticeView } from './screens/NoticeView';
import { ContactView } from './screens/ContactView';
import { ScheduleView } from './screens/ScheduleView';
import { ExecRegView } from './screens/ExecRegView';
import { ExecStatusView } from './screens/ExecStatusView';
import { GrowthIdeaView } from './screens/GrowthIdeaView';
import { WorkRoleView } from './screens/WorkRoleView';

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
    case 'work-exec-reg':
      return <ExecRegView />;
    case 'work-exec-status':
      return <ExecStatusView />;
    case 'work-growth-idea':
      return <GrowthIdeaView />;
    case 'work-role-mgmt':
      return <WorkRoleView />;
    default:
      return <ErpWorkspace tab={tab} />;
  }
};
