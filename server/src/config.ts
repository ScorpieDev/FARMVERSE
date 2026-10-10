/**
 * Server configuration read from environment variables (see .env.example).
 *
 * Invalid values fail fast at startup instead of surfacing later at runtime.
 */

const LOG_LEVELS = [
  "fatal",
  "error",
  "warn",
  "info",
  "debug",
  "trace",
  "silent",
] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

export interface ServerConfig {
  host: string;
  port: number;
  /** Only this origin may call the API from a browser (CORS). */
  clientOrigin: string;
  logLevel: LogLevel;
  /**
   * SQLite database file, relative to the server's working directory, or
   * ":memory:" for a temporary in-memory database (tests).
   */
  databasePath: string;
}

export class ConfigError extends Error {
  override name = "ConfigError";
}

const DEFAULTS = {
  HOST: "0.0.0.0",
  PORT: "3000",
  CLIENT_ORIGIN: "http://localhost:5173",
  LOG_LEVEL: "info",
  DATABASE_PATH: "data/farmverse.db",
};

function parsePort(value: string): number | undefined {
  if (!/^\d+$/.test(value)) return undefined;
  const port = Number(value);
  return port <= 65535 ? port : undefined;
}

function parseOrigin(value: string): string | undefined {
  try {
    const url = new URL(value);
    const isHttp = url.protocol === "http:" || url.protocol === "https:";
    // Must be a bare origin: no path, query or trailing slash.
    return isHttp && url.origin === value ? value : undefined;
  } catch {
    return undefined;
  }
}

function isLogLevel(value: string): value is LogLevel {
  return (LOG_LEVELS as readonly string[]).includes(value);
}

/** Reads and validates the config. Throws ConfigError listing every invalid variable. */
export function loadConfig(
  env: Record<string, string | undefined>,
): ServerConfig {
  const read = (name: keyof typeof DEFAULTS): string => {
    const value = env[name]?.trim();
    return value ? value : DEFAULTS[name];
  };

  const problems: string[] = [];

  const host = read("HOST");

  const rawPort = read("PORT");
  const port = parsePort(rawPort);
  if (port === undefined) {
    problems.push(`PORT must be an integer between 0 and 65535 (got "${rawPort}")`);
  }

  const rawOrigin = read("CLIENT_ORIGIN");
  const clientOrigin = parseOrigin(rawOrigin);
  if (clientOrigin === undefined) {
    problems.push(
      `CLIENT_ORIGIN must be an http(s) origin such as http://localhost:5173 (got "${rawOrigin}")`,
    );
  }

  const logLevel = read("LOG_LEVEL");
  if (!isLogLevel(logLevel)) {
    problems.push(`LOG_LEVEL must be one of ${LOG_LEVELS.join(", ")} (got "${logLevel}")`);
  }

  if (port === undefined || clientOrigin === undefined || !isLogLevel(logLevel)) {
    throw new ConfigError(`Invalid server configuration:\n- ${problems.join("\n- ")}`);
  }

  return { host, port, clientOrigin, logLevel, databasePath: read("DATABASE_PATH") };
}
