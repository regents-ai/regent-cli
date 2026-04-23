import path from "node:path";

import type { RuntimeContext } from "../../runtime.js";
import {
  collectScienceTaskPacketFiles,
  initScienceTaskWorkspace,
  loadScienceTaskChecklistPayload,
  loadScienceTaskEvidencePayload,
  loadScienceTaskReviewPayload,
  loadScienceTaskSubmitPayload,
  materializeScienceTaskPacket,
  mergeScienceTaskMetadataForInit,
  readScienceTaskWorkspaceMetadata,
  runScienceTaskReviewLoop,
  scienceTaskExportPath,
  scienceTaskTitleFromPath,
  type ScienceTaskHermesRunner,
  updateScienceTaskWorkspaceMetadata,
  writeScienceTaskWorkspaceMetadata,
} from "../../workloads/science-tasks.js";

export async function handleTechtreeScienceTasksList(
  ctx: RuntimeContext,
  params?: {
    limit?: number;
    stage?: string;
    science_domain?: string;
    science_field?: string;
  },
) {
  return ctx.techtree.listScienceTasks(params);
}

export async function handleTechtreeScienceTasksGet(
  ctx: RuntimeContext,
  params: { id: number },
) {
  return ctx.techtree.getScienceTask(params.id);
}

export async function handleTechtreeScienceTasksInit(
  ctx: RuntimeContext,
  params: {
    workspace_path: string;
    title?: string;
    summary?: string;
    science_domain?: string;
    science_field?: string;
    task_slug?: string;
    claimed_expert_time?: string;
  },
): Promise<{
  ok: true;
  entrypoint: "science-tasks.init";
  workspace_path: string;
  node_id: number;
  files: string[];
  packet_hash: string;
  export_target_path: string;
}> {
  const workspacePath = path.resolve(params.workspace_path);
  const files = await initScienceTaskWorkspace(workspacePath, {
    title: params.title ?? scienceTaskTitleFromPath(workspacePath),
    summary: params.summary,
    science_domain: params.science_domain,
    science_field: params.science_field,
    task_slug: params.task_slug,
    claimed_expert_time: params.claimed_expert_time,
  });

  const metadata = mergeScienceTaskMetadataForInit(
    await readScienceTaskWorkspaceMetadata(workspacePath),
    {
      title: params.title ?? scienceTaskTitleFromPath(workspacePath),
      summary: params.summary,
      science_domain: params.science_domain,
      science_field: params.science_field,
      task_slug: params.task_slug,
      claimed_expert_time: params.claimed_expert_time,
    },
  );

  await writeScienceTaskWorkspaceMetadata(workspacePath, metadata);

  const packetFiles = await collectScienceTaskPacketFiles(workspacePath);

  const response = await ctx.techtree.createScienceTask({
    title: metadata.title,
    summary: metadata.summary ?? undefined,
    science_domain: metadata.science_domain,
    science_field: metadata.science_field,
    task_slug: metadata.task_slug,
    structured_output_shape: metadata.structured_output_shape ?? undefined,
    claimed_expert_time: metadata.claimed_expert_time,
    threshold_rationale: metadata.threshold_rationale ?? undefined,
    anti_cheat_notes: metadata.anti_cheat_notes,
    reproducibility_notes: metadata.reproducibility_notes,
    dependency_pinning_status: metadata.dependency_pinning_status,
    canary_status: metadata.canary_status,
    failure_analysis: metadata.failure_analysis,
    packet_files: packetFiles,
  });

  await updateScienceTaskWorkspaceMetadata(workspacePath, (current) => ({
    ...current,
    node_id: response.data.node_id,
  }));

  return {
    ok: true,
    entrypoint: "science-tasks.init",
    workspace_path: workspacePath,
    node_id: response.data.node_id,
    files,
    packet_hash: response.data.packet_hash,
    export_target_path: response.data.export_target_path,
  };
}

export async function handleTechtreeScienceTasksChecklist(
  ctx: RuntimeContext,
  params: { workspace_path: string },
) {
  const payload = await loadScienceTaskChecklistPayload(params.workspace_path);
  return ctx.techtree.updateScienceTaskChecklist(payload.node_id, payload);
}

export async function handleTechtreeScienceTasksEvidence(
  ctx: RuntimeContext,
  params: { workspace_path: string },
) {
  const payload = await loadScienceTaskEvidencePayload(params.workspace_path);
  return ctx.techtree.updateScienceTaskEvidence(payload.node_id, payload);
}

