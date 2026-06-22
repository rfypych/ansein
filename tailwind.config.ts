import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

const config: Config = {
    darkMode: "class",
    content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
  	extend: {
  		colors: {
  			background: 'var()',
  			foreground: 'var()',
  			card: {
  				DEFAULT: 'var()',
  				foreground: 'var()'
  			},
  			popover: {
  				DEFAULT: 'var()',
  				foreground: 'var()'
  			},
  			primary: {
  				DEFAULT: 'var()',
  				foreground: 'var()'
  			},
  			secondary: {
  				DEFAULT: 'var()',
  				foreground: 'var()'
  			},
  			muted: {
  				DEFAULT: 'var()',
  				foreground: 'var()'
  			},
  			accent: {
  				DEFAULT: 'var()',
  				foreground: 'var()'
  			},
  			destructive: {
  				DEFAULT: 'var()',
  				foreground: 'var()'
  			},
  			border: 'var()',
  			input: 'var()',
  			ring: 'var()',
  			chart: {
  				'1': 'var()',
  				'2': 'var()',
  				'3': 'var()',
  				'4': 'var()',
  				'5': 'var()'
  			}
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
        fontFamily: {
            sans: ['var(--font-courier)', 'monospace'],
            mono: ['var(--font-courier)', 'monospace'],
            serif: ['var(--font-sigurd)', 'ui-serif', 'Georgia', 'Cambria', '"Times New Roman"', 'Times', 'serif'],
        }
  	}
  },
  plugins: [tailwindcssAnimate],
};
export default config;
