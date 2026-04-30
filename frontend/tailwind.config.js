/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        aws: {
          orange: '#FF9900',
          'orange-dark': '#e88b00',
          'orange-light': '#ffad33',
        },
        cloud: {
          nav:     '#0f1923',
          sidebar: '#161d27',
          main:    '#0d1117',
          card:    '#1a2332',
          border:  '#2d3748',
          hover:   '#1f2d3d',
          input:   '#0d1b2a',
          muted:   '#374151',
        },
      },
      fontFamily: {
        sans: ['Amazon Ember', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      animation: {
        'slide-in-right': 'slideInRight 0.25s ease-out',
        'slide-up': 'slideUp 0.2s ease-out',
        'fade-in': 'fadeIn 0.15s ease-out',
        'skeleton': 'skeleton 1.5s ease-in-out infinite',
      },
      keyframes: {
        slideInRight: { from: { transform: 'translateX(100%)' }, to: { transform: 'translateX(0)' } },
        slideUp: { from: { transform: 'translateY(8px)', opacity: 0 }, to: { transform: 'translateY(0)', opacity: 1 } },
        fadeIn: { from: { opacity: 0 }, to: { opacity: 1 } },
        skeleton: { '0%,100%': { opacity: 0.4 }, '50%': { opacity: 0.8 } },
      },
    },
  },
  plugins: [],
};
