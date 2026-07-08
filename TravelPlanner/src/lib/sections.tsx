import {
  Images, FileText, Compass, ListChecks, Plane, BedDouble, Car,
  PiggyBank, Calculator, Languages, Sparkles, History, Settings2,
} from 'lucide-react';

/** The sections shown in the More menu — and pinnable to the dashboard. */
export type SectionKey =
  | 'photos' | 'documents' | 'overview' | 'checklist' | 'transport'
  | 'accommodation' | 'carrental' | 'budget' | 'converter' | 'translate'
  | 'helper' | 'changelog' | 'settings';

export interface Section { key: SectionKey; label: string; icon: React.ReactNode; color: string }

export const SECTIONS: Section[] = [
  { key: 'photos',        label: 'Photos',        icon: <Images size={22} />,     color: '#ec4899' },
  { key: 'documents',     label: 'Documents',     icon: <FileText size={22} />,   color: '#64748b' },
  { key: 'overview',      label: 'Trip Overview', icon: <Compass size={22} />,    color: '#38bdf8' },
  { key: 'checklist',     label: 'Checklist',     icon: <ListChecks size={22} />, color: '#34d399' },
  { key: 'transport',     label: 'Transport',     icon: <Plane size={22} />,      color: '#38bdf8' },
  { key: 'accommodation', label: 'Stays',         icon: <BedDouble size={22} />,  color: '#a78bfa' },
  { key: 'carrental',     label: 'Car Rentals',   icon: <Car size={22} />,        color: '#22c55e' },
  { key: 'budget',        label: 'Budget',        icon: <PiggyBank size={22} />,  color: '#f59e0b' },
  { key: 'converter',     label: 'Currency',      icon: <Calculator size={22} />, color: '#0ea5a3' },
  { key: 'translate',     label: 'Translate',     icon: <Languages size={22} />,  color: '#7c3aed' },
  { key: 'helper',        label: 'Smart Helper',  icon: <Sparkles size={22} />,   color: '#fb7185' },
  { key: 'changelog',     label: 'Change Log',    icon: <History size={22} />,    color: '#64748b' },
  { key: 'settings',      label: 'Sync & Setup',  icon: <Settings2 size={22} />,  color: '#334155' },
];

export const sectionByKey = (k: string) => SECTIONS.find(s => s.key === k);
