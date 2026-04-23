import fs from "node:fs/promises";
import path from "node:path";

import type {
  BbhAssignmentResponse,
  BbhCapsuleGetResponse,
  BbhCapsuleListResponse,
  BbhDraftApplyParams,
  BbhDraftCreateParams,
  BbhDraftGetResponse,
  BbhDraftListResponse,
  BbhDraftProposalListResponse,
  BbhDraftProposalSubmitParams,
  BbhDraftProposalSubmitResponse,
  BbhDraftPullParams,
  BbhDraftPullResponse,
  BbhDraftReadyParams,
  BbhGenomeImproveParams,
  BbhGenomeImproveResponse,
  BbhGenomeInitParams,
  BbhGenomeInitResponse,
  BbhGenomeProposeParams,
  BbhGenomeScoreParams,
  BbhGenomeScoreResponse,
  BbhLeaderboardResponse,
  BbhNotebookPairParams,
  BbhNotebookPairResponse,
  BbhRunExecParams,
  BbhRunExecResponse,
  BbhRunSolveParams,
  BbhRunSolveResponse,
  BbhSubmitParams,
  BbhSyncParams,
  BbhRunSubmitResponse,
  BbhSyncResponse,
  BbhValidateParams,
  BbhValidationSubmitResponse,
  TechtreeV1BbhCapsulesGetParams,
  TechtreeV1BbhCapsulesListParams,
  TechtreeWorkspaceActionResult,
} from "../../../internal-types/index.js";

import type { RuntimeContext } from "../../runtime.js";
import {
  loadBbhDraftCreateRequest,
  loadBbhDraftProposalRequest,
  buildBbhValidationRequest,
  buildBbhGenomeSource,
  loadBbhRunSubmitRequest,
  materializeBbhDraftWorkspace,
  materializeBbhWorkspace,
} from "../../workloads/bbh.js";
import {
  genomeProposalSummary,
  improveBbhGenomeWorkspace,
  initBbhGenomeWorkspace,
  scoreBbhGenomeWorkspace,
} from "../../workloads/bbh-genome.js";
import { solveBbhWorkspace } from "../../workloads/bbh-solve.js";
import { prepareBbhNotebookPair } from "../../workloads/notebook-pair.js";

export async function handleTechtreeV1BbhLeaderboard(
  ctx: RuntimeContext,
  params?: { split?: "climb" | "benchmark" | "challenge" | "draft" },
): Promise<BbhLeaderboardResponse> {
  return ctx.techtree.getBbhLeaderboard(params);
}

export async function handleTechtreeV1BbhAssignmentNext(
  ctx: RuntimeContext,
  params?: { split?: "climb" | "benchmark" | "challenge" | "draft" },
): Promise<BbhAssignmentResponse> {
  return ctx.techtree.nextBbhAssignment(params);
}

export async function handleTechtreeV1BbhCapsulesList(
  ctx: RuntimeContext,
  params?: TechtreeV1BbhCapsulesListParams,
): Promise<BbhCapsuleListResponse> {
  return ctx.techtree.listBbhCapsules(
    params?.split === undefined ? undefined : { split: params.split ?? undefined },
  );
}

export async function handleTechtreeV1BbhCapsulesGet(
  ctx: RuntimeContext,
  params: TechtreeV1BbhCapsulesGetParams,
): Promise<BbhCapsuleGetResponse> {
  return ctx.techtree.getBbhCapsule(params.capsule_id);
}

export async function handleTechtreeV1BbhRunExec(
  ctx: RuntimeContext,
  params: BbhRunExecParams,
): Promise<BbhRunExecResponse> {
  const resolvedMetadata = ctx.agentRouter.resolveRunMetadata(params.metadata ?? null);
  return materializeBbhWorkspace(ctx.techtree, ctx.config, params, resolvedMetadata);
}

export async function handleTechtreeV1BbhRunSolve(
  ctx: RuntimeContext,
  params: BbhRunSolveParams,
): Promise<BbhRunSolveResponse> {
  const resolvedMetadata = ctx.agentRouter.resolveRunMetadata(params.metadata ?? null);
  return solveBbhWorkspace(ctx.config, params, resolvedMetadata);
}

export async function handleTechtreeV1BbhNotebookPair(
  _ctx: RuntimeContext,
  params: BbhNotebookPairParams,
): Promise<BbhNotebookPairResponse> {
  return prepareBbhNotebookPair(params.workspace_path);
}

export async function handleTechtreeV1BbhGenomeInit(
  ctx: RuntimeContext,
  params: BbhGenomeInitParams,
): Promise<BbhGenomeInitResponse> {
  const resolvedMetadata = ctx.agentRouter.resolveRunMetadata(params.metadata ?? null);
  return initBbhGenomeWorkspace(
    params.workspace_path,
    buildBbhGenomeSource(
      {
        genome: params.genome ?? null,
      },
      resolvedMetadata,
    ),
    {
      budget: params.budget,
      scope:
        params.capsule_ids && params.capsule_ids.length > 0
          ? { capsule_ids: params.capsule_ids }
          : {
              ...(params.split ? { split: params.split } : {}),
              ...(params.sample_size ? { sample_size: params.sample_size } : {}),
            },
    },
  );
}

