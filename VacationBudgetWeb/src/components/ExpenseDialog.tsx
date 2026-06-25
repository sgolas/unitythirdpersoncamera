import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, FileText, Save, Plus, Sparkles, Loader, MapPin, Camera, Check, X } from 'lucide-react';
import { Expense, ExpenseCategory, CATEGORY_META, Currency, CURRENCY_SYMBOLS } from '../types';
import { LocationInput } from './LocationInput';
import { todayStr } from '../utils/formatters';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { apiUrl, isNative } from '../lib/api';
import { Camera as NativeCamera, CameraResultType, CameraSource } from '@capacitor/camera';

interface Props {
  expense: Expense | null;
  currency: Currency;
  destination?: string;
  onSave: (e: Expense) => void;
  onClose: () => void;
}

const CATEGORIES = Object.keys(CATEGORY_META) as ExpenseCategory[];
const DRAFT_KEY = 'draft_expense';
const AI_CATEGORIES: ExpenseCategory[] = ['FOOD', 'ACCOMMODATION'];

interface PlaceSuggestion { name: string; address: string; description: string; }

export function ExpenseDialog({ expense, currency, destination, onSave, onClose }: Props) {
  const { user } = useAuth();
  const symbol    = CURRENCY_SYMBOLS[currency] ?? '$';
  const isEditing = expense !== null;

  function getInitial() {
    if (isEditing) return null;
    try { return JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? 'null'); } catch { return null; }
  }
  const draft = getInitial();

  const [name,       setName]       = useState(expense?.name       ?? draft?.name       ?? '');
  const [amount,     setAmount]     = useState(expense ? expense.amount.toFixed(2) : (draft?.amount ?? ''));
  const [location,   setLocation]   = useState(expense?.location   ?? draft?.location   ?? '');
  const [category,   setCategory]   = useState<ExpenseCategory>(expense?.category ?? draft?.category ?? 'OTHER');
  const [date,       setDate]       = useState(expense?.date       ?? draft?.date       ?? todayStr());
  const [notes,      setNotes]      = useState(expense?.notes      ?? draft?.notes      ?? '');
  const [paid,       setPaid]       = useState<boolean>(expense?.paid ?? draft?.paid ?? false);
  // receiptUrl holds the already-uploaded (permanent) URL; receiptPreview is what the img tag shows
  const [receiptUrl,     setReceiptUrl]     = useState(expense?.receiptUrl ?? draft?.receiptUrl ?? '');
  const [receiptPreview, setReceiptPreview] = useState(expense?.receiptUrl ?? draft?.receiptUrl ?? '');
  const [receiptUploading, setReceiptUploading] = useState(false);
  const [nameErr,    setNameErr]    = useState(false);
  const [amtErr,     setAmtErr]     = useState(false);

  const receiptInputRef = useRef<HTMLInputElement>(null);

  // AI place finder state
  const [showAI,        setShowAI]        = useState(false);
  const [aiQuery,       setAiQuery]       = useState('');
  const [aiLoading,     setAiLoading]     = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<PlaceSuggestion[]>([]);
  const [aiError,       setAiError]       = useState('');

  // Persist ALL form fields (including paid + receiptUrl) while typing — new expenses only
  useEffect(() => {
    if (isEditing) return;
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({
      name, amount, location, category, date, notes, paid, receiptUrl,
    }));
  }, [name, amount, location, category, date, notes, isEditing, paid, receiptUrl]);

  useEffect(() => {
    if (!AI_CATEGORIES.includes(category)) { setShowAI(false); setAiSuggestions([]); }
  }, [category]);

  function clearDraft() { sessionStorage.removeItem(DRAFT_KEY); }

  async function uploadReceiptBlob(blob: Blob) {
    if (!user) return;
    setReceiptUploading(true);
    try {
      const path = `${user.id}/pending_${Date.now()}.jpg`;
      const { error } = await supabase.storage
        .from('receipts')
        .upload(path, blob, { contentType: 'image/jpeg', upsert: true });
      if (!error) {
        const { data } = supabase.storage.from('receipts').getPublicUrl(path);
        setReceiptUrl(data.publicUrl);
        setReceiptPreview(data.publicUrl);
      }
    } catch { /* silently continue */ }
    setReceiptUploading(false);
  }

  // Native Android: use Capacitor Camera plugin (Camera or Gallery picker)
  async function handleNativeCamera() {
    try {
      const photo = await NativeCamera.getPhoto({
        quality: 82,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Prompt,
        width: 1400,
        height: 1400,
      });
      if (!photo.dataUrl) return;
      setReceiptPreview(photo.dataUrl);
      const blob = await dataUrlToBlob(photo.dataUrl);
      const compressed = await compressBlob(blob);
      await uploadReceiptBlob(compressed);
    } catch { /* user cancelled */ }
  }

  // Web fallback: file input (also works in Capacitor WebView if needed)
  async function handleReceiptChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const blobUrl = URL.createObjectURL(file);
    setReceiptPreview(blobUrl);
    const compressed = await compressImage(file);
    await uploadReceiptBlob(compressed);
  }

  function openReceiptPicker() {
    if (isNative) {
      handleNativeCamera();
    } else {
      receiptInputRef.current?.click();
    }
  }

  function removeReceipt() {
    setReceiptUrl('');
    setReceiptPreview('');
    if (receiptInputRef.current) receiptInputRef.current.value = '';
  }

  function handleSave() {
    const parsed = parseFloat(amount);
    const ne = name.trim() === '';
    const ae = isNaN(parsed) || parsed <= 0;
    setNameErr(ne); setAmtErr(ae);
    if (ne || ae) return;
    if (receiptUploading) return; // wait for upload to finish first

    clearDraft();
    onSave({
      id:         expense?.id ?? crypto.randomUUID(),
      name:       name.trim(),
      amount:     parsed,
      location:   location.trim(),
      category,
      date,
      notes:      notes.trim(),
      paid,
      receiptUrl: receiptUrl || expense?.receiptUrl || '',
    });
  }

  function handleClose() { clearDraft(); onClose(); }

  async function findWithAI() {
    if (!aiQuery.trim()) return;
    setAiLoading(true);
    setAiError('');
    setAiSuggestions([]);
    try {
      const res = await fetch(apiUrl('/.netlify/functions/claude'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          findPlaces: { category: CATEGORY_META[category].label, query: aiQuery },
          destination,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setAiSuggestions(data.suggestions ?? []);
      if ((data.suggestions ?? []).length === 0) setAiError('No results found. Try a different search.');
    } catch {
      setAiError('Could not fetch suggestions. Try again.');
    } finally {
      setAiLoading(false);
    }
  }

  function pickSuggestion(s: PlaceSuggestion) {
    setLocation(s.address);
    if (!name) setName(s.name);
    setShowAI(false);
    setAiSuggestions([]);
    setAiQuery('');
  }

  const showAIButton = AI_CATEGORIES.includes(category);

  return (
    <div className="fixed inset-0 z-[200] bg-white flex flex-col">

      {/* ── Sticky header ─────────────────────────────────────── */}
      <div
        className="flex items-center gap-3 px-4 py-4 border-b border-slate-100 flex-shrink-0"
        style={{ background: 'linear-gradient(135deg, #0077B6 0%, #00B4D8 100%)' }}
      >
        <button
          onClick={handleClose}
          className="w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors flex-shrink-0"
        >
          <ArrowLeft size={20} />
        </button>
        <h2 className="text-xl font-bold text-white flex-1">
          {isEditing ? 'Edit Expense' : 'New Expense'}
        </h2>
      </div>

      {/* ── Scrollable body ───────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">

        {/* Category */}
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Category</p>
          <div className="grid grid-cols-3 gap-2">
            {CATEGORIES.map(cat => {
              const meta = CATEGORY_META[cat];
              const selected = cat === category;
              return (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={`flex flex-col items-center p-3 rounded-xl border-2 transition-all ${
                    selected ? 'border-ocean bg-blue-50' : 'border-transparent bg-slate-50 hover:bg-slate-100'
                  }`}
                >
                  <span className="text-xl">{meta.emoji}</span>
                  <span className={`text-xs mt-1 font-medium ${selected ? 'text-ocean' : 'text-slate-500'}`}>
                    {meta.label.split(' ')[0]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Name */}
        <div>
          <label className="field-label">Expense Name <span className="text-red-400">*</span></label>
          <input
            value={name} onChange={e => { setName(e.target.value); setNameErr(false); }}
            placeholder="e.g. Dinner at Le Jules Verne"
            className={`input-base ${nameErr ? 'border-red-400' : ''}`}
          />
          {nameErr && <p className="text-xs text-red-500 mt-1">Name is required</p>}
        </div>

        {/* Amount */}
        <div>
          <label className="field-label">Amount <span className="text-red-400">*</span></label>
          <div className={`flex items-stretch border rounded-xl overflow-hidden transition-all focus-within:ring-2 focus-within:ring-ocean/30 focus-within:border-ocean ${amtErr ? 'border-red-400' : 'border-slate-200'}`}>
            <span className="flex items-center px-4 bg-slate-50 border-r border-slate-200 text-slate-600 font-semibold text-sm select-none min-w-[3rem] justify-center">
              {symbol}
            </span>
            <input
              type="number" min="0" step="0.01"
              value={amount}
              onChange={e => { setAmount(e.target.value); setAmtErr(false); }}
              placeholder="0.00"
              className="flex-1 px-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none bg-white"
            />
          </div>
          {amtErr && <p className="text-xs text-red-500 mt-1">Enter a valid amount</p>}
        </div>

        {/* Location */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="field-label mb-0">Location</label>
            {showAIButton && (
              <button
                type="button"
                onClick={() => { setShowAI(s => !s); setAiSuggestions([]); setAiError(''); }}
                className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full transition-colors ${
                  showAI ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-500 hover:bg-violet-50 hover:text-violet-600'
                }`}
              >
                <Sparkles size={11} /> Ask AI
              </button>
            )}
          </div>
          <LocationInput value={location} onChange={setLocation} placeholder="Search for a place or use GPS…" />

          {showAI && (
            <div className="mt-2 rounded-2xl border border-violet-200 bg-violet-50 overflow-hidden">
              <div className="flex items-center gap-1.5 px-3 py-2 bg-violet-100">
                <Sparkles size={13} className="text-violet-600" />
                <span className="text-xs font-semibold text-violet-700">
                  AI {CATEGORY_META[category].label} Finder{destination ? ` near ${destination}` : ''}
                </span>
              </div>
              <div className="p-3 space-y-2">
                <div className="flex gap-2">
                  <input
                    value={aiQuery}
                    onChange={e => setAiQuery(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') findWithAI(); }}
                    placeholder={category === 'FOOD' ? 'e.g. romantic Italian restaurant' : 'e.g. boutique hotel with pool'}
                    className="flex-1 text-sm border border-violet-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-violet-300"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={findWithAI}
                    disabled={aiLoading || !aiQuery.trim()}
                    className="px-4 py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-50 transition-all active:scale-95 flex items-center gap-1.5"
                    style={{ background: 'linear-gradient(135deg, #7C3AED, #4F46E5)' }}
                  >
                    {aiLoading ? <Loader size={14} className="animate-spin" /> : 'Find'}
                  </button>
                </div>
                {aiError && <p className="text-xs text-red-500">{aiError}</p>}
                {aiSuggestions.length > 0 && (
                  <div className="space-y-1.5 mt-1">
                    {aiSuggestions.map((s, i) => (
                      <button key={i} type="button" onClick={() => pickSuggestion(s)}
                        className="w-full text-left bg-white rounded-xl border border-violet-100 px-3 py-2.5 hover:border-violet-400 hover:bg-violet-50 transition-colors"
                      >
                        <div className="flex items-start gap-2">
                          <MapPin size={13} className="text-violet-500 mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="text-sm font-semibold text-slate-800 leading-tight">{s.name}</p>
                            <p className="text-xs text-slate-500 mt-0.5">{s.address}</p>
                            {s.description && <p className="text-xs text-slate-400 mt-0.5 italic">{s.description}</p>}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Date */}
        <div>
          <label className="field-label">Date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className="input-base" />
        </div>

        {/* Notes */}
        <div>
          <label className="field-label">Notes <span className="text-slate-400 font-normal">(optional)</span></label>
          <div className="relative">
            <FileText size={16} className="absolute left-3 top-3 text-slate-400" />
            <textarea
              value={notes} onChange={e => setNotes(e.target.value)}
              rows={3} placeholder="Any extra details..."
              className="input-base pl-9 resize-none"
            />
          </div>
        </div>

        {/* Payment status */}
        <div>
          <label className="field-label">Payment Status</label>
          <button
            type="button"
            onClick={() => setPaid(p => !p)}
            className={`flex items-center gap-3 w-full px-4 py-3.5 rounded-xl border-2 transition-all ${
              paid ? 'border-green-400 bg-green-50' : 'border-slate-200 bg-slate-50 hover:border-slate-300'
            }`}
          >
            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
              paid ? 'border-green-500 bg-green-500' : 'border-slate-300 bg-white'
            }`}>
              {paid && <Check size={14} className="text-white" strokeWidth={3} />}
            </div>
            <div className="flex-1 text-left">
              <span className={`font-semibold text-sm ${paid ? 'text-green-700' : 'text-slate-600'}`}>
                {paid ? 'Paid' : 'Not paid yet'}
              </span>
              <p className="text-xs text-slate-400 mt-0.5">{paid ? 'This expense has been paid' : 'Tap to mark as paid'}</p>
            </div>
          </button>
        </div>

        {/* Receipt photo */}
        <div>
          <label className="field-label">Receipt Photo <span className="text-slate-400 font-normal">(optional)</span></label>

          {/* Hidden file input — no capture= attribute to avoid browser navigation issues on mobile */}
          <input
            ref={receiptInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleReceiptChange}
          />

          {receiptPreview ? (
            <div className="relative mt-1">
              <img
                src={receiptPreview}
                alt="Receipt preview"
                className="w-full max-h-64 object-cover rounded-xl border border-slate-200"
              />
              {/* Uploading overlay */}
              {receiptUploading && (
                <div className="absolute inset-0 bg-black/40 rounded-xl flex flex-col items-center justify-center gap-2">
                  <Loader size={28} className="text-white animate-spin" />
                  <p className="text-white text-sm font-semibold">Uploading…</p>
                </div>
              )}
              {/* Remove button */}
              <button
                type="button"
                onClick={removeReceipt}
                disabled={receiptUploading}
                className="absolute top-2 right-2 w-8 h-8 bg-red-500 text-white rounded-full flex items-center justify-center shadow-lg disabled:opacity-40"
              >
                <X size={16} />
              </button>
              {/* Replace button */}
              {!receiptUploading && (
                <button
                  type="button"
                  onClick={openReceiptPicker}
                  className="absolute bottom-2 right-2 flex items-center gap-1.5 bg-black/55 text-white text-xs font-semibold px-3 py-1.5 rounded-full"
                >
                  <Camera size={12} /> Replace
                </button>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={openReceiptPicker}
              className="flex items-center justify-center gap-2 w-full mt-1 border-2 border-dashed border-slate-200 rounded-xl px-4 py-6 text-slate-400 hover:border-ocean hover:text-ocean transition-colors active:scale-[0.98]"
            >
              <Camera size={22} />
              <span className="font-medium text-sm">Take Photo or Choose from Gallery</span>
            </button>
          )}
        </div>

        {/* Bottom spacer */}
        <div className="h-4" />
      </div>

      {/* ── Sticky footer — only Save or Cancel can dismiss this screen ── */}
      <div className="border-t-2 border-slate-100 px-5 py-4 bg-white flex gap-3 flex-shrink-0">
        <button
          onClick={handleClose}
          disabled={receiptUploading}
          className="btn-outline flex-1 py-3.5 text-base font-semibold"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={receiptUploading}
          className="btn-primary flex-1 py-3.5 gap-2 text-base font-semibold"
        >
          {receiptUploading
            ? <><Loader size={17} className="animate-spin" /> Uploading…</>
            : isEditing
              ? <><Save size={17} /> Save Changes</>
              : <><Plus size={17} /> Save Expense</>
          }
        </button>
      </div>
    </div>
  );
}

async function compressImage(file: File): Promise<Blob> {
  const blobUrl = URL.createObjectURL(file);
  const result = await compressFromUrl(blobUrl);
  URL.revokeObjectURL(blobUrl);
  return result ?? file;
}

async function compressBlob(blob: Blob): Promise<Blob> {
  const blobUrl = URL.createObjectURL(blob);
  const result = await compressFromUrl(blobUrl);
  URL.revokeObjectURL(blobUrl);
  return result ?? blob;
}

function compressFromUrl(src: string): Promise<Blob | null> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const MAX = 1400;
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.82);
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return fetch(dataUrl).then(r => r.blob());
}
