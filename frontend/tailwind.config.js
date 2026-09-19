/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // VoiceShield Security Theme
        'vs-background': '#05070B',
        'vs-card': '#0B1017',
        'vs-primary': '#00E5FF',
        'vs-safe': '#35F28A',
        'vs-warning': '#FFB020',
        'vs-danger': '#FF3B5C',
        'vs-text': '#F5F7FA',
        'vs-muted': '#7B8794',
      },
      fontFamily: {
        'sans': ['Inter', 'system-ui', 'sans-serif'],
        'mono': ['"Space Mono"', 'monospace'],
      },
      spacing: {
        'safe': 'env(safe-area-inset-bottom)',
      },
      padding: {
        'safe': 'env(safe-area-inset-bottom)',
      },
      height: {
        'safe': 'env(safe-area-inset-bottom)',
      },
      backdropBlur: {
        xs: '2px',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'float': 'float 6s ease-in-out infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
        'scan': 'scan 2s linear infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        glow: {
          'from': { filter: 'drop-shadow(0 0 5px currentColor)' },
          'to': { filter: 'drop-shadow(0 0 20px currentColor)' },
        },
        scan: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' },
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
}
