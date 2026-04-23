import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  handleTechtreeScienceTasksExport,
  handleTechtreeScienceTasksInit,
  handleTechtreeScienceTasksReviewLoop,
  handleTechtreeScienceTasksReviewUpdate,
  handleTechtreeScienceTasksSubmit,
} from "../../src/internal-runtime/handlers/techtree.js";
import {
  initScienceTaskWorkspace,
  loadScienceTaskChecklistPayload,
  loadScienceTaskEvidencePayload,
  readScienceTaskWorkspaceMetadata,
  runScienceTaskReviewLoop,
  type ScienceTaskHermesRunner,
  writeScienceTaskWorkspaceMetadata,
} from "../../src/internal-runtime/workloads/science-tasks.js";

const tempRoots: string[] = [];

const makeTempDir = async (prefix: string): Promise<string> => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempRoots.push(dir);
  return dir;
};

const hermesHarness = {
  enabled: true,
  entrypoint: "hermes",
  workspaceRoot: "/tmp",
  profiles: [],
};

const buildReviewLoopOutput = (
  checklistKeys: string[],
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  schema_version: "techtree.science-task.harbor-review-loop.v1",
  checklist: Object.fromEntries(checklistKeys.map((key) => [key, { status: "pass" }])),
  oracle_run: {
    command: "harbor run oracle",
    summary: "Oracle passed the task.",
    key_lines: ["oracle ok"],
  },
  frontier_run: {
    command: "harbor run frontier",
    summary: "Frontier missed the required output.",
    key_lines: ["frontier failed expected check"],
  },
  failure_analysis: "Frontier missed a required output while the task remained clear and reproducible.",
  review: {
    harbor_pr_url: "https://harbor.example/pr/905",
    latest_review_follow_up_note: "All reviewer concerns are answered with current evidence.",
    open_reviewer_concerns_count: 0,
    any_concern_unanswered: false,
    latest_rerun_after_latest_fix: true,
    latest_fix_at: "2026-04-20T12:00:00.000Z",
    last_rerun_at: "2026-04-20T13:00:00.000Z",
  },
  ...overrides,
});

const prepareLinkedWorkspace = async (prefix = "science-task-review-loop-"): Promise<{
  workspace: string;
  checklistKeys: string[];
}> => {
  const workspace = await makeTempDir(prefix);

  await initScienceTaskWorkspace(workspace, {
    title: "Review loop task",
    science_domain: "life-sciences",
    science_field: "biology",
    task_slug: "review-loop-task",
  });

  const metadata = await readScienceTaskWorkspaceMetadata(workspace);
  await writeScienceTaskWorkspaceMetadata(workspace, {
    ...metadata,
    node_id: 905,
  });

  return { workspace, checklistKeys: Object.keys(metadata.checklist) };
};

const writingHermesRunner = (
  outputFactory: (invocation: Parameters<ScienceTaskHermesRunner>[0]) => Record<string, unknown>,
): ScienceTaskHermesRunner => async (invocation) => {
  await fs.writeFile(invocation.output_path, `${JSON.stringify(outputFactory(invocation), null, 2)}\n`, "utf8");
  await fs.writeFile(invocation.log_path, "Hermes review loop completed.\n", "utf8");
  return { exitCode: 0 };
};

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((target) => fs.rm(target, { recursive: true, force: true })));
});

