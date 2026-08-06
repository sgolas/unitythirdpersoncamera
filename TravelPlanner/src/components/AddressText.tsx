/**
 * An address value you can copy or navigate to. Renders the address text with a
 * copy button and a "navigate" button that opens Google Maps directions from the
 * viewer's current location straight to the address. Drop it in anywhere an
 * address/location is shown (detail rows, cards) as the value.
 */
import { useState } from 'react';
import { Copy, Check, Navigation } from 'lucide-react';

const openExternal = (url: string) => window.open(url, '_blank', 'noopener');

/** Google Maps directions from the user's current location to a text address. */
export function navigateUrl(address: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}&travelmode=driving`;
}

/** Copy text to the clipboard, with a fallback for older webviews. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* fall through to the legacy path */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.focus(); ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch { return false; }
}

export function AddressText({ address, suffix, className = '' }: {
  address: string; suffix?: React.ReactNode; className?: string;
}) {
  const [copied, setCopied] = useState(false);
  if (!address) return <>{suffix ?? ''}</>;

  async function copy(e: React.MouseEvent) {
    e.stopPropagation();
    if (await copyText(address)) { setCopied(true); setTimeout(() => setCopied(false), 1500); }
  }
  function nav(e: React.MouseEvent) { e.stopPropagation(); openExternal(navigateUrl(address)); }

  return (
    <span className={`inline-flex items-center gap-2 flex-wrap ${className}`}>
      <span className="break-words">{address}{suffix ? <> {suffix}</> : null}</span>
      <span className="inline-flex items-center gap-1 flex-shrink-0">
        <button type="button" onClick={copy} aria-label="Copy address"
          className="w-7 h-7 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center active:scale-90 transition">
          {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
        </button>
        <button type="button" onClick={nav} aria-label="Navigate with Google Maps"
          className="w-7 h-7 rounded-lg bg-grape/10 text-grape flex items-center justify-center active:scale-90 transition">
          <Navigation size={14} />
        </button>
      </span>
    </span>
  );
}
