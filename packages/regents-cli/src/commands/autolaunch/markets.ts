import type { paths as AutolaunchPaths } from "../../generated/autolaunch-openapi.js";
import {
  getBooleanFlag,
  getFlag,
  requireArg,
  type ParsedCliArgs,
} from "../../parse.js";
import { printJson } from "../../printer.js";
import type { JsonSuccessResponseFor } from "../../contracts/openapi-helpers.js";
import {
  appendQuery,
  extractPreparedTxRequest,
  requestJson,
  requestTypedJson,
  requirePositional,
  submitPreparedTxRequest,
} from "./shared.js";

type AutolaunchAuctionsListResponse = JsonSuccessResponseFor<
  AutolaunchPaths,
  "/v1/agent/auctions",
  "get"
>;
type AutolaunchAuctionResponse = JsonSuccessResponseFor<
  AutolaunchPaths,
  "/v1/agent/auctions/{id}",
  "get"
>;

const postBidMutation = async (
  action: "exit" | "claim",
  bidId: string,
  txHash: string,
): Promise<void> => {
  printJson(
    await requestJson(
      "POST",
      `/v1/agent/bids/${encodeURIComponent(bidId)}/${action}`,
      {
        body: { tx_hash: txHash },
        requireAgentAuth: true,
      },
    ),
  );
};

const loadTrackedPositions = async (
  args: ParsedCliArgs,
  configPath?: string,
) =>
  requestJson(
    "GET",
    appendQuery("/v1/agent/me/bids", {
      auction: getFlag(args, "auction"),
      status: getFlag(args, "status"),
    }),
    { requireAgentAuth: true, configPath },
  );

const requireTrackedPosition = async (
  bidId: string,
  args: ParsedCliArgs,
  configPath?: string,
): Promise<Record<string, unknown>> => {
  const payload = await loadTrackedPositions(args, configPath);
  const items = Array.isArray(payload.items) ? payload.items : [];
  const position = items.find(
    (item) =>
      typeof item === "object" &&
      item &&
      (item as Record<string, unknown>).bid_id === bidId,
  );
  if (!position || typeof position !== "object") {
    throw new Error(`tracked bid not found: ${bidId}`);
  }

  return position as Record<string, unknown>;
};

const prepareOrSubmitPositionAction = async (
  bidId: string,
  kind: "return-usdc" | "exit" | "claim",
  args: ParsedCliArgs,
  configPath?: string,
): Promise<void> => {
  const position = await requireTrackedPosition(bidId, args, configPath);

  const prepared =
    kind === "return-usdc"
      ? (position.return_action as Record<string, unknown> | undefined)
      : ((position.tx_actions as Record<string, unknown> | undefined)?.[
          kind === "claim" ? "claim" : "exit"
        ] as Record<string, unknown> | undefined);

  if (!prepared) {
    printJson({
      ok: false,
      error: `no ${kind} action is currently available`,
      bid_id: bidId,
      position,
    });
    return;
  }

  if (!getBooleanFlag(args, "submit")) {
    printJson({ ok: true, bid_id: bidId, action: kind, prepared });
    return;
  }

  const txRequest = extractPreparedTxRequest(prepared.tx_request);
  if (!txRequest) {
    printJson({
      ok: false,
      error: "prepared action did not include tx_request",
      bid_id: bidId,
    });
    return;
  }

  const txHash = await submitPreparedTxRequest(txRequest, configPath);
  const endpoint =
    kind === "return-usdc"
      ? `/v1/agent/bids/${encodeURIComponent(bidId)}/return-usdc`
      : `/v1/agent/bids/${encodeURIComponent(bidId)}/${kind}`;

  printJson(
    await requestJson("POST", endpoint, {
      body: { tx_hash: txHash },
      requireAgentAuth: true,
      configPath,
    }),
  );
};

export async function runAutolaunchAuctionsList(
  args: ParsedCliArgs,
): Promise<void> {
  printJson(
    await requestTypedJson<AutolaunchAuctionsListResponse>(
      "GET",
      appendQuery("/v1/agent/auctions", {
        sort: getFlag(args, "sort") ?? "hottest",
        status: getFlag(args, "status"),
        chain: getFlag(args, "chain"),
        mine_only: getBooleanFlag(args, "mine-only"),
      }),
    ),
  );
}

