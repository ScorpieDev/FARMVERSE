/**
 * Client side of the Phase 0 connection: health check, WebSocket handshake,
 * heartbeat and bounded reconnect.
 *
 * Each attempt: GET /api/health → open /ws → send hello → wait for welcome.
 * While connected the client pings every 15 s and treats a missing pong as a
 * lost connection. Failed attempts are retried with exponential backoff, at
 * most MAX_RETRIES times in a row; after that the status is "offline" until
 * retry() is called (the player taps the screen).
 *
 * The server stays authoritative: serverTime and version are only displayed.
 * fetch and WebSocket are injected so the logic can be tested without a browser.
 */
import { isHealthResponse } from "@farmverse/shared/api";
import {
  PROTOCOL_VERSION,
  decodeServerMessage,
  type ClientMessage,
} from "@farmverse/shared/protocol";
import type { ConnectionStatus } from "./connectionStatus.js";
import type { ServerUrlResult, ServerUrls } from "./serverUrl.js";

export const HEALTH_TIMEOUT_MS = 5_000;
export const WELCOME_TIMEOUT_MS = 5_000;
export const PING_INTERVAL_MS = 15_000;
export const PONG_TIMEOUT_MS = 10_000;
export const BACKOFF_BASE_MS = 1_000;
export const BACKOFF_MAX_MS = 15_000;
export const BACKOFF_JITTER = 0.2;
/** Automatic retries after a failure before giving up and showing "offline". */
export const MAX_RETRIES = 5;

/** Close code the server uses after UNSUPPORTED_PROTOCOL_VERSION. */
const CLOSE_UNSUPPORTED_PROTOCOL = 4000;
const CLOSE_NORMAL = 1000;

// WebSocket.readyState values (also used by the test double).
const SOCKET_CONNECTING = 0;
const SOCKET_OPEN = 1;

type Timer = ReturnType<typeof setTimeout>;

export interface ServerConnectionOptions {
  urls: ServerUrlResult;
  onStatus: (status: ConnectionStatus) => void;
  fetch?: typeof fetch;
  createSocket?: (url: string) => WebSocket;
  /** Returns a number in [0, 1); used for backoff jitter. */
  random?: () => number;
}

/** Delay before retry number `retry` (1-based), with ±BACKOFF_JITTER jitter. */
export function backoffDelay(retry: number, random: () => number): number {
  const base = Math.min(BACKOFF_BASE_MS * 2 ** (retry - 1), BACKOFF_MAX_MS);
  const jitter = 1 + BACKOFF_JITTER * (2 * random() - 1);
  return Math.round(base * jitter);
}

export class ServerConnection {
  private readonly options: ServerConnectionOptions;
  private readonly fetchFn: typeof fetch;
  private readonly createSocket: (url: string) => WebSocket;
  private readonly random: () => number;

  private status: ConnectionStatus = { kind: "closed" };
  private disposed = false;
  /** Incremented whenever an attempt ends; callbacks from older attempts are ignored. */
  private attemptId = 0;
  /** Retries already scheduled since the last successful connection. */
  private retries = 0;

  private socket: WebSocket | null = null;
  private healthRequest: AbortController | null = null;
  private retryTimer: Timer | undefined;
  private welcomeTimer: Timer | undefined;
  private pongTimer: Timer | undefined;
  private pingTimer: ReturnType<typeof setInterval> | undefined;

  constructor(options: ServerConnectionOptions) {
    this.options = options;
    this.fetchFn = options.fetch ?? ((input, init) => fetch(input, init));
    this.createSocket = options.createSocket ?? ((url) => new WebSocket(url));
    this.random = options.random ?? Math.random;
  }

  get currentStatus(): ConnectionStatus {
    return this.status;
  }

  start(): void {
    if (this.disposed) return;
    if (!this.options.urls.ok) {
      this.setStatus({ kind: "misconfigured", reason: this.options.urls.reason });
      return;
    }
    void this.connect(this.options.urls.urls);
  }

  /** Starts a new cycle of attempts. Only has an effect while offline. */
  retry(): void {
    if (this.disposed || this.status.kind !== "offline" || !this.options.urls.ok) {
      return;
    }
    this.retries = 0;
    void this.connect(this.options.urls.urls);
  }

  /** Stops everything. No callbacks, timers or reconnects happen afterwards. */
  dispose(): void {
    if (this.disposed) return;
    this.endAttempt();
    this.setStatus({ kind: "closed" });
    this.disposed = true;
  }

  private async connect(urls: ServerUrls): Promise<void> {
    this.endAttempt();
    const id = this.attemptId;
    this.setStatus({ kind: "connecting", attempt: this.retries + 1 });

    let serverVersion: string;
    try {
      serverVersion = await this.fetchHealth(urls.healthUrl);
    } catch (error) {
      if (id !== this.attemptId) return;
      console.warn("[network] Health check failed", error);
      this.fail();
      return;
    }
    if (id !== this.attemptId) return;

    this.openSocket(urls.wsUrl, serverVersion, id);
  }

