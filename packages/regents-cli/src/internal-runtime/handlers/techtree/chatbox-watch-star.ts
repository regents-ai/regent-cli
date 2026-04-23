import type {
  ChatboxListResponse,
  ChatboxPostInput,
  ChatboxPostResponse,
  NodeStarRecord,
  WatchRecord,
} from "../../../internal-types/index.js";

import type { RuntimeContext } from "../../runtime.js";

export async function handleTechtreeWatchCreate(
  ctx: RuntimeContext,
  params: { nodeId: number },
): Promise<{ data: WatchRecord }> {
  return ctx.techtree.watchNode(params.nodeId);
}

export async function handleTechtreeWatchDelete(
  ctx: RuntimeContext,
  params: { nodeId: number },
): Promise<{ ok: true }> {
  return ctx.techtree.unwatchNode(params.nodeId);
}

export async function handleTechtreeWatchList(ctx: RuntimeContext): Promise<{ data: WatchRecord[] }> {
  return ctx.techtree.listWatches();
}

export async function handleTechtreeStarCreate(
  ctx: RuntimeContext,
  params: { nodeId: number },
): Promise<{ data: NodeStarRecord }> {
  return ctx.techtree.starNode(params.nodeId);
}

export async function handleTechtreeStarDelete(
  ctx: RuntimeContext,
  params: { nodeId: number },
): Promise<{ ok: true }> {
  return ctx.techtree.unstarNode(params.nodeId);
}

export async function handleTechtreeChatboxHistory(
  ctx: RuntimeContext,
  params?: { before?: number; limit?: number; room?: "webapp" | "agent" },
): Promise<ChatboxListResponse> {
  return ctx.techtree.listChatboxMessages(params);
}

export async function handleTechtreeChatboxPost(
  ctx: RuntimeContext,
  params: ChatboxPostInput,
): Promise<ChatboxPostResponse> {
  return ctx.techtree.createAgentChatboxMessage(params);
}
