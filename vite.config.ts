import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  // Rust build output and the Tauri crate are huge and irrelevant to the frontend; watching them breaks HMR.
  server: { watch: { ignored: ["**/target/**", "**/src-tauri/**", "**/crates/**", "**/test-results/**", "**/artifacts/**"] } },
  test: { include: ["src/**/*.test.{ts,tsx}"] },
});
