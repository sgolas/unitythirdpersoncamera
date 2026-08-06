-- Run this in: Supabase Dashboard → SQL Editor → New Query

CREATE TABLE IF NOT EXISTS budgets (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  trip_name   text NOT NULL DEFAULT 'My Vacation',
  destination text DEFAULT '',
  total_amount numeric(12,2) DEFAULT 0,
  currency    text DEFAULT 'USD',
  updated_at  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS expenses (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name       text NOT NULL,
  amount     numeric(12,2) NOT NULL,
  location   text DEFAULT '',
  category   text DEFAULT 'OTHER',
  date       date NOT NULL,
  notes      text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS itinerary_events (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title       text NOT NULL,
  description text DEFAULT '',
  location    text DEFAULT '',
  date        date NOT NULL,
  start_time  text NOT NULL,
  end_time    text NOT NULL,
  created_at  timestamptz DEFAULT now()
);

-- Enable Row Level Security (users only see their own data)
ALTER TABLE budgets          ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses         ENABLE ROW LEVEL SECURITY;
ALTER TABLE itinerary_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_budgets"  ON budgets          FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own_expenses" ON expenses         FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own_events"   ON itinerary_events FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
