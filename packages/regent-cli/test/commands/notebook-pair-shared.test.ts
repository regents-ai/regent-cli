import { beforeEach, describe, expect, it, vi } from "vitest";

const { spawnMock, isHumanTerminalMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
  isHumanTerminalMock: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  spawn: spawnMock,
}));

vi.mock("../../src/printer.js", () => ({
  isHumanTerminal: isHumanTerminalMock,
}));

describe("notebook pair launcher", () => {
  beforeEach(() => {
    spawnMock.mockReset();
    isHumanTerminalMock.mockReset();
    isHumanTerminalMock.mockReturnValue(true);
  });

  it("spawns the notebook editor with argv tokens intact", async () => {
    const child = {
      on: vi.fn((event: string, handler: (...args: any[]) => void) => {
        if (event === "close") {
          handler(0);
        }
        return child;
      }),
    };

    spawnMock.mockReturnValue(child as never);

    const { parseCliArgs } = await import("../../src/parse.js");
    const { maybeLaunchNotebook } = await import("../../src/commands/notebook-pair-shared.js");

    const args = parseCliArgs(["techtree", "bbh", "notebook", "pair", "workspace"]);
    await maybeLaunchNotebook(args, {
      workspace_path: "/tmp/workspace",
      launch_argv: ["uvx", "marimo", "edit", "notebook with space.py"],
    });

    expect(spawnMock).toHaveBeenCalledWith(
      "uvx",
      ["marimo", "edit", "notebook with space.py"],
      expect.objectContaining({
        cwd: "/tmp/workspace",
        stdio: "inherit",
      }),
    );
    expect(child.on).toHaveBeenCalledWith("error", expect.any(Function));
    expect(child.on).toHaveBeenCalledWith("close", expect.any(Function));
  });

  it("stays quiet when --no-open is set", async () => {
    const { parseCliArgs } = await import("../../src/parse.js");
    const { maybeLaunchNotebook } = await import(
      "../../src/commands/notebook-pair-shared.js"
    );

    const args = parseCliArgs([
      "techtree",
      "bbh",
      "notebook",
      "pair",
      "workspace",
      "--no-open",
    ]);
    await maybeLaunchNotebook(args, {
      workspace_path: "/tmp/workspace",
      launch_argv: ["uvx", "marimo", "edit", "notebook with space.py"],
    });

    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("stays quiet in a non-interactive terminal", async () => {
    isHumanTerminalMock.mockReturnValue(false);

    const { parseCliArgs } = await import("../../src/parse.js");
    const { maybeLaunchNotebook } = await import(
      "../../src/commands/notebook-pair-shared.js"
    );

    const args = parseCliArgs(["techtree", "bbh", "notebook", "pair", "workspace"]);
    await maybeLaunchNotebook(args, {
      workspace_path: "/tmp/workspace",
      launch_argv: ["uvx", "marimo", "edit", "notebook with space.py"],
    });

    expect(spawnMock).not.toHaveBeenCalled();
  });
});
