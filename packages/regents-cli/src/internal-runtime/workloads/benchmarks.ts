import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";

import type {
  BenchmarkAttemptCreateInput,
  BenchmarkCapsule,
  BenchmarkCapsuleCreateInput,
  BenchmarkDomain,
  BenchmarkGroundTruthPolicy,
  BenchmarkHarnessCreateInput,
  BenchmarkRunnerKind,
  BenchmarkValidationCreateInput,
  BenchmarkValidationMethod,
  BenchmarkValidationResult,
  BenchmarkValidationRole,
  BenchmarkVersionCreateInput,
  BenchmarkWorkspaceActionResult,
} from "../../internal-types/index.js";

interface BenchmarkCapsuleYaml {
  capsule_id?: string;
  version_id?: string;
  version_label?: string;
  domain: BenchmarkDomain;
  field?: string;
  title: string;
  summary_md?: string;
  difficulty_label?: string;
  ground_truth_policy: BenchmarkGroundTruthPolicy;
  human_baseline_status?: string;
}

interface BenchmarkHarnessYaml {
  harness_id?: string;
  name: string;
  runner_kind: BenchmarkRunnerKind;
  harness_version: string;
  model_id?: string;
  agent_runtime?: string;
  domain?: BenchmarkDomain;
  description_md?: string;
}

export interface BenchmarkCapsulePackResult extends BenchmarkWorkspaceActionResult {
  capsule_input: BenchmarkCapsuleCreateInput;
  version_input: BenchmarkVersionCreateInput;
  manifest: Record<string, unknown>;
}

export interface BenchmarkRunMaterializeResult extends BenchmarkWorkspaceActionResult {
  capsule_id: string;
  version_id: string;
  harness_id: string;
}

const text = new TextEncoder();

export async function initBenchmarkCapsuleWorkspace(
  workspacePath: string,
  opts: {
    title?: string;
    domain?: BenchmarkDomain;
    field?: string;
    ground_truth_policy?: BenchmarkGroundTruthPolicy;
  },
): Promise<BenchmarkWorkspaceActionResult> {
  const root = path.resolve(workspacePath);
  const files: string[] = [];
  await fs.mkdir(root, { recursive: true });
  await fs.mkdir(path.join(root, "policies"), { recursive: true });
  await fs.mkdir(path.join(root, "notebooks"), { recursive: true });
  await fs.mkdir(path.join(root, "data"), { recursive: true });
  await fs.mkdir(path.join(root, "dist"), { recursive: true });

  await writeNew(root, "capsule.yaml", YAML.stringify({
    domain: opts.domain ?? "other",
    field: opts.field ?? "general",
    title: opts.title ?? "New benchmark capsule",
    summary_md: "A short public summary for this capsule.",
    version_label: "v1",
    difficulty_label: "unlabeled",
    ground_truth_policy: opts.ground_truth_policy ?? "hidden_server",
    human_baseline_status: "unknown",
  }), files);
  await writeNew(root, "question.md", "# Task\n\nDescribe the task clearly.\n", files);
  await writeNew(root, "policies/answer-format.json", "{\n  \"type\": \"text\"\n}\n", files);
  await writeNew(root, "policies/scoring-policy.json", "{\n  \"score\": \"manual review\"\n}\n", files);
  await writeNew(root, "policies/allowed-tools-policy.json", "{\n  \"allowed\": []\n}\n", files);
  await writeNew(root, "policies/external-resource-policy.json", "{\n  \"allowed\": false\n}\n", files);
  await writeNew(root, "policies/anti-cheat-policy.json", "{\n  \"notes\": \"Keep hidden answers out of public files.\"\n}\n", files);
  await writeNew(root, "data/README.md", "# Data\n\nList public data sources or bundle notes here.\n", files);
  await writeNew(root, "notebooks/validate.marimo.py", "# Validation notebook placeholder\n", files);

  return { ok: true, entrypoint: "benchmarks.capsule.init", workspace_path: root, files };
}

