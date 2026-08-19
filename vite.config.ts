import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Auto-detect deployment platform
const preset = process.env.NETLIFY ? "netlify" : "vercel";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts
    server: { entry: "server" },
  },
  nitro: {
    preset,
  },
});
