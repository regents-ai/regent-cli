import { CliUsageError } from "../cli-usage-error.js";
import { daemonCall } from "../daemon-client.js";
import { getFlag, parseIntegerFlag, requireArg, type ParsedCliArgs } from "../parse.js";
import { printJson } from "../printer.js";

const parseKind = (value: string | undefined): "paper" | "freeform" => {
  if (value === "paper" || value === "freeform") {
    return value;
  }

  throw new CliUsageError({
    code: "invalid_flag_value",
    message: "--kind must be paper or freeform.",
  });
};

export async function runTechtreeNotebooksInit(args: ParsedCliArgs, configPath?: string): Promise<void> {
  printJson(
    await daemonCall(
      "techtree.notebooks.init",
      {
        workspace_path: requireArg(getFlag(args, "workspace-path"), "--workspace-path"),
        kind: parseKind(getFlag(args, "kind")),
        title: requireArg(getFlag(args, "title"), "--title"),
        source: getFlag(args, "source"),
      },
      configPath,
    ),
  );
}

export async function runTechtreeNotebooksPair(args: ParsedCliArgs, configPath?: string): Promise<void> {
  printJson(
    await daemonCall(
      "techtree.notebooks.pair",
      {
        workspace_path: requireArg(getFlag(args, "workspace-path"), "--workspace-path"),
      },
      configPath,
    ),
  );
}

export async function runTechtreeNotebooksPublish(args: ParsedCliArgs, configPath?: string): Promise<void> {
  printJson(
    await daemonCall(
      "techtree.notebooks.publish",
      {
        workspace_path: requireArg(getFlag(args, "workspace-path"), "--workspace-path"),
        parent_id: parseIntegerFlag(args, "parent-id"),
      },
      configPath,
    ),
  );
}
