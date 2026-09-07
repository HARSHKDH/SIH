import type { Config } from 'tailwindcss';

/**
 * Design system for the Legal Metrology Compliance Checker.
 *
 * This is enforcement software for government officials, so the palette is
 * deliberately restrained: deep slate blue for brand/action, warm off-white
 * surfaces, and *muted* semantic colours. No neon, no gradients as primary
 * surfaces, no SaaS purple/pink.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        // Brand / action
        brand: {
          DEFAULT: '#1E3A5F', // deep slate blue — buttons, active nav, sidebar
          hover: '#2C5282', // hover / accent
          muted: '#EDF1F7', // faint brand tint for selected rows, soft badges
          contrast: '#FFFFFF',
        },

        // Surfaces
        canvas: '#F7F8FA', // page background (never pure white for large surfaces)
        surface: '#FFFFFF', // cards sitting on the canvas
        'surface-muted': '#FBFCFD', // table headers, inset panels

        // Text
        ink: {
          DEFAULT: '#1A202C', // primary text (near-black, not pure black)
          secondary: '#4A5568',
          muted: '#718096',
          inverse: '#FFFFFF',
        },

        // Lines
        line: {
          DEFAULT: '#E2E8F0',
          strong: '#CBD5E0',
        },

        // Semantic — compliance outcomes. All intentionally desaturated.
        compliant: {
          DEFAULT: '#2F6E4E', // muted forest green
          soft: '#EAF2ED',
          border: '#C3DACB',
        },
        moderate: {
          DEFAULT: '#B7791F', // muted amber
          soft: '#FAF3E6',
          border: '#EBD9B4',
        },
        critical: {
          DEFAULT: '#9B2C2C', // muted brick red
          soft: '#F7EBEB',
          border: '#E6C6C6',
        },
        neutralBadge: {
          DEFAULT: '#718096', // slate gray for info/neutral badges
          soft: '#F1F3F6',
          border: '#DDE2E9',
        },
      },

      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },

      fontSize: {
        // Tight, deliberate scale. Dashboards never exceed `stat` + `h1`.
        micro: ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.04em' }],
        label: ['0.75rem', { lineHeight: '1.125rem', letterSpacing: '0.02em' }],
        body: ['0.875rem', { lineHeight: '1.375rem' }],
        'body-lg': ['0.9375rem', { lineHeight: '1.5rem' }],
        h3: ['1rem', { lineHeight: '1.5rem' }],
        h2: ['1.125rem', { lineHeight: '1.625rem' }],
        h1: ['1.375rem', { lineHeight: '1.875rem' }],
        stat: ['1.75rem', { lineHeight: '2.125rem', letterSpacing: '-0.01em' }],
      },

      borderRadius: {
        card: '6px',
        control: '5px',
        pill: '9999px',
      },

      boxShadow: {
        // Barely-there elevation. Depth comes from borders, not drop shadows.
        card: '0 1px 2px 0 rgba(26, 32, 44, 0.04), 0 1px 3px 0 rgba(26, 32, 44, 0.03)',
        raised: '0 2px 6px -1px rgba(26, 32, 44, 0.08), 0 1px 3px -1px rgba(26, 32, 44, 0.05)',
        overlay: '0 8px 24px -6px rgba(26, 32, 44, 0.18)',
        'focus-ring': '0 0 0 3px rgba(44, 82, 130, 0.28)',
      },

      spacing: {
        sidebar: '15rem',
        topbar: '3.5rem',
      },

      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(2px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.45' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 160ms ease-out',
        'pulse-soft': 'pulse-soft 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
