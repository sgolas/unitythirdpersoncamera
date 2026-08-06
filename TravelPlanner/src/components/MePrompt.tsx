/**
 * First-run nudge: ask which traveller is using this device, so anything they
 * add gets tagged (and colour-coded) as theirs. Shows once — until they pick a
 * person or tap "Not now" — and never again after that on this device.
 */
import { useState } from 'react';
import { Check } from 'lucide-react';
import { useTravelers, travelerColor } from '../hooks/useTrip';
import { setMyTravelerId } from '../db/database';
import { Sheet } from './ui';
import { Avatar, useMyTravelerId } from './TravelersManager';

const DISMISS_KEY = 'trip.mePromptDismissed';

export function MePrompt() {
  const travelers = useTravelers();
  const meId = useMyTravelerId();
  const [dismissed, setDismissed] = useState(() => !!localStorage.getItem(DISMISS_KEY));

  // Only nudge when there are people, nobody is chosen yet, and we haven't asked.
  if (meId || dismissed || travelers.length === 0) return null;

  function skip() { localStorage.setItem(DISMISS_KEY, '1'); setDismissed(true); }
  function pick(id: string) { setMyTravelerId(id); }

  return (
    <Sheet title="Which traveller are you?" onClose={skip}
      footer={
        <button onClick={skip}
          className="w-full py-3 rounded-2xl font-semibold text-slate-500 bg-slate-100 active:bg-slate-200 transition">
          Not now
        </button>
      }>
      <p className="text-sm text-slate-500 -mt-1 mb-3">
        Pick yourself so anything you add on this device is tagged in your colour. You can change this any time under Travellers.
      </p>
      <div className="space-y-2">
        {travelers.map(t => {
          const color = travelerColor(travelers, t.id);
          return (
            <button key={t.id} onClick={() => pick(t.id)}
              className="w-full flex items-center gap-3 rounded-2xl bg-slate-50 px-3 py-3 active:bg-slate-100 transition text-left">
              <Avatar traveler={t} ring={color} />
              <span className="flex-1 min-w-0 font-semibold truncate" style={{ color }}>{t.name}</span>
              <span className="w-8 h-8 rounded-full flex items-center justify-center text-white" style={{ background: color }}>
                <Check size={16} />
              </span>
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}
