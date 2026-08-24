/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}', './components/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0a0e14',
        panel: '#11161e',
        panel2: '#161c26',
        border: '#222a35',
        text: '#e6edf3',
        muted: '#8b949e',
        accent: '#58a6ff',
        green: '#3fb950',
        red: '#f85149',
        yellow: '#d29922'
      }
    }
  },
  plugins: []
};
