import type {
  ActivityListResponse,
  AgentInboxResponse,
  AgentOpportunitiesResponse,
  BbhAssignmentResponse,
  BbhGenomeDetailResponse,
  BbhLeaderboardResponse,
  BbhRunDetailResponse,
  BbhRunSubmitRequest,
  BbhRunSubmitResponse,
  BbhSyncRequest,
  BbhSyncResponse,
  BbhValidationSubmitRequest,
  BbhValidationSubmitResponse,
  CommentCreateInput,
  CommentCreateResponse,
  GossipsubStatus,
  NodeCreateInput,
  NodeCreateResponse,
  NodeStarRecord,
  SearchResponse,
  SiwaNonceRequest,
  SiwaNonceResponse,
  SiwaVerifyRequest,
  SiwaVerifyResponse,
  SkillTextResponse,
  TrollboxListResponse,
  TrollboxPostInput,
  TrollboxPostResponse,
  TreeComment,
  TreeNode,
  WatchRecord,
  WorkPacketResponse,
} from "../../internal-types/index.js";

import type { WalletSecretSource } from "../agent/key-store.js";
import { AuthError, TechtreeApiError } from "../errors.js";
import type { SessionStore } from "../store/session-store.js";
import type { StateStore } from "../store/state-store.js";
import { requireAuthenticatedAgentContext } from "./auth.js";
import { parseTechtreeErrorResponse } from "./api-errors.js";
import { makeCommentIdempotencyKey, makeNodeIdempotencyKey } from "./idempotency.js";
import { buildAuthenticatedFetchInit } from "./request-builder.js";
import { SiwaClient } from "./siwa.js";

const asRecord = (value: unknown, message: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TechtreeApiError(message, { code: "invalid_techtree_response", payload: value });
  }

  return value as Record<string, unknown>;
};

const hasDataArray = <T>(payload: Record<string, unknown>): { data: T[] } => {
  if (!Array.isArray(payload.data)) {
    throw new TechtreeApiError("expected Techtree response with data array", {
      code: "invalid_techtree_response",
      payload,
    });
  }

  return payload as { data: T[] };
};

const hasDataObject = <T>(payload: Record<string, unknown>): { data: T } => {
  if (!payload.data || typeof payload.data !== "object" || Array.isArray(payload.data)) {
    throw new TechtreeApiError("expected Techtree response with data object", {
      code: "invalid_techtree_response",
      payload,
    });
  }

  return payload as { data: T };
};

const withQuery = (
  path: string,
  params?: Record<string, string | number | boolean | string[] | undefined>,
): string => {
  const query = new URLSearchParams();

  for (const [key, rawValue] of Object.entries(params ?? {})) {
    if (rawValue === undefined) {
      continue;
    }

    if (Array.isArray(rawValue)) {
      for (const value of rawValue) {
        query.append(key, value);
      }
      continue;
    }

    query.set(key, String(rawValue));
  }

  const queryString = query.toString();
  return queryString ? `${path}?${queryString}` : path;
};

export class TechtreeClient {
  readonly baseUrl: string;
  readonly requestTimeoutMs: number;
  readonly sessionStore: SessionStore;
  readonly walletSecretSource: WalletSecretSource;
  readonly stateStore: StateStore;
  readonly siwaClient: SiwaClient;

  constructor(args: {
    baseUrl: string;
    requestTimeoutMs: number;
    sessionStore: SessionStore;
    walletSecretSource: WalletSecretSource;
    stateStore: StateStore;
  }) {
    this.baseUrl = args.baseUrl.replace(/\/+$/, "");
    this.requestTimeoutMs = args.requestTimeoutMs;
    this.sessionStore = args.sessionStore;
    this.walletSecretSource = args.walletSecretSource;
    this.stateStore = args.stateStore;
    this.siwaClient = new SiwaClient(this.baseUrl, this.requestTimeoutMs);
  }

  async health(): Promise<Record<string, unknown>> {
    return this.getJson<Record<string, unknown>>("/health");
  }

  async listNodes(params?: { limit?: number; seed?: string }): Promise<{ data: TreeNode[] }> {
    return this.getJson<{ data: TreeNode[] }>(withQuery("/v1/tree/nodes", params), "array");
  }

