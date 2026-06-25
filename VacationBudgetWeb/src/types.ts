export type ExpenseCategory =
  | 'FOOD' | 'TRANSPORT' | 'ACCOMMODATION' | 'ACTIVITIES' | 'SHOPPING' | 'OTHER';

export const CATEGORY_META: Record<ExpenseCategory, { label: string; emoji: string; color: string }> = {
  FOOD:          { label: 'Food & Dining',  emoji: '🍽️', color: '#FF7043' },
  TRANSPORT:     { label: 'Transportation', emoji: '✈️', color: '#42A5F5' },
  ACCOMMODATION: { label: 'Accommodation', emoji: '🏨', color: '#7E57C2' },
  ACTIVITIES:    { label: 'Activities',    emoji: '🎭', color: '#26C6DA' },
  SHOPPING:      { label: 'Shopping',      emoji: '🛍️', color: '#EC407A' },
  OTHER:         { label: 'Other',         emoji: '💼', color: '#78909C' },
};

export const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'MXN'] as const;
export type Currency = typeof CURRENCIES[number];

export const CURRENCY_SYMBOLS: Record<Currency, string> = {
  USD: '$', EUR: '€', GBP: '£', JPY: '¥', CAD: 'CA$', AUD: 'A$', MXN: 'MX$',
};

export interface Budget {
  tripName: string;
  destination: string;
  totalAmount: number;
  currency: Currency;
}

export interface Expense {
  id: string;
  name: string;
  amount: number;
  location: string;
  category: ExpenseCategory;
  date: string;        // YYYY-MM-DD (when expense occurred)
  notes: string;
  paid: boolean;
  createdAt?: string;  // ISO timestamp — when it was logged in the app
  receiptUrl?: string; // Supabase Storage public URL
}

export interface ItineraryEvent {
  id: string;
  title: string;
  description: string;
  location: string;
  date: string;       // YYYY-MM-DD
  startTime: string;  // HH:MM
  endTime: string;    // HH:MM
}
