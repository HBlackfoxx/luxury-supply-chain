/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'luxury-gold': '#D4AF37',
        'luxury-dark': '#8B7500',
        'luxury-cream': '#FFF8DC',
      },
    },
  },
  plugins: [],
}