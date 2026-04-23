import type {
  BbhAssignmentResponse,
  BbhCapsuleGetResponse,
  BbhCapsuleListResponse,
  BbhCertificateVerifyResponse,
  BbhDraftCreateRequest,
  BbhDraftGetResponse,
  BbhDraftListResponse,
  BbhDraftProposal,
  BbhDraftProposalListResponse,
  BbhDraftProposalSubmitRequest,
  BbhGenomeDetailResponse,
  BbhLeaderboardResponse,
  BbhRunDetailResponse,
  BbhRunSubmitRequest,
  BbhRunSubmitResponse,
  BbhSyncRequest,
  BbhSyncResponse,
  BbhValidationSubmitRequest,
  BbhValidationSubmitResponse,
} from "../../../internal-types/index.js";
import type { TechtreeRequestClient } from "./request.js";
import { withQuery } from "./request.js";

export class BbhResource {
  constructor(private readonly request: TechtreeRequestClient) {}

  async getBbhLeaderboard(params?: {
    split?: "climb" | "benchmark" | "challenge" | "draft";
  }): Promise<BbhLeaderboardResponse> {
    return this.request.getJson<BbhLeaderboardResponse>(withQuery("/v1/bbh/leaderboard", params), "object");
  }

  async listBbhCapsules(params?: {
    split?: "climb" | "benchmark" | "challenge";
  }): Promise<BbhCapsuleListResponse> {
    return this.request.getJson<BbhCapsuleListResponse>(withQuery("/v1/bbh/capsules", params), "array");
  }

  async getBbhCapsule(capsuleId: string): Promise<BbhCapsuleGetResponse> {
    return this.request.getJson<BbhCapsuleGetResponse>(`/v1/bbh/capsules/${encodeURIComponent(capsuleId)}`, "object");
  }

  async getBbhRun(runId: string): Promise<BbhRunDetailResponse> {
    return this.request.getJson<BbhRunDetailResponse>(`/v1/bbh/runs/${encodeURIComponent(runId)}`, "object");
  }

  async getBbhRunValidations(runId: string): Promise<{ data: Record<string, unknown>[] }> {
    return this.request.getJson<{ data: Record<string, unknown>[] }>(
      `/v1/bbh/runs/${encodeURIComponent(runId)}/validations`,
      "array",
    );
  }

  async getBbhGenome(genomeId: string): Promise<BbhGenomeDetailResponse> {
    return this.request.getJson<BbhGenomeDetailResponse>(`/v1/bbh/genomes/${encodeURIComponent(genomeId)}`, "object");
  }

  async nextBbhAssignment(input?: {
    split?: "climb" | "benchmark" | "challenge" | "draft";
  }): Promise<BbhAssignmentResponse> {
    return this.request.authedFetchJson<BbhAssignmentResponse>("POST", "/v1/agent/bbh/assignments/next", input ?? {});
  }

  async selectBbhAssignment(input: { capsule_id: string }): Promise<BbhAssignmentResponse> {
    return this.request.authedFetchJson<BbhAssignmentResponse>("POST", "/v1/agent/bbh/assignments/select", input);
  }

  async createBbhDraft(input: BbhDraftCreateRequest): Promise<BbhDraftGetResponse> {
    return this.request.authedFetchJson<BbhDraftGetResponse>("POST", "/v1/agent/bbh/drafts", input);
  }

  async listBbhDrafts(): Promise<BbhDraftListResponse> {
    return this.request.authedFetchJson<BbhDraftListResponse>("GET", "/v1/agent/bbh/drafts");
  }

  async getBbhDraft(capsuleId: string): Promise<BbhDraftGetResponse> {
    return this.request.authedFetchJson<BbhDraftGetResponse>("GET", `/v1/agent/bbh/drafts/${encodeURIComponent(capsuleId)}`);
  }

  async createBbhDraftProposal(capsuleId: string, input: BbhDraftProposalSubmitRequest): Promise<{
    data: {
      proposal: BbhDraftProposal;
    };
  }> {
    return this.request.authedFetchJson("POST", `/v1/agent/bbh/drafts/${encodeURIComponent(capsuleId)}/proposals`, input);
  }

  async listBbhDraftProposals(capsuleId: string): Promise<BbhDraftProposalListResponse> {
    return this.request.authedFetchJson<BbhDraftProposalListResponse>(
      "GET",
      `/v1/agent/bbh/drafts/${encodeURIComponent(capsuleId)}/proposals`,
    );
  }

  async applyBbhDraftProposal(capsuleId: string, proposalId: string): Promise<BbhDraftGetResponse> {
    return this.request.authedFetchJson<BbhDraftGetResponse>(
      "POST",
      `/v1/agent/bbh/drafts/${encodeURIComponent(capsuleId)}/proposals/${encodeURIComponent(proposalId)}/apply`,
      {},
    );
  }

  async readyBbhDraft(capsuleId: string): Promise<BbhDraftGetResponse> {
    return this.request.authedFetchJson<BbhDraftGetResponse>(
      "POST",
      `/v1/agent/bbh/drafts/${encodeURIComponent(capsuleId)}/ready`,
      {},
    );
  }

  async verifyBbhCertificate(capsuleId: string): Promise<BbhCertificateVerifyResponse> {
    return this.request.getJson<BbhCertificateVerifyResponse>(
      `/v1/bbh/capsules/${encodeURIComponent(capsuleId)}/certificate`,
      "object",
    );
  }

  async submitBbhRun(input: BbhRunSubmitRequest): Promise<BbhRunSubmitResponse> {
    return this.request.authedFetchJson<BbhRunSubmitResponse>("POST", "/v1/agent/bbh/runs", input);
  }

  async submitBbhValidation(input: BbhValidationSubmitRequest): Promise<BbhValidationSubmitResponse> {
    return this.request.authedFetchJson<BbhValidationSubmitResponse>("POST", "/v1/agent/bbh/validations", input);
  }

  async syncBbh(input: BbhSyncRequest): Promise<BbhSyncResponse> {
    return this.request.authedFetchJson<BbhSyncResponse>("POST", "/v1/agent/bbh/sync", input);
  }
}
