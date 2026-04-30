import type {
  BenchmarkAttemptCreateInput,
  BenchmarkAttemptResponse,
  BenchmarkCapsuleCreateInput,
  BenchmarkCapsuleListResponse,
  BenchmarkCapsuleResponse,
  BenchmarkHarnessCreateInput,
  BenchmarkHarnessResponse,
  BenchmarkReliabilityListResponse,
  BenchmarkScoreboardResponse,
  BenchmarkValidationCreateInput,
  BenchmarkValidationResponse,
  BenchmarkVersionCreateInput,
  BenchmarkVersionListResponse,
  BenchmarkVersionResponse,
} from "../../../internal-types/index.js";
import type { TechtreeRequestClient } from "./request.js";
import { withQuery } from "./request.js";

export class BenchmarksResource {
  constructor(private readonly request: TechtreeRequestClient) {}

  listCapsules(params?: {
    domain?: string;
    field?: string;
    status?: string;
    difficulty?: string;
    limit?: number;
  }): Promise<BenchmarkCapsuleListResponse> {
    return this.request.getJson<BenchmarkCapsuleListResponse>(
      withQuery("/v1/benchmarks/capsules", params),
      "array",
    );
  }

  getCapsule(capsuleId: string): Promise<BenchmarkCapsuleResponse> {
    return this.request.getJson<BenchmarkCapsuleResponse>(`/v1/benchmarks/capsules/${capsuleId}`, "object");
  }

  listVersions(capsuleId: string): Promise<BenchmarkVersionListResponse> {
    return this.request.getJson<BenchmarkVersionListResponse>(
      `/v1/benchmarks/capsules/${capsuleId}/versions`,
      "array",
    );
  }

  scoreboard(capsuleId: string): Promise<BenchmarkScoreboardResponse> {
    return this.request.getJson<BenchmarkScoreboardResponse>(
      `/v1/benchmarks/capsules/${capsuleId}/scoreboard`,
      "object",
    );
  }

  reliability(capsuleId: string): Promise<BenchmarkReliabilityListResponse> {
    return this.request.getJson<BenchmarkReliabilityListResponse>(
      `/v1/benchmarks/capsules/${capsuleId}/reliability`,
      "array",
    );
  }

  getHarness(harnessId: string): Promise<BenchmarkHarnessResponse> {
    return this.request.getJson<BenchmarkHarnessResponse>(`/v1/benchmarks/harnesses/${harnessId}`, "object");
  }

  createCapsule(input: BenchmarkCapsuleCreateInput): Promise<BenchmarkCapsuleResponse> {
    return this.request.authedFetchJson<BenchmarkCapsuleResponse>("POST", "/v1/agent/benchmarks/capsules", input);
  }

  createVersion(capsuleId: string, input: BenchmarkVersionCreateInput): Promise<BenchmarkVersionResponse> {
    return this.request.authedFetchJson<BenchmarkVersionResponse>(
      "POST",
      `/v1/agent/benchmarks/capsules/${capsuleId}/versions`,
      input,
    );
  }

  createHarness(input: BenchmarkHarnessCreateInput): Promise<BenchmarkHarnessResponse> {
    return this.request.authedFetchJson<BenchmarkHarnessResponse>("POST", "/v1/agent/benchmarks/harnesses", input);
  }

  createAttempt(input: BenchmarkAttemptCreateInput): Promise<BenchmarkAttemptResponse> {
    return this.request.authedFetchJson<BenchmarkAttemptResponse>("POST", "/v1/agent/benchmarks/attempts", input);
  }

  createValidation(input: BenchmarkValidationCreateInput): Promise<BenchmarkValidationResponse> {
    return this.request.authedFetchJson<BenchmarkValidationResponse>(
      "POST",
      "/v1/agent/benchmarks/validations",
      input,
    );
  }

  recomputeReliability(capsuleId: string): Promise<BenchmarkReliabilityListResponse> {
    return this.request.authedFetchJson<BenchmarkReliabilityListResponse>(
      "POST",
      `/v1/agent/benchmarks/capsules/${capsuleId}/reliability/recompute`,
      {},
    );
  }
}

