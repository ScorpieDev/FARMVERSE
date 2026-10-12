import { describe, expect, it, vi } from "vitest";
import { DEFAULT_APPEARANCE, STARTER_COSMETIC_IDS } from "@farmverse/shared/character";
import type { FarmState } from "@farmverse/shared/api";
import { FARM_PLOT_COUNT } from "@farmverse/shared/farming";
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
  plots: Array.from({ length: FARM_PLOT_COUNT }, (_, index) => ({ index, crop: null })),
  inventory: [{ itemId: "wheat_seed", quantity: 5 }],
  seedRefill: { eligible: false, availableAt: null },
  coins: 0,
  xp: 0,
  progression: { level: 1, xpIntoLevel: 0, xpForNextLevel: 50, unlockedPlotCount: 6 },
  quest: {
    id: "harvest_wheat_3",
    title: "Harvest 3 Wheat",
    progress: 0,
    target: 3,
    complete: false,
    reward: { coins: 10, xp: 5 },
  },
  decorations: [],
  objects: [],
  character: { appearance: { ...DEFAULT_APPEARANCE }, owned: [...STARTER_COSMETIC_IDS] },
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

  it("claims a quest with only the request ID and validates the response", async () => {
    const claimed = { ...FARM, quest: null, coins: 10, xp: 5, progression: { ...FARM.progression, xpIntoLevel: 5 } };
    const response = { ...claimed, claimed: { questId: "harvest_wheat_3", reward: { coins: 10, xp: 5 } } };
    const { fetch, calls } = fakeFetch(json(200, response), json(200, claimed));
    const { client } = api(fetch);

    expect(await client.claimQuest({ requestId: REQUEST_ID })).toEqual({ ok: true, state: response });
    expect(calls[0]).toMatchObject({ url: "/api/quests/claim", method: "POST", body: { requestId: REQUEST_ID } });
    // A body without `claimed` is not a claim response.
    await expect(client.claimQuest({ requestId: REQUEST_ID })).rejects.toThrow(/Invalid action/);
  });

  it("returns QUEST_NOT_COMPLETE without retrying", async () => {
    const { fetch, calls } = fakeFetch(json(409, { code: "QUEST_NOT_COMPLETE", message: "Quest not complete" }));

    expect(await api(fetch).client.claimQuest({ requestId: REQUEST_ID })).toEqual({
      ok: false,
      code: "QUEST_NOT_COMPLETE",
      message: "Quest not complete",
    });
    expect(calls).toHaveLength(1);
  });

  it("retries a claim after a gateway error with the same request ID", async () => {
    const response = { ...FARM, claimed: { questId: "harvest_wheat_3", reward: { coins: 10, xp: 5 } } };
    const { fetch, calls } = fakeFetch(json(504, {}), json(200, response));

    expect(await api(fetch).client.claimQuest({ requestId: REQUEST_ID })).toEqual({ ok: true, state: response });
    expect(calls.map((call) => call.body)).toEqual([{ requestId: REQUEST_ID }, { requestId: REQUEST_ID }]);
  });

  it("rejects an unexpected error body", async () => {
    const { fetch } = fakeFetch(json(409, { code: "SOMETHING", message: "x" }));
    await expect(api(fetch).client.plant(plantBody)).rejects.toThrow(/Unexpected response 409/);
  });
});

describe("object actions (Phase 3)", () => {
  const tree = { objectId: 1, decorationId: "tree" as const, x: 0, y: 0, rotation: 0 as const };
  const response = { ...FARM, objects: [tree], object: tree };

  it.each([
    ["placeObject", "/api/farm/objects/place", { requestId: REQUEST_ID, decorationId: "tree", x: 0, y: 0, rotation: 0 }],
    ["moveObject", "/api/farm/objects/move", { requestId: REQUEST_ID, objectId: 1, x: 0, y: 0 }],
    ["rotateObject", "/api/farm/objects/rotate", { requestId: REQUEST_ID, objectId: 1, rotation: 0 }],
    ["removeObject", "/api/farm/objects/remove", { requestId: REQUEST_ID, objectId: 1 }],
  ] as const)("%s posts the intent and returns the server's state", async (method, url, body) => {
    const { fetch, calls } = fakeFetch(json(200, response));
    const client = api(fetch).client as unknown as Record<string, (body: unknown) => Promise<unknown>>;

    expect(await client[method]!(body)).toEqual({ ok: true, state: response });
    expect(calls[0]).toMatchObject({ url, method: "POST", body });
  });

  it("returns placement errors from the server", async () => {
    const { fetch } = fakeFetch(json(409, { code: "PLACEMENT_INVALID", message: "x" }));
    const body = { requestId: REQUEST_ID, decorationId: "tree" as const, x: 7, y: 7, rotation: 0 as const };
    expect(await api(fetch).client.placeObject(body)).toEqual({ ok: false, code: "PLACEMENT_INVALID", message: "x" });
  });

  it("rejects a success response without the object", async () => {
    const { fetch } = fakeFetch(json(200, FARM));
    await expect(api(fetch).client.removeObject({ requestId: REQUEST_ID, objectId: 1 })).rejects.toThrow(
      "Invalid action response",
    );
  });
});

