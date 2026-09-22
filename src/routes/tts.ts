import { Router } from "express";
import { synthesizeSpeech } from "../controllers/ttsController";

export const ttsRouter = Router();

ttsRouter.post("/api/tts/synthesize", synthesizeSpeech);
