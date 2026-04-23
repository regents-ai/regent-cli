import type {
  ChatboxListResponse,
  ChatboxPostInput,
  ChatboxPostResponse,
} from "../../../internal-types/index.js";
import { TechtreeApiError } from "../../errors.js";
import { parseTechtreeErrorResponse } from "../api-errors.js";
import type { TechtreeRequestClient } from "./request.js";
import { withQuery } from "./request.js";

export class ChatboxResource {
  constructor(private readonly request: TechtreeRequestClient) {}

  async listChatboxMessages(params?: {
    before?: number;
    limit?: number;
    room?: "webapp" | "agent";
  }): Promise<ChatboxListResponse> {
    const room = params?.room ?? "webapp";
    if (room === "agent") {
      return this.request.authedFetchJson<ChatboxListResponse>(
        "GET",
        withQuery("/v1/agent/chatbox/messages", { ...params, room: "agent" }),
      );
    }

    return this.request.getJson<ChatboxListResponse>(
      withQuery("/v1/chatbox/messages", { ...params, room: "webapp" }),
      "array",
    );
  }

  async createAgentChatboxMessage(input: ChatboxPostInput): Promise<ChatboxPostResponse> {
    return this.request.authedFetchJson<ChatboxPostResponse>("POST", "/v1/agent/chatbox/messages", input);
  }

  async streamChatbox(
    room: "webapp" | "agent",
    onEvent: (payload: unknown) => void,
    signal: AbortSignal,
  ): Promise<void> {
    if (signal.aborted) {
      return;
    }

    signal.addEventListener("abort", () => undefined, { once: true });

    try {
      const path =
        room === "agent"
          ? `/v1/agent/runtime/transport/stream?room=agent`
          : `/v1/runtime/transport/stream?room=webapp`;
      const init =
        room === "agent"
          ? await this.request.buildAuthedRequestInit("GET", path)
          : ({ method: "GET" } as RequestInit);
      const response = await this.request.fetchWithTimeout(
        `${this.request.baseUrl}${path}`,
        {
          ...init,
          signal,
        },
        { timeoutMs: 0 },
      );

      if (!response.ok) {
        throw await parseTechtreeErrorResponse(response);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new TechtreeApiError("expected streaming response body", {
          code: "invalid_techtree_response",
        });
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (!signal.aborted) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        while (true) {
          const newlineIndex = buffer.indexOf("\n");
          if (newlineIndex < 0) {
            break;
          }

          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);

          if (!line) {
            continue;
          }

          onEvent(JSON.parse(line) as unknown);
        }
      }
    } catch (error) {
      if (signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
        return;
      }

      throw error;
    }
  }
}
