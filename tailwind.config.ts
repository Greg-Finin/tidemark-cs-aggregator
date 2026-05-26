import type { Config } from "tailwindcss";

// Tidemark brand tokens — sage cream + deep forest + emerald accent.
// `navy` is kept as a token name for compatibility with code structure, but
// it actually resolves to a deep forest green now.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#f5f7f2",
        panel: "#ffffff",
        subtle: "#e8ece2",
        border: "#d1d8c8",
        text: "#1f2a23",
        muted: "#6b756c",
        navy: "#2d4a3a",
        accent: "#16a34a",
      },
      maxWidth: {
        "screen-2xl": "1400px",
      },
    },
  },
  plugins: [],
};

export default config;
