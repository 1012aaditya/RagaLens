/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        ink: '#07070c',
        panel: 'rgba(14,14,24,0.72)',
        gold: '#f0c060',
        viol: '#a06cf0',
        crack: '#f05050',
      },
    },
  },
  plugins: [],
};
