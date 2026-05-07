import { beforeEach, describe, expect, it, vi } from "vitest";

import { captureOutput, parsePrintedJson } from "../helpers/output.js";

const { daemonCallMock } = vi.hoisted(() => ({
  daemonCallMock: vi.fn(),
}));

vi.mock("../../src/daemon-client.js", () => ({
  daemonCall: daemonCallMock,
}));

describe("techtree TECH command runners", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("prepares reward claims from canonical string-key flags", async () => {
    daemonCallMock.mockResolvedValue({
      data: {
        transaction: {
          chain_id: 8453,
          to: "0x1111111111111111111111111111111111111111",
          value: "0",
          function_signature: "claim(uint64,uint8,uint256,uint256,bytes32,bytes32[])",
          args: [],
        },
      },
    });

    const { runTechtreeTechRewardsClaim } = await import("../../src/commands/techtree-tech.js");
    const { parseCliArgs } = await import("../../src/parse.js");

    const output = await captureOutput(() =>
      runTechtreeTechRewardsClaim(
        parseCliArgs([
          "techtree",
          "tech",
          "rewards",
          "claim",
          "--epoch",
          "3",
          "--lane",
          "science",
          "--agent-id",
          "42",
        ]),
      ),
    );

    expect(daemonCallMock).toHaveBeenCalledWith(
      "techtree.tech.rewards.claim",
      {
        epoch: 3,
        lane: "science",
        agent_id: "42",
      },
      undefined,
    );
    expect(parsePrintedJson(output.stdout).data.transaction.chain_id).toBe(8453);
  });

  it("prepares withdrawals with explicit REGENT protection", async () => {
    daemonCallMock.mockResolvedValue({ data: { transaction: { chain_id: 8453 } } });

    const { runTechtreeTechWithdraw } = await import("../../src/commands/techtree-tech.js");
    const { parseCliArgs } = await import("../../src/parse.js");

    await captureOutput(() =>
      runTechtreeTechWithdraw(
        parseCliArgs([
          "techtree",
          "tech",
          "withdraw",
          "--agent-id",
          "42",
          "--amount",
          "1000000000000000000",
          "--tech-recipient",
          "0x1111111111111111111111111111111111111111",
          "--min-usdc-out",
          "1",
          "--deadline",
          "1900000000",
        ]),
      ),
    );

    expect(daemonCallMock).toHaveBeenCalledWith(
      "techtree.tech.withdraw",
      {
        agent_id: "42",
        amount: "1000000000000000000",
        tech_recipient: "0x1111111111111111111111111111111111111111",
        min_usdc_out: "1",
        deadline: 1_900_000_000,
      },
      undefined,
    );
  });

  it("rejects unsupported reward lanes before preparing a claim", async () => {
    const { runTechtreeTechRewardsClaim } = await import("../../src/commands/techtree-tech.js");
    const { parseCliArgs } = await import("../../src/parse.js");

    await expect(
      runTechtreeTechRewardsClaim(
        parseCliArgs([
          "techtree",
          "tech",
          "rewards",
          "claim",
          "--epoch",
          "3",
          "--lane",
          "legacy",
          "--agent-id",
          "42",
        ]),
      ),
    ).rejects.toThrow("--lane must be science or usdc_input.");
    expect(daemonCallMock).not.toHaveBeenCalled();
  });
});