export async function handleTechtreeV1BbhGenomeScore(
  ctx: RuntimeContext,
  params: BbhGenomeScoreParams,
): Promise<BbhGenomeScoreResponse> {
  const resolvedMetadata = ctx.agentRouter.resolveRunMetadata(params.metadata ?? null);
  return scoreBbhGenomeWorkspace(ctx.techtree, ctx.config, params.workspace_path, resolvedMetadata);
}

export async function handleTechtreeV1BbhGenomeImprove(
  ctx: RuntimeContext,
  params: BbhGenomeImproveParams,
): Promise<BbhGenomeImproveResponse> {
  const resolvedMetadata = ctx.agentRouter.resolveRunMetadata(params.metadata ?? null);
  return improveBbhGenomeWorkspace(ctx.techtree, ctx.config, params.workspace_path, resolvedMetadata);
}

export async function handleTechtreeV1BbhDraftInit(
  _ctx: RuntimeContext,
  params: { workspace_path: string },
): Promise<TechtreeWorkspaceActionResult> {
  const workspacePath = path.resolve(params.workspace_path);
  const files = await materializeBbhDraftWorkspace(workspacePath);

  return {
    ok: true,
    tree: "bbh",
    entrypoint: "bbh.draft.init",
    workspace_path: workspacePath,
    files,
  };
}

export async function handleTechtreeV1BbhDraftCreate(
  ctx: RuntimeContext,
  params: BbhDraftCreateParams,
): Promise<BbhDraftGetResponse> {
  return ctx.techtree.createBbhDraft(await loadBbhDraftCreateRequest(params.workspace_path, params));
}

export async function handleTechtreeV1BbhDraftList(
  ctx: RuntimeContext,
  _params?: Record<string, never>,
): Promise<BbhDraftListResponse> {
  return ctx.techtree.listBbhDrafts();
}

export async function handleTechtreeV1BbhDraftPull(
  ctx: RuntimeContext,
  params: BbhDraftPullParams,
): Promise<BbhDraftPullResponse> {
  const workspacePath = path.resolve(params.workspace_path);
  const draft = await ctx.techtree.getBbhDraft(params.capsule_id);
  const files = await materializeBbhDraftWorkspace(workspacePath, draft.data.workspace);

  return {
    ok: true,
    entrypoint: "bbh.draft.pull",
    workspace_path: workspacePath,
    capsule_id: params.capsule_id,
    files,
    capsule: draft.data.capsule,
  };
}

export async function handleTechtreeV1BbhDraftPropose(
  ctx: RuntimeContext,
  params: BbhDraftProposalSubmitParams,
): Promise<BbhDraftProposalSubmitResponse> {
  return ctx.techtree.createBbhDraftProposal(
    params.capsule_id,
    await loadBbhDraftProposalRequest(params.workspace_path, params.summary),
  );
}

export async function handleTechtreeV1BbhGenomePropose(
  ctx: RuntimeContext,
  params: BbhGenomeProposeParams,
): Promise<BbhDraftProposalSubmitResponse> {
  return ctx.techtree.createBbhDraftProposal(
    params.capsule_id,
    await loadBbhDraftProposalRequest(params.workspace_path, await genomeProposalSummary(params.workspace_path, params.summary)),
  );
}

export async function handleTechtreeV1BbhDraftProposals(
  ctx: RuntimeContext,
  params: { capsule_id: string },
): Promise<BbhDraftProposalListResponse> {
  return ctx.techtree.listBbhDraftProposals(params.capsule_id);
}

export async function handleTechtreeV1BbhDraftApply(
  ctx: RuntimeContext,
  params: BbhDraftApplyParams,
): Promise<BbhDraftGetResponse> {
  return ctx.techtree.applyBbhDraftProposal(params.capsule_id, params.proposal_id);
}

export async function handleTechtreeV1BbhDraftReady(
  ctx: RuntimeContext,
  params: BbhDraftReadyParams,
): Promise<BbhDraftGetResponse> {
  return ctx.techtree.readyBbhDraft(params.capsule_id);
}

export async function handleTechtreeV1BbhSubmit(
  ctx: RuntimeContext,
  params: BbhSubmitParams,
): Promise<BbhRunSubmitResponse> {
  return ctx.techtree.submitBbhRun(await loadBbhRunSubmitRequest(params.workspace_path));
}

export async function handleTechtreeV1BbhValidate(
  ctx: RuntimeContext,
  params: BbhValidateParams,
): Promise<BbhValidationSubmitResponse> {
  return ctx.techtree.submitBbhValidation(await buildBbhValidationRequest(params.workspace_path, params.run_id));
}

export async function handleTechtreeV1BbhSync(
  ctx: RuntimeContext,
  params?: BbhSyncParams,
): Promise<BbhSyncResponse> {
  const workspaceRoot = params?.workspace_root ?? path.join(ctx.config.workloads.bbh.workspaceRoot, "runs");

  const entries = await fs.readdir(workspaceRoot, { withFileTypes: true }).catch(() => []);
  const runIds = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);

  return ctx.techtree.syncBbh({ run_ids: runIds });
}
