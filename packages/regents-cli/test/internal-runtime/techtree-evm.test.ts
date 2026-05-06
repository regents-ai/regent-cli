import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PaidPayloadSummary } from "../../src/internal-types/index.js";
import { settleTechtreeNodePaidPayloadPurchase } from "../../src/internal-runtime/handlers/techtree/evm.js";
import type { RuntimeContext } from "../../src/internal-runtime/runtime.js";

const { writeContractMock, waitForReceiptMock, verifyNodePurchaseMock } = vi.hoisted(() => ({
  writeContractMock: vi.fn(),
  waitForReceiptMock: vi.fn(),
  verifyNodePurchaseMock: vi.fn(),
}));

vi.mock("viem/accounts", () => ({
  privateKeyToAccount: () => ({
    address: "0x00000000000000000000000000000000000000aa",
  }),
}));

vi.mock("viem/chains", () => ({
  base: { id: 8453, name: "Base" },
}));

vi.mock("viem", () => ({
  http: (url: string) => ({ url }),
  createWalletClient: () => ({
    writeContract: writeContractMock,
  }),
  createPublicClient: () => ({
    waitForTransactionReceipt: waitForReceiptMock,
  }),
}));

const paidPayload = (): PaidPayloadSummary => ({
  status: "active",
  delivery_mode: "server_verified",
  payment_rail: "onchain",
  chain_id: 8453,
  settlement_contract_address: "0x1111111111111111111111111111111111111111",
  usdc_token_address: "0x2222222222222222222222222222222222222222",
  treasury_address: "0x3333333333333333333333333333333333333333",
  seller_payout_address: "0x4444444444444444444444444444444444444444",
  price_usdc: "1.25",
  listing_ref: `0x${"a".repeat(64)}`,
  bundle_ref: `0x${"b".repeat(64)}`,
  verified_purchase_count: 0,
  viewer_has_verified_purchase: false,
});

const runtimeContext = (): RuntimeContext =>
  ({
    walletSecretSource: {
      getPrivateKeyHex: async () =>
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    },
    techtree: {
      verifyNodePurchase: verifyNodePurchaseMock,
    },
  }) as unknown as RuntimeContext;

describe("Techtree EVM settlement", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    writeContractMock.mockReset();
    waitForReceiptMock.mockReset();
    verifyNodePurchaseMock.mockReset();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("rejects a failed approval receipt before reporting purchase success", async () => {
    process.env.BASE_MAINNET_RPC_URL = "https://base.example";
    writeContractMock.mockResolvedValue(`0x${"1".repeat(64)}`);
    waitForReceiptMock.mockResolvedValue({ status: "reverted" });

    await expect(
      settleTechtreeNodePaidPayloadPurchase(runtimeContext(), 123, paidPayload()),
    ).rejects.toThrow("The transaction was not confirmed successfully.");

    expect(verifyNodePurchaseMock).not.toHaveBeenCalled();
  });

  it("rejects a failed purchase receipt before verifying the purchase", async () => {
    process.env.BASE_MAINNET_RPC_URL = "https://base.example";
    writeContractMock
      .mockResolvedValueOnce(`0x${"1".repeat(64)}`)
      .mockResolvedValueOnce(`0x${"2".repeat(64)}`);
    waitForReceiptMock
      .mockResolvedValueOnce({ status: "success" })
      .mockResolvedValueOnce({ status: "reverted" });

    await expect(
      settleTechtreeNodePaidPayloadPurchase(runtimeContext(), 123, paidPayload()),
    ).rejects.toThrow("The transaction was not confirmed successfully.");

    expect(verifyNodePurchaseMock).not.toHaveBeenCalled();
  });
});
