import { useState, useEffect, useReducer, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db/database';
import { initCurrency } from './lib/currency';
import { Onboarding } from './components/Onboarding';
import { WelcomeSlides } from './components/WelcomeSlides';
import {
  LayoutDashboard, CalendarRange, Wallet, LayoutGrid,
  Map as MapIcon, ChevronLeft, MessageCircle, Pin, PinOff,
} from 'lucide-react';
import { SyncStatus } from './components/SyncStatus';
import { StitchIcon } from './components/StitchIcon';
import { isNative } from './lib/platform';
import { SECTIONS } from './lib/sections';
import { isPinned, toggleShortcut } from './lib/dashShortcuts';
import { useUnreadChat } from './lib/chatUnread';
import { Overlay } from './components/ui';

import { DashboardTab } from './components/tabs/DashboardTab';
import { TripOverviewTab } from './components/tabs/TripOverviewTab';
import { DocumentsTab } from './components/tabs/DocumentsTab';
import { ChecklistTab } from './components/tabs/ChecklistTab';
import { TransportTab } from './components/tabs/TransportTab';
import { AccommodationTab } from './components/tabs/AccommodationTab';
import { CarRentalTab } from './components/tabs/CarRentalTab';
import { ExpensesTab } from './components/tabs/ExpensesTab';
import { ItineraryTab } from './components/tabs/ItineraryTab';
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

type View =
  | 'dashboard' | 'overview' | 'documents' | 'checklist' | 'transport'
  | 'accommodation' | 'carrental' | 'expenses' | 'itinerary' | 'budget' | 'helper'
  | 'changelog' | 'settings' | 'map' | 'photos' | 'converter' | 'chat' | 'translate' | 'artillery';

const MORE_ITEMS = SECTIONS; // shared registry (also used by the dashboard)

export default function App() {
  const [view, setView] = useState<View>('dashboard');
  const [stack, setStack] = useState<View[]>([]);
  const [moreOpen, setMoreOpen] = useState(false);
  const [pinTarget, setPinTarget] = useState<typeof MORE_ITEMS[number] | null>(null);
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
    const openChat = () => { setStack([]); setMoreOpen(false); setView('chat'); };
    window.addEventListener('open-chat', openChat);
    return () => window.removeEventListener('open-chat', openChat);
  }, []);

  function go(v: View) {
    setMoreOpen(false);
    if (v !== view) setStack(s => [...s, view]);
    setView(v);
    window.scrollTo(0, 0);
  }

  function back() {
    setStack(s => {
      if (s.length === 0) return s;
      setView(s[s.length - 1]);
      window.scrollTo(0, 0);
      return s.slice(0, -1);
    });
  }

  // Android hardware back button → go back, or close the More menu, or exit.
  useEffect(() => {
    if (!isNative) return;
    let sub: any;
    import('@capacitor/app').then(({ App: CapApp }) => {
      sub = CapApp.addListener('backButton', () => {
        if (moreOpen) setMoreOpen(false);
        else if (stack.length > 0) back();
        else CapApp.exitApp();
      });
    });
    return () => { sub?.then?.((h: any) => h.remove()); };
  }, [stack, moreOpen]);

  const canGoBack = stack.length > 0;

  // First launch ever → warm welcome tour, then onboarding.
  if (!welcomeSeen) {
    return <WelcomeSlides onDone={() => { localStorage.setItem('welcome.seen', '1'); setWelcomeSeen(true); }} />;
  }
  // First run: no trip yet → onboarding wizard. (undefined = DB still loading.)
  if (tripState === undefined) return <div className="min-h-screen bg-bg" />;
  if (tripState === null) return <Onboarding onDone={() => bump()} />;

  return (
    <div className={`min-h-screen bg-bg text-content mx-auto max-w-md relative app-frame ${canGoBack ? 'with-back' : ''}`}>
      <main style={{ paddingBottom: 'calc(74px + env(safe-area-inset-bottom, 0px))' }}>
        {view === 'dashboard'     && <DashboardTab onNavigate={go} />}
        {view === 'overview'      && <TripOverviewTab />}
        {view === 'documents'     && <DocumentsTab />}
        {view === 'checklist'     && <ChecklistTab />}
        {view === 'transport'     && <TransportTab />}
        {view === 'accommodation' && <AccommodationTab />}
        {view === 'carrental'     && <CarRentalTab />}
        {view === 'expenses'      && <ExpensesTab />}
        {view === 'itinerary'     && <ItineraryTab />}
        {view === 'budget'        && <BudgetTab />}
        {view === 'helper'        && <HelperTab onNavigate={go} />}
        {view === 'changelog'     && <ChangeLogTab />}
        {view === 'settings'      && <SettingsTab />}
        {view === 'map'           && <MapTab />}
        {view === 'photos'        && <PhotosTab />}
        {view === 'converter'     && <ConverterTab />}
        {view === 'chat'          && <ChatTab />}
        {view === 'translate'     && <TranslateTab />}
        {view === 'artillery'     && <ArtilleryTab />}
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
          <StitchIcon />
          <SyncStatus onSetup={() => go('settings')} />
        </div>
      </div>

      {/* More menu */}
      {moreOpen && (
        <div className="fixed inset-0 z-[150] bg-black/50 flex items-end" onClick={() => setMoreOpen(false)}>
          <div className="bg-white w-full max-w-md mx-auto rounded-t-3xl p-5 animate-fadeUp"
            style={{ paddingBottom: 'calc(88px + env(safe-area-inset-bottom, 0px))' }} onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 rounded-full bg-slate-200 mx-auto mb-4" />
            <h2 className="font-bold text-slate-800 text-lg mb-4">All sections</h2>
            <p className="text-xs text-slate-400 mb-3">Tap to open · press and hold any item to pin it to Home.</p>
            <div className="grid grid-cols-3 gap-3">
              {MORE_ITEMS.map(m => (
                <MoreItem key={m.key} item={m} onOpen={() => go(m.key)} onHold={() => setPinTarget(m)} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Pin/unpin action popup (from long-pressing a More item) */}
      {pinTarget && (
        <Overlay>
          <div className="fixed inset-0 z-[200] bg-black/40 flex items-center justify-center p-8 animate-fadeIn" onClick={() => setPinTarget(null)}>
            <div className="bg-white rounded-3xl p-5 w-full max-w-[16rem] shadow-2xl text-center" onClick={e => e.stopPropagation()}>
              <span className="w-14 h-14 rounded-2xl flex items-center justify-center text-white mx-auto mb-3"
                style={{ backgroundColor: pinTarget.color }}>{pinTarget.icon}</span>
              <p className="font-bold text-slate-800">{pinTarget.label}</p>
              <button
                onClick={() => { toggleShortcut(pinTarget.key); setPinTarget(null); }}
                className="mt-4 w-full py-3 rounded-2xl font-bold text-white accent-gradient active:scale-[0.98] transition flex items-center justify-center gap-2">
                {isPinned(pinTarget.key)
                  ? <><PinOff size={17} /> Remove from Home</>
                  : <><Pin size={17} /> Add shortcut to Home</>}
              </button>
              <button onClick={() => setPinTarget(null)}
                className="mt-2 w-full py-2.5 rounded-2xl font-semibold text-slate-500 active:bg-slate-50 transition">
                Cancel
              </button>
            </div>
          </div>
        </Overlay>
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

/** A More-menu tile: tap opens the section; press-and-hold (3s) offers to
 *  pin/unpin it to the dashboard. */
function MoreItem({ item, onOpen, onHold }: {
  item: typeof MORE_ITEMS[number]; onOpen: () => void; onHold: () => void;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);
  const [holding, setHolding] = useState(false);

  const clear = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } setHolding(false); };
  const start = () => {
    held.current = false;
    setHolding(true);
    timer.current = setTimeout(() => { held.current = true; setHolding(false); onHold(); }, 3000);
  };

  return (
    <button
      onPointerDown={start}
      onPointerUp={clear}
      onPointerLeave={clear}
      onPointerCancel={clear}
      onContextMenu={e => e.preventDefault()}
      onClick={() => { if (held.current) { held.current = false; return; } onOpen(); }}
      className={`relative flex flex-col items-center gap-2 py-4 rounded-2xl bg-slate-50 active:bg-slate-100 transition ${holding ? 'ring-2 ring-accent scale-95' : ''}`}>
      <span className="w-11 h-11 rounded-2xl flex items-center justify-center text-white"
        style={{ backgroundColor: item.color }}>{item.icon}</span>
      <span className="text-xs font-semibold text-slate-600 text-center">{item.label}</span>
      {isPinned(item.key) && <span className="absolute top-1.5 right-1.5"><Pin size={12} className="text-accent" /></span>}
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