export async function handleTechtreeScienceTasksExport(
  ctx: RuntimeContext,
  params: { workspace_path: string; output_path?: string },
): Promise<{
  ok: true;
  entrypoint: "science-tasks.export";
  workspace_path: string;
  node_id: number;
  output_path: string;
  files: string[];
  export_target_path: string;
}> {
  const workspacePath = path.resolve(params.workspace_path);
  const metadata = await readScienceTaskWorkspaceMetadata(workspacePath);
  if (!metadata.node_id) {
    throw new Error("science task workspace is not linked to a Techtree task yet");
  }

  const detail = (await ctx.techtree.getScienceTask(metadata.node_id)).data;
  const outputPath = path.resolve(params.output_path ?? scienceTaskExportPath(workspacePath, detail));
  const files = await materializeScienceTaskPacket(outputPath, detail);

  return {
    ok: true,
    entrypoint: "science-tasks.export",
    workspace_path: workspacePath,
    node_id: metadata.node_id,
    output_path: outputPath,
    files,
    export_target_path: detail.export_target_path,
  };
}

export async function handleTechtreeScienceTasksSubmit(
  ctx: RuntimeContext,
  params: { workspace_path: string; harbor_pr_url?: string; latest_review_follow_up_note?: string },
) {
  const payload = await loadScienceTaskSubmitPayload(params.workspace_path, params);
  const response = await ctx.techtree.submitScienceTask(payload.node_id, payload);

  await writeScienceTaskWorkspaceMetadata(path.resolve(params.workspace_path), payload.metadata);

  return response;
}

export async function handleTechtreeScienceTasksReviewUpdate(
  ctx: RuntimeContext,
  params: {
    workspace_path: string;
    harbor_pr_url?: string;
    latest_review_follow_up_note?: string;
    open_reviewer_concerns_count?: number;
    any_concern_unanswered?: boolean;
    latest_rerun_after_latest_fix?: boolean;
    latest_fix_at?: string | null;
    last_rerun_at?: string | null;
  },
) {
  const payload = await loadScienceTaskReviewPayload(params.workspace_path, params);
  const response = await ctx.techtree.reviewUpdateScienceTask(payload.node_id, payload);

  await writeScienceTaskWorkspaceMetadata(path.resolve(params.workspace_path), payload.metadata);

  return response;
}

export async function handleTechtreeScienceTasksReviewLoop(
  ctx: RuntimeContext,
  params: {
    workspace_path: string;
    harbor_pr_url: string;
    timeout_seconds?: number;
    runner?: ScienceTaskHermesRunner;
  },
): Promise<{
  ok: true;
  entrypoint: "science-tasks.review-loop";
  workspace_path: string;
  node_id: number;
  harbor_pr_url: string;
  output_path: string;
  log_path: string;
  workflow_state: string;
}> {
  const reviewLoop = await runScienceTaskReviewLoop({
    ...params,
    hermes_harness: ctx.config.agents.harnesses.hermes,
    runner: params.runner,
  });

  const checklistPayload = await loadScienceTaskChecklistPayload(reviewLoop.workspace_path);
  await ctx.techtree.updateScienceTaskChecklist(checklistPayload.node_id, checklistPayload);

  const evidencePayload = await loadScienceTaskEvidencePayload(reviewLoop.workspace_path);
  await ctx.techtree.updateScienceTaskEvidence(evidencePayload.node_id, evidencePayload);

  const submitPayload = await loadScienceTaskSubmitPayload(reviewLoop.workspace_path);
  await ctx.techtree.submitScienceTask(submitPayload.node_id, submitPayload);

  const reviewPayload = await loadScienceTaskReviewPayload(reviewLoop.workspace_path);
  const reviewResponse = await ctx.techtree.reviewUpdateScienceTask(reviewPayload.node_id, reviewPayload);

  return {
    ok: true,
    entrypoint: "science-tasks.review-loop",
    workspace_path: reviewLoop.workspace_path,
    node_id: reviewLoop.node_id,
    harbor_pr_url: reviewLoop.harbor_pr_url,
    output_path: reviewLoop.output_path,
    log_path: reviewLoop.log_path,
    workflow_state: reviewResponse.data.workflow_state,
  };
}
