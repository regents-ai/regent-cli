import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia } from "viem/chains";

import type { PaidPayloadSummary } from "../../../internal-types/index.js";
import type { RuntimeContext } from "../../runtime.js";

const ERC20_APPROVE_ABI = [
  {
    inputs: [
      { internalType: "address", name: "spender", type: "address" },
      { internalType: "uint256", name: "value", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

const TECHTREE_CONTENT_SETTLEMENT_ABI = [
  {
    inputs: [
      { internalType: "bytes32", name: "listingRef", type: "bytes32" },
      { internalType: "address", name: "seller", type: "address" },
      { internalType: "bytes32", name: "bundleRef", type: "bytes32" },
      { internalType: "uint256", name: "amount", type: "uint256" },
    ],
    name: "settlePurchase",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

const requireString = (value: unknown, label: string): string => {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`missing ${label}`);
  }

  return value;
};

const requirePositiveInteger = (value: unknown, label: string): number => {
  if (!Number.isInteger(value) || Number(value) <= 0) {
    throw new Error(`missing ${label}`);
  }

  return Number(value);
};

const requireAddress = (value: unknown, label: string): Address => {
  const normalized = requireString(value, label).trim().toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(normalized)) {
    throw new Error(`invalid ${label}`);
  }

  return normalized as Address;
};

const requireHex32 = (value: unknown, label: string): Hex => {
  const normalized = requireString(value, label).trim().toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(normalized)) {
    throw new Error(`invalid ${label}`);
  }

  return normalized as Hex;
};

const parseUsdcAmount = (value: unknown): bigint => {
  const raw = requireString(value, "price_usdc");
  const [wholePart, fractionalPart = ""] = raw.split(".");
  if (!/^\d+$/.test(wholePart) || !/^\d*$/.test(fractionalPart)) {
    throw new Error("price_usdc must be a decimal string");
  }

  const paddedFraction = `${fractionalPart}000000`.slice(0, 6);
  return BigInt(wholePart) * 1_000_000n + BigInt(paddedFraction || "0");
};

const rpcUrlForChain = (chainId: number): string => {
  const resolved =
    chainId === 84532
      ? process.env.BASE_SEPOLIA_RPC_URL ?? process.env.ANVIL_RPC_URL
      : chainId === 8453
        ? process.env.BASE_MAINNET_RPC_URL ?? process.env.BASE_RPC_URL
        : undefined;

  if (!resolved) {
    throw new Error(`missing RPC URL for chain ${chainId}`);
  }

  return resolved;
};

const viemChainForId = (chainId: number) => {
  switch (chainId) {
    case 84532:
      return baseSepolia;
    case 8453:
      return base;
    default:
      throw new Error(`unsupported purchase chain ${chainId}`);
  }
};

export async function settleTechtreeNodePaidPayloadPurchase(
  ctx: RuntimeContext,
  nodeId: number,
  payload: PaidPayloadSummary,
): Promise<{
  approve_tx_hash: Hex;
  purchase_tx_hash: Hex;
  chain_id: number;
  amount_usdc: string;
  listing_ref: Hex;
  bundle_ref: Hex;
}> {
  const settlementContract = requireAddress(payload.settlement_contract_address, "settlement contract");
  const usdcToken = requireAddress(payload.usdc_token_address, "USDC token");
  const sellerPayout = requireAddress(payload.seller_payout_address, "seller payout address");
  const listingRef = requireHex32(payload.listing_ref, "listing ref");
  const bundleRef = requireHex32(payload.bundle_ref, "bundle ref");
  const chainId = requirePositiveInteger(payload.chain_id, "chain_id");
  const rpcUrl = rpcUrlForChain(chainId);
  const amountUnits = parseUsdcAmount(payload.price_usdc);
  const amountUsdc = requireString(payload.price_usdc, "price_usdc");
  const privateKey = await ctx.walletSecretSource.getPrivateKeyHex();
  const account = privateKeyToAccount(privateKey);
  const chain = viemChainForId(chainId);

  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  const walletClient = createWalletClient({
    chain,
    account,
    transport: http(rpcUrl),
  });

  const approveTxHash = await walletClient.writeContract({
    account,
    address: usdcToken,
    abi: ERC20_APPROVE_ABI,
    functionName: "approve",
    args: [settlementContract, amountUnits],
  });
  await publicClient.waitForTransactionReceipt({ hash: approveTxHash });

  const purchaseTxHash = await walletClient.writeContract({
    account,
    address: settlementContract,
    abi: TECHTREE_CONTENT_SETTLEMENT_ABI,
    functionName: "settlePurchase",
    args: [listingRef, sellerPayout, bundleRef, amountUnits],
  });
  await publicClient.waitForTransactionReceipt({ hash: purchaseTxHash });

  const verified = await ctx.techtree.verifyNodePurchase(nodeId, purchaseTxHash);

  return {
    approve_tx_hash: approveTxHash,
    purchase_tx_hash: purchaseTxHash,
    chain_id: chainId,
    amount_usdc: amountUsdc,
    listing_ref: verified.data.listing_ref,
    bundle_ref: verified.data.bundle_ref,
  };
}
