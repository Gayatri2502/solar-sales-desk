import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";
import { localPreviewDatabase } from "./server/local-preview";
export default defineConfig({
  plugins: [react(), tailwindcss(), localPreviewDatabase()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { include: ["tests/unit/**/*.test.{ts,tsx}"] },
  server: { host: "127.0.0.1", port: 5173, watch:{usePolling:true,interval:300} },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/@firebase")) return "firebase-auth";
          if (id.includes("node_modules/@supabase")) return "supabase";
          if (id.includes("node_modules/zod")) return "validation";
          if (
            id.includes("node_modules/radix") ||
            id.includes("node_modules/@radix-ui")
          )
            return "ui-primitives";
        },
      },
    },
  },
});
