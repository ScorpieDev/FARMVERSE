import { describe, expect, it } from "vitest";
import { resolveServerUrls } from "./serverUrl.js";

const httpPage = { protocol: "http:", host: "localhost:5173" };
const httpsPage = { protocol: "https:", host: "farm-5173.app.github.dev" };

describe("resolveServerUrls", () => {
  it.each([undefined, "", "   "])("uses the page origin when unset (%j)", (value) => {
    expect(resolveServerUrls(value, httpPage)).toEqual({
      ok: true,
      urls: { healthUrl: "/api/health", wsUrl: "ws://localhost:5173/ws" },
    });
  });

  it("uses wss on an https page", () => {
    expect(resolveServerUrls("", httpsPage)).toEqual({
      ok: true,
      urls: { healthUrl: "/api/health", wsUrl: "wss://farm-5173.app.github.dev/ws" },
    });
  });

  it.each(["https://api.example.com", "https://api.example.com/"])(
    "uses a configured https origin (%s)",
    (value) => {
      expect(resolveServerUrls(value, httpsPage)).toEqual({
        ok: true,
        urls: {
          healthUrl: "https://api.example.com/api/health",
          wsUrl: "wss://api.example.com/ws",
        },
      });
    },
  );

  it("uses ws for a configured http origin on an http page", () => {
    expect(resolveServerUrls("http://localhost:3000", httpPage)).toEqual({
      ok: true,
      urls: {
        healthUrl: "http://localhost:3000/api/health",
        wsUrl: "ws://localhost:3000/ws",
      },
    });
  });

  it.each([
    ["not a URL", "not a url", httpPage],
    ["missing scheme", "localhost:3000", httpPage],
    ["ftp scheme", "ftp://example.com", httpPage],
    ["a path", "https://api.example.com/game", httpsPage],
    ["a query", "https://api.example.com/?x=1", httpsPage],
    ["http on an https page", "http://api.example.com", httpsPage],
  ])("rejects %s", (_label, value, page) => {
    const result = resolveServerUrls(value, page);
    expect(result.ok).toBe(false);
  });
});
