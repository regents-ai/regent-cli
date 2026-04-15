import type { LocalAgentIdentity, SiwaSession } from "../../internal-types/index.js";

import { buildSignedAgentHeaders } from "./signing.js";

const AUTH_DEBUG_HEADER_NAMES = [
  "x-siwa-receipt",
  "x-key-id",
  "x-timestamp",
  "x-agent-wallet-address",
  "x-agent-chain-id",
  "x-agent-registry-address",
  "x-agent-token-id",
  "signature-input",
  "signature",
  "content-type",
] as const;

type AuthDebugHeaderName = (typeof AUTH_DEBUG_HEADER_NAMES)[number];

export interface ProtectedTechtreeAuthDebugSnapshot {
  method: AuthenticatedRequestInput["method"];
  signedPath: string;
  finalUrl: string;
  serializedJsonBody: string | null;
  authHeaders: Record<AuthDebugHeaderName, string | null>;
}

export interface ProtectedTechtreeAuthFailureDebugSnapshot {
  status: number;
  statusText: string;
  responseHeaders: Record<string, string>;
  responseBody: string;
}

export interface AuthenticatedRequestInput {
  method: "GET" | "POST" | "DELETE" | "PATCH" | "PUT";
  path: string;
  body?: unknown;
  session: SiwaSession;
  agentIdentity: LocalAgentIdentity;
  privateKey: `0x${string}`;
}

const serializeJsonBody = (body: unknown): string | undefined => (body === undefined ? undefined : JSON.stringify(body));

const headerEntries = (headers: RequestInit["headers"]): [string, string][] => {
  if (headers instanceof Headers) {
    return [...headers.entries()];
  }

  if (Array.isArray(headers)) {
    return headers.map(([key, value]) => [key, Array.isArray(value) ? value.join(", ") : String(value)]);
  }

  return Object.entries(headers ?? {}).map(([key, value]) => [key, Array.isArray(value) ? value.join(", ") : String(value)]);
};

export async function buildAuthenticatedFetchInit(
  input: AuthenticatedRequestInput,
): Promise<{ urlPath: string; serializedJsonBody?: string; init: RequestInit }> {
  const serializedBody = serializeJsonBody(input.body);
  const signedHeaders = await buildSignedAgentHeaders({
    method: input.method,
    path: input.path,
    walletAddress: input.agentIdentity.walletAddress,
    chainId: input.agentIdentity.chainId,
    registryAddress: input.agentIdentity.registryAddress,
    tokenId: input.agentIdentity.tokenId,
    receipt: input.session.receipt,
    privateKey: input.privateKey,
  });

  const headers: Record<string, string> = {
    ...signedHeaders,
  };

  if (serializedBody !== undefined) {
    headers["content-type"] = "application/json";
  }

  return {
    urlPath: input.path,
    ...(serializedBody === undefined ? {} : { serializedJsonBody: serializedBody }),
    init: {
      method: input.method,
      headers,
      ...(serializedBody === undefined ? {} : { body: serializedBody }),
    },
  };
}

export const protectedWriteAuthDebugEnabled = (): boolean => {
  return process.env.REGENT_PROTECTED_WRITE_AUTH_DEBUG === "1";
};

export const buildProtectedTechtreeAuthDebugSnapshot = (input: {
  method: AuthenticatedRequestInput["method"];
  signedPath: string;
  finalUrl: string;
  serializedJsonBody?: string;
  headers: RequestInit["headers"];
}): ProtectedTechtreeAuthDebugSnapshot => {
  const lowerCaseHeaders = new Map(
    headerEntries(input.headers).map(([key, value]) => [key.toLowerCase(), value]),
  );

  return {
    method: input.method,
    signedPath: input.signedPath,
    finalUrl: input.finalUrl,
    serializedJsonBody: input.serializedJsonBody ?? null,
    authHeaders: Object.fromEntries(
      AUTH_DEBUG_HEADER_NAMES.map((name) => [name, lowerCaseHeaders.get(name) ?? null]),
    ) as ProtectedTechtreeAuthDebugSnapshot["authHeaders"],
  };
};

export const emitProtectedWriteAuthDebug = (_event: string, _payload: unknown): void => {
  if (!protectedWriteAuthDebugEnabled()) {
    return;
  }
};

export const captureProtectedWriteAuthFailureDebug = async (
  _response: Response,
): Promise<ProtectedTechtreeAuthFailureDebugSnapshot | null> => {
  return null;
};
