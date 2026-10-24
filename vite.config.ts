import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  // Pre-bundle up front: discovering these on the first page load makes Vite reload the page mid-session.
  optimizeDeps: { include: ["lucide-react", "cmdk", "react", "react-dom/client", "@codemirror/view", "@codemirror/state", "@codemirror/commands", "@codemirror/search", "@codemirror/language", "@tauri-apps/api/core", "@tauri-apps/api/window", "@tauri-apps/plugin-dialog", "@tauri-apps/plugin-opener"] },
  // Rust build output and the Tauri crate are huge and irrelevant to the frontend; watching them breaks HMR.
  server: { watch: { ignored: ["**/target/**", "**/src-tauri/**", "**/crates/**", "**/test-results/**", "**/artifacts/**"] } },
  test: { include: ["src/**/*.test.{ts,tsx}"] },
});
