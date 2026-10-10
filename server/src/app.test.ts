import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HEALTH_PATH } from "@farmverse/shared/api";
import packageJson from "../package.json" with { type: "json" };
import { buildApp } from "./app.js";
import type { ServerConfig } from "./config.js";

const config: ServerConfig = {
  host: "127.0.0.1",
  port: 0,
  clientOrigin: "http://localhost:5173",
  logLevel: "silent",
  databasePath: ":memory:",
};

let app: FastifyInstance;

beforeEach(() => {
  app = buildApp(config);
});

afterEach(async () => {
  await app.close();
});

describe("GET /api/health", () => {
  it("returns status, package version and server time", async () => {
    const before = Date.now();
    const response = await app.inject({ method: "GET", url: HEALTH_PATH });
    const after = Date.now();

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toMatch(/application\/json/);
    const body = response.json<Record<string, unknown>>();
    expect(body).toEqual({
      status: "ok",
      version: packageJson.version,
      serverTime: expect.any(Number),
    });
    expect(body["serverTime"]).toBeGreaterThanOrEqual(before);
    expect(body["serverTime"]).toBeLessThanOrEqual(after);
  });
});

describe("errors", () => {
  it("returns NOT_FOUND for unknown routes", async () => {
    const response = await app.inject({ method: "GET", url: "/api/nope" });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      code: "NOT_FOUND",
      message: expect.any(String),
    });
  });

  it("returns INTERNAL_ERROR without leaking details", async () => {
    app.get("/test/boom", () => {
      throw new Error("secret database detail");
    });

    const response = await app.inject({ method: "GET", url: "/test/boom" });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      code: "INTERNAL_ERROR",
      message: "Internal server error",
    });
    expect(response.body).not.toContain("secret");
  });

  it("returns INVALID_REQUEST with a fixed message for malformed JSON", async () => {
    app.post("/test/echo", () => ({ ok: true }));

    const response = await app.inject({
      method: "POST",
      url: "/test/echo",
      headers: { "content-type": "application/json" },
      payload: "{not json",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ code: "INVALID_REQUEST", message: "Invalid request" });
  });

  it("returns INVALID_REQUEST for other client errors without internal details", async () => {
    app.post("/test/echo", () => ({ ok: true }));

    const response = await app.inject({
      method: "POST",
      url: "/test/echo",
      headers: { "content-type": "application/x-unknown" },
      payload: "data",
    });

    expect(response.statusCode).toBe(415);
    expect(response.json()).toEqual({ code: "INVALID_REQUEST", message: "Invalid request" });
  });
});

describe("CORS", () => {
  it("allows only the configured client origin", async () => {
    const response = await app.inject({
      method: "GET",
      url: HEALTH_PATH,
      headers: { origin: "http://localhost:5173" },
    });

    expect(response.headers["access-control-allow-origin"]).toBe(
      "http://localhost:5173",
    );
  });

  it("answers preflight requests from the client origin", async () => {
    const response = await app.inject({
      method: "OPTIONS",
      url: HEALTH_PATH,
      headers: {
        origin: "http://localhost:5173",
        "access-control-request-method": "GET",
      },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe(
      "http://localhost:5173",
    );
  });

  it("does not grant access to other origins", async () => {
    const response = await app.inject({
      method: "GET",
      url: HEALTH_PATH,
      headers: { origin: "https://evil.example.com" },
    });

    expect(response.headers["access-control-allow-origin"]).not.toBe(
      "https://evil.example.com",
    );
  });
});
