import { useState } from 'react';
import { Wallet, CalendarDays, LogOut } from 'lucide-react';
import { BudgetTab } from './components/BudgetTab';
import { ItineraryTab } from './components/ItineraryTab';
import { LoginPage } from './pages/LoginPage';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { useVacationData } from './hooks/useVacationData';

type Tab = 'budget' | 'itinerary';

function AppContent() {
  const { user, authLoading, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('budget');
  const {
    budget, expenses, events, dataLoading,
    updateBudget, addExpense, updateExpense, deleteExpense,
    addEvent, updateEvent, deleteEvent,
  } = useVacationData();

  if (authLoading)              return <Splash />;
  if (!user)                    return <LoginPage />;
  if (dataLoading)              return <Splash label="Loading your trip…" />;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col" style={{ maxWidth: 480, margin: '0 auto' }}>
      <main className="flex-1" style={{ paddingBottom: 72 }}>
        {activeTab === 'budget' ? (
          <BudgetTab
            budget={budget} expenses={expenses}
            onUpdateBudget={updateBudget}
            onAddExpense={addExpense} onUpdateExpense={updateExpense} onDeleteExpense={deleteExpense}
          />
        ) : (
          <ItineraryTab
            budget={budget} events={events}
            onAddEvent={addEvent} onUpdateEvent={updateEvent} onDeleteEvent={deleteEvent}
          />
        )}
      </main>

      {/* Bottom nav */}
      <nav
        className="fixed bottom-0 bg-white border-t border-slate-200 flex z-50 shadow-lg"
        style={{ left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 480 }}
      >
        <NavTab label="Budget"    icon={<Wallet size={22} />}      active={activeTab === 'budget'}    activeColor="#0077B6" onClick={() => setActiveTab('budget')} />
        <NavTab label="Itinerary" icon={<CalendarDays size={22} />} active={activeTab === 'itinerary'} activeColor="#2EC4B6" onClick={() => setActiveTab('itinerary')} />
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
