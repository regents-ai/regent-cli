import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { RegentRuntime, writeInitialConfig } from "../../src/internal-runtime/index.js";

import { runCliEntrypoint } from "../../src/index.js";
import { TechtreeContractServer } from "../../../../test-support/techtree-contract-server.js";
import { describeNetwork } from "../../../../test-support/integration.js";
import { captureOutput } from "../../../../test-support/test-helpers.js";

const TEST_PRIVATE_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const TEST_WALLET = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const TEST_REGISTRY = "0x2222222222222222222222222222222222222222";
const TEST_AGENT_REGISTRY = `eip155:8453/erc8004:${TEST_REGISTRY}`;

describeNetwork.sequential("CLI functional flows against the real runtime", () => {
  let server: TechtreeContractServer;
  let runtime: RegentRuntime | null = null;
  let tempDir = "";
  let configPath = "";
  let originalPrivateKey: string | undefined;
  let originalHome: string | undefined;
  let originalPath: string | undefined;

  const receiptPath = (): string => path.join(tempDir, ".regent", "identity", "receipt-v1.json");

  const writeManagedIdentity = (network: "base" | "base-sepolia" = "base"): void => {
    const managedIdentityPath = path.join(tempDir, ".regent", "managed-identity.json");
    fs.mkdirSync(path.dirname(managedIdentityPath), { recursive: true });
    fs.writeFileSync(
      managedIdentityPath,
      `${JSON.stringify(
        {
          provider: "regent",
          network,
          address: TEST_WALLET,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
  };

  const identityRequestCount = (): number =>
    server.requests.filter((request) => request.pathname.startsWith("/v1/identity/")).length;

  const ensureIdentity = async (extraArgs: string[] = []) =>
    captureOutput(async () =>
      runCliEntrypoint([
        "identity",
        "ensure",
        "--json",
        "--config",
        configPath,
        ...extraArgs,
      ]),
    );

  const writePrivyCli = (): void => {
    const binDir = path.join(tempDir, "bin");
    fs.mkdirSync(binDir, { recursive: true });
    const scriptPath = path.join(binDir, "privy-agent-wallets");
    fs.writeFileSync(
      scriptPath,
      `#!/bin/bash
set -euo pipefail

case "\${1:-}" in
  list-wallets)
    cat <<'EOF'
Ethereum:  ${TEST_WALLET}  (wallet_id_eth)
Solana:    7hQ5p11111111111111111111111111111111111111  (wallet_id_sol)
EOF
    ;;
  rpc)
    if [[ "\${2:-}" != "--json" ]]; then
      echo "expected --json" >&2
      exit 1
    fi
    printf '{"signature":"${`0x${"1".repeat(130)}`}"}\\n'
    ;;
  *)
    echo "unsupported privy command: $*" >&2
    exit 1
    ;;
esac
`,
      "utf8",
    );
    fs.chmodSync(scriptPath, 0o755);
    process.env.PATH = `${binDir}:${originalPath ?? ""}`;
  };

  const clearExternalSignerPath = (): void => {
    const emptyBinDir = path.join(tempDir, "empty-bin");
    fs.mkdirSync(emptyBinDir, { recursive: true });
    process.env.PATH = emptyBinDir;
  };

  beforeEach(async () => {
    server = new TechtreeContractServer();
    await server.start();

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "regent-cli-functional-"));
    configPath = path.join(tempDir, "regent.config.json");
    originalPrivateKey = process.env.REGENT_WALLET_PRIVATE_KEY;
    originalHome = process.env.HOME;
    originalPath = process.env.PATH;
    process.env.REGENT_WALLET_PRIVATE_KEY = TEST_PRIVATE_KEY;
    process.env.HOME = tempDir;

    writeInitialConfig(configPath, {
      runtime: {
        socketPath: path.join(tempDir, "runtime", "regent.sock"),
        stateDir: path.join(tempDir, "state"),
        logLevel: "debug",
      },
      auth: {
        baseUrl: server.baseUrl,
        audience: "regent-cli",
        defaultChainId: 8453,
        requestTimeoutMs: 1_000,
      },
      techtree: {
        baseUrl: server.baseUrl,
        requestTimeoutMs: 1_000,
      },
      wallet: {
        privateKeyEnv: "REGENT_WALLET_PRIVATE_KEY",
        keystorePath: path.join(tempDir, "keys", "agent-wallet.json"),
      },
    });

    runtime = new RegentRuntime(configPath);
    await runtime.start();
  });

  afterEach(async () => {
    if (runtime) {
      await runtime.stop();
    }
    await server.stop();
    process.env.REGENT_WALLET_PRIVATE_KEY = originalPrivateKey;
    process.env.HOME = originalHome;
    process.env.PATH = originalPath;
  });

  it("creates a shared identity receipt, reuses the cache, and refreshes on demand", async () => {
    writeManagedIdentity();

    const firstEnsure = await ensureIdentity(["--provider", "regent", "--network", "base"]);
    expect(firstEnsure.result).toBe(0);
    expect(JSON.parse(firstEnsure.stdout)).toEqual({
      status: "ok",
      provider: "regent",
      network: "base",
      address: TEST_WALLET.toLowerCase(),
      agent_id: 99,
      agent_registry: TEST_AGENT_REGISTRY,
      verified: "onchain",
      receipt_expires_at: "2999-01-01T00:00:00.000Z",
      cache_path: receiptPath(),
    });

    expect(fs.existsSync(receiptPath())).toBe(true);
    expect(JSON.parse(fs.readFileSync(receiptPath(), "utf8"))).toEqual({
      version: 1,
      regent_base_url: server.baseUrl,
      network: "base",
      provider: "regent",
      address: TEST_WALLET.toLowerCase(),
      agent_id: 99,
      agent_registry: TEST_AGENT_REGISTRY,
      signer_type: "evm_personal_sign",
      verified: "onchain",
      receipt: expect.stringContaining("receipt-valid."),
      receipt_issued_at: "2026-03-10T00:00:00.000Z",
      receipt_expires_at: "2999-01-01T00:00:00.000Z",
      cached_at: expect.any(String),
    });

    const requestsAfterFirstEnsure = identityRequestCount();
    expect(requestsAfterFirstEnsure).toBeGreaterThan(0);

    const secondEnsure = await ensureIdentity(["--provider", "regent", "--network", "base"]);
    expect(secondEnsure.result).toBe(0);
    expect(identityRequestCount()).toBe(requestsAfterFirstEnsure);

    const refreshedEnsure = await ensureIdentity(["--provider", "regent", "--network", "base", "--force-refresh"]);
    expect(refreshedEnsure.result).toBe(0);
    expect(identityRequestCount()).toBeGreaterThan(requestsAfterFirstEnsure);
  }, 15_000);

  it("fails cleanly when no signer provider is configured", async () => {
    clearExternalSignerPath();

    const output = await captureOutput(async () =>
      runCliEntrypoint(["identity", "ensure", "--json", "--config", configPath]),
    );

    expect(output.result).toBe(10);
    expect(JSON.parse(output.stdout)).toEqual({
      status: "error",
      code: "NO_SIGNER_PROVIDER_FOUND",
      message: "No supported signer provider was found on this machine.",
      details: {
        provider: "auto",
        failures: [
          {
            provider: "regent",
            code: "NO_SIGNER_PROVIDER_FOUND",
            message: "No Regent managed signer is configured on this machine.",
          },
          {
            provider: "moonpay",
            code: "MOONPAY_MISSING",
            message: "MoonPay signer not ready.",
            cause: expect.stringContaining("spawn mp"),
          },
          {
            provider: "bankr",
            code: "BANKR_MISSING",
            message: "Bankr signer not ready.",
            cause: expect.stringContaining("spawn bankr"),
          },
          {
            provider: "privy",
            code: "PRIVY_MISSING",
            message: "Privy signer not ready.",
            cause: expect.stringContaining("spawn privy-agent-wallets"),
          },
        ],
      },
    });
  }, 15_000);

  it("fails with the privy-specific exit code when privy is requested but unavailable", async () => {
    clearExternalSignerPath();

    const output = await ensureIdentity(["--provider", "privy", "--network", "base"]);

    expect(output.result).toBe(13);
    expect(JSON.parse(output.stdout)).toEqual({
      status: "error",
      code: "PRIVY_MISSING",
      message: "Privy signer not ready.",
      details: {
        provider: "privy",
        cause: expect.stringContaining("spawn privy-agent-wallets"),
      },
    });
  }, 15_000);

  it("uses privy when auto-detect reaches it and the signer is available", async () => {
    writePrivyCli();

    const output = await ensureIdentity(["--network", "base"]);

    expect(output.result).toBe(0);
    expect(JSON.parse(output.stdout)).toEqual({
      status: "ok",
      provider: "privy",
      network: "base",
      address: TEST_WALLET.toLowerCase(),
      agent_id: 99,
      agent_registry: TEST_AGENT_REGISTRY,
      verified: "onchain",
      receipt_expires_at: "2999-01-01T00:00:00.000Z",
      cache_path: receiptPath(),
    });
  }, 15_000);

  it("covers public reads and protected routes through the CLI", async () => {
    const targetNodeId = 1;
    const childNodeId = 2;

    writeManagedIdentity();
    const ensureOutput = await ensureIdentity(["--provider", "regent", "--network", "base"]);
    expect(ensureOutput.result).toBe(0);

    const techtreeStatusOutput = await captureOutput(async () =>
      runCliEntrypoint(["techtree", "status", "--config", configPath]),
    );
    expect(techtreeStatusOutput.result).toBe(0);
    expect(JSON.parse(techtreeStatusOutput.stdout)).toEqual({
      config: {
        baseUrl: server.baseUrl,
        requestTimeoutMs: 1_000,
      },
      health: {
        ok: true,
        service: "techtree-contract-server",
      },
    });

    const nodesListOutput = await captureOutput(async () =>
      runCliEntrypoint(["techtree", "nodes", "list", "--limit", "5", "--seed", "ml", "--config", configPath]),
    );
    expect(nodesListOutput.result).toBe(0);
    expect(JSON.parse(nodesListOutput.stdout)).toEqual({
      data: expect.arrayContaining([
        expect.objectContaining({
          id: 1,
          seed: "ml",
          kind: "hypothesis",
        }),
      ]),
    });

    const activityOutput = await captureOutput(async () =>
      runCliEntrypoint(["techtree", "activity", "--limit", "2", "--config", configPath]),
    );
    expect(activityOutput.result).toBe(0);
    expect(JSON.parse(activityOutput.stdout)).toEqual({
      data: [
        expect.objectContaining({
          event_type: "node_created",
          subject_node_id: 1,
        }),
        expect.objectContaining({
          event_type: "comment_added",
          subject_node_id: 1,
        }),
      ],
    });

    const searchOutput = await captureOutput(async () =>
      runCliEntrypoint(["techtree", "search", "--query", "Root", "--limit", "2", "--config", configPath]),
    );
    expect(searchOutput.result).toBe(0);
    expect(JSON.parse(searchOutput.stdout)).toEqual({
      data: {
        nodes: [
          expect.objectContaining({
            id: 1,
            title: "Root node",
          }),
        ],
        comments: [],
      },
    });

    const childrenOutput = await captureOutput(async () =>
      runCliEntrypoint(["techtree", "node", "children", "1", "--limit", "20", "--config", configPath]),
    );
    expect(childrenOutput.result).toBe(0);
    expect(JSON.parse(childrenOutput.stdout)).toEqual({
      data: expect.arrayContaining([
        expect.objectContaining({
          id: childNodeId,
          parent_id: 1,
        }),
      ]),
    });

    const watchOutput = await captureOutput(async () =>
      runCliEntrypoint(["techtree", "watch", String(targetNodeId), "--config", configPath]),
    );
    expect(watchOutput.result).toBe(0);
    expect(JSON.parse(watchOutput.stdout)).toEqual({
      data: expect.objectContaining({
        node_id: targetNodeId,
        watcher_type: "agent",
      }),
    });

    const unwatchOutput = await captureOutput(async () =>
      runCliEntrypoint(["techtree", "unwatch", String(targetNodeId), "--config", configPath]),
    );
    expect(unwatchOutput.result).toBe(0);
    expect(JSON.parse(unwatchOutput.stdout)).toEqual({ ok: true });

    const commentsOutput = await captureOutput(async () =>
      runCliEntrypoint([
        "techtree",
        "node",
        "comments",
        String(targetNodeId),
        "--limit",
        "20",
        "--config",
        configPath,
      ]),
    );
    expect(commentsOutput.result).toBe(0);
    expect(JSON.parse(commentsOutput.stdout)).toEqual({
      data: expect.arrayContaining([
        expect.objectContaining({
          id: expect.any(Number),
          node_id: targetNodeId,
          body_markdown: "Existing comment",
        }),
      ]),
    });

    const workPacketOutput = await captureOutput(async () =>
      runCliEntrypoint(["techtree", "node", "work-packet", String(targetNodeId), "--config", configPath]),
    );
    expect(workPacketOutput.result).toBe(0);
    expect(JSON.parse(workPacketOutput.stdout)).toEqual({
      data: expect.objectContaining({
        node: expect.objectContaining({
          id: targetNodeId,
        }),
        comments: expect.any(Array),
        activity_events: expect.any(Array),
      }),
    });

    const rootWatchOutput = await captureOutput(async () =>
      runCliEntrypoint(["techtree", "watch", String(targetNodeId), "--config", configPath]),
    );
    expect(rootWatchOutput.result).toBe(0);
    expect(JSON.parse(rootWatchOutput.stdout)).toEqual({
      data: {
        id: 801,
        node_id: targetNodeId,
        watcher_type: "agent",
        watcher_ref: 1,
        inserted_at: "2026-03-10T00:00:00.000Z",
      },
    });

    const watchListOutput = await captureOutput(async () =>
      runCliEntrypoint(["techtree", "watch", "list", "--config", configPath]),
    );
    expect(watchListOutput.result).toBe(0);
    expect(JSON.parse(watchListOutput.stdout)).toEqual({
      data: [
        {
          id: 801,
          node_id: targetNodeId,
          watcher_type: "agent",
          watcher_ref: 1,
          inserted_at: "2026-03-10T00:00:00.000Z",
        },
      ],
    });

    const starOutput = await captureOutput(async () =>
      runCliEntrypoint(["techtree", "star", String(targetNodeId), "--config", configPath]),
    );
    expect(starOutput.result).toBe(0);
    expect(JSON.parse(starOutput.stdout)).toEqual({
      data: {
        id: 900,
        node_id: targetNodeId,
        actor_type: "agent",
        actor_ref: 1,
        inserted_at: "2026-03-10T00:00:00.000Z",
      },
    });

    const unstarOutput = await captureOutput(async () =>
      runCliEntrypoint(["techtree", "unstar", String(targetNodeId), "--config", configPath]),
    );
    expect(unstarOutput.result).toBe(0);
    expect(JSON.parse(unstarOutput.stdout)).toEqual({ ok: true });

    const inboxOutput = await captureOutput(async () =>
      runCliEntrypoint([
        "techtree",
        "inbox",
        "--limit",
        "5",
        "--seed",
        "ml",
        "--kind",
        "comment,mention",
        "--config",
        configPath,
      ]),
    );
    expect(inboxOutput.result).toBe(0);
    expect(JSON.parse(inboxOutput.stdout)).toEqual({
      events: expect.arrayContaining([
        expect.objectContaining({
          actor_type: "agent",
          actor_ref: 1,
          stream: "agent_inbox",
          payload: expect.objectContaining({
            seed: "ml",
            kind_filters: ["comment", "mention"],
          }),
          inserted_at: "2026-03-10T00:00:00.000Z",
        }),
      ]),
      next_cursor: expect.any(Number),
    });

    const opportunitiesOutput = await captureOutput(async () =>
      runCliEntrypoint([
        "techtree",
        "opportunities",
        "--limit",
        "2",
        "--seed",
        "ml",
        "--kind",
        "review",
        "--config",
        configPath,
      ]),
    );
    expect(opportunitiesOutput.result).toBe(0);
    expect(JSON.parse(opportunitiesOutput.stdout)).toEqual({
      opportunities: [
        {
          node_id: 1,
          title: "Root node",
          seed: "ml",
          kind: "hypothesis",
          opportunity_type: "review",
          activity_score: "1.0",
        },
      ],
    });

    const gossipsubStatusOutput = await captureOutput(async () =>
      runCliEntrypoint(["gossipsub", "status", "--config", configPath]),
    );
    expect(gossipsubStatusOutput.result).toBe(0);
    expect(JSON.parse(gossipsubStatusOutput.stdout)).toEqual({
      enabled: false,
      configured: false,
      connected: false,
      subscribedTopics: [],
      peerCount: 0,
      lastError: null,
      eventSocketPath: null,
      status: "disabled",
      note: "Chatbox transport disabled",
    });
  }, 15_000);

  it("returns deterministic local failure paths for mutating commands", async () => {
    const missingArtifactIdOutput = await captureOutput(async () =>
      runCliEntrypoint([
        "techtree",
        "main",
        "run",
        "init",
        "--config",
        configPath,
        "--path",
        "run-workspace",
      ]),
    );
    expect(missingArtifactIdOutput.result).toBe(1);
    expect(JSON.parse(missingArtifactIdOutput.stderr)).toEqual({
      error: {
        message: "missing required argument: artifact id",
      },
    });

    const missingTargetOutput = await captureOutput(async () =>
      runCliEntrypoint([
        "techtree",
        "main",
        "review",
        "init",
        "--config",
        configPath,
        "--path",
        "review-workspace",
      ]),
    );
    expect(missingTargetOutput.result).toBe(1);
    expect(JSON.parse(missingTargetOutput.stderr)).toEqual({
      error: {
        message: "missing required argument: target id",
      },
    });

    const unauthenticatedWatchOutput = await captureOutput(async () =>
      runCliEntrypoint(["techtree", "watch", "1", "--config", configPath]),
    );
    expect(unauthenticatedWatchOutput.result).toBe(1);
    expect(JSON.parse(unauthenticatedWatchOutput.stderr)).toEqual({
      error: {
        code: "siwa_session_missing",
        message: "no Regent identity receipt found; run `regent identity ensure`",
      },
    });

    const unauthenticatedUnwatchOutput = await captureOutput(async () =>
      runCliEntrypoint(["techtree", "unwatch", "1", "--config", configPath]),
    );
    expect(unauthenticatedUnwatchOutput.result).toBe(1);
    expect(JSON.parse(unauthenticatedUnwatchOutput.stderr)).toEqual({
      error: {
        code: "siwa_session_missing",
        message: "no Regent identity receipt found; run `regent identity ensure`",
      },
    });
  }, 15_000);

  it("runs doctor in human, json, scoped, and full modes through the CLI", async () => {
    writeManagedIdentity();
    const ensureOutput = await ensureIdentity(["--provider", "regent", "--network", "base"]);
    expect(ensureOutput.result).toBe(0);

    const humanDoctor = await captureOutput(async () =>
      runCliEntrypoint(["doctor", "--config", configPath]),
    );
    expect(humanDoctor.result).toBe(0);
    expect(humanDoctor.stdout).toContain("R E G E N T   D O C T O R");
    expect(humanDoctor.stdout).toContain("techtree health reachable");
    expect(humanDoctor.stdout).toContain("CHECK GRID");

    const jsonDoctor = await captureOutput(async () =>
      runCliEntrypoint(["doctor", "auth", "--json", "--config", configPath]),
    );
    expect(jsonDoctor.result).toBe(0);
    expect(JSON.parse(jsonDoctor.stdout)).toEqual(
      expect.objectContaining({
        mode: "scoped",
        scope: "auth",
        checks: expect.arrayContaining([
          expect.objectContaining({
            id: "auth.http-envelope.build",
            status: "ok",
          }),
        ]),
      }),
    );

    const fullDoctor = await captureOutput(async () =>
      runCliEntrypoint([
        "doctor",
        "--full",
        "--known-parent-id",
        "1",
        "--config",
        configPath,
      ]),
    );
    expect(fullDoctor.result).toBe(0);
    expect(fullDoctor.stdout).toContain("full proof node create");
    expect(fullDoctor.stdout).toContain("full proof comment readback");
    expect(fullDoctor.stdout).toContain("NEXT MOVES");
  }, 15_000);
});
