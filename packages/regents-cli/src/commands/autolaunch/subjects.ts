import {
  getBooleanFlag,
  getFlag,
  requireArg,
  type ParsedCliArgs,
} from "../../parse.js";
import { printJson } from "../../printer.js";
import { stakeBody, stakeReceiverFlag } from "../stake-receiver.js";
import {
  type JsonObject,
  requestJson,
  requirePositional,
  submitPreparedTxRequest,
  txRequestFromWalletAction,
} from "./shared.js";

const preparedActionFromEnvelope = (envelope: JsonObject): JsonObject => {
  const preparedAction = envelope.prepared;
  if (!preparedAction || typeof preparedAction !== "object" || Array.isArray(preparedAction)) {
    throw new Error("This Autolaunch action did not include a transaction to submit.");
  }

  return preparedAction;
};

const prepareOrSubmitWrite = async (
  method: "POST",
  path: string,
  body: Record<string, unknown>,
  args: ParsedCliArgs,
  configPath?: string,
): Promise<void> => {
  const prepared = await requestJson(method, path, {
    body,
    requireAgentAuth: true,
    configPath,
  });

  if (!getBooleanFlag(args, "submit")) {
    printJson(prepared);
    return;
  }

  const preparedAction = preparedActionFromEnvelope(prepared);
  const txRequest = txRequestFromWalletAction(preparedAction.wallet_action);

  if (!txRequest) {
    throw new Error("This Autolaunch action did not include a transaction to submit.");
  }

  const txHash = await submitPreparedTxRequest(txRequest, configPath);
  printJson(
    await requestJson(method, path, {
      body: { ...body, tx_hash: txHash },
      requireAgentAuth: true,
      configPath,
    }),
  );
};

const requireHoldingSubjectId = (args: ParsedCliArgs): string =>
  requirePositional(args, 3, "subject-id");

export async function runAutolaunchSubjectGet(
  args: ParsedCliArgs,
  configPath?: string,
): Promise<void> {
  const subjectId = requirePositional(args, 3, "subject-id");
  printJson(
    await requestJson("GET", `/v1/agent/subjects/${encodeURIComponent(subjectId)}`, {
      requireAgentAuth: true,
      configPath,
    }),
  );
}

export async function runAutolaunchSubjectIngress(
  args: ParsedCliArgs,
  configPath?: string,
): Promise<void> {
  const subjectId = requirePositional(args, 3, "subject-id");
  printJson(
    await requestJson(
      "GET",
      `/v1/agent/subjects/${encodeURIComponent(subjectId)}/ingress`,
      { requireAgentAuth: true, configPath },
    ),
  );
}

export async function runAutolaunchSubjectStake(
  args: ParsedCliArgs,
  configPath?: string,
): Promise<void> {
  const subjectId = requirePositional(args, 3, "subject-id");
  const amount = requireArg(getFlag(args, "amount"), "amount");
  const receiver = stakeReceiverFlag(args);

  await prepareOrSubmitWrite(
    "POST",
    `/v1/agent/subjects/${encodeURIComponent(subjectId)}/stake`,
    stakeBody(amount, receiver),
    args,
    configPath,
  );
}

export async function runAutolaunchSubjectUnstake(
  args: ParsedCliArgs,
  configPath?: string,
): Promise<void> {
  const subjectId = requirePositional(args, 3, "subject-id");
  await prepareOrSubmitWrite(
    "POST",
    `/v1/agent/subjects/${encodeURIComponent(subjectId)}/unstake`,
    { amount: requireArg(getFlag(args, "amount"), "amount") },
    args,
    configPath,
  );
}

export async function runAutolaunchSubjectClaimUsdc(
  args: ParsedCliArgs,
  configPath?: string,
): Promise<void> {
  const subjectId = requirePositional(args, 3, "subject-id");
  await prepareOrSubmitWrite(
    "POST",
    `/v1/agent/subjects/${encodeURIComponent(subjectId)}/claim-usdc`,
    {},
    args,
    configPath,
  );
}

