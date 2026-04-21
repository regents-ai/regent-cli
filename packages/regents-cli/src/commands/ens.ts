import { createPublicClient, createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia, mainnet } from "viem/chains";

import { loadConfig } from "../internal-runtime/config.js";
import { FileWalletSecretSource, EnvWalletSecretSource } from "../internal-runtime/agent/key-store.js";
import { getFlag, requireArg, type ParsedCliArgs } from "../parse.js";
import { printJson } from "../printer.js";
import { buildAgentAuthHeaders } from "./agent-auth.js";

const configuredPrivateKey = async (configPath?: string): Promise<`0x${string}`> => {
  const config = loadConfig(configPath);
  const secretSource =
    process.env[config.wallet.privateKeyEnv]
      ? new EnvWalletSecretSource(config.wallet.privateKeyEnv)
      : new FileWalletSecretSource(config.wallet.keystorePath);

  return await secretSource.getPrivateKeyHex();
};

const requestPlatformJson = async (
  method: string,
  path: string,
  body: Record<string, unknown>,
  configPath?: string,
): Promise<Record<string, unknown>> => {
  const config = loadConfig(configPath);
  const headers = new Headers({
    accept: "application/json",
    "content-type": "application/json",
  });

  const authHeaders = await buildAgentAuthHeaders({
    method,
    path,
    configPath,
  });

  for (const [key, value] of Object.entries(authHeaders)) {
    headers.set(key, value);
  }

  const response = await fetch(`${config.auth.baseUrl.replace(/\/+$/u, "")}${path}`, {
    method,
    headers,
    body: JSON.stringify(body),
  });

  const text = await response.text();
  const parsed = text ? (JSON.parse(text) as Record<string, unknown>) : {};

  if (!response.ok) {
    throw new Error(JSON.stringify(parsed, null, 2));
  }

  return parsed;
};

const walletClientForSubmit = async (chainId: number, configPath?: string) => {
  const privateKey = await configuredPrivateKey(configPath);
  const account = privateKeyToAccount(privateKey);

  if (chainId === 1) {
    const rpcUrl = process.env.ETH_MAINNET_RPC_URL ?? process.env.ETHEREUM_RPC_URL;
    if (!rpcUrl) {
      throw new Error("missing ETH_MAINNET_RPC_URL or ETHEREUM_RPC_URL for Ethereum mainnet submit mode");
    }

    return {
      chain: mainnet,
      walletClient: createWalletClient({ account, chain: mainnet, transport: http(rpcUrl) }),
      publicClient: createPublicClient({ chain: mainnet, transport: http(rpcUrl) }),
      account,
    };
  }

  if (chainId === 8453) {
    const rpcUrl = process.env.BASE_MAINNET_RPC_URL ?? process.env.BASE_RPC_URL;
    if (!rpcUrl) {
      throw new Error("missing BASE_MAINNET_RPC_URL or BASE_RPC_URL for Base mainnet submit mode");
    }

    return {
      chain: base,
      walletClient: createWalletClient({ account, chain: base, transport: http(rpcUrl) }),
      publicClient: createPublicClient({ chain: base, transport: http(rpcUrl) }),
      account,
    };
  }

  if (chainId === 84532) {
    const rpcUrl = process.env.BASE_SEPOLIA_RPC_URL;
    if (!rpcUrl) {
      throw new Error("missing BASE_SEPOLIA_RPC_URL for Base Sepolia submit mode");
    }

    return {
      chain: baseSepolia,
      walletClient: createWalletClient({ account, chain: baseSepolia, transport: http(rpcUrl) }),
      publicClient: createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) }),
      account,
    };
  }

  throw new Error(`unsupported chain for submit mode: ${chainId}`);
};

export async function runEnsSetPrimary(
  args: ParsedCliArgs,
  configPath?: string,
): Promise<void> {
  const ensName = requireArg(getFlag(args, "ens"), "ens");
  const payload = await requestPlatformJson(
    "POST",
    "/api/agent-platform/ens/prepare-primary",
    { ens_name: ensName },
    configPath,
  );

  const prepared = payload.prepared as Record<string, unknown> | undefined;
  const txRequest = prepared?.tx_request as Record<string, unknown> | undefined;

  if (!txRequest) {
    printJson(payload);
    return;
  }

  const chainId = Number(txRequest.chain_id);
  const { chain, walletClient, publicClient, account } =
    await walletClientForSubmit(chainId, configPath);

  const txHash = await (walletClient as any).sendTransaction({
    account,
    chain,
    to: String(txRequest.to) as `0x${string}`,
    data: String(txRequest.data) as Hex,
    value: BigInt(String(txRequest.value ?? "0")),
  });

  await publicClient.waitForTransactionReceipt({ hash: txHash });
  printJson({ ...payload, submitted: true, tx_hash: txHash });
}
