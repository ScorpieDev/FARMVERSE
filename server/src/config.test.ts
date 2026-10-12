import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "./config.js";

describe("loadConfig", () => {
  it("uses defaults matching .env.example when nothing is set", () => {
    expect(loadConfig({})).toEqual({
      host: "0.0.0.0",
      port: 3000,
      clientOrigins: ["http://localhost:5173"],
      logLevel: "info",
      databasePath: "data/farmverse.db",
    });
  });

  it("treats empty values as unset", () => {
    expect(loadConfig({ PORT: "", HOST: "  " })).toMatchObject({
      host: "0.0.0.0",
      port: 3000,
    });
  });

  it("allows only this Codespace's forwarded client origin in Codespaces", () => {
    expect(
      loadConfig({
        CODESPACES: "true",
        CODESPACE_NAME: "bright-farm-123",
        GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN: "app.github.dev",
      }).clientOrigins,
    ).toEqual([
      "http://localhost:5173",
      "https://bright-farm-123-5173.app.github.dev",
    ]);
  });

  it("does not add a Codespaces origin outside Codespaces", () => {
    expect(
      loadConfig({
        CODESPACE_NAME: "bright-farm-123",
        GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN: "app.github.dev",
      }).clientOrigins,
    ).toEqual(["http://localhost:5173"]);
  });

  it("does not derive a Codespaces origin in production", () => {
    expect(
      loadConfig({
        NODE_ENV: "production",
        CODESPACES: "true",
        CODESPACE_NAME: "bright-farm-123",
        GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN: "app.github.dev",
        CLIENT_ORIGIN: "https://farm.example.com",
      }).clientOrigins,
    ).toEqual(["https://farm.example.com"]);
  });

  it("rejects incomplete Codespaces forwarding configuration", () => {
    expect(() => loadConfig({ CODESPACES: "true" })).toThrow(/CODESPACES/);
  });

  it("reads valid values", () => {
    expect(
      loadConfig({
        HOST: "127.0.0.1",
        PORT: "8080",
        CLIENT_ORIGIN: "https://farm.example.com",
        LOG_LEVEL: "debug",
        DATABASE_PATH: ":memory:",
      }),
    ).toEqual({
      host: "127.0.0.1",
      port: 8080,
      clientOrigins: ["https://farm.example.com"],
      logLevel: "debug",
      databasePath: ":memory:",
    });
  });

  it.each(["abc", "-1", "3.5", "65536", "30 00"])("rejects PORT=%s", (port) => {
    expect(() => loadConfig({ PORT: port })).toThrow(ConfigError);
    expect(() => loadConfig({ PORT: port })).toThrow(/PORT/);
  });

  it.each([
    "localhost:5173",
    "not a url",
    "http://localhost:5173/",
    "http://localhost:5173/app",
    "ftp://localhost",
  ])("rejects CLIENT_ORIGIN=%s", (origin) => {
    expect(() => loadConfig({ CLIENT_ORIGIN: origin })).toThrow(/CLIENT_ORIGIN/);
  });

  it("rejects an unknown LOG_LEVEL", () => {
    expect(() => loadConfig({ LOG_LEVEL: "verbose" })).toThrow(/LOG_LEVEL/);
  });

  it("lists every invalid variable in one error", () => {
    expect(() =>
      loadConfig({ PORT: "x", CLIENT_ORIGIN: "x", LOG_LEVEL: "x" }),
    ).toThrow(/PORT[\s\S]*CLIENT_ORIGIN[\s\S]*LOG_LEVEL/);
  });
});
