import type { LocalAgentIdentity, SiwaSession } from "../../internal-types/index.js";

import { AuthError } from "../errors.js";
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
    throw new AuthError("siwa_session_missing", "no SIWA session found; run `regent auth siwa login`");
  }

  if (sessionStore.isReceiptExpired()) {
    throw new AuthError("siwa_receipt_expired", "SIWA receipt is expired; run `regent auth siwa login` again");
  }

  const identity = stateStore.read().agent;
  if (!identity) {
    throw new AuthError(
      "agent_identity_missing",
      "current agent identity is missing; provide registryAddress, tokenId via --registry-address and --token-id first",
    );
  }

  return {
    session,
    identity,
  };
}
