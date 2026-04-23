import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  buildBbhValidationRequest,
  loadBbhDraftCreateRequest,
  loadBbhDraftProposalRequest,
  loadBbhReviewSubmitRequest,
  loadBbhRunSubmitRequest,
  materializeBbhDraftWorkspace,
  materializeBbhReviewWorkspace,
  materializeBbhWorkspace,
} from "../../src/internal-runtime/workloads/bbh.js";

const tempDirs: string[] = [];

const makeTempDir = async (): Promise<string> => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "bbh-workload-"));
  tempDirs.push(dir);
  return dir;
};

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("BBH workload lanes", () => {
  it("scaffolds a deterministic draft workspace and loads create/proposal payloads", async () => {
    const workspaceRoot = await makeTempDir();
    const workspacePath = path.join(workspaceRoot, "draft-workspace");

    const files = await materializeBbhDraftWorkspace(workspacePath);
    expect(files).toEqual([
      "notebook.py",
      "hypothesis.md",
      "protocol.md",
      "rubric.json",
      "capsule.source.yaml",
      "genome/recommended.source.yaml",
      "genome/notes.md",
    ]);

    await fs.writeFile(path.join(workspacePath, "hypothesis.md"), "Test hypothesis\n", "utf8");
    await fs.writeFile(path.join(workspacePath, "protocol.md"), "1. Test protocol\n", "utf8");
    await fs.writeFile(path.join(workspacePath, "rubric.json"), JSON.stringify({ criteria: ["clarity"] }), "utf8");

    const createRequest = await loadBbhDraftCreateRequest(workspacePath, {
      title: "Draft capsule",
      seed: "BBH",
      parent_id: 42,
    });

    expect(createRequest.title).toBe("Draft capsule");
    expect(createRequest.seed).toBe("BBH");
    expect(createRequest.parent_id).toBe(42);
    expect(createRequest.workspace.hypothesis_md).toContain("Test hypothesis");

    const proposalRequest = await loadBbhDraftProposalRequest(workspacePath, "tightened rubric");
    expect(proposalRequest.summary).toBe("tightened rubric");
    expect(proposalRequest.workspace_manifest_hash).toMatch(/^sha256:/);
    expect(proposalRequest.workspace.rubric_json).toEqual({ criteria: ["clarity"] });
  });

  it("materializes a review workspace and loads a review submission payload", async () => {
    const workspaceRoot = await makeTempDir();
    const workspacePath = path.join(workspaceRoot, "review-workspace");

    const files = await materializeBbhReviewWorkspace(workspacePath, {
      request: {
        request_id: "review_req_test",
        capsule_id: "capsule_draft_test",
        review_kind: "certification",
        visibility: "public_claim",
        state: "claimed",
      },
      capsule: {
        capsule_id: "capsule_draft_test",
        title: "Draft capsule",
        split: "draft",
        workflow_state: "in_review",
        owner_wallet_address: "0x1111111111111111111111111111111111111111",
      },
      workspace: {
        notebook_py: "print('draft')\n",
        hypothesis_md: "Hypothesis",
        protocol_md: "Protocol",
        rubric_json: { criteria: [] },
        capsule_source: { schema_version: "techtree.bbh.capsule-source.v1" },
        recommended_genome_source: { schema_version: "techtree.bbh.genome-recommendation.v1" },
        genome_notes_md: "",
      },
      prior_proposals: [],
      evidence_pack_summary: { evidence: [] },
      checklist_template: { decision: "approve", completeness: true },
      certificate_payload: { kind: "capsule_certificate" },
    });

    expect(files).toEqual([
      "review.request.json",
      "capsule.json",
      "notebook.py",
      "hypothesis.md",
      "protocol.md",
      "rubric.json",
      "genome-recommendation.source.json",
      "prior-proposals.json",
      "evidence-pack.json",
      "review.checklist.json",
      "suggested-edits.json",
      "summary.md",
      "certificate.payload.json",
    ]);

    await fs.writeFile(
      path.join(workspacePath, "review.checklist.json"),
      JSON.stringify({ decision: "approve_with_edits", completeness: true }),
      "utf8",
    );
    await fs.writeFile(
      path.join(workspacePath, "suggested-edits.json"),
      JSON.stringify({ edits: [{ path: "protocol.md", note: "clarify step 1" }] }),
      "utf8",
    );
    await fs.writeFile(path.join(workspacePath, "summary.md"), "Approve with edits.\n", "utf8");

    const request = await loadBbhReviewSubmitRequest(workspacePath);
    expect(request.request_id).toBe("review_req_test");
    expect(request.capsule_id).toBe("capsule_draft_test");
    expect(request.decision).toBe("approve_with_edits");
    expect(request.suggested_edits_json).toEqual({ edits: [{ path: "protocol.md", note: "clarify step 1" }] });
    expect(request.certificate_payload).toEqual({ kind: "capsule_certificate" });
  });

  it("fails clearly when the server omits required review workspace fields", async () => {
    const workspaceRoot = await makeTempDir();
    const workspacePath = path.join(workspaceRoot, "bad-review-workspace");

    await expect(
      materializeBbhReviewWorkspace(workspacePath, {
        request: {
          request_id: "review_req_test",
          capsule_id: "capsule_draft_test",
          review_kind: "certification",
          visibility: "public_claim",
          state: "claimed",
        },
        capsule: {
          capsule_id: "capsule_draft_test",
          title: "Draft capsule",
          split: "draft",
          workflow_state: "in_review",
          owner_wallet_address: "0x1111111111111111111111111111111111111111",
        },
        workspace: {
          notebook_py: undefined as unknown as string,
          hypothesis_md: "Hypothesis",
          protocol_md: "Protocol",
          rubric_json: { criteria: [] },
          capsule_source: { schema_version: "techtree.bbh.capsule-source.v1" },
        },
        prior_proposals: [],
        checklist_template: { decision: "approve" },
      }),
    ).rejects.toThrow("server response missing required workspace field: notebook_py");
  });

  it("materializes artifact.source.yaml with a public BBH lane that submit accepts", async () => {
    const workspaceRoot = await makeTempDir();
    const response = await materializeBbhWorkspace(
      {
        nextBbhAssignment: async () => ({
          data: {
            assignment_ref: "asg_climb",
            split: "climb",
            capsule: {
              capsule_id: "capsule_climb",
              provider: "bbh_train",
              provider_ref: "provider/climb",
              family_ref: null,
              instance_ref: "capsule_climb",
              split: "climb",
              language: "python",
              mode: "fixed",
              assignment_policy: "auto",
              title: "Climb capsule",
              hypothesis: "Climb test capsule",
              protocol_md: "1. Run it",
              rubric_json: { items: [] },
              task_json: { capsule_id: "capsule_climb" },
              data_files: [],
              artifact_source: {
                schema_version: "techtree.bbh.artifact-source.v1",
              },
              execution_defaults: {
                solver: { kind: "hermes", entrypoint: "hermes", search_algorithm: null },
                evaluator: {
                  kind: "hypotest",
                  dataset_ref: "provider/climb",
                  benchmark_ref: "capsule_climb",
                  scorer_version: "hypotest-v0.1",
                },
                workspace: {
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
                },
              },
            },
          },
        }),
      } as any,
      {
        workloads: {
          bbh: {
            workspaceRoot,
          },
        },
      } as any,
      {
        workspace_path: path.join(workspaceRoot, "climb-run"),
        split: "climb",
      },
      {
        resolved_at: "2026-03-21T00:00:00.000Z",
        executor_harness: { kind: "hermes", profile: "bbh", entrypoint: "hermes" },
        origin: { kind: "local", transport: "api", session_id: null, trigger_ref: null },
        executor_harness_kind: "hermes",
        executor_harness_profile: "bbh",
        origin_session_id: null,
      },
    );

    const artifactSource = JSON.parse(
      await fs.readFile(path.join(response.workspace_path, "artifact.source.yaml"), "utf8"),
    ) as Record<string, any>;

    expect(artifactSource.bbh.split).toBe("climb");

    const submitRequest = await loadBbhRunSubmitRequest(response.workspace_path);
    expect(submitRequest.artifact_source?.bbh?.split).toBe("climb");
    expect(submitRequest.run_source.bbh.split).toBe("climb");
    expect(submitRequest.run_source.solver.kind).toBe("hermes");
    expect(submitRequest.run_source.evaluator.kind).toBe("hypotest");
    expect(submitRequest.run_source.paths?.search_summary_path).toBe("outputs/skydiscover/search_summary.json");
    expect(submitRequest.workspace.search_summary_json).toEqual(
      expect.objectContaining({ best_score: 0, iterations_requested: 1 }),
    );
    expect(submitRequest.workspace.search_log).toBe("");
  });

  it("materializes challenge workspaces with the public challenge lane", async () => {
    const workspaceRoot = await makeTempDir();
    const response = await materializeBbhWorkspace(
      {
        nextBbhAssignment: async () => ({
          data: {
            assignment_ref: "asg_challenge",
            split: "challenge",
            capsule: {
              capsule_id: "capsule_challenge",
              provider: "techtree",
              provider_ref: "provider/challenge",
              family_ref: "family_challenge",
              instance_ref: null,
              split: "challenge",
              language: "python",
              mode: "family",
              assignment_policy: "auto_or_select",
              title: "Challenge capsule",
              hypothesis: "Fresh challenge",
              protocol_md: "1. Run it",
              rubric_json: { items: [] },
              task_json: { capsule_id: "capsule_challenge" },
              data_files: [],
              artifact_source: null,
            },
          },
        }),
      } as any,
      {
        workloads: {
          bbh: {
            workspaceRoot: workspaceRoot,
          },
        },
      } as any,
      {
        workspace_path: path.join(workspaceRoot, "challenge-run"),
        split: "challenge",
      },
      {
        resolved_at: "2026-03-21T00:00:00.000Z",
        executor_harness: { kind: "openclaw", profile: "bbh", entrypoint: null },
        origin: { kind: "local", transport: "api", session_id: null, trigger_ref: null },
        executor_harness_kind: "openclaw",
        executor_harness_profile: "bbh",
        origin_session_id: null,
      },
    );

    expect(response.split).toBe("challenge");

    const runSource = JSON.parse(
      await fs.readFile(path.join(response.workspace_path, "run.source.yaml"), "utf8"),
    ) as Record<string, any>;

    expect(runSource.bbh.split).toBe("challenge");
    expect(runSource.origin.trigger).toBe("validator");
  });

  it("materializes an explicitly selected capsule without defaulting the lane", async () => {
    const workspaceRoot = await makeTempDir();
    const response = await materializeBbhWorkspace(
      {
        selectBbhAssignment: async () => ({
          data: {
            assignment_ref: "asg_select",
            split: "benchmark",
            capsule: {
              capsule_id: "capsule_benchmark",
              provider: "bbh",
              provider_ref: "provider/benchmark",
              family_ref: "family_benchmark",
              instance_ref: null,
              split: "benchmark",
              language: "python",
              mode: "family",
              assignment_policy: "auto_or_select",
              title: "Benchmark capsule",
              hypothesis: "Selected benchmark capsule",
              protocol_md: "1. Run it",
              rubric_json: { items: [] },
              task_json: { capsule_id: "capsule_benchmark" },
              data_files: [],
              artifact_source: null,
            },
          },
        }),
      } as any,
      {
        workloads: {
          bbh: {
            workspaceRoot,
          },
        },
      } as any,
      {
        workspace_path: path.join(workspaceRoot, "selected-run"),
        capsule_id: "capsule_benchmark",
      },
      {
        resolved_at: "2026-03-21T00:00:00.000Z",
        executor_harness: { kind: "hermes", profile: "bbh", entrypoint: "hermes" },
        origin: { kind: "local", transport: "api", session_id: null, trigger_ref: null },
        executor_harness_kind: "hermes",
        executor_harness_profile: "bbh",
        origin_session_id: null,
      },
    );

    expect(response.assignment_ref).toBe("asg_select");
    expect(response.split).toBe("benchmark");

    const runSource = JSON.parse(
      await fs.readFile(path.join(response.workspace_path, "run.source.yaml"), "utf8"),
    ) as Record<string, any>;

    expect(runSource.bbh.split).toBe("benchmark");
    expect(runSource.bbh.assignment_ref).toBe("asg_select");
  });

  it("rejects a lane mismatch when the user selects an explicit capsule", async () => {
    const workspaceRoot = await makeTempDir();

    await expect(
      materializeBbhWorkspace(
        {
          selectBbhAssignment: async () => ({
            data: {
              assignment_ref: "asg_select",
              split: "benchmark",
              capsule: {
                capsule_id: "capsule_benchmark",
                provider: "bbh",
                provider_ref: "provider/benchmark",
                family_ref: "family_benchmark",
                instance_ref: null,
                split: "benchmark",
                language: "python",
                mode: "family",
                assignment_policy: "auto_or_select",
                title: "Benchmark capsule",
                hypothesis: "Selected benchmark capsule",
                protocol_md: "1. Run it",
                rubric_json: { items: [] },
                task_json: { capsule_id: "capsule_benchmark" },
                data_files: [],
                artifact_source: null,
              },
            },
          }),
        } as any,
        {
          workloads: {
            bbh: {
              workspaceRoot,
            },
          },
        } as any,
        {
          workspace_path: path.join(workspaceRoot, "mismatched-run"),
          capsule_id: "capsule_benchmark",
          split: "climb",
        },
        {
          resolved_at: "2026-03-21T00:00:00.000Z",
          executor_harness: { kind: "hermes", profile: "bbh", entrypoint: "hermes" },
          origin: { kind: "local", transport: "api", session_id: null, trigger_ref: null },
          executor_harness_kind: "hermes",
          executor_harness_profile: "bbh",
          origin_session_id: null,
        },
      ),
    ).rejects.toThrow("does not match requested lane climb");
  });

  it("rejects benchmark or challenge runs without an assignment reference before submit", async () => {
    const workspaceRoot = await makeTempDir();
    const workspacePath = path.join(workspaceRoot, "missing-assignment-run");
    await fs.mkdir(path.join(workspacePath, "outputs"), { recursive: true });
    await fs.writeFile(
      path.join(workspacePath, "artifact.source.yaml"),
      JSON.stringify({
        schema_version: "techtree.bbh.artifact-source.v1",
        bbh: {
          split: "benchmark",
          provider: "bbh",
          provider_ref: "provider/benchmark",
          family_ref: null,
          instance_ref: "capsule_1",
          assignment_policy: "auto_or_select",
          mode: "fixed",
        },
      }),
      "utf8",
    );
    await fs.writeFile(
      path.join(workspacePath, "genome.source.yaml"),
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
      path.join(workspacePath, "artifact.source.yaml"),
      JSON.stringify({
        schema_version: "techtree.bbh.artifact-source.v1",
        bbh: {
          split: "climb",
          provider: "bbh_train",
          provider_ref: "provider/climb",
          family_ref: null,
          instance_ref: "capsule_1",
          assignment_policy: "auto",
          mode: "fixed",
        },
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
          dataset_ref: "provider/climb",
          benchmark_ref: "family_climb",
          scorer_version: "hypotest-v1",
        },
        instance: { instance_ref: "capsule_1" },
        status: "completed",
        score: { raw: 1, normalized: 0.1 },
        bbh: { split: "benchmark", genome_ref: "gen_1", provider: "bbh" },
      }),
      "utf8",
    );
    await fs.writeFile(path.join(workspacePath, "task.json"), JSON.stringify({}), "utf8");
    await fs.writeFile(path.join(workspacePath, "rubric.json"), JSON.stringify({}), "utf8");
    await fs.writeFile(path.join(workspacePath, "analysis.py"), "print('ok')\n", "utf8");
    await fs.writeFile(path.join(workspacePath, "protocol.md"), "1. Run it\n", "utf8");
    await fs.writeFile(path.join(workspacePath, "final_answer.md"), "", "utf8");
    await fs.writeFile(
      path.join(workspacePath, "outputs", "verdict.json"),
      JSON.stringify({ metrics: { raw_score: 1, normalized_score: 0.1 } }),
      "utf8",
    );

    await expect(loadBbhRunSubmitRequest(workspacePath)).rejects.toThrow(
      "benchmark and challenge runs require assignment_ref in run.source.yaml",
    );
  });

  it("rejects invalid schema versions and missing files with clear local errors", async () => {
    const workspaceRoot = await makeTempDir();
    const workspacePath = path.join(workspaceRoot, "invalid-files-run");
    await fs.mkdir(path.join(workspacePath, "outputs"), { recursive: true });
    await fs.writeFile(
      path.join(workspacePath, "artifact.source.yaml"),
      JSON.stringify({
        schema_version: "techtree.bbh.artifact-source.v0",
        bbh: {
          split: "climb",
          provider: "bbh_train",
          provider_ref: "provider/climb",
          family_ref: null,
          instance_ref: "capsule_1",
          assignment_policy: "auto",
          mode: "fixed",
        },
      }),
      "utf8",
    );
    await fs.writeFile(
      path.join(workspacePath, "genome.source.yaml"),
      JSON.stringify({
        schema_version: "techtree.bbh.genome-source.v0",
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
          dataset_ref: "provider/climb",
          benchmark_ref: "family_climb",
          scorer_version: "hypotest-v1",
        },
        instance: { instance_ref: "capsule_1" },
        status: "completed",
        score: { raw: 1, normalized: 0.1 },
        bbh: { split: "climb", genome_ref: "gen_1", provider: "bbh_train" },
      }),
      "utf8",
    );
    await fs.writeFile(path.join(workspacePath, "task.json"), JSON.stringify({}), "utf8");
    await fs.writeFile(path.join(workspacePath, "rubric.json"), JSON.stringify({}), "utf8");
    await fs.writeFile(path.join(workspacePath, "analysis.py"), "print('ok')\n", "utf8");
    await fs.writeFile(path.join(workspacePath, "protocol.md"), "1. Run it\n", "utf8");
    await fs.writeFile(path.join(workspacePath, "final_answer.md"), "", "utf8");
    await fs.writeFile(
      path.join(workspacePath, "outputs", "verdict.json"),
      JSON.stringify({ metrics: { raw_score: 1, normalized_score: 0.1 } }),
      "utf8",
    );

    await expect(loadBbhRunSubmitRequest(workspacePath)).rejects.toThrow(
      "genome.source.yaml must declare techtree.bbh.genome-source.v1",
    );

    await fs.writeFile(
      path.join(workspacePath, "genome.source.yaml"),
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

    await expect(loadBbhRunSubmitRequest(workspacePath)).rejects.toThrow(
      "artifact.source.yaml must declare techtree.bbh.artifact-source.v1",
    );

    await fs.writeFile(
      path.join(workspacePath, "artifact.source.yaml"),
      JSON.stringify({
        schema_version: "techtree.bbh.artifact-source.v1",
        bbh: {
          split: "climb",
          provider: "bbh_train",
          provider_ref: "provider/climb",
          family_ref: null,
          instance_ref: "capsule_1",
          assignment_policy: "auto",
          mode: "fixed",
        },
      }),
      "utf8",
    );
    await fs.writeFile(
      path.join(workspacePath, "run.source.yaml"),
      JSON.stringify({
        schema_version: "techtree.bbh.run-source.v0",
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
          dataset_ref: "provider/climb",
          benchmark_ref: "family_climb",
          scorer_version: "hypotest-v1",
        },
        instance: { instance_ref: "capsule_1" },
        status: "completed",
        score: { raw: 1, normalized: 0.1 },
        bbh: { split: "climb", genome_ref: "gen_1", provider: "bbh_train" },
      }),
      "utf8",
    );

    await expect(loadBbhRunSubmitRequest(workspacePath)).rejects.toThrow(
      "run.source.yaml must declare techtree.bbh.run-source.v1",
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
          dataset_ref: "provider/climb",
          benchmark_ref: "family_climb",
          scorer_version: "hypotest-v1",
        },
        instance: { instance_ref: "capsule_1" },
        status: "completed",
        score: { raw: 1, normalized: 0.1 },
        bbh: { split: "climb", genome_ref: "gen_1", provider: "bbh_train" },
      }),
      "utf8",
    );

    await fs.rm(path.join(workspacePath, "artifact.source.yaml"));
    const submitRequest = await loadBbhRunSubmitRequest(workspacePath);
    expect(submitRequest.artifact_source).toBeNull();
  });

  it("writes replay validation files that pass the local review contract checks", async () => {
    const workspaceRoot = await makeTempDir();
    const workspacePath = path.join(workspaceRoot, "validated-run");
    await fs.mkdir(path.join(workspacePath, "outputs"), { recursive: true });
    await fs.writeFile(
      path.join(workspacePath, "artifact.source.yaml"),
      JSON.stringify({
        schema_version: "techtree.bbh.artifact-source.v1",
        bbh: {
          split: "benchmark",
          provider: "bbh",
          provider_ref: "provider/benchmark",
          family_ref: null,
          instance_ref: "capsule_1",
          assignment_policy: "auto_or_select",
          mode: "fixed",
        },
      }),
      "utf8",
    );
    await fs.writeFile(
      path.join(workspacePath, "genome.source.yaml"),
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
          dataset_ref: "provider/climb",
          benchmark_ref: "family_climb",
          scorer_version: "hypotest-v1",
        },
        instance: { instance_ref: "capsule_1" },
        status: "completed",
        score: { raw: 5, normalized: 0.5 },
        bbh: {
          split: "benchmark",
          genome_ref: "gen_1",
          provider: "bbh",
          assignment_ref: "asg_1",
        },
      }),
      "utf8",
    );
    await fs.writeFile(path.join(workspacePath, "task.json"), JSON.stringify({}), "utf8");
    await fs.writeFile(path.join(workspacePath, "rubric.json"), JSON.stringify({}), "utf8");
    await fs.writeFile(path.join(workspacePath, "analysis.py"), "print('ok')\n", "utf8");
    await fs.writeFile(path.join(workspacePath, "protocol.md"), "1. Run it\n", "utf8");
    await fs.writeFile(path.join(workspacePath, "final_answer.md"), "", "utf8");
    await fs.writeFile(
      path.join(workspacePath, "outputs", "verdict.json"),
      JSON.stringify({ metrics: { raw_score: 5, normalized_score: 0.5 } }),
      "utf8",
    );

    const validation = await buildBbhValidationRequest(workspacePath, "run_1");
    expect(validation.review_source.method).toBe("replay");
    expect(validation.review_source.bbh.role).toBe("official");
    expect(validation.review_source.bbh.reproduced_raw_score).toBe(5);
  });
});
