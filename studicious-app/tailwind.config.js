/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./public/**/*.html",
  ],
  theme: {
    extend: {},
  },
  plugins: [require('@tailwindcss/forms'), require('@tailwindcss/typography')],
} 