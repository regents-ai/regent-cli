import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { RegentRuntime, writeInitialConfig } from "../src/internal-runtime/index.js";

import { runCliEntrypoint } from "../src/index.js";
import { TechtreeContractServer } from "../../../test-support/techtree-contract-server.js";
import { describeNetwork } from "../../../test-support/integration.js";
import { captureOutput } from "../../../test-support/test-helpers.js";

const TEST_PRIVATE_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const TEST_WALLET = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

describeNetwork.sequential("CLI doctor command", () => {
  let server: TechtreeContractServer;
  let runtime: RegentRuntime | null = null;
  let tempDir = "";
  let configPath = "";
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

  beforeEach(async () => {
    server = new TechtreeContractServer();
    await server.start();

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "regent-cli-doctor-"));
    configPath = path.join(tempDir, "regent.config.json");
    originalPrivateKey = process.env.REGENT_WALLET_PRIVATE_KEY;
    originalHome = process.env.HOME;
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
        defaultChainId: 11155111,
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

  it("renders a human-readable report when auth is not yet established", async () => {
    fs.mkdirSync(path.join(path.dirname(configPath), "runtime"), { recursive: true });

    const output = await captureOutput(async () =>
      runCliEntrypoint(["doctor", "--config", configPath]),
    );

    expect(output.result).toBe(0);
    expect(output.stderr).toBe("");
    expect(output.stdout).toContain("R E G E N T   D O C T O R");
    expect(output.stdout).toContain("SIWA session");
    expect(output.stdout).toContain("NEXT MOVES");
    expect(output.stdout).toContain("Run `regent identity ensure`");
  });

  it("renders JSON output with a successful authenticated probe", async () => {
    writeManagedIdentity();
    const loginOutput = await captureOutput(async () =>
      runCliEntrypoint([
        "identity",
        "ensure",
        "--provider",
        "regent",
        "--network",
        "base",
        "--json",
        "--config",
        configPath,
      ]),
    );
    expect(loginOutput.result).toBe(0);

    const output = await captureOutput(async () =>
      runCliEntrypoint(["doctor", "--json", "--config", configPath]),
    );

    expect(output.result).toBe(0);
    expect(output.stderr).toBe("");
    expect(JSON.parse(output.stdout)).toEqual(
      expect.objectContaining({
        mode: "default",
        checks: expect.arrayContaining([
          expect.objectContaining({
            id: "techtree.authenticated.probe",
            status: "ok",
          }),
        ]),
      }),
    );
  });
});
