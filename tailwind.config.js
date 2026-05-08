/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './emails/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // DMV Throwers Design System — VSYC-26 palette
        // Source: C:\GIT\DMV Throwers Design System\colors_and_type.css
        navy:          '#1a2744',  // --color-navy-alt (VSYC primary surface)
        'navy-deep':   '#08122a',  // --color-navy-deep (darkest bg)
        'navy-border': '#2a3a5a',
        gold:          '#C9A84C',
        'gold-light':  '#e8c97a',
        red:           '#B80000',  // canonical brand red (corrected from legacy #C8102E)
        'red-dark':    '#7a0000',
        cream:         '#f5f0e8',
        'cream-mid':   '#ede8dc',
        'text-body':   '#c8d0e0',
        'text-muted':  '#8090b8',
      },
      fontFamily: {
        // Canonical three-font stack from design system
        display:    ['Playfair Display', 'Georgia', 'serif'],
        sans:       ['DM Sans', 'system-ui', '-apple-system', 'sans-serif'],
        condensed:  ['Barlow Condensed', 'system-ui', 'sans-serif'],
        // 'montserrat' kept as alias for any legacy inline references
        montserrat: ['DM Sans', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '0',
        none:    '0',
        sm:      '0',
        md:      '0',
        lg:      '0',
        xl:      '0',
        full:    '9999px',
      },
      boxShadow: {
        none:    'none',
        DEFAULT: 'none',
        sm:      'none',
        md:      'none',
        lg:      'none',
      },
      letterSpacing: {
        caps:        '0.12em',
        'caps-tight':'0.10em',
        wider:       '0.16em',
        widest:      '0.20em',
      },
    },
  },
  plugins: [],
};
