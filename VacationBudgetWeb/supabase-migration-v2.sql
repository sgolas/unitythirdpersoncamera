-- Migration v2: paid status, receipt storage
-- Run this in: Supabase Dashboard → SQL Editor → New Query

-- Add new columns to expenses table
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS paid boolean DEFAULT false;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS receipt_url text DEFAULT '';

-- Create storage bucket for receipt photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', true)
ON CONFLICT (id) DO NOTHING;

-- RLS: each user can only upload/read their own receipts (files stored as {user_id}/{filename})
DROP POLICY IF EXISTS "receipt_insert" ON storage.objects;
DROP POLICY IF EXISTS "receipt_select" ON storage.objects;
DROP POLICY IF EXISTS "receipt_update" ON storage.objects;

CREATE POLICY "receipt_insert" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'receipts'
  AND auth.role() = 'authenticated'
  AND split_part(name, '/', 1) = auth.uid()::text
);

CREATE POLICY "receipt_select" ON storage.objects
FOR SELECT USING (
  bucket_id = 'receipts'
  AND auth.role() = 'authenticated'
  AND split_part(name, '/', 1) = auth.uid()::text
);

CREATE POLICY "receipt_update" ON storage.objects
FOR UPDATE USING (
  bucket_id = 'receipts'
  AND auth.role() = 'authenticated'
  AND split_part(name, '/', 1) = auth.uid()::text
);
