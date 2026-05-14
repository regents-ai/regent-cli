import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { RegentConfig } from "../../src/internal-types/index.js";
import { cliConnectionArgs, cliConnectionEnv } from "../../src/internal-runtime/xmtp/cli-adapter.js";

const tempDirs: string[] = [];

const makeConfig = (): RegentConfig["xmtp"] => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "regent-xmtp-cli-"));
  tempDirs.push(tempDir);

  const walletKeyPath = path.join(tempDir, "wallet.key");
  const dbEncryptionKeyPath = path.join(tempDir, "db.key");
  fs.writeFileSync(walletKeyPath, "wallet-secret\n", { mode: 0o600 });
  fs.writeFileSync(dbEncryptionKeyPath, "database-secret\n", { mode: 0o600 });

  return {
    enabled: true,
    env: "production",
    dbPath: path.join(tempDir, "client.db"),
    dbEncryptionKeyPath,
    walletKeyPath,
    ownerInboxIds: [],
    trustedInboxIds: [],
    profiles: {
      owner: "full",
      public: "messaging",
      group: "messaging",
    },
    publicPolicyPath: path.join(tempDir, "xmtp-public.md"),
  };
};

describe("XMTP CLI adapter", () => {
  afterEach(() => {
    for (const tempDir of tempDirs.splice(0)) {
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it("keeps XMTP secret material out of process arguments", () => {
    const config = makeConfig();

    expect(cliConnectionArgs(config)).toEqual([
      "--env",
      "production",
      "--db-path",
      config.dbPath,
      "--log-level",
      "off",
    ]);
    expect(cliConnectionArgs(config)).not.toContain("wallet-secret");
    expect(cliConnectionArgs(config)).not.toContain("database-secret");
  });

  it("passes XMTP secret material through the helper environment", () => {
    const config = makeConfig();

    expect(cliConnectionEnv(config)).toMatchObject({
      NO_COLOR: "1",
      XMTP_WALLET_KEY: "wallet-secret",
      XMTP_DB_ENCRYPTION_KEY: "database-secret",
    });
  });
});
