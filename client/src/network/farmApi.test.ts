import { describe, expect, it, vi } from "vitest";
import type { FarmState } from "@farmverse/shared/api";
import {
  ACTION_RETRY_DELAYS_MS,
  FarmApi,
  NetworkError,
  SessionInvalidError,
  TOKEN_STORAGE_KEY,
  createMemoryStorage,
} from "./farmApi.js";

const TOKEN = "A".repeat(40) + "-_9";
const NEW_TOKEN = "B".repeat(43);
const PLAYER_ID = "3f2b8c1e-9a4d-4f6b-8e2a-1c5d7b9e0f12";
const REQUEST_ID = "00000000-0000-4000-8000-000000000001";

const FARM: FarmState = {
  serverTime: 1_700_000_000_000,
  plots: [0, 1, 2, 3, 4, 5].map((index) => ({ index, crop: null })),
  inventory: [{ itemId: "wheat_seed", quantity: 5 }],
  seedRefill: { eligible: false, availableAt: null },
  coins: 0,
  xp: 0,
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

/** A fake fetch answering from a queue of responses (or errors) and recording calls. */
function fakeFetch(...answers: Array<Response | Error>) {
  const calls: Call[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(input),
      method: init?.method ?? "GET",
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
    });
    const answer = answers.shift();
    if (answer === undefined) throw new Error("No more fake responses");
    if (answer instanceof Error) throw answer;
    return answer;
  });
  return { fetch: fn as unknown as typeof fetch, calls };
}

function api(fetchFn: typeof fetch, token: string | null = TOKEN, apiOrigin = "") {
  const storage = createMemoryStorage();
  if (token !== null) storage.setItem(TOKEN_STORAGE_KEY, token);
  const sleeps: number[] = [];
  const client = new FarmApi({
    apiOrigin,
    storage,
    fetch: fetchFn,
    sleep: async (ms) => void sleeps.push(ms),
  });
  return { client, storage, sleeps };
}

