import { loadAgentAuthState } from "../agent-auth.js";
import { deriveWalletAddress, signPersonalMessage } from "../../internal-runtime/agent/wallet.js";
import type { LocalAgentIdentity } from "../../internal-types/index.js";
import { getBooleanFlag, getFlag, requireArg, type ParsedCliArgs } from "../../parse.js";
import {
  CLI_PALETTE,
  printJson,
  printText,
  renderKeyValueLines,
  renderPanel,
  tone,
  type KeyValueRow,
} from "../../printer.js";
import {
  configuredPrivateKey,
  requestTypedJson,
  type JsonObject,
} from "./shared.js";

const PAIRING_CODE_REGEX = /^AL-([A-Z2-9]{6})-[A-Z2-9]{8}$/u;

const requirePairingCode = (args: ParsedCliArgs): { code: string; nonce: string } => {
  const code = requireArg(getFlag(args, "code"), "code");
  const match = PAIRING_CODE_REGEX.exec(code);
  if (!match?.[1]) {
    throw new Error("Pairing code is invalid.");
  }

  return { code, nonce: match[1] };
};

const challengeMessage = (nonce: string): string =>
  `Autolaunch agent pairing\n\nPairing: AL-${nonce}\nNonce: ${nonce}`;

interface AgentPairingAgent {
  readonly agent_id: string;
  readonly agent_wallet_address: string;
  readonly agent_chain_id: number;
  readonly agent_registry_address: string;
  readonly agent_token_id: string;
  readonly agent_label?: string | null;
}

interface AgentPairingSession {
  readonly session_id: string;
  readonly status: "pending" | "completed" | "expired";
  readonly agent: AgentPairingAgent | null;
}

interface AgentPairingSessionEnvelope {
  readonly ok: true;
  readonly session: AgentPairingSession;
}

const requireIdentity = (identity: LocalAgentIdentity | null): Required<LocalAgentIdentity> => {
  if (
    !identity?.walletAddress ||
    typeof identity.chainId !== "number" ||
    !identity.registryAddress ||
    !identity.tokenId
  ) {
    throw new Error("This machine does not have a saved Regent agent yet. Run `regents identity ensure` first.");
  }

  return {
    walletAddress: identity.walletAddress,
    chainId: identity.chainId,
    registryAddress: identity.registryAddress,
    tokenId: identity.tokenId,
    label: identity.label ?? "",
  };
};

const assertSigningWalletMatchesIdentity = (
  signingWalletAddress: string,
  identityWalletAddress: string,
): void => {
  if (signingWalletAddress.toLowerCase() !== identityWalletAddress.toLowerCase()) {
    throw new Error("The saved Regent agent wallet does not match the configured signing key.");
  }
};

const requirePairedAgent = (session: AgentPairingSession): AgentPairingAgent => {
  if (!session.agent) {
    throw new Error("Autolaunch did not return the connected agent for this pairing.");
  }

  return session.agent;
};

const shortAddress = (address: string): string =>
  /^0x[0-9a-fA-F]{40}$/u.test(address) ? `${address.slice(0, 6)}...${address.slice(-4)}` : address;

const renderPairingReceipt = (payload: AgentPairingSessionEnvelope): string => {
  const session = payload.session;
  const pairedAgent = requirePairedAgent(session);
  const label = pairedAgent.agent_label?.trim();
  const rows: KeyValueRow[] = [
    {
      label: "status",
      value: session.status,
      valueColor: session.status === "completed" ? CLI_PALETTE.emphasis : CLI_PALETTE.accent,
    },
    { label: "session", value: session.session_id },
    {
      label: "agent",
      value: label ? `${label} (${pairedAgent.agent_id})` : pairedAgent.agent_id,
      valueColor: CLI_PALETTE.primary,
    },
    { label: "chain", value: String(pairedAgent.agent_chain_id) },
    { label: "wallet", value: shortAddress(pairedAgent.agent_wallet_address) },
    { label: "registry", value: shortAddress(pairedAgent.agent_registry_address) },
    { label: "token", value: pairedAgent.agent_token_id },
  ];

  return renderPanel(
    "AUTOLAUNCH PAIRING COMPLETE",
    [
      ...renderKeyValueLines(rows),
      "",
      tone("No private keys were shared and no funds moved.", CLI_PALETTE.secondary),
      tone("Open your Autolaunch profile to review the connected agent.", CLI_PALETTE.secondary),
    ],
    {
      borderColor: CLI_PALETTE.emphasis,
      titleColor: CLI_PALETTE.title,
    },
  );
};

export const runAutolaunchPair = async (
  args: ParsedCliArgs,
  configPath?: string,
): Promise<void> => {
  const { code, nonce } = requirePairingCode(args);
  const { identity } = loadAgentAuthState(configPath);
  const agent = requireIdentity(identity);
  const privateKey = await configuredPrivateKey(configPath);
  const signingWalletAddress = await deriveWalletAddress(privateKey);

  assertSigningWalletMatchesIdentity(signingWalletAddress, agent.walletAddress);

  const message = challengeMessage(nonce);
  const label = getFlag(args, "label") ?? (agent.label === "" ? undefined : agent.label);
  const body: JsonObject = {
    pairing_code: code,
    challenge_message: message,
    agent_wallet_address: agent.walletAddress,
    agent_chain_id: agent.chainId,
    agent_registry_address: agent.registryAddress,
    agent_token_id: agent.tokenId,
    signature_type: "evm_personal_sign",
    signature: await signPersonalMessage(privateKey, message),
    signed_at: new Date().toISOString(),
    ...(label !== undefined ? { agent_label: label } : {}),
  };

  const payload = await requestTypedJson<AgentPairingSessionEnvelope>(
    "POST",
    "/v1/app/agent-pairings/complete",
    {
      body,
      configPath,
    },
  );

  if (getBooleanFlag(args, "json")) {
    printJson(payload);
    return;
  }

  printText(renderPairingReceipt(payload));
};
