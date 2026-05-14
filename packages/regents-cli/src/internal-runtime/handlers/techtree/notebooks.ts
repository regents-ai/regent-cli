import type { NodeCreateResponse } from "../../../internal-types/index.js";
import {
  initNotebookWorkspace,
  pairNotebookWorkspace,
  publishNotebookWorkspace,
  type NotebookKind,
  type NotebookPublishResult,
  type NotebookWorkspaceActionResult,
} from "../../workloads/notebooks.js";
import type { RuntimeContext } from "../../runtime.js";

export function handleTechtreeNotebooksInit(params: {
  workspace_path: string;
  kind: NotebookKind;
  title: string;
  source?: string;
}): Promise<NotebookWorkspaceActionResult> {
  return initNotebookWorkspace(params);
}

export function handleTechtreeNotebooksPair(params: {
  workspace_path: string;
}): Promise<NotebookWorkspaceActionResult> {
  return pairNotebookWorkspace(params);
}

export function handleTechtreeNotebooksPublish(
  ctx: RuntimeContext,
  params: { workspace_path: string; parent_id?: number },
): Promise<NotebookPublishResult & { techtree: NodeCreateResponse }> {
  return publishNotebookWorkspace(ctx, params);
}
