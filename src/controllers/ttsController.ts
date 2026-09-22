import type { Request, Response, NextFunction } from "express";
import { ValidationError } from "../utils/errors";
import { TtsService } from "../voice/ttsService";

type SynthesizeBody = {
  text?: unknown;
  voice?: unknown;
};

export async function synthesizeSpeech(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = (req.body ?? {}) as SynthesizeBody;
    if (typeof body.text !== "string") {
      throw new ValidationError("text is required");
    }
    const voice = typeof body.voice === "string" ? body.voice : undefined;

    const result = await new TtsService().synthesize({ text: body.text, voice });
    const audioBase64 = Buffer.from(result.audio).toString("base64");

    res.status(200).json({
      audioBase64,
      mimeType: result.mimeType,
    });
  } catch (error) {
    next(error);
  }
}
