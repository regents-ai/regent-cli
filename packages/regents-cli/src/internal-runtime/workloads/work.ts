import fs from "node:fs";
import path from "node:path";

import type { TechtreeWorkItem, TechtreeWorkKind } from "../../internal-types/index.js";

export interface AcceptedWorkWorkspaceResult {
  ok: true;
  workspace_path: string;
  manifest_path: string;
  work: TechtreeWorkItem;
  next: string[];
}

const manifestFile = "techtree-work.json";

export function writeAcceptedWorkWorkspace(input: {
  workspace_path: string;
  work: TechtreeWorkItem;
}): AcceptedWorkWorkspaceResult {
  const workspacePath = path.resolve(input.workspace_path);
  fs.mkdirSync(workspacePath, { recursive: true });

  const manifestPath = path.join(workspacePath, manifestFile);
  fs.writeFileSync(manifestPath, `${JSON.stringify({
    schema: "regents.techtree.work.v1",
    work: input.work,
    accepted_at: new Date().toISOString(),
  }, null, 2)}\n`);

  fs.writeFileSync(path.join(workspacePath, "README.md"), [
    `# ${input.work.title}`,
    "",
    input.work.summary,
    "",
    `Expected output: ${input.work.expected_output}`,
    `Publication path: ${input.work.publication_path}`,
    "",
    "Suggested command:",
    input.work.command,
    "",
  ].join("\n"));

  return {
    ok: true,
    workspace_path: workspacePath,
    manifest_path: manifestPath,
    work: input.work,
    next: [
      input.work.command,
      `regents techtree work publish --workspace-path ${workspacePath}`,
    ],
  };
}

export const parseWorkKind = (value: string | undefined): TechtreeWorkKind | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const allowed = new Set<TechtreeWorkKind>([
    "autoresearch",
    "benchmark",
    "bbh-train",
    "science-task",
    "terminal-science-bench",
    "biomysterybench",
    "paper-notebook",
    "freeform-notebook",
    "autoskill",
    "fold-proof",
  ]);

  if (!allowed.has(value as TechtreeWorkKind)) {
    throw new Error("--kind is not a supported Techtree work kind");
  }

  return value as TechtreeWorkKind;
};
