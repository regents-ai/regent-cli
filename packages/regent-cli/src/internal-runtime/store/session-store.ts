import fs from "node:fs";

import type { SiwaSession } from "../../internal-types/index.js";

import { readIdentityReceipt, writeIdentityReceipt } from "../identity/cache.js";
import { identityCachePath, receiptToSession } from "../identity/shared.js";
import { StateStore } from "./state-store.js";

export class SessionStore {
  readonly stateStore: StateStore;

  constructor(stateStore: StateStore) {
    this.stateStore = stateStore;
  }

  getSiwaSession(): SiwaSession | null {
    const receipt = readIdentityReceipt();
    return receipt ? receiptToSession(receipt) : this.stateStore.read().siwa ?? null;
  }

  setSiwaSession(session: SiwaSession): void {
    const current = readIdentityReceipt();
    if (!current) {
      this.stateStore.patch({ siwa: session });
      return;
    }

    writeIdentityReceipt({
      ...current,
      receipt: session.receipt,
      receipt_expires_at: session.receiptExpiresAt,
      cached_at: new Date().toISOString(),
    });
  }

  clearSiwaSession(): void {
    this.stateStore.patch({ siwa: undefined });
    const cachePath = identityCachePath();
    if (fs.existsSync(cachePath)) {
      fs.unlinkSync(cachePath);
    }
  }

  isReceiptExpired(nowUnixSeconds = Math.floor(Date.now() / 1000)): boolean {
    const session = this.getSiwaSession();
    if (!session) {
      return true;
    }

    const expiresAtUnixSeconds = Math.floor(Date.parse(session.receiptExpiresAt) / 1000);
    return !Number.isFinite(expiresAtUnixSeconds) || expiresAtUnixSeconds <= nowUnixSeconds;
  }
}
