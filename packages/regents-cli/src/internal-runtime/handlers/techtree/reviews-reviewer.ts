import path from "node:path";

import type {
  BbhCertificateVerifyParams,
  BbhCertificateVerifyResponse,
  BbhReviewerApplyParams,
  BbhReviewerApplyResponse,
  BbhReviewerOrcidLinkParams,
  BbhReviewerOrcidLinkResponse,
  BbhReviewerStatusResponse,
  BbhReviewListParams,
  BbhReviewListResponse,
  BbhReviewPullParams,
  BbhReviewPullResponse,
  BbhReviewRequest,
  BbhReviewSubmitParams,
  BbhReviewSubmitResponse,
} from "../../../internal-types/index.js";

import type { RuntimeContext } from "../../runtime.js";
import { loadBbhReviewSubmitRequest, materializeBbhReviewWorkspace } from "../../workloads/bbh.js";

export async function handleTechtreeV1ReviewerOrcidLink(
  ctx: RuntimeContext,
  params?: BbhReviewerOrcidLinkParams,
): Promise<BbhReviewerOrcidLinkResponse> {
  if (params?.request_id) {
    return ctx.techtree.getReviewerOrcidLinkStatus(params.request_id);
  }

  return ctx.techtree.startReviewerOrcidLink();
}

export async function handleTechtreeV1ReviewerApply(
  ctx: RuntimeContext,
  params: BbhReviewerApplyParams,
): Promise<BbhReviewerApplyResponse> {
  return ctx.techtree.applyReviewerProfile(params);
}

export async function handleTechtreeV1ReviewerStatus(
  ctx: RuntimeContext,
): Promise<BbhReviewerStatusResponse> {
  return ctx.techtree.getReviewerProfile();
}

export async function handleTechtreeV1ReviewList(
  ctx: RuntimeContext,
  params?: BbhReviewListParams,
): Promise<BbhReviewListResponse> {
  return ctx.techtree.listBbhReviews(params);
}

export async function handleTechtreeV1ReviewClaim(
  ctx: RuntimeContext,
  params: { request_id: string },
): Promise<{ data: BbhReviewRequest }> {
  return ctx.techtree.claimBbhReview(params.request_id);
}

export async function handleTechtreeV1ReviewPull(
  ctx: RuntimeContext,
  params: BbhReviewPullParams,
): Promise<BbhReviewPullResponse> {
  const workspacePath = path.resolve(params.workspace_path);
  const packet = await ctx.techtree.getBbhReviewPacket(params.request_id);
  const files = await materializeBbhReviewWorkspace(workspacePath, packet.data);

  return {
    ok: true,
    entrypoint: "bbh.review.pull",
    workspace_path: workspacePath,
    request_id: params.request_id,
    capsule_id: packet.data.request.capsule_id,
    files,
    review: packet.data.request,
  };
}

export async function handleTechtreeV1ReviewSubmit(
  ctx: RuntimeContext,
  params: BbhReviewSubmitParams,
): Promise<BbhReviewSubmitResponse> {
  const request = await loadBbhReviewSubmitRequest(params.workspace_path);
  return ctx.techtree.submitBbhReview(request.request_id, request);
}

export async function handleTechtreeV1CertificateVerify(
  ctx: RuntimeContext,
  params: BbhCertificateVerifyParams,
): Promise<BbhCertificateVerifyResponse> {
  return ctx.techtree.verifyBbhCertificate(params.capsule_id);
}
