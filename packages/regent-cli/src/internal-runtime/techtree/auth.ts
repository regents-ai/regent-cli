import type { LocalAgentIdentity, SiwaSession } from "../../internal-types/index.js";

import { AuthError } from "../errors.js";
import { readIdentityReceipt } from "../identity/cache.js";
import { receiptToIdentity } from "../identity/shared.js";
import type { StateStore } from "../store/state-store.js";
import type { SessionStore } from "../store/session-store.js";

export interface AuthenticatedAgentContext {
  session: SiwaSession;
  identity: LocalAgentIdentity;
}

export function requireAuthenticatedAgentContext(
  sessionStore: SessionStore,
  stateStore: StateStore,
): AuthenticatedAgentContext {
  const session = sessionStore.getSiwaSession();
  if (!session) {
    throw new AuthError("siwa_session_missing", "no Regent identity receipt found; run `regent identity ensure`");
  }

  if (sessionStore.isReceiptExpired()) {
    throw new AuthError("siwa_receipt_expired", "Regent identity receipt is expired; run `regent identity ensure` again");
  }

  const receipt = readIdentityReceipt();
  const identity = receipt ? receiptToIdentity(receipt) : stateStore.read().agent;
  if (!identity?.walletAddress || typeof identity.chainId !== "number") {
    throw new AuthError(
      "agent_identity_missing",
      "current agent identity is missing; run `regent identity ensure` first",
    );
  }

  if (!identity.registryAddress || !identity.tokenId) {
    throw new AuthError(
      "agent_identity_missing",
      "current Techtree identity is missing registry and token binding; run `regent identity ensure` again",
    );
  }

  return {
    session,
    identity,
  };
}
