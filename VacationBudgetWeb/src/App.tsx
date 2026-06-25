import { useState } from 'react';
import { Wallet, CalendarDays } from 'lucide-react';
import { BudgetTab } from './components/BudgetTab';
import { ItineraryTab } from './components/ItineraryTab';
import { useLocalStorage } from './hooks/useLocalStorage';
import { Budget, Expense, ItineraryEvent } from './types';

const DEFAULT_BUDGET: Budget = {
  tripName:    'My Vacation',
  destination: '',
  totalAmount: 0,
  currency:    'USD',
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'budget' | 'itinerary'>('budget');
  const [budget,   setBudget]   = useLocalStorage<Budget>('vb_budget',   DEFAULT_BUDGET);
  const [expenses, setExpenses] = useLocalStorage<Expense[]>('vb_expenses', []);
  const [events,   setEvents]   = useLocalStorage<ItineraryEvent[]>('vb_events', []);

  const addExpense    = (e: Expense) => setExpenses(prev => [e, ...prev]);
  const updateExpense = (e: Expense) => setExpenses(prev => prev.map(x => x.id === e.id ? e : x));
  const deleteExpense = (id: string) => setExpenses(prev => prev.filter(x => x.id !== id));

  const addEvent    = (e: ItineraryEvent) => setEvents(prev => [...prev, e]);
  const updateEvent = (e: ItineraryEvent) => setEvents(prev => prev.map(x => x.id === e.id ? e : x));
  const deleteEvent = (id: string)        => setEvents(prev => prev.filter(x => x.id !== id));

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col" style={{ maxWidth: 480, margin: '0 auto', position: 'relative' }}>
      <main className="flex-1 overflow-y-auto" style={{ paddingBottom: 72 }}>
        {activeTab === 'budget' ? (
          <BudgetTab
            budget={budget} expenses={expenses}
            onUpdateBudget={setBudget}
            onAddExpense={addExpense} onUpdateExpense={updateExpense} onDeleteExpense={deleteExpense}
          />
        ) : (
          <ItineraryTab
            events={events}
            onAddEvent={addEvent} onUpdateEvent={updateEvent} onDeleteEvent={deleteEvent}
          />
        )}
      </main>

      {/* Bottom navigation */}
      <nav
        className="fixed bottom-0 bg-white border-t border-slate-200 flex z-50 shadow-lg"
        style={{ left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 480 }}
      >
        <NavTab
          label="Budget" icon={<Wallet size={22} />}
          active={activeTab === 'budget'}
          activeColor="#0077B6"
          onClick={() => setActiveTab('budget')}
        />
        <NavTab
          label="Itinerary" icon={<CalendarDays size={22} />}
          active={activeTab === 'itinerary'}
          activeColor="#2EC4B6"
          onClick={() => setActiveTab('itinerary')}
        />
      </nav>
    </div>
  );
}

function NavTab({ label, icon, active, activeColor, onClick }: {
  label: string; icon: React.ReactNode; active: boolean; activeColor: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex-1 flex flex-col items-center justify-center py-3 gap-1 transition-colors"
      style={{ color: active ? activeColor : '#94a3b8' }}
    >
      {icon}
      <span className="text-xs font-semibold">{label}</span>
      {active && (
        <span className="absolute bottom-0 w-10 h-0.5 rounded-full" style={{ backgroundColor: activeColor }} />
      )}
    </button>
  );
}
