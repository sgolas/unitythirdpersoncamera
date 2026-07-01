/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Legacy fixed palette (kept for accents that read well on any theme)
        ink:    '#0f172a',
        slateink: '#1e293b',
        dusk:   '#334155',
        sky:    '#38bdf8',
        sunset: '#fb7185',
        amber:  '#f59e0b',
        mint:   '#34d399',
        grape:  '#a78bfa',

        // Semantic, theme-aware tokens (light & dark via CSS variables)
        bg:       'var(--bg)',
        surface:  'var(--surface)',
        surface2: 'var(--surface-2)',
        line:     'var(--border)',
        content:  'var(--text)',
        muted:    'var(--muted)',
        accent:   'var(--accent)',
        accent2:  'var(--accent-2)',
      },
      fontFamily: {
        sans: ['Manrope', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        glass: '0 8px 32px rgba(15, 23, 42, 0.12)',
        soft:  '0 2px 12px rgba(15, 23, 42, 0.06)',
      },
    },
  },
  plugins: [],
};
