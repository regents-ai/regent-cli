import fs from "node:fs/promises";
import path from "node:path";

import type {
  ActivityListResponse,
  AgentInboxResponse,
  AgentOpportunitiesResponse,
  BbhLeaderboardResponse,
  BbhRunExecParams,
  BbhRunExecResponse,
  BbhSubmitParams,
  BbhSyncParams,
  BbhRunSubmitResponse,
  BbhSyncResponse,
  BbhValidateParams,
  BbhValidationSubmitResponse,
  RegentRunMetadata,
  CommentCreateInput,
  CommentCreateResponse,
  NodeCreateInput,
  NodeCreateResponse,
  NodeStarRecord,
  TreeComment,
  TreeNode,
  TrollboxListResponse,
  TrollboxPostInput,
  TrollboxPostResponse,
  TechtreeCompilerOutput,
  TechtreeFetchResponse,
  TechtreeNodeId,
  TechtreePinResponse,
  TechtreePublishResponse,
  TechtreeTreeName,
  TechtreeVerifyResponse,
  TechtreeWorkspaceActionResult,
  WatchRecord,
  WorkPacketResponse,
} from "../../internal-types/index.js";

import type { RuntimeContext } from "../runtime.js";
import { runTechtreeCoreJson, type TechtreeCoreEntrypoint } from "../techtree/core.js";
import {
  buildBbhValidationRequest,
  loadBbhRunSubmitRequest,
  materializeBbhWorkspace,
} from "../workloads/bbh.js";

type NodeType = "artifact" | "run" | "review";

const readRunMetadata = (input: Record<string, unknown>): RegentRunMetadata | null => {
  const metadata = input.metadata;
  if (!metadata || typeof metadata !== "object") {
    return null;
  }

  const record = metadata as Record<string, unknown>;
  const executorHarness = record.executor_harness;
  const origin = record.origin;

  if (!executorHarness || typeof executorHarness !== "object" || !origin || typeof origin !== "object") {
    return null;
  }

  const executorHarnessRecord = executorHarness as Record<string, unknown>;
  const originRecord = origin as Record<string, unknown>;

  if (typeof executorHarnessRecord.kind !== "string" || typeof executorHarnessRecord.profile !== "string") {
    return null;
  }

  if (typeof originRecord.kind !== "string") {
    return null;
  }

  const resolved: RegentRunMetadata = {
    executor_harness: {
      kind: executorHarnessRecord.kind as RegentRunMetadata["executor_harness"]["kind"],
      profile: executorHarnessRecord.profile,
      ...(typeof executorHarnessRecord.entrypoint === "string" || executorHarnessRecord.entrypoint === null
        ? { entrypoint: executorHarnessRecord.entrypoint }
        : {}),
    },
    origin: {
      kind: originRecord.kind as RegentRunMetadata["origin"]["kind"],
      ...(typeof originRecord.transport === "string" || originRecord.transport === null
        ? { transport: originRecord.transport as RegentRunMetadata["origin"]["transport"] }
        : {}),
      ...(typeof originRecord.session_id === "string" || originRecord.session_id === null
        ? { session_id: originRecord.session_id }
        : {}),
      ...(typeof originRecord.trigger_ref === "string" || originRecord.trigger_ref === null
        ? { trigger_ref: originRecord.trigger_ref }
        : {}),
    },
  };

  return resolved;
};

const writeResolvedMetadata = async (workspacePath: string, metadata: unknown): Promise<void> => {
  await fs.writeFile(
    path.join(workspacePath, "resolved-metadata.json"),
    `${JSON.stringify(metadata, null, 2)}\n`,
    "utf8",
  );
};

