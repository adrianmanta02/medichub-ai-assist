import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import fs from "fs";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // HTTPS configuration for development
  const httpsConfig = mode === "development" ? {
    // Try to use local certificates if available, otherwise use insecure
    // For production, use proper certificates
    key: fs.existsSync("./localhost-key.pem") ? fs.readFileSync("./localhost-key.pem") : undefined,
    cert: fs.existsSync("./localhost.pem") ? fs.readFileSync("./localhost.pem") : undefined,
  } : undefined;

  return {
    server: {
      host: "::",
      port: 5173,
      https: httpsConfig?.key && httpsConfig?.cert ? httpsConfig : false,
      // Allow both HTTP and HTTPS - if HTTPS fails, fallback to HTTP
    },
    plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
