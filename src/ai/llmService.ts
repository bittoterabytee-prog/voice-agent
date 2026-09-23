import { getConfig } from "../config";
import { ExternalServiceError, ValidationError } from "../utils/errors";
import { APPOINTMENT_TOOL_DEFINITIONS } from "./llmTools";
import { buildSystemMessage } from "./prompts";

export type LlmMessageRole = "system" | "user" | "assistant";

export type LlmMessage = {
  role: LlmMessageRole;
  content: string;
};

export type LlmToolCall = {
  id?: string;
  name: string;
  arguments: Record<string, unknown>;
};

export type LlmCompletionRequest = {
  /** Single-turn convenience; appended as a user message when set. */
  prompt?: string;
  /** Prior turns and/or the current user message. */
  messages?: LlmMessage[];
  /** Prepend clinic system prompt (default true). */
  includeSystemPrompt?: boolean;
  /** Attach appointment tool definitions for model tool-calling (default false). */
  enableTools?: boolean;
};

export type LlmTokenUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export type LlmCompletionResponse = {
  text: string;
  toolCalls?: LlmToolCall[];
  usage?: LlmTokenUsage;
};

export type LlmFetch = typeof fetch;

export type LlmServiceOptions = {
  /** When the property is present, it overrides config (even if undefined). */
  apiKey?: string;
  provider?: string;
  model?: string;
  fetchImpl?: LlmFetch;
};

const OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";

type OpenAiChatMessage = {
  role: string;
  content?: string | null;
  tool_calls?: Array<{
    id?: string;
    type?: string;
    function?: { name?: string; arguments?: string };
  }>;
};

type OpenAiChatResponse = {
  choices?: Array<{
    message?: OpenAiChatMessage;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

function parseToolArguments(raw: string | undefined): Record<string, unknown> {
  if (!raw || raw.trim() === "") {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

/**
 * LLM conversation adapter (KAN-12).
 * Uses getConfig().llm only — fail-closed, no invented appointment data.
 */
export class LlmService {
  private readonly apiKey?: string;
  private readonly provider?: string;
  private readonly model?: string;
  private readonly fetchImpl: LlmFetch;

  constructor(options: LlmServiceOptions = {}) {
    const config = getConfig();
    this.apiKey = "apiKey" in options ? options.apiKey : config.llm.apiKey;
    this.provider = "provider" in options ? options.provider : config.llm.provider;
    this.model = "model" in options ? options.model : config.llm.model;
    this.fetchImpl = options.fetchImpl ?? ((input, init) => globalThis.fetch(input, init));
  }

  async complete(request: LlmCompletionRequest): Promise<LlmCompletionResponse> {
    if (!this.apiKey || !this.provider) {
      throw new ExternalServiceError("llm", "LLM provider is not configured");
    }

    const messages = this.buildMessages(request);
    const model = this.model?.trim() || "gpt-4o-mini";

    if (this.provider.toLowerCase() !== "openai") {
      throw new ExternalServiceError("llm", `LLM provider "${this.provider}" is not supported`);
    }

    return this.completeOpenAi(messages, model, Boolean(request.enableTools));
  }

  buildMessages(request: LlmCompletionRequest): LlmMessage[] {
    const messages: LlmMessage[] = [];

    if (request.includeSystemPrompt !== false) {
      messages.push(buildSystemMessage());
    }

    if (request.messages?.length) {
      for (const message of request.messages) {
        const content = message.content?.trim() ?? "";
        if (!content) {
          continue;
        }
        if (message.role !== "system" && message.role !== "user" && message.role !== "assistant") {
          throw new ValidationError("messages[].role must be system, user, or assistant");
        }
        messages.push({ role: message.role, content });
      }
    }

    const prompt = request.prompt?.trim();
    if (prompt) {
      messages.push({ role: "user", content: prompt });
    }

    const hasUserOrAssistant = messages.some((m) => m.role === "user" || m.role === "assistant");
    if (!hasUserOrAssistant) {
      throw new ValidationError("prompt or messages with user/assistant content is required");
    }

    return messages;
  }

  private async completeOpenAi(
    messages: LlmMessage[],
    model: string,
    enableTools: boolean,
  ): Promise<LlmCompletionResponse> {
    const body: Record<string, unknown> = {
      model,
      messages,
    };
    if (enableTools) {
      body.tools = APPOINTMENT_TOOL_DEFINITIONS;
    }

    let response: Response;
    try {
      response = await this.fetchImpl(OPENAI_CHAT_COMPLETIONS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
    } catch {
      throw new ExternalServiceError("llm", "LLM provider is unavailable");
    }

    if (!response.ok) {
      throw new ExternalServiceError("llm", `LLM provider failed with status ${response.status}`);
    }

    let payload: OpenAiChatResponse;
    try {
      payload = (await response.json()) as OpenAiChatResponse;
    } catch {
      throw new ExternalServiceError("llm", "LLM provider returned an invalid response");
    }

    const message = payload.choices?.[0]?.message;
    if (!message) {
      throw new ExternalServiceError("llm", "LLM provider returned an empty completion");
    }

    const toolCalls: LlmToolCall[] = [];
    for (const call of message.tool_calls ?? []) {
      const name = call.function?.name?.trim();
      if (!name) {
        continue;
      }
      toolCalls.push({
        ...(call.id ? { id: call.id } : {}),
        name,
        arguments: parseToolArguments(call.function?.arguments),
      });
    }

    const text = typeof message.content === "string" ? message.content.trim() : "";
    if (!text && toolCalls.length === 0) {
      throw new ExternalServiceError("llm", "LLM provider returned an empty completion");
    }

    const promptTokens = Number(payload.usage?.prompt_tokens ?? 0);
    const completionTokens = Number(payload.usage?.completion_tokens ?? 0);
    const totalTokens = Number(payload.usage?.total_tokens ?? promptTokens + completionTokens);
    const usage: LlmTokenUsage | undefined =
      promptTokens > 0 || completionTokens > 0
        ? {
            promptTokens,
            completionTokens,
            totalTokens: Number.isFinite(totalTokens) ? totalTokens : promptTokens + completionTokens,
          }
        : undefined;

    return {
      text,
      ...(toolCalls.length > 0 ? { toolCalls } : {}),
      ...(usage ? { usage } : {}),
    };
  }
}

export const llmService = new LlmService();
