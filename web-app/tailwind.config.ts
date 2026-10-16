import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // "Payment Evidence File" tokens (hex values mirror the CSS variables in globals.css; hex, not var(), so Tailwind opacity modifiers like /60 work).
        paper: { DEFAULT: '#F2EDE3', deep: '#E5DDCF' },
        ink: { DEFAULT: '#101A2B', soft: '#334155' },
        line: '#C8BFAF',
        signal: { DEFAULT: '#3F5BFF', soft: '#DDE2FF' },
        go: { DEFAULT: '#147D5A', soft: '#D8F0E6' },
        stop: { DEFAULT: '#BE3D3D', soft: '#F5DEDA' },
        review: { DEFAULT: '#9A6700', soft: '#F7EDCF' },
        sheet: '#FFFDF8',
        // Aliases used by the base layer.
        border: '#C8BFAF',
        background: '#F2EDE3',
        foreground: '#101A2B',
        primary: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
          950: '#082f49',
        },
        secondary: {
          50: '#faf5ff',
          100: '#f3e8ff',
          200: '#e9d5ff',
          300: '#d8b4fe',
          400: '#c084fc',
          500: '#a855f7',
          600: '#9333ea',
          700: '#7e22ce',
          800: '#6b21a8',
          900: '#581c87',
          950: '#3b0764',
        },
      },
      fontFamily: {
        sans: ['var(--font-body)', 'system-ui', 'sans-serif'],
        body: ['var(--font-body)', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'Georgia', 'serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      boxShadow: { sheet: '6px 6px 0 rgba(16, 26, 43, 0.10)' },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-in-out',
        'slide-up': 'slideUp 0.5s ease-out',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
    },
  },
  darkMode: 'class',
  plugins: [],
};

export default config;
