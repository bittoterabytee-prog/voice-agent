import type { Request, Response, NextFunction } from "express";
import type { LlmMessage } from "../ai/llmService";
import { ValidationError } from "../utils/errors";
import { VoicePipelineService } from "../voice/voicePipelineService";

type VoiceTurnBody = {
  audioBase64?: unknown;
  mimeType?: unknown;
  fileName?: unknown;
  conversationId?: unknown;
  callId?: unknown;
  messages?: unknown;
  voice?: unknown;
  sessionId?: unknown;
};

function decodeAudioBase64(value: unknown): Uint8Array {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ValidationError("audioBase64 is required");
  }

  const trimmed = value.trim();
  const base64 = trimmed.includes(",") ? trimmed.slice(trimmed.indexOf(",") + 1) : trimmed;

  try {
    const buffer = Buffer.from(base64, "base64");
    if (buffer.byteLength === 0) {
      throw new ValidationError("Audio payload is empty or invalid");
    }
    return new Uint8Array(buffer);
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new ValidationError("audioBase64 is not valid base64");
  }
}

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

export async function runVoiceTurn(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = (req.body ?? {}) as VoiceTurnBody;
    const audio = decodeAudioBase64(body.audioBase64);
    const mimeType = typeof body.mimeType === "string" ? body.mimeType : undefined;
    const fileName = typeof body.fileName === "string" ? body.fileName : undefined;
    const conversationId =
      typeof body.conversationId === "string" ? body.conversationId : undefined;
    const callId = typeof body.callId === "string" ? body.callId : undefined;
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : undefined;
    const voice = typeof body.voice === "string" ? body.voice : undefined;
    const messages = parseMessages(body.messages);

    const result = await new VoicePipelineService().runTurn({
      audio,
      mimeType,
      fileName,
      conversationId,
      callId,
      sessionId,
      voice,
      messages,
      requestId: typeof req.id === "string" ? req.id : String(req.id ?? ""),
    });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}
