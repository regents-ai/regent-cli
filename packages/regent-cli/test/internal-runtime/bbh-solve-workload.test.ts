import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { solveBbhWorkspace } from "../../src/internal-runtime/workloads/bbh-solve.js";

const tempRoots: string[] = [];

const makeTempDir = async (prefix: string): Promise<string> => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempRoots.push(dir);
  return dir;
};

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((target) => fs.rm(target, { recursive: true, force: true })));
});

const baseConfig = (root: string) =>
  ({
    agents: {
      harnesses: {
        hermes: {
          workspaceRoot: path.join(root, "workspaces", "hermes"),
          entrypoint: "hermes",
        },
        openclaw: {
          workspaceRoot: path.join(root, "workspaces", "openclaw"),
          entrypoint: "openclaw",
        },
      },
    },
    workloads: {
      bbh: {
        workspaceRoot: path.join(root, "workspaces", "bbh"),
      },
    },
  }) as any;

const baseMetadata = {
  resolved_at: "2026-04-03T00:00:00.000Z",
  executor_harness: { kind: "hermes", profile: "bbh", entrypoint: "hermes" },
  origin: { kind: "local", transport: "api", session_id: null, trigger_ref: null },
  executor_harness_kind: "hermes",
  executor_harness_profile: "bbh",
  origin_session_id: null,
} as const;

const defaultRunPaths = {
  analysis_path: "analysis.py",
  verdict_path: "outputs/verdict.json",
  final_answer_path: "final_answer.md",
  report_path: "outputs/report.html",
  log_path: "outputs/run.log",
  genome_path: "genome.source.yaml",
  search_config_path: "search.config.yaml",
  evaluator_path: "eval/hypotest_skydiscover.py",
  seed_program_path: "solver/initial_program.py",
  best_program_path: "outputs/skydiscover/best_program.py",
  search_summary_path: "outputs/skydiscover/search_summary.json",
  evaluator_artifacts_path: "outputs/skydiscover/evaluator_artifacts.json",
  checkpoint_pointer_path: "outputs/skydiscover/latest_checkpoint.txt",
  best_solution_patch_path: "outputs/skydiscover/best_solution.patch",
  search_log_path: "outputs/skydiscover/search.log",
} as const;

