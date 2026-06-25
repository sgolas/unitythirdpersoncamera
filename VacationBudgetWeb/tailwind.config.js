/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ocean: { DEFAULT: '#0077B6', light: '#00B4D8', dark: '#005F8A' },
        coral: '#FF6B35',
        vteal: { DEFAULT: '#2EC4B6', dark: '#00858A' },
      },
    },
  },
  plugins: [],
};
