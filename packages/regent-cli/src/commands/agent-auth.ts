import path from "node:path";

import type { LocalAgentIdentity, RegentConfig, SiwaSession } from "../internal-types/index.js";

import { EnvWalletSecretSource, FileWalletSecretSource } from "../internal-runtime/agent/key-store.js";
import { loadConfig, StateStore } from "../internal-runtime/index.js";
import { buildSignedAgentHeaders } from "../internal-runtime/techtree/signing.js";
import { SessionStore } from "../internal-runtime/store/session-store.js";

const loadWalletPrivateKey = async (config: RegentConfig): Promise<`0x${string}`> => {
  const envVarName = config.wallet.privateKeyEnv;
  const source = process.env[envVarName]
    ? new EnvWalletSecretSource(envVarName)
    : new FileWalletSecretSource(config.wallet.keystorePath);

  return source.getPrivateKeyHex();
};

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
  const session = sessionStore.getSiwaSession();
  const storedIdentity = stateStore.read().agent;
  const identity =
    storedIdentity ??
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
    throw new Error("Run `regent auth siwa login` before using this command.");
  }

  if (sessionStore.isReceiptExpired()) {
    throw new Error("Your sign-in expired. Run `regent auth siwa login` again.");
  }

  if (!identity?.walletAddress || typeof identity.chainId !== "number") {
    throw new Error("This machine does not have a saved Regent agent identity yet. Run `regent auth siwa login` first.");
  }

  if (options?.requireBoundIdentity && (!identity.registryAddress || !identity.tokenId)) {
    throw new Error(
      "This command needs a Techtree-bound agent identity. Run `regent auth siwa login --registry-address ... --token-id ...` first.",
    );
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
  const privateKey = await loadWalletPrivateKey(config);

  return buildSignedAgentHeaders({
    method: input.method,
    path: input.path,
    walletAddress: identity.walletAddress,
    chainId: identity.chainId,
    ...(identity.registryAddress ? { registryAddress: identity.registryAddress } : {}),
    ...(identity.tokenId ? { tokenId: identity.tokenId } : {}),
    receipt: session.receipt,
    privateKey,
  });
};
