import { useState, useRef, useEffect, useCallback } from 'react';
import { MapPin, Navigation, Loader, X } from 'lucide-react';

interface Suggestion {
  display_name: string;
  lat: string;
  lon: string;
}

interface Props {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
}

export function LocationInput({ value, onChange, placeholder = 'Search for a place…' }: Props) {
  const [query,       setQuery]       = useState(value);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showDrop,    setShowDrop]    = useState(false);
  const [locating,    setLocating]    = useState(false);
  const [searching,   setSearching]   = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync external value changes (e.g. when editing an existing record)
  useEffect(() => { setQuery(value); }, [value]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDrop(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 3) { setSuggestions([]); setShowDrop(false); return; }
    setSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5&addressdetails=1`,
        { headers: { 'Accept-Language': 'en' } }
      );
      const data: Suggestion[] = await res.json();
      setSuggestions(data);
      setShowDrop(data.length > 0);
    } catch {
      setSuggestions([]);
    } finally {
      setSearching(false);
    }
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value;
    setQuery(q);
    onChange(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(q), 400);
  }

  function selectSuggestion(s: Suggestion) {
    // Use a short, clean version: "Name, City, Country"
    const parts = s.display_name.split(', ');
    const clean = parts.slice(0, Math.min(3, parts.length)).join(', ');
    setQuery(clean);
    onChange(clean);
    setSuggestions([]);
    setShowDrop(false);
  }

  async function useCurrentLocation() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async pos => {
        try {
          const { latitude: lat, longitude: lon } = pos.coords;
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`,
            { headers: { 'Accept-Language': 'en' } }
          );
          const data = await res.json();
          const name = data.name || data.display_name?.split(', ').slice(0, 3).join(', ') || `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
          setQuery(name);
          onChange(name);
        } catch {
          // fallback to raw coords
          const { latitude: lat, longitude: lon } = pos.coords;
          const coords = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
          setQuery(coords); onChange(coords);
        } finally {
          setLocating(false);
        }
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  function openInMaps() {
    if (!query.trim()) return;
    window.open(`https://www.google.com/maps/search/${encodeURIComponent(query)}`, '_blank');
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center border border-slate-200 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-ocean/30 focus-within:border-ocean transition-all bg-white">
        <MapPin size={16} className="ml-3 text-slate-400 flex-shrink-0" />
        <input
          value={query}
          onChange={handleChange}
          onFocus={() => suggestions.length > 0 && setShowDrop(true)}
          placeholder={placeholder}
          className="flex-1 px-3 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none bg-transparent"
        />
        <div className="flex items-center gap-1 pr-2">
          {searching && <Loader size={14} className="text-slate-400 animate-spin" />}
          {query && !searching && (
            <button
              type="button"
              onClick={() => { setQuery(''); onChange(''); setSuggestions([]); setShowDrop(false); }}
              className="p-1 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X size={14} />
            </button>
          )}
          <button
            type="button"
            onClick={useCurrentLocation}
            disabled={locating}
            title="Use current location"
            className="p-1.5 rounded-lg text-slate-400 hover:text-ocean hover:bg-blue-50 transition-colors disabled:opacity-50"
          >
            {locating ? <Loader size={14} className="animate-spin" /> : <Navigation size={14} />}
          </button>
        </div>
      </div>

      {/* Suggestions dropdown */}
      {showDrop && suggestions.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
          {suggestions.map((s, i) => {
            const parts = s.display_name.split(', ');
            const primary   = parts[0];
            const secondary = parts.slice(1, 3).join(', ');
            return (
              <button
                key={i}
                type="button"
                onClick={() => selectSuggestion(s)}
                className="w-full flex items-start gap-2.5 px-3 py-2.5 hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0 text-left"
              >
                <MapPin size={14} className="text-ocean mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-slate-800 leading-tight">{primary}</p>
                  {secondary && <p className="text-xs text-slate-400 mt-0.5">{secondary}</p>}
                </div>
              </button>
            );
          })}
          {/* Open in Google Maps */}
          <button
            type="button"
            onClick={openInMaps}
            className="w-full flex items-center gap-2 px-3 py-2 bg-slate-50 text-xs text-slate-500 hover:text-ocean hover:bg-blue-50 transition-colors"
          >
            <MapPin size={12} className="text-ocean" />
            Search "{query}" in Google Maps ↗
          </button>
        </div>
      )}
    </div>
  );
}
