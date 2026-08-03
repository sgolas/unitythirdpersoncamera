import { useState, useEffect, useReducer } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db/database';
import { initCurrency } from './lib/currency';
import { Onboarding } from './components/Onboarding';
import { MePrompt } from './components/MePrompt';
import { WelcomeSlides } from './components/WelcomeSlides';
import {
  LayoutDashboard, CalendarRange, Wallet, LayoutGrid,
  Map as MapIcon, ChevronLeft, MessageCircle, Pin, Plus,
} from 'lucide-react';
import { SyncStatus } from './components/SyncStatus';
import { SortableGrid } from './components/SortableGrid';
import { isNative, isDesktop } from './lib/platform';
import { SECTIONS } from './lib/sections';
import { toggleShortcut, useShortcuts } from './lib/dashShortcuts';
import { useUnreadChat } from './lib/chatUnread';

import { DashboardTab } from './components/tabs/DashboardTab';
import { TripOverviewTab } from './components/tabs/TripOverviewTab';
import { DocumentsTab } from './components/tabs/DocumentsTab';
import { ChecklistTab } from './components/tabs/ChecklistTab';
import { TransportTab } from './components/tabs/TransportTab';
import { AccommodationTab } from './components/tabs/AccommodationTab';
import { CarRentalTab } from './components/tabs/CarRentalTab';
import { FuelTab } from './components/tabs/FuelTab';
import { ExpensesTab } from './components/tabs/ExpensesTab';
import { ItineraryTab } from './components/tabs/ItineraryTab';
import { TimelineTab } from './components/tabs/TimelineTab';
import { ActivitiesTab } from './components/tabs/ActivitiesTab';
import { BudgetTab } from './components/tabs/BudgetTab';
import { HelperTab } from './components/tabs/HelperTab';
import { ChangeLogTab } from './components/tabs/ChangeLogTab';
import { SettingsTab } from './components/tabs/SettingsTab';
import { MapTab } from './components/tabs/MapTab';
import { PhotosTab } from './components/tabs/PhotosTab';
import { ConverterTab } from './components/tabs/ConverterTab';
import { ChatTab } from './components/tabs/ChatTab';
import { TranslateTab } from './components/tabs/TranslateTab';
import { ArtilleryTab } from './components/tabs/ArtilleryTab';
import { SuggestionsTab } from './components/tabs/SuggestionsTab';

type View =
  | 'dashboard' | 'overview' | 'timeline' | 'documents' | 'checklist' | 'transport'
  | 'accommodation' | 'activities' | 'carrental' | 'fuel' | 'suggestions' | 'expenses' | 'itinerary' | 'budget' | 'helper'
  | 'changelog' | 'settings' | 'map' | 'photos' | 'converter' | 'chat' | 'translate' | 'artillery';

const MORE_ITEMS = SECTIONS; // shared registry (also used by the dashboard)

