import { describe, expect, it } from "vitest";

import { TechResource } from "../../src/internal-runtime/techtree/client/tech.js";
import type { TechtreeRequestClient } from "../../src/internal-runtime/techtree/client/request.js";

describe("TECH Techtree client", () => {
  it("uses the contract-backed TECH reward paths", async () => {
    const calls: Array<{ method: string; path: string; body?: unknown }> = [];
    const request = {
      getJson: async (path: string) => {
        calls.push({ method: "GET", path });
        return { data: {} };
      },
      authedFetchJson: async (method: string, path: string, body?: unknown) => {
        calls.push({ method, path, body });
        return { data: {} };
      },
    } as unknown as TechtreeRequestClient;
    const tech = new TechResource(request);

    await tech.status();
    await tech.currentEpoch();
    await tech.listLeaderboards({ status: "active", limit: 20 });
    await tech.listRewards({ epoch: 3, lane: "science", limit: 10 });
    await tech.rewardProof({ epoch: 3, lane: "science", agent_id: "42" });
    await tech.prepareClaim({ epoch: 3, lane: "science", agent_id: "42" });
    await tech.prepareWithdrawal({
      agent_id: "42",
      amount: "1000000000000000000",
      tech_recipient: "0x1111111111111111111111111111111111111111",
      min_usdc_out: "1",
      deadline: 1_900_000_000,
    });
    await tech.prepareLeaderboardRegistration({
      leaderboard_id: "bbh",
      kind: "bbh",
      title: "BBH",
      weight_bps: 10_000,
      config_hash: "0x1111111111111111111111111111111111111111111111111111111111111111",
      uri: "ipfs://leaderboard",
    });

    expect(calls).toEqual([
      { method: "GET", path: "/v1/tech/status" },
      { method: "GET", path: "/v1/tech/epochs/current" },
      { method: "GET", path: "/v1/tech/leaderboards?status=active&limit=20" },
      { method: "GET", path: "/v1/tech/rewards?epoch=3&lane=science&limit=10" },
      { method: "GET", path: "/v1/tech/rewards/proof?epoch=3&lane=science&agent_id=42" },
      { method: "POST", path: "/v1/agent/tech/rewards/claim/prepare", body: { epoch: 3, lane: "science", agent_id: "42" } },
      {
        method: "POST",
        path: "/v1/agent/tech/withdraw/prepare",
        body: {
          agent_id: "42",
          amount: "1000000000000000000",
          tech_recipient: "0x1111111111111111111111111111111111111111",
          min_usdc_out: "1",
          deadline: 1_900_000_000,
        },
      },
      {
        method: "POST",
        path: "/v1/agent/tech/leaderboards/register/prepare",
        body: {
          leaderboard_id: "bbh",
          kind: "bbh",
          title: "BBH",
          weight_bps: 10_000,
          config_hash: "0x1111111111111111111111111111111111111111111111111111111111111111",
          uri: "ipfs://leaderboard",
        },
      },
    ]);
  });
});