describe("sessions", () => {
  it("creates a session on the first visit and stores the token", async () => {
    const { fetch, calls } = fakeFetch(json(201, { playerId: PLAYER_ID, token: NEW_TOKEN }));
    const { client, storage } = api(fetch, null);

    await client.ensureSession();

    expect(calls).toEqual([{ url: "/api/session", method: "POST", headers: {}, body: undefined }]);
    expect(storage.getItem(TOKEN_STORAGE_KEY)).toBe(NEW_TOKEN);
  });

  it("reuses a stored token without creating a new farm", async () => {
    const { fetch, calls } = fakeFetch();
    const { client } = api(fetch);

    await client.ensureSession();

    expect(calls).toHaveLength(0);
  });

  it("does not create a new farm when the token is rejected", async () => {
    const { fetch, calls } = fakeFetch(json(401, { code: "UNAUTHORIZED", message: "x" }));
    const { client, storage } = api(fetch);

    await expect(client.loadFarm()).rejects.toBeInstanceOf(SessionInvalidError);

    expect(calls).toHaveLength(1);
    expect(storage.getItem(TOKEN_STORAGE_KEY)).toBe(TOKEN);
  });

  it("starts a new farm only when asked, replacing the old token", async () => {
    const { fetch, calls } = fakeFetch(json(201, { playerId: PLAYER_ID, token: NEW_TOKEN }));
    const { client, storage } = api(fetch);

    await client.startNewFarm();

    expect(calls[0]).toMatchObject({ url: "/api/session", method: "POST", headers: {} });
    expect(storage.getItem(TOKEN_STORAGE_KEY)).toBe(NEW_TOKEN);
  });

  it("rejects an invalid session response", async () => {
    const { fetch } = fakeFetch(json(201, { playerId: "x", token: "short" }));
    const { client, storage } = api(fetch, null);

    await expect(client.ensureSession()).rejects.toThrow(/Invalid session/);
    expect(storage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
  });
});

describe("loadFarm", () => {
  it("sends the Bearer token to the configured origin and validates the state", async () => {
    const { fetch, calls } = fakeFetch(json(200, FARM));
    const { client } = api(fetch, TOKEN, "https://api.example.com");

    expect(await client.loadFarm()).toEqual(FARM);
    expect(calls[0]).toMatchObject({
      url: "https://api.example.com/api/farm",
      method: "GET",
      headers: { authorization: `Bearer ${TOKEN}` },
    });
  });

  it("rejects an invalid farm state", async () => {
    const { fetch } = fakeFetch(json(200, { ...FARM, coins: -1 }));
    await expect(api(fetch).client.loadFarm()).rejects.toThrow(/Invalid farm state/);
  });

  it("reports an unreachable server as NetworkError", async () => {
    const { fetch } = fakeFetch(new TypeError("Failed to fetch"));
    await expect(api(fetch).client.loadFarm()).rejects.toBeInstanceOf(NetworkError);
  });
});

describe("actions", () => {
  const plantBody = { requestId: REQUEST_ID, plotIndex: 0, cropId: "wheat" as const };

  it("returns the new state on success", async () => {
    const { fetch, calls } = fakeFetch(json(200, FARM));

    expect(await api(fetch).client.plant(plantBody)).toEqual({ ok: true, state: FARM });
    expect(calls[0]).toMatchObject({
      url: "/api/farm/plant",
      method: "POST",
      headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
      body: plantBody,
    });
  });

  it("returns gameplay errors without retrying", async () => {
    const { fetch, calls } = fakeFetch(json(409, { code: "PLOT_NOT_EMPTY", message: "Plot busy" }));

    expect(await api(fetch).client.plant(plantBody)).toEqual({
      ok: false,
      code: "PLOT_NOT_EMPTY",
      message: "Plot busy",
    });
    expect(calls).toHaveLength(1);
  });

  it("retries network failures with the same request ID", async () => {
    const { fetch, calls } = fakeFetch(
      new TypeError("Failed to fetch"),
      json(502, {}),
      json(200, FARM),
    );
    const { client, sleeps } = api(fetch);

    expect(await client.plant(plantBody)).toEqual({ ok: true, state: FARM });
    expect(calls.map((call) => (call.body as { requestId: string }).requestId)).toEqual([
      REQUEST_ID,
      REQUEST_ID,
      REQUEST_ID,
    ]);
    expect(sleeps).toEqual([1_000, 2_000]);
  });

  it("gives up after the last retry", async () => {
    const failures = Array.from({ length: ACTION_RETRY_DELAYS_MS.length + 1 }, () => new TypeError("down"));
    const { fetch, calls } = fakeFetch(...failures);
    const { client, sleeps } = api(fetch);

    await expect(client.plant(plantBody)).rejects.toBeInstanceOf(NetworkError);
    expect(calls).toHaveLength(ACTION_RETRY_DELAYS_MS.length + 1);
    expect(sleeps).toEqual([...ACTION_RETRY_DELAYS_MS]);
  });

  it("raises SessionInvalidError on 401", async () => {
    const { fetch } = fakeFetch(json(401, { code: "UNAUTHORIZED", message: "x" }));
    await expect(api(fetch).client.harvest({ requestId: REQUEST_ID, plotIndex: 0 })).rejects.toBeInstanceOf(
      SessionInvalidError,
    );
  });

  it("validates the harvest response (produce, reward)", async () => {
    const harvest = { ...FARM, harvested: { itemId: "wheat_produce", quantity: 1 }, reward: { coins: 2, xp: 1 } };
    const { fetch } = fakeFetch(json(200, harvest), json(200, { ...harvest, harvested: { itemId: "wheat_seed", quantity: 1 } }));
    const { client } = api(fetch);

    expect(await client.harvest({ requestId: REQUEST_ID, plotIndex: 0 })).toEqual({ ok: true, state: harvest });
    await expect(client.harvest({ requestId: REQUEST_ID, plotIndex: 0 })).rejects.toThrow(/Invalid action/);
  });

  it("sends only the request ID for a refill", async () => {
    const { fetch, calls } = fakeFetch(json(200, FARM));

    await api(fetch).client.refillSeeds({ requestId: REQUEST_ID });

    expect(calls[0]).toMatchObject({ url: "/api/farm/refill-seeds", body: { requestId: REQUEST_ID } });
  });

  it("rejects an unexpected error body", async () => {
    const { fetch } = fakeFetch(json(409, { code: "SOMETHING", message: "x" }));
    await expect(api(fetch).client.plant(plantBody)).rejects.toThrow(/Unexpected response 409/);
  });
});
