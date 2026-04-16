import type { IdentityEnsureFailure, RegentIdentityNetwork, RegentIdentityProvider } from "../internal-types/index.js";

import { ensureIdentity, loadConfig } from "../internal-runtime/index.js";
import { CommandExitError } from "../internal-runtime/errors.js";
import { getBooleanFlag, getFlag, parseIntegerFlag, type ParsedCliArgs } from "../parse.js";
import { printJson, printText } from "../printer.js";

const parseProvider = (value: string | undefined): RegentIdentityProvider => {
  if (!value || value === "auto") {
    return "auto";
  }
  if (value === "regent" || value === "moonpay" || value === "bankr" || value === "privy") {
    return value;
  }
  throw new CommandExitError("NO_SIGNER_PROVIDER_FOUND", `Unsupported provider: ${value}`, 10);
};

const parseNetwork = (value: string | undefined): RegentIdentityNetwork => {
  if (!value || value === "base") {
    return "base";
  }
  if (value === "base-sepolia") {
    return "base-sepolia";
  }
  throw new CommandExitError("UNSUPPORTED_NETWORK", `Unsupported network: ${value}`, 31);
};

const failurePayload = (error: CommandExitError): IdentityEnsureFailure => ({
  status: "error",
  code: error.code as IdentityEnsureFailure["code"],
  message: error.message,
  details: (error.details as Record<string, unknown> | undefined) ?? undefined,
});

const renderHumanSuccess = (result: Awaited<ReturnType<typeof ensureIdentity>>): string =>
  [
    "Regent identity ready.",
    `provider: ${result.provider}`,
    `network: ${result.network}`,
    `address: ${result.address}`,
    `agent_id: ${result.agent_id}`,
    `verified_until: ${result.receipt_expires_at}`,
    `cache: ${result.cache_path}`,
  ].join("\n");

export async function runIdentityEnsure(
  args: readonly string[] | ParsedCliArgs,
  configPath?: string,
): Promise<number> {
  const json = getBooleanFlag(args, "json");

  try {
    const timeoutSeconds = parseIntegerFlag(args, "timeout") ?? 120;
    const result = await ensureIdentity({
      provider: parseProvider(getFlag(args, "provider")),
      network: parseNetwork(getFlag(args, "network")),
      forceRefresh: getBooleanFlag(args, "force-refresh"),
      walletHint: getFlag(args, "wallet"),
      timeoutSeconds,
      config: loadConfig(configPath),
    });

    if (json) {
      printJson(result);
    } else {
      printText(renderHumanSuccess(result));
    }
    return 0;
  } catch (error) {
    const failure =
      error instanceof CommandExitError
        ? error
        : new CommandExitError(
            "SERVICE_UNAVAILABLE",
            error instanceof Error ? error.message : "Regent identity setup failed.",
            30,
          );

    if (json) {
      printJson(failurePayload(failure));
    } else {
      printText(failure.message);
    }
    return failure.exitCode;
  }
}
