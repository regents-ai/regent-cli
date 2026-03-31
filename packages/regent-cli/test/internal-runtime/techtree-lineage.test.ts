import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SessionStore } from "../../src/internal-runtime/store/session-store.js";
import { StateStore } from "../../src/internal-runtime/store/state-store.js";
import { TechtreeClient } from "../../src/internal-runtime/techtree/client.js";
import {
  handleTechtreeNodeCrossChainLinksClear,
  handleTechtreeNodeLineageWithdraw,
} from "../../src/internal-runtime/handlers/techtree.js";
import type { RuntimeContext } from "../../src/internal-runtime/runtime.js";

const TEST_PRIVATE_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const TEST_WALLET = "0x1111111111111111111111111111111111111111";
const TEST_REGISTRY = "0x2222222222222222222222222222222222222222";

class StaticWalletSecretSource {
  async getPrivateKeyHex(): Promise<`0x${string}`> {
    return TEST_PRIVATE_KEY;
  }
}

const createClient = (baseUrl: string): { client: TechtreeClient; stateStore: StateStore; sessionStore: SessionStore } => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "regent-lineage-"));
  const stateStore = new StateStore(path.join(tempDir, "runtime-state.json"));
  const sessionStore = new SessionStore(stateStore);
  const client = new TechtreeClient({
    baseUrl,
    requestTimeoutMs: 1_000,
    sessionStore,
    walletSecretSource: new StaticWalletSecretSource(),
    stateStore,
  });

  sessionStore.setSiwaSession({
    walletAddress: TEST_WALLET,
    chainId: 11155111,
    nonce: "nonce-test",
    keyId: "key-test",
    receipt: "receipt-test",
    receiptExpiresAt: "2026-04-30T00:00:00.000Z",
    audience: "techtree",
    registryAddress: TEST_REGISTRY,
    tokenId: "99",
  });
  stateStore.patch({
    agent: {
      walletAddress: TEST_WALLET,
      chainId: 11155111,
      registryAddress: TEST_REGISTRY,
      tokenId: "99",
    },
  });

  return { client, stateStore, sessionStore };
};

describe("techtree lineage and cross-chain link wiring", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("targets the expected lineage and cross-chain routes", async () => {
    const { client } = createClient("http://127.0.0.1:4001");

    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      const method = String(init?.method ?? "GET");

      if (url.endsWith("/v1/agent/tree/nodes/42/lineage") && method === "GET") {
        return new Response(JSON.stringify({ data: { status: "author_claimed", claims: [] } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      if (url.endsWith("/v1/tree/nodes/42/lineage/claims") && method === "POST") {
        return new Response(JSON.stringify({ data: { claim_id: "claim_1" } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      if (url.endsWith("/v1/tree/nodes/42/lineage/claims/claim_1") && method === "DELETE") {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      if (url.endsWith("/v1/agent/tree/nodes/42/cross-chain-links") && method === "GET") {
        return new Response(JSON.stringify({ data: [{ link_id: "link_1" }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      if (url.endsWith("/v1/tree/nodes/42/cross-chain-links") && method === "POST") {
        return new Response(JSON.stringify({ data: { link_id: "link_1" } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      if (url.endsWith("/v1/tree/nodes/42/cross-chain-links/current") && method === "DELETE") {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      if (url.endsWith("/v1/tree/nodes") && method === "POST") {
        return new Response(JSON.stringify({ data: { node_id: 7, manifest_cid: "bafy", status: "pinned", anchor_status: "pending" } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      throw new Error(`unexpected request: ${method} ${url}`);
    });

    await expect(client.listNodeLineageClaims(42)).resolves.toEqual({
      data: { status: "author_claimed", claims: [] },
    });
    await expect(
      client.claimNodeLineage(42, {
        relation: "copy_of",
        target_chain_id: 1,
        target_node_ref: "eth:source-node",
        note: "descends from base",
      }),
    ).resolves.toEqual({
      data: { claim_id: "claim_1" },
    });
    await expect(client.withdrawNodeLineageClaim(42, "claim_1")).resolves.toEqual({
      ok: true,
    });

    await expect(client.listNodeCrossChainLinks(42)).resolves.toEqual({
      data: [{ link_id: "link_1" }],
    });
    await expect(
      client.createNodeCrossChainLink(42, {
        relation: "reproduces",
        target_chain_id: 1,
        target_node_ref: "eth:source-node",
      }),
    ).resolves.toEqual({ data: { link_id: "link_1" } });
    await expect(client.clearNodeCrossChainLinks(42)).resolves.toEqual({ ok: true });

    await expect(
      client.createNode({
        seed: "ml",
        kind: "hypothesis",
        title: "Cross-chain node",
        notebook_source: "print('hello')",
        cross_chain_link: {
          relation: "reproduces",
          target_chain_id: 8453,
          target_node_ref: "base:experiment-node",
        },
      }),
    ).resolves.toEqual({
      data: {
        node_id: 7,
        manifest_cid: "bafy",
        status: "pinned",
        anchor_status: "pending",
      },
    });

    expect(fetchMock.mock.calls.some(([input, init]) => String(input).endsWith("/v1/agent/tree/nodes/42/lineage") && String(init?.method ?? "GET") === "GET")).toBe(true);
    expect(fetchMock.mock.calls.some(([input, init]) => String(input).endsWith("/v1/tree/nodes/42/lineage/claims/claim_1") && String(init?.method ?? "GET") === "DELETE")).toBe(true);
    expect(fetchMock.mock.calls.some(([input, init]) => String(input).endsWith("/v1/tree/nodes/42/cross-chain-links/current") && String(init?.method ?? "GET") === "DELETE")).toBe(true);

    const createCall = fetchMock.mock.calls.find(([input, init]) =>
      String(input).endsWith("/v1/tree/nodes") && String(init?.method ?? "GET") === "POST",
    );
    expect(createCall).toBeTruthy();
    const body = JSON.parse(String((createCall?.[1] as RequestInit | undefined)?.body ?? "{}")) as Record<string, unknown>;
    expect(body).toMatchObject({
      seed: "ml",
      kind: "hypothesis",
      title: "Cross-chain node",
      cross_chain_link: {
        relation: "reproduces",
        target_chain_id: 8453,
        target_node_ref: "base:experiment-node",
      },
    });
  });

  it("delegates lineage withdraw and cross-chain clear through the runtime handlers", async () => {
    const techtree = {
      withdrawNodeLineageClaim: vi.fn().mockResolvedValue({ data: { claim_id: "claim_1" } }),
      clearNodeCrossChainLinks: vi.fn().mockResolvedValue({ ok: true }),
    };

    const ctx = {
      techtree,
    } as unknown as RuntimeContext;

    await expect(handleTechtreeNodeLineageWithdraw(ctx, { id: 42, claimId: "claim_1" })).resolves.toEqual({
      data: { claim_id: "claim_1" },
    });
    await expect(handleTechtreeNodeCrossChainLinksClear(ctx, { id: 42 })).resolves.toEqual({ ok: true });

    expect(techtree.withdrawNodeLineageClaim).toHaveBeenCalledWith(42, "claim_1");
    expect(techtree.clearNodeCrossChainLinks).toHaveBeenCalledWith(42);
  });
});
