import path from "node:path";

import type { BbhGenomeSource, BbhLane, BbhSplit, RegentRunMetadata, TechtreeNodeId, TechtreeTreeName } from "../internal-types/index.js";

import { daemonCall } from "../daemon-client.js";
import { getFlag, requireArg, type ParsedCliArgs } from "../parse.js";
import { printJson } from "../printer.js";

const normalizeTree = (value: string): TechtreeTreeName => {
  if (value === "main" || value === "bbh") {
    return value;
  }

  throw new Error("invalid tree; expected `main` or `bbh`");
};

const normalizeWorkspacePath = (args: ParsedCliArgs, fallbackIndex: number): string => {
  const explicit = getFlag(args, "workspace") ?? getFlag(args, "path");
  if (explicit) {
    return path.resolve(explicit);
  }

  const positional = args.positionals[fallbackIndex];
  return positional ? path.resolve(positional) : process.cwd();
};

const normalizeNodeId = (value: string | undefined, name = "node id"): TechtreeNodeId => {
  const required = requireArg(value, name);
  if (!/^0x[0-9a-f]{64}$/.test(required)) {
    throw new Error(`invalid ${name}`);
  }

  return required as TechtreeNodeId;
};

const readRunMetadata = (args: ParsedCliArgs): RegentRunMetadata | undefined => {
  const executorHarnessKind = getFlag(args, "executor-harness-kind");
  const executorHarnessProfile = getFlag(args, "executor-harness-profile");
  const executorHarnessEntrypoint = getFlag(args, "executor-harness-entrypoint");
  const originKind = getFlag(args, "origin-kind");
  const originTransport = getFlag(args, "origin-transport");
  const originSessionId = getFlag(args, "origin-session-id");
  const originTriggerRef = getFlag(args, "origin-trigger-ref");

  const hasAny =
    executorHarnessKind !== undefined ||
    executorHarnessProfile !== undefined ||
    executorHarnessEntrypoint !== undefined ||
    originKind !== undefined ||
    originTransport !== undefined ||
    originSessionId !== undefined ||
    originTriggerRef !== undefined;

  if (!hasAny) {
    return undefined;
  }

  return {
    executor_harness: {
      kind: (executorHarnessKind ?? "custom") as RegentRunMetadata["executor_harness"]["kind"],
      profile: executorHarnessProfile ?? "owner",
      ...(executorHarnessEntrypoint === undefined ? {} : { entrypoint: executorHarnessEntrypoint }),
    },
    origin: {
      kind: (originKind ?? "local") as RegentRunMetadata["origin"]["kind"],
      ...(originTransport === undefined
        ? {}
        : { transport: originTransport as RegentRunMetadata["origin"]["transport"] }),
      ...(originSessionId === undefined ? {} : { session_id: originSessionId }),
      ...(originTriggerRef === undefined ? {} : { trigger_ref: originTriggerRef }),
    },
  };
};

async function runWorkspaceCommand(
  method:
    | "techtree.v1.artifact.init"
    | "techtree.v1.artifact.compile"
    | "techtree.v1.artifact.pin"
    | "techtree.v1.artifact.publish"
    | "techtree.v1.run.exec"
    | "techtree.v1.run.compile"
    | "techtree.v1.run.pin"
    | "techtree.v1.run.publish"
    | "techtree.v1.review.exec"
    | "techtree.v1.review.compile"
    | "techtree.v1.review.pin"
    | "techtree.v1.review.publish",
  tree: TechtreeTreeName,
  args: ParsedCliArgs,
  configPath?: string,
  extraParams?: Record<string, unknown>,
): Promise<void> {
  printJson(
    await daemonCall(
      method,
      {
        tree,
        workspace_path: normalizeWorkspacePath(args, 4),
        ...extraParams,
      },
      configPath,
    ),
  );
}

export async function runTechtreeArtifactInit(
  treeValue: string,
  args: ParsedCliArgs,
  configPath?: string,
): Promise<void> {
  const tree = normalizeTree(treeValue);
  printJson(await daemonCall("techtree.v1.artifact.init", {
    tree,
    workspace_path: normalizeWorkspacePath(args, 4),
  }, configPath));
}

export async function runTechtreeArtifactCompile(
  treeValue: string,
  args: ParsedCliArgs,
  configPath?: string,
): Promise<void> {
  await runWorkspaceCommand("techtree.v1.artifact.compile", normalizeTree(treeValue), args, configPath);
}

export async function runTechtreeArtifactPin(
  treeValue: string,
  args: ParsedCliArgs,
  configPath?: string,
): Promise<void> {
  await runWorkspaceCommand("techtree.v1.artifact.pin", normalizeTree(treeValue), args, configPath);
}

export async function runTechtreeArtifactPublish(
  treeValue: string,
  args: ParsedCliArgs,
  configPath?: string,
): Promise<void> {
  await runWorkspaceCommand("techtree.v1.artifact.publish", normalizeTree(treeValue), args, configPath);
}

