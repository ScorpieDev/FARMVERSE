/**
 * Vite config for the FARMVERSE client.
 *
 * In development the client calls the server on its own origin and Vite
 * proxies /api and /ws to the Fastify server. The proxy forwards the Origin
 * header unchanged, so the server's Origin check still applies. (In
 * Codespaces the port forwarding has already rewritten a same-origin Origin
 * to https://localhost:5173; see .env.example.)
 */
import { defineConfig, loadEnv } from "vite";

/** The root .env is shared by server and client. */
const ENV_DIR = "..";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ENV_DIR, "");
  const serverPort = env["PORT"] || "3000";
  const isCodespaces = env["CODESPACES"] === "true" && mode !== "production";
  const codespaceName = env["CODESPACE_NAME"];
  const forwardingDomain = env["GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN"];
  const codespacesClientHost =
    isCodespaces && codespaceName && forwardingDomain
      ? `${codespaceName}-5173.${forwardingDomain}`
      : undefined;

  if (isCodespaces && !codespacesClientHost) {
    throw new Error(
      "Codespaces requires CODESPACE_NAME and GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN",
    );
  }

  return {
    envDir: ENV_DIR,
    server: {
      host: true,
      port: 5173,
      strictPort: true,
      // Avoid allowing forwarded hostnames from other Codespaces.
      allowedHosts: codespacesClientHost ? [codespacesClientHost] : [],
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
