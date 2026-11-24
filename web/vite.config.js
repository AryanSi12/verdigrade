import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Where the agent server listens. Override with LEAPFROG_AGENT_URL (legacy: JAVA_MIGRATOR_AGENT_URL), e.g. another port.
const agentUrl = (process.env.LEAPFROG_AGENT_URL || process.env.JAVA_MIGRATOR_AGENT_URL || "http://127.0.0.1:3000").replace(/\/$/, "");

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __AGENT_URL__: JSON.stringify(agentUrl),
  },
  server: {
    port: 5173,
    proxy: {
      "/v1": {
        target: agentUrl,
        rewrite: (requestPath) => `/agent${requestPath}`,
        timeout: 0,
        proxyTimeout: 0,
      },
    },
  },
});
