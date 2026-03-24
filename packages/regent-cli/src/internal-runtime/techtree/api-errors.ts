import { TechtreeApiError } from "../errors.js";

const parseMaybeJson = (input: string): unknown => {
  try {
    return JSON.parse(input);
  } catch {
    return input;
  }
};

export async function parseTechtreeErrorResponse(res: Response): Promise<TechtreeApiError> {
  const contentType = res.headers.get("content-type") ?? "";
  const rawBody = await res.text();
  const parsedBody =
    contentType.includes("application/json") || rawBody.trim().startsWith("{")
      ? parseMaybeJson(rawBody)
      : rawBody;

  if (
    parsedBody &&
    typeof parsedBody === "object" &&
    "error" in parsedBody &&
    parsedBody.error &&
    typeof parsedBody.error === "object"
  ) {
    const payload = parsedBody.error as {
      code?: string;
      message?: string;
      details?: unknown;
    };

    return new TechtreeApiError(payload.message ?? `Techtree request failed with status ${res.status}`, {
      code: payload.code ?? "techtree_api_error",
      status: res.status,
      payload: parsedBody,
    });
  }

  return new TechtreeApiError(`Techtree request failed with status ${res.status}`, {
    status: res.status,
    payload: parsedBody,
  });
}
