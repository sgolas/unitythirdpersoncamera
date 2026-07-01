import { useState } from 'react';
import {
  LayoutDashboard, CalendarRange, Wallet, FileText, LayoutGrid,
  ListChecks, Plane, BedDouble, PiggyBank, Compass, Sparkles, History, Settings2,
  Map as MapIcon, Images,
} from 'lucide-react';
import { SyncButton } from './components/SyncButton';
import { StitchIcon } from './components/StitchIcon';

import { DashboardTab } from './components/tabs/DashboardTab';
import { TripOverviewTab } from './components/tabs/TripOverviewTab';
import { DocumentsTab } from './components/tabs/DocumentsTab';
import { ChecklistTab } from './components/tabs/ChecklistTab';
import { TransportTab } from './components/tabs/TransportTab';
import { AccommodationTab } from './components/tabs/AccommodationTab';
import { ExpensesTab } from './components/tabs/ExpensesTab';
import { ItineraryTab } from './components/tabs/ItineraryTab';
import { BudgetTab } from './components/tabs/BudgetTab';
import { HelperTab } from './components/tabs/HelperTab';
import { ChangeLogTab } from './components/tabs/ChangeLogTab';
import { SettingsTab } from './components/tabs/SettingsTab';
import { MapTab } from './components/tabs/MapTab';
import { PhotosTab } from './components/tabs/PhotosTab';

type View =
  | 'dashboard' | 'overview' | 'documents' | 'checklist' | 'transport'
  | 'accommodation' | 'expenses' | 'itinerary' | 'budget' | 'helper'
  | 'changelog' | 'settings' | 'map' | 'photos';

interface MenuItem { key: View; label: string; icon: React.ReactNode; color: string; }

const MORE_ITEMS: MenuItem[] = [
  { key: 'photos',        label: 'Photos',        icon: <Images size={22} />,    color: '#ec4899' },
  { key: 'documents',     label: 'Documents',     icon: <FileText size={22} />,  color: '#64748b' },
  { key: 'overview',      label: 'Trip Overview', icon: <Compass size={22} />,   color: '#38bdf8' },
  { key: 'checklist',     label: 'Checklist',     icon: <ListChecks size={22} />, color: '#34d399' },
  { key: 'transport',     label: 'Transport',     icon: <Plane size={22} />,     color: '#38bdf8' },
  { key: 'accommodation', label: 'Stays',         icon: <BedDouble size={22} />, color: '#a78bfa' },
  { key: 'budget',        label: 'Budget',        icon: <PiggyBank size={22} />, color: '#f59e0b' },
  { key: 'helper',        label: 'Smart Helper',  icon: <Sparkles size={22} />,  color: '#fb7185' },
  { key: 'changelog',     label: 'Change Log',    icon: <History size={22} />,   color: '#64748b' },
  { key: 'settings',      label: 'Sync & Setup',  icon: <Settings2 size={22} />, color: '#334155' },
];

export default function App() {
  const [view, setView] = useState<View>('dashboard');
  const [moreOpen, setMoreOpen] = useState(false);

  function go(v: View) { setView(v); setMoreOpen(false); window.scrollTo(0, 0); }

  return (
    <div className="min-h-screen bg-slate-50 mx-auto max-w-md relative">
      <main style={{ paddingBottom: 'calc(74px + env(safe-area-inset-bottom, 0px))' }}>
        {view === 'dashboard'     && <DashboardTab onNavigate={go} />}
        {view === 'overview'      && <TripOverviewTab />}
        {view === 'documents'     && <DocumentsTab />}
        {view === 'checklist'     && <ChecklistTab />}
        {view === 'transport'     && <TransportTab />}
        {view === 'accommodation' && <AccommodationTab />}
        {view === 'expenses'      && <ExpensesTab />}
        {view === 'itinerary'     && <ItineraryTab />}
        {view === 'budget'        && <BudgetTab />}
        {view === 'helper'        && <HelperTab onNavigate={go} />}
        {view === 'changelog'     && <ChangeLogTab />}
        {view === 'settings'      && <SettingsTab />}
        {view === 'map'           && <MapTab />}
        {view === 'photos'        && <PhotosTab />}
      </main>

      {/* Global sync button (floating, top-right, below status bar) */}
      <div className="fixed right-3 z-50 flex items-start gap-1.5" style={{ top: 'calc(env(safe-area-inset-top, 0px) + 8px)' }}>
        <StitchIcon />
        <SyncButton />
      </div>

      {/* More menu */}
      {moreOpen && (
        <div className="fixed inset-0 z-[150] bg-black/50 flex items-end" onClick={() => setMoreOpen(false)}>
          <div className="bg-white w-full max-w-md mx-auto rounded-t-3xl p-5 animate-fadeUp"
            style={{ paddingBottom: 'calc(88px + env(safe-area-inset-bottom, 0px))' }} onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 rounded-full bg-slate-200 mx-auto mb-4" />
            <h2 className="font-bold text-slate-800 text-lg mb-4">All sections</h2>
            <div className="grid grid-cols-3 gap-3">
              {MORE_ITEMS.map(m => (
                <button key={m.key} onClick={() => go(m.key)}
                  className="flex flex-col items-center gap-2 py-4 rounded-2xl bg-slate-50 active:bg-slate-100 transition">
                  <span className="w-11 h-11 rounded-2xl flex items-center justify-center text-white"
                    style={{ backgroundColor: m.color }}>{m.icon}</span>
                  <span className="text-xs font-semibold text-slate-600 text-center">{m.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Bottom nav (padded above the Android/iOS system bar) */}
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white border-t border-slate-200 flex z-50 shadow-lg safe-bottom">
        <NavTab label="Home"    active={view === 'dashboard'} onClick={() => go('dashboard')} icon={<LayoutDashboard size={22} />} />
        <NavTab label="Plan"    active={view === 'itinerary'} onClick={() => go('itinerary')} icon={<CalendarRange size={22} />} />
        <NavTab label="Money"   active={view === 'expenses'}  onClick={() => go('expenses')}  icon={<Wallet size={22} />} />
        <NavTab label="Map"     active={view === 'map'}       onClick={() => go('map')}       icon={<MapIcon size={22} />} />
        <NavTab label="More"    active={moreOpen || MORE_ITEMS.some(m => m.key === view)} onClick={() => setMoreOpen(o => !o)} icon={<LayoutGrid size={22} />} />
      </nav>
    </div>
  );
}

function NavTab({ label, icon, active, onClick }: {
  label: string; icon: React.ReactNode; active: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick}
      className="flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5 transition-colors"
      style={{ color: active ? '#0f172a' : '#94a3b8' }}>
      {icon}
      <span className="text-[11px] font-semibold">{label}</span>
    </button>
  );
}
