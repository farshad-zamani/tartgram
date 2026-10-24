/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Warm editorial "control room" palette
        ink: {
          950: "#16120D",
          900: "#1E1912",
          850: "#26201A",
          800: "#2F2820",
          700: "#3D342A",
          600: "#4E4336",
        },
        cream: {
          50: "#F7F1E7",
          100: "#EFE7D9",
          300: "#CBBEAB",
          500: "#A8998473",
        },
        sand: "#A8988A",
        coral: {
          400: "#FF8A5B",
          500: "#FF6A3D",
          600: "#EE5327",
        },
        amber: {
          400: "#F5C445",
          500: "#EDB012",
        },
        moss: "#67C08A",
      },
      fontFamily: {
        sans: ["Vazirmatn", "system-ui", "Segoe UI", "Tahoma", "sans-serif"],
      },
      boxShadow: {
        panel:
          "0 1px 0 0 rgba(255,255,255,0.04) inset, 0 24px 60px -30px rgba(0,0,0,0.7)",
        glow: "0 0 0 1px rgba(255,106,61,0.25), 0 18px 50px -18px rgba(255,106,61,0.35)",
      },
      borderRadius: {
        "2xl": "1.1rem",
        "3xl": "1.5rem",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.5s cubic-bezier(0.22,1,0.36,1) both",
      },
    },
  },
  plugins: [],
};