export async function packBenchmarkCapsuleWorkspace(workspacePath: string): Promise<BenchmarkCapsulePackResult> {
  const root = path.resolve(workspacePath);
  const capsule = await readYamlFile<BenchmarkCapsuleYaml>(root, "capsule.yaml", isBenchmarkCapsuleYaml);
  const questionMd = await readTextFile(root, "question.md");
  await assertNoHiddenTruthLeak(root, capsule.ground_truth_policy);

  const answerFormat = await readJsonFile(root, "policies/answer-format.json");
  const scoringPolicy = await readJsonFile(root, "policies/scoring-policy.json");
  const allowedToolsPolicy = await readJsonFile(root, "policies/allowed-tools-policy.json");
  const externalResourcePolicy = await readJsonFile(root, "policies/external-resource-policy.json");
  const antiCheatPolicy = await readJsonFile(root, "policies/anti-cheat-policy.json");

  const sourceFiles = await collectFiles(root, {
    excludedTopLevel: new Set(["dist", "attempts", "repeats", "hidden_truth"]),
  });
  const inputBundleSha256 = sha256Hex(sourceFiles.map((file) => `${file.path}:${file.sha256}`).join("\n"));

  const manifest = {
    schema_version: "techtree.benchmark-capsule.v1",
    capsule,
    hashes: {
      input_bundle_sha256: inputBundleSha256,
    },
    files: sourceFiles,
  };
  const manifestSha256 = sha256Json(manifest);

  const capsuleInput: BenchmarkCapsuleCreateInput = {
    capsule_id: capsule.capsule_id,
    domain: capsule.domain,
    field: capsule.field,
    title: capsule.title,
    summary_md: capsule.summary_md,
    question_md: questionMd,
    difficulty_label: capsule.difficulty_label,
    human_baseline_status: capsule.human_baseline_status,
    ground_truth_policy: capsule.ground_truth_policy,
    answer_format: answerFormat,
    allowed_tools_policy: allowedToolsPolicy,
    external_resource_policy: externalResourcePolicy,
    scoring_policy: scoringPolicy,
    anti_cheat_policy: antiCheatPolicy,
  };
  const versionInput: BenchmarkVersionCreateInput = {
    version_id: capsule.version_id,
    version_label: capsule.version_label ?? "v1",
    manifest_sha256: manifestSha256,
    input_bundle_sha256: inputBundleSha256,
    ground_truth_storage_policy: {
      policy: capsule.ground_truth_policy,
    },
    data_manifest: {
      files: sourceFiles,
    },
    capsule_source: manifest,
  };

  await fs.mkdir(path.join(root, "dist"), { recursive: true });
  await writeJson(root, "dist/manifest.json", manifest);
  await writeJson(root, "dist/capsule-submit.json", { capsule: capsuleInput, version: versionInput });

  return {
    ok: true,
    entrypoint: "benchmarks.capsule.pack",
    workspace_path: root,
    files: ["dist/manifest.json", "dist/capsule-submit.json"],
    manifest_sha256: manifestSha256,
    capsule_input: capsuleInput,
    version_input: versionInput,
    manifest,
  };
}

export async function loadPackedCapsuleSubmit(workspacePath: string): Promise<BenchmarkCapsulePackResult> {
  await packBenchmarkCapsuleWorkspace(workspacePath);
  const root = path.resolve(workspacePath);
  const submit = await readJsonFile(root, "dist/capsule-submit.json");
  const capsuleInput = requireRecord(submit.capsule, "dist/capsule-submit.json capsule") as unknown as BenchmarkCapsuleCreateInput;
  const versionInput = requireRecord(submit.version, "dist/capsule-submit.json version") as unknown as BenchmarkVersionCreateInput;
  const manifest = await readJsonFile(root, "dist/manifest.json");

  return {
    ok: true,
    entrypoint: "benchmarks.capsule.pack",
    workspace_path: root,
    files: ["dist/manifest.json", "dist/capsule-submit.json"],
    manifest_sha256: typeof versionInput.manifest_sha256 === "string" ? versionInput.manifest_sha256 : undefined,
    capsule_input: capsuleInput,
    version_input: versionInput,
    manifest,
  };
}

export async function materializeBenchmarkRunWorkspace(
  workspacePath: string,
  capsule: BenchmarkCapsule,
  versionId: string,
  opts: {
    runner_kind?: BenchmarkRunnerKind;
    model_id?: string;
    harness_version?: string;
  },
): Promise<BenchmarkRunMaterializeResult> {
  const root = path.resolve(workspacePath);
  const runnerKind = opts.runner_kind ?? "custom_local";
  const harnessVersion = opts.harness_version ?? "v1";
  const normalizedBundleHash = sha256Json({
    capsule_id: capsule.capsule_id,
    version_id: versionId,
    runner_kind: runnerKind,
    model_id: opts.model_id ?? null,
    harness_version: harnessVersion,
  });
  const harnessId = `harness_${normalizedBundleHash.slice(0, 24)}`;
  const files: string[] = [];

  await fs.mkdir(root, { recursive: true });
  await fs.mkdir(path.join(root, "artifacts"), { recursive: true });
  await fs.mkdir(path.join(root, "dist"), { recursive: true });
  await writeNew(root, "question.md", capsule.question_md, files);
  await writeNew(root, "answer.md", "", files);
  await writeNew(root, "run.yaml", YAML.stringify({
    capsule_id: capsule.capsule_id,
    version_id: versionId,
    repeat_group_id: `repeat_${Date.now().toString(36)}`,
    attempt_ordinal: 1,
    harness: {
      harness_id: harnessId,
      name: `${runnerKind} ${opts.model_id ?? "local"}`,
      runner_kind: runnerKind,
      model_id: opts.model_id,
      harness_version: harnessVersion,
      normalized_bundle_hash: normalizedBundleHash,
    },
  }), files);

  return {
    ok: true,
    entrypoint: "benchmarks.run.materialize",
    workspace_path: root,
    files,
    capsule_id: capsule.capsule_id,
    version_id: versionId,
    harness_id: harnessId,
  };
}

