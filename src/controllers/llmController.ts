import type { Request, Response, NextFunction } from "express";
import { LlmService, type LlmMessage } from "../ai/llmService";
import { ValidationError } from "../utils/errors";

type CompleteBody = {
  prompt?: unknown;
  messages?: unknown;
  includeSystemPrompt?: unknown;
  enableTools?: unknown;
  language?: unknown;
};

function parseMessages(value: unknown): LlmMessage[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new ValidationError("messages must be an array");
  }

  return value.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new ValidationError(`messages[${index}] must be an object`);
    }
    const role = (item as { role?: unknown }).role;
    const content = (item as { content?: unknown }).content;
    if (role !== "system" && role !== "user" && role !== "assistant") {
      throw new ValidationError(`messages[${index}].role must be system, user, or assistant`);
    }
    if (typeof content !== "string") {
      throw new ValidationError(`messages[${index}].content must be a string`);
    }
    return { role, content };
  });
}

export async function completeLlmTurn(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = (req.body ?? {}) as CompleteBody;
    const prompt = typeof body.prompt === "string" ? body.prompt : undefined;
    const messages = parseMessages(body.messages);
    const includeSystemPrompt =
      typeof body.includeSystemPrompt === "boolean" ? body.includeSystemPrompt : undefined;
    const enableTools = typeof body.enableTools === "boolean" ? body.enableTools : undefined;
    if (body.language !== undefined && typeof body.language !== "string") {
      throw new ValidationError("language must be a string");
    }
    const language = typeof body.language === "string" ? body.language : undefined;

    if (!prompt?.trim() && (!messages || messages.length === 0)) {
      throw new ValidationError("prompt or messages is required");
    }

    const result = await new LlmService().complete({
      prompt,
      messages,
      includeSystemPrompt,
      enableTools,
      language,
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}
