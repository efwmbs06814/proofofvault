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
        matrix: {
          DEFAULT: '#ffffff',
          green: '#ffffff',
          dim: '#e0e0e0',
          dark: '#999999',
          black: '#000000',
          glow: 'rgba(255, 255, 255, 0.5)',
        },
        primary: {
          DEFAULT: '#ffffff',
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#ffffff',
          600: '#e0e0e0',
          700: '#cccccc',
          800: '#999999',
          900: '#666666',
        },
        vault: {
          gold: '#ffffff',
          silver: '#C0C0C0',
          bronze: '#CD7F32',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
        display: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
      boxShadow: {
        'matrix': '0 0 10px rgba(255, 255, 255, 0.3), 0 0 20px rgba(255, 255, 255, 0.2)',
        'matrix-lg': '0 0 15px rgba(255, 255, 255, 0.4), 0 0 30px rgba(255, 255, 255, 0.3), 0 0 45px rgba(255, 255, 255, 0.1)',
        'matrix-sm': '0 0 5px rgba(255, 255, 255, 0.3)',
      },
    },
  },
  plugins: [],
};
