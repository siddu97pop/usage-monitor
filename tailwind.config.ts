import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Base dark surfaces
        surface: {
          base: '#0a0a0f',
          card: '#111118',
          elevated: '#16161f',
          border: '#1e1e2e',
          muted: '#2a2a3a',
        },
        // Provider accent colors
        codex: {
          DEFAULT: '#10B981',
          dim: '#10B98120',
          muted: '#10B98140',
        },
        claude: {
          DEFAULT: '#A78BFA',
          dim: '#A78BFA20',
          muted: '#A78BFA40',
        },
        ollama: {
          DEFAULT: '#60A5FA',
          dim: '#60A5FA20',
          muted: '#60A5FA40',
        },
        // Text hierarchy
        ink: {
          primary: '#F1F5F9',
          secondary: '#94A3B8',
          muted: '#475569',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'card-shine':
          'linear-gradient(135deg, rgba(255,255,255,0.03) 0%, transparent 50%)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'spin-slow': 'spin 2s linear infinite',
      },
    },
  },
  plugins: [],
};

export default config;
