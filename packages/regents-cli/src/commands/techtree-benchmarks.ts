import { daemonCall } from "../daemon-client.js";
import {
  getBooleanFlag,
  getFlag,
  parseIntegerFlag,
  requireArg,
  type ParsedCliArgs,
} from "../parse.js";
import { printJson } from "../printer.js";

const capsuleId = (args: ParsedCliArgs): string => requireArg(args.positionals[3], "capsule id");

export async function runTechtreeBenchmarksList(args: ParsedCliArgs, configPath?: string): Promise<void> {
  printJson(
    await daemonCall(
      "techtree.benchmarks.capsules.list",
      {
        domain: getFlag(args, "domain"),
        field: getFlag(args, "field"),
        status: getFlag(args, "status"),
        difficulty: getFlag(args, "difficulty"),
        limit: parseIntegerFlag(args, "limit"),
      },
      configPath,
    ),
  );
}

export async function runTechtreeBenchmarksGet(args: ParsedCliArgs, configPath?: string): Promise<void> {
  printJson(await daemonCall("techtree.benchmarks.capsules.get", { capsule_id: capsuleId(args) }, configPath));
}

export async function runTechtreeBenchmarksScoreboard(args: ParsedCliArgs, configPath?: string): Promise<void> {
  printJson(await daemonCall("techtree.benchmarks.scoreboard", { capsule_id: capsuleId(args) }, configPath));
}

export async function runTechtreeBenchmarksReliability(args: ParsedCliArgs, configPath?: string): Promise<void> {
  printJson(await daemonCall("techtree.benchmarks.reliability", { capsule_id: capsuleId(args) }, configPath));
}

export async function runTechtreeBenchmarksCapsuleInit(args: ParsedCliArgs, configPath?: string): Promise<void> {
  printJson(
    await daemonCall(
      "techtree.benchmarks.capsule.init",
      {
        workspace_path: requireArg(getFlag(args, "workspace-path"), "--workspace-path"),
        title: getFlag(args, "title"),
        domain: getFlag(args, "domain"),
        field: getFlag(args, "field"),
        ground_truth_policy: getFlag(args, "ground-truth-policy"),
      },
      configPath,
    ),
  );
}

export async function runTechtreeBenchmarksCapsulePack(args: ParsedCliArgs, configPath?: string): Promise<void> {
  printJson(
    await daemonCall(
      "techtree.benchmarks.capsule.pack",
      { workspace_path: requireArg(getFlag(args, "workspace-path"), "--workspace-path") },
      configPath,
    ),
  );
}

export async function runTechtreeBenchmarksCapsuleSubmit(args: ParsedCliArgs, configPath?: string): Promise<void> {
  printJson(
    await daemonCall(
      "techtree.benchmarks.capsule.submit",
      { workspace_path: requireArg(getFlag(args, "workspace-path"), "--workspace-path") },
      configPath,
    ),
  );
}

export async function runTechtreeBenchmarksRunMaterialize(args: ParsedCliArgs, configPath?: string): Promise<void> {
  printJson(
    await daemonCall(
      "techtree.benchmarks.run.materialize",
      {
        workspace_path: requireArg(getFlag(args, "workspace-path"), "--workspace-path"),
        capsule_id: requireArg(getFlag(args, "capsule-id"), "--capsule-id"),
        version_id: getFlag(args, "version-id"),
        runner_kind: getFlag(args, "runner-kind"),
        model_id: getFlag(args, "model-id"),
        harness_version: getFlag(args, "harness-version"),
      },
      configPath,
    ),
  );
}

export async function runTechtreeBenchmarksRunSubmit(args: ParsedCliArgs, configPath?: string): Promise<void> {
  printJson(
    await daemonCall(
      "techtree.benchmarks.run.submit",
      { workspace_path: requireArg(getFlag(args, "workspace-path"), "--workspace-path") },
      configPath,
    ),
  );
}

export async function runTechtreeBenchmarksRunRepeat(args: ParsedCliArgs, configPath?: string): Promise<void> {
  printJson(
    await daemonCall(
      "techtree.benchmarks.run.repeat",
      {
        workspace_path: requireArg(getFlag(args, "workspace-path"), "--workspace-path"),
        n: parseIntegerFlag(args, "n"),
        submit: getBooleanFlag(args, "submit"),
      },
      configPath,
    ),
  );
}

export async function runTechtreeBenchmarksValidate(args: ParsedCliArgs, configPath?: string): Promise<void> {
  printJson(
    await daemonCall(
      "techtree.benchmarks.validate",
      { workspace_path: requireArg(getFlag(args, "workspace-path"), "--workspace-path") },
      configPath,
    ),
  );
}

