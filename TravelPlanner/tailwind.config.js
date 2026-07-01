/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Trip Planner palette — deep "night flight" navy + warm sunset accents
        ink:    '#0f172a', // primary dark
        slateink: '#1e293b',
        dusk:   '#334155',
        sky:    '#38bdf8', // primary accent (transport / links)
        sunset: '#fb7185', // warm accent (highlights)
        amber:  '#f59e0b', // budget / money
        mint:   '#34d399', // done / positive
        grape:  '#a78bfa', // itinerary / activities
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