describe("science-task workspace flows", () => {
  it("initializes a workspace and stores the linked Techtree task id", async () => {
    const workspace = await makeTempDir("science-task-init-");

    const result = await handleTechtreeScienceTasksInit(
      {
        techtree: {
          createScienceTask: async () => ({
            data: {
              node_id: 777,
              workflow_state: "authoring",
              packet_hash: "sha256:init-777",
              export_target_path: "tasks/life-sciences/biology/cell-atlas-benchmark",
            },
          }),
        },
      } as any,
      {
        workspace_path: workspace,
        title: "Cell atlas benchmark",
        science_domain: "life-sciences",
        science_field: "biology",
        task_slug: "cell-atlas-benchmark",
        claimed_expert_time: "2 hours",
      },
    );

    const metadata = await readScienceTaskWorkspaceMetadata(workspace);

    expect(result.node_id).toBe(777);
    expect(result.files).toContain("instruction.md");
    expect(result.files).toContain("environment/Dockerfile");
    expect(result.files).toContain("tests/test.sh");
    expect(result.files).toContain("science-task.json");
    expect(metadata.node_id).toBe(777);
    expect(metadata.task_slug).toBe("cell-atlas-benchmark");
    expect(await fs.readFile(path.join(workspace, "environment", "Dockerfile"), "utf8")).toContain(
      "python:3.12-slim",
    );
    expect(await fs.readFile(path.join(workspace, "tests", "test.sh"), "utf8")).toContain(
      "pytest tests/test_task.py",
    );
    expect((await fs.stat(path.join(workspace, "tests", "test.sh"))).mode & 0o111).toBeTruthy();
  });

  it("fails clearly when checklist or evidence payloads are incomplete", async () => {
    const checklistWorkspace = await makeTempDir("science-task-checklist-");
    await initScienceTaskWorkspace(checklistWorkspace, {
      title: "Checklist task",
      science_domain: "life-sciences",
      science_field: "biology",
      task_slug: "checklist-task",
    });

    await expect(loadScienceTaskChecklistPayload(checklistWorkspace)).rejects.toThrow(
      "science task workspace is not linked to a Techtree task yet",
    );

    const evidenceWorkspace = await makeTempDir("science-task-evidence-");
    await initScienceTaskWorkspace(evidenceWorkspace, {
      title: "Evidence task",
      science_domain: "life-sciences",
      science_field: "biology",
      task_slug: "evidence-task",
    });

    const metadata = await readScienceTaskWorkspaceMetadata(evidenceWorkspace);
    await writeScienceTaskWorkspaceMetadata(evidenceWorkspace, {
      ...metadata,
      node_id: 902,
    });

    await expect(loadScienceTaskEvidencePayload(evidenceWorkspace)).rejects.toThrow(
      "science task workspace is missing oracle or frontier evidence",
    );
  });

  it("exports the task packet into the expected folder layout", async () => {
    const workspace = await makeTempDir("science-task-export-");
    const outputPath = path.join(workspace, "dist", "manual-export");

    await initScienceTaskWorkspace(workspace, {
      title: "Export task",
      science_domain: "life-sciences",
      science_field: "biology",
      task_slug: "export-task",
    });

    const metadata = await readScienceTaskWorkspaceMetadata(workspace);
    await writeScienceTaskWorkspaceMetadata(workspace, {
      ...metadata,
      node_id: 903,
    });

    const result = await handleTechtreeScienceTasksExport(
      {
        techtree: {
          getScienceTask: async () => ({
            data: {
              node_id: 903,
              title: "Export task",
              summary: "Export summary",
              science_domain: "life-sciences",
              science_field: "biology",
              task_slug: "export-task",
              workflow_state: "submitted",
              export_target_path: "tasks/life-sciences/biology/export-task",
              harbor_pr_url: "https://harbor.example/pr/903",
              review_round_count: 1,
              open_reviewer_concerns_count: 0,
              current_files_match_latest_evidence: true,
              latest_rerun_after_latest_fix: true,
              inserted_at: "2026-04-20T00:00:00.000Z",
              updated_at: "2026-04-20T00:00:00.000Z",
              node: null,
              structured_output_shape: null,
              claimed_expert_time: "2 hours",
              threshold_rationale: "Thresholds are documented.",
              anti_cheat_notes: "Hidden answers stay outside the packet.",
              reproducibility_notes: "Pinned dependencies keep reruns stable.",
              dependency_pinning_status: "Pinned",
              canary_status: "Present",
              destination_name: "harbor",
              packet_hash: "sha256:packet-903",
              evidence_packet_hash: "sha256:evidence-903",
              packet_files: {
                "instruction.md": {
                  encoding: "utf8",
                  content: "# Export task\n",
                },
                "tests/test_task.py": {
                  encoding: "utf8",
                  content: "def test_task():\n    assert True\n",
                },
              },
              checklist: {
                instruction_and_tests_match: {
                  status: "pass",
                },
              },
              oracle_run: {
                command: "uv run oracle",
                summary: "Oracle passes",
              },
              frontier_run: {
                command: "uv run frontier",
                summary: "Frontier misses one required field",
              },
              failure_analysis: "Frontier misses one required field.",
              latest_review_follow_up_note: "Ready for merge",
              last_rerun_at: "2026-04-20T13:00:00.000Z",
              latest_fix_at: "2026-04-20T12:00:00.000Z",
              any_concern_unanswered: false,
            },
          }),
        },
      } as any,
      {
        workspace_path: workspace,
        output_path: outputPath,
      },
    );

    expect(result.output_path).toBe(outputPath);
    expect(result.files).toContain("instruction.md");
    expect(result.files).toContain("tests/test_task.py");
    expect(result.files).toContain("techtree-review-sheet.md");
    expect(result.files).toContain("techtree-evidence.md");
    expect(await fs.readFile(path.join(outputPath, "instruction.md"), "utf8")).toContain("Export task");
    expect(await fs.readFile(path.join(outputPath, "techtree-submission-checklist.md"), "utf8")).toContain(
      "https://harbor.example/pr/903",
    );
  });

  it("persists review metadata after submit and review-update", async () => {
    const workspace = await makeTempDir("science-task-review-");

    await initScienceTaskWorkspace(workspace, {
      title: "Review task",
      science_domain: "life-sciences",
      science_field: "biology",
      task_slug: "review-task",
    });

    const metadata = await readScienceTaskWorkspaceMetadata(workspace);
    await writeScienceTaskWorkspaceMetadata(workspace, {
      ...metadata,
      node_id: 904,
    });

    await handleTechtreeScienceTasksSubmit(
      {
        techtree: {
          submitScienceTask: async () => ({
            data: {
              node_id: 904,
              workflow_state: "submitted",
              packet_hash: "sha256:submit-904",
              export_target_path: "tasks/life-sciences/biology/review-task",
            },
          }),
          reviewUpdateScienceTask: async () => ({
            data: {
              node_id: 904,
              workflow_state: "merge_ready",
              packet_hash: "sha256:review-904",
              export_target_path: "tasks/life-sciences/biology/review-task",
            },
          }),
        },
      } as any,
      {
        workspace_path: workspace,
        harbor_pr_url: "https://harbor.example/pr/904",
        latest_review_follow_up_note: "Sent back after submit",
      },
    );

    await handleTechtreeScienceTasksReviewUpdate(
      {
        techtree: {
          submitScienceTask: async () => ({
            data: {
              node_id: 904,
              workflow_state: "submitted",
              packet_hash: "sha256:submit-904",
              export_target_path: "tasks/life-sciences/biology/review-task",
            },
          }),
          reviewUpdateScienceTask: async () => ({
            data: {
              node_id: 904,
              workflow_state: "merge_ready",
              packet_hash: "sha256:review-904",
              export_target_path: "tasks/life-sciences/biology/review-task",
            },
          }),
        },
      } as any,
      {
        workspace_path: workspace,
        harbor_pr_url: "https://harbor.example/pr/904",
        latest_review_follow_up_note: "All reviewer comments addressed",
        open_reviewer_concerns_count: 0,
        any_concern_unanswered: false,
        latest_rerun_after_latest_fix: true,
        latest_fix_at: "2026-04-20T12:00:00.000Z",
        last_rerun_at: "2026-04-20T13:00:00.000Z",
      },
    );

    const persisted = await readScienceTaskWorkspaceMetadata(workspace);

    expect(persisted.harbor_pr_url).toBe("https://harbor.example/pr/904");
    expect(persisted.latest_review_follow_up_note).toBe("All reviewer comments addressed");
    expect(persisted.open_reviewer_concerns_count).toBe(0);
    expect(persisted.any_concern_unanswered).toBe(false);
    expect(persisted.latest_rerun_after_latest_fix).toBe(true);
    expect(persisted.latest_fix_at).toBe("2026-04-20T12:00:00.000Z");
    expect(persisted.last_rerun_at).toBe("2026-04-20T13:00:00.000Z");
  });

  it("runs the Hermes review loop, stores the review file, and syncs Techtree in order", async () => {
    const { workspace, checklistKeys } = await prepareLinkedWorkspace();
    const calls: string[] = [];

    const result = await handleTechtreeScienceTasksReviewLoop(
      {
        config: {
          agents: {
            harnesses: {
              hermes: hermesHarness,
            },
          },
        },
        techtree: {
          updateScienceTaskChecklist: async () => {
            calls.push("checklist");
            return { data: { workflow_state: "checklist_ready" } };
          },
          updateScienceTaskEvidence: async () => {
            calls.push("evidence");
            return { data: { workflow_state: "evidence_ready" } };
          },
          submitScienceTask: async () => {
            calls.push("submit");
            return { data: { workflow_state: "submitted" } };
          },
          reviewUpdateScienceTask: async () => {
            calls.push("review-update");
            return { data: { workflow_state: "merge_ready" } };
          },
        },
      } as any,
      {
        workspace_path: workspace,
        harbor_pr_url: "https://harbor.example/pr/905",
        timeout_seconds: 60,
        runner: writingHermesRunner(() => buildReviewLoopOutput(checklistKeys)),
      },
    );

    const metadata = await readScienceTaskWorkspaceMetadata(workspace);

    expect(calls).toEqual(["checklist", "evidence", "submit", "review-update"]);
    expect(result.workflow_state).toBe("merge_ready");
    expect(result.output_path).toBe(path.join(workspace, "dist", "harbor-review-loop.json"));
    expect(result.log_path).toContain(path.join(workspace, "dist", "harbor-review-loop"));
    expect(metadata.harbor_pr_url).toBe("https://harbor.example/pr/905");
    expect(metadata.oracle_run?.command).toBe("harbor run oracle");
    expect(metadata.frontier_run?.command).toBe("harbor run frontier");
    expect(metadata.open_reviewer_concerns_count).toBe(0);
  });

  it("does not sync Techtree when Hermes fails", async () => {
    const { workspace } = await prepareLinkedWorkspace("science-task-review-loop-fail-");
    const calls: string[] = [];

    await expect(
      handleTechtreeScienceTasksReviewLoop(
        {
          config: {
            agents: {
              harnesses: {
                hermes: hermesHarness,
              },
            },
          },
          techtree: {
            updateScienceTaskChecklist: async () => {
              calls.push("checklist");
              return { data: { workflow_state: "checklist_ready" } };
            },
          },
        } as any,
        {
          workspace_path: workspace,
          harbor_pr_url: "https://harbor.example/pr/905",
          runner: async () => ({ exitCode: 2 }),
        },
      ),
    ).rejects.toThrow("Hermes review loop failed with exit code 2");

    expect(calls).toEqual([]);
  });

  it.each([
    {
      name: "missing output JSON",
      runner: async () => ({ exitCode: 0 }),
      message: "Hermes did not write dist/harbor-review-loop.json",
    },
    {
      name: "malformed JSON",
      runner: async (invocation: Parameters<ScienceTaskHermesRunner>[0]) => {
        await fs.writeFile(invocation.output_path, "{", "utf8");
        return { exitCode: 0 };
      },
      message: "Hermes wrote malformed review-loop JSON",
    },
    {
      name: "invalid checklist status",
      output: (keys: string[]) =>
        buildReviewLoopOutput(keys, {
          checklist: Object.fromEntries(keys.map((key, index) => [key, { status: index === 0 ? "done" : "pass" }])),
        }),
      message: "invalid checklist status",
    },
    {
      name: "invalid evidence run",
      output: (keys: string[]) =>
        buildReviewLoopOutput(keys, {
          oracle_run: {
            command: "harbor run oracle",
            key_lines: ["missing summary"],
          },
        }),
      message: "invalid summary",
    },
    {
      name: "invalid review timestamp",
      output: (keys: string[]) =>
        buildReviewLoopOutput(keys, {
          review: {
            harbor_pr_url: "https://harbor.example/pr/905",
            latest_review_follow_up_note: "All reviewer concerns are answered.",
            open_reviewer_concerns_count: 0,
            any_concern_unanswered: false,
            latest_rerun_after_latest_fix: true,
            latest_fix_at: "not-a-date",
            last_rerun_at: "2026-04-20T13:00:00.000Z",
          },
        }),
      message: "invalid latest_fix_at",
    },
  ])("rejects $name before local metadata changes", async (scenario) => {
    const { workspace, checklistKeys } = await prepareLinkedWorkspace("science-task-review-loop-invalid-");
    const before = await readScienceTaskWorkspaceMetadata(workspace);
    const runner =
      "runner" in scenario
        ? scenario.runner
        : writingHermesRunner(() => scenario.output(checklistKeys));

    await expect(
      runScienceTaskReviewLoop({
        workspace_path: workspace,
        harbor_pr_url: "https://harbor.example/pr/905",
        hermes_harness: hermesHarness,
        runner,
      }),
    ).rejects.toThrow(scenario.message);

    expect(await readScienceTaskWorkspaceMetadata(workspace)).toEqual(before);
  });
});
