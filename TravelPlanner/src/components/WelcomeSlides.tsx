import { useRef, useState } from 'react';
import { ChevronRight, Check } from 'lucide-react';
import { Overlay } from './ui';

/**
 * A short, friendly first-run tour. Shown once on a fresh install (gated by
 * the `welcome.seen` flag in App), and replayable any time from Settings.
 * Rendered through a portal so it always covers the full screen.
 */

interface Slide { emoji: string; from: string; to: string; title: string; body: string }

const SLIDES: Slide[] = [
  {
    emoji: '👋', from: '#0ea5e9', to: '#22d3ee',
    title: 'Welcome aboard',
    body: 'Trip Planner keeps your whole trip — and your whole family — beautifully organized in one calm, private place.',
  },
  {
    emoji: '🗓️', from: '#a78bfa', to: '#8b5cf6',
    title: 'Plan every day',
    body: 'Map out your itinerary, flights, trains and stays, and tick off a shared packing checklist as you go.',
  },
  {
    emoji: '💶', from: '#f59e0b', to: '#fb7185',
    title: 'Money, made clear',
    body: 'Track expenses and budgets in both your home and destination currency — no mental math required.',
  },
  {
    emoji: '🔗', from: '#0ea5e9', to: '#6366f1',
    title: 'Everyone, in sync',
    body: 'Share one QR code and family joins in a tap. Prefer a browser? Send a view-only link — no app needed.',
  },
  {
    emoji: '🗂️', from: '#ec4899', to: '#f59e0b',
    title: 'Keep what matters',
    body: 'Save documents, tickets, bills and recipes as photos — stored on your device and shared with the group.',
  },
  {
    emoji: '✨', from: '#34d399', to: '#0ea5e9',
    title: 'You’re all set',
    body: 'Everything stays on your device and works offline. Let’s plan something wonderful together.',
  },
];

export function WelcomeSlides({ onDone }: { onDone: () => void }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [i, setI] = useState(0);
  const last = i >= SLIDES.length - 1;

  function goTo(n: number) {
    const el = trackRef.current;
    if (el) el.scrollTo({ left: n * el.clientWidth, behavior: 'smooth' });
  }
  function onScroll() {
    const el = trackRef.current;
    if (el) setI(Math.round(el.scrollLeft / el.clientWidth));
  }
  function next() { if (last) onDone(); else goTo(i + 1); }

  return (
    <Overlay>
      <div className="fixed inset-0 z-[300] bg-bg text-content flex flex-col animate-fadeIn">
        {/* Skip */}
        <div className="flex justify-end px-5 pad-header-top">
          <button onClick={onDone} className="text-muted text-sm font-semibold px-3 py-1.5 rounded-full active:bg-black/5">
            {last ? '' : 'Skip'}
          </button>
        </div>

        {/* Swipeable track */}
        <div ref={trackRef} onScroll={onScroll}
          className="flex-1 flex overflow-x-auto snap-x snap-mandatory no-scrollbar">
          {SLIDES.map((s, idx) => (
            <section key={idx}
              className="w-full flex-shrink-0 snap-center flex flex-col items-center justify-center px-9 text-center gap-6">
              <div className="w-28 h-28 rounded-[2rem] flex items-center justify-center text-6xl shadow-xl"
                style={{ backgroundImage: `linear-gradient(135deg, ${s.from}, ${s.to})` }}>
                <span className="drop-shadow-sm">{s.emoji}</span>
              </div>
              <h1 className="text-2xl font-extrabold tracking-tight">{s.title}</h1>
              <p className="text-muted leading-relaxed max-w-xs">{s.body}</p>
            </section>
          ))}
        </div>

        {/* Dots + action */}
        <div className="px-6 pb-8 pt-2 safe-bottom">
          <div className="flex justify-center gap-2 mb-6">
            {SLIDES.map((_, idx) => (
              <button key={idx} onClick={() => goTo(idx)} aria-label={`Slide ${idx + 1}`}
                className="h-2 rounded-full transition-all"
                style={{
                  width: idx === i ? 22 : 8,
                  background: idx === i ? 'var(--accent)' : 'var(--border)',
                }} />
            ))}
          </div>
          <button onClick={next}
            className="w-full py-3.5 rounded-2xl font-bold text-white accent-gradient active:scale-[0.98] transition flex items-center justify-center gap-2">
            {last ? <><Check size={18} /> Get started</> : <>Next <ChevronRight size={18} /></>}
          </button>
        </div>
      </div>
    </Overlay>
  );
}
