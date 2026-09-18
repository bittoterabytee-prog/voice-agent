import { ExternalServiceError } from "../utils/errors";

export type LlmCompletionRequest = {
  prompt: string;
};

export type LlmCompletionResponse = {
  text: string;
};

export class LlmService {
  constructor(
    private readonly apiKey?: string,
    private readonly baseUrl?: string,
  ) {}

  async complete(request: LlmCompletionRequest): Promise<LlmCompletionResponse> {
    if (!this.apiKey || !this.baseUrl) {
      throw new ExternalServiceError("llm", "LLM provider is not configured");
    }

    void request;
    throw new ExternalServiceError("llm", "LLM provider is unavailable");
  }
}
