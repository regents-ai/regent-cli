import readline from "node:readline/promises";

import { loadConfig } from "../../internal-runtime/config.js";
import {
  FileWalletSecretSource,
  EnvWalletSecretSource,
} from "../../internal-runtime/agent/key-store.js";
import { deriveWalletAddress } from "../../internal-runtime/agent/wallet.js";
import { getBooleanFlag, getFlag, type ParsedCliArgs } from "../../parse.js";
import { isHumanTerminal } from "../../printer.js";

export const WEBSITE_WALLET_ENV = "AUTOLAUNCH_WALLET_ADDRESS";

export type AddressSource = "config" | "flag" | "env" | "prompt" | "missing";

export interface SafeWizardSigner {
  readonly address: string | null;
  readonly source: AddressSource;
}

export const normalizeText = (value: string | undefined): string | undefined => {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
};

export const normalizeAddress = (value: string): string => value.trim().toLowerCase();

export const isAddress = (value: string): boolean =>
  /^0x[0-9a-fA-F]{40}$/u.test(value.trim());

export const requireAddress = (value: string, label: string): string => {
  if (!isAddress(value)) {
    throw new Error(`${label} must be a valid EVM address`);
  }

  return normalizeAddress(value);
};

export const prompt = async (label: string, allowEmpty = false): Promise<string> => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    while (true) {
      const answer = (await rl.question(`${label}: `)).trim();
      if (allowEmpty || answer !== "") {
        return answer;
      }
    }
  } finally {
    rl.close();
  }
};

export const promptChoice = async (
  label: string,
  options: readonly string[],
): Promise<number> => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    while (true) {
      const rendered = options
        .map((option, index) => `${index + 1}. ${option}`)
        .join("\n");
      const answer = (
        await rl.question(`${label}\n${rendered}\nChoose [1-${options.length}]: `)
      ).trim();
      const parsed = Number.parseInt(answer, 10);
      if (Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= options.length) {
        return parsed - 1;
      }
    }
  } finally {
    rl.close();
  }
};

export const configuredPrivateKey = async (
  configPath?: string,
): Promise<`0x${string}`> => {
  const config = loadConfig(configPath);
  const secretSource = process.env[config.wallet.privateKeyEnv]
    ? new EnvWalletSecretSource(config.wallet.privateKeyEnv)
    : new FileWalletSecretSource(config.wallet.keystorePath);

  try {
    return await secretSource.getPrivateKeyHex();
  } catch {
    throw new Error(
      `Agent signer wallet is not ready. Set ${config.wallet.privateKeyEnv} or initialize the local wallet first.`,
    );
  }
};

export const resolveAgentSigner = async (
  configPath?: string,
): Promise<SafeWizardSigner> => {
  const address = await deriveWalletAddress(await configuredPrivateKey(configPath));
  return { address, source: "config" };
};

export const resolveWebsiteSigner = async (
  args: ParsedCliArgs,
): Promise<SafeWizardSigner> => {
  const explicit = normalizeText(getFlag(args, "website-wallet-address"));
  if (explicit) {
    return {
      address: requireAddress(explicit, "Website wallet"),
      source: "flag",
    };
  }

  const fromEnv = normalizeText(process.env[WEBSITE_WALLET_ENV]);
  if (fromEnv) {
    return {
      address: requireAddress(fromEnv, "Website wallet"),
      source: "env",
    };
  }

  if (getBooleanFlag(args, "wait-for-website-wallet")) {
    return { address: null, source: "missing" };
  }

  if (!isHumanTerminal()) {
    return { address: null, source: "missing" };
  }

  const choice = await promptChoice(
    "The website wallet is not ready yet.",
    [
      "Wait until the website login creates it",
      "Enter the website wallet address now",
    ],
  );

  if (choice === 0) {
    return { address: null, source: "missing" };
  }

  const entered = await prompt("Website wallet address");
  return {
    address: requireAddress(entered, "Website wallet"),
    source: "prompt",
  };
};

export const resolveBackupSigner = async (
  args: ParsedCliArgs,
): Promise<SafeWizardSigner> => {
  const explicit = normalizeText(getFlag(args, "backup-signer-address"));
  if (explicit) {
    return {
      address: requireAddress(explicit, "Backup signer"),
      source: "flag",
    };
  }

  if (!isHumanTerminal()) {
    throw new Error(
      "Backup signer is required. Pass --backup-signer-address <wallet>.",
    );
  }

  const entered = await prompt("Backup signer address");
  return {
    address: requireAddress(entered, "Backup signer"),
    source: "prompt",
  };
};

export const resolveSafeAddress = async (
  args: ParsedCliArgs,
): Promise<string | null> => {
  const explicit = normalizeText(getFlag(args, "agent-safe-address"));
  if (explicit) {
    return requireAddress(explicit, "Agent Safe");
  }

  if (!isHumanTerminal()) {
    return null;
  }

  const entered = await prompt(
    "Agent Safe address (leave blank if you still need to create it)",
    true,
  );
  if (!entered) {
    return null;
  }

  return requireAddress(entered, "Agent Safe");
};
