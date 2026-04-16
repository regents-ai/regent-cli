import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { callJsonRpc, ensureIdentity, loadConfig, RegentRuntime, writeInitialConfig } from "../../../src/internal-runtime/index.js";
import { TechtreeContractServer } from "../../../../../test-support/techtree-contract-server.js";
import { describeNetwork } from "../../../../../test-support/integration.js";

const TEST_PRIVATE_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const TEST_WALLET = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

describeNetwork.sequential("doctor JSON-RPC methods", () => {
  let server: TechtreeContractServer;
  let runtime: RegentRuntime | null = null;
  let tempDir = "";
  let configPath = "";
  let socketPath = "";
  let originalPrivateKey: string | undefined;
  let originalHome: string | undefined;

  const writeManagedIdentity = (): void => {
    const managedIdentityPath = path.join(tempDir, ".regent", "managed-identity.json");
    fs.mkdirSync(path.dirname(managedIdentityPath), { recursive: true });
    fs.writeFileSync(
      managedIdentityPath,
      `${JSON.stringify(
        {
          provider: "regent",
          network: "base",
          address: TEST_WALLET,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
  };

  const seedIdentityReceipt = async (): Promise<void> => {
    writeManagedIdentity();
    await ensureIdentity({
      provider: "regent",
      network: "base",
      forceRefresh: true,
      timeoutSeconds: 1,
      config: loadConfig(configPath),
    });
  };

  beforeEach(async () => {
    server = new TechtreeContractServer();
    await server.start();

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "regent-doctor-daemon-"));
    configPath = path.join(tempDir, "regent.config.json");
    socketPath = path.join(tempDir, "runtime", "regent.sock");

    originalPrivateKey = process.env.REGENT_WALLET_PRIVATE_KEY;
    originalHome = process.env.HOME;
    process.env.REGENT_WALLET_PRIVATE_KEY = TEST_PRIVATE_KEY;
    process.env.HOME = tempDir;

    writeInitialConfig(configPath, {
      runtime: {
        socketPath,
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
  });

  it("returns structured default, scoped, and full doctor reports over JSON-RPC", async () => {
    const initial = await callJsonRpc(socketPath, "doctor.run");
    expect(initial.mode).toBe("default");
    expect(initial.summary.fail).toBe(0);
    expect(initial.summary.warn).toBeGreaterThan(0);
    expect(initial.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "auth.siwa.verify.endpoint",
          status: "ok",
        }),
        expect.objectContaining({
          id: "auth.identity.headers",
          status: "warn",
        }),
        expect.objectContaining({
          id: "auth.session.present",
          status: "warn",
        }),
      ]),
    );

    await seedIdentityReceipt();

    const scoped = await callJsonRpc(socketPath, "doctor.runScoped", {
      scope: "techtree",
    });
    expect(scoped.mode).toBe("scoped");
    expect(scoped.scope).toBe("techtree");
    expect(scoped.summary.fail).toBe(0);
    expect(scoped.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "techtree.authenticated.probe",
          status: "ok",
        }),
      ]),
    );

    const full = await callJsonRpc(socketPath, "doctor.runFull", {
      knownParentId: 1,
    });
    expect(full.mode).toBe("full");
    expect(full.summary.fail).toBe(0);
    expect(full.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "full.node.create",
          status: "ok",
          details: expect.objectContaining({
            statusCode: 201,
          }),
        }),
        expect.objectContaining({
          id: "full.comment.add",
          status: "ok",
        }),
        expect.objectContaining({
          id: "full.comment.readback",
          status: "ok",
        }),
      ]),
    );
  }, 15_000);

  it("preserves backend denial metadata on authenticated probe failures", async () => {
    await seedIdentityReceipt();

    runtime.sessionStore.setSiwaSession({
      ...(runtime.sessionStore.getSiwaSession() as NonNullable<ReturnType<typeof runtime.sessionStore.getSiwaSession>>),
      receipt: "receipt-invalid",
    });

    const report = await callJsonRpc(socketPath, "doctor.runScoped", {
      scope: "techtree",
    });
    const probe = report.checks.find((check) => check.id === "techtree.authenticated.probe");

    expect(probe).toMatchObject({
      status: "fail",
      details: {
        route: "/v1/agent/opportunities",
        status: 401,
        backend: {
          code: "http_envelope_invalid",
          message: "invalid SIWA receipt",
        },
      },
    });
  }, 15_000);

  it("preserves structured 422 denial metadata from the authenticated probe", async () => {
    await runtime.stop();
    await server.stop();

    server = new TechtreeContractServer({
      opportunitiesResponse: {
        statusCode: 422,
        payload: {
          error: {
            code: "http_envelope_invalid",
            message: "signature envelope denied",
            details: {
              sidecar: "http_verify_failed",
            },
          },
        },
      },
    });
    await server.start();

    writeInitialConfig(configPath, {
      runtime: {
        socketPath,
        stateDir: path.join(path.dirname(configPath), "state"),
        logLevel: "debug",
      },
      auth: {
        baseUrl: server.baseUrl,
        audience: "regent-cli",
        defaultChainId: 11155111,
        requestTimeoutMs: 1_000,
      },
      techtree: {
        baseUrl: server.baseUrl,
        requestTimeoutMs: 1_000,
      },
      wallet: {
        privateKeyEnv: "REGENT_WALLET_PRIVATE_KEY",
        keystorePath: path.join(path.dirname(configPath), "keys", "agent-wallet.json"),
      },
    });

    runtime = new RegentRuntime(configPath);
    await runtime.start();

    await seedIdentityReceipt();

    const report = await callJsonRpc(socketPath, "doctor.runScoped", {
      scope: "techtree",
    });
    const probe = report.checks.find((check) => check.id === "techtree.authenticated.probe");

    expect(probe).toMatchObject({
      status: "fail",
      details: {
        route: "/v1/agent/opportunities",
        status: 422,
        backend: {
          code: "http_envelope_invalid",
          message: "signature envelope denied",
          details: {
            sidecar: "http_verify_failed",
          },
        },
      },
    });
  }, 15_000);
});