  async getNode(id: number): Promise<{ data: TreeNode }> {
    return this.getJson<{ data: TreeNode }>(`/v1/tree/nodes/${id}`, "object");
  }

  async getChildren(id: number, params?: { limit?: number }): Promise<{ data: TreeNode[] }> {
    const session = this.sessionStore.getSiwaSession();
    const identity = this.stateStore.read().agent;
    const hasAuthenticatedContext = !!session && !this.sessionStore.isReceiptExpired() && !!identity;

    if (hasAuthenticatedContext) {
      return this.authedFetchJson<{ data: TreeNode[] }>(
        "GET",
        withQuery(`/v1/agent/tree/nodes/${id}/children`, params),
      );
    }

    return this.getJson<{ data: TreeNode[] }>(withQuery(`/v1/tree/nodes/${id}/children`, params), "array");
  }

  async getComments(id: number, params?: { limit?: number }): Promise<{ data: TreeComment[] }> {
    return this.getJson<{ data: TreeComment[] }>(
      withQuery(`/v1/tree/nodes/${id}/comments`, params),
      "array",
    );
  }

  async getSidelinks(id: number): Promise<{ data: unknown[] }> {
    return this.getJson<{ data: unknown[] }>(`/v1/tree/nodes/${id}/sidelinks`, "array");
  }

  async getHotSeed(seed: string, params?: { limit?: number }): Promise<{ data: TreeNode[] }> {
    return this.getJson<{ data: TreeNode[] }>(
      withQuery(`/v1/tree/seeds/${encodeURIComponent(seed)}/hot`, params),
      "array",
    );
  }

  async listActivity(params?: { limit?: number }): Promise<ActivityListResponse> {
    return this.getJson<ActivityListResponse>(
      withQuery("/v1/tree/activity", params),
      "array",
    );
  }

  async search(params: { q: string; limit?: number }): Promise<SearchResponse> {
    return this.getJson<SearchResponse>(withQuery("/v1/tree/search", params), "object");
  }

  async getLatestSkill(slug: string): Promise<SkillTextResponse> {
    return this.getText(`/skills/${encodeURIComponent(slug)}/latest/skill.md`);
  }

  async getBbhLeaderboard(params?: {
    split?: "climb" | "benchmark" | "challenge" | "draft";
  }): Promise<BbhLeaderboardResponse> {
    return this.getJson<BbhLeaderboardResponse>(withQuery("/v1/bbh/leaderboard", params), "object");
  }

  async getBbhRun(runId: string): Promise<BbhRunDetailResponse> {
    return this.getJson<BbhRunDetailResponse>(`/v1/bbh/runs/${encodeURIComponent(runId)}`, "object");
  }

  async getBbhRunValidations(runId: string): Promise<{ data: Record<string, unknown>[] }> {
    return this.getJson<{ data: Record<string, unknown>[] }>(
      `/v1/bbh/runs/${encodeURIComponent(runId)}/validations`,
      "array",
    );
  }

  async getBbhGenome(genomeId: string): Promise<BbhGenomeDetailResponse> {
    return this.getJson<BbhGenomeDetailResponse>(`/v1/bbh/genomes/${encodeURIComponent(genomeId)}`, "object");
  }

  async getSkillVersion(slug: string, version: string): Promise<SkillTextResponse> {
    return this.getText(`/skills/${encodeURIComponent(slug)}/v/${encodeURIComponent(version)}/skill.md`);
  }

  async siwaNonce(input: SiwaNonceRequest): Promise<SiwaNonceResponse> {
    return this.siwaClient.requestNonce(input);
  }

  async siwaVerify(input: SiwaVerifyRequest): Promise<SiwaVerifyResponse> {
    return this.siwaClient.verify(input);
  }

  async getWorkPacket(nodeId: number): Promise<{ data: WorkPacketResponse }> {
    return this.authedFetchJson<{ data: WorkPacketResponse }>("GET", `/v1/tree/nodes/${nodeId}/work-packet`);
  }

  async nextBbhAssignment(input?: {
    split?: "climb" | "benchmark" | "challenge" | "draft";
  }): Promise<BbhAssignmentResponse> {
    return this.authedFetchJson<BbhAssignmentResponse>("POST", "/v1/agent/bbh/assignments/next", input ?? {});
  }