export async function loadBenchmarkHarnessPayload(workspacePath: string): Promise<BenchmarkHarnessCreateInput> {
  const run = await readRunYaml(workspacePath);
  const harness = requireRecord(run.harness, "run.yaml harness");

  return {
    harness_id: optionalString(harness.harness_id),
    name: requireString(harness.name, "run.yaml harness.name"),
    runner_kind: requireString(harness.runner_kind, "run.yaml harness.runner_kind") as BenchmarkRunnerKind,
    harness_version: requireString(harness.harness_version, "run.yaml harness.harness_version"),
    model_id: optionalString(harness.model_id),
    agent_runtime: optionalString(harness.agent_runtime),
    domain: optionalString(harness.domain) as BenchmarkDomain | undefined,
    description_md: optionalString(harness.description_md),
    normalized_bundle_hash: requireString(harness.normalized_bundle_hash, "run.yaml harness.normalized_bundle_hash"),
    tool_profile: optionalRecord(harness.tool_profile),
    workspace_policy: optionalRecord(harness.workspace_policy),
    source: optionalRecord(harness.source),
  };
}

export async function loadBenchmarkAttemptPayload(workspacePath: string): Promise<BenchmarkAttemptCreateInput> {
  const root = path.resolve(workspacePath);
  const run = await readRunYaml(root);
  const harness = await loadBenchmarkHarnessPayload(root);
  const answerText = await readTextFile(root, "answer.md");

  return {
    capsule_id: requireString(run.capsule_id, "run.yaml capsule_id"),
    version_id: requireString(run.version_id, "run.yaml version_id"),
    harness_id: requireString(harness.harness_id, "run.yaml harness.harness_id"),
    repeat_group_id: optionalString(run.repeat_group_id),
    attempt_ordinal: optionalNumber(run.attempt_ordinal) ?? 1,
    status: "submitted",
    score_status: optionalString(run.score_status) as BenchmarkAttemptCreateInput["score_status"] | undefined,
    raw_score: optionalNumber(run.raw_score),
    normalized_score: optionalNumber(run.normalized_score),
    solved: optionalBoolean(run.solved),
    answer_text: answerText,
    answer_hash: optionalString(run.answer_hash),
    verdict_json: optionalRecord(run.verdict_json),
    artifact_manifest: {
      files: await collectFiles(root, { includedTopLevel: new Set(["artifacts", "dist"]) }),
    },
    runtime_seconds: optionalNumber(run.runtime_seconds),
    cost_usd_micros: optionalNumber(run.cost_usd_micros),
    run_source: {
      harness_bundle_hash: harness.normalized_bundle_hash,
    },
    workspace_source: optionalRecord(run.workspace_source),
  };
}

export async function createBenchmarkRepeatWorkspaces(
  workspacePath: string,
  n: number,
): Promise<BenchmarkWorkspaceActionResult> {
  if (!Number.isSafeInteger(n) || n <= 0 || n > 50) {
    throw new Error("repeat count must be between 1 and 50");
  }

  const root = path.resolve(workspacePath);
  const baseRun = await readRunYaml(root);
  const repeatGroupId = `repeat_${Date.now().toString(36)}_${sha256Json(baseRun).slice(0, 8)}`;
  const files: string[] = [];

  for (let index = 1; index <= n; index += 1) {
    const attemptDir = path.join("repeats", repeatGroupId, String(index).padStart(3, "0"));
    const runYaml = YAML.stringify({
      ...baseRun,
      repeat_group_id: repeatGroupId,
      attempt_ordinal: index,
    });
    await fs.mkdir(path.join(root, attemptDir), { recursive: true });
    await writeNew(root, path.join(attemptDir, "run.yaml"), runYaml, files);
    await writeNew(root, path.join(attemptDir, "answer.md"), "", files);
  }

  return {
    ok: true,
    entrypoint: "benchmarks.run.repeat",
    workspace_path: root,
    files,
    repeat_group_id: repeatGroupId,
  };
}