export async function runAutolaunchSubjectClaimEmissions(
  args: ParsedCliArgs,
  configPath?: string,
): Promise<void> {
  const subjectId = requirePositional(args, 3, "subject-id");
  await prepareOrSubmitWrite(
    "POST",
    `/v1/agent/subjects/${encodeURIComponent(subjectId)}/claim-emissions`,
    {},
    args,
    configPath,
  );
}

export async function runAutolaunchSubjectClaimAndStakeEmissions(
  args: ParsedCliArgs,
  configPath?: string,
): Promise<void> {
  const subjectId = requirePositional(args, 3, "subject-id");
  await prepareOrSubmitWrite(
    "POST",
    `/v1/agent/subjects/${encodeURIComponent(subjectId)}/claim-and-stake-emissions`,
    {},
    args,
    configPath,
  );
}

export async function runAutolaunchSubjectSweepIngress(
  args: ParsedCliArgs,
  configPath?: string,
): Promise<void> {
  const subjectId = requirePositional(args, 3, "subject-id");
  const address = requireArg(getFlag(args, "address"), "address");

  await prepareOrSubmitWrite(
    "POST",
    `/v1/agent/subjects/${encodeURIComponent(subjectId)}/ingress/${encodeURIComponent(address)}/sweep`,
    {},
    args,
    configPath,
  );
}

export async function runAutolaunchHoldingsStake(
  args: ParsedCliArgs,
  configPath?: string,
): Promise<void> {
  const subjectId = requireHoldingSubjectId(args);
  const amount = requireArg(getFlag(args, "amount"), "amount");
  const receiver = stakeReceiverFlag(args);

  await prepareOrSubmitWrite(
    "POST",
    `/v1/agent/subjects/${encodeURIComponent(subjectId)}/stake`,
    stakeBody(amount, receiver),
    args,
    configPath,
  );
}

export async function runAutolaunchHoldingsUnstake(
  args: ParsedCliArgs,
  configPath?: string,
): Promise<void> {
  const subjectId = requireHoldingSubjectId(args);
  await prepareOrSubmitWrite(
    "POST",
    `/v1/agent/subjects/${encodeURIComponent(subjectId)}/unstake`,
    { amount: requireArg(getFlag(args, "amount"), "amount") },
    args,
    configPath,
  );
}

export async function runAutolaunchHoldingsClaimUsdc(
  args: ParsedCliArgs,
  configPath?: string,
): Promise<void> {
  const subjectId = requireHoldingSubjectId(args);
  await prepareOrSubmitWrite(
    "POST",
    `/v1/agent/subjects/${encodeURIComponent(subjectId)}/claim-usdc`,
    {},
    args,
    configPath,
  );
}

export async function runAutolaunchHoldingsClaimEmissions(
  args: ParsedCliArgs,
  configPath?: string,
): Promise<void> {
  const subjectId = requireHoldingSubjectId(args);
  await prepareOrSubmitWrite(
    "POST",
    `/v1/agent/subjects/${encodeURIComponent(subjectId)}/claim-emissions`,
    {},
    args,
    configPath,
  );
}

export async function runAutolaunchHoldingsClaimAndStakeEmissions(
  args: ParsedCliArgs,
  configPath?: string,
): Promise<void> {
  const subjectId = requireHoldingSubjectId(args);
  await prepareOrSubmitWrite(
    "POST",
    `/v1/agent/subjects/${encodeURIComponent(subjectId)}/claim-and-stake-emissions`,
    {},
    args,
    configPath,
  );
}

export async function runAutolaunchHoldingsSweepIngress(
  args: ParsedCliArgs,
  configPath?: string,
): Promise<void> {
  const subjectId = requireHoldingSubjectId(args);
  const ingressAddress = requireArg(getFlag(args, "address"), "address");
  await prepareOrSubmitWrite(
    "POST",
    `/v1/agent/subjects/${encodeURIComponent(subjectId)}/ingress/${encodeURIComponent(ingressAddress)}/sweep`,
    {},
    args,
    configPath,
  );
}