describe("buyDecoration (Step 3.4)", () => {
  it("posts only the decoration and returns the server's state", async () => {
    const response = { ...FARM, coins: 7, decorations: [{ decorationId: "fence", quantity: 1 }], bought: { decorationId: "fence", price: 5 } };
    const { fetch, calls } = fakeFetch(json(200, response));
    const body = { requestId: REQUEST_ID, decorationId: "fence" as const };
    expect(await api(fetch).client.buyDecoration(body)).toEqual({ ok: true, state: response });
    expect(calls[0]).toMatchObject({ url: "/api/shop/buy", method: "POST", body });
  });

  it("returns INSUFFICIENT_CURRENCY from the server", async () => {
    const { fetch } = fakeFetch(json(409, { code: "INSUFFICIENT_CURRENCY", message: "Not enough coins" }));
    expect(await api(fetch).client.buyDecoration({ requestId: REQUEST_ID, decorationId: "fence" })).toEqual({
      ok: false,
      code: "INSUFFICIENT_CURRENCY",
      message: "Not enough coins",
    });
  });
});

describe("character (Phase 4)", () => {
  it("equipCharacter posts the appearance and returns the server's state", async () => {
    const appearance = { ...DEFAULT_APPEARANCE, skin: "dark" as const };
    const response = { ...FARM, character: { ...FARM.character, appearance } };
    const { fetch, calls } = fakeFetch(json(200, response));
    const body = { requestId: REQUEST_ID, appearance };
    expect(await api(fetch).client.equipCharacter(body)).toEqual({ ok: true, state: response });
    expect(calls[0]).toMatchObject({ url: "/api/character/equip", method: "POST", body });
  });

  it("buyCosmetic posts only the cosmetic and returns what was bought", async () => {
    const response = {
      ...FARM,
      coins: 5,
      character: { ...FARM.character, owned: [...STARTER_COSMETIC_IDS, "hair_spiky_blond"] },
      bought: { cosmeticId: "hair_spiky_blond", price: 40 },
    };
    const { fetch, calls } = fakeFetch(json(200, response));
    const body = { requestId: REQUEST_ID, cosmeticId: "hair_spiky_blond" as const };
    expect(await api(fetch).client.buyCosmetic(body)).toEqual({ ok: true, state: response });
    expect(calls[0]).toMatchObject({ url: "/api/shop/buy-cosmetic", method: "POST", body });
  });

  it("returns ALREADY_OWNED from the server", async () => {
    const { fetch } = fakeFetch(json(409, { code: "ALREADY_OWNED", message: "You already own this" }));
    expect(await api(fetch).client.buyCosmetic({ requestId: REQUEST_ID, cosmeticId: "pants_work" })).toEqual({
      ok: false,
      code: "ALREADY_OWNED",
      message: "You already own this",
    });
  });
});

describe("multiplayer requests (Phase 5)", () => {
  const VISITED = {
    serverTime: 1,
    farmCode: "ABC234",
    name: "Farmer 0042",
    level: 1,
    plots: FARM.plots,
    objects: [],
    appearance: { ...DEFAULT_APPEARANCE },
  };

  it("visitFarm gets the visitor view by encoded farm code, with the token", async () => {
    const { fetch, calls } = fakeFetch(json(200, VISITED));
    expect(await api(fetch).client.visitFarm("ABC234")).toEqual(VISITED);
    expect(calls[0]).toMatchObject({ url: "/api/farms/ABC234", method: "GET", headers: { authorization: `Bearer ${TOKEN}` } });
  });

  it("visitFarm returns undefined for an unknown farm and rejects a bad body", async () => {
    expect(await api(fakeFetch(json(404, { code: "ROOM_NOT_FOUND", message: "x" })).fetch).client.visitFarm("ZZZZZZ")).toBeUndefined();
    await expect(api(fakeFetch(json(200, { ...VISITED, coins: 5, level: 0 })).fetch).client.visitFarm("ABC234")).rejects.toThrow(/Invalid/);
    await expect(api(fakeFetch(json(401, { code: "UNAUTHORIZED", message: "x" })).fetch).client.visitFarm("ABC234")).rejects.toBeInstanceOf(SessionInvalidError);
  });

  it("onlinePlayers returns the list", async () => {
    const players = [{ farmCode: "ABC234", name: "Farmer 0042" }];
    const { fetch, calls } = fakeFetch(json(200, { players }));
    expect(await api(fetch).client.onlinePlayers()).toEqual(players);
    expect(calls[0]).toMatchObject({ url: "/api/players/online", method: "GET" });
    await expect(api(fakeFetch(json(200, { players: [{ farmCode: "bad" }] })).fetch).client.onlinePlayers()).rejects.toThrow(/Invalid/);
  });
});
