// Relative-color mapping: full-color var + Tailwind-injectable <alpha-value>.
const c = (v) => `rgb(from var(${v}) r g b / <alpha-value>)`

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  // Includes the generated files the CLI writes (active-component.tsx, App.tsx, lib/, hooks/).
  content: ['./index.html', './src/**/*.{ts,tsx,js,jsx}'],
  theme: {
    extend: {
      // Semantic colors use CSS relative-color syntax: `rgb(from var(--x) r g b / <alpha>)`.
      // This satisfies BOTH constraints at once —
      //   1. the CSS var stays a FULL color, so a component reading `var(--background)`
      //      directly in an arbitrary value (hero-003's radial gradient) gets a real color;
      //   2. Tailwind can still inject alpha, so opacity modifiers like `from-primary/90`
      //      and `ring-border/50` actually render (a plain `var(--x)` map silently drops them).
      colors: {
        border: c('--border'),
        input: c('--input'),
        ring: c('--ring'),
        background: c('--background'),
        foreground: c('--foreground'),
        primary: { DEFAULT: c('--primary'), foreground: c('--primary-foreground') },
        secondary: { DEFAULT: c('--secondary'), foreground: c('--secondary-foreground') },
        muted: { DEFAULT: c('--muted'), foreground: c('--muted-foreground') },
        accent: { DEFAULT: c('--accent'), foreground: c('--accent-foreground') },
        destructive: { DEFAULT: c('--destructive'), foreground: c('--destructive-foreground') },
        card: { DEFAULT: c('--card'), foreground: c('--card-foreground') },
        popover: { DEFAULT: c('--popover'), foreground: c('--popover-foreground') }
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)'
      }
    }
  },
  plugins: []
}
