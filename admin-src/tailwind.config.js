/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#e8531e', light: '#ff6b35', dark: '#c4401a' },
        sidebar: '#111827',
      },
    },
  },
  plugins: [],
}
