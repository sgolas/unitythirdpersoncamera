import { useEffect, useRef, useState } from 'react';
import { X, Download, FileText } from 'lucide-react';
import { Overlay } from './ui';
import { isPdf, saveToPhone } from '../lib/attachments';

/**
 * Full-screen viewer for a document attachment.
 *  • Images render directly.
 *  • PDFs render in-app with pdf.js (Android's WebView has no built-in PDF
 *    viewer), lazy-loaded so it never weighs down the rest of the app.
 * A "Save" button downloads the original file to the phone.
 */
export function DocViewer({ name, mime, dataUrl, onClose }: {
  name: string; mime?: string; dataUrl: string; onClose: () => void;
}) {
  const pdf = isPdf(mime, name);
  const [toast, setToast] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const r = await saveToPhone(dataUrl, name);
    setSaving(false);
    setToast(r.message);
    setTimeout(() => setToast(''), 3500);
  }

  return (
    <Overlay>
      <div className="fixed inset-0 z-[300] bg-slate-900/95 flex flex-col animate-fadeIn">
        <div className="flex items-center gap-2 px-4 py-3 text-white safe-top">
          <FileText size={18} className="flex-shrink-0 opacity-80" />
          <span className="flex-1 min-w-0 truncate font-semibold text-sm">{name || 'Attachment'}</span>
          <button onClick={save} disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/15 active:bg-white/25 text-sm font-semibold disabled:opacity-50">
            <Download size={15} /> {saving ? 'Saving…' : 'Save'}
          </button>
          <button onClick={onClose} aria-label="Close" className="w-9 h-9 rounded-full bg-white/15 active:bg-white/25 flex items-center justify-center">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-auto px-3 pb-6">
          {pdf
            ? <PdfPages dataUrl={dataUrl} />
            : <div className="h-full flex items-center justify-center">
                <img src={dataUrl} alt={name} className="max-w-full max-h-full object-contain rounded-lg" />
              </div>}
        </div>

        {toast && (
          <div className="absolute left-1/2 -translate-x-1/2 bottom-8 bg-white text-slate-800 text-sm font-medium px-4 py-2 rounded-full shadow-lg max-w-[90%] text-center">
            {toast}
          </div>
        )}
      </div>
    </Overlay>
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
        for (let n = 1; n <= doc.numPages; n++) {
          const page = await doc.getPage(n);
          if (cancelled) return;
          const base = page.getViewport({ scale: 1 });
          const scale = (width / base.width) * Math.min(window.devicePixelRatio || 1, 2);
          const vp = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          canvas.width = vp.width; canvas.height = vp.height;
          canvas.className = 'w-full rounded-lg shadow-lg mb-3 bg-white';
          canvas.style.width = '100%'; canvas.style.height = 'auto';
          host.appendChild(canvas);
          await page.render({ canvasContext: canvas.getContext('2d')!, viewport: vp }).promise;
        }
        if (!cancelled) setStatus('ok');
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();
    return () => { cancelled = true; };
  }, [dataUrl]);

  return (
    <div className="max-w-2xl mx-auto py-2">
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
