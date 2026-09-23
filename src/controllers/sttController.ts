import type { Request, Response, NextFunction } from "express";
import { ValidationError } from "../utils/errors";
import { SttService } from "../voice/sttService";

type TranscribeBody = {
  audioBase64?: unknown;
  mimeType?: unknown;
  fileName?: unknown;
  languageHint?: unknown;
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

export async function transcribeAudio(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = (req.body ?? {}) as TranscribeBody;
    const audio = decodeAudioBase64(body.audioBase64);
    const mimeType = typeof body.mimeType === "string" ? body.mimeType : undefined;
    const fileName = typeof body.fileName === "string" ? body.fileName : undefined;
    const languageHint = typeof body.languageHint === "string" ? body.languageHint : undefined;

    const result = await new SttService().transcribe({
      audio,
      mimeType,
      fileName,
      languageHint,
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}
