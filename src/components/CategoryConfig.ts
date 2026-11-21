import {HelpCircle, Leaf, Recycle, Trash2} from 'lucide-react';
import type {WasteCategory} from '../types.ts';

export interface CategoryMeta {
  key: WasteCategory;
  label: string;
  shortDesc: string;
  bgClass: string;
  borderClass: string;
  textClass: string;
  iconBgClass: string;
  barColorClass: string;
  Icon: typeof Leaf;
}

export const CATEGORY_META: Record<WasteCategory, CategoryMeta> = {
  COMPOST: {
    key: 'COMPOST',
    label: 'Compost',
    shortDesc: 'Food scraps & accepted uncoated paper',
    bgClass: 'bg-emerald-50/80',
    borderClass: 'border-emerald-200',
    textClass: 'text-emerald-800',
    iconBgClass: 'bg-emerald-100 text-emerald-700',
    barColorClass: 'bg-emerald-600',
    Icon: Leaf,
  },
  RECYCLING: {
    key: 'RECYCLING',
    label: 'Recycling',
    shortDesc: 'Clean, empty rigid plastics, cans & clean paper',
    bgClass: 'bg-sky-50/80',
    borderClass: 'border-sky-200',
    textClass: 'text-sky-800',
    iconBgClass: 'bg-sky-100 text-sky-700',
    barColorClass: 'bg-sky-600',
    Icon: Recycle,
  },
  TRASH: {
    key: 'TRASH',
    label: 'Trash',
    shortDesc: 'Foil wrappers, straws & non-recyclable waste',
    bgClass: 'bg-slate-100/80',
    borderClass: 'border-slate-200',
    textClass: 'text-slate-700',
    iconBgClass: 'bg-slate-200 text-slate-700',
    barColorClass: 'bg-slate-500',
    Icon: Trash2,
  },
  'CHECK FIRST': {
    key: 'CHECK FIRST',
    label: 'Check First',
    shortDesc: 'Uncertain items, bioplastics & coated cups',
    bgClass: 'bg-amber-50/80',
    borderClass: 'border-amber-200',
    textClass: 'text-amber-800',
    iconBgClass: 'bg-amber-100 text-amber-800',
    barColorClass: 'bg-amber-500',
    Icon: HelpCircle,
  },
};

export const CATEGORY_ORDER: WasteCategory[] = ['COMPOST', 'RECYCLING', 'TRASH', 'CHECK FIRST'];