export async function loadBenchmarkValidationPayload(workspacePath: string): Promise<BenchmarkValidationCreateInput> {
  const root = path.resolve(workspacePath);
  const validation = await readYamlFile<Record<string, unknown>>(root, "validation.yaml", isRecord);

  return {
    validation_id: optionalString(validation.validation_id),
    attempt_id: requireString(validation.attempt_id, "validation.yaml attempt_id"),
    role: requireString(validation.role, "validation.yaml role") as BenchmarkValidationRole,
    method: requireString(validation.method, "validation.yaml method") as BenchmarkValidationMethod,
    result: requireString(validation.result, "validation.yaml result") as BenchmarkValidationResult,
    reproduced_raw_score: optionalNumber(validation.reproduced_raw_score),
    reproduced_normalized_score: optionalNumber(validation.reproduced_normalized_score),
    tolerance_raw_abs: optionalNumber(validation.tolerance_raw_abs),
    summary_md: requireString(validation.summary_md, "validation.yaml summary_md"),
    validation_notebook_cid: optionalString(validation.validation_notebook_cid),
    verdict_json: optionalRecord(validation.verdict_json),
    review_source: optionalRecord(validation.review_source),
  };
}

async function readRunYaml(workspacePath: string): Promise<Record<string, unknown>> {
  return readYamlFile<Record<string, unknown>>(path.resolve(workspacePath), "run.yaml", isRecord);
}

async function writeNew(root: string, relativePath: string, body: string, files: string[]): Promise<void> {
  await fs.mkdir(path.dirname(path.join(root, relativePath)), { recursive: true });
  await fs.writeFile(path.join(root, relativePath), body, { flag: "wx" });
  files.push(relativePath);
}

async function writeJson(root: string, relativePath: string, body: unknown): Promise<void> {
  await fs.mkdir(path.dirname(path.join(root, relativePath)), { recursive: true });
  await fs.writeFile(path.join(root, relativePath), `${canonicalJson(body)}\n`);
}

async function readTextFile(root: string, relativePath: string): Promise<string> {
  return fs.readFile(path.join(root, relativePath), "utf8");
}

async function readJsonFile(root: string, relativePath: string): Promise<Record<string, unknown>> {
  const parsed = JSON.parse(await readTextFile(root, relativePath)) as unknown;
  return requireRecord(parsed, relativePath);
}

async function readYamlFile<T>(
  root: string,
  relativePath: string,
  guard: (value: unknown) => value is T,
): Promise<T> {
  const parsed = YAML.parse(await readTextFile(root, relativePath)) as unknown;
  if (!guard(parsed)) {
    throw new Error(`invalid ${relativePath}`);
  }
  return parsed;
}

async function assertNoHiddenTruthLeak(root: string, policy: BenchmarkGroundTruthPolicy): Promise<void> {
  const hiddenTruthDir = path.join(root, "hidden_truth");
  const groundTruthFile = path.join(root, "ground_truth.json");
  const hasHiddenDir = await exists(hiddenTruthDir);
  const hasGroundTruth = await exists(groundTruthFile);

  if (policy !== "public" && (hasHiddenDir || hasGroundTruth)) {
    throw new Error("hidden answers must not be included in the public capsule bundle");
  }
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function collectFiles(
  root: string,
  opts: { excludedTopLevel?: Set<string>; includedTopLevel?: Set<string> },
): Promise<Array<{ path: string; sha256: string; byte_size: number }>> {
  const entries: Array<{ path: string; sha256: string; byte_size: number }> = [];

  async function visit(relativeDir: string): Promise<void> {
    const absoluteDir = path.join(root, relativeDir);
    if (!(await exists(absoluteDir))) {
      return;
    }
    for (const entry of await fs.readdir(absoluteDir, { withFileTypes: true })) {
      const relativePath = path.join(relativeDir, entry.name);
      const topLevel = relativePath.split(path.sep)[0] ?? relativePath;
      if (opts.excludedTopLevel?.has(topLevel)) {
        continue;
      }
      if (opts.includedTopLevel && !opts.includedTopLevel.has(topLevel)) {
        continue;
      }
      if (entry.isDirectory()) {
        await visit(relativePath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      const bytes = await fs.readFile(path.join(root, relativePath));
      entries.push({
        path: relativePath.split(path.sep).join("/"),
        sha256: sha256Bytes(bytes),
        byte_size: bytes.byteLength,
      });
    }
  }

  await visit("");
  return entries.sort((left, right) => left.path.localeCompare(right.path));
}

function isBenchmarkCapsuleYaml(value: unknown): value is BenchmarkCapsuleYaml {
  if (!isRecord(value)) {
    return false;
  }
  return typeof value.domain === "string" &&
    typeof value.title === "string" &&
    typeof value.ground_truth_policy === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`invalid ${label}`);
  }
  return value;
}

function optionalRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`missing ${label}`);
  }
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function sha256Json(value: unknown): string {
  return sha256Hex(canonicalJson(value));
}

function sha256Hex(value: string): string {
  return sha256Bytes(text.encode(value));
}

function sha256Bytes(value: Uint8Array): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entryValue]) => entryValue !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entryValue]) => [key, sortJson(entryValue)]),
    );
  }
  return value;
}
