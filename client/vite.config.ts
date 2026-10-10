/**
 * Vite config for the FARMVERSE client.
 *
 * In development the client calls the server on its own origin and Vite
 * proxies /api and /ws to the Fastify server. The proxy forwards the
 * browser's Origin header unchanged, so the server's CLIENT_ORIGIN check
 * still applies.
 */
import { defineConfig, loadEnv } from "vite";

/** The root .env is shared by server and client. */
const ENV_DIR = "..";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ENV_DIR, "");
  const serverPort = env["PORT"] || "3000";

  return {
    envDir: ENV_DIR,
    server: {
      host: true,
      port: 5173,
      strictPort: true,
      // GitHub Codespaces forwards ports through *.app.github.dev.
      allowedHosts: [".app.github.dev"],
      proxy: {
        "/api": {
          target: `http://localhost:${serverPort}`,
        },
        "/ws": {
          target: `ws://localhost:${serverPort}`,
          ws: true,
        },
      },
    },
  };
});
