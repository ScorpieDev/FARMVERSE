import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "./config.js";

describe("loadConfig", () => {
  it("uses defaults matching .env.example when nothing is set", () => {
    expect(loadConfig({})).toEqual({
      host: "0.0.0.0",
      port: 3000,
      clientOrigin: "http://localhost:5173",
      logLevel: "info",
    });
  });

  it("treats empty values as unset", () => {
    expect(loadConfig({ PORT: "", HOST: "  " })).toMatchObject({
      host: "0.0.0.0",
      port: 3000,
    });
  });

  it("reads valid values", () => {
    expect(
      loadConfig({
        HOST: "127.0.0.1",
        PORT: "8080",
        CLIENT_ORIGIN: "https://farm.example.com",
        LOG_LEVEL: "debug",
      }),
    ).toEqual({
      host: "127.0.0.1",
      port: 8080,
      clientOrigin: "https://farm.example.com",
      logLevel: "debug",
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
