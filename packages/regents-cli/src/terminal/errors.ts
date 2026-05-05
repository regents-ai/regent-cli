import { CliUsageError } from "../cli-usage-error.js";
import { RegentError } from "../internal-runtime/index.js";

import { renderPanel } from "./panel.js";
import { CLI_PALETTE, escapeTerminalText, isHumanTerminal, tone } from "./palette.js";

const renderErrorPanel = (message: string, code?: string, details: readonly string[] = []): string =>
  renderPanel(
    "◆ REGENT ERROR",
    [
      ...(code
        ? [`${tone("code", CLI_PALETTE.secondary)} ${tone(escapeTerminalText(code), CLI_PALETTE.error, true)}`]
        : []),
      `${tone("message", CLI_PALETTE.secondary)} ${tone(escapeTerminalText(message), CLI_PALETTE.primary, true)}`,
      ...details,
      `${tone("next", CLI_PALETTE.secondary)} ${tone("regents --help", CLI_PALETTE.emphasis, true)}`,
    ],
    { borderColor: CLI_PALETTE.error, titleColor: CLI_PALETTE.title },
  );

const errorPayload = (
  message: string,
  code?: string,
  details?: Record<string, unknown>,
): Record<string, Record<string, unknown>> => ({
  error: {
    ...(code ? { code } : {}),
    message,
    ...(details ?? {}),
  },
});

export function printError(error: unknown): void {
  if (error instanceof CliUsageError) {
    const details = [
      error.command ? `${tone("command", CLI_PALETTE.secondary)} ${tone(error.command, CLI_PALETTE.primary, true)}` : undefined,
      error.usage ? `${tone("usage", CLI_PALETTE.secondary)} ${tone(error.usage, CLI_PALETTE.primary, true)}` : undefined,
      error.missing.length > 0 ? `${tone("missing", CLI_PALETTE.secondary)} ${tone(error.missing.join(", "), CLI_PALETTE.primary, true)}` : undefined,
      error.validValues.length > 0
        ? `${tone("valid", CLI_PALETTE.secondary)} ${tone(error.validValues.join(", "), CLI_PALETTE.primary, true)}`
        : undefined,
      error.example ? `${tone("example", CLI_PALETTE.secondary)} ${tone(error.example, CLI_PALETTE.primary, true)}` : undefined,
    ].filter((line): line is string => Boolean(line));
    const payloadDetails = {
      ...(error.command ? { command: error.command } : {}),
      ...(error.usage ? { usage: error.usage } : {}),
      ...(error.missing.length > 0 ? { missing: error.missing } : {}),
      ...(error.validValues.length > 0 ? { valid_values: error.validValues } : {}),
      ...(error.example ? { example: error.example } : {}),
    };

    if (isHumanTerminal()) {
      process.stderr.write(`${renderErrorPanel(error.message, error.code, details)}\n`);
      return;
    }

    process.stderr.write(`${JSON.stringify(errorPayload(error.message, error.code, payloadDetails), null, 2)}\n`);
    return;
  }

  if (error instanceof RegentError) {
    if (isHumanTerminal()) {
      process.stderr.write(`${renderErrorPanel(error.message, error.code)}\n`);
      return;
    }

    process.stderr.write(`${JSON.stringify(errorPayload(error.message, error.code), null, 2)}\n`);
    return;
  }

  if (error instanceof Error) {
    if (isHumanTerminal()) {
      process.stderr.write(`${renderErrorPanel(error.message)}\n`);
      return;
    }

    process.stderr.write(`${JSON.stringify(errorPayload(error.message), null, 2)}\n`);
    return;
  }

  const fallbackMessage = String(error);
  if (isHumanTerminal()) {
    process.stderr.write(`${renderErrorPanel(fallbackMessage)}\n`);
    return;
  }

  process.stderr.write(`${JSON.stringify(errorPayload(fallbackMessage), null, 2)}\n`);
}
