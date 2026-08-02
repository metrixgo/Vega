import type { Config } from "tailwindcss";
export default { content: ["./app/**/*.{js,ts,jsx,tsx}"], theme: { extend: { colors: { ink: "#17202c", mist: "#f6f8fa", accent: "#2563eb" }, boxShadow: { card: "0 8px 30px rgba(20, 34, 52, .07)" } } }, plugins: [] } satisfies Config;