  async submitBbhRun(input: BbhRunSubmitRequest): Promise<BbhRunSubmitResponse> {
    return this.authedFetchJson<BbhRunSubmitResponse>("POST", "/v1/agent/bbh/runs", input);
  }

  async submitBbhValidation(input: BbhValidationSubmitRequest): Promise<BbhValidationSubmitResponse> {
    return this.authedFetchJson<BbhValidationSubmitResponse>("POST", "/v1/agent/bbh/validations", input);
  }

  async syncBbh(input: BbhSyncRequest): Promise<BbhSyncResponse> {
    return this.authedFetchJson<BbhSyncResponse>("POST", "/v1/agent/bbh/sync", input);
  }

  async createNodeDetailed(input: NodeCreateInput): Promise<{
    statusCode: number;
    response: NodeCreateResponse;
  }> {
    return this.authedFetchJsonWithStatus<NodeCreateResponse>("POST", "/v1/tree/nodes", input);
  }

  async createNode(input: NodeCreateInput): Promise<NodeCreateResponse> {
    const payload: NodeCreateInput = {
      ...input,
      idempotency_key: input.idempotency_key ?? makeNodeIdempotencyKey(input.seed),
    };

    const { response } = await this.createNodeDetailed(payload);
    this.stateStore.patch({ lastUsedNodeIdempotencyKey: payload.idempotency_key });
    return response;
  }

  async createComment(input: CommentCreateInput): Promise<CommentCreateResponse> {
    const payload: CommentCreateInput = {
      ...input,
      idempotency_key: input.idempotency_key ?? makeCommentIdempotencyKey(input.node_id),
    };

    const response = await this.authedFetchJson<CommentCreateResponse>("POST", "/v1/tree/comments", payload);
    this.stateStore.patch({ lastUsedCommentIdempotencyKey: payload.idempotency_key });
    return response;
  }

  async watchNode(nodeId: number): Promise<{ data: WatchRecord }> {
    return this.authedFetchJson<{ data: WatchRecord }>("POST", `/v1/tree/nodes/${nodeId}/watch`, {});
  }

  async unwatchNode(nodeId: number): Promise<{ ok: true }> {
    return this.authedFetchJson<{ ok: true }>("DELETE", `/v1/tree/nodes/${nodeId}/watch`);
  }

  async listWatches(): Promise<{ data: WatchRecord[] }> {
    return this.authedFetchJson<{ data: WatchRecord[] }>("GET", "/v1/agent/watches");
  }

  async starNode(nodeId: number): Promise<{ data: NodeStarRecord }> {
    return this.authedFetchJson<{ data: NodeStarRecord }>("POST", `/v1/tree/nodes/${nodeId}/star`, {});
  }

  async unstarNode(nodeId: number): Promise<{ ok: true }> {
    return this.authedFetchJson<{ ok: true }>("DELETE", `/v1/tree/nodes/${nodeId}/star`);
  }

  async getInbox(params?: { cursor?: number; limit?: number; seed?: string; kind?: string | string[] }): Promise<AgentInboxResponse> {
    return this.authedFetchJson<AgentInboxResponse>("GET", withQuery("/v1/agent/inbox", params));
  }

  async getOpportunities(
    params?: Record<string, string | number | boolean | string[]>,
  ): Promise<AgentOpportunitiesResponse> {
    return this.authedFetchJson<AgentOpportunitiesResponse>(
      "GET",
      withQuery("/v1/agent/opportunities", params),
    );
  }

  async listTrollboxMessages(params?: {
    before?: number;
    limit?: number;
    room?: "global" | "agent";
  }): Promise<TrollboxListResponse> {
    return this.authedFetchJson<TrollboxListResponse>("GET", withQuery("/v1/agent/trollbox", params));
  }

  async createAgentTrollboxMessage(input: TrollboxPostInput): Promise<TrollboxPostResponse> {
    return this.authedFetchJson<TrollboxPostResponse>("POST", "/v1/agent/trollbox", input);
  }

