/**
 * Vite config for the FARMVERSE client.
 *
 * In development the client calls the server on its own origin and Vite
 * proxies /api and /ws to the Fastify server. The proxy forwards the Origin
 * header unchanged, so the server's Origin check still applies. (In
 * Codespaces the port forwarding has already rewritten a same-origin Origin
 * to https://localhost:5173; see .env.example.)
 *
 * In Codespaces each server accepts only this workspace's exact forwarded
 * hostname: port 5173 for `vite` (development) and port 4173 for
 * `vite preview` (the production build). `vite build` is not affected.
 */
import { defineConfig, loadEnv } from "vite";

/** The root .env is shared by server and client. */
const ENV_DIR = "..";

/** Dev server port and preview server port (both strict, so the forwarded hostnames match). */
const DEV_PORT = 5173;
const PREVIEW_PORT = 4173;

export default defineConfig(({ mode, isPreview }) => {
  const env = loadEnv(mode, ENV_DIR, "");
  const serverPort = env["PORT"] || "3000";
  const inCodespaces = env["CODESPACES"] === "true";
  const isCodespacesDev = inCodespaces && mode !== "production";
  const isCodespacesPreview = inCodespaces && isPreview === true;
  const codespaceName = env["CODESPACE_NAME"];
  const forwardingDomain = env["GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN"];
  const forwardedHost = (port: number): string | undefined =>
    codespaceName && forwardingDomain ? `${codespaceName}-${port}.${forwardingDomain}` : undefined;

  if ((isCodespacesDev || isCodespacesPreview) && forwardedHost(DEV_PORT) === undefined) {
    throw new Error(
      "Codespaces requires CODESPACE_NAME and GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN",
    );
  }
  const devHost = isCodespacesDev ? forwardedHost(DEV_PORT) : undefined;
  const previewHost = isCodespacesPreview ? forwardedHost(PREVIEW_PORT) : undefined;
  const proxy = {
    "/api": {
      target: `http://localhost:${serverPort}`,
    },
    "/ws": {
      target: `ws://localhost:${serverPort}`,
      ws: true,
    },
  };

  return {
    envDir: ENV_DIR,
    server: {
      host: true,
      port: DEV_PORT,
      strictPort: true,
      // Avoid allowing forwarded hostnames from other Codespaces.
      allowedHosts: devHost ? [devHost] : [],
      proxy,
    },
    preview: {
      host: true,
      port: PREVIEW_PORT,
      strictPort: true,
      // Only this Codespace's forwarded preview host; never a wildcard.
      allowedHosts: previewHost ? [previewHost] : [],
      proxy,
    },
  };
});
