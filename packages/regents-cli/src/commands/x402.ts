import type { ParsedCliArgs } from "../parse.js";

import type {
  X402FetchParams,
  X402PrepareParams,
  X402QuoteParams,
  X402ReceiptGetParams,
  X402RequestInput,
} from "../internal-types/index.js";
import { RegentKernel } from "../internal-runtime/runtime.js";
import { getBooleanFlag, getFlag, getFlags, requireArg } from "../parse.js";
import { CLI_PALETTE, printJson, printText, renderKeyValuePanel } from "../printer.js";
import { CliUsageError } from "../cli-usage-error.js";

const parseHeaders = (args: ParsedCliArgs): Record<string, string> | undefined => {
  const headers = getFlags(args, "header");
  if (headers.length === 0) {
    return undefined;
  }

  return Object.fromEntries(
    headers.map((header) => {
      const separatorIndex = header.indexOf(":");
      if (separatorIndex <= 0) {
        throw new CliUsageError({
          code: "invalid_header",
          message: "--header must use Name: value form.",
          example: "regents x402 quote --url https://api.example.com/paid --header 'accept: application/json'",
        });
      }

      return [header.slice(0, separatorIndex).trim(), header.slice(separatorIndex + 1).trim()];
    }),
  );
};

const requestInput = (args: ParsedCliArgs): X402RequestInput => ({
  url: requireArg(getFlag(args, "url"), "--url"),
  method: getFlag(args, "method")?.toUpperCase() as X402RequestInput["method"],
  headers: parseHeaders(args),
  body: getFlag(args, "body"),
});

const quoteInput = (args: ParsedCliArgs): X402QuoteParams => ({
  ...requestInput(args),
  max_amount: getFlag(args, "max-amount"),
});

const prepareInput = (args: ParsedCliArgs): X402PrepareParams => ({
  ...quoteInput(args),
  approve: getBooleanFlag(args, "approve"),
});

const fetchInput = (args: ParsedCliArgs): X402FetchParams => ({
  ...requestInput(args),
  intent_id: requireArg(getFlag(args, "intent-id"), "--intent-id"),
});

const receiptGetInput = (args: ParsedCliArgs): X402ReceiptGetParams => ({
  id: requireArg(getFlag(args, "id"), "--id"),
});

const withKernel = async <T>(
  configPath: string | undefined,
  run: (kernel: RegentKernel) => Promise<T>,
): Promise<T> => {
  const kernel = new RegentKernel(configPath);
  try {
    return await run(kernel);
  } finally {
    await kernel.stop();
  }
};

export async function runX402Details(args: ParsedCliArgs, configPath?: string): Promise<number> {
  const result = await withKernel(configPath, (kernel) => kernel.call("x402.details", requestInput(args)));
  if (getBooleanFlag(args, "json")) {
    printJson(result);
    return 0;
  }

  printText(
    renderKeyValuePanel("◆ X402 DETAILS", [
      { label: "payment", value: result.payment_required ? "required" : "not required" },
      { label: "status", value: String(result.status) },
      { label: "request", value: result.request.request_hash },
    ]),
  );
  return 0;
}

export async function runX402Quote(args: ParsedCliArgs, configPath?: string): Promise<number> {
  const result = await withKernel(configPath, (kernel) => kernel.call("x402.quote", quoteInput(args)));
  if (getBooleanFlag(args, "json")) {
    printJson(result);
    return 0;
  }

  printText(
    renderKeyValuePanel("◆ X402 QUOTE", [
      { label: "amount", value: result.selected.amount, valueColor: CLI_PALETTE.emphasis },
      { label: "network", value: result.selected.network },
      { label: "asset", value: result.selected.asset },
      { label: "pay to", value: result.selected.pay_to },
    ]),
  );
  return 0;
}

export async function runX402Prepare(args: ParsedCliArgs, configPath?: string): Promise<number> {
  const result = await withKernel(configPath, (kernel) => kernel.call("x402.prepare", prepareInput(args)));
  if (getBooleanFlag(args, "json")) {
    printJson(result);
    return 0;
  }

  printText(
    renderKeyValuePanel("◆ X402 PREPARED", [
      { label: "intent", value: result.intent.intent_id, valueColor: CLI_PALETTE.emphasis },
      { label: "approval", value: result.intent.approval_status },
      { label: "amount", value: result.intent.selected.amount },
      { label: "next", value: result.next_action.command },
    ]),
  );
  return 0;
}

export async function runX402Fetch(args: ParsedCliArgs, configPath?: string): Promise<number> {
  const result = await withKernel(configPath, (kernel) => kernel.call("x402.fetch", fetchInput(args)));
  if (getBooleanFlag(args, "json")) {
    printJson(result);
    return result.ok ? 0 : 1;
  }

  printText(result.body_text);
  return result.ok ? 0 : 1;
}

export async function runX402ReceiptsGet(args: ParsedCliArgs, configPath?: string): Promise<number> {
  const result = await withKernel(configPath, (kernel) => kernel.call("x402.receipts.get", receiptGetInput(args)));
  if (getBooleanFlag(args, "json")) {
    printJson(result);
    return 0;
  }

  if (!result.receipt) {
    printText("No x402 receipt found.");
    return 1;
  }

  printText(
    renderKeyValuePanel("◆ X402 RECEIPT", [
      { label: "receipt", value: result.receipt.receipt_id, valueColor: CLI_PALETTE.emphasis },
      { label: "intent", value: result.receipt.intent_id },
      { label: "status", value: String(result.receipt.status) },
      { label: "paid", value: result.receipt.ok ? "yes" : "no" },
    ]),
  );
  return result.receipt.ok ? 0 : 1;
}