export async function runTechtreeRunInit(
  treeValue: string,
  args: ParsedCliArgs,
  configPath?: string,
): Promise<void> {
  const tree = normalizeTree(treeValue);
  const metadata = readRunMetadata(args);
  printJson(await daemonCall("techtree.v1.run.init", {
    tree,
    workspace_path: normalizeWorkspacePath(args, 4),
    artifact_id: normalizeNodeId(getFlag(args, "artifact") ?? getFlag(args, "artifact-id"), "artifact id"),
    ...(metadata ? { metadata } : {}),
  }, configPath));
}

export async function runTechtreeRunExec(
  treeValue: string,
  args: ParsedCliArgs,
  configPath?: string,
): Promise<void> {
  const metadata = readRunMetadata(args);
  await runWorkspaceCommand(
    "techtree.v1.run.exec",
    normalizeTree(treeValue),
    args,
    configPath,
    metadata ? { metadata } : undefined,
  );
}

export async function runTechtreeRunCompile(
  treeValue: string,
  args: ParsedCliArgs,
  configPath?: string,
): Promise<void> {
  await runWorkspaceCommand("techtree.v1.run.compile", normalizeTree(treeValue), args, configPath);
}

export async function runTechtreeRunPin(
  treeValue: string,
  args: ParsedCliArgs,
  configPath?: string,
): Promise<void> {
  await runWorkspaceCommand("techtree.v1.run.pin", normalizeTree(treeValue), args, configPath);
}

export async function runTechtreeRunPublish(
  treeValue: string,
  args: ParsedCliArgs,
  configPath?: string,
): Promise<void> {
  await runWorkspaceCommand("techtree.v1.run.publish", normalizeTree(treeValue), args, configPath);
}

export async function runTechtreeReviewInit(
  treeValue: string,
  args: ParsedCliArgs,
  configPath?: string,
): Promise<void> {
  const tree = normalizeTree(treeValue);
  printJson(await daemonCall("techtree.v1.review.init", {
    tree,
    workspace_path: normalizeWorkspacePath(args, 4),
    target_id: normalizeNodeId(getFlag(args, "target") ?? getFlag(args, "target-id"), "target id"),
  }, configPath));
}

export async function runTechtreeReviewExec(
  treeValue: string,
  args: ParsedCliArgs,
  configPath?: string,
): Promise<void> {
  await runWorkspaceCommand("techtree.v1.review.exec", normalizeTree(treeValue), args, configPath);
}

export async function runTechtreeReviewCompile(
  treeValue: string,
  args: ParsedCliArgs,
  configPath?: string,
): Promise<void> {
  await runWorkspaceCommand("techtree.v1.review.compile", normalizeTree(treeValue), args, configPath);
}

export async function runTechtreeReviewPin(
  treeValue: string,
  args: ParsedCliArgs,
  configPath?: string,
): Promise<void> {
  await runWorkspaceCommand("techtree.v1.review.pin", normalizeTree(treeValue), args, configPath);
}

export async function runTechtreeReviewPublish(
  treeValue: string,
  args: ParsedCliArgs,
  configPath?: string,
): Promise<void> {
  await runWorkspaceCommand("techtree.v1.review.publish", normalizeTree(treeValue), args, configPath);
}

export async function runTechtreeFetch(
  treeValue: string,
  args: ParsedCliArgs,
  configPath?: string,
): Promise<void> {
  const tree = normalizeTree(treeValue);
  printJson(await daemonCall("techtree.v1.fetch", {
    tree,
    node_id: normalizeNodeId(getFlag(args, "id") ?? args.positionals[3], "node id"),
    workspace_path: getFlag(args, "workspace") ?? getFlag(args, "path") ?? null,
  }, configPath));
}

export async function runTechtreeVerify(
  treeValue: string,
  args: ParsedCliArgs,
  configPath?: string,
): Promise<void> {
  const tree = normalizeTree(treeValue);
  printJson(await daemonCall("techtree.v1.verify", {
    tree,
    node_id: normalizeNodeId(getFlag(args, "id") ?? args.positionals[3], "node id"),
    workspace_path: getFlag(args, "workspace") ?? getFlag(args, "path") ?? null,
  }, configPath));
}

export async function runTechtreeBbhLeaderboard(args: ParsedCliArgs, configPath?: string): Promise<void> {
  const lane = readBbhLane(args, true);
  const response = await daemonCall(
    "techtree.v1.bbh.leaderboard",
    {
      ...(lane ? { split: laneToSplit(lane) } : {}),
    },
    configPath,
  );

  printJson(mapLeaderboardLane(response));
}

const normalizeBbhLane = (value: string, allowDraft = false): BbhLane => {
  if (value === "climb" || value === "benchmark" || value === "challenge" || (allowDraft && value === "draft")) {
    return value;
  }

  throw new Error(
    allowDraft
      ? "invalid BBH lane; expected `climb`, `benchmark`, `challenge`, or `draft`"
      : "invalid BBH lane; expected `climb`, `benchmark`, or `challenge`",
  );
};

