import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import type {
  RegentConfig,
  RegentIdentityNetwork,
  RegentIdentityProvider,
  RegentIdentityReceipt,
  RegentResolvedIdentityProvider,
} from "../../internal-types/index.js";

import { signPersonalMessage } from "../agent/wallet.js";
import {
  EnvWalletSecretSource,
  FileWalletSecretSource,
  type WalletSecretSource,
} from "../agent/key-store.js";
import { CommandExitError } from "../errors.js";

const execFileAsync = promisify(execFile);
const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/u;

export interface IdentitySigner {
  provider: RegentResolvedIdentityProvider;
  address: `0x${string}`;
  walletHint?: string;
  signerType: string;
  signMessage(message: string): Promise<`0x${string}`>;
}

interface ProviderResolutionOptions {
  provider: RegentIdentityProvider;
  network: RegentIdentityNetwork;
  walletHint?: string;
  config?: RegentConfig;
  walletSecretSource?: WalletSecretSource;
  timeoutMs: number;
  expectedAddress?: `0x${string}`;
}

interface ProviderFailure {
  provider: RegentResolvedIdentityProvider;
  code: "MOONPAY_MISSING" | "BANKR_MISSING" | "PRIVY_MISSING" | "NO_SIGNER_PROVIDER_FOUND";
  exitCode: number;
  message: string;
  details?: Record<string, unknown>;
}

const normalizeAddress = (value: unknown): `0x${string}` | null => {
  if (typeof value !== "string" || !ADDRESS_REGEX.test(value)) {
    return null;
  }

  return value.toLowerCase() as `0x${string}`;
};

const configuredWalletSecretSource = (config: RegentConfig): EnvWalletSecretSource | FileWalletSecretSource => {
  const envVarName = config.wallet.privateKeyEnv;
  return process.env[envVarName]
    ? new EnvWalletSecretSource(envVarName)
    : new FileWalletSecretSource(config.wallet.keystorePath);
};

const resolveWalletSecretSource = (options: ProviderResolutionOptions): WalletSecretSource => {
  if (options.walletSecretSource) {
    return options.walletSecretSource;
  }

  if (options.config) {
    return configuredWalletSecretSource(options.config);
  }

  throw new Error("regent signer requires CLI wallet configuration");
};

const managedIdentityPaths = (): string[] => {
  const paths = [path.join(os.homedir(), ".regent", "managed-identity.json")];
  const hermesHome = process.env.HERMES_HOME;
  if (hermesHome) {
    paths.push(path.join(hermesHome, ".regent", "managed-identity.json"));
  }
  return paths;
};

const readJsonFile = (filePath: string): unknown => {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
};

const resolveRegentSigner = async (options: ProviderResolutionOptions): Promise<IdentitySigner | ProviderFailure> => {
  const metadataPath = managedIdentityPaths().find((candidate) => fs.existsSync(candidate));
  if (!metadataPath) {
    return {
      provider: "regent",
      code: "NO_SIGNER_PROVIDER_FOUND",
      exitCode: 10,
      message: "No Regent managed signer is configured on this machine.",
    };
  }

  let metadata: unknown;
  try {
    metadata = readJsonFile(metadataPath);
  } catch (error) {
    return {
      provider: "regent",
      code: "NO_SIGNER_PROVIDER_FOUND",
      exitCode: 10,
      message: "The Regent managed signer metadata is unreadable.",
      details: { metadataPath, cause: error instanceof Error ? error.message : String(error) },
    };
  }

  const record = (typeof metadata === "object" && metadata !== null ? metadata : {}) as Record<string, unknown>;
  const address = normalizeAddress(record.address);
  if (record.provider !== "regent" || !address || record.network !== options.network) {
    return {
      provider: "regent",
      code: "NO_SIGNER_PROVIDER_FOUND",
      exitCode: 10,
      message: "The Regent managed signer metadata does not match the requested network.",
      details: { metadataPath },
    };
  }

  const privateKey = await resolveWalletSecretSource(options).getPrivateKeyHex();
  const signerAddress = normalizeAddress(address);
  if (!signerAddress) {
    return {
      provider: "regent",
      code: "NO_SIGNER_PROVIDER_FOUND",
      exitCode: 10,
      message: "The Regent managed signer address is invalid.",
    };
  }

  if (options.expectedAddress && signerAddress !== options.expectedAddress) {
    return {
      provider: "regent",
      code: "NO_SIGNER_PROVIDER_FOUND",
      exitCode: 10,
      message: "The saved Regent identity no longer matches the current signer.",
      details: { expectedAddress: options.expectedAddress, address: signerAddress },
    };
  }

  return {
    provider: "regent",
    address: signerAddress,
    signerType: "evm_personal_sign",
    signMessage: async (message) => signPersonalMessage(privateKey, message),
  };
};