export async function runAutolaunchAuctionShow(
  auctionId: string,
): Promise<void> {
  printJson(
    await requestTypedJson<AutolaunchAuctionResponse>(
      "GET",
      `/v1/agent/auctions/${encodeURIComponent(auctionId)}`,
    ),
  );
}

export async function runAutolaunchBidsQuote(
  args: ParsedCliArgs,
): Promise<void> {
  const auctionId = requireArg(getFlag(args, "auction"), "auction");
  const body = {
    amount: requireArg(getFlag(args, "amount"), "amount"),
    max_price: requireArg(getFlag(args, "max-price"), "max-price"),
  };

  printJson(
    await requestJson(
      "POST",
      `/v1/agent/auctions/${encodeURIComponent(auctionId)}/bid_quote`,
      {
        body,
      },
    ),
  );
}

export async function runAutolaunchBidsPlace(
  args: ParsedCliArgs,
): Promise<void> {
  const auctionId = requireArg(getFlag(args, "auction"), "auction");
  const body = {
    amount: requireArg(getFlag(args, "amount"), "amount"),
    max_price: requireArg(getFlag(args, "max-price"), "max-price"),
    tx_hash: requireArg(getFlag(args, "tx-hash"), "tx-hash"),
    current_clearing_price: getFlag(args, "current-clearing-price"),
    projected_clearing_price: getFlag(args, "projected-clearing-price"),
    estimated_tokens_if_end_now: getFlag(args, "estimated-tokens-if-end-now"),
    estimated_tokens_if_no_other_bids_change: getFlag(
      args,
      "estimated-tokens-if-no-other-bids-change",
    ),
    inactive_above_price: getFlag(args, "inactive-above-price"),
    status_band: getFlag(args, "status-band"),
  };

  printJson(
    await requestJson(
      "POST",
      `/v1/agent/auctions/${encodeURIComponent(auctionId)}/bids`,
      {
        body,
        requireAgentAuth: true,
      },
    ),
  );
}

export async function runAutolaunchBidsMine(
  args: ParsedCliArgs,
  configPath?: string,
): Promise<void> {
  printJson(
    await requestJson(
      "GET",
      appendQuery("/v1/agent/me/bids", {
        auction: getFlag(args, "auction"),
        status: getFlag(args, "status"),
      }),
      { requireAgentAuth: true, configPath },
    ),
  );
}

export async function runAutolaunchBidsExit(
  args: ParsedCliArgs,
): Promise<void> {
  const bidId = requirePositional(args, 3, "bid-id");
  await postBidMutation(
    "exit",
    bidId,
    requireArg(getFlag(args, "tx-hash"), "tx-hash"),
  );
}

export async function runAutolaunchBidsClaim(
  args: ParsedCliArgs,
): Promise<void> {
  const bidId = requirePositional(args, 3, "bid-id");
  await postBidMutation(
    "claim",
    bidId,
    requireArg(getFlag(args, "tx-hash"), "tx-hash"),
  );
}

export async function runAutolaunchAuctionReturnsList(
  args: ParsedCliArgs,
  configPath?: string,
): Promise<void> {
  printJson(
    await requestJson(
      "GET",
      appendQuery("/v1/agent/auction-returns", {
        limit: getFlag(args, "limit"),
        offset: getFlag(args, "offset"),
      }),
      { requireAgentAuth: true, configPath },
    ),
  );
}

export async function runAutolaunchPositionsList(
  args: ParsedCliArgs,
  configPath?: string,
): Promise<void> {
  printJson(await loadTrackedPositions(args, configPath));
}

export async function runAutolaunchPositionsReturnUsdc(
  args: ParsedCliArgs,
  configPath?: string,
): Promise<void> {
  await prepareOrSubmitPositionAction(
    requirePositional(args, 3, "bid-id"),
    "return-usdc",
    args,
    configPath,
  );
}

export async function runAutolaunchPositionsExit(
  args: ParsedCliArgs,
  configPath?: string,
): Promise<void> {
  await prepareOrSubmitPositionAction(
    requirePositional(args, 3, "bid-id"),
    "exit",
    args,
    configPath,
  );
}

export async function runAutolaunchPositionsClaim(
  args: ParsedCliArgs,
  configPath?: string,
): Promise<void> {
  await prepareOrSubmitPositionAction(
    requirePositional(args, 3, "bid-id"),
    "claim",
    args,
    configPath,
  );
}
