import { CliUsageError } from "../cli-usage-error.js";
import { getBooleanFlag, getFlag, type ParsedCliArgs } from "../parse.js";
import { printJson } from "../printer.js";
import { installPlugin, pluginStatus, selectedRuntimes, type RegentAgentRuntimeSelector } from "../internal-runtime/plugin-bridge.js";

const parseRuntime = (value: string | undefined): RegentAgentRuntimeSelector => {
  if (value === "auto" || value === "hermes" || value === "openclaw") {
    return value;
  }
  throw new CliUsageError({
    code: "invalid_flag_value",
    message: "--runtime must be auto, hermes, or openclaw.",
  });
};

export async function runSetup(args: ParsedCliArgs): Promise<number> {
  const runtime = parseRuntime(getFlag(args, "runtime"));
  const install = getBooleanFlag(args, "install-plugin");
  const installs = install ? selectedRuntimes(runtime).map((entry) => installPlugin(entry)) : [];

  printJson({
    ok: true,
    runtime,
    plugin_status: pluginStatus(runtime),
    installed_plugins: installs,
    next: [
      "regents identity ensure",
      "regents run",
      "regents techtree work next --json",
    ],
  });

  return 0;
}