const seedWorkspace = async (
  workspacePath: string,
  runPathOverrides: Partial<typeof defaultRunPaths> = {},
): Promise<void> => {
  const runPaths = { ...defaultRunPaths, ...runPathOverrides };
  await fs.mkdir(path.join(workspacePath, "data"), { recursive: true });
  await Promise.all(
    [
      runPaths.analysis_path,
      runPaths.verdict_path,
      runPaths.final_answer_path,
      runPaths.report_path,
      runPaths.log_path,
      runPaths.genome_path,
      runPaths.search_config_path,
      runPaths.evaluator_path,
      runPaths.seed_program_path,
      runPaths.best_program_path,
      runPaths.search_summary_path,
      runPaths.evaluator_artifacts_path,
      runPaths.checkpoint_pointer_path,
      runPaths.best_solution_patch_path,
      runPaths.search_log_path,
      "task.json",
      "protocol.md",
      "rubric.json",
      "dist/.keep",
    ].map((relativePath) => fs.mkdir(path.join(workspacePath, path.dirname(relativePath)), { recursive: true })),
  );
  await fs.writeFile(
    path.join(workspacePath, runPaths.genome_path),
    JSON.stringify({
      schema_version: "techtree.bbh.genome-source.v1",
      model_id: "gpt-test",
      harness_type: "hermes",
      harness_version: "1.0.0",
      prompt_pack_version: "bbh-v0.1",
      skill_pack_version: "techtree-bbh-v0.1",
      tool_profile: "bbh",
      runtime_image: "local",
    }),
    "utf8",
  );
  await fs.writeFile(
    path.join(workspacePath, "run.source.yaml"),
    JSON.stringify({
      schema_version: "techtree.bbh.run-source.v1",
      artifact_ref: "capsule_1",
      executor: {
        type: "genome",
        id: "gen_1",
        harness: "hermes",
        harness_version: "1.0.0",
        profile: "bbh",
      },
      solver: { kind: "hermes", entrypoint: "hermes" },
      evaluator: {
        kind: "hypotest",
        dataset_ref: "provider/capsule_1",
        benchmark_ref: "capsule_1",
        scorer_version: "hypotest-v1",
      },
      instance: { instance_ref: "capsule_1" },
      paths: runPaths,
      bbh: { split: "climb", provider: "bbh_train" },
    }),
    "utf8",
  );
  await fs.writeFile(
    path.join(workspacePath, runPaths.search_config_path),
    JSON.stringify({
      schema_version: "techtree.bbh.search-config.v1",
      solver: { kind: "hermes", entrypoint: "hermes" },
      search: { algorithm: "hermes", summary: null },
      evaluator: {
        kind: "hypotest",
        dataset_ref: "provider/capsule_1",
        benchmark_ref: "capsule_1",
        scorer_version: "hypotest-v1",
      },
    }),
    "utf8",
  );
  await fs.writeFile(path.join(workspacePath, "task.json"), JSON.stringify({ objective: "solve" }), "utf8");
  await fs.writeFile(path.join(workspacePath, "protocol.md"), "1. Solve it\n", "utf8");
  await fs.writeFile(path.join(workspacePath, "rubric.json"), JSON.stringify({ items: [] }), "utf8");
  await fs.writeFile(path.join(workspacePath, runPaths.analysis_path), "print('analysis')\n", "utf8");
  await fs.writeFile(path.join(workspacePath, runPaths.evaluator_path), "def evaluate():\n    return {}\n", "utf8");
  await fs.writeFile(path.join(workspacePath, runPaths.seed_program_path), "def solve(task):\n    return task\n", "utf8");
  await fs.writeFile(path.join(workspacePath, runPaths.final_answer_path), "", "utf8");
  await fs.writeFile(
    path.join(workspacePath, runPaths.verdict_path),
    JSON.stringify({
      decision: "inconclusive",
      justification: "Pending notebook execution.",
      metrics: { raw_score: 0, normalized_score: 0 },
    }),
    "utf8",
  );
  await fs.writeFile(path.join(workspacePath, runPaths.search_log_path), "", "utf8");
  await fs.writeFile(path.join(workspacePath, runPaths.best_program_path), "def solve(task):\n    return task\n", "utf8");
  await fs.writeFile(path.join(workspacePath, runPaths.evaluator_artifacts_path), JSON.stringify({}), "utf8");
  await fs.writeFile(path.join(workspacePath, runPaths.checkpoint_pointer_path), "", "utf8");
  await fs.writeFile(path.join(workspacePath, runPaths.best_solution_patch_path), "", "utf8");
  await fs.writeFile(
    path.join(workspacePath, runPaths.search_summary_path),
    JSON.stringify({
      best_score: 0,
      best_iteration: 0,
      iterations_requested: 1,
      iterations_completed: 0,
      total_evaluations: 0,
      elapsed_ms: 0,
      artifact_keys: [],
    }),
    "utf8",
  );
  await fs.writeFile(path.join(workspacePath, "data", "sample.txt"), "sample\n", "utf8");
};