const writeIfBbhTree = async (
  tree: TechtreeTreeName,
  workspacePath: string,
  nodeType: NodeType,
  input: Record<string, unknown>,
): Promise<void> => {
  if (tree !== "bbh") {
    return;
  }

  if (nodeType === "artifact") {
    await fs.writeFile(
      path.join(workspacePath, "artifact.source.yaml"),
      `schema_version: techtree.artifact-source.v1

title: "BBH capsule artifact"
summary: "Canonical BBH capsule prepared for Regent v1 publishing."

parents: []

notebook:
  entrypoint: analysis.py
  include:
    - analysis.py
    - pyproject.toml
    - uv.lock
    - outputs/**/*
    - logs/**/*
  exclude: []
  marimo_version: "0.11.8"

env:
  lockfile_path: uv.lock
  image: null
  system:
    python: "3.11"
    platform: "linux/amd64"
  runtime_policy:
    network: none
    filesystem: workspace_write
    secrets: forbidden
    gpu: false
  external_resources: []

claims: []
sources: []
licenses:
  notebook: "MIT"
  data: "CC-BY-4.0"
  outputs: "CC-BY-4.0"

eval:
  mode: fixed
  instance:
    seed: 1
    instance_id: "bbh-capsule"
    params:
      tree: bbh
      benchmark: bbh
      split: eval
  protocol:
    entrypoint: analysis.py
    allowed_tools:
      - python
    output_contract:
      required_files:
        - outputs/verdict.json
  rubric:
    scorer: outputs/verdict.json
    primary_metric: score
`,
      "utf8",
    );
    await fs.writeFile(path.join(workspacePath, "analysis.py"), "print('bbh artifact analysis')\n", "utf8");
    await fs.mkdir(path.join(workspacePath, "outputs"), { recursive: true });
    await fs.mkdir(path.join(workspacePath, "logs"), { recursive: true });
    return;
  }

  if (nodeType === "run") {
    await fs.writeFile(
      path.join(workspacePath, "run.source.yaml"),
      `schema_version: techtree.run-source.v1

artifact_id: "${String(input.artifact_id ?? "")}"

executor:
  type: genome
  id: "genome:bbh-local"
  version_ref: null

instance:
  seed: 1
  instance_id: "bbh-run"
  params:
    tree: bbh
    benchmark: bbh
    split: eval
    genome:
      fingerprint: "local-dev"
      display_name: "Local Dev Genome"
      model: "unknown"
      router: "unknown"
      planner: null
      critic: null
      tool_policy: "balanced"
      runtime: "regent-cli"

execution:
  output_dir: outputs/
  allow_resume: false
`,
      "utf8",
    );
    await fs.mkdir(path.join(workspacePath, "outputs"), { recursive: true });
    await fs.mkdir(path.join(workspacePath, "logs"), { recursive: true });
    await fs.writeFile(
      path.join(workspacePath, "outputs", "verdict.json"),
      `${JSON.stringify({ score: null, matched: null, reproducible: null }, null, 2)}\n`,
      "utf8",
    );
    return;
  }

  await fs.writeFile(
    path.join(workspacePath, "review.source.yaml"),
    `schema_version: techtree.review-source.v1

target:
  type: run
  id: "${String(input.target_id ?? "")}"

kind: validation
method: replay

scope:
  level: whole
  path: null

result: confirmed
summary: "Official BBH replay review."

findings: []

evidence:
  refs:
    - kind: run
      ref: "${String(input.target_id ?? "")}"
      note: "Validated BBH run"
  attachments:
    include:
      - outputs/**/*
      - logs/**/*
    exclude: []
`,
    "utf8",
  );
  await fs.mkdir(path.join(workspacePath, "outputs"), { recursive: true });
  await fs.mkdir(path.join(workspacePath, "logs"), { recursive: true });
};

const runWorkspaceInit = async (
  ctx: RuntimeContext,
  tree: TechtreeTreeName,
  entrypoint: Extract<TechtreeCoreEntrypoint, "artifact.init" | "run.init" | "review.init">,
  input: Record<string, unknown>,
): Promise<TechtreeWorkspaceActionResult> => {
  const result = await runTechtreeCoreJson<TechtreeWorkspaceActionResult>(entrypoint, input, {
    cwd: String(input.workspace_path),
  });
  const nodeType = entrypoint.split(".")[0] as NodeType;
  await writeIfBbhTree(tree, String(input.workspace_path), nodeType, input);
  const resolvedMetadata = ctx.agentRouter.resolveRunMetadata(readRunMetadata(input));
  await writeResolvedMetadata(String(input.workspace_path), resolvedMetadata);
  return {
    ...result,
    tree,
    resolved_metadata: resolvedMetadata,
  };
};

const compileWorkspace = async (
  entrypoint: Extract<TechtreeCoreEntrypoint, "artifact.compile" | "run.compile" | "review.compile">,
  workspacePath: string,
): Promise<TechtreeCompilerOutput<Record<string, unknown>>> => {
  return await runTechtreeCoreJson<TechtreeCompilerOutput<Record<string, unknown>>>(entrypoint, {
    workspace_path: workspacePath,
  }, { cwd: workspacePath });
};

