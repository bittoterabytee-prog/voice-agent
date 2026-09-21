import { getConfig } from "../config";
import { ExternalServiceError } from "../utils/errors";

export type LlmCompletionRequest = {
  prompt: string;
};

export type LlmCompletionResponse = {
  text: string;
};

export class LlmService {
  constructor(
    private readonly apiKey = getConfig().llm.apiKey,
    private readonly provider = getConfig().llm.provider,
    private readonly model = getConfig().llm.model,
  ) {}

  async complete(request: LlmCompletionRequest): Promise<LlmCompletionResponse> {
    if (!this.apiKey || !this.provider) {
      throw new ExternalServiceError("llm", "LLM provider is not configured");
    }

    void request;
    void this.model;
    throw new ExternalServiceError("llm", "LLM provider is unavailable");
  }
}

export const llmService = new LlmService();
