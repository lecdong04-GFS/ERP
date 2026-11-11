'use client';

import React from 'react';
import { getProductLifecycleInfo, ProductLifecycleTone } from '@/lib/gfs/productStatus';
import { getScheduledExclusion } from '@/lib/gfs/orderCalc';

interface ProductLifecycleBadgeProps {
  status?: string | null;
  discontinuedDate?: string | null;
  isUsed?: boolean | null;
  name?: string | null;
  refDate?: string;
  compact?: boolean;
  className?: string;
}

const TONE_CLASSES: Record<ProductLifecycleTone, string> = {
  deleted: 'bg-rose-100 text-rose-800 border-rose-300',
  scheduled: 'bg-amber-100 text-amber-900 border-amber-300',
  transfer: 'bg-sky-100 text-sky-800 border-sky-300',
  unused: 'bg-slate-200 text-slate-700 border-slate-400',
  hold: 'bg-orange-100 text-orange-800 border-orange-300',
};

export const ProductLifecycleBadge: React.FC<ProductLifecycleBadgeProps> = ({
  status,
  discontinuedDate,
  isUsed,
  name,
  refDate,
  compact = false,
  className = '',
}) => {
  const scheduled = name ? getScheduledExclusion(name) : null;
  const effDisc = discontinuedDate || scheduled?.effectiveDate || null;
  const effStatus = status && status !== '정상' ? status : scheduled ? '삭제예정' : status;

  const info = getProductLifecycleInfo(
    { status: effStatus, discontinuedDate: effDisc, isUsed, name },
    refDate
  );
  if (!info) return null;

  const displayLabel =
    compact ? info.shortLabel : scheduled?.label && !status ? scheduled.label : info.label;

  return (
    <span
      className={`shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-black border whitespace-nowrap ${
        TONE_CLASSES[info.tone]
      } ${className}`}
      title={
        info.effectiveDate
          ? `${displayLabel} (기준일: ${info.effectiveDate})`
          : displayLabel
      }
    >
      {displayLabel}
    </span>
  );
};

