import { daemonCall } from "../daemon-client.js";
import { getFlag, parseIntegerFlag, requireArg, type ParsedCliArgs } from "../parse.js";
import { printJson } from "../printer.js";
import { parseWorkKind } from "../internal-runtime/workloads/work.js";

export async function runTechtreeWorkList(args: ParsedCliArgs, configPath?: string): Promise<void> {
  printJson(
    await daemonCall(
      "techtree.work.list",
      {
        kind: parseWorkKind(getFlag(args, "kind")),
        limit: parseIntegerFlag(args, "limit"),
      },
      configPath,
    ),
  );
}

export async function runTechtreeWorkNext(args: ParsedCliArgs, configPath?: string): Promise<void> {
  printJson(
    await daemonCall(
      "techtree.work.next",
      {
        kind: parseWorkKind(getFlag(args, "kind")),
      },
      configPath,
    ),
  );
}

export async function runTechtreeWorkAccept(args: ParsedCliArgs, configPath?: string): Promise<void> {
  printJson(
    await daemonCall(
      "techtree.work.accept",
      {
        work_unit: requireArg(getFlag(args, "work-unit"), "--work-unit"),
        workspace_path: getFlag(args, "workspace-path"),
      },
      configPath,
    ),
  );
}

export async function runTechtreeWorkPublish(args: ParsedCliArgs, configPath?: string): Promise<void> {
  printJson(
    await daemonCall(
      "techtree.work.publish",
      {
        workspace_path: requireArg(getFlag(args, "workspace-path"), "--workspace-path"),
      },
      configPath,
    ),
  );
}