describe("bbh solve workload", () => {
  it("solves a workspace through an isolated harness copy and syncs back only allowed files", async () => {
    const root = await makeTempDir("bbh-solve-success-");
    const workspace = path.join(root, "run-1");
    await seedWorkspace(workspace);

    const response = await solveBbhWorkspace(
      baseConfig(root),
      { workspace_path: workspace, solver: "hermes", timeout_seconds: 30 },
      baseMetadata,
      {
        runSolver: async ({ workspacePath, logPath }) => {
          await fs.writeFile(path.join(workspacePath, "analysis.py"), "print('improved')\n", "utf8");
          await fs.writeFile(path.join(workspacePath, "final_answer.md"), "Solved in plain English.\n", "utf8");
          await fs.writeFile(
            path.join(workspacePath, "outputs", "verdict.json"),
            JSON.stringify({
              decision: "support",
              justification: "Evidence supports the claim.",
              metrics: { raw_score: 0.8, normalized_score: 0.9 },
            }),
            "utf8",
          );
          await fs.writeFile(path.join(workspacePath, "outputs", "report.html"), "<html>ok</html>\n", "utf8");
          await fs.writeFile(path.join(workspacePath, "outputs", "skydiscover", "search.log"), "search log\n", "utf8");
          await fs.writeFile(
            path.join(workspacePath, "outputs", "skydiscover", "search_summary.json"),
            JSON.stringify({
              best_score: 0.9,
              best_iteration: 1,
              iterations_requested: 1,
              iterations_completed: 1,
              total_evaluations: 1,
              elapsed_ms: 50,
              artifact_keys: [],
            }),
            "utf8",
          );
          await fs.writeFile(logPath, "solver log\n", "utf8");
          return { exitCode: 0 };
        },
      },
    );

    expect(response.solver).toBe("hermes");
    expect(response.verdict_summary).toEqual({
      decision: "support",
      raw_score: 0.8,
      normalized_score: 0.9,
    });
    expect(response.produced_files).toEqual(
      expect.arrayContaining([
        "analysis.py",
        "final_answer.md",
        "outputs/verdict.json",
        "outputs/report.html",
        "outputs/run.log",
        "outputs/skydiscover/search.log",
        "outputs/skydiscover/search_summary.json",
        "run.source.yaml",
        "search.config.yaml",
      ]),
    );
    expect(await fs.readFile(path.join(workspace, "analysis.py"), "utf8")).toContain("improved");
    expect(await fs.readFile(path.join(workspace, "final_answer.md"), "utf8")).toContain("Solved");
    expect(await fs.readFile(path.join(workspace, "outputs", "run.log"), "utf8")).toContain("solver log");
    expect(await fs.readFile(path.join(workspace, "outputs", "skydiscover", "search.log"), "utf8")).toContain("search log");
    expect(await fs.readFile(path.join(workspace, "protocol.md"), "utf8")).toBe("1. Solve it\n");

    const runSource = JSON.parse(await fs.readFile(path.join(workspace, "run.source.yaml"), "utf8"));
    expect(runSource.solver).toEqual({ kind: "hermes", entrypoint: "hermes" });
    expect(runSource.search).toBeUndefined();
    expect(runSource.score).toEqual({ raw: 0.8, normalized: 0.9, scorer_version: "hypotest-v1" });
  });

  it("routes skydiscover through the uv-based BBH Python path", async () => {
    const root = await makeTempDir("bbh-solve-skydiscover-");
    const workspace = path.join(root, "run-skydiscover");
    await seedWorkspace(workspace);

    const response = await solveBbhWorkspace(
      baseConfig(root),
      { workspace_path: workspace, solver: "skydiscover", timeout_seconds: 30 },
      baseMetadata,
      {
        runSolver: async ({ solver, entrypoint, workspacePath, logPath }) => {
          expect(solver).toBe("skydiscover");
          expect(entrypoint).toBe("uv");
          expect(workspacePath).toContain("bbh-solve");
          await fs.writeFile(path.join(workspacePath, "final_answer.md"), "Solved with SkyDiscover.\n", "utf8");
          await fs.writeFile(
            path.join(workspacePath, "outputs", "verdict.json"),
            JSON.stringify({
              decision: "support",
              justification: "SkyDiscover produced a valid answer.",
              metrics: { raw_score: 0.5, normalized_score: 0.75 },
            }),
            "utf8",
          );
          await fs.writeFile(
            path.join(workspacePath, "outputs", "skydiscover", "search_summary.json"),
            JSON.stringify({
              best_score: 0.75,
              best_iteration: 1,
              iterations_requested: 1,
              iterations_completed: 1,
              total_evaluations: 1,
              elapsed_ms: 60,
              artifact_keys: [],
            }),
            "utf8",
          );
          await fs.writeFile(path.join(workspacePath, "outputs", "skydiscover", "search.log"), "SkyDiscover log\n", "utf8");
          await fs.writeFile(logPath, "SkyDiscover log\n", "utf8");
          return { exitCode: 0 };
        },
      },
    );

    expect(response.solver).toBe("skydiscover");
    expect(response.produced_files).toEqual(
      expect.arrayContaining([
        "outputs/skydiscover/search.log",
        "outputs/skydiscover/search_summary.json",
        "run.source.yaml",
        "search.config.yaml",
      ]),
    );

    const runSource = JSON.parse(await fs.readFile(path.join(workspace, "run.source.yaml"), "utf8"));
    expect(runSource.solver).toEqual({ kind: "skydiscover", entrypoint: "uv" });
    expect(runSource.search).toEqual(
      expect.objectContaining({
        algorithm: "skydiscover",
        summary: expect.objectContaining({ best_score: 0.75, iterations_completed: 1 }),
      }),
    );
  });

  it("honors per-capsule path overrides and shows the isolated working path in the solve prompt", async () => {
    const root = await makeTempDir("bbh-solve-overrides-");
    const workspace = path.join(root, "run-overrides");
    const overriddenPaths = {
      analysis_path: "workspace/analysis.custom.py",
      verdict_path: "artifacts/verdict.custom.json",
      final_answer_path: "artifacts/final.custom.md",
      report_path: "artifacts/report.custom.html",
      log_path: "logs/solver.custom.log",
      genome_path: "inputs/genome.custom.yaml",
      search_config_path: "config/search.custom.yaml",
      evaluator_path: "eval/custom_hypotest.py",
      seed_program_path: "solver/custom_initial.py",
      best_program_path: "artifacts/search/best.custom.py",
      search_summary_path: "artifacts/search/summary.custom.json",
      evaluator_artifacts_path: "artifacts/search/evaluator.custom.json",
      checkpoint_pointer_path: "artifacts/search/checkpoint.custom.txt",
      best_solution_patch_path: "artifacts/search/best.custom.patch",
      search_log_path: "artifacts/search/log.custom.txt",
    } as const;
    await seedWorkspace(workspace, overriddenPaths);

    const response = await solveBbhWorkspace(
      baseConfig(root),
      { workspace_path: workspace, solver: "hermes", timeout_seconds: 30 },
      baseMetadata,
      {
        runSolver: async ({ workspacePath, prompt, logPath }) => {
          expect(prompt).toContain(`Isolated working path: ${workspacePath}`);
          expect(prompt).toContain("- workspace/analysis.custom.py");
          expect(prompt).toContain("- artifacts/verdict.custom.json");
          expect(prompt).toContain("- artifacts/search/summary.custom.json");
          await fs.writeFile(path.join(workspacePath, overriddenPaths.analysis_path), "print('custom analysis')\n", "utf8");
          await fs.writeFile(path.join(workspacePath, overriddenPaths.final_answer_path), "Solved from the isolated folder.\n", "utf8");
          await fs.writeFile(
            path.join(workspacePath, overriddenPaths.verdict_path),
            JSON.stringify({
              decision: "support",
              justification: "Custom paths worked.",
              metrics: { raw_score: 0.7, normalized_score: 0.8 },
            }),
            "utf8",
          );
          await fs.writeFile(
            path.join(workspacePath, overriddenPaths.search_summary_path),
            JSON.stringify({
              best_score: 0.8,
              best_iteration: 1,
              iterations_requested: 1,
              iterations_completed: 1,
              total_evaluations: 1,
              elapsed_ms: 25,
              artifact_keys: [],
            }),
            "utf8",
          );
          await fs.writeFile(path.join(workspacePath, overriddenPaths.search_log_path), "custom search log\n", "utf8");
          await fs.writeFile(logPath, "custom solver log\n", "utf8");
          return { exitCode: 0 };
        },
      },
    );

    expect(response.produced_files).toEqual(
      expect.arrayContaining([
        "workspace/analysis.custom.py",
        "artifacts/final.custom.md",
        "artifacts/verdict.custom.json",
        "logs/solver.custom.log",
        "artifacts/search/log.custom.txt",
        "artifacts/search/summary.custom.json",
        "run.source.yaml",
        "config/search.custom.yaml",
      ]),
    );
    expect(await fs.readFile(path.join(workspace, overriddenPaths.analysis_path), "utf8")).toContain("custom analysis");
    expect(await fs.readFile(path.join(workspace, overriddenPaths.final_answer_path), "utf8")).toContain("Solved from the isolated folder.");
    expect(await fs.readFile(path.join(workspace, overriddenPaths.log_path), "utf8")).toContain("custom solver log");
    expect(await fs.readFile(path.join(workspace, overriddenPaths.search_log_path), "utf8")).toContain("custom search log");
  });

  it("fails clearly when a required scaffold file is missing", async () => {
    const root = await makeTempDir("bbh-solve-missing-");
    const workspace = path.join(root, "run-2");
    await seedWorkspace(workspace);
    await fs.rm(path.join(workspace, "rubric.json"));

    await expect(
      solveBbhWorkspace(baseConfig(root), { workspace_path: workspace }, baseMetadata, {
        runSolver: async () => ({ exitCode: 0 }),
      }),
    ).rejects.toThrow("missing required solver input: rubric.json");
  });

  it("rejects runs that modify protected workspace inputs", async () => {
    const root = await makeTempDir("bbh-solve-protected-");
    const workspace = path.join(root, "run-3");
    await seedWorkspace(workspace);

    await expect(
      solveBbhWorkspace(baseConfig(root), { workspace_path: workspace, solver: "hermes" }, baseMetadata, {
        runSolver: async ({ workspacePath, logPath }) => {
          await fs.writeFile(path.join(workspacePath, "protocol.md"), "tampered\n", "utf8");
          await fs.writeFile(path.join(workspacePath, "final_answer.md"), "Solved.\n", "utf8");
          await fs.writeFile(
            path.join(workspacePath, "outputs", "verdict.json"),
            JSON.stringify({
              decision: "support",
              justification: "Tampered protocol.",
              metrics: { raw_score: 1, normalized_score: 1 },
            }),
            "utf8",
          );
          await fs.writeFile(path.join(workspacePath, "outputs", "search.log"), "tampered\n", "utf8");
          await fs.writeFile(logPath, "tampered\n", "utf8");
          return { exitCode: 0 };
        },
      }),
    ).rejects.toThrow("solver modified protected workspace inputs");
  });

  it("rejects invalid solver outputs", async () => {
    const root = await makeTempDir("bbh-solve-invalid-");
    const workspace = path.join(root, "run-4");
    await seedWorkspace(workspace);

    await expect(
      solveBbhWorkspace(baseConfig(root), { workspace_path: workspace, solver: "hermes" }, baseMetadata, {
        runSolver: async ({ workspacePath, logPath }) => {
          await fs.writeFile(path.join(workspacePath, defaultRunPaths.final_answer_path), "", "utf8");
          await fs.writeFile(path.join(workspacePath, defaultRunPaths.verdict_path), "{bad json", "utf8");
          await fs.writeFile(path.join(workspacePath, "dist", "search-summary.json"), "{bad json", "utf8");
          await fs.writeFile(logPath, "broken\n", "utf8");
          return { exitCode: 0 };
        },
      }),
    ).rejects.toThrow("missing required solver output: final_answer.md");
  });
});
