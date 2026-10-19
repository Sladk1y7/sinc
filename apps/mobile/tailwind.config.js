/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './design-system/**/*.{js,jsx,ts,tsx}',
    './features/**/*.{js,jsx,ts,tsx}',
    './players/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        bg: '#0B0B12',
        surface: '#15151F',
        card: '#1B1B27',
        accent: '#FF7A59',
        violet: '#8B5CF6',
        ink: '#F5F3FF',
        muted: '#9CA3AF',
        success: '#34D399',
        warning: '#FBBF24',
        danger: '#F87171',
      },
    },
  },
  plugins: [],
};
