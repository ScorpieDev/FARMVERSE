import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PROTOCOL_VERSION } from "@farmverse/shared/protocol";
import type { ConnectionStatus } from "./connectionStatus.js";
import {
  BACKOFF_MAX_MS,
  HEALTH_TIMEOUT_MS,
  MAX_RETRIES,
  PING_INTERVAL_MS,
  PONG_TIMEOUT_MS,
  ServerConnection,
  WELCOME_TIMEOUT_MS,
  backoffDelay,
} from "./ServerConnection.js";
import type { ServerUrlResult } from "./serverUrl.js";

const URLS: ServerUrlResult = {
  ok: true,
  urls: { apiOrigin: "", healthUrl: "/api/health", wsUrl: "ws://localhost:5173/ws" },
};
const HEALTH = { status: "ok", version: "0.0.0", serverTime: 1 };
const WELCOME = { type: "welcome", protocolVersion: PROTOCOL_VERSION, serverTime: 1 };

/** Test double for the browser WebSocket; the test plays the server side. */
class FakeSocket {
  readyState = 0;
  sent: unknown[] = [];
  closeCode: number | undefined;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(readonly url: string) {}

  send(data: string): void {
    this.sent.push(JSON.parse(data));
  }

  close(code?: number): void {
    this.closeCode = code;
    this.readyState = 3;
  }

  serverOpen(): void {
    if (this.readyState !== 0) throw new Error("socket is not connecting");
    this.readyState = 1;
    this.onopen?.({} as Event);
  }

  serverSend(message: unknown): void {
    const data = typeof message === "string" ? message : JSON.stringify(message);
    this.onmessage?.({ data } as MessageEvent);
  }

  serverClose(code: number): void {
    this.readyState = 3;
    this.onclose?.({ code } as CloseEvent);
  }
}

type FetchFn = typeof fetch;

function healthy(): FetchFn {
  return vi.fn(async () => ({ ok: true, status: 200, json: async () => HEALTH }) as Response);
}

function failing(): FetchFn {
  return vi.fn(async () => {
    throw new TypeError("Failed to fetch");
  });
}

/** Never resolves until the request is aborted. */
function hanging(): FetchFn {
  return vi.fn(
    (_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      }),
  );
}

let sockets: FakeSocket[];
let statuses: ConnectionStatus[];
let connection: ServerConnection | undefined;

function create(fetchFn: FetchFn, urls: ServerUrlResult = URLS): ServerConnection {
  const created = new ServerConnection({
    urls,
    fetch: fetchFn,
    createSocket: (url) => {
      const socket = new FakeSocket(url);
      sockets.push(socket);
      return socket as unknown as WebSocket;
    },
    random: () => 0.5, // no jitter
    onStatus: (status) => statuses.push(status),
  });
  connection = created;
  return created;
}

const lastStatus = () => statuses.at(-1);
const lastSocket = () => sockets.at(-1)!;
const openSockets = () => sockets.filter((socket) => socket.readyState < 2).length;
const flush = () => vi.advanceTimersByTimeAsync(0);

/** Runs health → open → hello → welcome on the latest socket. */
async function completeHandshake(): Promise<FakeSocket> {
  await flush();
  const socket = lastSocket();
  socket.serverOpen();
  socket.serverSend(WELCOME);
  return socket;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  sockets = [];
  statuses = [];
  connection = undefined;
});

