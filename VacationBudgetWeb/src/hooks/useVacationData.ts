import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { Budget, Expense, ItineraryEvent } from '../types';

const DEFAULT_BUDGET: Budget = {
  tripName: 'My Vacation', destination: '', totalAmount: 0, currency: 'USD',
};

export function useVacationData() {
  const { user } = useAuth();
  const [budget,   setBudget]   = useState<Budget>(DEFAULT_BUDGET);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [events,   setEvents]   = useState<ItineraryEvent[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!user) return;
    setDataLoading(true);

    const [budgetRes, expensesRes, eventsRes] = await Promise.all([
      supabase.from('budgets').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('expenses').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('itinerary_events').select('*').eq('user_id', user.id).order('date').order('start_time'),
    ]);

    if (budgetRes.data) {
      setBudget({
        tripName:    budgetRes.data.trip_name,
        destination: budgetRes.data.destination,
        totalAmount: Number(budgetRes.data.total_amount),
        currency:    budgetRes.data.currency,
      });
    }

    if (expensesRes.data) {
      setExpenses(expensesRes.data.map(r => ({
        id: r.id, name: r.name, amount: Number(r.amount),
        location: r.location, category: r.category, date: r.date, notes: r.notes,
      })));
    }

    if (eventsRes.data) {
      setEvents(eventsRes.data.map(r => ({
        id: r.id, title: r.title, description: r.description,
        location: r.location, date: r.date, startTime: r.start_time, endTime: r.end_time,
      })));
    }

    setDataLoading(false);
  }, [user]);

  useEffect(() => { loadData(); }, [loadData]);

  /* ── Budget ─────────────────────────────────────────── */
  async function updateBudget(b: Budget) {
    setBudget(b);
    const { data: existing } = await supabase
      .from('budgets').select('id').eq('user_id', user!.id).maybeSingle();

    const payload = {
      trip_name: b.tripName, destination: b.destination,
      total_amount: b.totalAmount, currency: b.currency,
    };

    if (existing) {
      await supabase.from('budgets').update(payload).eq('user_id', user!.id);
    } else {
      await supabase.from('budgets').insert({ user_id: user!.id, ...payload });
    }
  }

  /* ── Expenses ───────────────────────────────────────── */
  async function addExpense(expense: Expense) {
    const { data } = await supabase.from('expenses').insert({
      user_id: user!.id, name: expense.name, amount: expense.amount,
      location: expense.location, category: expense.category,
      date: expense.date, notes: expense.notes,
    }).select().single();

    if (data) setExpenses(prev => [{ ...expense, id: data.id }, ...prev]);
  }

  async function updateExpense(expense: Expense) {
    setExpenses(prev => prev.map(e => e.id === expense.id ? expense : e));
    await supabase.from('expenses').update({
      name: expense.name, amount: expense.amount, location: expense.location,
      category: expense.category, date: expense.date, notes: expense.notes,
    }).eq('id', expense.id);
  }

  async function deleteExpense(id: string) {
    setExpenses(prev => prev.filter(e => e.id !== id));
    await supabase.from('expenses').delete().eq('id', id);
  }

  /* ── Events ─────────────────────────────────────────── */
  async function addEvent(event: ItineraryEvent) {
    const { data } = await supabase.from('itinerary_events').insert({
      user_id: user!.id, title: event.title, description: event.description,
      location: event.location, date: event.date,
      start_time: event.startTime, end_time: event.endTime,
    }).select().single();

    if (data) {
      setEvents(prev =>
        [...prev, { ...event, id: data.id }]
          .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
      );
    }
  }

  async function updateEvent(event: ItineraryEvent) {
    setEvents(prev => prev.map(e => e.id === event.id ? event : e));
    await supabase.from('itinerary_events').update({
      title: event.title, description: event.description, location: event.location,
      date: event.date, start_time: event.startTime, end_time: event.endTime,
    }).eq('id', event.id);
  }

  async function deleteEvent(id: string) {
    setEvents(prev => prev.filter(e => e.id !== id));
    await supabase.from('itinerary_events').delete().eq('id', id);
  }

  return {
    budget, expenses, events, dataLoading,
    updateBudget, addExpense, updateExpense, deleteExpense,
    addEvent, updateEvent, deleteEvent,
  };
}
