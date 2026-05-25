import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Poppins', 'Inter', 'system-ui', 'sans-serif'],
        display: ['"Barlow Condensed"', 'Oswald', 'Poppins', 'sans-serif'],
      },
      colors: {
        brand: {
          blue: '#0755E9',
          'blue-dark': '#04338C',
          orange: '#EE4200',
          dark: '#1B1B1B',
          feather: '#D2D9D9',
          white: '#FFFFFF',
        },
        'blue-tint': {
          20: 'rgba(7, 85, 233, 0.20)',
          40: 'rgba(7, 85, 233, 0.40)',
          60: 'rgba(7, 85, 233, 0.60)',
          80: 'rgba(7, 85, 233, 0.80)',
        },
        'orange-tint': {
          20: 'rgba(238, 66, 0, 0.20)',
          40: 'rgba(238, 66, 0, 0.40)',
          60: 'rgba(238, 66, 0, 0.60)',
          80: 'rgba(238, 66, 0, 0.80)',
        },
        rag: {
          green: '#1D9E75',
          amber: '#EE4200',
          red: '#C8002A',
        },
        surface: {
          DEFAULT: '#FFFFFF',
          secondary: '#F4F6FA',
          tertiary: '#EDF0F4',
          border: '#D2D9D9',
          'border-strong': '#B0B8C4',
        },
        ink: {
          DEFAULT: '#1B1B1B',
          secondary: '#5C6468',
          tertiary: '#8E9AA4',
          inverse: '#FFFFFF',
        },
      },
      borderRadius: {
        DEFAULT: '8px',
        sm: '4px',
        md: '8px',
        lg: '12px',
        xl: '16px',
        '2xl': '20px',
        full: '9999px',
      },
      boxShadow: {
        card: '0 1px 3px rgba(27,27,27,0.08)',
        panel: '0 4px 24px rgba(27,27,27,0.12)',
        ai: '0 26px 70px rgba(27,27,27,0.18)',
      },
      animation: {
        'fade-in': 'fadeIn 200ms ease-out',
        'slide-up': 'slideUp 240ms ease-out',
        'scale-in': 'scaleIn 180ms ease-out',
        'count-up': 'countUp 600ms ease-out',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
        'stagger-1': 'fadeIn 200ms ease-out 60ms both',
        'stagger-2': 'fadeIn 200ms ease-out 120ms both',
        'stagger-3': 'fadeIn 200ms ease-out 180ms both',
        'stagger-4': 'fadeIn 200ms ease-out 240ms both',
      },
      keyframes: {
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp: { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        scaleIn: { from: { opacity: '0', transform: 'scale(0.96)' }, to: { opacity: '1', transform: 'scale(1)' } },
        countUp: { from: { opacity: '0', transform: 'translateY(4px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        pulseSoft: { '0%,100%': { opacity: '0.6' }, '50%': { opacity: '1' } },
      },
    },
  },
  plugins: [],
}

export default config
