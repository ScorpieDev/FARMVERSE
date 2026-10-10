/**
 * Resolves where the client reaches the server.
 *
 * - VITE_SERVER_URL empty: same origin as the page. In development the Vite
 *   proxy forwards /api and /ws to the server.
 * - VITE_SERVER_URL set (deployment): that origin, with ws/wss derived from
 *   http/https.
 */
import { HEALTH_PATH } from "@farmverse/shared/api";
import { WS_PATH } from "@farmverse/shared/protocol";

export interface ServerUrls {
  /** Prefix for HTTP API paths: "" for the page's own origin, else the server origin. */
  apiOrigin: string;
  healthUrl: string;
  wsUrl: string;
}

/** The parts of `window.location` this module needs. */
export interface PageLocation {
  protocol: string;
  host: string;
}

export type ServerUrlResult =
  | { ok: true; urls: ServerUrls }
  | { ok: false; reason: string };

export function resolveServerUrls(
  configured: string | undefined,
  page: PageLocation,
): ServerUrlResult {
  const value = configured?.trim() ?? "";

  if (value === "") {
    const wsProtocol = page.protocol === "https:" ? "wss:" : "ws:";
    return {
      ok: true,
      urls: {
        apiOrigin: "",
        healthUrl: HEALTH_PATH,
        wsUrl: `${wsProtocol}//${page.host}${WS_PATH}`,
      },
    };
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, reason: "VITE_SERVER_URL is not a valid URL" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: "VITE_SERVER_URL must use http or https" };
  }
  if (url.pathname !== "/" || url.search !== "" || url.hash !== "") {
    return { ok: false, reason: "VITE_SERVER_URL must be an origin without a path" };
  }
  if (page.protocol === "https:" && url.protocol === "http:") {
    return { ok: false, reason: "VITE_SERVER_URL must use https on an https page" };
  }

  const wsProtocol = url.protocol === "https:" ? "wss:" : "ws:";
  return {
    ok: true,
    urls: {
      apiOrigin: url.origin,
      healthUrl: `${url.origin}${HEALTH_PATH}`,
      wsUrl: `${wsProtocol}//${url.host}${WS_PATH}`,
    },
  };
}
