import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

import { expandHome } from "../../internal-runtime/index.js";
import { renderHermesRegentsWorkSkill } from "./skill-template.js";

export interface WriteHermesConnectorInput {
  readonly companyId: string;
  readonly workerId: string;
  readonly workerName: string;
  readonly configPath?: string;
  readonly skillPath?: string;
}

export interface WriteHermesConnectorResult {
  readonly configPath: string;
  readonly skillPath: string;
}

export const defaultHermesConfigPath = (): string =>
  path.join(process.env.HOME ?? process.env.USERPROFILE ?? "~", ".hermes", "connectors", "regents-work.json");

export const defaultHermesSkillPath = (): string =>
  path.join(process.env.HOME ?? process.env.USERPROFILE ?? "~", ".hermes", "skills", "regents-work", "SKILL.md");

export const writeHermesRegentsWorkConnector = async (
  input: WriteHermesConnectorInput,
): Promise<WriteHermesConnectorResult> => {
  const configPath = path.resolve(expandHome(input.configPath ?? defaultHermesConfigPath()));
  const skillPath = path.resolve(expandHome(input.skillPath ?? defaultHermesSkillPath()));

  await mkdir(path.dirname(configPath), { recursive: true });
  await mkdir(path.dirname(skillPath), { recursive: true });
  await writeFile(
    configPath,
    `${JSON.stringify(
      {
        name: "regents-work",
        company_id: input.companyId,
        worker_id: input.workerId,
        worker_name: input.workerName,
        local_bridge: {
          command: "regents",
          args: ["work", "local-loop", "--company-id", input.companyId, "--worker-id", input.workerId],
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await writeFile(
    skillPath,
    renderHermesRegentsWorkSkill({
      companyId: input.companyId,
      workerId: input.workerId,
      workerName: input.workerName,
    }),
    "utf8",
  );

  return { configPath, skillPath };
};
