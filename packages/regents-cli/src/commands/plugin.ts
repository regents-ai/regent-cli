import { CliUsageError } from "../cli-usage-error.js";
import { getFlag, type ParsedCliArgs } from "../parse.js";
import { printJson } from "../printer.js";
import {
  installPlugin,
  pluginStatus,
  type RegentAgentRuntime,
  type RegentAgentRuntimeSelector,
} from "../internal-runtime/plugin-bridge.js";

const parseRuntimeSelector = (value: string | undefined): RegentAgentRuntimeSelector => {
  const runtime = value ?? "auto";
  if (runtime === "auto" || runtime === "hermes" || runtime === "openclaw") {
    return runtime;
  }
  throw new CliUsageError({
    code: "invalid_flag_value",
    message: "--runtime must be auto, hermes, or openclaw.",
  });
};

const parseInstallRuntime = (value: string | undefined): RegentAgentRuntime => {
  if (value === "hermes" || value === "openclaw") {
    return value;
  }
  throw new CliUsageError({
    code: "invalid_flag_value",
    message: "--runtime must be hermes or openclaw.",
  });
};

export async function runPluginStatus(args: ParsedCliArgs): Promise<number> {
  printJson(pluginStatus(parseRuntimeSelector(getFlag(args, "runtime"))));
  return 0;
}

export async function runPluginInstall(args: ParsedCliArgs): Promise<number> {
  printJson(installPlugin(parseInstallRuntime(getFlag(args, "runtime"))));
  return 0;
}

export async function runPluginDoctor(args: ParsedCliArgs): Promise<number> {
  const report = pluginStatus(parseRuntimeSelector(getFlag(args, "runtime")));
  printJson({
    ...report,
    ok: report.runtimes.every((runtime) => runtime.installed),
    missing: report.runtimes.filter((runtime) => !runtime.installed).map((runtime) => runtime.runtime),
  });
  return 0;
}