const runCliJson = async (command: string, args: string[], timeoutMs: number): Promise<unknown> => {
  const { stdout } = await execFileAsync(command, args, { timeout: timeoutMs, encoding: "utf8" });
  const trimmed = stdout.trim();
  if (!trimmed) {
    return {};
  }
  return JSON.parse(trimmed);
};

const runCliText = async (command: string, args: string[], timeoutMs: number): Promise<string> => {
  const { stdout } = await execFileAsync(command, args, { timeout: timeoutMs, encoding: "utf8" });
  return stdout.trim();
};

const moonpayWalletAddress = (wallet: Record<string, unknown>, network: RegentIdentityNetwork): `0x${string}` | null => {
  const addresses = wallet.addresses;
  if (typeof addresses !== "object" || addresses === null) {
    return null;
  }
  const key = network;
  return normalizeAddress((addresses as Record<string, unknown>)[key]);
};

const resolveMoonpaySigner = async (options: ProviderResolutionOptions): Promise<IdentitySigner | ProviderFailure> => {
  try {
    await runCliJson("mp", ["--json", "user", "retrieve"], options.timeoutMs);
  } catch (error) {
    return {
      provider: "moonpay",
      code: "MOONPAY_MISSING",
      exitCode: 11,
      message: "MoonPay signer not ready.",
      details: { cause: error instanceof Error ? error.message : String(error) },
    };
  }

  let walletsPayload: unknown;
  try {
    walletsPayload = await runCliJson("mp", ["--json", "wallet", "list"], options.timeoutMs);
  } catch (error) {
    return {
      provider: "moonpay",
      code: "MOONPAY_MISSING",
      exitCode: 11,
      message: "MoonPay signer not ready.",
      details: { cause: error instanceof Error ? error.message : String(error) },
    };
  }

  const wallets =
    Array.isArray(walletsPayload)
      ? walletsPayload
      : Array.isArray((walletsPayload as { items?: unknown[] })?.items)
        ? (walletsPayload as { items: unknown[] }).items
        : [];

  const selected = wallets.find((wallet) => {
    if (typeof wallet !== "object" || wallet === null) {
      return false;
    }
    const record = wallet as Record<string, unknown>;
    if (options.walletHint) {
      return (
        record.name === options.walletHint ||
        moonpayWalletAddress(record, options.network) === normalizeAddress(options.walletHint)
      );
    }
    return record.name === "main";
  }) ?? wallets[0];

  if (typeof selected !== "object" || selected === null) {
    return {
      provider: "moonpay",
      code: "MOONPAY_MISSING",
      exitCode: 11,
      message: "MoonPay signer not ready.",
      details: { reason: "no_wallets" },
    };
  }

  const wallet = selected as Record<string, unknown>;
  const address = moonpayWalletAddress(wallet, options.network);
  if (!address) {
    return {
      provider: "moonpay",
      code: "MOONPAY_MISSING",
      exitCode: 11,
      message: "MoonPay signer not ready.",
      details: { reason: "address_missing", network: options.network },
    };
  }

  if (options.expectedAddress && address !== options.expectedAddress) {
    return {
      provider: "moonpay",
      code: "MOONPAY_MISSING",
      exitCode: 11,
      message: "MoonPay signer no longer matches the saved Regent identity.",
      details: { expectedAddress: options.expectedAddress, address },
    };
  }

  const walletName = typeof wallet.name === "string" ? wallet.name : undefined;

  return {
    provider: "moonpay",
    address,
    walletHint: walletName,
    signerType: "evm_personal_sign",
    signMessage: async (message) => {
      const payload = await runCliJson(
        "mp",
        ["--json", "message", "sign", "--wallet", walletName ?? address, "--chain", options.network, "--message", message],
        options.timeoutMs,
      );
      const signature = normalizeHexSignature(payload);
      if (!signature) {
        throw new Error("MoonPay did not return a signature.");
      }
      return signature;
    },
  };
};

