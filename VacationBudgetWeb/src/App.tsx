import { useState } from 'react';
import { Wallet, CalendarDays, LogOut } from 'lucide-react';
import { BudgetTab } from './components/BudgetTab';
import { ItineraryTab } from './components/ItineraryTab';
import { LoginPage } from './pages/LoginPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { useVacationData } from './hooks/useVacationData';
import type { Expense, ExpenseCategory } from './types';
import { CATEGORY_META, CURRENCY_SYMBOLS } from './types';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { isNative } from './lib/api';

// Init native UI on startup
if (isNative) {
  StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
  StatusBar.setBackgroundColor({ color: '#0077B6' }).catch(() => {});
  SplashScreen.hide({ fadeOutDuration: 300 }).catch(() => {});
}

type Tab = 'budget' | 'itinerary';

function AppContent() {
  const { user, authLoading, signOut, justConfirmed, isPasswordReset } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>(
    () => (sessionStorage.getItem('activeTab') as Tab) ?? 'budget'
  );
  const [confirmedDismissed, setConfirmedDismissed] = useState(false);

  function switchTab(t: Tab) { setActiveTab(t); sessionStorage.setItem('activeTab', t); }
  const {
    budget, expenses, events, dataLoading,
    updateBudget, addExpense, updateExpense, deleteExpense,
    addEvent, updateEvent, deleteEvent,
  } = useVacationData();

  const DEFAULT_TIMES: Record<ExpenseCategory, [string, string]> = {
    FOOD:          ['12:00', '13:00'],
    ACCOMMODATION: ['15:00', '15:30'],
    TRANSPORT:     ['09:00', '10:00'],
    ACTIVITIES:    ['10:00', '12:00'],
    SHOPPING:      ['11:00', '12:00'],
    OTHER:         ['12:00', '13:00'],
  };

  function handleAddExpense(expense: Expense) {
    addExpense(expense);
    const meta = CATEGORY_META[expense.category];
    const [startTime, endTime] = DEFAULT_TIMES[expense.category];
    const symbol = CURRENCY_SYMBOLS[budget.currency];
    addEvent({
      id: crypto.randomUUID(),
      title: `${meta.emoji} ${expense.name}`,
      description: `${symbol}${expense.amount.toFixed(2)} · ${meta.label}${expense.notes ? ' · ' + expense.notes : ''}`,
      location: expense.location || '',
      date: expense.date,
      startTime,
      endTime,
    });
  }

  if (authLoading)    return <Splash />;
  if (isPasswordReset) return <ResetPasswordPage />;
  if (!user)          return <LoginPage />;
  if (justConfirmed && !confirmedDismissed) return <ConfirmedPage onContinue={() => setConfirmedDismissed(true)} />;
  if (dataLoading)    return <Splash label="Loading your trip…" />;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col" style={{ maxWidth: 480, margin: '0 auto' }}>
      <main className="flex-1" style={{ paddingBottom: 72 }}>
        {activeTab === 'budget' ? (
          <BudgetTab
            budget={budget} expenses={expenses}
            onUpdateBudget={updateBudget}
            onAddExpense={handleAddExpense} onUpdateExpense={updateExpense} onDeleteExpense={deleteExpense}
          />
        ) : (
          <ItineraryTab
            budget={budget} expenses={expenses} events={events}
            onAddEvent={addEvent} onUpdateEvent={updateEvent} onDeleteEvent={deleteEvent}
          />
        )}
      </main>

      {/* Bottom nav */}
      <nav
        className="fixed bottom-0 bg-white border-t border-slate-200 flex z-50 shadow-lg"
        style={{ left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 480 }}
      >
        <NavTab label="Budget"    icon={<Wallet size={22} />}      active={activeTab === 'budget'}    activeColor="#0077B6" onClick={() => switchTab('budget')} />
        <NavTab label="Itinerary" icon={<CalendarDays size={22} />} active={activeTab === 'itinerary'} activeColor="#2EC4B6" onClick={() => switchTab('itinerary')} />
        <button
          onClick={signOut}
          className="flex flex-col items-center justify-center py-3 px-5 gap-1 text-slate-400 hover:text-red-400 transition-colors"
        >
          <LogOut size={22} />
          <span className="text-xs font-semibold">Sign Out</span>
        </button>
      </nav>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

function NavTab({ label, icon, active, activeColor, onClick }: {
  label: string; icon: React.ReactNode; active: boolean; activeColor: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex-1 flex flex-col items-center justify-center py-3 gap-1 transition-colors relative"
      style={{ color: active ? activeColor : '#94a3b8' }}
    >
      {icon}
      <span className="text-xs font-semibold">{label}</span>
      {active && <span className="absolute bottom-0 w-10 h-0.5 rounded-full" style={{ backgroundColor: activeColor }} />}
    </button>
  );
}

function Splash({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4"
      style={{ background: 'linear-gradient(145deg, #0077B6, #00B4D8, #2EC4B6)' }}>
      <div className="text-6xl animate-bounce">✈️</div>
      <p className="text-white font-semibold text-lg">{label}</p>
    </div>
  );
}

function ConfirmedPage({ onContinue }: { onContinue: () => void }) {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6 gap-6 text-center"
      style={{ background: 'linear-gradient(145deg, #0077B6 0%, #00B4D8 50%, #2EC4B6 100%)' }}
    >
      <div className="text-7xl drop-shadow-lg">✅</div>
      <div>
        <h1 className="text-white text-3xl font-bold drop-shadow mb-2">Email Confirmed!</h1>
        <p className="text-white/80 text-base">Your account is verified and ready to go.</p>
      </div>
      <button
        onClick={onContinue}
        className="mt-2 px-8 py-3 rounded-2xl font-bold text-white text-base shadow-lg active:scale-95 transition-transform"
        style={{ background: 'rgba(255,255,255,0.25)', border: '2px solid rgba(255,255,255,0.5)' }}
      >
        Start Planning ✈️
      </button>
    </div>
  );
}
