/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#e67e22', dark: '#cf711f', deep: '#b8621a' },
        ink: '#3d3429',
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