const pinWorkspace = async (
  ctx: RuntimeContext,
  tree: TechtreeTreeName,
  nodeType: NodeType,
  entrypoint: Extract<TechtreeCoreEntrypoint, "artifact.compile" | "run.compile" | "review.compile">,
  workspacePath: string,
): Promise<TechtreePinResponse & {
  tree: TechtreeTreeName;
  compiled: TechtreeCompilerOutput<Record<string, unknown>>;
}> => {
  const compiled = await compileWorkspace(entrypoint, workspacePath);
  const client = ctx.techtreePublisher;
  const pinned = await client.pinNode({
    node_type: nodeType,
    workspace_path: workspacePath,
    dist_path: compiled.dist_path,
  });

  return {
    ...pinned,
    tree,
    compiled,
  };
};

const publishWorkspace = async (
  ctx: RuntimeContext,
  tree: TechtreeTreeName,
  nodeType: NodeType,
  entrypoint: Extract<TechtreeCoreEntrypoint, "artifact.compile" | "run.compile" | "review.compile">,
  workspacePath: string,
): Promise<TechtreePublishResponse & { tree: TechtreeTreeName }> => {
  const client = ctx.techtreePublisher;
  const compiled = await compileWorkspace(entrypoint, workspacePath);
  const pinned = await client.pinNode({
    node_type: nodeType,
    workspace_path: workspacePath,
    dist_path: compiled.dist_path,
  });
  const published = await client.publishNode({
    node_type: nodeType,
    workspace_path: workspacePath,
    dist_path: compiled.dist_path,
    header: compiled.node_header,
    manifest_cid: pinned.manifest_cid,
    payload_cid: pinned.payload_cid,
  });

  return {
    tree,
    ...published,
  };
};

export async function handleTechtreeStatus(ctx: RuntimeContext): Promise<{
  config: typeof ctx.config.techtree;
  health: Record<string, unknown>;
}> {
  return {
    config: ctx.config.techtree,
    health: await ctx.techtree.health(),
  };
}

export async function handleTechtreeNodesList(
  ctx: RuntimeContext,
  params?: { limit?: number; seed?: string },
): Promise<{ data: TreeNode[] }> {
  return ctx.techtree.listNodes(params);
}

export async function handleTechtreeActivityList(
  ctx: RuntimeContext,
  params?: { limit?: number },
): Promise<ActivityListResponse> {
  return ctx.techtree.listActivity(params);
}

export async function handleTechtreeSearchQuery(
  ctx: RuntimeContext,
  params: { q: string; limit?: number },
): Promise<{
  data: {
    nodes: TreeNode[];
    comments: TreeComment[];
  };
}> {
  return ctx.techtree.search(params);
}

export async function handleTechtreeNodeGet(
  ctx: RuntimeContext,
  params: { id: number },
): Promise<{ data: TreeNode }> {
  return ctx.techtree.getNode(params.id);
}

export async function handleTechtreeNodeChildren(
  ctx: RuntimeContext,
  params: { id: number; limit?: number },
): Promise<{ data: TreeNode[] }> {
  return ctx.techtree.getChildren(params.id, { limit: params.limit });
}

export async function handleTechtreeNodeComments(
  ctx: RuntimeContext,
  params: { id: number; limit?: number },
): Promise<{ data: TreeComment[] }> {
  return ctx.techtree.getComments(params.id, { limit: params.limit });
}

export async function handleTechtreeNodeWorkPacket(
  ctx: RuntimeContext,
  params: { id: number },
): Promise<{ data: WorkPacketResponse }> {
  return ctx.techtree.getWorkPacket(params.id);
}

export async function handleTechtreeNodeCreate(
  ctx: RuntimeContext,
  params: NodeCreateInput,
): Promise<NodeCreateResponse> {
  return ctx.techtree.createNode(params);
}

export async function handleTechtreeCommentCreate(
  ctx: RuntimeContext,
  params: CommentCreateInput,
): Promise<CommentCreateResponse> {
  return ctx.techtree.createComment(params);
}

export async function handleTechtreeWatchCreate(
  ctx: RuntimeContext,
  params: { nodeId: number },
): Promise<{ data: WatchRecord }> {
  return ctx.techtree.watchNode(params.nodeId);
}

export async function handleTechtreeWatchDelete(
  ctx: RuntimeContext,
  params: { nodeId: number },
): Promise<{ ok: true }> {
  return ctx.techtree.unwatchNode(params.nodeId);
}

export async function handleTechtreeWatchList(ctx: RuntimeContext): Promise<{ data: WatchRecord[] }> {
  return ctx.techtree.listWatches();
}

