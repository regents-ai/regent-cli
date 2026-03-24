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
  method: "GET" | "POST" | "DELETE";
  path: string;
  body?: unknown;
  session: SiwaSession;
  agentIdentity: LocalAgentIdentity;
  privateKey: `0x${string}`;
}

export async function buildAuthenticatedFetchInit(
  input: AuthenticatedRequestInput,
): Promise<{ urlPath: string; serializedJsonBody?: string; init: RequestInit }> {
  const serializedBody = input.body === undefined ? undefined : JSON.stringify(input.body);
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
  const headerEntries =
    input.headers instanceof Headers
      ? [...input.headers.entries()]
      : Array.isArray(input.headers)
        ? input.headers
        : Object.entries(input.headers ?? {});

  const lowerCaseHeaders = new Map(
    headerEntries.map(([key, value]) => [key.toLowerCase(), Array.isArray(value) ? value.join(", ") : String(value)]),
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