const laneToSplit = (lane: BbhLane): BbhSplit => {
  if (lane === "climb" || lane === "benchmark" || lane === "challenge" || lane === "draft") {
    return lane;
  }

  throw new Error("invalid BBH lane");
};

const laneToExecSplit = (lane: Exclude<BbhLane, "draft">): "climb" | "benchmark" | "challenge" => {
  if (lane === "climb" || lane === "benchmark" || lane === "challenge") {
    return lane;
  }

  throw new Error("invalid public BBH lane");
};

const assertNoLegacyBbhSplitFlag = (args: ParsedCliArgs): void => {
  if (getFlag(args, "split") !== undefined) {
    throw new Error("invalid BBH flag; use --lane with `climb`, `benchmark`, `challenge`, or `draft`");
  }
};

const readBbhLane = (args: ParsedCliArgs, allowDraft = false): BbhLane | undefined => {
  assertNoLegacyBbhSplitFlag(args);
  const lane = getFlag(args, "lane");
  if (!lane) {
    return undefined;
  }

  return normalizeBbhLane(lane, allowDraft);
};

const mapRunExecLane = <T extends object>(payload: T): T & { lane?: BbhLane } => {
  const mapped = { ...payload } as Record<string, unknown>;

  if (typeof mapped.split === "string") {
    mapped.lane = mapped.split;
    delete mapped.split;
  }

  if (mapped.capsule && typeof mapped.capsule === "object" && !Array.isArray(mapped.capsule)) {
    const capsule = { ...(mapped.capsule as Record<string, unknown>) };
    if (typeof capsule.split === "string") {
      capsule.lane = capsule.split;
      delete capsule.split;
    }
    mapped.capsule = capsule;
  }

  return mapped as T & { lane?: BbhLane };
};

const mapLeaderboardLane = <T extends { data?: Record<string, unknown> }>(payload: T): T => {
  if (!payload.data || typeof payload.data !== "object" || Array.isArray(payload.data)) {
    return payload;
  }

  const data = { ...payload.data };
  if (typeof data.split === "string") {
    data.lane = data.split;
    delete data.split;
  }

  return {
    ...payload,
    data,
  };
};

const readBbhGenome = (args: ParsedCliArgs): Partial<BbhGenomeSource> | undefined => {
  const genome: Partial<BbhGenomeSource> = {};

  const set = <K extends keyof BbhGenomeSource>(key: K, flag: string): void => {
    const value = getFlag(args, flag);
    if (value !== undefined) {
      (genome as Record<string, unknown>)[key] = value;
    }
  };

  set("genome_id", "genome-id");
  set("label", "label");
  set("parent_genome_ref", "parent-genome-ref");
  set("model_id", "model-id");
  set("harness_type", "harness-type");
  set("harness_version", "harness-version");
  set("prompt_pack_version", "prompt-pack-version");
  set("skill_pack_version", "skill-pack-version");
  set("tool_profile", "tool-profile");
  set("runtime_image", "runtime-image");
  set("helper_code_hash", "helper-code-hash");
  set("data_profile", "data-profile");
  set("notes", "notes");

  return Object.keys(genome).length > 0 ? genome : undefined;
};

export async function runTechtreeBbhRunExec(args: ParsedCliArgs, configPath?: string): Promise<void> {
  const metadata = readRunMetadata(args);
  const genome = readBbhGenome(args);
  const lane = readBbhLane(args) as Exclude<BbhLane, "draft"> | undefined;

  const response = await daemonCall(
    "techtree.v1.bbh.run.exec",
    {
      workspace_path: normalizeWorkspacePath(args, 4),
      ...(lane ? { split: laneToExecSplit(lane) } : {}),
      ...(metadata ? { metadata } : {}),
      ...(genome ? { genome } : {}),
    },
    configPath,
  );

  printJson(mapRunExecLane(response));
}

export async function runTechtreeBbhSubmit(args: ParsedCliArgs, configPath?: string): Promise<void> {
  printJson(
    await daemonCall(
      "techtree.v1.bbh.submit",
      {
        workspace_path: normalizeWorkspacePath(args, 3),
      },
      configPath,
    ),
  );
}

export async function runTechtreeBbhValidate(args: ParsedCliArgs, configPath?: string): Promise<void> {
  const runId = getFlag(args, "run-id");

  printJson(
    await daemonCall(
      "techtree.v1.bbh.validate",
      {
        workspace_path: normalizeWorkspacePath(args, 3),
        ...(runId ? { run_id: runId } : {}),
      },
      configPath,
    ),
  );
}

export async function runTechtreeBbhSync(args: ParsedCliArgs, configPath?: string): Promise<void> {
  const workspaceRoot = getFlag(args, "workspace-root") ?? getFlag(args, "workspace") ?? getFlag(args, "path");

  printJson(
    await daemonCall(
      "techtree.v1.bbh.sync",
      workspaceRoot ? { workspace_root: path.resolve(workspaceRoot) } : undefined,
      configPath,
    ),
  );
}