afterEach(() => {
  connection?.dispose();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("backoffDelay", () => {
  it("doubles from 1 s and caps at 15 s", () => {
    const delays = [1, 2, 3, 4, 5, 6].map((retry) => backoffDelay(retry, () => 0.5));
    expect(delays).toEqual([1_000, 2_000, 4_000, 8_000, 15_000, BACKOFF_MAX_MS]);
  });

  it("applies at most ±20% jitter", () => {
    expect(backoffDelay(3, () => 0)).toBe(3_200);
    expect(backoffDelay(3, () => 0.999_999)).toBe(4_800);
  });
});

describe("ServerConnection handshake", () => {
  it("checks health, sends hello and becomes connected on welcome", async () => {
    const fetchFn = healthy();
    create(fetchFn).start();
    expect(lastStatus()).toEqual({ kind: "connecting", attempt: 1 });

    await flush();
    expect(fetchFn).toHaveBeenCalledWith("/api/health", expect.anything());
    const socket = lastSocket();
    expect(socket.url).toBe("ws://localhost:5173/ws");

    socket.serverOpen();
    expect(socket.sent).toEqual([{ type: "hello", protocolVersion: PROTOCOL_VERSION }]);

    socket.serverSend(WELCOME);
    expect(lastStatus()).toEqual({ kind: "connected", serverVersion: "0.0.0" });
  });

  it("does not open a socket when the URL is misconfigured", async () => {
    const fetchFn = healthy();
    create(fetchFn, { ok: false, reason: "bad url" }).start();
    await flush();

    expect(lastStatus()).toEqual({ kind: "misconfigured", reason: "bad url" });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(sockets).toHaveLength(0);
  });

  it("retries when there is no welcome in time", async () => {
    create(healthy()).start();
    await flush();
    lastSocket().serverOpen();

    await vi.advanceTimersByTimeAsync(WELCOME_TIMEOUT_MS);

    expect(lastStatus()).toMatchObject({ kind: "reconnecting", attempt: 1 });
    expect(lastSocket().closeCode).toBe(1000);
  });

  it("retries when the health check times out", async () => {
    create(hanging()).start();
    await vi.advanceTimersByTimeAsync(HEALTH_TIMEOUT_MS);

    expect(lastStatus()).toMatchObject({ kind: "reconnecting", attempt: 1, retryInMs: 1_000 });
    expect(sockets).toHaveLength(0);
  });

  it("retries when the health response is invalid", async () => {
    const fetchFn = vi.fn(
      async () => ({ ok: true, status: 200, json: async () => ({ status: "down" }) }) as Response,
    );
    create(fetchFn).start();
    await flush();

    expect(lastStatus()).toMatchObject({ kind: "reconnecting" });
    expect(sockets).toHaveLength(0);
  });

  it("retries when the health check returns an HTTP error", async () => {
    const fetchFn = vi.fn(async () => ({ ok: false, status: 502 }) as Response);
    create(fetchFn).start();
    await flush();

    expect(lastStatus()).toMatchObject({ kind: "reconnecting" });
  });
});

describe("ServerConnection heartbeat", () => {
  it("pings every 15 s and records the round-trip time", async () => {
    create(healthy()).start();
    const socket = await completeHandshake();

    await vi.advanceTimersByTimeAsync(PING_INTERVAL_MS);
    const ping = socket.sent.at(-1) as { type: string; sentAt: number };
    expect(ping.type).toBe("ping");

    await vi.advanceTimersByTimeAsync(40);
    socket.serverSend({ type: "pong", sentAt: ping.sentAt, serverTime: Date.now() });

    expect(lastStatus()).toEqual({ kind: "connected", serverVersion: "0.0.0", rttMs: 40 });
  });

  it("treats a missing pong as a lost connection", async () => {
    create(healthy()).start();
    const socket = await completeHandshake();

    await vi.advanceTimersByTimeAsync(PING_INTERVAL_MS + PONG_TIMEOUT_MS);

    expect(lastStatus()).toMatchObject({ kind: "reconnecting", attempt: 1 });
    expect(socket.closeCode).toBe(1000);
  });

  it("ignores invalid messages from the server and stays connected", async () => {
    create(healthy()).start();
    const socket = await completeHandshake();

    socket.serverSend("{not json");
    socket.serverSend({ type: "reward", amount: 1_000 });
    socket.onmessage?.({ data: new ArrayBuffer(4) } as MessageEvent);

    expect(lastStatus()).toEqual({ kind: "connected", serverVersion: "0.0.0" });
    expect(console.warn).toHaveBeenCalled();
  });

  it("keeps the connection on non-fatal server errors", async () => {
    create(healthy()).start();
    const socket = await completeHandshake();

    socket.serverSend({ type: "error", error: { code: "INVALID_MESSAGE", message: "x" } });

    expect(lastStatus()).toMatchObject({ kind: "connected" });
  });
});

describe("ServerConnection reconnect", () => {
  it("reconnects after the server closes and resets the retry count", async () => {
    create(healthy()).start();
    const first = await completeHandshake();

    first.serverClose(1001);
    expect(lastStatus()).toMatchObject({ kind: "reconnecting", attempt: 1, retryInMs: 1_000 });

    await vi.advanceTimersByTimeAsync(1_000);
    await completeHandshake();
    expect(lastStatus()).toMatchObject({ kind: "connected" });

    lastSocket().serverClose(1001);
    expect(lastStatus()).toMatchObject({ kind: "reconnecting", attempt: 1 });
  });

  it("uses exponential backoff and goes offline after the retry limit", async () => {
    const fetchFn = failing();
    create(fetchFn).start();
    await flush();

    const delays: number[] = [];
    for (let retry = 1; retry <= MAX_RETRIES; retry++) {
      const status = lastStatus();
      expect(status).toMatchObject({ kind: "reconnecting", attempt: retry, maxAttempts: MAX_RETRIES });
      const delay = (status as { retryInMs: number }).retryInMs;
      delays.push(delay);
      await vi.advanceTimersByTimeAsync(delay);
    }

    expect(delays).toEqual([1_000, 2_000, 4_000, 8_000, 15_000]);
    expect(lastStatus()).toEqual({ kind: "offline" });
    expect(fetchFn).toHaveBeenCalledTimes(1 + MAX_RETRIES);

    // No further attempts, no matter how long we wait.
    await vi.advanceTimersByTimeAsync(60 * 60 * 1_000);
    expect(fetchFn).toHaveBeenCalledTimes(1 + MAX_RETRIES);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("starts a new cycle on retry() when offline", async () => {
    const fetchFn = failing();
    create(fetchFn).start();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(lastStatus()).toEqual({ kind: "offline" });

    vi.mocked(fetchFn).mockImplementation(healthy());
    connection!.retry();
    expect(lastStatus()).toEqual({ kind: "connecting", attempt: 1 });

    await completeHandshake();
    expect(lastStatus()).toMatchObject({ kind: "connected" });
  });

  it("ignores retry() unless offline", async () => {
    const fetchFn = healthy();
    create(fetchFn).start();
    await completeHandshake();

    connection!.retry();
    await flush();

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(sockets).toHaveLength(1);
  });

  it("never keeps two sockets open", async () => {
    create(healthy()).start();
    for (let retry = 1; retry <= 3; retry++) {
      await flush();
      lastSocket().serverOpen();
      expect(openSockets()).toBe(1);

      await vi.advanceTimersByTimeAsync(WELCOME_TIMEOUT_MS); // no welcome → retry
      expect(openSockets()).toBe(0);

      const status = lastStatus() as { kind: string; retryInMs: number };
      expect(status.kind).toBe("reconnecting");
      await vi.advanceTimersByTimeAsync(status.retryInMs);
    }
    expect(sockets).toHaveLength(4);
  });
});

describe("ServerConnection protocol mismatch", () => {
  it("stops on UNSUPPORTED_PROTOCOL_VERSION without retrying", async () => {
    const fetchFn = healthy();
    create(fetchFn).start();
    await flush();
    const socket = lastSocket();
    socket.serverOpen();

    socket.serverSend({
      type: "error",
      error: { code: "UNSUPPORTED_PROTOCOL_VERSION", message: "v2 only" },
    });
    socket.serverClose(4000);

    expect(lastStatus()).toEqual({ kind: "incompatible" });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("stops on close code 4000 without retrying", async () => {
    const fetchFn = healthy();
    create(fetchFn).start();
    await flush();
    lastSocket().serverOpen();

    lastSocket().serverClose(4000);

    expect(lastStatus()).toEqual({ kind: "incompatible" });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

describe("ServerConnection dispose", () => {
  it("cancels a pending health check", async () => {
    const fetchFn = hanging();
    create(fetchFn).start();
    await flush();

    connection!.dispose();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(lastStatus()).toEqual({ kind: "closed" });
    expect(sockets).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels a scheduled retry", async () => {
    const fetchFn = failing();
    create(fetchFn).start();
    await flush();
    expect(lastStatus()).toMatchObject({ kind: "reconnecting" });

    connection!.dispose();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("closes an open connection with 1000 and ignores later events", async () => {
    create(healthy()).start();
    const socket = await completeHandshake();
    const count = statuses.length;

    connection!.dispose();
    expect(socket.closeCode).toBe(1000);
    expect(lastStatus()).toEqual({ kind: "closed" });

    socket.serverSend(WELCOME);
    socket.serverClose(1001);
    connection!.retry();
    connection!.start();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(statuses).toHaveLength(count + 1);
    expect(sockets).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
