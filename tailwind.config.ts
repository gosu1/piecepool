import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#172033",
        mist: "#F5F7FA",
        line: "#E6EAF0",
        pool: "#2F7C8A",
        coral: "#E97055",
        leaf: "#4C956C",
        amber: "#D79331"
      },
      boxShadow: {
        soft: "0 18px 45px rgba(23, 32, 51, 0.08)",
        card: "0 8px 24px rgba(23, 32, 51, 0.06)"
      }
    }
  },
  plugins: []
};

export default config;