const bankrAddressFromWhoami = (payload: unknown, network: RegentIdentityNetwork): `0x${string}` | null => {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const direct = normalizeAddress(record.address);
  if (direct) {
    return direct;
  }

  const addresses = record.addresses;
  if (typeof addresses === "object" && addresses !== null) {
    const keyed = normalizeAddress((addresses as Record<string, unknown>)[network]);
    if (keyed) {
      return keyed;
    }
  }

  const wallets = record.wallets;
  if (Array.isArray(wallets)) {
    for (const wallet of wallets) {
      if (typeof wallet !== "object" || wallet === null) {
        continue;
      }
      const candidate = normalizeAddress((wallet as Record<string, unknown>).address);
      if (candidate) {
        return candidate;
      }
    }
  }

  return null;
};

const normalizeHexSignature = (payload: unknown): `0x${string}` | null => {
  if (typeof payload === "string" && payload.startsWith("0x")) {
    return payload as `0x${string}`;
  }

  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const nested = record.data;
  const direct = normalizeHexSignature(record.signature);
  if (direct) {
    return direct;
  }
  if (typeof nested === "object" && nested !== null) {
    return normalizeHexSignature((nested as Record<string, unknown>).signature);
  }
  return null;
};

interface PrivyWalletRecord {
  address: `0x${string}`;
  walletId?: string;
}

const parsePrivyWallets = (stdout: string): PrivyWalletRecord[] => {
  const wallets: PrivyWalletRecord[] = [];

  for (const rawLine of stdout.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!/^ethereum:/iu.test(line)) {
      continue;
    }

    const addressMatch = line.match(/0x[a-fA-F0-9]{40}/u);
    const address = addressMatch ? normalizeAddress(addressMatch[0]) : null;
    if (!address) {
      continue;
    }

    const walletIdMatch = line.match(/\(([^)]+)\)/u);
    wallets.push({
      address,
      ...(walletIdMatch?.[1] ? { walletId: walletIdMatch[1].trim() } : {}),
    });
  }

  return wallets;
};

const selectPrivyWallet = (
  wallets: PrivyWalletRecord[],
  walletHint?: string,
): PrivyWalletRecord | null => {
  if (wallets.length === 0) {
    return null;
  }

  if (!walletHint) {
    return wallets[0] ?? null;
  }

  const normalizedHint = normalizeAddress(walletHint);
  return (
    wallets.find((wallet) => wallet.walletId === walletHint || wallet.address === normalizedHint) ??
    null
  );
};

const resolvePrivySigner = async (options: ProviderResolutionOptions): Promise<IdentitySigner | ProviderFailure> => {
  let walletsOutput = "";
  try {
    walletsOutput = await runCliText("privy-agent-wallets", ["list-wallets"], options.timeoutMs);
  } catch (error) {
    return {
      provider: "privy",
      code: "PRIVY_MISSING",
      exitCode: 13,
      message: "Privy signer not ready.",
      details: { cause: error instanceof Error ? error.message : String(error) },
    };
  }

  const wallets = parsePrivyWallets(walletsOutput);
  if (wallets.length === 0) {
    return {
      provider: "privy",
      code: "PRIVY_MISSING",
      exitCode: 13,
      message: "Privy signer not ready.",
      details: { reason: "address_missing" },
    };
  }

  const selected = selectPrivyWallet(wallets, options.walletHint);
  if (!selected) {
    return {
      provider: "privy",
      code: "PRIVY_MISSING",
      exitCode: 13,
      message: "Privy signer not ready.",
      details: { reason: "wallet_not_found", wallet_hint: options.walletHint },
    };
  }

  if (options.expectedAddress && selected.address !== options.expectedAddress) {
    return {
      provider: "privy",
      code: "PRIVY_MISSING",
      exitCode: 13,
      message: "Privy signer no longer matches the saved Regent identity.",
      details: { expectedAddress: options.expectedAddress, address: selected.address },
    };
  }

  return {
    provider: "privy",
    address: selected.address,
    ...(selected.walletId ? { walletHint: selected.walletId } : {}),
    signerType: "evm_personal_sign",
    signMessage: async (message) => {
      const payloadText = await runCliText(
        "privy-agent-wallets",
        [
          "rpc",
          "--json",
          JSON.stringify({
            method: "personal_sign",
            params: {
              message,
            },
          }),
        ],
        options.timeoutMs,
      );

      const parsedPayload = (() => {
        try {
          return JSON.parse(payloadText) as unknown;
        } catch {
          return payloadText;
        }
      })();
      const signature = normalizeHexSignature(parsedPayload);
      if (!signature) {
        throw new Error("Privy did not return a signature.");
      }
      return signature;
    },
  };
};

