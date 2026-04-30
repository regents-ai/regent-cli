import path from "node:path";

import type {
  BenchmarkAttemptResponse,
  BenchmarkCapsuleListResponse,
  BenchmarkCapsuleResponse,
  BenchmarkReliabilityListResponse,
  BenchmarkScoreboardResponse,
  BenchmarkValidationResponse,
  BenchmarkVersionListResponse,
  BenchmarkWorkspaceActionResult,
} from "../../../internal-types/index.js";
import { TechtreeApiError } from "../../errors.js";
import type { RuntimeContext } from "../../runtime.js";
import {
  createBenchmarkRepeatWorkspaces,
  initBenchmarkCapsuleWorkspace,
  loadBenchmarkAttemptPayload,
  loadBenchmarkHarnessPayload,
  loadBenchmarkValidationPayload,
  loadPackedCapsuleSubmit,
  materializeBenchmarkRunWorkspace,
  packBenchmarkCapsuleWorkspace,
} from "../../workloads/benchmarks.js";

export async function handleTechtreeBenchmarksCapsulesList(
  ctx: RuntimeContext,
  params?: {
    domain?: string;
    field?: string;
    status?: string;
    difficulty?: string;
    limit?: number;
  },
): Promise<BenchmarkCapsuleListResponse> {
  return ctx.techtree.listBenchmarkCapsules(params);
}

export async function handleTechtreeBenchmarksCapsulesGet(
  ctx: RuntimeContext,
  params: { capsule_id: string },
): Promise<BenchmarkCapsuleResponse> {
  return ctx.techtree.getBenchmarkCapsule(params.capsule_id);
}

export async function handleTechtreeBenchmarksScoreboard(
  ctx: RuntimeContext,
  params: { capsule_id: string },
): Promise<BenchmarkScoreboardResponse> {
  return ctx.techtree.benchmarkScoreboard(params.capsule_id);
}

export async function handleTechtreeBenchmarksReliability(
  ctx: RuntimeContext,
  params: { capsule_id: string },
): Promise<BenchmarkReliabilityListResponse> {
  return ctx.techtree.benchmarkReliability(params.capsule_id);
}

export async function handleTechtreeBenchmarksCapsuleInit(
  _ctx: RuntimeContext,
  params: {
    workspace_path: string;
    title?: string;
    domain?: string;
    field?: string;
    ground_truth_policy?: string;
  },
): Promise<BenchmarkWorkspaceActionResult> {
  return initBenchmarkCapsuleWorkspace(params.workspace_path, {
    title: params.title,
    domain: params.domain as Parameters<typeof initBenchmarkCapsuleWorkspace>[1]["domain"],
    field: params.field,
    ground_truth_policy:
      params.ground_truth_policy as Parameters<typeof initBenchmarkCapsuleWorkspace>[1]["ground_truth_policy"],
  });
}

export async function handleTechtreeBenchmarksCapsulePack(
  _ctx: RuntimeContext,
  params: { workspace_path: string },
): Promise<BenchmarkWorkspaceActionResult> {
  const packed = await packBenchmarkCapsuleWorkspace(params.workspace_path);
  return {
    ok: true,
    entrypoint: packed.entrypoint,
    workspace_path: packed.workspace_path,
    files: packed.files,
    manifest_sha256: packed.manifest_sha256,
  };
}

export async function handleTechtreeBenchmarksCapsuleSubmit(
  ctx: RuntimeContext,
  params: { workspace_path: string },
): Promise<BenchmarkWorkspaceActionResult> {
  const packed = await loadPackedCapsuleSubmit(params.workspace_path);
  const capsule = await ctx.techtree.createBenchmarkCapsule(packed.capsule_input);
  const version = await ctx.techtree.createBenchmarkVersion(capsule.data.capsule_id, packed.version_input);

  return {
    ok: true,
    entrypoint: "benchmarks.capsule.submit",
    workspace_path: packed.workspace_path,
    files: packed.files,
    capsule_id: capsule.data.capsule_id,
    version_id: version.data.version_id,
    manifest_sha256: packed.manifest_sha256,
  };
}

export async function handleTechtreeBenchmarksRunMaterialize(
  ctx: RuntimeContext,
  params: {
    workspace_path: string;
    capsule_id: string;
    version_id?: string;
    runner_kind?: string;
    model_id?: string;
    harness_version?: string;
  },
): Promise<BenchmarkWorkspaceActionResult> {
  const capsule = await ctx.techtree.getBenchmarkCapsule(params.capsule_id);
  const versionId = params.version_id ?? capsule.data.current_version_id ?? await latestVersionId(ctx, params.capsule_id);

  return materializeBenchmarkRunWorkspace(params.workspace_path, capsule.data, versionId, {
    runner_kind: params.runner_kind as Parameters<typeof materializeBenchmarkRunWorkspace>[3]["runner_kind"],
    model_id: params.model_id,
    harness_version: params.harness_version,
  });
}

export async function handleTechtreeBenchmarksRunSubmit(
  ctx: RuntimeContext,
  params: { workspace_path: string },
): Promise<BenchmarkAttemptResponse> {
  return submitBenchmarkRun(ctx, params.workspace_path);
}

export async function handleTechtreeBenchmarksRunRepeat(
  ctx: RuntimeContext,
  params: { workspace_path: string; n?: number; submit?: boolean },
): Promise<BenchmarkWorkspaceActionResult & { attempts?: BenchmarkAttemptResponse[] }> {
  const result = await createBenchmarkRepeatWorkspaces(params.workspace_path, params.n ?? 5);

  if (params.submit !== true) {
    return result;
  }

  const runFolders =
    result.files
      .filter((file) => file.endsWith("run.yaml"))
      .map((file) => path.join(result.workspace_path, path.dirname(file)));

  const attempts: BenchmarkAttemptResponse[] = [];
  for (const folder of runFolders) {
    attempts.push(await submitBenchmarkRun(ctx, folder));
  }

  return { ...result, attempts };
}

export async function handleTechtreeBenchmarksValidate(
  ctx: RuntimeContext,
  params: { workspace_path: string },
): Promise<BenchmarkValidationResponse> {
  const payload = await loadBenchmarkValidationPayload(params.workspace_path);
  return ctx.techtree.createBenchmarkValidation(payload);
}

async function latestVersionId(ctx: RuntimeContext, capsuleId: string): Promise<string> {
  const versions: BenchmarkVersionListResponse = await ctx.techtree.listBenchmarkVersions(capsuleId);
  const first = versions.data[0];
  if (!first) {
    throw new Error("benchmark capsule has no versions");
  }
  return first.version_id;
}

async function submitBenchmarkRun(
  ctx: RuntimeContext,
  workspacePath: string,
): Promise<BenchmarkAttemptResponse> {
  const harness = await loadBenchmarkHarnessPayload(workspacePath);
  if (!harness.harness_id) {
    throw new Error("run.yaml harness_id is required");
  }

  await ensureHarness(ctx, harness.harness_id, harness);
  const attempt = await loadBenchmarkAttemptPayload(workspacePath);
  return ctx.techtree.createBenchmarkAttempt(attempt);
}

async function ensureHarness(
  ctx: RuntimeContext,
  harnessId: string,
  payload: Parameters<RuntimeContext["techtree"]["createBenchmarkHarness"]>[0],
): Promise<void> {
  try {
    await ctx.techtree.getBenchmarkHarness(harnessId);
  } catch (error) {
    if (error instanceof TechtreeApiError && error.status === 404) {
      await ctx.techtree.createBenchmarkHarness(payload);
      return;
    }
    throw error;
  }
}

