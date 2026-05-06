import { CliUsageError } from "../cli-usage-error.js";
import { daemonCall } from "../daemon-client.js";
import {
  getBooleanFlag,
  getFlag,
  parseIntegerFlag,
  parsePositiveInteger,
  requireArg,
  type ParsedCliArgs,
} from "../parse.js";
import { printJson } from "../printer.js";
import type { TechRewardLane } from "../internal-types/index.js";

const requireIntegerFlag = (args: ParsedCliArgs, name: string): number =>
  parsePositiveInteger(
    requireArg(getFlag(args, name), `--${name}`),
    `invalid integer for --${name}`,
  );

const requireRewardLane = (args: ParsedCliArgs): TechRewardLane => {
  const lane = requireArg(getFlag(args, "lane"), "--lane");
  if (lane === "science" || lane === "usdc_input") {
    return lane;
  }

  throw new CliUsageError({
    code: "invalid_flag_value",
    message: "--lane must be science or usdc_input.",
  });
};

const requireHexAddressFlag = (args: ParsedCliArgs, name: string): `0x${string}` => {
  const value = requireArg(getFlag(args, name), `--${name}`);
  if (/^0x[a-fA-F0-9]{40}$/u.test(value)) {
    return value as `0x${string}`;
  }

  throw new CliUsageError({
    code: "invalid_flag_value",
    message: `--${name} must be a 20-byte hex address.`,
  });
};

const requireBytes32Flag = (args: ParsedCliArgs, name: string): `0x${string}` => {
  const value = requireArg(getFlag(args, name), `--${name}`);
  if (/^0x[a-fA-F0-9]{64}$/u.test(value)) {
    return value as `0x${string}`;
  }

  throw new CliUsageError({
    code: "invalid_flag_value",
    message: `--${name} must be a 32-byte hex value.`,
  });
};

export async function runTechtreeTechStatus(_args: ParsedCliArgs, configPath?: string): Promise<void> {
  printJson(await daemonCall("techtree.tech.status", undefined, configPath));
}

export async function runTechtreeTechEpochCurrent(_args: ParsedCliArgs, configPath?: string): Promise<void> {
  printJson(await daemonCall("techtree.tech.epochs.current", undefined, configPath));
}

export async function runTechtreeTechLeaderboardsList(args: ParsedCliArgs, configPath?: string): Promise<void> {
  printJson(
    await daemonCall(
      "techtree.tech.leaderboards.list",
      {
        status: getFlag(args, "status"),
        limit: parseIntegerFlag(args, "limit"),
      },
      configPath,
    ),
  );
}

export async function runTechtreeTechLeaderboardsRegister(args: ParsedCliArgs, configPath?: string): Promise<void> {
  printJson(
    await daemonCall(
      "techtree.tech.leaderboards.register",
      {
        leaderboard_id: requireArg(getFlag(args, "leaderboard-id"), "--leaderboard-id"),
        kind: requireArg(getFlag(args, "kind"), "--kind"),
        title: requireArg(getFlag(args, "title"), "--title"),
        weight_bps: requireIntegerFlag(args, "weight-bps"),
        starts_epoch: parseIntegerFlag(args, "starts-epoch"),
        ends_epoch: parseIntegerFlag(args, "ends-epoch"),
        config_hash: requireBytes32Flag(args, "config-hash"),
        uri: requireArg(getFlag(args, "uri"), "--uri"),
        active: getBooleanFlag(args, "inactive") ? false : undefined,
      },
      configPath,
    ),
  );
}

export async function runTechtreeTechRewardsList(args: ParsedCliArgs, configPath?: string): Promise<void> {
  printJson(
    await daemonCall(
      "techtree.tech.rewards.list",
      {
        epoch: parseIntegerFlag(args, "epoch"),
        lane: getFlag(args, "lane"),
        limit: parseIntegerFlag(args, "limit"),
      },
      configPath,
    ),
  );
}

export async function runTechtreeTechRewardsProof(args: ParsedCliArgs, configPath?: string): Promise<void> {
  printJson(
    await daemonCall(
      "techtree.tech.rewards.proof",
      {
        epoch: requireIntegerFlag(args, "epoch"),
        lane: requireRewardLane(args),
        agent_id: requireArg(getFlag(args, "agent-id"), "--agent-id"),
      },
      configPath,
    ),
  );
}

export async function runTechtreeTechRewardsClaim(args: ParsedCliArgs, configPath?: string): Promise<void> {
  printJson(
    await daemonCall(
      "techtree.tech.rewards.claim",
      {
        epoch: requireIntegerFlag(args, "epoch"),
        lane: requireRewardLane(args),
        agent_id: requireArg(getFlag(args, "agent-id"), "--agent-id"),
      },
      configPath,
    ),
  );
}

export async function runTechtreeTechWithdraw(args: ParsedCliArgs, configPath?: string): Promise<void> {
  printJson(
    await daemonCall(
      "techtree.tech.withdraw",
      {
        agent_id: requireArg(getFlag(args, "agent-id"), "--agent-id"),
        amount: requireArg(getFlag(args, "amount"), "--amount"),
        tech_recipient: requireHexAddressFlag(args, "tech-recipient"),
        regent_recipient: requireHexAddressFlag(args, "regent-recipient"),
        min_regent_out: requireArg(getFlag(args, "min-regent-out"), "--min-regent-out"),
        deadline: requireIntegerFlag(args, "deadline"),
      },
      configPath,
    ),
  );
}
