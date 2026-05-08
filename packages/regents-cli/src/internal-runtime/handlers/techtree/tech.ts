import type {
  TechEpochResponse,
  TechLeaderboardConfirmInput,
  TechLeaderboardConfirmResponse,
  TechLeaderboardListResponse,
  TechLeaderboardRegisterPrepareInput,
  TechPreparedTransactionResponse,
  TechRewardClaimPrepareInput,
  TechRewardProofResponse,
  TechRewardRootConfirmInput,
  TechRewardRootConfirmResponse,
  TechRewardRootPrepareInput,
  TechRewardsResponse,
  TechStatusResponse,
  TechWithdrawPrepareInput,
} from "../../../internal-types/index.js";
import type { RuntimeContext } from "../../runtime.js";

export async function handleTechtreeTechStatus(ctx: RuntimeContext): Promise<TechStatusResponse> {
  return ctx.techtree.techStatus();
}

export async function handleTechtreeTechEpochCurrent(ctx: RuntimeContext): Promise<TechEpochResponse> {
  return ctx.techtree.techCurrentEpoch();
}

export async function handleTechtreeTechLeaderboardsList(
  ctx: RuntimeContext,
  params?: { status?: string; limit?: number },
): Promise<TechLeaderboardListResponse> {
  return ctx.techtree.listTechLeaderboards(params);
}

export async function handleTechtreeTechLeaderboardsRegister(
  ctx: RuntimeContext,
  params: TechLeaderboardRegisterPrepareInput,
): Promise<TechPreparedTransactionResponse> {
  return ctx.techtree.prepareTechLeaderboardRegistration(params);
}

export async function handleTechtreeTechLeaderboardsConfirm(
  ctx: RuntimeContext,
  params: TechLeaderboardConfirmInput,
): Promise<TechLeaderboardConfirmResponse> {
  return ctx.techtree.confirmTechLeaderboardRegistration(params);
}

export async function handleTechtreeTechRewardsList(
  ctx: RuntimeContext,
  params?: { epoch?: number; lane?: string; limit?: number },
): Promise<TechRewardsResponse> {
  return ctx.techtree.listTechRewards(params);
}

export async function handleTechtreeTechRewardsProof(
  ctx: RuntimeContext,
  params: { epoch: number; lane: string; agent_id: string },
): Promise<TechRewardProofResponse> {
  return ctx.techtree.techRewardProof(params);
}

export async function handleTechtreeTechRewardsClaim(
  ctx: RuntimeContext,
  params: TechRewardClaimPrepareInput,
): Promise<TechPreparedTransactionResponse> {
  return ctx.techtree.prepareTechRewardClaim(params);
}

export async function handleTechtreeTechRewardsRootPrepare(
  ctx: RuntimeContext,
  params: TechRewardRootPrepareInput,
): Promise<TechPreparedTransactionResponse> {
  return ctx.techtree.prepareTechRewardRoot(params);
}

export async function handleTechtreeTechRewardsRootConfirm(
  ctx: RuntimeContext,
  params: TechRewardRootConfirmInput,
): Promise<TechRewardRootConfirmResponse> {
  return ctx.techtree.confirmTechRewardRoot(params);
}

export async function handleTechtreeTechWithdraw(
  ctx: RuntimeContext,
  params: TechWithdrawPrepareInput,
): Promise<TechPreparedTransactionResponse> {
  return ctx.techtree.prepareTechWithdrawal(params);
}
