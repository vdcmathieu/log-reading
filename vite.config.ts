import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Pure client-side SPA: no server runtime, deployable as a static site.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    // The cleaner + parity tests run in Node (they read fixtures from disk).
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
