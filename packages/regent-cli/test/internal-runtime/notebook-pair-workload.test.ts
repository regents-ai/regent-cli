import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { execFileMock } = vi.hoisted(() => ({
  execFileMock: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execFile: execFileMock,
}));

import {
  prepareAutoskillNotebookPair,
  prepareBbhNotebookPair,
} from "../../src/internal-runtime/workloads/notebook-pair.js";

const tempRoots: string[] = [];

const makeTempDir = async (prefix: string): Promise<string> => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempRoots.push(dir);
  return dir;
};

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((target) => fs.rm(target, { recursive: true, force: true })));
});

beforeEach(() => {
  execFileMock.mockReset();
});

const installedSkills = [{ name: "marimo-pair", scope: "project", agents: ["Hermes", "OpenClaw"] }];

const seedBbhWorkspace = async (workspacePath: string): Promise<void> => {
  await fs.mkdir(path.join(workspacePath, "outputs"), { recursive: true });
  await fs.writeFile(path.join(workspacePath, "genome.source.yaml"), "schema_version: techtree.bbh.genome-source.v1\n", "utf8");
  await fs.writeFile(path.join(workspacePath, "run.source.yaml"), "schema_version: techtree.bbh.run-source.v1\n", "utf8");
  await fs.writeFile(path.join(workspacePath, "task.json"), "{\"objective\":\"solve\"}\n", "utf8");
  await fs.writeFile(path.join(workspacePath, "protocol.md"), "1. Solve it\n", "utf8");
  await fs.writeFile(path.join(workspacePath, "rubric.json"), "{\"items\":[]}\n", "utf8");
  await fs.writeFile(path.join(workspacePath, "analysis.py"), "print('analysis')\n", "utf8");
  await fs.writeFile(path.join(workspacePath, "final_answer.md"), "", "utf8");
  await fs.writeFile(
    path.join(workspacePath, "outputs", "verdict.json"),
    "{\"decision\":\"inconclusive\",\"metrics\":{\"raw_score\":0,\"normalized_score\":0}}\n",
    "utf8",
  );
};

describe("notebook pair workloads", () => {
  it("prepares a BBH notebook pairing flow with exact follow-up instructions", async () => {
    const workspace = await makeTempDir("bbh-notebook-pair-");
    await seedBbhWorkspace(workspace);

    const result = await prepareBbhNotebookPair(workspace, {
      listInstalledSkills: async (workspacePath) => {
        expect(workspacePath).toBe(path.resolve(workspace));
        return installedSkills;
      },
    });

    expect(result.notebook_path).toBe(path.join(workspace, "analysis.py"));
    expect(result.launch_argv).toEqual(["uvx", "marimo", "edit", "analysis.py"]);
    expect(result.marimo_pair.installed).toBe(true);
    expect(result.instructions.techtree_skill).toBe("techtree-bbh-workspace");
    expect(result.instructions.hermes_prompt).toContain("techtree-bbh-workspace");
    expect(result.instructions.hermes_prompt).toContain("marimo-pair");
    expect(result.instructions.next_regent_commands).toEqual([
      `regent techtree bbh submit ${workspace}`,
      `regent techtree bbh validate ${workspace}`,
    ]);
  });

  it("fails clearly when marimo-pair is not installed", async () => {
    const workspace = await makeTempDir("bbh-notebook-pair-missing-skill-");
    await seedBbhWorkspace(workspace);

    await expect(
      prepareBbhNotebookPair(workspace, {
        listInstalledSkills: async () => [],
      }),
    ).rejects.toThrow("marimo-pair is not installed");
  });

  it("keeps the underlying listing failure reason when every skill command fails", async () => {
    const workspace = await makeTempDir("bbh-notebook-pair-skill-listing-failure-");
    await seedBbhWorkspace(workspace);

    execFileMock.mockImplementation(
      (
        command: string,
        args: string[],
        _options: unknown,
        callback?: (error: Error | null, stdout?: string, stderr?: string) => void,
      ) => {
        callback?.(
          new Error(`simulated skill listing failure for ${command} ${args.join(" ")}`),
        );
        return {} as never;
      },
    );

    await expect(prepareBbhNotebookPair(workspace)).rejects.toThrow(
      "simulated skill listing failure for uvx deno -A npm:skills ls -g --json",
    );
  });

  it("prepares a skill workspace notebook pairing flow", async () => {
    const workspace = await makeTempDir("autoskill-notebook-pair-skill-");
    await fs.writeFile(path.join(workspace, "session.marimo.py"), "import marimo\n", "utf8");
    await fs.writeFile(path.join(workspace, "manifest.yaml"), "type: skill\n", "utf8");
    await fs.writeFile(path.join(workspace, "SKILL.md"), "# Skill\n", "utf8");

    const result = await prepareAutoskillNotebookPair(workspace, {
      listInstalledSkills: async (workspacePath) => {
        expect(workspacePath).toBe(path.resolve(workspace));
        return installedSkills;
      },
    });

    expect(result.workspace_kind).toBe("skill");
    expect(result.notebook_path).toBe(path.join(workspace, "session.marimo.py"));
    expect(result.instructions.techtree_skill).toBe("techtree-autoskill-workspace");
    expect(result.instructions.next_regent_commands[0]).toBe(
      `regent techtree autoskill publish skill ${workspace}`,
    );
  });

  it("prepares an eval workspace notebook pairing flow", async () => {
    const workspace = await makeTempDir("autoskill-notebook-pair-eval-");
    await fs.writeFile(path.join(workspace, "session.marimo.py"), "import marimo\n", "utf8");
    await fs.writeFile(path.join(workspace, "scenario.yaml"), "type: eval\n", "utf8");
    await fs.writeFile(path.join(workspace, "README.md"), "# Eval\n", "utf8");

    const result = await prepareAutoskillNotebookPair(workspace, {
      listInstalledSkills: async (workspacePath) => {
        expect(workspacePath).toBe(path.resolve(workspace));
        return installedSkills;
      },
    });

    expect(result.workspace_kind).toBe("eval");
    expect(result.instructions.next_regent_commands[0]).toBe(
      `regent techtree autoskill publish eval ${workspace}`,
    );
  });

  it("rejects autoskill workspaces that mix skill and eval shapes", async () => {
    const workspace = await makeTempDir("autoskill-notebook-pair-invalid-");
    await fs.writeFile(path.join(workspace, "session.marimo.py"), "import marimo\n", "utf8");
    await fs.writeFile(path.join(workspace, "manifest.yaml"), "type: skill\n", "utf8");
    await fs.writeFile(path.join(workspace, "scenario.yaml"), "type: eval\n", "utf8");
    await fs.writeFile(path.join(workspace, "SKILL.md"), "# Skill\n", "utf8");

    await expect(
      prepareAutoskillNotebookPair(workspace, {
        listInstalledSkills: async () => installedSkills,
      }),
    ).rejects.toThrow("autoskill workspace must contain exactly one of `manifest.yaml` or `scenario.yaml`");
  });
});
