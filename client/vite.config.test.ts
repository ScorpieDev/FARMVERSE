import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ConfigEnv, UserConfig } from "vite";
import config from "./vite.config.js";

const CODESPACES_ENV = ["CODESPACES", "CODESPACE_NAME", "GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN"] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(CODESPACES_ENV.map((name) => [name, process.env[name]]));
  for (const name of CODESPACES_ENV) delete process.env[name];
});

afterEach(() => {
  for (const name of CODESPACES_ENV) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
});

function inCodespace(): void {
  process.env["CODESPACES"] = "true";
  process.env["CODESPACE_NAME"] = "bright-farm-123";
  process.env["GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN"] = "app.github.dev";
}

function resolve(env: ConfigEnv): UserConfig {
  return (config as (env: ConfigEnv) => UserConfig)(env);
}

const DEV: ConfigEnv = { command: "serve", mode: "development", isPreview: false };
const PREVIEW: ConfigEnv = { command: "serve", mode: "production", isPreview: true };
const BUILD: ConfigEnv = { command: "build", mode: "production", isPreview: false };

describe("allowed hosts", () => {
  it("allows only this Codespace's exact forwarded host: 5173 for dev, 4173 for preview", () => {
    inCodespace();
    expect(resolve(DEV).server?.allowedHosts).toEqual(["bright-farm-123-5173.app.github.dev"]);
    const preview = resolve(PREVIEW).preview;
    expect(preview?.allowedHosts).toEqual(["bright-farm-123-4173.app.github.dev"]);
    expect([preview?.port, preview?.strictPort]).toEqual([4173, true]);
  });

  it("never allows every host or a wildcard domain", () => {
    inCodespace();
    for (const env of [DEV, PREVIEW, BUILD]) {
      const resolved = resolve(env);
      for (const hosts of [resolved.server?.allowedHosts, resolved.preview?.allowedHosts]) {
        expect(hosts).not.toBe(true);
        for (const host of (hosts as string[] | undefined) ?? []) expect(host).not.toMatch(/^\.|\*/);
      }
    }
  });

  it("allows no extra host outside Codespaces (localhost only)", () => {
    for (const env of [DEV, PREVIEW, BUILD]) {
      const resolved = resolve(env);
      expect(resolved.server?.allowedHosts).toEqual([]);
      expect(resolved.preview?.allowedHosts).toEqual([]);
    }
  });

  it("does not derive a host for the production build", () => {
    inCodespace();
    const build = resolve(BUILD);
    expect(build.server?.allowedHosts).toEqual([]);
    expect(build.preview?.allowedHosts).toEqual([]);
  });

  it("refuses to start in Codespaces without the forwarding variables", () => {
    process.env["CODESPACES"] = "true";
    expect(() => resolve(DEV)).toThrow(/CODESPACE_NAME/);
    expect(() => resolve(PREVIEW)).toThrow(/CODESPACE_NAME/);
    expect(() => resolve(BUILD)).not.toThrow();
  });

  it("proxies /api and /ws to the game server in dev and preview", () => {
    for (const env of [DEV, PREVIEW]) {
      const resolved = resolve(env);
      for (const proxy of [resolved.server?.proxy, resolved.preview?.proxy]) {
        expect(Object.keys(proxy ?? {})).toEqual(["/api", "/ws"]);
      }
    }
  });
});
