import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1f2933",
        paper: "#fbfaf7",
        line: "#d7d3ca",
        moss: "#50624f",
        coral: "#c76552",
        skysoft: "#dbeafe"
      },
      boxShadow: {
        soft: "0 18px 45px rgba(31, 41, 51, 0.10)"
      }
    },
  },
  plugins: [],
};

export default config;