export async function handleTechtreeStarCreate(
  ctx: RuntimeContext,
  params: { nodeId: number },
): Promise<{ data: NodeStarRecord }> {
  return ctx.techtree.starNode(params.nodeId);
}

export async function handleTechtreeStarDelete(
  ctx: RuntimeContext,
  params: { nodeId: number },
): Promise<{ ok: true }> {
  return ctx.techtree.unstarNode(params.nodeId);
}

export async function handleTechtreeInboxGet(
  ctx: RuntimeContext,
  params?: { cursor?: number; limit?: number; seed?: string; kind?: string | string[] },
): Promise<AgentInboxResponse> {
  return ctx.techtree.getInbox(params);
}

export async function handleTechtreeOpportunitiesList(
  ctx: RuntimeContext,
  params?: Record<string, string | number | boolean | string[]>,
): Promise<AgentOpportunitiesResponse> {
  return ctx.techtree.getOpportunities(params);
}

export async function handleTechtreeTrollboxHistory(
  ctx: RuntimeContext,
  params?: { before?: number; limit?: number; room?: "global" | "agent" },
): Promise<TrollboxListResponse> {
  return ctx.techtree.listTrollboxMessages(params);
}

export async function handleTechtreeTrollboxPost(
  ctx: RuntimeContext,
  params: TrollboxPostInput,
): Promise<TrollboxPostResponse> {
  return ctx.techtree.createAgentTrollboxMessage(params);
}

export async function handleTechtreeV1ArtifactInit(
  ctx: RuntimeContext,
  params: { tree: TechtreeTreeName; workspace_path: string },
): Promise<TechtreeWorkspaceActionResult> {
  return runWorkspaceInit(ctx, params.tree, "artifact.init", params);
}

export async function handleTechtreeV1ArtifactCompile(
  _ctx: RuntimeContext,
  params: { tree: TechtreeTreeName; workspace_path: string },
): Promise<TechtreeCompilerOutput<Record<string, unknown>>> {
  return compileWorkspace("artifact.compile", params.workspace_path);
}

export async function handleTechtreeV1ArtifactPin(
  ctx: RuntimeContext,
  params: { tree: TechtreeTreeName; workspace_path: string },
) {
  return pinWorkspace(ctx, params.tree, "artifact", "artifact.compile", params.workspace_path);
}

export async function handleTechtreeV1ArtifactPublish(
  ctx: RuntimeContext,
  params: { tree: TechtreeTreeName; workspace_path: string },
) {
  return publishWorkspace(ctx, params.tree, "artifact", "artifact.compile", params.workspace_path);
}

export async function handleTechtreeV1RunInit(
  ctx: RuntimeContext,
  params: { tree: TechtreeTreeName; workspace_path: string; artifact_id: TechtreeNodeId },
): Promise<TechtreeWorkspaceActionResult> {
  return runWorkspaceInit(ctx, params.tree, "run.init", params);
}

export async function handleTechtreeV1RunExec(
  ctx: RuntimeContext,
  params: { tree: TechtreeTreeName; workspace_path: string; metadata?: RegentRunMetadata | null },
): Promise<TechtreeWorkspaceActionResult> {
  const result = await ctx.workload.runExec({
    tree: params.tree,
    workspace_path: params.workspace_path,
    metadata: params.metadata ?? null,
  });
  const resolvedMetadata = ctx.agentRouter.resolveRunMetadata(params.metadata ?? null);
  await writeResolvedMetadata(params.workspace_path, resolvedMetadata);
  return {
    ...result,
    tree: params.tree,
    resolved_metadata: resolvedMetadata,
  };
}

export async function handleTechtreeV1RunCompile(
  _ctx: RuntimeContext,
  params: { tree: TechtreeTreeName; workspace_path: string },
): Promise<TechtreeCompilerOutput<Record<string, unknown>>> {
  return compileWorkspace("run.compile", params.workspace_path);
}

export async function handleTechtreeV1RunPin(
  ctx: RuntimeContext,
  params: { tree: TechtreeTreeName; workspace_path: string },
) {
  return pinWorkspace(ctx, params.tree, "run", "run.compile", params.workspace_path);
}

export async function handleTechtreeV1RunPublish(
  ctx: RuntimeContext,
  params: { tree: TechtreeTreeName; workspace_path: string },
) {
  return publishWorkspace(ctx, params.tree, "run", "run.compile", params.workspace_path);
}

