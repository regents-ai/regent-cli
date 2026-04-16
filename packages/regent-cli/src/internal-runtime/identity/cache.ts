import fs from "node:fs";
import crypto from "node:crypto";

import type { RegentIdentityNetwork, RegentIdentityReceipt } from "../../internal-types/index.js";

import { CommandExitError } from "../errors.js";
import { ensureParentDir } from "../paths.js";
import { identityCachePath, isReceiptExpired, normalizeRegentBaseUrl } from "./shared.js";

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNetwork = (value: unknown): value is RegentIdentityNetwork =>
  value === "base" || value === "base-sepolia";

const isReceipt = (value: unknown): value is RegentIdentityReceipt => {
  if (!isObject(value)) {
    return false;
  }

  return (
    value.version === 1 &&
    typeof value.regent_base_url === "string" &&
    isNetwork(value.network) &&
    (value.provider === "regent" || value.provider === "moonpay" || value.provider === "bankr" || value.provider === "privy") &&
    typeof value.address === "string" &&
    typeof value.agent_id === "number" &&
    typeof value.agent_registry === "string" &&
    typeof value.signer_type === "string" &&
    value.verified === "onchain" &&
    typeof value.receipt === "string" &&
    typeof value.receipt_issued_at === "string" &&
    typeof value.receipt_expires_at === "string" &&
    typeof value.cached_at === "string" &&
    (value.wallet_hint === undefined || typeof value.wallet_hint === "string")
  );
};

export const readIdentityReceipt = (): RegentIdentityReceipt | null => {
  const cachePath = identityCachePath();
  if (!fs.existsSync(cachePath)) {
    return null;
  }

  const raw = fs.readFileSync(cachePath, "utf8").trim();
  if (!raw) {
    return null;
  }

  const parsed: unknown = JSON.parse(raw);
  if (!isReceipt(parsed)) {
    return null;
  }

  return parsed;
};

export const receiptMatchesRequest = (input: {
  receipt: RegentIdentityReceipt;
  network: RegentIdentityNetwork;
  regentBaseUrl: string;
}): boolean => {
  return (
    input.receipt.network === input.network &&
    normalizeRegentBaseUrl(input.receipt.regent_base_url) === normalizeRegentBaseUrl(input.regentBaseUrl) &&
    !isReceiptExpired(input.receipt)
  );
};

export const writeIdentityReceipt = (receipt: RegentIdentityReceipt): string => {
  const cachePath = identityCachePath();
  ensureParentDir(cachePath);

  const tempPath = `${cachePath}.${crypto.randomUUID()}.tmp`;
  const payload = `${JSON.stringify(receipt, null, 2)}\n`;

  try {
    fs.writeFileSync(tempPath, payload, "utf8");
    const fileHandle = fs.openSync(tempPath, "r");
    try {
      fs.fsyncSync(fileHandle);
    } finally {
      fs.closeSync(fileHandle);
    }
    fs.renameSync(tempPath, cachePath);
  } catch (error) {
    throw new CommandExitError("CACHE_WRITE_FAILED", "Could not save the Regent identity receipt.", 22, {
      cause: error,
      details: { cachePath },
    });
  }

  return cachePath;
};