export default function App() {
  // Navigation history — the last entry is the current view. Appending the
  // *target* through a functional updater keeps back reliable even if two
  // navigations land in the same render (which previously could push the wrong
  // page and make Back jump to the home page).
  const [history, setHistory] = useState<View[]>(['dashboard']);
  const view = history[history.length - 1];
  const [moreOpen, setMoreOpen] = useState(false);
  const [, bump] = useReducer(x => x + 1, 0);
  const [welcomeSeen, setWelcomeSeen] = useState(() => localStorage.getItem('welcome.seen') === '1');
  const unreadChat = useUnreadChat();

  // undefined = still loading, null = no trip yet (show onboarding), object = ready.
  const tripState = useLiveQuery(() => db.trip.get('trip').then(t => t ?? null), [], undefined);

  // Load live exchange rates, and re-render money whenever they or the
  // currency preference change.
  useEffect(() => {
    initCurrency();
    const on = () => bump();
    window.addEventListener('cur-change', on);
    return () => window.removeEventListener('cur-change', on);
  }, []);

  // A tapped chat push (see lib/push) asks us to open the Chat tab.
  useEffect(() => {
    const openChat = () => { setMoreOpen(false); setHistory(h => (h[h.length - 1] === 'chat' ? h : [...h, 'chat'])); };
    window.addEventListener('open-chat', openChat);
    return () => window.removeEventListener('open-chat', openChat);
  }, []);

  function go(v: View) {
    setMoreOpen(false);
    setHistory(h => (h[h.length - 1] === v ? h : [...h, v]));
    window.scrollTo(0, 0);
  }

  // Give any open sheet/modal the first chance to handle "back" (it closes
  // itself). Returns true if something claimed it, so we don't also navigate.
  function backClaimedByModal(): boolean {
    return !window.dispatchEvent(new CustomEvent('app-back', { cancelable: true }));
  }

  function back() {
    if (backClaimedByModal()) return;
    setHistory(h => (h.length > 1 ? h.slice(0, -1) : h));
    window.scrollTo(0, 0);
  }

  // Android hardware back button → go back, or close the More menu, or exit.
  useEffect(() => {
    if (!isNative) return;
    let sub: any;
    import('@capacitor/app').then(({ App: CapApp }) => {
      sub = CapApp.addListener('backButton', () => {
        if (moreOpen) setMoreOpen(false);
        else if (backClaimedByModal()) { /* an open sheet closed itself */ }
        else if (history.length > 1) setHistory(h => h.slice(0, -1));
        else CapApp.exitApp();
      });
    });
    return () => { sub?.then?.((h: any) => h.remove()); };
  }, [history, moreOpen]);

  const canGoBack = history.length > 1;

  // First launch ever → warm welcome tour, then onboarding.
  if (!welcomeSeen) {
    return <WelcomeSlides onDone={() => { localStorage.setItem('welcome.seen', '1'); setWelcomeSeen(true); }} />;
  }
  // First run: no trip yet → onboarding wizard. (undefined = DB still loading.)
  if (tripState === undefined) return <div className="min-h-screen bg-bg" />;
  if (tripState === null) return <Onboarding onDone={() => bump()} />;

  const content = (
    <>
      <MePrompt />
      {view === 'dashboard'     && <DashboardTab onNavigate={go} />}
      {view === 'overview'      && <TripOverviewTab />}
      {view === 'timeline'      && <TimelineTab />}
      {view === 'documents'     && <DocumentsTab />}
      {view === 'checklist'     && <ChecklistTab />}
      {view === 'transport'     && <TransportTab />}
      {view === 'accommodation' && <AccommodationTab />}
      {view === 'activities'    && <ActivitiesTab />}
      {view === 'carrental'     && <CarRentalTab />}
      {view === 'fuel'          && <FuelTab />}
      {view === 'suggestions'   && <SuggestionsTab />}
      {view === 'expenses'      && <ExpensesTab onNavigate={go} />}
      {view === 'itinerary'     && <ItineraryTab onNavigate={go} />}
      {view === 'budget'        && <BudgetTab onNavigate={go} />}
      {view === 'helper'        && <HelperTab onNavigate={go} />}
      {view === 'changelog'     && <ChangeLogTab />}
      {view === 'settings'      && <SettingsTab />}
      {view === 'map'           && <MapTab />}
      {view === 'photos'        && <PhotosTab />}
      {view === 'converter'     && <ConverterTab />}
      {view === 'chat'          && <ChatTab />}
      {view === 'translate'     && <TranslateTab />}
      {view === 'artillery'     && <ArtilleryTab />}
    </>
  );

  // Desktop (Electron): a proper windowed app — left sidebar nav + a toolbar,
  // content filling the window — instead of the phone column + bottom bar.
  if (isDesktop) {
    const primary = [
      { key: 'dashboard' as View, label: 'Home',      icon: <LayoutDashboard size={20} />, color: '#6366f1' },
      { key: 'itinerary' as View, label: 'Itinerary', icon: <CalendarRange size={20} />,   color: '#38bdf8' },
      { key: 'expenses'  as View, label: 'Expenses',  icon: <Wallet size={20} />,          color: '#f59e0b' },
      { key: 'map'       as View, label: 'Map',       icon: <MapIcon size={20} />,         color: '#10b981' },
      { key: 'chat'      as View, label: 'Chat',      icon: <MessageCircle size={20} />,   color: '#06b6d4' },
    ];
    const current = [...primary, ...MORE_ITEMS].find(n => n.key === view);
    return (
      <div className="h-screen flex bg-bg text-content overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 shrink-0 flex flex-col border-r border-line bg-surface">
          <div className="h-14 px-4 flex items-center gap-2.5 border-b border-line">
            <span className="w-9 h-9 rounded-xl accent-gradient flex items-center justify-center text-white text-lg">🌍</span>
            <div className="min-w-0">
              <p className="font-bold text-sm truncate leading-tight">{tripState.name}</p>
              <p className="text-[11px] text-muted leading-tight">Trip Planner</p>
            </div>
          </div>
          <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
            {primary.map(it => (
              <SideItem key={it.key} icon={it.icon} label={it.label} color={it.color}
                active={view === it.key} badge={it.key === 'chat' ? unreadChat : 0} onClick={() => go(it.key)} />
            ))}
            <div className="my-2 mx-2 border-t border-line" />
            {MORE_ITEMS.map(it => (
              <SideItem key={it.key} icon={it.icon} label={it.label} color={it.color}
                active={view === it.key} onClick={() => go(it.key as View)} />
            ))}
          </nav>
          <div className="p-3 border-t border-line flex items-center gap-2">
            <SyncStatus onSetup={() => go('settings')} />
            <span className="text-xs text-muted">Sync status</span>
          </div>
        </aside>

        {/* Main area */}
        <div className="flex-1 min-w-0 flex flex-col">
          <header className="h-12 shrink-0 flex items-center gap-3 px-4 border-b border-line bg-surface">
            {canGoBack && (
              <button onClick={back} aria-label="Back"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-content/70 hover:bg-slate-100 transition">
                <ChevronLeft size={20} />
              </button>
            )}
            <h1 className="font-semibold">{current?.label ?? ''}</h1>
          </header>
          <main className="flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-6xl">
              {content}
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-bg text-content mx-auto max-w-md relative app-frame ${canGoBack ? 'with-back' : ''}`}>
      <main style={{ paddingBottom: 'calc(74px + env(safe-area-inset-bottom, 0px))' }}>
        {content}
      </main>

      {/* Floating top controls — anchored to the app column (not the viewport)
          so they stay aligned with the header in landscape / on wide screens. */}
      <div className="fixed left-1/2 -translate-x-1/2 w-full max-w-md z-50 px-3 flex items-start justify-between pointer-events-none"
        style={{ top: 'calc(env(safe-area-inset-top, 0px) + 8px)' }}>
        <div className="pointer-events-auto">
          {canGoBack && (
            <button onClick={back} aria-label="Back"
              className="w-10 h-10 rounded-full flex items-center justify-center text-white shadow-lg press animate-fadeIn"
              style={{ background: 'rgba(15,23,42,0.4)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' }}>
              <ChevronLeft size={24} />
            </button>
          )}
        </div>
        <div className="pointer-events-auto flex items-start gap-1.5">
          <SyncStatus onSetup={() => go('settings')} />
        </div>
      </div>

      {/* More menu */}
      {moreOpen && (
        <div className="fixed inset-0 z-[150] bg-black/50 flex items-end" onClick={() => setMoreOpen(false)}>
          <div className="bg-white w-full max-w-md mx-auto rounded-t-3xl p-5 animate-fadeUp"
            style={{ paddingBottom: 'calc(88px + env(safe-area-inset-bottom, 0px))' }} onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 rounded-full bg-slate-200 mx-auto mb-4" />
            <h2 className="font-bold text-slate-800 text-lg mb-1">All sections</h2>
            <p className="text-xs text-slate-400 mb-3">Tap to open. Press and hold to rearrange — then tap a corner ⊕ to pin a shortcut to Home.</p>
            <SortableGrid storageKey="more.order" className="grid grid-cols-3 gap-3" hint={false}
              items={MORE_ITEMS.map(m => ({ key: m.key, node: <MoreTile item={m} onOpen={() => go(m.key)} /> }))}
              badge={(key, editing) => (editing ? <PinBadge k={key} /> : null)} />
          </div>
        </div>
      )}

      {/* Bottom nav — glassmorphism, padded above the system bar */}
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md glass border-t border-line flex z-50 shadow-glass safe-bottom">
        <NavTab label="Home"    active={view === 'dashboard'} onClick={() => go('dashboard')} icon={<LayoutDashboard size={22} />} />
        <NavTab label="Plan"    active={view === 'itinerary'} onClick={() => go('itinerary')} icon={<CalendarRange size={22} />} />
        <NavTab label="Money"   active={view === 'expenses'}  onClick={() => go('expenses')}  icon={<Wallet size={22} />} />
        <NavTab label="Map"     active={view === 'map'}       onClick={() => go('map')}       icon={<MapIcon size={22} />} />
        <NavTab label="Chat"    active={view === 'chat'}      onClick={() => go('chat')}      icon={<MessageCircle size={22} />} badge={unreadChat} />
        <NavTab label="More"    active={moreOpen || MORE_ITEMS.some(m => m.key === view)} onClick={() => setMoreOpen(o => !o)} icon={<LayoutGrid size={22} />} />
      </nav>
    </div>
  );
}

/** A More-menu tile: tap opens the section. (Reordering + pinning are handled
 *  by the surrounding SortableGrid / PinBadge in edit mode.) */
function MoreTile({ item, onOpen }: { item: typeof MORE_ITEMS[number]; onOpen: () => void }) {
  const pins = useShortcuts();
  return (
    <button onClick={onOpen}
      className="relative w-full flex flex-col items-center gap-2 py-4 rounded-2xl bg-slate-50 active:bg-slate-100 transition">
      <span className="w-11 h-11 rounded-2xl flex items-center justify-center text-white"
        style={{ backgroundColor: item.color }}>{item.icon}</span>
      <span className="text-xs font-semibold text-slate-600 text-center">{item.label}</span>
      {pins.includes(item.key) && <span className="absolute top-1.5 right-1.5"><Pin size={12} className="text-accent" /></span>}
    </button>
  );
}

/** In-edit pin toggle overlaid on a More tile (add/remove a Home shortcut). */
function PinBadge({ k }: { k: string }) {
  const pins = useShortcuts();
  const pinned = pins.includes(k);
  return (
    <button data-no-drag onClick={() => toggleShortcut(k)}
      aria-label={pinned ? 'Remove Home shortcut' : 'Pin to Home'}
      className="absolute -top-2 -left-2 w-6 h-6 rounded-full bg-white shadow-md border border-line flex items-center justify-center z-10 active:scale-90 transition">
      {pinned ? <Pin size={12} className="text-accent" /> : <Plus size={12} className="text-slate-400" />}
    </button>
  );
}

/** A row in the desktop sidebar. */
function SideItem({ icon, label, color, active, badge = 0, onClick }: {
  icon: React.ReactNode; label: string; color: string; active: boolean; badge?: number; onClick: () => void;
}) {
  return (
    <button onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition ${
        active ? 'bg-accent/10 text-accent font-semibold' : 'text-content/80 hover:bg-slate-100 font-medium'}`}>
      <span className="w-6 h-6 flex items-center justify-center shrink-0" style={{ color: active ? undefined : color }}>{icon}</span>
      <span className="flex-1 text-left truncate">{label}</span>
      {badge > 0 && (
        <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  );
}

function NavTab({ label, icon, active, onClick, badge = 0 }: {
  label: string; icon: React.ReactNode; active: boolean; onClick: () => void; badge?: number;
}) {
  return (
    <button onClick={onClick}
      className="flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5 transition-colors press relative"
      style={{ color: active ? 'var(--accent)' : 'var(--muted)' }}>
      <span className={`relative ${active ? 'animate-pop' : ''}`}>
        {icon}
        {badge > 0 && (
          <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center shadow">
            {badge > 9 ? '9+' : badge}
          </span>
        )}
      </span>
      <span className="text-[11px] font-semibold">{label}</span>
      {active && <span className="absolute -top-px h-0.5 w-8 rounded-full accent-gradient" />}
    </button>
  );
}
