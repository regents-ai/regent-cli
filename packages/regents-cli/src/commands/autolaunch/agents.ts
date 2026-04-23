import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { paths as AutolaunchPaths } from "../../generated/autolaunch-openapi.js";
import type { ParsedCliArgs } from "../../parse.js";
import { getBooleanFlag, getFlag, requireArg } from "../../parse.js";
import { printJson } from "../../printer.js";
import type { JsonSuccessResponseFor } from "../../contracts/openapi-helpers.js";
import { appendQuery, baseUrl, requestTypedJson } from "./shared.js";

const execFileAsync = promisify(execFile);

type AutolaunchAgentsListResponse = JsonSuccessResponseFor<
  AutolaunchPaths,
  "/v1/agent/agents",
  "get"
>;
type AutolaunchAgentResponse = JsonSuccessResponseFor<
  AutolaunchPaths,
  "/v1/agent/agents/{id}",
  "get"
>;
type AutolaunchAgentReadinessResponse = JsonSuccessResponseFor<
  AutolaunchPaths,
  "/v1/agent/agents/{id}/readiness",
  "get"
>;
type XLinkStartBody = {
  agent_id: string;
};
type XLinkStartResponse = {
  ok: true;
  provider: string;
  trust_provider: string;
  agent_id: string;
  redirect_path: string;
  [key: string]: unknown;
};

const openBrowser = async (url: string): Promise<boolean> => {
  try {
    if (process.platform === "darwin") {
      await execFileAsync("open", [url]);
      return true;
    }

    if (process.platform === "win32") {
      await execFileAsync("cmd", ["/c", "start", "", url]);
      return true;
    }

    await execFileAsync("xdg-open", [url]);
    return true;
  } catch {
    return false;
  }
};

export async function runAutolaunchAgentsList(
  args: ParsedCliArgs,
): Promise<void> {
  printJson(
    await requestTypedJson<AutolaunchAgentsListResponse>(
      "GET",
      appendQuery("/v1/agent/agents", {
        launchable: getBooleanFlag(args, "launchable"),
      }),
    ),
  );
}

export async function runAutolaunchAgentShow(agentId: string): Promise<void> {
  printJson(
    await requestTypedJson<AutolaunchAgentResponse>(
      "GET",
      `/v1/agent/agents/${encodeURIComponent(agentId)}`,
    ),
  );
}

export async function runAutolaunchAgentReadiness(
  agentId: string,
): Promise<void> {
  printJson(
    await requestTypedJson<AutolaunchAgentReadinessResponse>(
      "GET",
      `/v1/agent/agents/${encodeURIComponent(agentId)}/readiness`,
    ),
  );
}

export async function runAutolaunchTrustXLink(
  args: ParsedCliArgs,
  configPath?: string,
): Promise<void> {
  const body: XLinkStartBody = {
    agent_id: requireArg(getFlag(args, "agent"), "agent"),
  };
  const response = await requestTypedJson<XLinkStartResponse>(
    "POST",
    "/v1/agent/trust/x/start",
    {
      body,
      requireAgentAuth: true,
      configPath,
    },
  );
  const redirectUrl = new URL(
    response.redirect_path,
    `${baseUrl()}/`,
  ).toString();
  const browserOpened = await openBrowser(redirectUrl);

  printJson({
    ...response,
    redirect_url: redirectUrl,
    browser_opened: browserOpened,
    ...(browserOpened
      ? {}
      : {
          fallback: "browser_open_failed",
          manual_open_url: redirectUrl,
          message: `Open this URL manually: ${redirectUrl}`,
        }),
  });
}