const resolveBankrSigner = async (options: ProviderResolutionOptions): Promise<IdentitySigner | ProviderFailure> => {
  let whoami: unknown;
  try {
    whoami = await runCliJson("bankr", ["whoami", "--json"], options.timeoutMs);
  } catch (error) {
    return {
      provider: "bankr",
      code: "BANKR_MISSING",
      exitCode: 12,
      message: "Bankr signer not ready.",
      details: { cause: error instanceof Error ? error.message : String(error) },
    };
  }

  const address = bankrAddressFromWhoami(whoami, options.network);
  if (!address) {
    return {
      provider: "bankr",
      code: "BANKR_MISSING",
      exitCode: 12,
      message: "Bankr signer not ready.",
      details: { reason: "address_missing" },
    };
  }

  if (options.expectedAddress && address !== options.expectedAddress) {
    return {
      provider: "bankr",
      code: "BANKR_MISSING",
      exitCode: 12,
      message: "Bankr signer no longer matches the saved Regent identity.",
      details: { expectedAddress: options.expectedAddress, address },
    };
  }

  return {
    provider: "bankr",
    address,
    walletHint: options.walletHint,
    signerType: "evm_personal_sign",
    signMessage: async (message) => {
      const payload = await runCliJson(
        "bankr",
        ["sign", "--type", "personal_sign", "--message", message, "--json"],
        options.timeoutMs,
      );
      const signature = normalizeHexSignature(payload);
      if (!signature) {
        throw new Error("Bankr did not return a signature.");
      }
      return signature;
    },
  };
};

const providerFailureToExitError = (failure: ProviderFailure, requestedProvider: RegentIdentityProvider): CommandExitError =>
  new CommandExitError(failure.code, failure.message, failure.exitCode, {
    details: {
      provider: requestedProvider,
      ...(failure.details ?? {}),
    },
  });

export const resolveIdentitySigner = async (options: ProviderResolutionOptions): Promise<IdentitySigner> => {
  const order: RegentResolvedIdentityProvider[] =
    options.provider === "auto" ? ["regent", "moonpay", "bankr", "privy"] : [options.provider];

  const failures: ProviderFailure[] = [];
  for (const provider of order) {
    const result =
      provider === "regent"
        ? await resolveRegentSigner({ ...options, provider })
        : provider === "moonpay"
          ? await resolveMoonpaySigner({ ...options, provider })
          : provider === "bankr"
            ? await resolveBankrSigner({ ...options, provider })
            : await resolvePrivySigner({ ...options, provider });

    if ("signMessage" in result) {
      return result;
    }

    failures.push(result);
    if (options.provider !== "auto") {
      throw providerFailureToExitError(result, options.provider);
    }
  }

  throw new CommandExitError("NO_SIGNER_PROVIDER_FOUND", "No supported signer provider was found on this machine.", 10, {
    details: {
      provider: "auto",
      failures: failures.map((failure) => ({
        provider: failure.provider,
        code: failure.code,
        message: failure.message,
        ...(failure.details ?? {}),
      })),
    },
  });
};

export const resolveSignerFromReceipt = async (
  receipt: RegentIdentityReceipt,
  input: { config?: RegentConfig; walletSecretSource?: WalletSecretSource; timeoutMs: number },
): Promise<IdentitySigner> => {
  return resolveIdentitySigner({
    provider: receipt.provider,
    network: receipt.network,
    walletHint: receipt.wallet_hint,
    config: input.config,
    walletSecretSource: input.walletSecretSource,
    timeoutMs: input.timeoutMs,
    expectedAddress: receipt.address,
  });
};
