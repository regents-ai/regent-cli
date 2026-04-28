import { loadConfig } from "../internal-runtime/config.js";
import type { SiwaAudience } from "../internal-types/index.js";
import type { ParsedCliArgs } from "../parse.js";

import { buildAgentAuthHeaders } from "./agent-auth.js";

export interface SharedServicesRequestOptions {
  readonly body?: unknown;
  readonly requireAgentAuth?: boolean;
  readonly authAudience?: SiwaAudience;
  readonly configPath?: string;
}

interface JsonObject {
  readonly [key: string]: unknown;
}

const sharedServicesBaseUrl = (configPath?: string): string =>
  loadConfig(configPath).auth.baseUrl.replace(/\/+$/u, "");

const failIfNotObject = (value: unknown): JsonObject => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Regent services returned a non-object payload");
  }

  return value as JsonObject;
};

const requestRawJson = async <T>(
  method: string,
  path: string,
  options: SharedServicesRequestOptions = {},
): Promise<T> => {
  const headers = new Headers({ accept: "application/json" });
  const bodyText = options.body === undefined ? undefined : JSON.stringify(options.body);

  if (bodyText !== undefined) {
    headers.set("content-type", "application/json");
  }

  if (options.requireAgentAuth) {
    const authHeaders = await buildAgentAuthHeaders({
      method,
      path,
      ...(bodyText === undefined ? {} : { body: bodyText }),
      configPath: options.configPath,
      audience: options.authAudience ?? "regent-services",
    });

    for (const [key, value] of Object.entries(authHeaders)) {
      headers.set(key, value);
    }
  }

  const response = await fetch(`${sharedServicesBaseUrl(options.configPath)}${path}`, {
    method,
    headers,
    body: bodyText,
  });

  const text = await response.text();
  const parsed = text ? failIfNotObject(JSON.parse(text) as unknown) : {};

  if (!response.ok) {
    throw new Error(JSON.stringify(parsed, null, 2));
  }

  return parsed as T;
};

export const requestTypedJson = async <T>(
  method: string,
  path: string,
  options: SharedServicesRequestOptions = {},
): Promise<T> => requestRawJson<T>(method, path, options);

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
