import { useEffect, useState } from 'react';

/**
 * Live weather for the trip's destination — Open-Meteo (free, no API key).
 * Geocodes the location, fetches current conditions + a 3-day forecast, and
 * caches for an hour. Silently hides if offline or the place isn't found.
 */

interface Day { date: string; code: number; max: number; min: number }
interface WX { city: string; temp: number; code: number; days: Day[] }

function wmo(code: number): { emoji: string; label: string; tint: string } {
  if (code === 0) return { emoji: '☀️', label: 'Clear', tint: '#f59e0b' };
  if (code <= 2) return { emoji: '🌤️', label: 'Partly cloudy', tint: '#38bdf8' };
  if (code === 3) return { emoji: '☁️', label: 'Overcast', tint: '#94a3b8' };
  if (code <= 48) return { emoji: '🌫️', label: 'Fog', tint: '#94a3b8' };
  if (code <= 57) return { emoji: '🌦️', label: 'Drizzle', tint: '#38bdf8' };
  if (code <= 67) return { emoji: '🌧️', label: 'Rain', tint: '#0ea5e9' };
  if (code <= 77) return { emoji: '🌨️', label: 'Snow', tint: '#a5b4fc' };
  if (code <= 82) return { emoji: '🌦️', label: 'Showers', tint: '#0ea5e9' };
  if (code <= 86) return { emoji: '🌨️', label: 'Snow showers', tint: '#a5b4fc' };
  return { emoji: '⛈️', label: 'Thunderstorm', tint: '#6366f1' };
}

async function fetchWeather(location: string): Promise<WX | null> {
  const key = 'wx:' + location.toLowerCase().trim();
  const cached = localStorage.getItem(key);
  if (cached) {
    try { const { at, data } = JSON.parse(cached); if (Date.now() - at < 3_600_000) return data; } catch { /* ignore */ }
  }
  try {
    const g = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1`).then(r => r.json());
    const loc = g.results?.[0];
    if (!loc) return null;
    const f = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}` +
      `&current=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min` +
      `&forecast_days=3&temperature_unit=fahrenheit&timezone=auto`,
    ).then(r => r.json());
    const data: WX = {
      city: loc.name,
      temp: Math.round(f.current.temperature_2m),
      code: f.current.weather_code,
      days: (f.daily.time as string[]).map((t, i) => ({
        date: t, code: f.daily.weather_code[i],
        max: Math.round(f.daily.temperature_2m_max[i]), min: Math.round(f.daily.temperature_2m_min[i]),
      })),
    };
    localStorage.setItem(key, JSON.stringify({ at: Date.now(), data }));
    return data;
  } catch { return null; }
}

export function WeatherWidget({ location }: { location: string }) {
  const [wx, setWx] = useState<WX | null>(null);
  const [state, setState] = useState<'loading' | 'done' | 'fail'>('loading');

  useEffect(() => {
    let alive = true;
    if (!location) { setState('fail'); return; }
    setState('loading');
    fetchWeather(location).then(d => {
      if (!alive) return;
      if (d) { setWx(d); setState('done'); } else setState('fail');
    });
    return () => { alive = false; };
  }, [location]);

  if (state === 'fail') return null;
  if (state === 'loading') return <div className="h-24 rounded-3xl skeleton" />;
  if (!wx) return null;

  const now = wmo(wx.code);
  return (
    <div className="rounded-3xl p-4 shadow-soft border border-line overflow-hidden relative bg-surface animate-fadeIn">
      <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full opacity-20 blur-2xl" style={{ background: now.tint }} />
      <div className="flex items-center justify-between relative">
        <div className="flex items-center gap-3">
          <span className="text-4xl animate-float">{now.emoji}</span>
          <div>
            <p className="text-3xl font-extrabold text-content leading-none">{wx.temp}°</p>
            <p className="text-xs text-muted font-medium">{now.label} · {wx.city}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {wx.days.map((d, i) => {
            const w = wmo(d.code);
            const dow = i === 0 ? 'Today' : new Date(d.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' });
            return (
              <div key={d.date} className="text-center px-1.5">
                <p className="text-[10px] text-muted font-semibold">{dow}</p>
                <p className="text-lg leading-tight">{w.emoji}</p>
                <p className="text-[11px] font-bold text-content leading-none">{d.max}°</p>
                <p className="text-[10px] text-muted leading-tight">{d.min}°</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
