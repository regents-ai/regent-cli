import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import YAML from "yaml";

import { loadBenchmarkAttemptPayload } from "../../src/internal-runtime/workloads/benchmarks.js";

const tempDirs: string[] = [];

const makeTempDir = async (): Promise<string> => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "benchmark-workload-"));
  tempDirs.push(dir);
  return dir;
};

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("benchmark workload payloads", () => {
  it("builds run submit payloads from the current Techtree create contract", async () => {
    const workspace = await makeTempDir();
    await fs.mkdir(path.join(workspace, "artifacts"), { recursive: true });
    await fs.writeFile(path.join(workspace, "answer.md"), "The benchmark answer.\n", "utf8");
    await fs.writeFile(path.join(workspace, "artifacts", "trace.json"), "{\"ok\":true}\n", "utf8");
    await fs.writeFile(
      path.join(workspace, "run.yaml"),
      YAML.stringify({
        capsule_id: "bench_alpha",
        version_id: "benchv_alpha",
        repeat_group_id: "repeat_alpha",
        attempt_ordinal: 2,
        score_status: "pending",
        raw_score: 0.75,
        normalized_score: 0.8,
        solved: true,
        answer_hash: "answer-a",
        verdict_json: { status: "pending_review" },
        runtime_seconds: 12,
        cost_usd_micros: 34,
        workspace_source: { runner: "local" },
        harness: {
          harness_id: "harness_alpha",
          name: "Local runner",
          runner_kind: "custom_local",
          harness_version: "v1",
          normalized_bundle_hash: "bundle_alpha",
        },
      }),
      "utf8",
    );

    const payload = await loadBenchmarkAttemptPayload(workspace);

    expect(payload).toMatchObject({
      capsule_id: "bench_alpha",
      version_id: "benchv_alpha",
      harness_id: "harness_alpha",
      repeat_group_id: "repeat_alpha",
      attempt_ordinal: 2,
      answer_text: "The benchmark answer.\n",
      answer_hash: "answer-a",
      verdict_json: { status: "pending_review" },
      run_source: { harness_bundle_hash: "bundle_alpha" },
    });
  });
});
