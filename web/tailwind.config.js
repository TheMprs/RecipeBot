import defaultTheme from 'tailwindcss/defaultTheme'

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // Heebo carries Hebrew glyphs only (see ui.css unicode-range); Latin uses the system stack
      fontFamily: {
        sans: ['Heebo', ...defaultTheme.fontFamily.sans],
      },
      colors: {
        brand: { DEFAULT: '#e67e22', dark: '#cf711f', deep: '#b8621a' },
        ink: '#3d3429',
        espresso: { DEFAULT: '#4a4136', dark: '#322b22' },
        muted: { DEFAULT: '#7a7265', dark: '#5a5248' },
        faint: '#a39b8d',
        fainter: '#cbc5ba',
        border: { DEFAULT: '#e8e4dc', dark: '#ddd9d0' },
        cream: { DEFAULT: '#faf9f7', dark: '#f5f3ef' },
      },
    },
  },
  plugins: [],
}