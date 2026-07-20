import { useEffect, useRef, useState } from 'react';
import { X, Download, FileText, Maximize2, Minimize2 } from 'lucide-react';
import { Overlay } from './ui';
import { isPdf, saveToPhone } from '../lib/attachments';

/**
 * Full-screen viewer for a document attachment.
 *  • Images render directly; PDFs render in-app with pdf.js (Android's WebView
 *    has no built-in PDF viewer), lazily per page.
 *  • Pinch (or double-tap / double-click) to zoom up to 5×; while zoomed the
 *    content pans by normal scrolling in both directions.
 *  • The expand button hides the header for a true full-screen view.
 *  • "Save" downloads the original file to the phone's Download folder.
 */
export function DocViewer({ name, mime, dataUrl, onClose }: {
  name: string; mime?: string; dataUrl: string; onClose: () => void;
}) {
  const pdf = isPdf(mime, name);
  const [toast, setToast] = useState('');
  const [saving, setSaving] = useState(false);
  const [chrome, setChrome] = useState(true);

  async function save() {
    setSaving(true);
    const r = await saveToPhone(dataUrl, name);
    setSaving(false);
    setToast(r.message);
    setTimeout(() => setToast(''), 4000);
  }

  return (
    <Overlay>
      <div className="fixed inset-0 z-[300] bg-slate-900/95 flex flex-col animate-fadeIn">
        {chrome ? (
          <div className="flex items-center gap-2 px-4 py-3 text-white safe-top">
            <FileText size={18} className="flex-shrink-0 opacity-80" />
            <span className="flex-1 min-w-0 truncate font-semibold text-sm">{name || 'Attachment'}</span>
            <button onClick={save} disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/15 active:bg-white/25 text-sm font-semibold disabled:opacity-50">
              <Download size={15} /> {saving ? 'Saving…' : 'Save'}
            </button>
            <button onClick={() => setChrome(false)} aria-label="Full screen"
              className="w-9 h-9 rounded-full bg-white/15 active:bg-white/25 flex items-center justify-center">
              <Maximize2 size={17} />
            </button>
            <button onClick={onClose} aria-label="Close"
              className="w-9 h-9 rounded-full bg-white/15 active:bg-white/25 flex items-center justify-center">
              <X size={18} />
            </button>
          </div>
        ) : (
          /* Full screen: just two small floating controls over the content. */
          <div className="absolute right-3 z-10 flex gap-2"
            style={{ top: 'calc(env(safe-area-inset-top, 0px) + 10px)' }}>
            <button onClick={() => setChrome(true)} aria-label="Exit full screen"
              className="w-9 h-9 rounded-full bg-black/45 text-white/90 active:bg-black/65 flex items-center justify-center backdrop-blur">
              <Minimize2 size={16} />
            </button>
            <button onClick={onClose} aria-label="Close"
              className="w-9 h-9 rounded-full bg-black/45 text-white/90 active:bg-black/65 flex items-center justify-center backdrop-blur">
              <X size={17} />
            </button>
          </div>
        )}

        <ZoomPane className={`flex-1 min-h-0 ${chrome ? 'px-3 pb-6' : ''}`}>
          {pdf
            ? <PdfPages dataUrl={dataUrl} />
            : <img src={dataUrl} alt={name} className="w-full h-auto rounded-lg" draggable={false} />}
        </ZoomPane>

        {toast && (
          <div className="absolute left-1/2 -translate-x-1/2 bottom-8 bg-white text-slate-800 text-sm font-medium px-4 py-2 rounded-full shadow-lg max-w-[90%] text-center z-10">
            {toast}
          </div>
        )}
      </div>
    </Overlay>
  );
}

/**
 * Pinch / double-tap zoom implemented via content width: the inner element's
 * width is `scale × 100%`, so the layout really grows and the scroll container
 * pans naturally in both axes. (This also keeps the PDF lazy-render observer
 * and scroll positions correct — no CSS-transform trickery.)
 */
