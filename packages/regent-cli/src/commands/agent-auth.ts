import path from "node:path";

import type { LocalAgentIdentity, RegentConfig, SiwaSession } from "../internal-types/index.js";

import { EnvWalletSecretSource, FileWalletSecretSource } from "../internal-runtime/agent/key-store.js";
import { signPersonalMessage } from "../internal-runtime/agent/wallet.js";
import { loadConfig, StateStore } from "../internal-runtime/index.js";
import { readIdentityReceipt } from "../internal-runtime/identity/cache.js";
import { receiptToIdentity, receiptToSession } from "../internal-runtime/identity/shared.js";
import { resolveSignerFromReceipt } from "../internal-runtime/identity/providers.js";
import { buildSignerBackedAgentHeaders } from "../internal-runtime/techtree/signing.js";
import { SessionStore } from "../internal-runtime/store/session-store.js";

export const loadAgentAuthState = (
  configPath?: string,
): {
  config: RegentConfig;
  sessionStore: SessionStore;
  session: SiwaSession | null;
  identity: LocalAgentIdentity | null;
} => {
  const config = loadConfig(configPath);
  const stateFilePath = path.join(config.runtime.stateDir, "runtime-state.json");
  const stateStore = new StateStore(stateFilePath);
  const sessionStore = new SessionStore(stateStore);
  const receipt = readIdentityReceipt();
  const session = receipt ? receiptToSession(receipt) : sessionStore.getSiwaSession();
  const storedIdentity = stateStore.read().agent;
  const identity =
    receipt
      ? receiptToIdentity(receipt)
      : storedIdentity ??
        (session
          ? {
              walletAddress: session.walletAddress,
              chainId: session.chainId,
              ...(session.registryAddress ? { registryAddress: session.registryAddress } : {}),
              ...(session.tokenId ? { tokenId: session.tokenId } : {}),
            }
          : null);

  return {
    config,
    sessionStore,
    session,
    identity,
  };
};

export const requireAgentAuthState = (
  configPath?: string,
  options?: { requireBoundIdentity?: boolean },
): {
  config: RegentConfig;
  session: SiwaSession;
  identity: LocalAgentIdentity;
} => {
  const { config, sessionStore, session, identity } = loadAgentAuthState(configPath);

  if (!session) {
    throw new Error("Run `regent identity ensure` before using this command.");
  }

  if (sessionStore.isReceiptExpired()) {
    throw new Error("Your saved Regent identity expired. Run `regent identity ensure` again.");
  }

  if (!identity?.walletAddress || typeof identity.chainId !== "number") {
    throw new Error("This machine does not have a saved Regent identity yet. Run `regent identity ensure` first.");
  }

  if (options?.requireBoundIdentity && (!identity.registryAddress || !identity.tokenId)) {
    throw new Error("This command needs a bound Regent identity. Run `regent identity ensure` again.");
  }

  return {
    config,
    session,
    identity,
  };
};

export const buildAgentAuthHeaders = async (
  input: {
    method: string;
    path: string;
    configPath?: string;
    requireBoundIdentity?: boolean;
  },
): Promise<Record<string, string>> => {
  const { config, session, identity } = requireAgentAuthState(input.configPath, {
    requireBoundIdentity: input.requireBoundIdentity,
  });
  const receipt = readIdentityReceipt();
  const signer = receipt
    ? await resolveSignerFromReceipt(receipt, {
        config,
        timeoutMs: config.auth.requestTimeoutMs,
      })
    : null;

  return buildSignerBackedAgentHeaders({
    method: input.method,
    path: input.path,
    walletAddress: identity.walletAddress,
    chainId: identity.chainId,
    ...(identity.registryAddress ? { registryAddress: identity.registryAddress } : {}),
    ...(identity.tokenId ? { tokenId: identity.tokenId } : {}),
    receipt: session.receipt,
    signMessage:
      signer?.signMessage ??
      (async (message) => {
        const envVarName = config.wallet.privateKeyEnv;
        const source = process.env[envVarName]
          ? new EnvWalletSecretSource(envVarName)
          : new FileWalletSecretSource(config.wallet.keystorePath);
        const privateKey = await source.getPrivateKeyHex();
        return signPersonalMessage(privateKey, message);
      }),
  });
};
