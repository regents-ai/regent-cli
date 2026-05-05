import type { paths as PlatformPaths } from "../generated/platform-openapi.js";

import { getBooleanFlag, getFlag, requireArg, requirePositional, type ParsedCliArgs } from "../parse.js";
import { printJson } from "../printer.js";
import type {
  JsonRequestBodyFor,
  JsonSuccessResponseFor,
} from "../contracts/openapi-helpers.js";
import { submitPreparedTxRequest, txRequestFromWalletAction } from "./autolaunch/shared.js";
import { requestProductJson } from "./product-http.js";
import { stakeBody, stakeReceiverFlag } from "./stake-receiver.js";

type RegentStakingOverviewResponse = JsonSuccessResponseFor<
  PlatformPaths,
  "/v1/agent/regent/staking",
  "get"
>;
type RegentStakingAccountResponse = JsonSuccessResponseFor<
  PlatformPaths,
  "/v1/agent/regent/staking/account/{address}",
  "get"
>;
type RegentStakingStakeBody = JsonRequestBodyFor<
  PlatformPaths,
  "/v1/agent/regent/staking/stake",
  "post"
>;
type RegentStakingStakeResponse = JsonSuccessResponseFor<
  PlatformPaths,
  "/v1/agent/regent/staking/stake",
  "post"
>;
type RegentStakingUnstakeBody = JsonRequestBodyFor<
  PlatformPaths,
  "/v1/agent/regent/staking/unstake",
  "post"
>;
type RegentStakingUnstakeResponse = JsonSuccessResponseFor<
  PlatformPaths,
  "/v1/agent/regent/staking/unstake",
  "post"
>;
type RegentStakingClaimResponse = JsonSuccessResponseFor<
  PlatformPaths,
  "/v1/agent/regent/staking/claim-usdc",
  "post"
>;
type RegentStakingClaimRegentResponse = JsonSuccessResponseFor<
  PlatformPaths,
  "/v1/agent/regent/staking/claim-regent",
  "post"
>;
type RegentStakingClaimAndRestakeRegentResponse = JsonSuccessResponseFor<
  PlatformPaths,
  "/v1/agent/regent/staking/claim-and-restake-regent",
  "post"
>;

const requestStakingJson = async <TResponse>(
  method: "GET" | "POST",
  endpointPath: string,
  options: {
    readonly body?: unknown;
    readonly configPath?: string;
  } = {},
): Promise<TResponse> =>
  requestProductJson<TResponse>(method, endpointPath, {
    body: options.body,
    configPath: options.configPath,
    requireAgentAuth: true,
    authAudience: "regent-services",
    service: "siwa",
    commandName: "regents regent-staking",
  });

type StakingPreparedPayload = Record<string, unknown> & {
  readonly wallet_action?: unknown;
};

const printPreparedOrSubmitted = async (
  payload: StakingPreparedPayload,
  args: ParsedCliArgs,
  configPath?: string,
): Promise<void> => {
  if (!getBooleanFlag(args, "submit")) {
    printJson(payload);
    return;
  }

  const txRequest = txRequestFromWalletAction(payload.wallet_action);

  if (!txRequest) {
    throw new Error("This staking action did not include a transaction to submit.");
  }

  const txHash = await submitPreparedTxRequest(txRequest, configPath);
  printJson({ ...payload, submitted: true, tx_hash: txHash });
};

export async function runRegentStakingGet(configPath?: string): Promise<void> {
  printJson(
    await requestStakingJson<RegentStakingOverviewResponse>("GET", "/v1/agent/regent/staking", {
      configPath,
    }),
  );
}

export async function runRegentStakingAccount(
  args: ParsedCliArgs,
  configPath?: string,
): Promise<void> {
  const address = requirePositional(args, 2, "address");
  printJson(
    await requestStakingJson<RegentStakingAccountResponse>(
      "GET",
      `/v1/agent/regent/staking/account/${encodeURIComponent(address)}`,
      {
        configPath,
      },
    ),
  );
}

export async function runRegentStakingStake(
  args: ParsedCliArgs,
  configPath?: string,
): Promise<void> {
  const amount = requireArg(getFlag(args, "amount"), "amount");
  const receiver = stakeReceiverFlag(args);

  const body: RegentStakingStakeBody = stakeBody(amount, receiver);
  await printPreparedOrSubmitted(
    await requestStakingJson<RegentStakingStakeResponse>("POST", "/v1/agent/regent/staking/stake", {
      body,
      configPath,
    }),
    args,
    configPath,
  );
}

export async function runRegentStakingUnstake(
  args: ParsedCliArgs,
  configPath?: string,
): Promise<void> {
  const body: RegentStakingUnstakeBody = {
    amount: requireArg(getFlag(args, "amount"), "amount"),
  };
  await printPreparedOrSubmitted(
    await requestStakingJson<RegentStakingUnstakeResponse>("POST", "/v1/agent/regent/staking/unstake", {
      body,
      configPath,
    }),
    args,
    configPath,
  );
}

export async function runRegentStakingClaimUsdc(
  args: ParsedCliArgs,
  configPath?: string,
): Promise<void> {
  const payload = await requestStakingJson<RegentStakingClaimResponse>(
    "POST",
    "/v1/agent/regent/staking/claim-usdc",
    {
      configPath,
    },
  );

  await printPreparedOrSubmitted(payload as StakingPreparedPayload, args, configPath);
}

export async function runRegentStakingClaimRegent(
  args: ParsedCliArgs,
  configPath?: string,
): Promise<void> {
  const payload = await requestStakingJson<RegentStakingClaimRegentResponse>(
    "POST",
    "/v1/agent/regent/staking/claim-regent",
    {
      configPath,
    },
  );

  await printPreparedOrSubmitted(payload as StakingPreparedPayload, args, configPath);
}

export async function runRegentStakingClaimAndRestakeRegent(
  args: ParsedCliArgs,
  configPath?: string,
): Promise<void> {
  const payload = await requestStakingJson<RegentStakingClaimAndRestakeRegentResponse>(
    "POST",
    "/v1/agent/regent/staking/claim-and-restake-regent",
    {
      configPath,
    },
  );

  await printPreparedOrSubmitted(payload as StakingPreparedPayload, args, configPath);
}