function ZoomPane({ className = '', children }: { className?: string; children: React.ReactNode }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const pinch = useRef<{ dist: number; scale: number } | null>(null);
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);

  const clamp = (s: number) => Math.min(5, Math.max(1, s));

  /** Change zoom, keeping the content point under (cx, cy) — viewport coords —
   *  fixed under the finger/cursor. */
  function zoomTo(next: number, cx: number, cy: number) {
    const el = scroller.current;
    if (!el) return;
    const s = clamp(next);
    setScale(prev => {
      if (s === prev) return prev;
      const rect = el.getBoundingClientRect();
      const px = cx - rect.left, py = cy - rect.top;
      const contentX = (el.scrollLeft + px) / prev;
      const contentY = (el.scrollTop + py) / prev;
      // Apply the scroll correction after React lays out the new width.
      requestAnimationFrame(() => {
        el.scrollLeft = contentX * s - px;
        el.scrollTop = contentY * s - py;
      });
      return s;
    });
  }

  function onTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      const [a, b] = [e.touches[0], e.touches[1]];
      pinch.current = { dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), scale };
    }
  }
  function onTouchMove(e: React.TouchEvent) {
    if (e.touches.length === 2 && pinch.current) {
      e.preventDefault();
      const [a, b] = [e.touches[0], e.touches[1]];
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      zoomTo(pinch.current.scale * (dist / pinch.current.dist),
        (a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2);
    }
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (e.touches.length < 2) pinch.current = null;
    // Double-tap: two quick taps close together toggle 1× ↔ 2.5×.
    if (e.changedTouches.length === 1 && e.touches.length === 0) {
      const t = e.changedTouches[0];
      const now = Date.now();
      const prev = lastTap.current;
      if (prev && now - prev.t < 300 && Math.hypot(t.clientX - prev.x, t.clientY - prev.y) < 40) {
        lastTap.current = null;
        zoomTo(scale > 1.2 ? 1 : 2.5, t.clientX, t.clientY);
      } else {
        lastTap.current = { t: now, x: t.clientX, y: t.clientY };
      }
    }
  }

  return (
    <div ref={scroller}
      className={`overflow-auto overscroll-contain ${className}`}
      style={{ touchAction: 'pan-x pan-y' }}
      onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
      onDoubleClick={e => zoomTo(scale > 1.2 ? 1 : 2.5, e.clientX, e.clientY)}>
      <div data-zoom={scale} style={{ width: `${scale * 100}%` }} className="max-w-none py-2">
        {children}
      </div>
    </div>
  );
}

function dataUrlToUint8(dataUrl: string): Uint8Array {
  const bin = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

function PdfPages({ dataUrl }: { dataUrl: string }) {
  const holder = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    let observer: IntersectionObserver | null = null;
    (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        // Worker is a bundled asset (served from the app origin), so it works
        // offline and inside the Android WebView.
        const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

        const doc = await pdfjs.getDocument({ data: dataUrlToUint8(dataUrl) }).promise;
        if (cancelled) return;
        const host = holder.current;
        if (!host) return;
        host.innerHTML = '';
        const width = Math.min(host.clientWidth || 360, 1000);
        const dpr = Math.min(window.devicePixelRatio || 1, 2); // headroom so zoomed pages stay readable

        // Aspect-ratio placeholders keep every page the right proportional size
        // (including while zoomed, when widths grow); pages render only while
        // near the viewport and release their canvas when far away, so a big
        // PDF never holds every page's backing store at once.
        const rendered = new Set<number>();
        for (let n = 1; n <= doc.numPages; n++) {
          const page = await doc.getPage(n);
          if (cancelled) return;
          const base = page.getViewport({ scale: 1 });
          const el = document.createElement('div');
          el.className = 'w-full rounded-lg shadow-lg mb-3 bg-white overflow-hidden';
          el.style.aspectRatio = `${base.width} / ${base.height}`;
          el.dataset.page = String(n);
          host.appendChild(el);
        }
        if (!cancelled) setStatus('ok');

        const renderPage = async (n: number, el: HTMLDivElement) => {
          if (rendered.has(n) || cancelled) return;
          rendered.add(n);
          const page = await doc.getPage(n);
          const base = page.getViewport({ scale: 1 });
          const vp = page.getViewport({ scale: (width / base.width) * dpr });
          const canvas = document.createElement('canvas');
          canvas.width = vp.width; canvas.height = vp.height;
          canvas.style.width = '100%'; canvas.style.height = 'auto';
          el.appendChild(canvas);
          try { await page.render({ canvasContext: canvas.getContext('2d')!, viewport: vp }).promise; }
          catch { rendered.delete(n); canvas.remove(); }
        };
        const releasePage = (n: number, el: HTMLDivElement) => {
          if (!rendered.has(n)) return;
          el.innerHTML = ''; // the aspect-ratio keeps the placeholder's size
          rendered.delete(n);
        };
        observer = new IntersectionObserver(entries => {
          for (const e of entries) {
            const el = e.target as HTMLDivElement;
            const n = Number(el.dataset.page);
            if (e.isIntersecting) void renderPage(n, el);
            else releasePage(n, el);
          }
        }, { root: host.closest('.overflow-auto'), rootMargin: '600px 0px' });
        host.querySelectorAll<HTMLDivElement>('[data-page]').forEach(el => observer!.observe(el));
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();
    return () => { cancelled = true; observer?.disconnect(); };
  }, [dataUrl]);

  return (
    <div className="max-w-2xl mx-auto">
      {status === 'loading' && <p className="text-white/70 text-center text-sm py-10">Loading PDF…</p>}
      {status === 'error' && (
        <p className="text-white/70 text-center text-sm py-10">
          Couldn’t render this PDF in-app. Tap <b>Save</b> above to download it and open it with your phone’s PDF viewer.
        </p>
      )}
      <div ref={holder} />
    </div>
  );
}
