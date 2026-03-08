/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        matrix: {
          green: '#00ff00',
          dark: '#0a0a0a',
          darker: '#000000',
          gray: '#1a1a1a',
          'green-light': '#00cc00',
          'green-dark': '#009900',
          red: '#ff0040',
          yellow: '#ffff00',
          cyan: '#00ffff',
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace']
      },
      animation: {
        'matrix-rain': 'matrix-rain 8s linear infinite',
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'flicker': 'flicker 3s ease-in-out infinite',
        'data-stream': 'data-stream 1.5s ease-in-out infinite',
      },
      boxShadow: {
        'matrix': '0 0 10px #00ff00, 0 0 20px rgba(0, 255, 0, 0.4)',
        'matrix-strong': '0 0 15px #00ff00, 0 0 30px rgba(0, 255, 0, 0.5)',
        'matrix-error': '0 0 10px #ff0040, 0 0 20px rgba(255, 0, 64, 0.4)',
      },
      keyframes: {
        'matrix-rain': {
          '0%': { transform: 'translateY(-100vh)', opacity: '0' },
          '10%': { opacity: '1' },
          '90%': { opacity: '1' },
          '100%': { transform: 'translateY(100vh)', opacity: '0' },
        },
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 10px #00ff00', textShadow: '0 0 5px #00ff00' },
          '50%': { boxShadow: '0 0 20px #00ff00', textShadow: '0 0 10px #00ff00' },
        },
        'flicker': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.8' },
          '75%': { opacity: '0.9' },
        },
        'data-stream': {
          '0%': { transform: 'translateX(-100%)', opacity: '0' },
          '50%': { opacity: '1' },
          '100%': { transform: 'translateX(100%)', opacity: '0' },
        },
      }
    },
  },
  plugins: [],
}