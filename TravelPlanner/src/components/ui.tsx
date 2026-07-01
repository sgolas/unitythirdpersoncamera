/** Small reusable UI primitives shared across all tabs. */
import { useEffect } from 'react';
import { X } from 'lucide-react';

/* ── LV-style monogram overlay for dark headers ─────────────── */
export function Monogram() {
  return <div className="absolute inset-0 bg-monogram pointer-events-none" aria-hidden />;
}

/* ── Page header ────────────────────────────────────────────── */
export function TabHeader({ title, subtitle, gradient, icon }: {
  title: string; subtitle?: string; gradient: string; icon: React.ReactNode;
}) {
  return (
    <div className="px-5 pad-header-top pb-6 text-white relative overflow-hidden" style={{ background: gradient }}>
      <Monogram />
      <div className="flex items-center gap-3 relative">
        <div className="w-11 h-11 rounded-2xl bg-white/20 flex items-center justify-center text-2xl">{icon}</div>
        <div>
          <h1 className="text-2xl font-bold leading-tight">{title}</h1>
          {subtitle && <p className="text-white/70 text-sm">{subtitle}</p>}
        </div>
      </div>
    </div>
  );
}

/* ── Bottom-sheet modal ─────────────────────────────────────── */
export function Sheet({ title, onClose, children, footer }: {
  title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[200] bg-black/50 flex items-end sm:items-center sm:justify-center"
      onClick={onClose}
      // Reserve the status-bar space at the top; the sheet (max-h-full) is
      // then capped to the remaining height, so its header + top fields are
      // always on screen.
      style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 8px)' }}
    >
      <div
        className="bg-white w-full sm:max-w-md sm:rounded-3xl rounded-t-3xl flex flex-col animate-fadeUp overflow-hidden max-h-full"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
          <h2 className="font-bold text-slate-800 text-lg">{title}</h2>
          <button onClick={onClose} className="p-1.5 -mr-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
            <X size={20} />
          </button>
        </div>
        {/* min-h-0 lets this actually scroll instead of pushing the header
            off-screen; sheet-scroll shows a visible scrollbar. */}
        <div className="px-5 py-4 overflow-y-auto flex-1 min-h-0 sheet-scroll">{children}</div>
        {footer && (
          <div className="px-5 py-4 border-t border-slate-100 flex-shrink-0"
            style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Form fields ────────────────────────────────────────────── */
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block mb-3.5">
      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

const inputCls =
  'w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-sky focus:ring-2 focus:ring-sky/20 outline-none transition text-slate-800';

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={inputCls} />;
}
export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={inputCls + ' resize-none'} rows={props.rows ?? 3} />;
}
export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={inputCls} />;
}

/* ── Buttons ────────────────────────────────────────────────── */
export function PrimaryButton({ children, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...p}
      className="w-full py-3 rounded-2xl font-bold text-white bg-ink active:scale-[0.98] disabled:opacity-40 transition">
      {children}
    </button>
  );
}
export function GhostButton({ children, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...p}
      className="w-full py-3 rounded-2xl font-semibold text-slate-600 bg-slate-100 active:bg-slate-200 transition">
      {children}
    </button>
  );
}

/* ── Standard form footer: Cancel + Submit side by side ─────── */
export function FormFooter({ onCancel, onSubmit, submitLabel = 'Save', disabled }: {
  onCancel: () => void; onSubmit: () => void; submitLabel?: string; disabled?: boolean;
}) {
  return (
    <div className="flex gap-3">
      <button onClick={onCancel}
        className="flex-1 py-3 rounded-2xl font-semibold text-slate-600 bg-slate-100 active:bg-slate-200 transition">
        Cancel
      </button>
      <button onClick={onSubmit} disabled={disabled}
        className="flex-1 py-3 rounded-2xl font-bold text-white bg-ink active:scale-[0.98] disabled:opacity-40 transition">
        {submitLabel}
      </button>
    </div>
  );
}

/* ── Empty state ────────────────────────────────────────────── */
export function EmptyState({ emoji, title, hint }: { emoji: string; title: string; hint: string }) {
  return (
    <div className="flex flex-col items-center text-center py-14 px-8">
      <span className="text-5xl mb-3">{emoji}</span>
      <p className="font-semibold text-slate-700">{title}</p>
      <p className="text-slate-400 text-sm mt-1">{hint}</p>
    </div>
  );
}

/* ── Floating add button ────────────────────────────────────── */
export function Fab({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button onClick={onClick}
      className="fixed bottom-24 right-4 z-40 flex items-center gap-2 px-5 py-3.5 rounded-2xl bg-ink text-white font-semibold shadow-xl shadow-ink/30 active:scale-95 transition">
      <span className="text-lg leading-none">＋</span> {label}
    </button>
  );
}

/* ── Confirm delete ─────────────────────────────────────────── */
export function ConfirmDelete({ label, onCancel, onConfirm }: {
  label: string; onCancel: () => void; onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[300] bg-black/50 flex items-end sm:items-center sm:justify-center" onClick={onCancel}>
      <div className="bg-white w-full sm:max-w-sm sm:rounded-3xl rounded-t-3xl p-6 pb-8 animate-fadeUp" onClick={e => e.stopPropagation()}>
        <h3 className="font-bold text-slate-800 text-lg mb-1">Delete this?</h3>
        <p className="text-slate-500 text-sm mb-6">{label} will be removed. This syncs to your other devices.</p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-3 rounded-2xl font-semibold text-slate-600 bg-slate-100 active:bg-slate-200">Cancel</button>
          <button onClick={onConfirm} className="flex-1 py-3 rounded-2xl font-semibold text-white bg-sunset active:brightness-95">Delete</button>
        </div>
      </div>
    </div>
  );
}
