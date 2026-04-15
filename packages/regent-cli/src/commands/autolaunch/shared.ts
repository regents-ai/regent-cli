import { buildAgentAuthHeaders } from "../agent-auth.js";
import { getFlag, requireArg, type ParsedCliArgs } from "../../parse.js";

const DEFAULT_BASE_URL = "http://127.0.0.1:4010";
export const AGENT_PRIVATE_KEY_ENV = "AUTOLAUNCH_AGENT_PRIVATE_KEY";

export interface JsonObject {
  readonly [key: string]: JsonValue;
}

type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];

export interface RequestOptions {
  readonly body?: unknown;
  readonly requireAgentAuth?: boolean;
  readonly configPath?: string;
}

export type AutolaunchChainId = "11155111";

const AUTOLAUNCH_CHAIN_IDS: Readonly<Record<string, string>> = {
  sepolia: "11155111",
  ethereum: "11155111",
  "ethereum-sepolia": "11155111",
};

export const baseUrl = (): string => {
  return (process.env.AUTOLAUNCH_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
};

export const failIfNotObject = (value: unknown): JsonObject => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("autolaunch API returned a non-object payload");
  }

  return value as JsonObject;
};

export const requestJson = async (
  method: string,
  path: string,
  options: RequestOptions = {},
): Promise<JsonObject> => {
  const headers = new Headers({ accept: "application/json" });

  if (options.body) {
    headers.set("content-type", "application/json");
  }

  if (options.requireAgentAuth) {
    const authHeaders = await buildAgentAuthHeaders({
      method,
      path,
      configPath: options.configPath,
    });

    for (const [key, value] of Object.entries(authHeaders)) {
      headers.set(key, value);
    }
  }

  const response = await fetch(`${baseUrl()}${path}`, {
    method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  const parsed = text ? failIfNotObject(JSON.parse(text) as unknown) : {};

  if (!response.ok) {
    throw new Error(JSON.stringify(parsed, null, 2));
  }

  return parsed;
};

export const requestTypedJson = async <T>(
  method: string,
  path: string,
  options: RequestOptions = {},
): Promise<T> => {
  const headers = new Headers({ accept: "application/json" });

  if (options.body) {
    headers.set("content-type", "application/json");
  }

  if (options.requireAgentAuth) {
    const authHeaders = await buildAgentAuthHeaders({
      method,
      path,
      configPath: options.configPath,
    });

    for (const [key, value] of Object.entries(authHeaders)) {
      headers.set(key, value);
    }
  }

  const response = await fetch(`${baseUrl()}${path}`, {
    method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  const parsed = text ? failIfNotObject(JSON.parse(text) as unknown) : {};

  if (!response.ok) {
    throw new Error(JSON.stringify(parsed, null, 2));
  }

  return parsed as T;
};

export const appendQuery = (
  path: string,
  params: Record<string, string | undefined | boolean>,
): string => {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "" || value === false) {
      continue;
    }

    search.set(key, value === true ? "true" : String(value));
  }

  const query = search.toString();
  return query ? `${path}?${query}` : path;
};

export const requirePositional = (
  args: ParsedCliArgs,
  index: number,
  label: string,
): string => {
  const value = args.positionals[index];
  if (!value) {
    throw new Error(`missing required positional argument: ${label}`);
  }

  return value;
};

export const launchChainId = (args: ParsedCliArgs): string => {
  const explicit = getFlag(args, "chain-id");
  if (explicit) {
    return explicit;
  }

  const chain = (getFlag(args, "chain") ?? "sepolia").toLowerCase();
  return AUTOLAUNCH_CHAIN_IDS[chain] ?? chain;
};

export const autolaunchChainId = (args: ParsedCliArgs): AutolaunchChainId => {
  const resolved = launchChainId(args);
  if (resolved === "11155111") {
    return resolved;
  }

  throw new Error("autolaunch only supports Ethereum Sepolia (11155111)");
};

export const requireLaunchIdentity = (args: ParsedCliArgs) => {
  const chainId = autolaunchChainId(args);
  const agentSafeAddress = requireArg(getFlag(args, "agent-safe-address"), "agent-safe-address");

  return {
    agent: requireArg(getFlag(args, "agent"), "agent"),
    chainId,
    name: requireArg(getFlag(args, "name"), "name"),
    symbol: requireArg(getFlag(args, "symbol"), "symbol"),
    agentSafeAddress,
  };
};

export const parsePollingIntervalSeconds = (
  args: ParsedCliArgs,
  flagName = "interval",
  fallbackSeconds = 2,
): number => {
  const rawValue = getFlag(args, flagName);
  if (rawValue === undefined) {
    return fallbackSeconds;
  }

  const parsedValue = Number.parseFloat(rawValue);
  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    throw new Error(`--${flagName} must be a positive number`);
  }

  return parsedValue;
};