export async function handleTechtreeV1ReviewInit(
  ctx: RuntimeContext,
  params: { tree: TechtreeTreeName; workspace_path: string; target_id: TechtreeNodeId },
): Promise<TechtreeWorkspaceActionResult> {
  return runWorkspaceInit(ctx, params.tree, "review.init", params);
}

export async function handleTechtreeV1ReviewExec(
  _ctx: RuntimeContext,
  params: { tree: TechtreeTreeName; workspace_path: string },
): Promise<TechtreeWorkspaceActionResult> {
  const result = await runTechtreeCoreJson<TechtreeWorkspaceActionResult>("review.exec", params, {
    cwd: params.workspace_path,
  });
  return {
    ...result,
    tree: params.tree,
  };
}

export async function handleTechtreeV1ReviewCompile(
  _ctx: RuntimeContext,
  params: { tree: TechtreeTreeName; workspace_path: string },
): Promise<TechtreeCompilerOutput<Record<string, unknown>>> {
  return compileWorkspace("review.compile", params.workspace_path);
}

export async function handleTechtreeV1ReviewPin(
  ctx: RuntimeContext,
  params: { tree: TechtreeTreeName; workspace_path: string },
) {
  return pinWorkspace(ctx, params.tree, "review", "review.compile", params.workspace_path);
}

export async function handleTechtreeV1ReviewPublish(
  ctx: RuntimeContext,
  params: { tree: TechtreeTreeName; workspace_path: string },
) {
  return publishWorkspace(ctx, params.tree, "review", "review.compile", params.workspace_path);
}

export async function handleTechtreeV1Fetch(
  ctx: RuntimeContext,
  params: { tree: TechtreeTreeName; node_id: TechtreeNodeId; workspace_path?: string | null },
): Promise<TechtreeFetchResponse & { tree: TechtreeTreeName }> {
  const client = ctx.techtreePublisher;
  const fetched = await client.fetchNode({
    node_id: params.node_id,
    materialize_to: params.workspace_path,
  });
  return {
    tree: params.tree,
    ...fetched,
  };
}

export async function handleTechtreeV1Verify(
  ctx: RuntimeContext,
  params: { tree: TechtreeTreeName; node_id: TechtreeNodeId; workspace_path?: string | null },
): Promise<TechtreeVerifyResponse & { tree: TechtreeTreeName }> {
  const client = ctx.techtreePublisher;
  const fetched = await client.fetchNode({
    node_id: params.node_id,
    materialize_to: params.workspace_path,
  });
  const verification = await runTechtreeCoreJson<TechtreeVerifyResponse>("verify", {
    node_id: params.node_id,
    workspace_path: params.workspace_path,
    fetched,
  }, { cwd: params.workspace_path ?? process.cwd() });
  return {
    tree: params.tree,
    ...verification,
  };
}

export async function handleTechtreeV1BbhLeaderboard(
  ctx: RuntimeContext,
  params?: { split?: "climb" | "benchmark" | "challenge" | "draft" },
): Promise<BbhLeaderboardResponse> {
  return ctx.techtree.getBbhLeaderboard(params);
}

export async function handleTechtreeV1BbhRunExec(
  ctx: RuntimeContext,
  params: BbhRunExecParams,
): Promise<BbhRunExecResponse> {
  const resolvedMetadata = ctx.agentRouter.resolveRunMetadata(params.metadata ?? null);
  return materializeBbhWorkspace(ctx.techtree, ctx.config, params, resolvedMetadata);
}

export async function handleTechtreeV1BbhSubmit(
  ctx: RuntimeContext,
  params: BbhSubmitParams,
): Promise<BbhRunSubmitResponse> {
  return ctx.techtree.submitBbhRun(await loadBbhRunSubmitRequest(params.workspace_path));
}

export async function handleTechtreeV1BbhValidate(
  ctx: RuntimeContext,
  params: BbhValidateParams,
): Promise<BbhValidationSubmitResponse> {
  return ctx.techtree.submitBbhValidation(await buildBbhValidationRequest(params.workspace_path, params.run_id));
}

export async function handleTechtreeV1BbhSync(
  ctx: RuntimeContext,
  params?: BbhSyncParams,
): Promise<BbhSyncResponse> {
  const workspaceRoot = params?.workspace_root ?? path.join(ctx.config.workloads.bbh.workspaceRoot, "runs");

  const entries = await fs.readdir(workspaceRoot, { withFileTypes: true }).catch(() => []);
  const runIds = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);

  return ctx.techtree.syncBbh({ run_ids: runIds });
}