  private async fetchHealth(url: string): Promise<string> {
    const request = new AbortController();
    this.healthRequest = request;
    const timeout = setTimeout(() => request.abort(), HEALTH_TIMEOUT_MS);
    try {
      const response = await this.fetchFn(url, {
        signal: request.signal,
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body: unknown = await response.json();
      if (!isHealthResponse(body)) throw new Error("Invalid health response");
      return body.version;
    } finally {
      clearTimeout(timeout);
      if (this.healthRequest === request) this.healthRequest = null;
    }
  }

  private openSocket(url: string, serverVersion: string, id: number): void {
    const socket = this.createSocket(url);
    this.socket = socket;

    this.welcomeTimer = setTimeout(() => {
      console.warn("[network] No welcome from server");
      this.fail();
    }, WELCOME_TIMEOUT_MS);

    socket.onopen = () => {
      if (id !== this.attemptId) return;
      this.send({ type: "hello", protocolVersion: PROTOCOL_VERSION });
    };

    socket.onmessage = (event: MessageEvent) => {
      if (id !== this.attemptId) return;
      this.handleMessage(event.data, serverVersion);
    };

    socket.onclose = (event: CloseEvent) => {
      if (id !== this.attemptId) return;
      if (event.code === CLOSE_UNSUPPORTED_PROTOCOL) {
        this.giveUpIncompatible();
        return;
      }
      console.warn(`[network] Connection closed (code ${event.code})`);
      this.fail();
    };

    // An error is always followed by a close event, which handles it.
    socket.onerror = () => {};
  }

  private handleMessage(data: unknown, serverVersion: string): void {
    if (typeof data !== "string") {
      console.warn("[network] Ignored non-text message");
      return;
    }
    const decoded = decodeServerMessage(data);
    if (!decoded.ok) {
      console.warn("[network] Ignored invalid message from server");
      return;
    }

    const message = decoded.message;
    switch (message.type) {
      case "welcome": {
        if (this.status.kind === "connected") return;
        clearTimeout(this.welcomeTimer);
        this.retries = 0;
        this.setStatus({ kind: "connected", serverVersion });
        this.pingTimer = setInterval(() => this.sendPing(), PING_INTERVAL_MS);
        return;
      }
      case "pong": {
        if (this.status.kind !== "connected") return;
        clearTimeout(this.pongTimer);
        this.pongTimer = undefined;
        this.setStatus({
          kind: "connected",
          serverVersion: this.status.serverVersion,
          rttMs: Math.max(0, Date.now() - message.sentAt),
        });
        return;
      }
      case "error": {
        if (message.error.code === "UNSUPPORTED_PROTOCOL_VERSION") {
          this.giveUpIncompatible();
          return;
        }
        console.warn(`[network] Server error ${message.error.code}`);
        return;
      }
    }
  }

  private sendPing(): void {
    this.send({ type: "ping", sentAt: Date.now() });
    if (this.pongTimer === undefined) {
      this.pongTimer = setTimeout(() => {
        console.warn("[network] No pong from server");
        this.fail();
      }, PONG_TIMEOUT_MS);
    }
  }

  private send(message: ClientMessage): void {
    if (this.socket?.readyState === SOCKET_OPEN) {
      this.socket.send(JSON.stringify(message));
    }
  }

  /** Ends the current attempt and schedules a retry, or goes offline. */
  private fail(): void {
    this.endAttempt();
    if (this.retries >= MAX_RETRIES || !this.options.urls.ok) {
      this.setStatus({ kind: "offline" });
      return;
    }

    this.retries += 1;
    const delay = backoffDelay(this.retries, this.random);
    const urls = this.options.urls.urls;
    this.setStatus({
      kind: "reconnecting",
      attempt: this.retries,
      maxAttempts: MAX_RETRIES,
      retryInMs: delay,
    });
    this.retryTimer = setTimeout(() => void this.connect(urls), delay);
  }

  private giveUpIncompatible(): void {
    this.endAttempt();
    this.setStatus({ kind: "incompatible" });
  }

  /** Cancels the current attempt: timers, pending request and socket. */
  private endAttempt(): void {
    this.attemptId += 1;

    clearTimeout(this.retryTimer);
    clearTimeout(this.welcomeTimer);
    clearTimeout(this.pongTimer);
    clearInterval(this.pingTimer);
    this.retryTimer = undefined;
    this.welcomeTimer = undefined;
    this.pongTimer = undefined;
    this.pingTimer = undefined;

    this.healthRequest?.abort();
    this.healthRequest = null;

    const socket = this.socket;
    this.socket = null;
    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onclose = null;
      socket.onerror = null;
      if (
        socket.readyState === SOCKET_CONNECTING ||
        socket.readyState === SOCKET_OPEN
      ) {
        socket.close(CLOSE_NORMAL);
      }
    }
  }

  private setStatus(status: ConnectionStatus): void {
    if (this.disposed) return;
    this.status = status;
    this.options.onStatus(status);
  }
}
