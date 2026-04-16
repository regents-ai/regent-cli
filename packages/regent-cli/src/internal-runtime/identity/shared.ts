import os from "node:os";
import path from "node:path";

import type {
  LocalAgentIdentity,
  RegentIdentityNetwork,
  RegentIdentityReceipt,
  RegentResolvedIdentityProvider,
  SiwaSession,
} from "../../internal-types/index.js";

export const IDENTITY_CACHE_FILENAME = "receipt-v1.json";

export const identityCachePath = (): string =>
  path.join(os.homedir(), ".regent", "identity", IDENTITY_CACHE_FILENAME);

export const identityNetworkChainId = (network: RegentIdentityNetwork): number => {
  switch (network) {
    case "base":
      return 8453;
    case "base-sepolia":
      return 84532;
  }
};

export const normalizeRegentBaseUrl = (input: string): string => input.replace(/\/+$/u, "");

export const isReceiptExpired = (
  receipt: Pick<RegentIdentityReceipt, "receipt_expires_at">,
  nowUnixSeconds = Math.floor(Date.now() / 1000),
): boolean => {
  const expiresAtUnixSeconds = Math.floor(Date.parse(receipt.receipt_expires_at) / 1000);
  return !Number.isFinite(expiresAtUnixSeconds) || expiresAtUnixSeconds <= nowUnixSeconds;
};

export const parseAgentRegistryAddress = (agentRegistry: string): `0x${string}` => {
  const match = agentRegistry.match(/0x[a-fA-F0-9]{40}$/u);
  if (!match) {
    throw new Error(`invalid agent registry: ${agentRegistry}`);
  }

  return match[0].toLowerCase() as `0x${string}`;
};

export const receiptToSession = (receipt: RegentIdentityReceipt): SiwaSession => ({
  walletAddress: receipt.address,
  chainId: identityNetworkChainId(receipt.network),
  nonce: receipt.agent_id.toString(10),
  keyId: receipt.address.toLowerCase(),
  receipt: receipt.receipt,
  receiptExpiresAt: receipt.receipt_expires_at,
  audience: "regent-cli",
  registryAddress: parseAgentRegistryAddress(receipt.agent_registry),
  tokenId: receipt.agent_id.toString(10),
});

export const receiptToIdentity = (receipt: RegentIdentityReceipt): LocalAgentIdentity => ({
  walletAddress: receipt.address,
  chainId: identityNetworkChainId(receipt.network),
  registryAddress: parseAgentRegistryAddress(receipt.agent_registry),
  tokenId: receipt.agent_id.toString(10),
  label: providerLabel(receipt.provider),
});

export const providerLabel = (provider: RegentResolvedIdentityProvider): string => {
  switch (provider) {
    case "regent":
      return "Regent managed signer";
    case "moonpay":
      return "MoonPay signer";
    case "bankr":
      return "Bankr signer";
    case "privy":
      return "Privy signer";
  }
};