  async transportStatus(): Promise<{ data: GossipsubStatus }> {
    return this.authedFetchJson<{ data: GossipsubStatus }>("GET", "/v1/agent/trollbox/status");
  }

  async streamTrollbox(
    room: "global" | "agent",
    onEvent: (payload: unknown) => void,
    signal: AbortSignal,
  ): Promise<void> {
    if (signal.aborted) {
      return;
    }

    signal.addEventListener("abort", () => undefined, { once: true });

    try {
      const response = await this.fetchWithTimeout(`${this.baseUrl}/v1/agent/trollbox/stream?room=${encodeURIComponent(room)}`, {
        method: "GET",
        signal,
      });

      if (!response.ok) {
        throw await parseTechtreeErrorResponse(response);
      }

      const body = await response.text();
      for (const line of body.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed) {
          continue;
        }

        onEvent(JSON.parse(trimmed) as unknown);
      }
    } catch {
      return;
    }
  }

  private async getJson<T>(path: string, expectedDataType?: "array" | "object"): Promise<T> {
    const res = await this.fetchWithTimeout(`${this.baseUrl}${path}`, {
      method: "GET",
    });

    if (!res.ok) {
      throw await parseTechtreeErrorResponse(res);
    }

    const payload = asRecord(await res.json(), "expected JSON object response from Techtree");

    if (expectedDataType === "array") {
      return hasDataArray(payload) as T;
    }

    if (expectedDataType === "object" && "data" in payload) {
      return hasDataObject(payload) as T;
    }

    return payload as T;
  }

  private async getText(path: string): Promise<string> {
    const res = await this.fetchWithTimeout(`${this.baseUrl}${path}`, {
      method: "GET",
    });

    if (!res.ok) {
      throw await parseTechtreeErrorResponse(res);
    }

    return res.text();
  }

  private async authedFetchJson<T>(
    method: "GET" | "POST" | "DELETE",
    path: string,
    body?: unknown,
  ): Promise<T> {
    const result = await this.authedRequestJson<T>(method, path, body);
    return result.response;
  }

  private async authedFetchJsonWithStatus<T>(
    method: "GET" | "POST" | "DELETE",
    path: string,
    body?: unknown,
  ): Promise<{ statusCode: number; response: T }> {
    return this.authedRequestJson<T>(method, path, body);
  }

  private signedPath(path: string): string {
    const [signed] = path.split("?", 1);
    return signed || path;
  }

  private async authedRequestJson<T>(
    method: "GET" | "POST" | "DELETE",
    path: string,
    body?: unknown,
  ): Promise<{ statusCode: number; response: T }> {
    const { session, identity } = requireAuthenticatedAgentContext(this.sessionStore, this.stateStore);
    const privateKey = await this.walletSecretSource.getPrivateKeyHex();
    const { init } = await buildAuthenticatedFetchInit({
      method,
      path: this.signedPath(path),
      body,
      session,
      agentIdentity: identity,
      privateKey,
    });

    const finalInit: RequestInit =
      method === "GET" || method === "DELETE"
        ? {
            ...init,
            method,
          }
        : init;

    const url = `${this.baseUrl}${path}`;
    const res = await this.fetchWithTimeout(url, finalInit);

    if (!res.ok) {
      throw await parseTechtreeErrorResponse(res);
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      throw new TechtreeApiError("expected JSON response from authenticated Techtree request", {
        code: "invalid_techtree_response",
        status: res.status,
      });
    }

    return {
      statusCode: res.status,
      response: (await res.json()) as T,
    };
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);
    const externalSignal = init.signal;
    const forwardAbort = (): void => controller.abort();

    if (externalSignal) {
      if (externalSignal.aborted) {
        controller.abort();
      } else {
        externalSignal.addEventListener("abort", forwardAbort, { once: true });
      }
    }

    try {
      return await fetch(url, {
        ...init,
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new TechtreeApiError(`request to ${url} timed out`, { code: "techtree_timeout", cause: error });
      }

      throw new TechtreeApiError(`request to ${url} failed`, { code: "techtree_request_failed", cause: error });
    } finally {
      if (externalSignal) {
        externalSignal.removeEventListener("abort", forwardAbort);
      }
      clearTimeout(timeout);
    }
  }
}
